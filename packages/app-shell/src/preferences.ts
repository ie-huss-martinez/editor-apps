import { type EditorPreferences, readEditorPreferences } from "@hussmartinez/ui";
import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * The shell's defaults for a first visit, under an app's own (docs/adr/0010):
 * Easy mode in every app. Every other field is ui's default.
 */
export const shellDefaultPreferences: Partial<EditorPreferences> = { mode: "easy" };

/**
 * The editor preferences of one app, kept in `localStorage` under one key
 * (sdk-core ADR 0067, docs/adr/0010). The editor never stores them itself.
 */
export interface PreferencesStore {
  /** The preferences in effect: what was stored, or the defaults. */
  readonly get: () => EditorPreferences;
  /** Keeps new preferences, applies their theme to the page, and tells subscribers. */
  readonly set: (preferences: EditorPreferences) => void;
  /** Calls `listener` after every change, here or in another tab. Returns an unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
}

export interface PreferencesStoreOptions {
  /** The `localStorage` key, from `preferencesKey`. */
  readonly key: string;
  /** The preferences of a first visit, for each field nothing valid is stored for. */
  readonly defaults: Partial<EditorPreferences>;
  /** Where they're kept. Defaults to `localStorage`; missing when storage is blocked. */
  readonly storage?: Storage | undefined;
  /** The element whose `data-hm-theme` follows the theme. Defaults to `<html>`. */
  readonly root?: Element;
}

/** `localStorage`, or `undefined` where reading it throws, as with storage blocked. */
function localStorageOrNone(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Sets the page's theme as the build's theme script does before first
 * paint: `light` or `dark` on `<html>`, and nothing for `system`, which
 * then follows `prefers-color-scheme`.
 */
function applyTheme(root: Element, theme: EditorPreferences["theme"]): void {
  if (theme === "system") root.removeAttribute("data-hm-theme");
  else root.setAttribute("data-hm-theme", theme);
}

/**
 * Keeps an app's editor preferences in `localStorage` (docs/adr/0010).
 *
 * - **Reading never fails:** a missing, unreadable or invalid value, or a
 *   field of one, gets its default, through ui's `readEditorPreferences`.
 * - **Saving never fails:** a full or blocked storage only means the choice
 *   isn't kept for the next visit.
 * - **The page's theme follows:** `<html>`'s `data-hm-theme`, so the shell
 *   around the editor matches it.
 * - **Other tabs of the app follow** through the `storage` event.
 *
 * Nothing is sent anywhere, and no cookie is set.
 */
export function createPreferencesStore({
  key,
  defaults,
  storage = localStorageOrNone(),
  root = document.documentElement,
}: PreferencesStoreOptions): PreferencesStore {
  const listeners = new Set<() => void>();

  const load = (): EditorPreferences => {
    let stored: unknown = null;
    try {
      stored = JSON.parse(storage?.getItem(key) ?? "null");
    } catch {
      // Not JSON, or storage refused the read: the defaults apply.
    }
    return readEditorPreferences(stored, defaults);
  };

  const update = (next: EditorPreferences) => {
    current = next;
    applyTheme(root, next.theme);
    for (const listener of listeners) listener();
  };

  let current = load();
  applyTheme(root, current.theme);

  // Another tab of the same app changed them: follow it.
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== storage || (event.key !== key && event.key !== null)) return;
    update(load());
  });

  return {
    get: () => current,
    set: (preferences) => {
      const next = readEditorPreferences(preferences, defaults);
      try {
        storage?.setItem(key, JSON.stringify(next));
      } catch {
        // Quota exceeded or storage blocked: kept for this visit only.
      }
      update(next);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app's preferences, kept by {@link startApp}. */
export const PreferencesContext = createContext<PreferencesStore | null>(null);

/** What an SDK editor takes to have its preferences kept by the app. */
export interface EditorPreferenceProps {
  readonly preferences: EditorPreferences;
  readonly onPreferencesChange: (preferences: EditorPreferences) => void;
}

/**
 * The editor's `preferences` and `onPreferencesChange`, kept in the app's
 * `localStorage` (docs/adr/0010). Spread them on the SDK's editor:
 *
 * ```tsx
 * <ImageEditor {...useEditorPreferenceProps()} />
 * ```
 *
 * @throws `Error` outside an app started with {@link startApp}.
 */
export function useEditorPreferenceProps(): EditorPreferenceProps {
  const store = useContext(PreferencesContext);
  if (!store) throw new Error("useEditorPreferenceProps needs an app started with startApp.");
  const preferences = useSyncExternalStore(store.subscribe, store.get, store.get);
  return { preferences, onPreferencesChange: store.set };
}
