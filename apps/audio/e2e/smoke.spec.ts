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

const RATE = 44_100;

/** A tenth of a second of a 440 Hz tone, as 16-bit mono PCM: a real WAV file, made here. */
function recording(): Buffer {
  const frames = RATE / 10;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame++) {
    const sample = Math.sin((frame * 440 * 2 * Math.PI) / RATE) * 16_000;
    wav.writeInt16LE(Math.round(sample), 44 + frame * 2);
  }
  return wav;
}

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
  await expectThirdPartyLicenses(page, "@hussmartinez/audio-sdk");
});

test("a recording opens, is edited and downloads as WAV, guarded until then, with the SDK's worker from this origin", async ({
  page,
  problems,
}) => {
  // A query and a fragment, which analytics must never send.
  await page.goto("/?smoke=private#fragment");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a file" }).click();
  await (await chooser).setFiles({ name: "tone.wav", mimeType: "audio/wav", buffer: recording() });

  // The SDK's Export tool opens its export dialog, which writes the file.
  const exportTool = page.getByRole("button", { name: "Export", exact: true });
  await expect(exportTool).toBeEnabled({ timeout: 30_000 });

  // A first visit is in Easy mode: the app's preferences reach the editor.
  // Adding a track is an Advanced tool, so the person moves on to Advanced.
  const easy = page.getByRole("radio", { name: "Easy" });
  await expect(easy).toBeChecked();
  await page.getByRole("radio", { name: "Advanced" }).click();

  // The leave guard: off for an untouched recording, on after an edit, still
  // on once the export is built, and off once Download is pressed.
  expect(await leavingAsks(page)).toBe(false);
  await page
    .getByRole("navigation", { name: "Tools" })
    .getByRole("button", { name: /^Add track\b/ })
    .click();
  await expect.poll(() => leavingAsks(page)).toBe(true);

  await exportTool.click();
  const dialog = page.getByRole("dialog", { name: "Export" });
  await dialog.getByRole("button", { name: "Export", exact: true }).click();
  const download = dialog.getByRole("button", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 30_000 });
  // Built, but not downloaded yet: still guarded (docs/adr/0002).
  expect(await leavingAsks(page)).toBe(true);
  const saving = page.waitForEvent("download");
  await download.click();
  const saved = await saving;
  await expect.poll(() => leavingAsks(page)).toBe(false);
  expect(saved.suggestedFilename()).toMatch(/\.wav$/);
  const wav = await readFile(await saved.path());
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  expect(wav.length).toBeGreaterThan(44);

  expectSdkAssets(problems, page, "@hussmartinez/audio-sdk");
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
