import { preferencesKey } from "@editor-apps/app-shell/preferences-key";
import {
  editorApp,
  posthogPolicy,
  sdkPackageAssets,
  themeStylesheet,
} from "@editor-apps/build-config/vite";
import { themeToCss } from "@hussmartinez/ui";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";
import { appConfig } from "./src/app.config.ts";
import { brandDark, brandLight } from "./src/theme.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The SDK's workers, WebAssembly and data files come from the app's own
    // origin. It renders pages as images it holds in the page. PostHog's
    // host is in connect-src only when the build has a key (docs/adr/0005).
    editorApp({
      canonicalUrl: appConfig.url,
      // The theme chosen in the editor, on the page before first paint (docs/adr/0010).
      preferencesKey: preferencesKey(appConfig.app),
      policy: {
        wasm: true,
        inlineImages: true,
        analytics: posthogPolicy(mode, import.meta.dirname, appConfig.analyticsHost),
      },
      sdkAssets: sdkPackageAssets("@hussmartinez/pdf-sdk", import.meta.url),
    }),
    themeStylesheet(themeToCss({ light: brandLight, dark: brandDark })),
  ],
  // The SDK's assets are self-hosted (sdkAssets above, assetsUrl in the
  // app), so its inlined workers and data resolve to a stub instead of
  // shipping unused chunks (sdk-core ADR 0060). Without assetsUrl, a worker
  // would then fail to start with WORKER_START_FAILED, never fall back.
  resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] },
  server: { port: 5176 },
}));
