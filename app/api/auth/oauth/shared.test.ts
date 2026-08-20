import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { UntrustedOriginError, callbackUrl, gateRedirect } from "./shared";

/**
 * The callback URL is the one value in the flow an attacker would most like to
 * choose, so these cover where it is allowed to come from rather than how it is
 * formatted.
 */

/** Only `nextUrl.origin` is read, so a stub is honest enough here. */
const requestFrom = (origin: string) =>
  ({ nextUrl: { origin } }) as NextRequest;

const setNodeEnv = (value: string) => vi.stubEnv("NODE_ENV", value);

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.DISCOGS_APP_URL;
});

describe("callbackUrl", () => {
  it("uses the configured origin when one is pinned", () => {
    process.env.DISCOGS_APP_URL = "https://crate.example.com";

    expect(callbackUrl(requestFrom("https://attacker.example"))).toBe(
      "https://crate.example.com/api/auth/oauth/callback",
    );
  });

  it("tolerates a trailing slash on the configured origin", () => {
    process.env.DISCOGS_APP_URL = "https://crate.example.com/";

    expect(callbackUrl(requestFrom("http://localhost:3000"))).toBe(
      "https://crate.example.com/api/auth/oauth/callback",
    );
  });

  it("derives the origin from the request in development", () => {
    setNodeEnv("development");

    expect(callbackUrl(requestFrom("http://localhost:3000"))).toBe(
      "http://localhost:3000/api/auth/oauth/callback",
    );
  });

  it("refuses to derive the origin from request headers in production", () => {
    setNodeEnv("production");

    // Next resolves nextUrl.origin from Host / X-Forwarded-Host, so trusting it
    // here would let a forged header aim the callback at another host.
    expect(() => callbackUrl(requestFrom("https://attacker.example"))).toThrow(
      UntrustedOriginError,
    );
  });

  it("allows a pinned origin in production", () => {
    setNodeEnv("production");
    process.env.DISCOGS_APP_URL = "https://crate.example.com";

    expect(callbackUrl(requestFrom("https://attacker.example"))).toBe(
      "https://crate.example.com/api/auth/oauth/callback",
    );
  });
});

describe("gateRedirect", () => {
  it("sends the browser back to the gate", () => {
    const response = gateRedirect();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("carries a reason the gate can explain", () => {
    expect(gateRedirect("oauth_declined").headers.get("location")).toBe(
      "/?error=oauth_declined",
    );
  });

  it("stays relative, so no failure path depends on the origin", () => {
    setNodeEnv("production");

    expect(gateRedirect("oauth_failed").headers.get("location")).not.toContain(
      "://",
    );
  });

  it("escapes a reason rather than letting it shape the URL", () => {
    expect(gateRedirect("a&b=c").headers.get("location")).toBe(
      "/?error=a%26b%3Dc",
    );
  });
});
