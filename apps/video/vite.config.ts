import { preferencesKey } from "@editor-apps/app-shell/preferences-key";
import {
  editorApp,
  posthogPolicy,
  sdkPackageAssets,
  themeStylesheet,
} from "@editor-apps/build-config/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";
import { appConfig } from "./src/app.config.ts";
import { themeCss } from "./src/theme.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The SDK's workers come from the app's own origin. The editor shows
    // frames and plays media it holds in the page, as blob: and data: URLs.
    editorApp({
      canonicalUrl: appConfig.url,
      // The theme chosen in the editor, on the page before first paint (docs/adr/0010).
      preferencesKey: preferencesKey(appConfig.app),
      policy: {
        inlineImages: true,
        inlineMedia: true,
        // PostHog's host in connect-src only when the build has a key (docs/adr/0005).
        analytics: posthogPolicy(mode, import.meta.dirname, appConfig.analyticsHost),
      },
      sdkAssets: sdkPackageAssets("@hussmartinez/video-sdk", import.meta.url),
    }),
    themeStylesheet(themeCss()),
  ],
  // The SDK's assets are self-hosted (sdkAssets above, assetsUrl in the
  // app), so its inlined workers resolve to a stub instead of shipping
  // unused chunks (sdk-core ADR 0060). Without assetsUrl, a worker would
  // then fail to start with WORKER_START_FAILED, never fall back.
  resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] },
  server: { port: 5174 },
  build: {
    target: "es2022",
    rollupOptions: {
      // The SDK's client entries say "use client", which a browser-only bundle
      // ignores: expected here, not a problem to report.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
}));
