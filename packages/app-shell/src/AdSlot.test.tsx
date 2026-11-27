// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AD_SLOT_MEDIA, useAdSlot } from "./AdSlot.tsx";
import { AppShell } from "./AppShell.tsx";

// React's act() needs this flag in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A viewport the tests resize: whether it's at least 1280 × 720. */
const viewport = new (class extends EventTarget {
  matches = true;
  media = AD_SLOT_MEDIA;
  resize(wide: boolean) {
    this.matches = wide;
    this.dispatchEvent(new Event("change"));
  }
})();

let container: HTMLElement;
let root: Root;
/** What `useAdSlot` gave on each render, first render included. */
let renders: (ReactNode | null)[];

function Editor() {
  const slot = useAdSlot(<svg data-testid="art" />);
  renders.push(slot);
  return <div className="editor-column">{slot}</div>;
}

beforeAll(() => {
  window.matchMedia = (query: string) => {
    expect(query).toBe(AD_SLOT_MEDIA);
    return viewport as unknown as MediaQueryList;
  };
});

beforeEach(() => {
  renders = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  viewport.matches = true;
});

describe("useAdSlot", () => {
  it("gives the slot from the first render on a wide viewport, with the app's art", () => {
    act(() => root.render(<Editor />));
    expect(renders[0]).not.toBeNull();
    const slot = container.querySelector(".editor-column > aside");
    expect(slot?.querySelector('[data-testid="art"]')).not.toBeNull();
    expect(slot?.textContent).toBe("Your ad here");
    // Decorative: hidden from assistive technology, and never a tab stop.
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(slot?.hasAttribute("inert")).toBe(true);
    expect(slot?.querySelector(".app-shell-ad-box")).not.toBeNull();
  });

  it("renders nothing at all on a smaller viewport, from the first render", () => {
    viewport.matches = false;
    act(() => root.render(<Editor />));
    expect(renders.every((slot) => slot === null)).toBe(true);
    expect(container.querySelector(".editor-column")?.childElementCount).toBe(0);
  });

  it("follows the viewport as it changes", () => {
    act(() => root.render(<Editor />));
    act(() => viewport.resize(false));
    expect(container.querySelector("aside")).toBeNull();
    act(() => viewport.resize(true));
    expect(container.querySelector("aside")).not.toBeNull();
  });
});

describe("the shell", () => {
  it("renders no ad column of its own: the slot is in the editor's", () => {
    act(() =>
      root.render(
        <AppShell title="t" tagline="t">
          <div className="app-editor" />
        </AppShell>,
      ),
    );
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector("main + *")).toBeNull();
  });
});
