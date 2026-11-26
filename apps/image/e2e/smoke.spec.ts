import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { preferencesKey } from "@editor-apps/app-shell/preferences-key";
import {
  analyticsOriginUnderTest,
  expect,
  expectAnalytics,
  expectEditorFillsTheScreen,
  expectPolicyOrigins,
  expectSdkAssets,
  expectSecurityHeaders,
  expectShellLook,
  expectThemeBeforeFirstPaint,
  expectThirdPartyLicenses,
  leavingAsks,
  test,
} from "@editor-apps/build-config/playwright";
import { appConfig } from "../src/app.config.ts";
import { gradientPng, pngSize } from "./fixture.ts";

// The `problems` fixture fails either test on a console error, a policy
// violation, a failed response or a request to another origin.

// With an analytics key, the app sends a page view and its SDK's events.
// They're answered in the browser and never reach the provider.
const analytics = analyticsOriginUnderTest(appConfig.analyticsHost);
test.use({ analyticsOrigins: [analytics ?? appConfig.analyticsHost] });

test("the page is served with its headers, and has the shell's landmarks", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expectSecurityHeaders(headers);
  expect(headers["content-security-policy"]).toContain("worker-src 'self'");
  // Only the origins the app's configuration allows: PostHog's only with a key.
  expectPolicyOrigins(headers, "script-src", []);
  expectPolicyOrigins(headers, "connect-src", analytics ? [analytics] : []);

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\//);
  await expectThirdPartyLicenses(page, "@hussmartinez/image-sdk");
});

test("an image opens, is edited and downloads as PNG, guarded until then, with the SDK's workers from this origin", async ({
  page,
  problems,
}) => {
  // A query and a fragment, which analytics must never send.
  await page.goto("/?smoke=private#fragment");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose an image" }).first().click();
  await (await chooser).setFiles({
    name: "gradient.png",
    mimeType: "image/png",
    buffer: gradientPng(64, 48),
  });
  // The first render starts the SDK's worker.
  await expect(page.getByRole("img", { name: /^Edited image preview/ })).toBeVisible({
    timeout: 30_000,
  });

  // A first visit is in Easy mode: the app's preferences reach the editor.
  await expect(page.getByRole("radio", { name: "Easy" })).toBeChecked();

  // The leave guard: off for an untouched image, on after an edit, still on
  // once the export is built, and off once Download is pressed.
  expect(await leavingAsks(page)).toBe(false);
  await page
    .getByRole("navigation", { name: "Tools" })
    .getByRole("button", { name: /^Rotate right\b/ })
    .click();
  await expect.poll(() => leavingAsks(page)).toBe(true);

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const save = dialog.getByRole("button", { name: "Download" });
  await expect(save).toBeVisible({ timeout: 30_000 });
  // Built, but not downloaded yet: still guarded (docs/adr/0002).
  expect(await leavingAsks(page)).toBe(true);
  const saving = page.waitForEvent("download");
  await save.click();
  const png = await readFile(await (await saving).path());
  await expect.poll(() => leavingAsks(page)).toBe(false);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  // Turned a quarter, so the sides swap.
  expect(pngSize(png)).toEqual({ width: 48, height: 64 });

  expectSdkAssets(problems, page, "@hussmartinez/image-sdk");
  await expectAnalytics(problems, analytics, appConfig.app);
});

test("both of the SDK's workers are served from the app's own origin, under its version", async ({
  page,
}) => {
  // The render worker runs in the round trip above. The job worker writes
  // GIFs, which this app's test doesn't export, so check that the app
  // serves both, as JavaScript, where the SDK looks for them.
  const { version } = createRequire(import.meta.url)("@hussmartinez/image-sdk/package.json") as {
    version: string;
  };
  for (const worker of ["render.worker.js", "job.worker.js"]) {
    const response = await page.request.get(`/image-sdk/${version}/image/${worker}`);
    expect(response.status(), worker).toBe(200);
    expect(response.headers()["content-type"], worker).toMatch(/javascript/);
  }
});

test("the editor's preferences are kept on the device, and its theme is the page's", async ({
  page,
}) => {
  const key = preferencesKey(appConfig.app);
  const kept = () => page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? "null"), key);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Easy" })).toBeChecked();
  // Nothing is written until the person chooses something.
  expect(await kept()).toBeNull();

  await page.getByRole("radio", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Dark theme" }).click();
  // The shell around the editor follows its theme (docs/adr/0010).
  await expect(page.locator("html")).toHaveAttribute("data-hm-theme", "dark");
  expect(await kept()).toMatchObject({ mode: "advanced", theme: "dark" });

  await page.reload();
  await expect(page.getByRole("radio", { name: "Advanced" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-hm-theme", "dark");
});

test("the page has the theme chosen in the editor before it's painted", async ({ page }) => {
  await expectThemeBeforeFirstPaint(page, preferencesKey(appConfig.app));
});

test("the editor has the screen under the header, on a desktop and a phone", async ({ page }) => {
  await page.goto("/");
  await expectEditorFillsTheScreen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectEditorFillsTheScreen(page);
});

test("the shell looks as committed, in light and dark, and skips to the editor", async ({
  page,
}) => {
  await expectShellLook(page);
});
