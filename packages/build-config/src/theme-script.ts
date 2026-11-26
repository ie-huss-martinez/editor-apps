import { createHash } from "node:crypto";

/**
 * The page's theme before first paint (docs/adr/0010). The shell keeps the
 * editor's preferences in `localStorage`, and sets the theme chosen there on
 * `<html>` once the app runs; this script does the same earlier, from the
 * page's `<head>`, so a page whose person chose dark on a light system
 * never shows a light frame first.
 *
 * It's an external file from the app's own origin, loaded as a classic,
 * blocking script, so the strict policy (`script-src 'self'`, no inline
 * script) allows it as it is: no nonce, no hash and no `'unsafe-inline'`.
 */

/**
 * The script's source, for one app's key. It reads only the `theme` field,
 * sets `data-hm-theme` on `<html>` for `light` or `dark`, and sets nothing
 * for `system` or for anything else, so the page then follows the system.
 * It never throws: blocked storage or a value that isn't JSON leaves the
 * page as it is.
 *
 * @param storageKey - The `localStorage` key the shell keeps the preferences under.
 */
export function themeScript(storageKey: string): string {
  return `// The theme chosen in this app's editor, on <html> before the page is first
// painted (docs/adr/0010). Written by the build: edit packages/build-config.
(function () {
  "use strict";
  try {
    var stored = JSON.parse(window.localStorage.getItem(${JSON.stringify(storageKey)}) || "null");
    var theme = stored && stored.theme;
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-hm-theme", theme);
    }
  } catch (error) {
    // Storage blocked, or a value that isn't JSON: the page follows the system.
  }
})();
`;
}

/**
 * Where the build serves the script: under `/assets/`, which is cached as
 * immutable, with a digest of its source in its name, so a new key or a
 * new script is a new address.
 */
export function themeScriptPath(source: string): string {
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 10);
  return `/assets/theme-${digest}.js`;
}
