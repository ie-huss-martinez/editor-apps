# 0010. Editor preferences kept on the device, and the page's theme before first paint

- **Status:** Accepted
- **Date:** 2026-11-27
- **Supersedes:** the "following the system" part of "The theme" in [ADR 0002](0002-app-shell-and-shared-look.md)

## Context

The SDK family's UX redesign (sdk-core ADR 0067) puts every editor in ui's `EditorFrame`, with Easy, Advanced and Expert modes and a settings panel: theme, mode, tools layout, the panels' states, density, motion and tips. Each editor takes them as controlled props, `preferences` and `onPreferencesChange`, and never stores them: the host decides where they're kept, the default mode, and the page's theme before first paint.

Until now the apps had no preferences, and the theme followed the system ([ADR 0002](0002-app-shell-and-shared-look.md)). Three things make the host's part harder than a few lines in each app:

- **The page has a theme of its own.** The shell's header sits outside the editor. If the editor turns dark and the page doesn't, the header stays light above a dark editor.
- **First paint.** A theme set by React, once the app has loaded, comes after the browser has painted the page in the system's theme. A person who chose dark on a light system would see a light page flash on every visit.
- **The Content Security Policy is strict:** `script-src 'self'`, no inline script, no nonce ([ADR 0005](0005-analytics-and-consent.md), `build-config`). The usual fix for the flash, an inline script in `<head>`, isn't allowed.

Huss decided on 2026-11-26 that each app keeps its own theme, with no cookie shared across the apps' subdomains (sdk-core ADR 0067, "Questions decided after acceptance"), and that the notes app's tools default to the dock.

## Decision

### Where preferences live

- **In `localStorage`, under one key per app:** `editor-preferences:<app>`, such as `editor-preferences:pdf`, where `<app>` is the app's name in its `app.config.ts`. The apps are on different origins already; the name keeps them apart on one origin too, such as a local preview. `preferencesKey(app)` in `app-shell` makes the key, for the shell and for the build.
- **Never a cookie, and never sent anywhere.** The value holds the person's choices for how the editor looks, nothing about a file or the person, and no request carries it. Analytics doesn't read it.
- **Nothing is written until the person changes something.** A first visit reads the defaults and stores nothing.
- **`app-shell` keeps them,** in a small store `startApp` creates. Reading goes through ui's `readEditorPreferences(stored, defaults)`, which never throws: a missing value, one that isn't JSON, or an invalid field gets its default. Saving swallows storage errors, such as a full quota or storage blocked in a private window: the choice then lasts for the visit. Another tab of the same app follows a change through the `storage` event.
- **Each app spreads `useEditorPreferenceProps()` on its SDK's editor,** which gives `{ preferences, onPreferencesChange }`.

### Defaults on a first visit

- **Easy mode in every app,** from the shell. Without preferences, the SDKs start in Advanced; the apps are for people who may never have used an editor, and Easy opens on task cards. Every tool stays in the command palette and on its shortcut in every mode (sdk-core ADR 0067).
- **The notes app's tools in the dock** (`toolsLayout: "dock"`), by Huss's decision: the floating pill of the handwriting apps people know. An app passes its own defaults to `startApp` as `defaultPreferences`.
- **Every other field is ui's default:** the system's theme and motion, the tools panel full, the properties shown, comfortable density, tips on.

### The page's theme before first paint

- **A theme script in every page.** `editorApp({ preferencesKey })` in `build-config` writes a script of a dozen lines and loads it first in `<head>`. It reads the app's key, and sets `data-hm-theme` on `<html>` when the theme there is `light` or `dark`. For `system`, nothing kept, or anything it can't read, it sets nothing, and the page follows the system as before. It never throws.
- **It's a classic, blocking script,** so the browser runs it before it parses `<body>`, and nothing is painted before it. ui's themes, the brand themes included, apply to `:root[data-hm-theme]`, so the shell's header and background are in the chosen theme from the first frame.
- **A change in the editor reaches the page at once:** the store sets or removes the same attribute whenever the theme changes, so the header follows the editor's theme toggle and settings.
- **Served from the app's own origin,** at `/assets/theme-<digest>.js`, named after its contents: cached as immutable like the bundle, and kept for offline use by the service worker with every other file of the build ([ADR 0009](0009-offline-apps-with-a-service-worker.md)). The dev server serves it at the same path.

### Why it's CSP-safe

- **The policy doesn't change.** The script is an external file from the page's own origin, which `script-src 'self'` already allows. There's no inline script, no nonce, no hash and no `'unsafe-inline'`.
- **It writes no inline style:** it sets one attribute, and the stylesheets do the rest.
- **The smoke tests check it in every app,** in the pinned image: with a theme kept against the system's, `<html>` has it when `<body>` arrives, and the header is drawn in it; with `system` or garbage, the page follows the system. The test fixture fails on any policy violation or console error.

## Alternatives considered

- **An inline script in `<head>`:** the usual fix, and it needs `'unsafe-inline'`, which would let any injected script run, or a hash in the policy that must change with every edit of the script, in every app's `_headers`.
- **The theme applied by React only:** the page flashes in the system's theme before the app starts, on every visit, for everyone who chose otherwise.
- **A cookie on the apps' parent domain, so one theme serves every app:** rejected by Huss on 2026-11-26. [ADR 0002](0002-app-shell-and-shared-look.md)'s rule that the shell sets no cookie stands.
- **IndexedDB or the origin private file system:** both are asynchronous, so nothing could read them before first paint.
- **The SDK storing its own preferences:** sdk-core ADR 0067 rejects it, since an embedding host would get storage it didn't ask for.
- **The script in each app's `public/`:** five copies of the same file, each with its key typed by hand, free to drift from the shell's.

## Consequences

- **A person's theme, mode and layout come back on their next visit** to that app, and the page around the editor matches its theme.
- **The theme follows the system until the person chooses one,** as before. ADR 0002's theme stays otherwise: each app's brand on ui's tokens, in light and dark.
- **Each app keeps its own choices.** Choosing dark in the PDF editor doesn't change the image editor.
- **Every page loads one more small script,** from its own origin, before anything else. It's cached for a year, and offline in the notes app.
- **Changing what's stored stays safe:** a value from an older or newer version still reads, field by field, through ui's reader.
- **The browser's own colour for its toolbar** (`<meta name="theme-color">` in the pdf and notes apps) still follows the system, not a chosen theme. Matching it would need the script to change those tags too.
- **The legal reading** that storing a person's own interface choices needs no consent, as a service they asked for, is the owner's to confirm, as for analytics in [ADR 0005](0005-analytics-and-consent.md).
