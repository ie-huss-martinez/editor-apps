// @vitest-environment happy-dom
import type { EditorPreferences } from "@hussmartinez/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPreferencesStore,
  type EditorPreferenceProps,
  PreferencesContext,
  shellDefaultPreferences,
  useEditorPreferenceProps,
} from "./preferences.ts";
import { preferencesKey } from "./preferences-key.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = preferencesKey("image");
const html = document.documentElement;

afterEach(() => {
  localStorage.clear();
  html.removeAttribute("data-hm-theme");
  document.body.innerHTML = "";
});

function store(defaults: Partial<EditorPreferences> = shellDefaultPreferences) {
  return createPreferencesStore({ key: KEY, defaults });
}

/** A storage whose every call throws, as a blocked or full one does. */
function refusingStorage(): Storage {
  const refuse = () => {
    throw new DOMException("refused", "QuotaExceededError");
  };
  return {
    length: 0,
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
}

describe("preferencesKey", () => {
  it("is one key per app", () => {
    expect(preferencesKey("notes")).toBe("editor-preferences:notes");
    expect(preferencesKey("pdf")).not.toBe(preferencesKey("notes"));
  });
});

describe("createPreferencesStore", () => {
  it("starts a first visit in Easy mode, following the system's theme", () => {
    const preferences = store().get();
    expect(preferences).toMatchObject({ mode: "easy", theme: "system", toolsLayout: "sidebar" });
    expect(html.hasAttribute("data-hm-theme")).toBe(false);
  });

  it("takes an app's own defaults over the shell's", () => {
    const preferences = store({ ...shellDefaultPreferences, toolsLayout: "dock" }).get();
    expect(preferences).toMatchObject({ mode: "easy", toolsLayout: "dock" });
  });

  it("reads what was kept, and sets its theme on the page", () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "expert", theme: "dark" }));
    expect(store().get()).toMatchObject({ mode: "expert", theme: "dark" });
    expect(html.getAttribute("data-hm-theme")).toBe("dark");
  });

  it.each([
    ["text that isn't JSON", "{not json"],
    ["a number", "42"],
    ["a list", "[1, 2]"],
    ["JSON null", "null"],
  ])("reads %s as a first visit", (_, value) => {
    localStorage.setItem(KEY, value);
    expect(store().get()).toMatchObject({ mode: "easy", theme: "system" });
    expect(html.hasAttribute("data-hm-theme")).toBe(false);
  });

  it("gives each invalid field its default and keeps the valid ones", () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "wizard", theme: "light", tools: 3 }));
    expect(store().get()).toMatchObject({ mode: "easy", theme: "light", tools: "full" });
  });

  it("keeps a change, sets its theme on the page, and tells subscribers", () => {
    const preferences = store();
    const listener = vi.fn();
    preferences.subscribe(listener);

    preferences.set({ ...preferences.get(), theme: "dark", mode: "advanced" });

    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toMatchObject({
      theme: "dark",
      mode: "advanced",
    });
    expect(html.getAttribute("data-hm-theme")).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);

    // Back to the system's theme: the page has no theme of its own again.
    preferences.set({ ...preferences.get(), theme: "system" });
    expect(html.hasAttribute("data-hm-theme")).toBe(false);
  });

  it("stops telling a subscriber that unsubscribed", () => {
    const preferences = store();
    const listener = vi.fn();
    preferences.subscribe(listener)();
    preferences.set({ ...preferences.get(), mode: "expert" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("works for the visit when storage refuses to read or write", () => {
    const preferences = createPreferencesStore({
      key: KEY,
      defaults: shellDefaultPreferences,
      storage: refusingStorage(),
    });
    expect(preferences.get().mode).toBe("easy");
    expect(() => preferences.set({ ...preferences.get(), theme: "light" })).not.toThrow();
    expect(preferences.get().theme).toBe("light");
    expect(html.getAttribute("data-hm-theme")).toBe("light");
  });

  it("works for the visit without any storage", () => {
    const preferences = createPreferencesStore({
      key: KEY,
      defaults: shellDefaultPreferences,
      storage: undefined,
    });
    preferences.set({ ...preferences.get(), mode: "expert" });
    expect(preferences.get().mode).toBe("expert");
  });

  it("follows a change made in another tab of the app, and only to its own key", () => {
    const preferences = store();
    const listener = vi.fn();
    preferences.subscribe(listener);

    localStorage.setItem(preferencesKey("pdf"), JSON.stringify({ theme: "dark" }));
    window.dispatchEvent(
      new StorageEvent("storage", { key: preferencesKey("pdf"), storageArea: localStorage }),
    );
    expect(listener).not.toHaveBeenCalled();

    localStorage.setItem(KEY, JSON.stringify({ theme: "dark", mode: "expert" }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: localStorage }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(preferences.get()).toMatchObject({ theme: "dark", mode: "expert" });
    expect(html.getAttribute("data-hm-theme")).toBe("dark");
  });
});

/** What the editor last saw from useEditorPreferenceProps(). */
const seen: { props?: EditorPreferenceProps } = {};

function Editor() {
  seen.props = useEditorPreferenceProps();
  return <p>{seen.props.preferences.mode}</p>;
}

describe("useEditorPreferenceProps", () => {
  it("gives the editor the kept preferences, and keeps its changes", async () => {
    const preferences = store();
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    await act(async () =>
      root.render(
        <PreferencesContext.Provider value={preferences}>
          <Editor />
        </PreferencesContext.Provider>,
      ),
    );
    expect(element.textContent).toBe("easy");

    await act(async () =>
      seen.props?.onPreferencesChange({ ...preferences.get(), mode: "expert" }),
    );
    expect(element.textContent).toBe("expert");
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toMatchObject({ mode: "expert" });
    await act(async () => root.unmount());
  });

  it("fails clearly outside an app started with startApp", async () => {
    const element = document.createElement("div");
    const root = createRoot(element);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(act(async () => root.render(<Editor />))).rejects.toThrow(/startApp/);
    } finally {
      quiet.mockRestore();
    }
  });
});
