import { defineReactLint } from "@hussmartinez/sdk-config/eslint-react";

// React's rules for what components do while they render (sdk-core ADR 0063),
// run by hm-lint-react. Biome stays the linter and formatter.
export default await defineReactLint({
  files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
});
