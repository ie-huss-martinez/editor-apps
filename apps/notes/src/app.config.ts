import type { Engine } from "@editor-apps/build-config/playwright";

/**
 * What this app declares about itself. With `wrangler.jsonc`, it's the only
 * place the app's domain appears (docs/adr/0001).
 */
export const appConfig = {
  /** The app's public address, for its canonical link. */
  url: "https://notes.forfreedom.app/",
  /**
   * The browsers the app supports and is tested in. The first is the one
   * pull requests test in: the first device is an Android tablet in Chrome
   * (docs/adr/0008).
   */
  engines: ["chromium", "firefox", "webkit"] satisfies Engine[],
  /** The app's name, which every analytics event carries as `app` (docs/adr/0005). */
  app: "notes",
  /** The app's name, the page's one `<h1>`, and the line under it. */
  title: "Notes",
  tagline: "Handwritten notes in your browser. Notes never leave this device.",
  /** Where analytics events go when the build has a key (docs/adr/0005). */
  analyticsHost: "https://eu.i.posthog.com",
} as const;
