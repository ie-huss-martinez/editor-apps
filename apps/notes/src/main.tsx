// ui's stylesheet first, then the SDK's, then the brand theme and the shell's.
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/notes-sdk/styles.css";
import "virtual:theme.css";
import "@editor-apps/app-shell/styles.css";
import { AppShell, startApp, type UnsavedAfter, useEditorEvents } from "@editor-apps/app-shell";
import type { NotesLibraryEvent } from "@hussmartinez/notes-sdk";
import {
  NotesEditor,
  type NotesEditorHandle,
  type NotesEditorView,
} from "@hussmartinez/notes-sdk/react";
import { useCallback, useRef, useState } from "react";
import { AdArt } from "./AdArt.tsx";
import { appConfig } from "./app.config.ts";

/**
 * Never unsaved: the SDK saves as you write, so leaving loses nothing and
 * the shell's leave guard stays off (docs/adr/0008).
 */
const savedAsYouWrite: UnsavedAfter<NotesLibraryEvent> = () => undefined;

/** After these, the library holds something worth keeping. */
const KEEPING = new Set<NotesLibraryEvent["type"]>([
  "notebook_created",
  "pdf_imported",
  "backup_restored",
]);

/**
 * notes-sdk's `NotesEditor` in the shared shell (docs/adr/0002). The
 * library shows the header and the ad slot; an open notebook has the whole
 * screen, with no ad beside the page being written on (docs/adr/0008). The
 * SDK's PDF engine runs from the app's own origin (vite.config.ts), and its
 * anonymous events go to the app's analytics (docs/adr/0005).
 */
function App() {
  const { onEvent: forward } = useEditorEvents(savedAsYouWrite);
  const handle = useRef<NotesEditorHandle>(null);
  const [view, setView] = useState<NotesEditorView>({ view: "library" });
  const asked = useRef(false);

  // Once there's something to lose, the browser is asked to keep the
  // storage. Chrome answers without asking the person; Firefox asks, now
  // that it has a reason to. The library's notice offers it too.
  const onEvent = useCallback(
    (event: NotesLibraryEvent) => {
      forward(event);
      if (asked.current || !KEEPING.has(event.type)) return;
      const library = handle.current?.library;
      if (!library || library.getSnapshot().persistence?.persisted === true) return;
      asked.current = true;
      void library.requestPersistence();
    },
    [forward],
  );

  return (
    <AppShell
      title={appConfig.title}
      tagline={appConfig.tagline}
      ad={<AdArt />}
      fullScreen={view.view === "notebook"}
    >
      <NotesEditor
        ref={handle}
        className="app-editor"
        assetsUrl={__SDK_ASSETS_URL__}
        onEvent={onEvent}
        onViewChange={setView}
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
  offline: true,
});
