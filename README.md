# editor-apps

Five browser-only apps in one repository: editors for PDF, audio, image and video files, and handwritten notes. Files and notes never leave the device.

Each app is a thin shell around an editor SDK of the [`@hussmartinez`](https://www.npmjs.com/org/hussmartinez) family: the SDK opens, edits and exports; the app adds its header, theme, response headers and deployment.

> Status: being set up. The workspace, its tooling and CI are here; the apps are moving in from their own repositories, one pull request each.

## Layout

| Path                     | What it holds                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/<app>/`            | One app each: `pdf`, `audio`, `image`, `video` and `notes`                                                                                              |
| `packages/build-config/` | Build and test helpers: the response headers and Content Security Policy, the Vite plugin with the theme script and the service worker it writes, and the repository's own checks. Private, never published |
| `packages/analytics/`    | Anonymous analytics through PostHog, shared by the apps: a page view per load and the SDKs' events. Private, never published                       |
| `packages/app-shell/`    | The page around every editor: header, skip link, error boundary, leave guard, ad slot, a full-screen layout, ui's providers, the editor's preferences, and start-up. Private, never published |
| `docs/adr/`              | The decisions behind the repository                                                                                                                     |
| `docs/deploy.md`         | How the apps deploy, and the settings that live outside the repository                                                                                  |
| `ci/Dockerfile`          | The pinned Playwright image for browser tests                                                                                                           |

## Develop

Use Node 24. pnpm switches to the version pinned in `package.json` by itself.

```sh
pnpm install
pnpm verify
```

`pnpm verify` runs everything CI runs without a browser:

| Step                                                                              | Script                        |
| --------------------------------------------------------------------------------- | ----------------------------- |
| Format and lint, with Biome and stylelint, and no hidden characters               | `pnpm lint`                   |
| Types                                                                             | `pnpm typecheck`              |
| Unit tests, with Vitest                                                           | `pnpm test`                   |
| One copy of each shared package in each app, and one ui and sdk-core for all apps | `pnpm check:single-copy`      |
| No domain outside app configuration                                               | `pnpm check:domains`          |
| Playwright pinned to the image's version                                          | `pnpm check:playwright-image` |

`pnpm install` also sets up git hooks, as in the SDK repositories, from `@hussmartinez/sdk-config`'s presets:

- **On commit,** staged files get a secret scan, a hidden-character check and Biome's safe fixes, and CSS gets stylelint.
- **On the commit message,** commitlint checks it's a Conventional Commit.
- **On push,** `pnpm verify:fast` runs the checks above except lint. The commit hook lints only the files it stages, so a change elsewhere, such as to a lint configuration, is caught by the full `pnpm lint`, which `pnpm verify` and CI run.

CI also builds each app a change affects, checks that it would deploy, and runs its smoke test in the pinned image. `pnpm affected <base>` prints which apps those are. To run an app's smoke test locally, build it, then run `pnpm --filter @editor-apps/<app> test:e2e`, which needs Docker.

## Rules

- **Nothing is named after a domain.** A domain appears only in an app's `wrangler.jsonc` and `src/app.config.ts`.
- **Every build lists its third-party software** in `third-party-licenses.txt`, at the site's root, generated from what the build bundles, with each package's licence and notices word for word.
- **No secrets, ever.** The repository is public, and deploy credentials exist only in Cloudflare.
- **Shared tools are pinned once,** in the catalog of `pnpm-workspace.yaml`, with ui and sdk-core: one version for every app. Each app pins its own SDK exactly.
- **Test what the app adds, not what its SDK does** ([ADR 0003](docs/adr/0003-testing-and-playwright.md)).
- **Pull requests are small, with a Conventional Commit title,** and are squash-merged once the `ci` check is green. See [NEXT_STEPS.md](NEXT_STEPS.md) for what's planned.

## License

[Apache-2.0](LICENSE). See [NOTICE](NOTICE).
