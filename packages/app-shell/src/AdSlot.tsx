import { type ReactElement, type ReactNode, useSyncExternalStore } from "react";
import { messages } from "./messages.ts";

/**
 * The viewports the slot is shown on (docs/adr/0007): at least 1280 pixels
 * wide and 720 high, where the editor keeps its room beside the slot.
 */
export const AD_SLOT_MEDIA = "(min-width: 1280px) and (min-height: 720px)";

export interface AdSlotProps {
  /**
   * The app's placeholder art: an inline SVG, 160 wide and 520 high, drawn
   * with the `app-ad-*` classes so it follows the theme. Nothing loaded
   * from the network.
   */
  readonly children: ReactNode;
}

/**
 * The ad slot (docs/adr/0006, docs/adr/0007, docs/adr/0011): a box of a
 * fixed 160 × 600 pixels, so nothing moves when a real ad fills it. Until
 * ads start it holds the app's own art and "Your ad here". It's decorative,
 * so it's hidden from assistive technology and inert: never a tab stop.
 * Apps place it with {@link useAdSlot}, which also applies the viewport rule.
 */
export function AdSlot({ children }: AdSlotProps) {
  return (
    <aside className="app-shell-ad" aria-hidden="true" inert>
      <div className="app-shell-ad-box">
        <div className="app-shell-ad-art">{children}</div>
        <p className="app-shell-ad-label">{messages.t("shell.ad.placeholder")}</p>
      </div>
    </aside>
  );
}

/** The media query, made once: `matchMedia` gives a new list on each call. */
let query: MediaQueryList | undefined;

function adSlotMedia(): MediaQueryList {
  query ??= window.matchMedia(AD_SLOT_MEDIA);
  return query;
}

function subscribe(onChange: () => void): () => void {
  const media = adSlotMedia();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const isWideEnough = () => adSlotMedia().matches;
/** Without a window there's no viewport to fit, so no slot. */
const onServer = () => false;

/**
 * The ad slot for the SDK editor's `propertiesFooter` (docs/adr/0011): the
 * slot with the app's art, or `null` on a viewport smaller than 1280 × 720,
 * where it isn't rendered at all, so the editor's frame keeps no column for
 * it. The viewport is read during the first render, so a wide page has the
 * slot from its first paint and a narrow one never shows it.
 *
 * ```tsx
 * <ImageEditor propertiesFooter={useAdSlot(<AdArt />)} />
 * ```
 *
 * @param art - The app's placeholder art. An app opts in by calling it.
 */
export function useAdSlot(art: ReactNode): ReactElement | null {
  const shown = useSyncExternalStore(subscribe, isWideEnough, onServer);
  return shown ? <AdSlot>{art}</AdSlot> : null;
}
