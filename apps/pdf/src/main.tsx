// ui's stylesheet first, then the SDK's, then the brand theme and the shell's.
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/pdf-sdk/styles.css";
import "virtual:theme.css";
import "@editor-apps/app-shell/styles.css";
import {
  AppShell,
  startApp,
  type UnsavedAfter,
  useAdSlot,
  useEditorEvents,
  useEditorPreferenceProps,
} from "@editor-apps/app-shell";
import type { PdfSessionEvent } from "@hussmartinez/pdf-sdk";
import { PdfEditor, type PdfEditorChange } from "@hussmartinez/pdf-sdk/react";
import { useCallback, useState } from "react";
import { AdArt } from "./AdArt.tsx";
import { appConfig } from "./app.config.ts";

/** The limits the app had before the SDK: warn at 100 MB, refuse over 300 MB. */
const FILE_POLICY = {
  maxFileSize: { maximum: 300e6, warning: 100e6 },
  maxSessionSize: 600e6,
} as const;

type DocumentStatus = { fileName?: string | undefined; pageCount: number };

function describe({ fileName, pageCount }: DocumentStatus): string {
  if (pageCount === 0) return "No document open";
  const pages = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  return fileName ? `${fileName} · ${pages}` : pages;
}

/**
 * What pdf-sdk's events mean for the leave guard (docs/adr/0002): an edit
 * arms it; downloading the document, which follows its export at once,
 * or opening or closing one clears it. A failure changes nothing. A new
 * event type fails to type-check here until it's placed.
 */
const unsavedAfter: UnsavedAfter<PdfSessionEvent> = ({ type }) => {
  switch (type) {
    case "pages_inserted":
    case "command":
    case "undo":
    case "redo":
      return true;
    case "document_opened":
    case "document_exported":
    case "document_closed":
      return false;
    case "failed":
      return undefined;
    default:
      return type satisfies never;
  }
};

/**
 * pdf-sdk's `PdfEditor` in the shared shell (docs/adr/0002), with the open
 * document's name and page count in the header. Its workers and data come
 * from the app's own origin (vite.config.ts), its anonymous events go to
 * the app's analytics (docs/adr/0005) and to the leave guard, and its
 * preferences are kept on the device (docs/adr/0010).
 */
function App() {
  const editor = useEditorEvents(unsavedAfter);
  const preferences = useEditorPreferenceProps();
  const ad = useAdSlot(<AdArt />);
  const [status, setStatus] = useState<DocumentStatus>({ pageCount: 0 });

  // The file name comes only with `open`; edits keep it, closing clears it.
  const handleChange = useCallback((change: PdfEditorChange) => {
    setStatus((previous) =>
      change.reason === "open"
        ? { fileName: change.fileName, pageCount: change.pageCount }
        : change.reason === "close"
          ? { pageCount: 0 }
          : { ...previous, pageCount: change.pageCount },
    );
  }, []);

  return (
    // The name comes from the file, so it's rendered only as text.
    <AppShell
      title={appConfig.title}
      tagline={appConfig.tagline}
      unsaved={editor.unsaved}
      status={describe(status)}
    >
      <PdfEditor
        className="app-editor"
        assetsUrl={__SDK_ASSETS_URL__}
        filePolicy={FILE_POLICY}
        onChange={handleChange}
        onEvent={editor.onEvent}
        propertiesFooter={ad}
        {...preferences}
      />
    </AppShell>
  );
}

startApp({
  app: appConfig.app,
  analytics: {
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST || appConfig.analyticsHost,
  },
  render: () => <App />,
});
