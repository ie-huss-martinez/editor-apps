import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildVersion, offlinePaths, serviceWorkerSource } from "./offline.ts";

let outDir: string | undefined;

function build(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "offline-"));
  outDir = dir;
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

// Only after the tests that made a build: the source tests make none.
afterEach(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  outDir = undefined;
});

describe("offlinePaths", () => {
  it("lists every served file, the page as /, and leaves out Cloudflare's and its own", () => {
    const dir = build({
      "index.html": "<!doctype html>",
      "assets/index-abc.js": "",
      "pdf-sdk/0.7.0/worker.js": "",
      "manifest.webmanifest": "{}",
      _headers: "",
      _redirects: "",
      "sw.js": "",
    });
    expect(offlinePaths(dir)).toEqual([
      "/",
      "/assets/index-abc.js",
      "/manifest.webmanifest",
      "/pdf-sdk/0.7.0/worker.js",
    ]);
  });
});

describe("buildVersion", () => {
  it("changes with any file's contents, and only then", () => {
    const dir = build({ "index.html": "one", "assets/a.js": "a" });
    const paths = offlinePaths(dir);
    const first = buildVersion(dir, paths);
    expect(buildVersion(dir, paths)).toBe(first);
    writeFileSync(path.join(dir, "assets/a.js"), "b");
    expect(buildVersion(dir, paths)).not.toBe(first);
  });
});

describe("serviceWorkerSource", () => {
  it("keeps the build's files in a cache named after the build", () => {
    const source = serviceWorkerSource(["/", "/assets/a.js"], "0123abcd");
    expect(source).toContain('const CACHE = "offline-0123abcd";');
    expect(source).toContain('"/assets/a.js"');
    // A page comes from the network first, and from the cache offline or
    // when the server answers with an error.
    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain("response.status >= 500");
    // Other origins and other methods pass through.
    expect(source).toContain("self.location.origin");
    // A server's Vary, such as on Origin, never makes a kept file miss.
    expect(source.match(/cache\.match\([^)]*\{ ignoreVary: true \}\)/g)).toHaveLength(2);
  });

  it("parses as a script, with nothing a strict policy forbids", () => {
    const source = serviceWorkerSource(["/"], "ab");
    expect(() => new Function(source)).not.toThrow();
    expect(source).not.toMatch(/\beval\(|importScripts|new Function/);
  });

  it("refuses a version that could escape its string", () => {
    expect(() => serviceWorkerSource(["/"], 'x"; alert(1); "')).toThrow(TypeError);
  });
});
