// @vitest-environment happy-dom
import type { Analytics } from "@editor-apps/analytics";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell.tsx";
import { AnalyticsContext } from "./analytics.ts";

// React's act() needs this flag in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function fakeAnalytics() {
  const analytics = { pageView: vi.fn(), editorEvent: vi.fn(), event: vi.fn() };
  return analytics satisfies Analytics;
}

const SECRET = "private-name-from-a-file.pdf";

function Crash(): never {
  throw new Error(`Couldn't read ${SECRET}`);
}

describe("AppShell", () => {
  it("renders the one h1, the tagline, the status and the main landmark", () => {
    act(() =>
      root.render(
        <AppShell title="PDF Editor" tagline="Files never leave this device." status="2 pages">
          <div className="app-editor">editor</div>
        </AppShell>,
      ),
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")?.textContent).toBe("PDF Editor");
    expect(container.querySelector(".app-shell-tagline")?.textContent).toBe(
      "Files never leave this device.",
    );
    expect(container.querySelector("header output")?.textContent).toBe("2 pages");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("main .app-editor")?.textContent).toBe("editor");
  });

  it("starts with a skip link to the editor's landmark", () => {
    act(() =>
      root.render(
        <AppShell title="Video" tagline="t">
          {null}
        </AppShell>,
      ),
    );
    const skip = container.querySelector("a");
    expect(skip?.textContent).toBe("Skip to the editor");
    const target = container.querySelector(skip?.getAttribute("href") ?? "#none");
    expect(target?.tagName).toBe("MAIN");
    // Focusable by the link, but not a tab stop of its own.
    expect(target?.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves the status out when the app has none", () => {
    act(() =>
      root.render(
        <AppShell title="Audio" tagline="t">
          {null}
        </AppShell>,
      ),
    );
    expect(container.querySelector("output")).toBeNull();
  });

  it("replaces a crashed editor, logs it locally, and sends an event without its text", () => {
    const analytics = fakeAnalytics();
    const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => {});
    act(() =>
      root.render(
        <AnalyticsContext.Provider value={analytics}>
          <AppShell title="Image" tagline="t">
            <Crash />
          </AppShell>
        </AnalyticsContext.Provider>,
      ),
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.querySelector("h2")?.textContent).toBe("The editor stopped unexpectedly");
    expect(alert?.textContent).not.toContain(SECRET);
    expect(alert?.querySelector("button")?.textContent).toBe("Reload the page");
    // The shell's header and landmark stay.
    expect(container.querySelector("h1")?.textContent).toBe("Image");

    // Logged to the local console, by React, with the error.
    expect(console.mock.calls.flat().some((arg) => String(arg).includes(SECRET))).toBe(true);
    // One anonymous event, and nothing else: no message, no stack.
    expect(analytics.event.mock.calls).toEqual([["component_error"]]);
    expect(analytics.editorEvent).not.toHaveBeenCalled();
  });

  it("gives the editor the whole screen, keeping the h1 for assistive technology", () => {
    act(() =>
      root.render(
        <AppShell title="Notes" tagline="t" status="Physics" fullScreen>
          <div className="app-editor">editor</div>
        </AppShell>,
      ),
    );
    expect(container.querySelector(".app-shell")?.classList.contains("app-shell-full")).toBe(true);
    // Still the page's one h1, inside the banner, hidden on screen only.
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("header h1")?.textContent).toBe("Notes");
    expect(container.querySelector("header")?.closest(".hm-visually-hidden")).not.toBeNull();
    expect(container.querySelector("main .app-editor")?.textContent).toBe("editor");
  });

  it("shows the header again once the editor leaves the whole screen", () => {
    const shell = (fullScreen: boolean) => (
      <AppShell title="Notes" tagline="t" fullScreen={fullScreen}>
        <div className="app-editor">editor</div>
      </AppShell>
    );
    act(() => root.render(shell(true)));
    act(() => root.render(shell(false)));
    expect(container.querySelector(".app-shell")?.classList.contains("app-shell-full")).toBe(false);
    expect(container.querySelector("header")?.closest(".hm-visually-hidden")).toBeNull();
  });
});
