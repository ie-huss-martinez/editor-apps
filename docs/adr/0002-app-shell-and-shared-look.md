# 0002. One app shell, so the four apps look and behave alike

- **Status:** Accepted, amended 2026-11-19 (twice); the theme's "following the system" superseded by [ADR 0010](0010-editor-preferences-and-the-page-theme.md)
- **Date:** 2026-11-18

## Context

Each app wraps its SDK's editor in a page of its own. The four pages were written separately, and they differ in ways nobody chose:

- **Structure:** some have a header and a tagline, some only the editor. Not all have exactly one `<h1>`, a `<main>` landmark and a skip link.
- **Theme:** each has its own brand colours on ui's tokens, built in its own way: a virtual stylesheet in one app, a build script in another.
- **Failure:** each has its own error boundary, with its own wording.
- **Text:** shell strings are written inline in some apps, and in a message catalogue in others.

People who use one editor should recognise the next. And features that are coming, such as consent, analytics, a leave guard and an ad slot, belong around the editor, the same way in every app.

## Decision

`packages/app-shell` provides the page around the editor. Each app renders `<AppShell>` with its SDK's editor inside, and passes its configuration.

### What the shell owns

- **The page's structure:** a skip link to the editor, a header with the app's name as the only `<h1>`, the `<main>` landmark that holds the editor at full height, and a footer.
- **The error boundary:** a crashed editor is replaced by a short explanation and a way to reload, never a blank page or a stack trace. It says plainly that unsaved edits are lost and that the file on the device is untouched.
- **The theme:** one set of brand tokens on ui's, with `createTheme`, in light and dark, following the system. Every app has the same look, apart from an accent colour it may set. The build writes the theme as a static stylesheet with `themeToCss`, so pages need no inline `<style>` and the Content Security Policy needs no nonce.
- **ui's providers,** once: messages and the announcer.
- **Consent, analytics and the ad slot,** as [ADR 0005](0005-analytics-and-consent.md) and [ADR 0006](0006-ads-in-an-isolated-origin.md) decide.
- **The leave guard:** a warning before leaving the page with unsaved edits. The app tells the shell whether there are any, from its SDK's change events.
- **The shell's text,** in a message catalogue built with sdk-core's `createMessages`, never inline. The header, the footer, the error boundary, the consent banner and the leave guard take their words from it.

### What an app owns

- **`app.config.ts`:** the app's name and tagline, its canonical URL, its accent colour, its analytics provider, the browsers it supports, and where its SDK's assets are served.
- **`App.tsx`:** the SDK's editor, with the props that SDK needs, inside the shell.
- **Anything specific to its file type,** such as accepted formats.

The shell never imports an SDK. It knows nothing about PDFs or audio: an app hands it a React node and a few callbacks.

### Rules for the shell

- **It's built from ui's components and tokens,** with plain CSS in its own cascade layer. It adds no styling library.
- **It uses ui, sdk-core and React as peer dependencies,** so it runs on each app's own copy ([ADR 0001](0001-one-repository-and-its-layout.md)).
- **It makes no network request and sets no cookie by itself.** Only the analytics adapter and the ad slot can, and only when an app configures them.
- **It meets WCAG 2.2 AA:** landmarks, one `<h1>`, a visible focus ring, a skip link, text from the catalogue, and no motion that ignores `prefers-reduced-motion`.
- **It contains no domain.** Links and URLs come from the app's configuration.
- **Errors shown to people come from a message catalogue by error code,** never from an error's `message`.

### Keeping the apps alike

Screenshot tests of the shell, in light and dark, run for every app against its built output ([ADR 0003](0003-testing-and-playwright.md)). They cover the shell's own states: the empty page, the error boundary and the consent banner. A change to the shell that alters one app's look alters four sets of screenshots in the same pull request, which is the point.

## Alternatives considered

- **A shared stylesheet only:** it aligns colours, and leaves structure, the error boundary and consent to be written four times.
- **Publishing the shell to npm:** useful to others only in theory, and it would put a release between a shell change and the apps.
- **Putting the shell into ui:** ui is the design system of the SDKs, and knows nothing about consent, analytics or ads, which are these apps' business.
- **Each app keeping its own brand:** four small brands for one family of tools, and four themes to keep at AA contrast.

## Consequences

- **A person moving between the editors finds the same page,** with the same header, footer, theme and wording.
- **Shell features are built once,** and an app gets them by upgrading nothing.
- **A shell bug is in four apps at once,** so shell changes get the fuller review tier and the screenshot tests.
- **An app can't restyle its page freely.** A need that the shell doesn't cover becomes a shell option, or a new record.

## Amendment, 2026-11-19: the shell as built

Huss approved building the shell with these changes to the decision above. Where they differ, this section wins.

- **Each app keeps its own brand theme.** Its `theme.ts` and `virtual:theme.css` stay in the app; the shell styles itself with ui's tokens only, so each brand and light or dark mode apply. One shared theme is no longer the aim. An app keeps only its theme, its `app.config.ts` (now with `title` and `tagline`) and its SDK's editor.
- **The entry is `startApp`.** It creates the app's analytics ([ADR 0005](0005-analytics-and-consent.md)), sends the one page view, and renders the app with the analytics in context. The app's `App` passes `useAnalytics().editorEvent` to its editor's `onEvent`. `packages/analytics` stays a package of its own, which the shell depends on.
- **The error boundary:** React logs the caught error to the local console, which is what a person needs to report a bug. Its text is never sent anywhere, because it can carry text from the file. Analytics gets one anonymous `component_error` event, with no message or stack, so crashes can be counted. Image's silent `onCaughtError` is gone.
- **An optional status line** in the header, as an `<output>`, for live text about the open document such as pdf's name and page count. File names are rendered only as text.
- **No footer yet.** Nothing needs one; the ad slot comes with its own record.
- **Screenshot tests cover the shell's header only,** in light and dark, in Chromium in the pinned image, with `expectShellLook` from build-config, which also checks that the skip link reaches the editor. Comparing the whole page would make every SDK upgrade, Dependabot's included, change four sets of screenshots. The error boundary is covered by the shell's unit tests, since a built app has no way to crash on purpose.
- **One copy of React, ui and sdk-core per bundle,** not only per lockfile. A workspace package resolves its own development copies, so `editorApp` sets Vite's `resolve.dedupe` for them, and the build fails if it bundles two versions of any family package or React.
- **The visual change is deliberate:** every app gets the same compact header, with the app's name, its tagline and an optional status. Video loses its mark, image its eyebrow and changing status, and pdf its eyebrow, serif title and narrow masthead. The editors keep their own look; the space around them is now the same in every app.

## Amendment, 2026-11-19: the leave guard

Huss approved the leave guard as follows. It refines "The leave guard" above.

- **The browser's own prompt only.** While there are unexported edits, the shell's `beforeunload` listener calls `preventDefault()`. It sets no text, since browsers ignore it, and it adds no dialog of its own. The listener exists only while the guard is armed, so an untouched page stays eligible for the back/forward cache.
- **Armed after an edit, cleared once the file is downloaded** (for pdf, once it's exported, which downloads it at once). Opening a new document or closing one also clears it. Undoing back to the opened document doesn't: the shell doesn't compare documents, so it may ask once too often, never once too few.
- **The signal is each SDK's `onEvent`,** the anonymous events the apps already send to analytics, because every SDK has them and none of them change the download. `onExport` can't serve: in every SDK it replaces the browser's download. `onChange` isn't in every SDK either: video-sdk has none.
- **The shell knows no SDK.** `AppShell` takes `unsaved`, and `useEditorEvents(unsavedAfter)` gives the editor's `onEvent`, which forwards each event to analytics and keeps `unsaved` current. Each app's `unsavedAfter` says what its SDK's events mean: `true` after an edit, `false` once the file is downloaded, or after an open or a close, and nothing for a failure or a cancelled step.

| App   | Arms the guard                                   | Clears it                                                      |
| ----- | ------------------------------------------------ | -------------------------------------------------------------- |
| pdf   | `pages_inserted`, `command`, `undo`, `redo`      | `document_opened`, `document_exported`, `document_closed`      |
| audio | `recording_inserted`, `command`, `undo`, `redo`  | `recording_opened`, `recording_downloaded`, `recording_closed` |
| image | `insert`, `execute`, `undo`, `redo`, when `done` | `open`, `download`, when `done`                                |
| video | `insert`, `execute`, `undo`, `redo`, when `done` | `open`, `download`, when `done`                                |

- **Exported, but not downloaded: closed by the SDKs' download events.** pdf saves the file as soon as it's built, so its export event means the file is downloaded. Image, audio and video build the file in their export dialog and then wait for its Download button. Their SDKs now send a download event when that button hands the file to the browser: image-sdk 0.10's `download`, video-sdk 0.8.1's `download` and audio-sdk 0.9's `recording_downloaded`. The guard clears on that event, and building the export changes nothing, so a person who exports and leaves without pressing Download is still asked. The event marks the request to the browser, not a confirmed save: the browser may still ask where to save, and the person may cancel. The apps don't take over the download to confirm it. The file holds the work as it was when the export started; the export dialog is modal, so the apps' pages can't change the work between the export and its Download. (Corrected 2026-11-21. Before those releases, the guard cleared on the export event, which left that gap open.)
- **Video arms the guard as soon as a clip is added,** since adding clips is how a video is made. Opening a file in place of everything, with video-sdk 0.5's `open`, clears it, as audio's does, since it clears the history too. Its mapping is an exhaustive `switch`, so a new event type fails to type-check until it's placed. (Corrected 2026-11-19, with video-sdk 0.5.0: before it, video-sdk had no `open` event.)
- **Tests:** the shell's unit tests check the guard and `useEditorEvents` with a cancelable `beforeunload`; each app's round trip checks the guard is off after opening, on after an edit, and off after the export, in every browser it's tested in.
