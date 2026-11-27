import { readFile } from "node:fs/promises";
import { preferencesKey } from "@editor-apps/app-shell/preferences-key";
import {
  analyticsOriginUnderTest,
  expect,
  expectAdSlotInTheFrame,
  expectAnalytics,
  expectEditorFillsTheScreen,
  expectLeavePrompt,
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
import { blankPdf } from "./fixture.ts";

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
  await expectThirdPartyLicenses(page, "@hussmartinez/pdf-sdk");
});

test("a PDF opens, is edited and downloads, guarded until then, with the SDK's assets from this origin", async ({
  page,
  problems,
}) => {
  // A query and a fragment, which analytics must never send.
  await page.goto("/?smoke=private#fragment");

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "blank.pdf", mimeType: "application/pdf", buffer: blankPdf() });
  // The app's own status line, fed by the SDK's change events.
  await expect(page.locator("header output")).toHaveText("blank.pdf · 1 page");

  // A first visit is in Easy mode: the app's preferences reach the editor.
  await expect(page.getByRole("radio", { name: "Easy" })).toBeChecked();

  // The leave guard: off for an untouched document, on after an edit, and
  // off again once the edited document is downloaded.
  expect(await leavingAsks(page)).toBe(false);
  await page
    .getByRole("navigation", { name: "Tools" })
    .getByRole("button", { name: /^Rotate right\b/ })
    .click();
  await expect.poll(() => leavingAsks(page)).toBe(true);
  // The browser's own prompt, once: dismissing it keeps the page and the edit.
  await expectLeavePrompt(page);

  const saving = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const pdf = await readFile(await (await saving).path());
  expect(pdf.toString("ascii", 0, 5)).toBe("%PDF-");
  expect(pdf.byteLength).toBeGreaterThan(100);
  await expect.poll(() => leavingAsks(page)).toBe(false);

  expectSdkAssets(problems, page, "@hussmartinez/pdf-sdk");
  await expectAnalytics(problems, analytics, appConfig.app);
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

test("the ad slot sits at the foot of the editor's properties column, on wide screens only", async ({
  page,
}) => {
  await page.goto("/");
  await expectAdSlotInTheFrame(page);
});

test("the shell looks as committed, in light and dark, and skips to the editor", async ({
  page,
}) => {
  await expectShellLook(page);
});
