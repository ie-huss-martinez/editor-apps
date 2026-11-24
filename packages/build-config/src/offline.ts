import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * An app that works offline (docs/adr/0009): a service worker that keeps
 * every file of one build, written by the build itself, so it holds exactly
 * what was deployed and nothing that isn't.
 */

/** The service worker's own file, at the root so its scope is the whole app. */
export const SERVICE_WORKER = "sw.js";

/** Files the build writes that the browser never fetches. */
const NOT_SERVED = new Set(["_headers", "_redirects", SERVICE_WORKER]);

/**
 * The paths a build serves, as the browser asks for them: every file under
 * `outDir` but Cloudflare's own and the service worker, with `index.html`
 * as `/`. Cloudflare answers `/index.html` with a redirect to `/`, and a
 * service worker may not answer a page with a redirected response.
 */
export function offlinePaths(outDir: string): string[] {
  const paths: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(file);
        continue;
      }
      const relative = path.relative(outDir, file).split(path.sep).join("/");
      if (NOT_SERVED.has(relative)) continue;
      paths.push(relative === "index.html" ? "/" : `/${relative}`);
    }
  };
  walk(outDir);
  return paths.sort();
}

/** A digest of the build's served files and their contents, which names its cache. */
export function buildVersion(outDir: string, paths: readonly string[]): string {
  const hash = createHash("sha256");
  for (const served of paths) {
    const file = served === "/" ? "index.html" : served.slice(1);
    hash
      .update(served)
      .update("\0")
      .update(readFileSync(path.join(outDir, file)))
      .update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The service worker's source. It has no import and no inline code, so the
 * apps' policy needs nothing new for it (`worker-src 'self'`).
 *
 * - **Install:** keeps every file of the build in a cache named after it.
 *   If one can't be fetched, the install fails, and the previous build's
 *   worker stays in charge.
 * - **Activate:** deletes the caches of older builds. A new build takes over
 *   only once every tab of the old one is closed, never under a page that
 *   still asks for the old build's files.
 * - **Pages:** from the network when there is one, so a deploy shows at
 *   once, and from the cache when there isn't or the server answers with
 *   an error (5xx). Any other answer, a 404 included, is shown as it is.
 * - **Files:** from the cache, and from the network for anything it
 *   doesn't hold. A file is matched by its address alone, whatever its
 *   `Vary`: a server may vary on `Origin`, which the page's module requests
 *   carry and the install's didn't, and every file here is one build's.
 *   Requests to other origins, such as analytics, and anything but `GET`
 *   pass through untouched.
 */
export function serviceWorkerSource(paths: readonly string[], version: string): string {
  if (!/^[0-9a-f]+$/.test(version)) throw new TypeError(`Not a build version: ${version}`);
  return `// Written by the build (docs/adr/0009). Keeps this build's files for offline use.
const CACHE = ${JSON.stringify(`offline-${version}`)};
const FILES = ${JSON.stringify(paths, null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("offline-") && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    const kept = () => caches.open(CACHE).then((cache) => cache.match("/", { ignoreVary: true }));
    event.respondWith(
      fetch(request)
        .then((response) =>
          // A server error is answered with the kept page, as no network is;
          // anything else, a 404 included, is the server's to say.
          response.status >= 500 ? kept().then((page) => page ?? response) : response,
        )
        .catch(() => kept().then((page) => page ?? Response.error())),
    );
    return;
  }
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(request, { ignoreVary: true }))
      .then((kept) => kept ?? fetch(request)),
  );
});
`;
}

/** Writes the service worker into a finished build, and returns the paths it keeps. */
export function writeServiceWorker(outDir: string): string[] {
  const paths = offlinePaths(outDir);
  writeFileSync(
    path.join(outDir, SERVICE_WORKER),
    serviceWorkerSource(paths, buildVersion(outDir, paths)),
  );
  return paths;
}
