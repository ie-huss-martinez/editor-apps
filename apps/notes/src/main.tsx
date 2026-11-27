// ui's stylesheet first, then the SDK's, then the brand theme and the shell's.
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/notes-sdk/styles.css";
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
 * library shows the header; an open notebook has the whole screen, with the
 * ad slot at the foot of its properties column, as in the other editors
 * (docs/adr/0011). The library has no frame, so no slot. The
 * SDK's PDF engine runs from the app's own origin (vite.config.ts), its
 * anonymous events go to the app's analytics (docs/adr/0005), and its
 * preferences are kept on the device (docs/adr/0010).
 */
function App() {
  const { onEvent: forward } = useEditorEvents(savedAsYouWrite);
  const preferences = useEditorPreferenceProps();
  const ad = useAdSlot(<AdArt />);
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
      fullScreen={view.view === "notebook"}
    >
      <NotesEditor
        ref={handle}
        className="app-editor"
        assetsUrl={__SDK_ASSETS_URL__}
        onEvent={onEvent}
        onViewChange={setView}
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
  offline: true,
  // The notebook's tools float in a dock over the page, as in the
  // handwriting apps people know; ui's default is a sidebar (docs/adr/0010).
  defaultPreferences: { toolsLayout: "dock" },
});
