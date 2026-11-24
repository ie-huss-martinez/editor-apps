import {
  analyticsOriginUnderTest,
  expect,
  expectAnalytics,
  expectPolicyOrigins,
  expectSdkAssets,
  expectSecurityHeaders,
  expectShellLook,
  expectThirdPartyLicenses,
  leavingAsks,
  test,
} from "@editor-apps/build-config/playwright";
import type { Page } from "@playwright/test";
import { appConfig } from "../src/app.config.ts";
import { blankPdf } from "./fixture.ts";

// The `problems` fixture fails every test on a console error, a policy
// violation, a failed response or a request to another origin.

// With an analytics key, the app sends a page view and its SDK's events.
// They're answered in the browser and never reach the provider.
const analytics = analyticsOriginUnderTest(appConfig.analyticsHost);
test.use({ analyticsOrigins: [analytics ?? appConfig.analyticsHost] });

/**
 * Whether the browser gives the page the origin private file system, where
 * the notes are kept. Playwright's WebKit doesn't in its throwaway profiles;
 * Safari itself does.
 */
function keepsNotes(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    navigator.storage.getDirectory().then(
      () => true,
      () => false,
    ),
  );
}

/** Draws a line across the first page with the mouse, as a pen would. */
async function write(page: Page): Promise<void> {
  const sheet = await page.locator(".hm-notes-page").first().boundingBox();
  if (!sheet) throw new Error("No page to write on.");
  const y = sheet.y + sheet.height * 0.2;
  await page.mouse.move(sheet.x + sheet.width * 0.2, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(sheet.x + sheet.width * (0.2 + step * 0.05), y + (step % 2) * 8);
  }
  await page.mouse.up();
}

test("the page is served with its headers, is installable, and has the shell's landmarks", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expectSecurityHeaders(headers);
  const policy = headers["content-security-policy"] ?? "";
  // pdf-sdk's workers and WebAssembly from this origin, recordings played from memory.
  expect(policy).toContain("worker-src 'self'");
  expect(policy).toContain("'wasm-unsafe-eval'");
  expect(policy).toContain("media-src 'self' blob:");
  // The microphone for this origin only, to record alongside the ink.
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  // Only the origins the app's configuration allows: PostHog's only with a key.
  expectPolicyOrigins(headers, "script-src", []);
  expectPolicyOrigins(headers, "connect-src", analytics ? [analytics] : []);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\//);
  await expectThirdPartyLicenses(page, "@hussmartinez/notes-sdk");

  // Installable: a manifest, with every icon it names served.
  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string }[];
  };
  expect(manifest).toMatchObject({ name: appConfig.title, start_url: "/", display: "standalone" });
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

test("a notebook has the whole screen, keeps what's written, and never asks before leaving", async ({
  page,
  problems,
}) => {
  // A query and a fragment, which analytics must never send.
  await page.goto("/?smoke=private#fragment");
  if (!(await keepsNotes(page))) {
    // The designed state where notes can't be kept: said, never pretended.
    await expect(
      page.getByRole("alert").filter({ hasText: "keep notes on this device" }),
    ).toBeVisible();
    return;
  }
  await expect(page.locator(".app-shell-ad")).toBeVisible();

  await page.getByRole("button", { name: "New notebook" }).click();
  await page
    .getByRole("dialog", { name: "New notebook" })
    .getByRole("button", { name: "Create" })
    .click();
  await expect(page.locator(".hm-notes-page").first()).toBeVisible();

  // The whole screen: the editor from edge to edge, no ad beside the page,
  // and the page's one h1 still there for assistive technology.
  await expect(page.locator(".app-shell-full")).toHaveCount(1);
  await expect(page.locator(".app-shell-ad")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(appConfig.title);
  const viewport = page.viewportSize();
  const main = await page.getByRole("main").boundingBox();
  expect(main).toMatchObject({ x: 0, y: 0, width: viewport?.width, height: viewport?.height });

  await write(page);
  await expect(page.locator(".hm-notes-notebook-save")).toHaveText("Saved");
  // Saved as it's written: leaving loses nothing, so the browser never asks.
  expect(await leavingAsks(page)).toBe(false);

  await page.getByRole("button", { name: "Back to the library" }).click();
  await expect(page.locator(".app-shell-ad")).toBeVisible();
  await expect(page.locator(".app-shell-full")).toHaveCount(0);

  // Kept on the device: there after a reload.
  // One page view per load: this load's, then the reload's alone.
  await expectAnalytics(problems, analytics, appConfig.app);
  problems.analytics.splice(0, problems.analytics.length);
  await page.reload();
  await expect(page.locator(".hm-notes-cover")).toHaveCount(1);
  await expectAnalytics(problems, analytics, appConfig.app);
});

test("a PDF becomes a notebook, drawn with pdf-sdk's assets from this origin", async ({
  page,
  problems,
}) => {
  await page.goto("/");
  test.skip(!(await keepsNotes(page)), "This browser's test profile keeps no notes.");
  await page
    .locator('input[data-hm-input="pdf"]')
    .setInputFiles({ name: "Lecture.pdf", mimeType: "application/pdf", buffer: blankPdf() });
  await expect(page.getByRole("heading", { name: "Lecture" })).toBeVisible();
  // pdf.js starts its worker and draws the page under the ink.
  await expect(page.locator(".hm-notes-page-background").first()).not.toHaveAttribute(
    "data-hm-pending",
    "",
    { timeout: 30_000 },
  );
  expectSdkAssets(problems, page, "@hussmartinez/pdf-sdk");
});

test("opens without a network once it has been visited", async ({
  page,
  context,
  browserName,
  problems,
}) => {
  test.skip(browserName !== "chromium", "Playwright takes Chromium offline with a service worker.");
  await page.goto("/");
  // The service worker has kept the build and serves the page.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 30_000,
    })
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(appConfig.title);
    await expect(page.getByRole("button", { name: "New notebook" })).toBeVisible();
    // The page itself is tried on the network first, which fails offline by
    // design. Nothing else may have.
    const offline = problems.errors.filter((error) =>
      /^failed: \S+\/ net::ERR_INTERNET_DISCONNECTED$/.test(error),
    );
    expect(offline).toHaveLength(1);
    const others = problems.errors.filter((error) => !offline.includes(error));
    problems.errors.splice(0, problems.errors.length, ...others);
  } finally {
    await context.setOffline(false);
  }
});

test("the shell looks as committed, in light and dark, and skips to the editor", async ({
  page,
}) => {
  await expectShellLook(page);
});
