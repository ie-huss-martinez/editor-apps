import { createAnalytics } from "@editor-apps/analytics";
import type { EditorPreferences } from "@hussmartinez/ui";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AnalyticsContext } from "./analytics.ts";
import {
  createPreferencesStore,
  PreferencesContext,
  shellDefaultPreferences,
} from "./preferences.ts";
import { preferencesKey } from "./preferences-key.ts";

export interface StartOptions {
  /** The app's name, which every analytics event carries as `app` (docs/adr/0005). */
  readonly app: string;
  /** PostHog's public key and host, from the app's build. Without a key, nothing is sent. */
  readonly analytics: { readonly key: string | undefined; readonly host: string };
  /** Renders the app: usually {@link AppShell} around the SDK's editor. */
  readonly render: () => ReactNode;
  /** Where to render. Defaults to `#root`. */
  readonly root?: HTMLElement;
  /**
   * Registers the service worker that the build's `offline` option writes
   * (docs/adr/0009), so the app opens without a network. Where there's no
   * service worker to register, as on the dev server, nothing happens.
   */
  readonly offline?: boolean;
  /**
   * The app's editor preferences for a first visit, over the shell's Easy
   * mode (docs/adr/0010), such as `{ toolsLayout: "dock" }`. Every field
   * left out is ui's default.
   */
  readonly defaultPreferences?: Partial<EditorPreferences>;
}

/** The service worker's address, at the root so it serves the whole app. */
const SERVICE_WORKER = "/sw.js";

/**
 * Starts an app the same way in every app: its analytics, with one page
 * view per load, and its editor preferences, kept in `localStorage` under
 * the app's key (docs/adr/0010), then the app, in React's strict mode, with
 * both in context for {@link useAnalytics}, {@link useEditorPreferenceProps}
 * and the error boundary.
 */
export function startApp({
  app,
  analytics: { key, host },
  render,
  root,
  offline = false,
  defaultPreferences,
}: StartOptions): void {
  const analytics = createAnalytics({ app, key, host });
  analytics.pageView();
  const preferences = createPreferencesStore({
    key: preferencesKey(app),
    defaults: { ...shellDefaultPreferences, ...defaultPreferences },
  });
  const element = root ?? document.getElementById("root");
  if (!element) throw new Error("The page has no #root element.");
  createRoot(element).render(
    <StrictMode>
      <AnalyticsContext.Provider value={analytics}>
        <PreferencesContext.Provider value={preferences}>{render()}</PreferencesContext.Provider>
      </AnalyticsContext.Provider>
    </StrictMode>,
  );
  if (offline && "serviceWorker" in navigator) {
    // Once the page has loaded, so keeping the files never competes with it.
    // A failure only means no offline copy this time: the app works without.
    const register = () =>
      void navigator.serviceWorker.register(SERVICE_WORKER, { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}
