import { createTheme } from "@hussmartinez/ui";

/** The app's brand on ui's tokens: indigo ink on warm paper, and its dark counterpart. */
export const brandLight = createTheme({
  extends: "light",
  tokens: {
    "color-bg": "#f3efe6",
    "color-surface": "#fbf8f1",
    "color-surface-sunken": "#e7e1d4",
    "color-text": "#1e1b2e",
    "color-text-muted": "#555066",
    "color-accent": "#4338ca",
    "color-accent-hover": "#3730a3",
    "color-accent-active": "#312e81",
    "color-accent-text": "#4338ca",
    "color-accent-subtle": "#e0dcf5",
    "color-on-accent": "#ffffff",
  },
});

export const brandDark = createTheme({
  extends: "dark",
  tokens: {
    "color-bg": "#14121c",
    "color-surface": "#1b1926",
    "color-surface-raised": "#24212f",
    "color-surface-sunken": "#0f0d16",
    "color-text": "#ece8f4",
    "color-text-muted": "#aba6bd",
    "color-accent": "#a5a1f0",
    "color-accent-hover": "#bbb8f5",
    "color-accent-active": "#cfcdf8",
    "color-accent-text": "#a5a1f0",
    "color-accent-subtle": "#2b2850",
    "color-on-accent": "#12101c",
  },
});
