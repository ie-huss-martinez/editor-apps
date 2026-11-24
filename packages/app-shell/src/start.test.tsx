// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnalytics } from "./analytics.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const analytics = { pageView: vi.fn(), editorEvent: vi.fn(), event: vi.fn() };
const createAnalytics = vi.fn(() => analytics);
vi.mock("@editor-apps/analytics", () => ({ createAnalytics }));

/** What the app saw from useAnalytics(). */
const seen: { value?: unknown } = {};

function App() {
  seen.value = useAnalytics();
  return <p>app</p>;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("startApp", () => {
  it("starts analytics with one page view, then renders the app with it in context", async () => {
    const { startApp } = await import("./start.tsx");
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await act(async () =>
      startApp({
        app: "video",
        analytics: { key: "phc_test", host: "https://ph.example" },
        render: () => <App />,
      }),
    );

    expect(createAnalytics).toHaveBeenCalledWith({
      app: "video",
      key: "phc_test",
      host: "https://ph.example",
    });
    expect(analytics.pageView).toHaveBeenCalledTimes(1);
    expect(root.textContent).toBe("app");
    expect(seen.value).toBe(analytics);
  });

  it("fails clearly when the page has no root element", async () => {
    const { startApp } = await import("./start.tsx");
    expect(() =>
      startApp({
        app: "pdf",
        analytics: { key: undefined, host: "https://ph.example" },
        render: () => null,
      }),
    ).toThrow(/no #root/);
  });

  it("registers the build's service worker for the whole app when asked, once the page has loaded", async () => {
    const { startApp } = await import("./start.tsx");
    const root = document.createElement("div");
    document.body.append(root);
    const register = vi.fn(() => Promise.resolve({}));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });
    try {
      await act(async () =>
        startApp({
          app: "notes",
          analytics: { key: undefined, host: "https://ph.example" },
          render: () => <App />,
          root,
          offline: true,
        }),
      );
      if (document.readyState !== "complete") window.dispatchEvent(new Event("load"));
      expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js", { scope: "/" });
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });

  it("registers nothing unless the app works offline, and nothing where it can't", async () => {
    const { startApp } = await import("./start.tsx");
    const root = document.createElement("div");
    document.body.append(root);
    const register = vi.fn(() => Promise.reject(new Error("no service worker here")));
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register },
      configurable: true,
    });
    try {
      await act(async () =>
        startApp({
          app: "pdf",
          analytics: { key: undefined, host: "https://ph.example" },
          render: () => <App />,
          root,
        }),
      );
      expect(register).not.toHaveBeenCalled();
      // A refused registration is no error the page shows.
      await act(async () =>
        startApp({
          app: "notes",
          analytics: { key: undefined, host: "https://ph.example" },
          render: () => <App />,
          root: document.body.appendChild(document.createElement("div")),
          offline: true,
        }),
      );
      if (document.readyState !== "complete") window.dispatchEvent(new Event("load"));
      expect(register).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});
