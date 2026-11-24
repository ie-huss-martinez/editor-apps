import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, headersFile, httpsOrigin, securityHeaders } from "./headers.ts";

describe("contentSecurityPolicy", () => {
  it("is closed by default, with no other origin", () => {
    expect(contentSecurityPolicy()).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
        "worker-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; " +
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it("opens only what an option names", () => {
    const policy = contentSecurityPolicy({ wasm: true, inlineImages: true, inlineMedia: true });
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(policy).toContain("img-src 'self' blob: data:;");
    expect(policy).toContain("media-src 'self' blob:;");
  });

  it("adds the analytics provider's origins, and nothing else", () => {
    const policy = contentSecurityPolicy({
      analytics: { connect: ["https://events.example"], script: ["https://beacon.example"] },
    });
    expect(policy).toContain("connect-src 'self' https://events.example;");
    expect(policy).toContain("script-src 'self' https://beacon.example;");
    expect(policy.match(/https:/g)).toHaveLength(2);
  });

  it("allows the ad frame as the only frame", () => {
    expect(contentSecurityPolicy({ adFrame: "https://frame.example" })).toContain(
      "frame-src https://frame.example;",
    );
    expect(contentSecurityPolicy()).not.toContain("frame-src");
  });

  it("never allows inline code, eval or a wildcard", () => {
    const policy = contentSecurityPolicy({
      wasm: true,
      inlineImages: true,
      inlineMedia: true,
      analytics: { connect: ["https://events.example"] },
      adFrame: "https://frame.example",
    });
    expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*|http:/);
  });
});

describe("httpsOrigin", () => {
  it.each([
    "http://events.example",
    "https://events.example/path",
    "https://events.example/",
    "https://*.example",
    "events.example",
    "'unsafe-inline'",
    "https://events.example; script-src *",
  ])("refuses %s", (value) => {
    expect(() => httpsOrigin(value)).toThrow(TypeError);
    expect(() => contentSecurityPolicy({ analytics: { connect: [value] } })).toThrow(TypeError);
  });
});

describe("securityHeaders", () => {
  it("has the policy and the strictest header of each kind the apps had", () => {
    expect(securityHeaders()).toEqual({
      "Content-Security-Policy": contentSecurityPolicy(),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    });
  });
});

describe("securityHeaders, for an app that records sound", () => {
  it("allows the microphone for the app's own origin only, and changes nothing else", () => {
    const headers = securityHeaders({ microphone: true });
    expect(headers["Permissions-Policy"]).toBe(
      "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
    );
    expect(headers["Content-Security-Policy"]).toBe(contentSecurityPolicy());
  });
});

describe("headersFile", () => {
  it("writes one block for every path, and one for each immutable pattern", () => {
    expect(headersFile({ "X-One": "1", "X-Two": "2" }, ["/assets/*"])).toBe(
      "/*\n  X-One: 1\n  X-Two: 2\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
  });

  it("refuses a pattern that could start another rule", () => {
    expect(() => headersFile({}, ["/assets/*\n/*"])).toThrow(TypeError);
    expect(() => headersFile({}, ["assets"])).toThrow(TypeError);
  });
});
