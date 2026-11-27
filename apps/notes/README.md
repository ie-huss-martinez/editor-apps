# Notes

Handwritten notes with a stylus, on notebooks of lined, grid, dotted or blank paper and on imported PDFs. Notes are kept in the browser, on the device, and never leave it.

The app is a thin shell around [`@hussmartinez/notes-sdk`](https://github.com/ie-huss-martinez/sdk-core/tree/main/packages/notes-sdk): the SDK's `NotesEditor` holds the library, the ink, saving, backup and restore, and the app adds its shell, theme, response headers, offline use and deployment ([ADR 0008](../../docs/adr/0008-a-notes-app-and-its-sdk.md)).

## How it differs from the other apps

- **The library shows the shell's header; an open notebook has the whole screen,** with no ad beside the page being written on. `NotesEditor`'s `onViewChange` tells the shell which view shows. The app has no ad slot for now: the slot lives in an editor's properties column, which the library doesn't have (docs/adr/0011).
- **No leave guard.** The SDK saves as you write, so leaving loses nothing.
- **It works offline and can be installed** ([ADR 0009](../../docs/adr/0009-offline-apps-with-a-service-worker.md)): the build writes a service worker that keeps every file of the build, and `public/manifest.webmanifest` makes it installable. Installing it matters most on Safari, which clears a site's storage after seven days without a visit unless it's on the home screen.
- **It asks the browser to keep its storage** (`navigator.storage.persist()`) once the library holds something, and the library offers it too.
- **The microphone is allowed for its own origin,** to record sound alongside the ink. The browser still asks the person first.

## Icons

`public/icon.svg` and `public/icon-maskable.svg` are the sources. The PNGs beside them are rendered from them in the browser test image, at 180, 192 and 512 pixels, for browsers that don't install from an SVG.

## Analytics

Anonymous, through PostHog, and only when the build has `VITE_POSTHOG_KEY` (see `.env.example`), as in the other apps ([ADR 0005](../../docs/adr/0005-analytics-and-consent.md)). With a key, the app sends one page view per load and notes-sdk's anonymous usage events, each tagged `app: "notes"`. They never carry a title, text, ink or a file's name.

## Develop

From the repository's root, with Node 24:

```sh
pnpm --filter @editor-apps/notes dev
pnpm --filter @editor-apps/notes build
pnpm --filter @editor-apps/notes test:e2e    # needs the build, and Docker
```

The smoke test checks what the app adds: its response headers, that it can be installed and opens offline, that an open notebook has the whole screen and keeps what's written across a reload, and that pdf-sdk's workers load from the app's own origin. Writing, erasing, undo, backup and restore are the SDK's to test, with real pen input.
