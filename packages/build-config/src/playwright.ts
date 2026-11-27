import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { fontLaunchEnv } from "@hussmartinez/sdk-config/testing/fonts";
import { webServersFor } from "@hussmartinez/sdk-config/testing/require-image";
import { visualComparison } from "@hussmartinez/sdk-config/testing/visual";
import {
  test as base,
  defineConfig,
  devices,
  expect,
  type Page,
  type PlaywrightTestConfig,
} from "@playwright/test";
import { loadEnv } from "vite";

/**
 * The smoke tests' shared setup (docs/adr/0003): every app's tests run
 * against its built output, served with production's headers, and fail on
 * anything the app must never do.
 */

/** Resolves from this package, which depends on sdk-config, whatever app runs it. */
const require = createRequire(import.meta.url);

export type Engine = "chromium" | "firefox" | "webkit";

const DEVICES: Record<Engine, string> = {
  chromium: "Desktop Chrome",
  firefox: "Desktop Firefox",
  webkit: "Desktop Safari",
};

export interface SmokeOptions {
  /** A port of the app's own, so two apps' tests can run at once. */
  readonly port: number;
  /** The browsers the app supports. Its SDK decides: a codec or an API may be missing in one. */
  readonly engines: readonly Engine[];
}

/**
 * An app's Playwright configuration. Chromium alone by default; with
 * `SMOKE_ENGINES=all`, as CI sets nightly and when the shared packages
 * change, every engine the app supports.
 *
 * By default it tests the app's build, served by `vite preview` with the
 * headers of the `editorApp` plugin: build the app first. With
 * `SMOKE_BASE_URL`, such as the app's production address, it tests that
 * deployment instead, and starts no server.
 */
export function smokeConfig({ port, engines }: SmokeOptions): PlaywrightTestConfig {
  const run = process.env.SMOKE_ENGINES === "all" ? engines : engines.slice(0, 1);
  const deployment = process.env.SMOKE_BASE_URL;
  const url = deployment ? new URL(deployment).origin : `http://127.0.0.1:${port}`;
  return defineConfig({
    testDir: "e2e",
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: process.env.CI ? "line" : "list",
    // Browser tests run only in the pinned image or CI (sdk-core ADR 0049):
    // on a host, Docker's network changes make them fail at random.
    globalSetup: require.resolve("@hussmartinez/sdk-config/testing/require-image"),
    // Committed next to the tests, one set per browser; see expectShellLook.
    snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
    // The family's strict comparison (sdk-core ADR 0054): a pixel differs
    // when it's more than one colour level from its baseline, and none may.
    expect: { toHaveScreenshot: { ...visualComparison } },
    // In the image, fonts with a real bold face, as screenshots need
    // (sdk-core ADR 0062). Elsewhere it's the process's own environment.
    use: { baseURL: url, trace: "retain-on-failure", launchOptions: { env: fontLaunchEnv() } },
    projects: run.map((engine) => ({ name: engine, use: { ...devices[DEVICES[engine]] } })),
    // None where the guard will refuse, so a refused run starts no server.
    ...(deployment
      ? {}
      : {
          webServer: webServersFor({
            command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
            url,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          }),
        }),
  });
}

/** What a page did that an app must never do. Empty when all is well. */
export interface Problems {
  /** Console errors, uncaught errors, policy violations and failed responses. */
  readonly errors: string[];
  /** Requests to an origin other than the app's own. */
  readonly foreign: string[];
  /** Every request's URL, for asserting where an asset came from. */
  readonly requests: string[];
  /** The requests to the analytics origins, answered in the browser, with their bodies. */
  readonly analytics: { readonly url: string; readonly body: Buffer | null }[];
}

/** Options an app sets with `test.use()`. */
export interface SmokeTestOptions {
  /**
   * The origins of the app's analytics provider (docs/adr/0005). Requests to
   * them don't count as foreign, and are answered in the browser with an
   * empty 204, so a test never sends events to the real provider, even
   * against a deployment that has a key. Empty by default.
   */
  readonly analyticsOrigins: readonly string[];
}

/**
 * Playwright's `test`, with a `problems` fixture that every test gets
 * whether it asks or not: it records console errors, uncaught errors,
 * Content Security Policy violations, HTTP errors, failed requests and
 * requests to another origin, and fails the test if there were any.
 *
 * A test that expects one removes it from `problems` before it ends.
 */
export const test = base.extend<SmokeTestOptions & { problems: Problems }>({
  analyticsOrigins: [[], { option: true }],
  problems: [
    async ({ page, baseURL, analyticsOrigins }, use) => {
      const problems: Problems = { errors: [], foreign: [], requests: [], analytics: [] };
      const own = new URL(baseURL ?? "http://127.0.0.1").origin;
      const analytics = new Set(analyticsOrigins.map((origin) => new URL(origin).origin));
      // Answering the app's own origin would answer its pages too.
      if (analytics.has(own)) {
        throw new Error(`analyticsOrigins includes the app's own origin, ${own}.`);
      }
      if (analytics.size > 0) {
        // PostHog drops events from a browser that looks automated, by its
        // user agent, its client hints or navigator.webdriver. Present the
        // page as a person's browser, so a test can see the app's page view:
        // the requests are answered below, so no real analytics are counted.
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
          Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined });
        });
        await page.context().route(
          (url) => analytics.has(url.origin),
          (route) => {
            const request = route.request();
            problems.analytics.push({ url: request.url(), body: request.postDataBuffer() });
            return route.fulfill({ status: 204 });
          },
        );
      }
      page.on("console", (message) => {
        if (message.type() === "error") problems.errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.errors.push(`uncaught: ${error.message}`));
      // On the context, not the page, so the SDK's workers' requests count too.
      // An HTTP error completes as a response; a transport failure, such as
      // a blocked or reset request, emits only requestfailed.
      page.context().on("response", (response) => {
        if (response.status() >= 400) {
          problems.errors.push(`${response.status()} ${response.url()}`);
        }
      });
      page.context().on("requestfailed", (request) => {
        const url = request.url();
        // A blob: or data: URL never touches the network: a download from
        // one may be reported as aborted once the browser takes it over.
        if (/^(blob|data):/.test(url)) return;
        problems.errors.push(`failed: ${url} ${request.failure()?.errorText ?? "unknown error"}`);
      });
      page.context().on("request", (request) => {
        const url = request.url();
        problems.requests.push(url);
        if (/^(blob|data):/.test(url)) return;
        const { origin } = new URL(url);
        if (origin !== own && !analytics.has(origin)) problems.foreign.push(url);
      });
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          // biome-ignore lint/suspicious/noConsole: the console is how problems hears of it.
          console.error(`Policy violation: ${event.violatedDirective} ${event.blockedURI}`);
        });
      });

      await use(problems);

      expect(problems.foreign, "requests to another origin").toEqual([]);
      expect(problems.errors, "errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The headers every app's pages must be served with, checked on a response. */
export function expectSecurityHeaders(headers: Record<string, string>): void {
  const policy = headers["content-security-policy"] ?? "";
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
}

/** A package's installed version, resolved from the app's folder, which is where Playwright runs. */
function installedVersion(packageName: string): string {
  const manifest = createRequire(path.join(process.cwd(), "package.json"))(
    `${packageName}/package.json`,
  ) as { version: string };
  return manifest.version;
}

/**
 * Checks that the app loaded its SDK's assets, such as workers, WebAssembly
 * and data files, and only from its own origin under the installed SDK's
 * version: `/<sdk>/<version>/`, as the `editorApp` plugin serves them.
 *
 * The version is read from the SDK's `package.json`, resolved from the
 * app's folder, which is where Playwright runs. An upgrade needs no change
 * to the test, and a stale asset from another version fails it.
 *
 * @param packageName - Such as `@hussmartinez/pdf-sdk`.
 */
export function expectSdkAssets(problems: Problems, page: Page, packageName: string): void {
  const name = packageName.split("/").pop() ?? packageName;
  const base = `${new URL(page.url()).origin}/${name}/${installedVersion(packageName)}/`;
  const assets = problems.requests.filter((url) => url.includes(`/${name}/`));
  expect(assets.length, `requests for ${packageName}'s assets`).toBeGreaterThan(0);
  for (const asset of assets) expect(asset.startsWith(base), asset).toBe(true);
}

/**
 * The analytics origin the app under test allows, or `undefined` for a
 * build without a key (docs/adr/0005). For the local build, it's read from
 * the same variables Vite builds with, in the app's folder. A deployment's
 * build variables aren't visible from here, so whoever tests one says it
 * has a key with `SMOKE_ANALYTICS=on` (and `VITE_POSTHOG_HOST` for another
 * host).
 *
 * @param defaultHost - The app's default PostHog host.
 */
export function analyticsOriginUnderTest(defaultHost: string): string | undefined {
  const env = process.env.SMOKE_BASE_URL
    ? {
        VITE_POSTHOG_KEY: process.env.SMOKE_ANALYTICS === "on" ? "set" : "",
        VITE_POSTHOG_HOST: process.env.VITE_POSTHOG_HOST,
      }
    : loadEnv("production", process.cwd(), "VITE_");
  if (!env.VITE_POSTHOG_KEY) return undefined;
  return new URL(env.VITE_POSTHOG_HOST || defaultHost).origin;
}

/**
 * Checks the sources one directive of the app's Content Security Policy
 * allows, apart from quoted keywords such as `'self'`: they must be exactly
 * `origins`, in any order. Anything else, such as `*`, an `http:` origin or
 * a bare host, fails, so the policy can't quietly allow more than the app's
 * configuration says.
 */
export function expectPolicyOrigins(
  headers: Record<string, string>,
  directive: string,
  origins: readonly string[],
): void {
  const policy = headers["content-security-policy"] ?? "";
  const sources = policy
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  expect(sources, `the policy's ${directive}`).toBeDefined();
  const named = (sources ?? []).slice(1).filter((source) => !/^'[a-z-]+'$/.test(source));
  expect([...named].sort(), `the sources in ${directive}`).toEqual([...origins].sort());
}

/** One analytics event, as PostHog's client sends it. */
interface SentEvent {
  readonly event: string;
  readonly properties?: Record<string, unknown>;
}

/**
 * The events in one request PostHog's client sent: JSON, possibly
 * base64-encoded in a `data` form field, possibly gzipped, holding one
 * event, a list, or a `batch`.
 */
export function sentEvents(body: Buffer | null): SentEvent[] {
  if (!body || body.length === 0) return [];
  let bytes = body;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
  let text = bytes.toString("utf8");
  if (!/^\s*[[{]/.test(text)) {
    const data = new URLSearchParams(text).get("data");
    if (!data) return [];
    const decoded = Buffer.from(data, "base64");
    text = (decoded[0] === 0x1f && decoded[1] === 0x8b ? gunzipSync(decoded) : decoded).toString(
      "utf8",
    );
  }
  const parsed = JSON.parse(text) as SentEvent | SentEvent[] | { batch: SentEvent[] };
  if (Array.isArray(parsed)) return parsed;
  if ("batch" in parsed) return parsed.batch;
  return [parsed];
}

/**
 * Checks what the app sent to its analytics origin, which the fixture
 * answered in the browser (docs/adr/0005).
 *
 * - **Without analytics,** nothing at all went there.
 * - **With analytics,** exactly one page view, every event tagged with the
 *   app's name, and no address with a query string or fragment. The page's
 *   own SDK events may come too.
 *
 * Call it at the end of a test, after the app has had time to send its
 * events: it waits for the page view.
 *
 * @param origin - From {@link analyticsOriginUnderTest}.
 * @param app - The app's name, as its configuration gives it.
 */
export async function expectAnalytics(
  problems: Problems,
  origin: string | undefined,
  app: string,
): Promise<void> {
  if (!origin) {
    expect(problems.analytics, "requests to the analytics origin without a key").toEqual([]);
    return;
  }
  const events = () => problems.analytics.flatMap(({ body }) => sentEvents(body));
  const pageViews = () => events().filter(({ event }) => event === "$pageview");
  await expect
    .poll(() => pageViews().length, { message: "the page view", timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(pageViews(), "page views per load").toHaveLength(1);
  for (const { event, properties } of events()) {
    expect(properties?.app, `the app of ${event}`).toBe(app);
    const addresses = JSON.stringify(properties ?? {}).match(/https?:\/\/[^"]*/g) ?? [];
    for (const address of addresses) expect(address, `an address in ${event}`).not.toMatch(/[?#]/);
  }
}

/**
 * Checks that the app serves `third-party-licenses.txt`, generated by the
 * build, listing its SDK at the installed version and React, as a quick
 * sign that the file reflects this build.
 *
 * @param packageName - The app's SDK, such as `@hussmartinez/pdf-sdk`.
 */
export async function expectThirdPartyLicenses(page: Page, packageName: string): Promise<void> {
  const response = await page.request.get("/third-party-licenses.txt");
  expect(response.status(), "the licences file").toBe(200);
  const text = await response.text();
  expect(text).toContain(`\n${packageName}@${installedVersion(packageName)}\n`);
  expect(text).toContain(`\nreact@${installedVersion("react")}\n`);
}

/** A viewport where the ad slot is shown, and fits under an editor's top bar (docs/adr/0011). */
export const AD_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * The shell's own part of the page (docs/adr/0002) looks as committed, in
 * light and dark, with the app's ad slot (docs/adr/0007) when it has one,
 * and its skip link reaches the editor. Only the header and the slot are
 * compared, not the SDK's editor, so an SDK upgrade changes no screenshot.
 * The page is 1440 × 900, where the slot shows in the editor's column.
 *
 * Chromium only, and only in the browser test image, where fonts and
 * rendering match CI's. Update the screenshots with `--update-snapshots`.
 *
 * @param options - `ad: false` for an app without a slot.
 */
export async function expectShellLook(
  page: Page,
  { ad = true }: { readonly ad?: boolean } = {},
): Promise<void> {
  base.skip(base.info().project.name !== "chromium", "The screenshots are Chromium's.");
  await page.setViewportSize(AD_VIEWPORT);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("header").first()).toHaveScreenshot(`shell-header-${scheme}.png`);
    if (ad) {
      await expect(page.locator(".app-shell-ad-box")).toHaveScreenshot(`shell-ad-${scheme}.png`);
    } else {
      await expect(page.locator(".app-shell-ad")).toHaveCount(0);
    }
  }

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to the editor" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
}

/**
 * The ad slot's place (docs/adr/0007, docs/adr/0011), in every engine: on a
 * viewport of 1440 × 900, a box of exactly 160 × 600 at the foot of the
 * editor's properties column, which ends the frame at its inline end; on a
 * viewport narrower than 1280 or lower than 720, no slot in the page at all.
 * The slot is decorative: hidden from assistive technology, and inert.
 *
 * Call it with the page showing the editor, such as after `goto("/")` or
 * after opening a file: it doesn't reload.
 */
export async function expectAdSlotInTheFrame(page: Page): Promise<void> {
  await page.setViewportSize(AD_VIEWPORT);
  const box = page.locator(".app-shell-ad-box");
  await expect(box).toBeVisible();
  const place = await box.evaluate((element) => {
    const rect = (target: Element | null | undefined) => target?.getBoundingClientRect().toJSON();
    const slot = element.closest(".app-shell-ad");
    const footer = element.closest(".hm-editor-frame-properties-footer");
    const column = element.closest(".hm-editor-frame-properties-column");
    return {
      box: rect(element) as DOMRect,
      footer: rect(footer) as DOMRect | undefined,
      column: rect(column) as DOMRect | undefined,
      frame: rect(element.closest(".hm-editor-frame")) as DOMRect | undefined,
      stage: rect(column?.parentElement?.querySelector(".hm-editor-frame-stage")) as
        | DOMRect
        | undefined,
      hidden: slot?.getAttribute("aria-hidden"),
      inert: slot?.hasAttribute("inert"),
      inMain: element.closest("main") !== null,
    };
  });
  // Its fixed size, so nothing moves when an ad fills it.
  expect(place.box.width, "the slot's width").toBe(160);
  expect(place.box.height, "the slot's height").toBe(600);
  // In the frame's properties column, which ends the frame, after the stage.
  expect(place.footer, "the frame's properties footer").toBeDefined();
  expect(place.column, "the frame's properties column").toBeDefined();
  expect(place.frame, "the editor's frame").toBeDefined();
  expect(place.inMain, "inside the main area").toBe(true);
  const { box: slot, column, frame, stage } = place;
  if (!column || !frame) throw new Error("The slot isn't in an editor frame's column.");
  expect(slot.left).toBeGreaterThanOrEqual(column.left);
  expect(slot.right).toBeLessThanOrEqual(column.right);
  expect(frame.right - column.right, "the column's gap to the frame's end").toBeLessThan(2);
  if (stage)
    expect(column.left, "the column after the stage").toBeGreaterThanOrEqual(stage.right - 1);
  // Centred in its column, never stretched.
  expect(Math.abs(slot.left - column.left - (column.right - slot.right))).toBeLessThan(2);
  expect(place.hidden).toBe("true");
  expect(place.inert).toBe(true);

  // Below 1280 × 720 the host renders no slot at all (docs/adr/0007).
  for (const viewport of [
    { width: 1279, height: 900 },
    { width: 1440, height: 719 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.locator(".app-shell-ad"),
      `${viewport.width} × ${viewport.height}`,
    ).toHaveCount(0);
  }
  await page.setViewportSize(AD_VIEWPORT);
  await expect(box).toBeVisible();
}

/**
 * The page's theme before first paint (docs/adr/0010): with a theme kept in
 * the app's editor preferences, `<html>` already has it when the browser
 * reaches `<body>`, before anything can be painted, and the shell's header
 * is drawn in it whatever the system's colour scheme. With `system`, or a
 * kept value that's no use, the page follows the system. The `problems`
 * fixture fails the test if the script breaks the policy or throws.
 *
 * @param key - The app's `localStorage` key, from app-shell's `preferencesKey`.
 */
export async function expectThemeBeforeFirstPaint(page: Page, key: string): Promise<void> {
  // What <html> said when <body> arrived: nothing in it is painted before.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      observer.disconnect();
      document.documentElement.dataset.themeAtBody =
        document.documentElement.getAttribute("data-hm-theme") ?? "none";
    }).observe(document, { childList: true, subtree: true });
  });
  const header = page.locator("header").first();
  const background = () => header.evaluate((element) => getComputedStyle(element).backgroundColor);
  const load = async (kept: string | null) => {
    await page.evaluate(
      ({ name, value }) => {
        if (value === null) localStorage.removeItem(name);
        else localStorage.setItem(name, value);
      },
      { name: key, value: kept },
    );
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    return page.evaluate(() => document.documentElement.dataset.themeAtBody);
  };

  await page.goto("/");
  const system: Partial<Record<"light" | "dark", string>> = {};
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await load(null), "nothing kept").toBe("none");
    system[scheme] = await background();
  }
  expect(system.light, "the header in light and dark").not.toBe(system.dark);

  // A theme kept against the system's: set before <body>, and the shell follows it.
  for (const [scheme, kept] of [
    ["light", "dark"],
    ["dark", "light"],
  ] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await load(JSON.stringify({ theme: kept })), `${kept} kept`).toBe(kept);
    expect(await background(), `the header in ${kept}`).toBe(system[kept]);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  for (const kept of [JSON.stringify({ theme: "system" }), JSON.stringify({ theme: 1 }), "{oops"]) {
    expect(await load(kept), `${kept} kept`).toBe("none");
    expect(await background(), `the header for ${kept}`).toBe(system.dark);
  }
  await page.evaluate((name) => localStorage.removeItem(name), key);
}

/**
 * The editor has the height the shell's header leaves (sdk-core ADR 0067):
 * it starts under the header, reaches the main area's foot, and the page
 * itself doesn't scroll, at the page's current viewport. The editor's frame
 * needs that definite height to lay out its bars, panels and stage.
 */
export async function expectEditorFillsTheScreen(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("The page has no viewport.");
  const editor = page.locator(".app-shell-main > .app-editor");
  await expect(editor).toBeVisible();
  const sizes = await editor.evaluate((element) => {
    const main = element.parentElement as HTMLElement;
    const padding = Number.parseFloat(getComputedStyle(main).paddingBlockEnd);
    const header = document.querySelector(".app-shell-header")?.getBoundingClientRect();
    return {
      editor: element.getBoundingClientRect().toJSON() as DOMRect,
      mainBottom: main.getBoundingClientRect().bottom - padding,
      headerBottom: header?.bottom ?? 0,
      scrolls: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  expect(sizes.scrolls, "the page scrolls").toBe(false);
  expect(sizes.editor.top, "the editor's top").toBeGreaterThanOrEqual(sizes.headerBottom);
  expect(Math.abs(sizes.editor.bottom - sizes.mainBottom), "the editor's foot").toBeLessThan(1);
  expect(sizes.editor.bottom, "the editor's foot").toBeLessThanOrEqual(viewport.height);
  expect(sizes.editor.height, "the editor's height").toBeGreaterThan(
    (viewport.height - sizes.headerBottom) * 0.9,
  );
}

/**
 * Whether leaving the page now would make the browser ask first: it
 * dispatches a cancelable `beforeunload`, as the browser does, and reads
 * whether the shell's leave guard cancelled it (docs/adr/0002). Poll it,
 * since the guard follows the SDK's events.
 */
export function leavingAsks(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

/**
 * Checks the browser's own prompt on leaving: it tries to close the page,
 * expects a `beforeunload` dialog, dismisses it, and checks the page stays
 * open. Browsers show the prompt only after the person has interacted with
 * the page, so call it after an edit made through the UI.
 */
export async function expectLeavePrompt(page: Page): Promise<void> {
  const prompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
}
