import { describe, expect, it } from "vitest";
import {
  hmacSha1Base64,
  percentEncode,
  signatureBaseString,
  signingKey,
} from "./oauth";

describe("percentEncode", () => {
  it("leaves the unreserved set alone", () => {
    expect(percentEncode("azAZ09-._~")).toBe("azAZ09-._~");
  });

  it("escapes the characters encodeURIComponent misses", () => {
    // The whole reason this wrapper exists: encodeURIComponent leaves these
    // alone, and a mismatch silently breaks signatures.
    expect(percentEncode("!*'()")).toBe("%21%2A%27%28%29");
  });

  it("escapes spaces as %20, not +", () => {
    expect(percentEncode("a b")).toBe("a%20b");
  });

  it("escapes reserved characters", () => {
    expect(percentEncode("https://example.com/a?b=c&d=e")).toBe(
      "https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc%26d%3De",
    );
  });

  it("handles non-ASCII as UTF-8", () => {
    expect(percentEncode("é")).toBe("%C3%A9");
  });
});

describe("hmacSha1Base64", () => {
  it("matches the RFC 2202 test vector", async () => {
    // RFC 2202 case 2: HMAC-SHA1("Jefe", "what do ya want for nothing?")
    const expectedHex = "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79";
    const bytes = Uint8Array.from(
      expectedHex.match(/../g)!.map((byte) => parseInt(byte, 16)),
    );
    const expected = btoa(String.fromCharCode(...bytes));

    await expect(
      hmacSha1Base64("Jefe", "what do ya want for nothing?"),
    ).resolves.toBe(expected);
  });

  it("is stable for the same inputs", async () => {
    const once = await hmacSha1Base64("key", "message");
    const twice = await hmacSha1Base64("key", "message");
    expect(once).toBe(twice);
  });
});

describe("signingKey", () => {
  it("joins the secrets with an ampersand", () => {
    expect(signingKey("cs", "ts")).toBe("cs&ts");
  });

  it("keeps the trailing ampersand when there is no token yet", () => {
    // The request-token leg has no token secret, but the separator must stay.
    expect(signingKey("cs")).toBe("cs&");
  });

  it("percent-encodes each secret", () => {
    expect(signingKey("a b", "c+d")).toBe("a%20b&c%2Bd");
  });
});

describe("signatureBaseString", () => {
  const params = {
    oauth_consumer_key: "key",
    oauth_nonce: "n",
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: "1",
    oauth_version: "1.0",
    oauth_callback: "https://example.com/cb",
  };

  it("builds METHOD&url&params, each encoded", () => {
    const normalized = [
      "oauth_callback=https%3A%2F%2Fexample.com%2Fcb",
      "oauth_consumer_key=key",
      "oauth_nonce=n",
      "oauth_signature_method=HMAC-SHA1",
      "oauth_timestamp=1",
      "oauth_version=1.0",
    ].join("&");

    expect(
      signatureBaseString(
        "GET",
        "https://api.discogs.com/oauth/request_token",
        params,
      ),
    ).toBe(
      `GET&${percentEncode("https://api.discogs.com/oauth/request_token")}&${percentEncode(normalized)}`,
    );
  });

  it("upper-cases the method", () => {
    const lower = signatureBaseString("get", "https://example.com/a", params);
    const upper = signatureBaseString("GET", "https://example.com/a", params);
    expect(lower).toBe(upper);
  });

  it("excludes the query string from the base URL but signs its parameters", () => {
    const base = signatureBaseString(
      "GET",
      "https://example.com/a?page=2",
      {},
    );
    expect(base).toContain(percentEncode("https://example.com/a"));
    expect(base).not.toContain(percentEncode("https://example.com/a?page=2"));
    expect(base).toContain(percentEncode("page=2"));
  });

  it("sorts parameters by key", () => {
    const base = signatureBaseString("GET", "https://example.com/a?b=2&a=1", {});
    expect(base).toBe(
      `GET&${percentEncode("https://example.com/a")}&${percentEncode("a=1&b=2")}`,
    );
  });

  it("keeps repeated keys and breaks the tie on value", () => {
    // OAuth permits repeated keys; collapsing them into an object would drop
    // one and produce a signature the server can't reproduce.
    const base = signatureBaseString(
      "GET",
      "https://example.com/a?a=1&a=0",
      {},
    );
    expect(base).toBe(
      `GET&${percentEncode("https://example.com/a")}&${percentEncode("a=0&a=1")}`,
    );
  });

  it("encodes parameter values before sorting them", () => {
    const base = signatureBaseString("GET", "https://example.com/a", {
      z: "a b",
    });
    expect(base).toContain(percentEncode("z=a%20b"));
  });
});
