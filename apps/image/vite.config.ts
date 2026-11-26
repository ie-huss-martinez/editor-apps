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
import { brandTheme } from "./src/theme.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The SDK's workers come from the app's own origin, under a path with
    // the SDK's version, so pages and workers of two releases never mix.
    editorApp({
      canonicalUrl: appConfig.url,
      // The theme chosen in the editor, on the page before first paint (docs/adr/0010).
      preferencesKey: preferencesKey(appConfig.app),
      // PostHog's host in connect-src only when the build has a key (docs/adr/0005).
      policy: { analytics: posthogPolicy(mode, import.meta.dirname, appConfig.analyticsHost) },
      sdkAssets: sdkPackageAssets("@hussmartinez/image-sdk", import.meta.url),
    }),
    themeStylesheet(themeToCss(brandTheme)),
  ],
  // The SDK's assets are self-hosted (sdkAssets above, assetsUrl in the
  // app), so its inlined workers resolve to a stub instead of shipping
  // unused chunks (sdk-core ADR 0060). Without assetsUrl, a worker would
  // then fail to start with WORKER_START_FAILED, never fall back.
  resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] },
  server: { port: 5175 },
}));
