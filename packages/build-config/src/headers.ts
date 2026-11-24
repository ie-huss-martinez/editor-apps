/**
 * The response headers of every app, built in one place so the four apps
 * can't drift apart (docs/adr/0001, docs/adr/0005, docs/adr/0006).
 *
 * The policy starts closed, `default-src 'none'`, and an app opens only what
 * its SDK needs. No option allows inline script or style, `'unsafe-eval'`,
 * or an origin that isn't named.
 */
export interface PolicyOptions {
  /** The SDK runs WebAssembly: adds `'wasm-unsafe-eval'` to `script-src`. */
  readonly wasm?: boolean;
  /** The editor shows images it makes in the page: adds `blob:` and `data:` to `img-src`. */
  readonly inlineImages?: boolean;
  /** The editor plays media it holds in the page: adds `media-src 'self' blob:`. */
  readonly inlineMedia?: boolean;
  /**
   * The editor records sound: `Permissions-Policy` allows the microphone
   * for the app's own origin, and never for a frame of another.
   */
  readonly microphone?: boolean;
  /**
   * The origins of the app's analytics provider, and nothing else
   * (docs/adr/0005). Leave it out for no analytics.
   */
  readonly analytics?:
    | {
        /** Where events are sent: added to `connect-src`. */
        readonly connect?: readonly string[];
        /** Where the provider's script comes from, if it isn't bundled: added to `script-src`. */
        readonly script?: readonly string[];
      }
    | undefined;
  /** The origin of the ad frame: the only `frame-src` (docs/adr/0006). */
  readonly adFrame?: string;
}

/**
 * Checks that a value is an `https` origin and nothing more, such as
 * `https://example.com`, so that a path, a wildcard or a keyword can't
 * widen the policy.
 *
 * @throws `TypeError` otherwise.
 */
export function httpsOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`Not an origin: ${JSON.stringify(value)}`);
  }
  // The URL parser accepts a wildcard host, which a policy would honour.
  if (url.protocol !== "https:" || url.origin !== value || !/^[a-z0-9.-]+$/.test(url.hostname)) {
    throw new TypeError(
      `Not an https origin, such as https://example.com: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/** Builds an app's Content Security Policy. */
export function contentSecurityPolicy(options: PolicyOptions = {}): string {
  const scripts = (options.analytics?.script ?? []).map(httpsOrigin);
  const connects = (options.analytics?.connect ?? []).map(httpsOrigin);
  const directives: (readonly string[])[] = [
    ["default-src", "'none'"],
    ["script-src", "'self'", ...(options.wasm ? ["'wasm-unsafe-eval'"] : []), ...scripts],
    ["style-src", "'self'"],
    ["img-src", "'self'", ...(options.inlineImages ? ["blob:", "data:"] : [])],
    ["font-src", "'self'"],
    ...(options.inlineMedia ? [["media-src", "'self'", "blob:"]] : []),
    ["worker-src", "'self'"],
    ["connect-src", "'self'", ...connects],
    ["manifest-src", "'self'"],
    ...(options.adFrame ? [["frame-src", httpsOrigin(options.adFrame)]] : []),
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
    ["frame-ancestors", "'none'"],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** Every header an app's pages and assets are served with. */
export function securityHeaders(options: PolicyOptions = {}): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // For browsers that don't know frame-ancestors.
    "X-Frame-Options": "DENY",
    "Permissions-Policy": `camera=(), microphone=(${options.microphone ? "self" : ""}), geolocation=(), payment=(), usb=()`,
  };
}

/**
 * Writes Cloudflare's `_headers` file: the headers for every path, and a
 * year of immutable caching for paths whose names change with their
 * content, such as `/assets/*`.
 *
 * @param headers - From {@link securityHeaders}.
 * @param immutable - Path patterns, each starting with `/`.
 */
export function headersFile(
  headers: Readonly<Record<string, string>>,
  immutable: readonly string[] = [],
): string {
  const blocks = [["/*", ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)]];
  for (const pattern of immutable) {
    if (!/^\/[\w./*-]*$/.test(pattern)) {
      throw new TypeError(`Not a path pattern, such as /assets/*: ${JSON.stringify(pattern)}`);
    }
    blocks.push([pattern, "  Cache-Control: public, max-age=31536000, immutable"]);
  }
  return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n`;
}
