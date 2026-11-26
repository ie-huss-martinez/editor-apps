import { cpSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadEnv, type Plugin } from "vite";
import { headersFile, httpsOrigin, type PolicyOptions, securityHeaders } from "./headers.ts";
import { packageRoot, thirdPartyLicenses } from "./licenses.ts";
import { writeServiceWorker } from "./offline.ts";
import { themeScript, themeScriptPath } from "./theme-script.ts";

/**
 * What an app tells the build about itself. Everything else is the same in
 * every app.
 */
export interface EditorAppOptions {
  /** What the app's Content Security Policy must open (docs/adr/0005). */
  readonly policy?: PolicyOptions;
  /** The app's public address, written into the page as its canonical link. */
  readonly canonicalUrl?: string;
  /**
   * The SDK's assets, such as its workers, served from the app's own origin
   * so the policy needs no `blob:` worker.
   */
  readonly sdkAssets?: {
    /** The directory to copy, usually the SDK's `dist/assets`. */
    readonly from: string;
    /**
     * Where the app serves it, such as `/pdf-sdk/1.2.3/`. Put the SDK's
     * version in it: the path is cached as immutable, and an SDK refuses a
     * worker from another version.
     */
    readonly url: string;
  };
  /**
   * The app works offline (docs/adr/0009): the build writes `sw.js`, a
   * service worker that keeps every file of the build, the SDK's assets
   * included. Register it with `startApp`'s `offline`.
   */
  readonly offline?: boolean;
  /**
   * The `localStorage` key the shell keeps the editor's preferences under,
   * from app-shell's `preferencesKey` (docs/adr/0010). The build writes a
   * small script that sets the theme chosen there on `<html>`, and loads it
   * first in the page's `<head>`, so the page is painted in that theme from
   * the start. It's served from the app's own origin, so the policy needs
   * nothing new.
   */
  readonly preferencesKey?: string;
}

/** The dev server's content types for an SDK's assets. Production's come from Cloudflare. */
const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

/**
 * The Vite plugins every app uses. They write `_headers` into the build for
 * Cloudflare's static assets, send the same headers from `vite preview`,
 * so tests run under production's policy, copy the SDK's assets, and write
 * `third-party-licenses.txt`, generated from what the build bundles.
 *
 * The dev server sends none of them: Vite's own client needs inline code
 * there, which the policy forbids.
 */
export function editorApp(options: EditorAppOptions = {}): Plugin[] {
  const headers = securityHeaders(options.policy);
  const assets = options.sdkAssets;
  if (assets && (!/^\/[\w.-]+(\/[\w.-]+)*\/$/.test(assets.url) || /\/\.\.?\//.test(assets.url))) {
    throw new TypeError(
      `sdkAssets.url must be a path such as /pdf-sdk/1.2.3/: ${JSON.stringify(assets.url)}`,
    );
  }
  let outDir = "dist";
  // The SDK's self-hosted assets ship without passing through the bundle.
  // Absolute first: a relative directory has no node_modules to find.
  const sdkRoot = assets ? packageRoot(path.resolve(assets.from, "x")) : undefined;
  const theme =
    options.preferencesKey === undefined ? undefined : themeScript(options.preferencesKey);
  const themeUrl = theme === undefined ? undefined : themeScriptPath(theme);

  const app: Plugin = {
    name: "editor-apps:app",
    config: () => ({
      // One copy of each, from the app: the shell is a workspace package,
      // whose own node_modules would otherwise hold a second ui or React.
      resolve: { dedupe: ["react", "react-dom", "@hussmartinez/ui", "@hussmartinez/sdk-core"] },
      preview: { headers },
      // Where the app passes as its SDK's `assetsUrl`. Empty without assets.
      define: { __SDK_ASSETS_URL__: JSON.stringify(assets?.url ?? "") },
    }),
    // The dev server serves the theme script and the SDK's assets at the
    // same paths as production.
    configureServer(server) {
      if (theme !== undefined) {
        server.middlewares.use((request, response, next) => {
          if ((request.url ?? "").split("?")[0] !== themeUrl) return next();
          response.setHeader("Content-Type", "text/javascript");
          response.end(theme);
        });
      }
      if (!assets) return;
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent((request.url ?? "").split("?")[0] ?? "");
        } catch {
          // A malformed escape, such as %E0, isn't an asset: Vite answers it.
          return next();
        }
        if (!pathname.startsWith(assets.url)) return next();
        const file = path.resolve(assets.from, pathname.slice(assets.url.length));
        // Never outside the assets directory.
        if (!file.startsWith(path.resolve(assets.from) + path.sep) || !existsSync(file)) {
          return next();
        }
        response.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        );
        response.end(readFileSync(file));
      });
    },
    transformIndexHtml() {
      return [
        // First in the head, and blocking, so it runs before the stylesheets
        // apply and before anything is painted.
        ...(themeUrl === undefined
          ? []
          : [{ tag: "script", attrs: { src: themeUrl }, injectTo: "head-prepend" as const }]),
        ...(options.canonicalUrl
          ? [
              {
                tag: "link",
                attrs: { rel: "canonical", href: new URL(options.canonicalUrl).href },
                injectTo: "head" as const,
              },
            ]
          : []),
      ];
    },
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      if (theme !== undefined && themeUrl !== undefined) {
        this.emitFile({ type: "asset", fileName: themeUrl.slice(1), source: theme });
      }
      this.emitFile({
        type: "asset",
        fileName: "_headers",
        source: headersFile(headers, ["/assets/*", ...(assets ? [`${assets.url}*`] : [])]),
      });
    },
    closeBundle() {
      if (this.environment.config.command !== "build") return;
      if (assets) {
        if (!existsSync(assets.from)) {
          throw new Error(`sdkAssets.from doesn't exist: ${assets.from}`);
        }
        cpSync(assets.from, path.join(outDir, assets.url), { recursive: true });
      }
      // Last, so it keeps every file the build holds, the SDK's copied above.
      if (options.offline) writeServiceWorker(outDir);
    },
  };
  return [app, thirdPartyLicenses(sdkRoot ? [sdkRoot] : [])];
}

/**
 * An SDK package's assets, for {@link EditorAppOptions.sdkAssets}: its
 * `dist/assets` directory, served under the package's name and version,
 * such as `/pdf-sdk/1.2.3/`.
 *
 * @param packageName - Such as `@hussmartinez/pdf-sdk`.
 * @param from - The app's `import.meta.url`, to resolve the package from.
 */
export function sdkPackageAssets(packageName: string, from: string): { from: string; url: string } {
  const manifest = createRequire(from).resolve(`${packageName}/package.json`);
  const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
  const name = packageName.split("/").pop() ?? packageName;
  return {
    from: path.join(path.dirname(manifest), "dist/assets"),
    url: `/${name}/${version}/`,
  };
}

/**
 * Serves a stylesheet made at build time, such as a theme from ui's
 * `themeToCss`, as the module `virtual:theme.css`. The page then needs no
 * inline `<style>`, which the Content Security Policy forbids.
 */
export function themeStylesheet(css: string): Plugin {
  const id = "virtual:theme.css";
  return {
    name: "editor-apps:theme",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load: (resolved) => (resolved === `\0${id}` ? css : undefined),
  };
}

/**
 * The analytics policy for a build (docs/adr/0005): PostHog's host in
 * `connect-src` when the build has `VITE_POSTHOG_KEY`, from the same
 * variables the app reads, and nothing without one. `VITE_POSTHOG_HOST`
 * overrides the default host, and must be an https origin.
 *
 * @param mode - Vite's mode.
 * @param root - The app's folder, where its `.env` files would be.
 * @param defaultHost - The app's default PostHog host.
 */
export function posthogPolicy(
  mode: string,
  root: string,
  defaultHost: string,
): PolicyOptions["analytics"] {
  const env = loadEnv(mode, root, "VITE_");
  if (!env.VITE_POSTHOG_KEY) return undefined;
  return { connect: [httpsOrigin(new URL(env.VITE_POSTHOG_HOST || defaultHost).origin)] };
}
