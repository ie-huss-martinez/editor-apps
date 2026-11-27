# 0007. The ad slot: a fixed size now, a sandboxed frame later

- **Status:** Accepted; the slot's placement amended by [ADR 0011](0011-the-ad-slot-in-the-editors-column.md), which puts it in the editor's properties column
- **Date:** 2026-11-19

## Context

[ADR 0006](0006-ads-in-an-isolated-origin.md) decides that ads run only in a sandboxed frame from a separate site, and that the shell's slot renders nothing until ads start. Two things argue for reserving the space now instead:

- **Layout shift.** If the slot appears only when ads start, every app's layout changes on that day, and an ad that loads late pushes the editor aside on every visit. A slot that's there from the start, at its final size, moves nothing.
- **The shape of the page.** People get used to where the editor ends. Ads that arrive in a space that was always there are less of a surprise than ads that take space away.

Huss approved a placeholder in the slot until then: original art for each app, labelled as a place for an ad.

## Decision

This record supersedes two points of ADR 0006, both about the slot's size:

- **Until ads start,** the slot shows a placeholder rather than nothing.
- **An empty slot keeps its size.** The frame's "no ad" message brings back the placeholder instead of collapsing the slot. The message itself, and the shell's checks of its origin and shape, stay as ADR 0006 has them.

Everything else in ADR 0006 stands.

### The slot

- **One size: 160 × 600 pixels,** the IAB's wide skyscraper, in a column after the editor. It's the standard size that takes the least width from the editor. The box has that size whether it holds a placeholder or an ad, so nothing moves when one replaces the other.
- **Shown only on screens at least 1280 pixels wide and 720 high,** where the editor keeps more than 1,000 pixels of width and the box fits under the header. On smaller screens the slot isn't displayed, and the editor takes the whole width. Phones and small laptops get no ad.
- **Outside the editor's area:** an `<aside>` after `<main>`, never over the editor, in a dialog, or between an export and its download.
- **Never a tab stop.** The skip link goes straight to the editor.
- **An app opts in** by passing its art to `AppShell` as `ad`. Without it, there's no slot.

### The placeholder, until ads start

- **Original art for each app,** as inline SVG in the app's `src/AdArt.tsx`: waveforms and a cassette for audio, a film strip for video, a camera and a palette for image, a stack of pages for pdf. It's drawn with the shell's `app-ad-*` classes, which use ui's tokens only, so it follows each brand and light or dark mode.
- **Labelled "Your ad here"** in the shell's message catalogue.
- **Decorative:** the slot is `aria-hidden` and `inert`. It carries no information a screen reader user would miss.
- **Self-contained:** no request, no new Content Security Policy entry, no cookie. The shell's rule of making no network request by itself ([ADR 0002](0002-app-shell-and-shared-look.md)) holds.

### The real ad, when ads start

These follow from ADR 0006, and are what the slot's contract promises the ad frame:

- **An `<iframe>` of exactly 160 × 600** in the same box, from the ad app's origin on a separate site. That site isn't chosen yet. Its origin will be set in each app's configuration, which is the only place a domain may appear ([ADR 0001](0001-one-repository-and-its-layout.md)).
- **`sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`,** as ADR 0006 has it. `allow-same-origin` together with `allow-scripts` is safe only because the frame's origin is never an editor's. A frame that could end up on an editor's origin must not get both. It never gets `allow-top-navigation`, `allow-forms`, `allow-downloads` or `allow-modals`. Its `allow` attribute is empty, and `referrerpolicy="no-referrer"`, so the ad network learns which app it's in only from the frame's URL.
- **A `title` of "Advertisement"** on the frame, and the slot is no longer `aria-hidden`. A real ad is content, and is labelled as one.
- **`loading="lazy"`,** and **no frame at all without consent** where consent is required.
- **The editor's policy gains one `frame-src`** with the frame's origin, through build-config's `adFrame` option, which exists already.
- **An empty slot stays the same size.** If the frame reports "no ad", the slot shows the placeholder again rather than collapsing, so the layout never moves. This replaces ADR 0006's collapse.

## Alternatives considered

- **Nothing until ads start,** as ADR 0006 had it: the layout changes on the day ads start, and a late ad shifts the page.
- **A 728 × 90 leaderboard under the header:** it takes 90 pixels of height from editors that need all of it, such as video's timeline, and it's too wide for any screen narrower than 760 pixels.
- **A 300 × 250 rectangle beside the editor:** it takes nearly twice the width for a shorter ad.
- **A placeholder with an accessible name:** it would announce an advertisement that isn't there on every visit.
- **The art in the shell, chosen by file type:** the shell would have to know the apps' file types, which ADR 0002 keeps out of it.

## Consequences

- **The editor is about 170 pixels narrower** on wide screens: the box and its margin. On smaller screens nothing changes.
- **The page doesn't move when ads start,** or when an ad loads late.
- **Screenshot tests cover the slot** in light and dark for every app, alongside the header, and check its size. A change to an app's art changes that app's two screenshots.
- **Starting ads is a change in one place:** the shell renders the frame instead of the art, under the contract above, once the separate site exists.
