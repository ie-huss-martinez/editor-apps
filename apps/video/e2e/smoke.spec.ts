import { readFile } from "node:fs/promises";
import { preferencesKey } from "@editor-apps/app-shell/preferences-key";
import {
  analyticsOriginUnderTest,
  expect,
  expectAdSlotInTheFrame,
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

/** One second of a test pattern and a tone, from FFmpeg's synthetic sources (make-fixture.sh). */
const fixture = new URL("./fixtures/clip.webm", import.meta.url);

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
  expect(headers["content-security-policy"]).toContain("media-src 'self' blob:");

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\//);
  await expectThirdPartyLicenses(page, "@hussmartinez/video-sdk");
});

test("a video opens and downloads, guarded until then, with the SDK's workers from this origin", async ({
  page,
  problems,
}) => {
  // A query and a fragment, which analytics must never send.
  await page.goto("/?smoke=private#fragment");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose files" }).click();
  await (await chooser).setFiles({
    name: "clip.webm",
    mimeType: "video/webm",
    buffer: await readFile(fixture),
  });
  await expect(page.getByRole("listbox", { name: "Clips" }).getByRole("option")).toHaveCount(1);
  // A first visit is in Easy mode: the app's preferences reach the editor.
  await expect(page.getByRole("radio", { name: "Easy" })).toBeChecked();

  // The leave guard: adding a clip is already an edit, so it's on. It stays
  // on once the export is built, and it's off once Download is pressed.
  await expect.poll(() => leavingAsks(page)).toBe(true);

  await page.getByRole("button", { name: "Export the video", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export the video" });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = dialog.getByRole("button", { name: /^Download/ });
  await expect(download).toBeEnabled({ timeout: 90_000 });
  // Built, but not downloaded yet: still guarded (docs/adr/0002).
  expect(await leavingAsks(page)).toBe(true);
  const saving = page.waitForEvent("download");
  await download.click();
  const video = await readFile(await (await saving).path());
  await expect.poll(() => leavingAsks(page)).toBe(false);

  // A WebM or MP4 file, with a video track. Only the type is checked: the
  // frames are video-sdk's to test.
  const webm = video.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const mp4 = video.toString("ascii", 4, 8) === "ftyp";
  expect(webm || mp4, "a WebM or MP4 file").toBe(true);
  expect(hasVideoTrack(video), "a video track").toBe(true);
  expect(video.byteLength).toBeGreaterThan(1_000);

  expectSdkAssets(problems, page, "@hussmartinez/video-sdk");
  await expectAnalytics(problems, analytics, appConfig.app);
});

/**
 * Whether a WebM or MP4 file declares a video track: WebM names its codec
 * with a codec ID such as `V_VP8`, and MP4's track handler is `vide`, eight
 * bytes after the `hdlr` box's type. Whole names, so a stray pair of bytes
 * in compressed data can't pass for one.
 */
function hasVideoTrack(file: Buffer): boolean {
  if (["V_VP8", "V_VP9", "V_AV1", "V_MPEG4/ISO/AVC"].some((codec) => file.includes(codec))) {
    return true;
  }
  for (let at = file.indexOf("hdlr"); at !== -1; at = file.indexOf("hdlr", at + 1)) {
    if (file.toString("ascii", at + 12, at + 16) === "vide") return true;
  }
  return false;
}

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
