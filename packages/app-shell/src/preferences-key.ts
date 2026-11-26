/**
 * Where an app keeps its editor preferences in `localStorage`
 * (docs/adr/0010): one key per app, such as `editor-preferences:pdf`.
 *
 * It has no imports, so an app's `vite.config.ts` can import it and hand
 * the same key to the build's theme script.
 *
 * @param app - The app's name, as its configuration gives it.
 */
export function preferencesKey(app: string): string {
  return `editor-preferences:${app}`;
}
