// ui's stylesheet first, then the SDK's, then the brand theme and the shell's.
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/video-sdk/styles.css";
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
import type { VideoSessionEvent } from "@hussmartinez/video-sdk";
import { VideoEditor } from "@hussmartinez/video-sdk/react";
import { AdArt } from "./AdArt.tsx";
import { appConfig } from "./app.config.ts";

/**
 * What video-sdk's events mean for the leave guard (docs/adr/0002): any
 * edit, adding clips included, arms it; pressing the export dialog's
 * Download, or opening a file in place of everything, which clears the
 * history, clears it. Building the export changes nothing, since the file
 * isn't downloaded yet. Failed and cancelled steps change nothing either.
 * A new event type fails to type-check here until it's placed.
 */
const unsavedAfter: UnsavedAfter<VideoSessionEvent> = ({ type, outcome }) => {
  if (outcome !== "done") return undefined;
  switch (type) {
    case "insert":
    case "execute":
    case "undo":
    case "redo":
      return true;
    case "open":
    case "download":
      return false;
    case "export":
      return undefined;
    default:
      return type satisfies never;
  }
};

/**
 * video-sdk's `VideoEditor` in the shared shell (docs/adr/0002). Its
 * workers come from the app's own origin (vite.config.ts), and its
 * anonymous events go to the app's analytics (docs/adr/0005) and set
 * the leave guard, and its preferences are kept on the device
 * (docs/adr/0010).
 */
function App() {
  const editor = useEditorEvents(unsavedAfter);
  const preferences = useEditorPreferenceProps();
  const ad = useAdSlot(<AdArt />);
  return (
    <AppShell title={appConfig.title} tagline={appConfig.tagline} unsaved={editor.unsaved}>
      <VideoEditor
        className="app-editor"
        assetsUrl={__SDK_ASSETS_URL__}
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
