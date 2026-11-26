// ui's stylesheet first, then the SDK's, then the brand theme and the shell's.
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/audio-sdk/styles.css";
import "virtual:theme.css";
import "@editor-apps/app-shell/styles.css";
import {
  AppShell,
  startApp,
  type UnsavedAfter,
  useEditorEvents,
  useEditorPreferenceProps,
} from "@editor-apps/app-shell";
import type { AudioSessionEvent } from "@hussmartinez/audio-sdk";
import { AudioEditor } from "@hussmartinez/audio-sdk/react";
import { AdArt } from "./AdArt.tsx";
import { appConfig } from "./app.config.ts";

/**
 * What audio-sdk's events mean for the leave guard (docs/adr/0002): an
 * edit arms it; pressing the export dialog's Download, or opening or
 * closing a recording, clears it. Building the export changes nothing,
 * since the file isn't downloaded yet, and a failure changes nothing
 * either. A new event type fails to type-check here until it's placed.
 */
const unsavedAfter: UnsavedAfter<AudioSessionEvent> = ({ type }) => {
  switch (type) {
    case "recording_inserted":
    case "command":
    case "undo":
    case "redo":
      return true;
    case "recording_opened":
    case "recording_downloaded":
    case "recording_closed":
      return false;
    case "recording_exported":
    case "failed":
      return undefined;
    default:
      return type satisfies never;
  }
};

/**
 * audio-sdk's `AudioEditor` in the shared shell (docs/adr/0002). Its worker
 * comes from the app's own origin (vite.config.ts), its anonymous events
 * go to the app's analytics (docs/adr/0005) and to the leave guard, and
 * its preferences are kept on the device (docs/adr/0010).
 */
function App() {
  const editor = useEditorEvents(unsavedAfter);
  const preferences = useEditorPreferenceProps();
  return (
    <AppShell
      title={appConfig.title}
      tagline={appConfig.tagline}
      unsaved={editor.unsaved}
      ad={<AdArt />}
    >
      <AudioEditor
        className="app-editor"
        assetsUrl={__SDK_ASSETS_URL__}
        onEvent={editor.onEvent}
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
