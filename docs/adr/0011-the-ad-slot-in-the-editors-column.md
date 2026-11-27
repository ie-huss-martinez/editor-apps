# 0011. The ad slot in the editor's properties column

- **Status:** Accepted
- **Date:** 2026-11-27
- **Amends:** [ADR 0007](0007-the-ad-slot-contract.md), where the slot is placed; and [ADR 0008](0008-a-notes-app-and-its-sdk.md), where the notes app's slot is

## Context

[ADR 0007](0007-the-ad-slot-contract.md) placed the 160 × 600 slot in a column of its own after the editor, as an `<aside>` after `<main>`, on viewports of at least 1280 × 720.

With the SDK family's UX redesign (sdk-core ADR 0067), every editor renders through ui's `EditorFrame`, which has a properties panel at the inline end. A column after the editor would sit beside a second column of the editor's own, and take about 170 pixels more from the stage.

Huss decided on 2026-11-26 that the slot goes under the properties panel, in the same column, and on 2026-11-27 that it stays there when the panel is hidden or absent, on wide screens. Both are recorded in [sdk-core ADR 0067](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0067-editor-frame-modes-and-host-owned-preferences.md), under "Questions decided after acceptance". ui 0.17.1 gave the frame a region for it, `propertiesFooter`, and every SDK editor passes that prop through.

## Decision

This record amends ADR 0007's placement. Everything else in ADR 0007 stands: the 160 × 600 box at its final size, the app's own art labelled "Your ad here", `aria-hidden` and `inert` while it's a placeholder, never a tab stop, no request, no cookie and no new policy entry, and an app opting in with its art. The contract for a real ad's frame is unchanged.

### Where the slot is

- **In the editor's properties column, at its foot,** as the SDK editor's `propertiesFooter`. The app's `AdSlot` renders there, inside `<main>`, centred at the column's width and never stretched. The frame adds no landmark or tab stop of its own.
- **The shell renders no ad column.** `AppShell` loses its `ad` prop and its column after `<main>`. The editor takes the full width under the header, and the frame's column holds the slot.
- **An app opts in with `useAdSlot(art)`** from `app-shell`, and passes what it returns as its editor's `propertiesFooter`.

### When it shows

Two rules decide, one the host's and one the frame's.

- **The viewport, the host's rule:** the slot is rendered only on viewports of at least 1280 × 720, as ADR 0007 has it. `useAdSlot` reads `matchMedia` through `useSyncExternalStore`. Below that, it returns `null`: no slot at all, rather than an empty or CSS-hidden box, for which the frame would keep a column. The viewport is read during the first render, so a wide page has the slot from its first paint and a narrow one never shows it.
- **The frame's room, the frame's rule:**
  - With the panel shown, the slot sits under it while both fit the column's height. When they don't, the slot hides and the panel keeps the column.
  - With the panel hidden or absent, the column stays with just the slot, from a frame 60 rem wide. pdf-sdk's editor has no panel, so on a wide screen its column always holds just the slot.
  - The slot hides on a frame narrower than 60 rem without a panel, and narrower than 45 rem in any case.
  - While it's hidden, it stays mounted, so an ad isn't requested again each time the panel comes back.
- **A shown slot never moves or resizes,** which ADR 0007 requires: it's at the foot of the column at its fixed size, or it's hidden.

### The notes app: beside the page, like the other editors

- [ADR 0008](0008-a-notes-app-and-its-sdk.md) put the notes app's slot in its library only, never beside a page someone is writing on. The library has no editor frame, so there's no column to hold the slot there.
- **Huss decided on 2026-11-27, after trying the previews,** that the notes app shows the slot beside the page too, like the other editors: the open notebook passes it to its frame's `propertiesFooter`. This replaces ADR 0008's "the ad slot appears in the library only". The library has no slot.
- Under the pen's options, the slot fits from a viewport about 1,000 pixels high. With the properties hidden, it keeps the column on its own, as in the other editors.

## Alternatives considered

- **Keeping the column after the editor:** two columns at the inline end, and a stage about 170 pixels narrower, against Huss's decision.
- **Rendering the slot always and hiding it with CSS below 1280 × 720:** the frame can't tell a hidden box from a visible one, so it would keep a column for nothing.
- **No slot in the notes app,** as first written here: ADR 0008 kept ads away from the page, and the library has no column. Huss chose the notebook's column instead.

## Consequences

- **The editor has the full width under the header.** The slot's column is the frame's own, 288 pixels wide at the default inspector width, beside the stage instead of after the editor.
- **The slot shows on fewer screens than 1280 × 720.** Under the header and the frame's top bar, the column is shorter than the viewport. At 1280 pixels wide, it has room for 600 pixels from about 760 pixels high in the image and PDF editors, and about 820 in the audio editor. In the video editor with a clip open, whose timeline also takes height, it needs 900. The host's rule decides only whether the slot exists; the frame decides whether it fits.
- **Screenshot tests take the page at 1440 × 900,** where the slot shows in every app that has one. A check in every engine asserts its size, its place at the foot of the frame's inline-end column, and that there's no slot below 1280 × 720.
- **The notes app's slot moves from the library to the open notebook,** where it needs the most height: about 1,000 pixels under the pen's options, less with the panel hidden.
