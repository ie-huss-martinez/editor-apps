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
    // pdf-sdk, which the notes SDK reads and writes PDFs with, runs its
    // workers and WebAssembly from the app's own origin. Recordings play
    // from memory, and the microphone is allowed for this origin only.
    // PostHog's host is in connect-src only when the build has a key
    // (docs/adr/0005). The build keeps every file for offline use
    // (docs/adr/0009).
    editorApp({
      canonicalUrl: appConfig.url,
      policy: {
        wasm: true,
        inlineMedia: true,
        microphone: true,
        analytics: posthogPolicy(mode, import.meta.dirname, appConfig.analyticsHost),
      },
      sdkAssets: sdkPackageAssets("@hussmartinez/pdf-sdk", import.meta.url),
      offline: true,
    }),
    themeStylesheet(themeToCss({ light: brandLight, dark: brandDark })),
  ],
  // pdf-sdk's assets are self-hosted (sdkAssets above, assetsUrl in the
  // app), so its inlined workers and data resolve to a stub instead of
  // shipping unused chunks (sdk-core ADR 0060).
  resolve: { conditions: [...defaultClientConditions, "hm-self-hosted"] },
  server: { port: 5177 },
}));
