import { withReactLint } from "@hussmartinez/sdk-config/lint-staged";

// The family's preset, with the React lint over the folders that hold React.
export default withReactLint(undefined, {
  paths: [
    "apps/audio/src",
    "apps/image/src",
    "apps/notes/src",
    "apps/pdf/src",
    "apps/video/src",
    "packages/analytics/src",
    "packages/app-shell/src",
    "packages/build-config/src",
  ],
});
