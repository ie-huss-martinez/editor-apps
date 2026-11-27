import { AnnouncerProvider, UiMessagesProvider, VisuallyHidden } from "@hussmartinez/ui/react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { useLeaveGuard } from "./leave-guard.ts";
import { messages } from "./messages.ts";

export interface AppShellProps {
  /** The app's name: the page's one `<h1>`. */
  readonly title: string;
  /** One line under the name, such as "Files never leave this device." */
  readonly tagline: string;
  /**
   * Live text about the open document, such as its name and page count,
   * shown in the header as an `<output>`. Render file names only as text.
   */
  readonly status?: ReactNode;
  /**
   * Whether there are edits the person hasn't exported. While `true`, the
   * browser asks before the page is left. Use `useEditorEvents` to track it
   * from the SDK's events.
   */
  readonly unsaved?: boolean;
  /**
   * The editor takes the whole screen, as an open notebook does
   * (docs/adr/0008): the header is hidden on screen but stays for
   * assistive technology, with the page's one `<h1>`, and the main area has
   * no margin.
   */
  readonly fullScreen?: boolean;
  /**
   * The SDK's editor, which fills the main area. Give it the class
   * `app-editor`, and the slot from `useAdSlot` as its `propertiesFooter`
   * (docs/adr/0011).
   */
  readonly children: ReactNode;
}

/**
 * The page around every app's editor (docs/adr/0002): ui's providers, a
 * skip link, a header with the app's name as the only `<h1>`, the `<main>`
 * landmark at full height and full width, the shared error boundary around
 * the editor, and the leave guard while there are unsaved edits. The ad slot
 * is in the editor's own column (docs/adr/0011). With `fullScreen`, the
 * editor has the whole screen. Import
 * `@editor-apps/app-shell/styles.css` after ui's and the SDK's stylesheets.
 */
export function AppShell({
  title,
  tagline,
  status,
  unsaved = false,
  fullScreen = false,
  children,
}: AppShellProps) {
  useLeaveGuard(unsaved);
  const header = (
    <header className="app-shell-header">
      <h1 className="app-shell-title">{title}</h1>
      <p className="app-shell-tagline">{tagline}</p>
      {status !== undefined && <output className="app-shell-status">{status}</output>}
    </header>
  );
  return (
    <UiMessagesProvider messages={messages}>
      <AnnouncerProvider>
        <div className={fullScreen ? "app-shell app-shell-full" : "app-shell"}>
          <a className="app-shell-skip" href="#app-shell-main">
            {messages.t("shell.skip")}
          </a>
          {fullScreen ? <VisuallyHidden as="div">{header}</VisuallyHidden> : header}
          {/* Focusable by the skip link only, so it isn't a tab stop. */}
          <main id="app-shell-main" className="app-shell-main" tabIndex={-1}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </AnnouncerProvider>
    </UiMessagesProvider>
  );
}
