import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build, createServer, preview } from "vite";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy } from "./headers.ts";
import { themeScript, themeScriptPath } from "./theme-script.ts";
import { editorApp, posthogPolicy } from "./vite.ts";

let root: string;

const PREFERENCES_KEY = "editor-preferences:fixture";
const THEME_URL = themeScriptPath(themeScript(PREFERENCES_KEY));

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "editor-app-"));
  writeFileSync(
    path.join(root, "index.html"),
    [
      '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Fixture</title>',
      '<script type="module" src="/main.js"></script></head><body></body></html>',
    ].join(""),
  );
  writeFileSync(path.join(root, "main.js"), "document.title = 'Built';");
  mkdirSync(path.join(root, "sdk/workers"), { recursive: true });
  writeFileSync(path.join(root, "sdk/workers/worker.js"), "// a worker");
  await build({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [
      editorApp({
        policy: { wasm: true },
        sdkAssets: { from: path.join(root, "sdk"), url: "/sdk/1.2.3/" },
        offline: true,
        preferencesKey: PREFERENCES_KEY,
        canonicalUrl: "https://fixture.example/",
      }),
    ],
  });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("editorApp", () => {
  it("writes _headers with the policy and the immutable paths", () => {
    const headers = readFileSync(path.join(root, "dist/_headers"), "utf8");
    expect(headers).toContain(
      `  Content-Security-Policy: ${contentSecurityPolicy({ wasm: true })}\n`,
    );
    expect(headers).toContain(
      "\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
    expect(headers).toContain(
      "\n/sdk/1.2.3/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });

  it("loads the theme script in the page's head, after its metas, as a blocking script from its own origin", () => {
    const html = readFileSync(path.join(root, "dist/index.html"), "utf8");
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? html;
    // In the head, so it runs before anything is painted, and after every
    // meta, as it retargets the theme-color ones.
    const script = head.indexOf(`<script src="${THEME_URL}"></script>`);
    expect(script).toBeGreaterThan(-1);
    expect(head.lastIndexOf("<meta")).toBeLessThan(script);
    // Every script has a source: none is inline, which the policy forbids.
    for (const tag of html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? []) {
      expect(tag).toMatch(/^<script\b[^>]*\ssrc="\/[^"]*"[^>]*><\/script>$/);
    }
    expect(readFileSync(path.join(root, `dist${THEME_URL}`), "utf8")).toBe(
      themeScript(PREFERENCES_KEY),
    );
  });

  it("keeps the theme script offline with the rest of the build", () => {
    const worker = readFileSync(path.join(root, "dist/sw.js"), "utf8");
    expect(worker).toContain(JSON.stringify(THEME_URL));
  });

  it("copies the SDK's assets to the path the app serves them from", () => {
    expect(readFileSync(path.join(root, "dist/sdk/1.2.3/workers/worker.js"), "utf8")).toBe(
      "// a worker",
    );
  });

  it("writes a service worker that keeps the page, the bundle and the SDK's assets", () => {
    const worker = readFileSync(path.join(root, "dist/sw.js"), "utf8");
    const files = JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(worker)?.[1] ?? "[]");
    expect(files).toContain("/");
    expect(files).toContain("/sdk/1.2.3/workers/worker.js");
    expect(files.some((file: string) => /^\/assets\/index-[\w-]+\.js$/.test(file))).toBe(true);
    expect(files).not.toContain("/_headers");
    expect(files).not.toContain("/sw.js");
  });

  it("serves the built app with the same headers from vite preview", async () => {
    const server = await preview({
      root,
      logLevel: "silent",
      configFile: false,
      preview: { port: 0, host: "127.0.0.1" },
      plugins: [editorApp({ policy: { wasm: true } })],
    });
    try {
      const url = server.resolvedUrls?.local[0];
      const response = await fetch(String(url));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(
        contentSecurityPolicy({ wasm: true }),
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    } finally {
      await server.close();
    }
  });

  it("serves the SDK's assets from the dev server at the same path, and nothing outside them", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      configFile: false,
      server: { port: 0, host: "127.0.0.1" },
      plugins: [editorApp({ sdkAssets: { from: path.join(root, "sdk"), url: "/sdk/1.2.3/" } })],
    });
    try {
      await server.listen();
      const base = String(server.resolvedUrls?.local[0]).replace(/\/$/, "");
      const worker = await fetch(`${base}/sdk/1.2.3/workers/worker.js`);
      expect(await worker.text()).toBe("// a worker");
      expect(worker.headers.get("content-type")).toBe("text/javascript");
      const outside = await fetch(`${base}/sdk/1.2.3/..%2Fmain.js`);
      expect(await outside.text()).not.toContain("document.title");
    } finally {
      await server.close();
    }
  });

  it("serves the theme script from the dev server at the build's path", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      configFile: false,
      server: { port: 0, host: "127.0.0.1" },
      plugins: [editorApp({ preferencesKey: PREFERENCES_KEY })],
    });
    try {
      await server.listen();
      const base = String(server.resolvedUrls?.local[0]).replace(/\/$/, "");
      const script = await fetch(`${base}${THEME_URL}`);
      expect(await script.text()).toBe(themeScript(PREFERENCES_KEY));
      expect(script.headers.get("content-type")).toBe("text/javascript");
      const page = await (await fetch(`${base}/`)).text();
      expect(page).toContain(`<script src="${THEME_URL}"></script>`);
    } finally {
      await server.close();
    }
  });

  it("passes a malformed URL on to Vite, and keeps serving", async () => {
    const server = await createServer({
      root,
      logLevel: "silent",
      configFile: false,
      server: { port: 0, host: "127.0.0.1" },
      plugins: [editorApp({ sdkAssets: { from: path.join(root, "sdk"), url: "/sdk/1.2.3/" } })],
    });
    try {
      await server.listen();
      const base = String(server.resolvedUrls?.local[0]).replace(/\/$/, "");
      // %E0 starts a UTF-8 sequence that never ends, so decodeURIComponent throws on it.
      const malformed = await fetch(`${base}/sdk/1.2.3/%E0`);
      expect(malformed.status).not.toBe(500);
      const worker = await fetch(`${base}/sdk/1.2.3/workers/worker.js`);
      expect(await worker.text()).toBe("// a worker");
    } finally {
      await server.close();
    }
  });

  it("refuses an assets path that isn't a plain directory path", () => {
    for (const url of ["sdk/", "/sdk", "/sdk/../", "/sdk/*/", "https://cdn.example/sdk/"]) {
      expect(() => editorApp({ sdkAssets: { from: ".", url } })).toThrow(TypeError);
    }
  });
});

describe("posthogPolicy", () => {
  afterEach(() => vi.unstubAllEnvs());
  const empty = () => mkdtempSync(path.join(tmpdir(), "posthog-env-"));

  it("allows nothing without a key", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "");
    expect(posthogPolicy("production", empty(), "https://ph.example")).toBeUndefined();
  });

  it("allows the default host's origin with a key", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "");
    expect(posthogPolicy("production", empty(), "https://ph.example/")).toEqual({
      connect: ["https://ph.example"],
    });
  });

  it("follows VITE_POSTHOG_HOST, and refuses one that isn't https", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.ph.example");
    expect(posthogPolicy("production", empty(), "https://ph.example")).toEqual({
      connect: ["https://eu.ph.example"],
    });
    vi.stubEnv("VITE_POSTHOG_HOST", "http://ph.example");
    expect(() => posthogPolicy("production", empty(), "https://ph.example")).toThrow(TypeError);
  });

  it("reads a key from the app's .env file, as the build does", () => {
    vi.stubEnv("VITE_POSTHOG_KEY", undefined);
    const dir = empty();
    writeFileSync(path.join(dir, ".env.production"), "VITE_POSTHOG_KEY=phc_file\n");
    expect(posthogPolicy("production", dir, "https://ph.example")).toEqual({
      connect: ["https://ph.example"],
    });
  });
});
