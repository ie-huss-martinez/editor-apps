# 0008. A notes app for handwriting, backed by a new notes SDK

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Huss wants a fifth app: handwritten notes with a stylus, on notebooks of paper templates and on imported PDFs, with the feature set people know from Goodnotes. In that kind of app, the features people use every day sit behind a subscription: more than a few notebooks, handwriting search, audio recording and AI help.

This app isn't like the other four. They open a file, edit it and export it, and keep nothing. A notes app is a library people come back to for months:

- **Notes live on the device.** If the browser deletes them, they're gone. Safari deletes a site's script-written storage after seven days without a visit unless the site is installed to the home screen.
- **The ink is the product.** People judge a notes app by how closely the line follows the pen. That depends on pressure, on the samples between frames and on the delay between pen and ink.
- **The shell assumes a document page.** Its header, its 160 × 600 ad slot ([ADR 0007](0007-the-ad-slot-contract.md)) and its leave guard ([ADR 0002](0002-app-shell-and-shared-look.md)) fit an editor with an export step, not a full-screen canvas that saves as you write.

## Decision

### A new app on a new SDK

- **`apps/notes`,** on the `notes` subdomain of the apps' domain. As ADR 0001 requires, the full address appears only in the app's `wrangler.jsonc` and `src/app.config.ts`.
- **`notes-sdk`,** a new package in the SDK family's monorepo. It holds the ink engine, the document model, the page templates and the storage adapters. It uses `pdf-sdk` to show and export PDFs, and later `audio-sdk`. Work on it starts once the family's move into one monorepo has landed, so it never exists as a separate repository.
- **The app stays a thin shell,** like the other four: what it adds is the shell, the theme, the response headers and deployment.

### Layout and assets

- **The layout follows the familiar pattern** of handwriting apps: a library of notebook covers, a toolbar across the top of an open notebook, and a sidebar of page thumbnails. These are the conventions of the category, and people switching apps expect them.
- **Every asset is our own.** None of Goodnotes' logo, name, icons, illustrations, paper templates, fonts, styles or screenshots is copied. Icons come from ui, colours and type from ui's tokens, and the paper templates are drawn for this app. Copying another product's distinctive look invites a takedown of the app or of this public repository.

### Everything stays on the device

- **The library is stored in the browser,** with notebooks in OPFS and an index in IndexedDB. There is no account and no server.
- **The app is an installable web app that works offline.** It asks the browser to keep its storage (`navigator.storage.persist()`), and explains in the library why installing it matters.
- **Backup and restore come in the first version:** the whole library, or one notebook, as a zip in the app's own versioned format. The app reminds people to back up when they haven't for a while.
- **Export to PDF** writes the ink as vector paths through `pdf-sdk`.

### The ink engine

- **Pointer events,** including the samples between frames (`getCoalescedEvents`) and where the pen is heading (`getPredictedEvents`), pressure and tilt.
- **Pressure-sensitive outlines** smoothed with `perfect-freehand` (MIT licence).
- **Two canvases:** a low-latency one (`desynchronized: true`) for the stroke being drawn, and one for finished strokes.
- **The pen writes, fingers pan and zoom,** told apart by pointer type, so a palm on the screen never draws. A pen's barrel button switches to the eraser while held, where the pen reports it.
- **The first device is an Android tablet with an active stylus, in Chrome.** Safari on iPad and desktop browsers follow. Chromium's test protocol can send pen input with pressure and tilt, so browser tests cover drawing, erasing and undo. How the ink feels is judged on the real device.

### The shell

- **A full-screen layout** in `app-shell` for the open notebook, with no header column taking width from the page.
- **The ad slot appears in the library only,** never beside a page someone is writing on.
- **No leave guard:** the app saves as you write, so there's nothing to lose by leaving.

### Two pull requests

Huss asked on 2026-11-23 for the whole app in as few steps and reviews as possible, so there's no separate prototype step:

1. **sdk-core:** `notes-sdk`, complete. That covers:
   - the library, with folders and no limit on notebooks;
   - blank, lined, grid and dotted templates;
   - pen, highlighter, and an eraser for whole strokes or parts of them;
   - a lasso to select, move, resize and recolour;
   - straightening of rough shapes, text boxes and images;
   - adding, reordering and deleting pages, page thumbnails, an outline and links between pages;
   - undo and redo, zoom and pan;
   - import a PDF, write on it and export it;
   - search in typed text and in PDFs' text;
   - audio recorded alongside the ink;
   - saving as you write, backup and restore.
2. **editor-apps:** the full-screen layout in `app-shell` and `apps/notes`, on the published `notes-sdk`.

How the ink feels is judged on the tablet from a preview build before the second pull request merges. Recognising handwriting and AI help on the device come later, each in its own pull request.

**Not planned:** cloud sync and live collaboration. Both need a server that holds people's notes, which breaks the family's promise that files never leave the device. Syncing to a folder the user chooses is the closest later step.

## Alternatives considered

- **A notebook mode in the PDF editor:** a library that persists notebooks, and an ink engine, don't belong in an editor that opens a file and exports it. Sharing `pdf-sdk` gets the PDF parts without that.
- **Building on a whiteboard library:** Excalidraw is MIT-licensed but has an endless canvas, not pages, and no PDF backgrounds. tldraw's SDK needs a licence key in production.
- **Notes stored on a server, for sync:** it means accounts and a backend holding private notes, against the promise every app in this repository makes.
- **An exact copy of Goodnotes' look:** it risks a takedown, and the app would look like a clone instead of part of this family.

## Consequences

- **A fifth app, and a ninth package in the SDK family,** each with its own tests and releases.
- **The shell gains a full-screen layout,** used by the notes app first and available to the other editors.
- **Losing notes is this app's worst failure.** Storage, backup and restore get tests of their own, including restoring a backup made by an older version of the format.
- **Some testing needs a real device.** CI checks behaviour; how the ink feels is checked by hand on the tablet before each release that touches the ink engine.
