# 0009. Offline apps, with a service worker the build writes

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

[ADR 0008](0008-a-notes-app-and-its-sdk.md) makes the notes app an installable web app that works offline. People open their notes on a train, and Safari clears a site's storage after seven days without a visit unless it's installed to the home screen. Installing needs a manifest, and opening without a network needs a service worker that keeps the app's files.

No app here has one yet. The usual tool, `vite-plugin-pwa` with Workbox, would add a dependency tree to every build, a runtime the apps don't need, and generated code that's hard to review. The apps' needs are small: every file of a build is known when the build ends, nothing is fetched from another origin, and the policy allows no inline code.

## Decision

- **The build writes the service worker.** `editorApp({ offline: true })` writes `sw.js` at the end of the build, after the SDK's assets are copied in. It lists every file the build holds, apart from Cloudflare's `_headers` and itself, with `index.html` listed as `/`, because Cloudflare answers `/index.html` with a redirect and a service worker may not answer a page with one.
- **One cache per build,** named after a digest of the build's files and their contents. The worker keeps every file when it installs. If one can't be fetched, the install fails and the previous build's worker stays in charge.
- **A new build takes over only when every tab of the old one has closed.** Its worker doesn't skip waiting, so a page never finds the files it was built with gone. Activating deletes older builds' caches.
- **Pages come from the network first,** so a deploy shows at once, and from the cache when there's no network. **Files come from the cache first,** and from the network for anything it doesn't hold. Requests to other origins, such as analytics, and anything but `GET` pass through untouched.
- **The worker is plain JavaScript with no import and no inline code,** so the policy needs nothing new: `worker-src 'self'` and `script-src 'self'` already cover it.
- **`startApp({ offline: true })` registers it** once the page has loaded. A failed registration is silent: the app works without it, only not offline.
- **The manifest and icons are the app's own files** in `public/`, with SVG sources and PNGs rendered from them.

## Alternatives considered

- **`vite-plugin-pwa` and Workbox:** a dependency tree, runtime strategies and options the apps don't use, and generated code to audit, for what is a list of files and three event handlers.
- **Caching as files are fetched, instead of all at install:** smaller first visits, but a notebook opened offline would miss the PDF engine if no PDF had been opened online, and a notes app that works offline only sometimes is worse than one that says it doesn't.
- **Skipping the waiting phase,** so a deploy takes over at once: an open tab would then ask for a chunk of its own build that the new cache no longer holds.

## Consequences

- **The first visit downloads the whole build, about 8 MB for the notes app,** once per deploy and after the page has loaded. Six of those are pdf-sdk's PDF engine, its fonts and its character maps, which a PDF opened offline needs. Later visits fetch nothing they hold.
- **A deploy reaches an installed app on its next start after every tab is closed,** not mid-session.
- **Any app can go offline** with `offline: true` in its build and in `startApp`. Only the notes app does so far.
- **The smoke test checks it:** after one visit, the app opens with the network off, in Chromium.
