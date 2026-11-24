# Next steps

What's planned, in order. One pull request at a time. The decisions behind each step are in `docs/adr/`.

## Done

- [x] **The decision records** (2026-11-18): `docs/adr/0001` to `0006`.
- [x] **The scaffold** (2026-11-18): the workspace and its pinned tools, `packages/build-config` with the response headers, the Vite plugin and the repository's checks, the CI workflow, Dependabot and the code owners.

## Before the first app

- [x] **A licence** (2026-11-19): Apache-2.0, in `LICENSE`, with the copyright in `NOTICE`.
- [x] **Branch protection on `main`,** with `ci` as the required check (2026-11-18).

## Import the apps

One pull request per app, each as one import commit that names the private repository and the commit it came from.

- [x] **audio** (2026-11-19)
- [x] **video** (2026-11-19)
- [x] **image** (2026-11-19)
- [x] **pdf** (2026-11-19)

For each app:

- **Review every file as public text first.** Machine paths, credential file locations, runner details and Cloudflare Access policy names don't come along.
- **Leave the old widget code behind.**
- **Move it onto `build-config`:** the `editorApp` Vite plugin replaces the app's own `_headers`, headers code and asset copying.
- **Trim its tests to the rule in ADR 0003,** and list in the pull request what was dropped and why.
- **It must build, pass its smoke test in the pinned image, and pass `wrangler deploy --dry-run`.**

After the imports, the reviewer points each Worker's Workers Builds connection at this repository, and the old repositories are archived.

## Then

- [x] **`packages/app-shell`:** the shared page, error boundary and messages in all four apps, with screenshot tests of its header (ADR 0002).
- [x] **The leave guard,** in the shell: the browser's own warning before leaving with unexported edits, from each SDK's events (ADR 0002).
- [x] **Clear the guard on download, not on export,** in image, audio and video, from their SDKs' download events (ADR 0002).
- [x] **The ad slot,** in the shell: a fixed 160 × 600 placeholder with each app's own art (ADR 0007).
- [ ] **Real ads:** the isolated frame of ADR 0006 in the slot, under ADR 0007's contract. It needs a domain on a separate site first.

## One ui version for every app

Done on 2026-11-19: every app bundles one ui and one sdk-core, set in the pnpm catalog, and `pnpm check:single-copy` fails if the apps ever differ (ADR 0001).

- [x] **The SDKs converge on one ui minor,** and `app-shell` may use all of it.
- [x] **ui and sdk-core in the pnpm catalog:** one line sets them for every app; a new minor also needs every SDK to accept it and app-shell's peer range moved (ADR 0001). The check stays as a guard.

## A notes app

A fifth app for handwritten notes, on a new `notes-sdk` (ADR 0008). Two pull requests.

- [x] **The decision record** (2026-11-23): ADR 0008.
- [x] **`notes-sdk`, complete,** in sdk-core, then released (2026-11-24): sdk-core #210, published as 0.1.0.
- [ ] **The full-screen layout in `app-shell` and `apps/notes`,** installable and offline (ADR 0009), after the ink is judged on the tablet from a preview build, then the Worker connected to Workers Builds.
