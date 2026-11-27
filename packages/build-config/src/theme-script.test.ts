import { describe, expect, it } from "vitest";
import { themeScript, themeScriptPath } from "./theme-script.ts";

const KEY = "editor-preferences:notes";

/** A fake `<meta>`, with its attributes in a map. */
function meta(attributes: Record<string, string>) {
  const map = new Map(Object.entries(attributes));
  return {
    map,
    getAttribute: (name: string) => map.get(name) ?? null,
    setAttribute: (name: string, value: string) => map.set(name, value),
  };
}

/** The page's two theme-color metas, as pdf's and notes' index.html have them. */
let metas: ReturnType<typeof meta>[] = [];

/** Runs the script against a fake page, with what `localStorage` holds, and returns `<html>`'s theme. */
function run(stored: string | null | (() => never), key = KEY): string | undefined {
  const attributes = new Map<string, string>();
  const localStorage = {
    getItem: (asked: string) =>
      typeof stored === "function" ? stored() : asked === key ? stored : null,
  };
  const window = { localStorage };
  metas = [
    meta({ name: "theme-color", media: "(prefers-color-scheme: light)", content: "#fff" }),
    meta({ name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#000" }),
  ];
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
    querySelectorAll: () => metas,
  };
  new Function("window", "document", themeScript(KEY))(window, document);
  return attributes.get("data-hm-theme");
}

describe("themeScript", () => {
  it.each(["light", "dark"])("sets a chosen %s theme on <html>", (theme) => {
    expect(run(JSON.stringify({ theme, mode: "easy" }))).toBe(theme);
  });

  it("points the theme-color metas at a chosen theme, keeping their own media", () => {
    run(JSON.stringify({ theme: "dark" }));
    expect(metas.map(({ map }) => [map.get("media"), map.get("data-media")])).toEqual([
      ["not all", "(prefers-color-scheme: light)"],
      ["all", "(prefers-color-scheme: dark)"],
    ]);
  });

  it("sets nothing for the system's theme, so the page follows it", () => {
    expect(run(JSON.stringify({ theme: "system" }))).toBeUndefined();
    expect(metas.map(({ map }) => map.get("media"))).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)",
    ]);
  });

  it.each([
    ["nothing kept", null],
    ["text that isn't JSON", "{not json"],
    ["JSON null", "null"],
    ["a number", "42"],
    ["an unknown theme", JSON.stringify({ theme: "sepia" })],
    ["a theme that isn't text", JSON.stringify({ theme: ["dark"] })],
  ])("sets nothing, and never throws, for %s", (_, stored) => {
    expect(run(stored)).toBeUndefined();
  });

  it("never throws when storage is blocked", () => {
    expect(
      run(() => {
        throw new Error("SecurityError");
      }),
    ).toBeUndefined();
  });

  it("reads only its own app's key", () => {
    expect(run(JSON.stringify({ theme: "dark" }), "editor-preferences:pdf")).toBeUndefined();
  });

  it("quotes the key as a string, whatever it holds", () => {
    expect(themeScript('a"b')).toContain('getItem("a\\"b")');
  });
});

describe("themeScriptPath", () => {
  it("is under /assets/, named by the script's contents", () => {
    expect(themeScriptPath(themeScript(KEY))).toMatch(/^\/assets\/theme-[0-9a-f]{10}\.js$/);
    expect(themeScriptPath(themeScript(KEY))).not.toBe(
      themeScriptPath(themeScript("editor-preferences:pdf")),
    );
  });
});
