import { afterEach, describe, expect, it, vi } from "vitest";
import { clientKey, isSameOrigin } from "./guard";

/**
 * A fresh module per rate-limit test, so one test's spent window is not another
 * test's starting state.
 */
async function freshGuard() {
  vi.resetModules();
  return import("./guard");
}

const post = (headers: Record<string, string>) =>
  new Request("https://crate.example.com/api/auth/demo", {
    method: "POST",
    headers,
  });

afterEach(() => {
  delete process.env.DISCOGS_APP_URL;
});

describe("isSameOrigin", () => {
  it("accepts a request from the app's own pages", () => {
    expect(
      isSameOrigin(
        post({
          origin: "https://crate.example.com",
          host: "crate.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a form posted from another origin", () => {
    expect(
      isSameOrigin(
        post({ origin: "https://evil.example", host: "crate.example.com" }),
      ),
    ).toBe(false);
  });

  it("rejects a request with no Origin at all", () => {
    expect(isSameOrigin(post({ host: "crate.example.com" }))).toBe(false);
  });

  it("rejects an Origin that only looks like a prefix of ours", () => {
    expect(
      isSameOrigin(
        post({
          origin: "https://crate.example.com.evil.example",
          host: "crate.example.com",
        }),
      ),
    ).toBe(false);
  });

  it("rejects an unparseable Origin rather than throwing", () => {
    expect(
      isSameOrigin(post({ origin: "not a url", host: "crate.example.com" })),
    ).toBe(false);
  });

  it("prefers the pinned origin over the host header when one is set", () => {
    process.env.DISCOGS_APP_URL = "https://crate.example.com";

    // A forged host cannot widen what counts as same-origin.
    expect(
      isSameOrigin(
        post({ origin: "https://evil.example", host: "evil.example" }),
      ),
    ).toBe(false);
    expect(
      isSameOrigin(
        post({ origin: "https://crate.example.com", host: "evil.example" }),
      ),
    ).toBe(true);
  });

  it("tolerates a trailing slash on the pinned origin", () => {
    process.env.DISCOGS_APP_URL = "https://crate.example.com/";

    expect(
      isSameOrigin(
        post({
          origin: "https://crate.example.com",
          host: "crate.example.com",
        }),
      ),
    ).toBe(true);
  });
});

describe("clientKey", () => {
  it("counts against the first forwarded hop", () => {
    expect(clientKey(post({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
  });

  it("falls back to a shared bucket when the header is absent", () => {
    expect(clientKey(post({}))).toBe("unknown");
  });
});

describe("withinRateLimit", () => {
  it("allows requests up to the limit and refuses the next", async () => {
    const { withinRateLimit } = await freshGuard();

    expect(withinRateLimit("a", 3, 0)).toBe(true);
    expect(withinRateLimit("a", 3, 0)).toBe(true);
    expect(withinRateLimit("a", 3, 0)).toBe(true);
    expect(withinRateLimit("a", 3, 0)).toBe(false);
  });

  it("counts each client separately", async () => {
    const { withinRateLimit } = await freshGuard();

    expect(withinRateLimit("a", 1, 0)).toBe(true);
    expect(withinRateLimit("a", 1, 0)).toBe(false);
    expect(withinRateLimit("b", 1, 0)).toBe(true);
  });

  it("lets the window lapse", async () => {
    const { withinRateLimit } = await freshGuard();

    expect(withinRateLimit("a", 1, 0)).toBe(true);
    expect(withinRateLimit("a", 1, 30_000)).toBe(false);
    expect(withinRateLimit("a", 1, 60_000)).toBe(true);
  });
});

describe("guardPost", () => {
  const sameOrigin = {
    origin: "https://crate.example.com",
    host: "crate.example.com",
    "x-forwarded-for": "203.0.113.5",
  };

  it("lets a same-origin request through", async () => {
    const { guardPost: guard } = await freshGuard();

    expect(guard(post(sameOrigin))).toBeNull();
  });

  it("refuses a cross-origin request with 403", async () => {
    const { guardPost: guard } = await freshGuard();
    const refused = guard(
      post({ origin: "https://evil.example", host: "crate.example.com" }),
    );

    expect(refused?.status).toBe(403);
  });

  it("refuses with 429 once the client has spent its window", async () => {
    const { guardPost: guard } = await freshGuard();

    expect(guard(post(sameOrigin), { limit: 2 })).toBeNull();
    expect(guard(post(sameOrigin), { limit: 2 })).toBeNull();
    expect(guard(post(sameOrigin), { limit: 2 })?.status).toBe(429);
  });

  it("keeps separate buckets from spending each other's budget", async () => {
    const { guardPost: guard } = await freshGuard();

    expect(guard(post(sameOrigin), { limit: 1, bucket: "demo" })).toBeNull();
    expect(guard(post(sameOrigin), { limit: 1, bucket: "demo" })?.status).toBe(
      429,
    );
    expect(guard(post(sameOrigin), { limit: 1, bucket: "token" })).toBeNull();
  });

  it("checks the origin before spending any of the budget", async () => {
    const { guardPost: guard } = await freshGuard();

    // Ten cross-origin attempts must not exhaust the window for the real user.
    for (let i = 0; i < 10; i++) {
      guard(post({ origin: "https://evil.example", host: "crate.example.com" }), {
        limit: 1,
      });
    }

    expect(guard(post(sameOrigin), { limit: 1 })).toBeNull();
  });

  it("says nothing about Discogs in its refusals", async () => {
    const { guardPost: guard } = await freshGuard();
    const refused = guard(
      post({ origin: "https://evil.example", host: "crate.example.com" }),
    );
    const body = (await refused?.json()) as { error: string };

    expect(body.error).not.toMatch(/token|discogs/i);
  });
});
