import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the trust boundary in `withAuth`: which Discogs account a request
 * is allowed to name, and which credential it gets to name it with.
 *
 * Both inputs are mocked at the edges rather than stubbed in the middle — a
 * cookie jar the "visitor" can write to, and a `fetch` that records the URL and
 * Authorization header the server actually sent. That way the assertions are
 * about the request that would have gone to Discogs, which is the thing that
 * matters, rather than about how the code arrived at it.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

interface SentRequest {
  url: string;
  auth: string;
}

const sent: SentRequest[] = [];

/** Queued replies, so a test can make Discogs reject a credential. */
let replies: (() => Response)[] = [];

const identityBody = (username: string) =>
  new Response(JSON.stringify({ username, id: 1 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const collectionBody = () =>
  new Response(
    JSON.stringify({
      pagination: { page: 1, pages: 1, items: 0 },
      releases: [],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
  const headers = init.headers as Record<string, string>;
  sent.push({ url: String(url), auth: String(headers.Authorization) });

  const next = replies.shift();
  if (next) return next();

  return String(url).includes("/oauth/identity")
    ? identityBody("demo-account")
    : collectionBody();
});

const DEMO_TOKEN = "server-side-demo-token";

/**
 * A fresh module per test, so the memoized demo identity starts empty without
 * the module having to expose a reset hook it would never need in production.
 */
async function loadApi() {
  vi.resetModules();
  return import("./api");
}

/** Runs a collection fetch through withAuth and reports what Discogs saw. */
async function collectionRequest(): Promise<{
  response: Response;
  collection: SentRequest | undefined;
}> {
  const { withAuth } = await loadApi();
  const { fetchCollectionPage } = await import("./discogs/collection");

  const response = await withAuth(async (auth, username) => {
    await fetchCollectionPage(auth, username, 1);
    return new Response("ok");
  });

  return {
    response,
    collection: sent.find((request) => request.url.includes("/collection/")),
  };
}

beforeEach(() => {
  jar.clear();
  sent.length = 0;
  replies = [];
  delete process.env.DISCOGS_DEMO_TOKEN;
  delete process.env.DISCOGS_CONSUMER_KEY;
  delete process.env.DISCOGS_CONSUMER_SECRET;
});

describe("withAuth: which account a demo session may name", () => {
  beforeEach(() => {
    process.env.DISCOGS_DEMO_TOKEN = DEMO_TOKEN;
    jar.set("discogs_demo", "1");
  });

  it("ignores a username the visitor put in the cookie", async () => {
    // What the demo route sets, with the username edited by the visitor.
    jar.set("discogs_user", "someone-elses-account");

    const { collection } = await collectionRequest();

    expect(collection?.url).toContain("/users/demo-account/collection");
    expect(collection?.url).not.toContain("someone-elses-account");
  });

  it("still spends the demo token only on the demo account", async () => {
    jar.set("discogs_user", "someone-elses-account");

    const { collection } = await collectionRequest();

    expect(collection?.auth).toBe(`Discogs token=${DEMO_TOKEN}`);
    expect(collection?.url).toContain("/users/demo-account/");
  });

  it("takes the account from the token when no cookie is present", async () => {
    const { collection } = await collectionRequest();

    expect(collection?.url).toContain("/users/demo-account/collection");
  });

  it("asks Discogs who the demo token belongs to only once", async () => {
    const { withAuth } = await loadApi();
    const { fetchCollectionPage } = await import("./discogs/collection");

    for (let i = 0; i < 3; i++) {
      await withAuth(async (auth, username) => {
        await fetchCollectionPage(auth, username, 1);
        return new Response("ok");
      });
    }

    const identityCalls = sent.filter((request) =>
      request.url.includes("/oauth/identity"),
    );
    expect(identityCalls).toHaveLength(1);
  });

  it("does not treat a demo cookie as a session once the demo is switched off", async () => {
    delete process.env.DISCOGS_DEMO_TOKEN;

    const { response, collection } = await collectionRequest();

    expect(response.status).toBe(401);
    expect(collection).toBeUndefined();
  });
});

describe("withAuth: a visitor's own token", () => {
  beforeEach(() => {
    jar.set("discogs_token", "the-visitors-own-token");
  });

  it("uses the username cookie, saving the identity round trip", async () => {
    jar.set("discogs_user", "the-visitor");

    const { collection } = await collectionRequest();

    expect(collection?.url).toContain("/users/the-visitor/collection");
    expect(sent.some((r) => r.url.includes("/oauth/identity"))).toBe(false);
  });

  it("falls back to the identity endpoint when the cookie is missing", async () => {
    replies = [() => identityBody("recovered-name"), collectionBody];

    const { collection } = await collectionRequest();

    expect(collection?.url).toContain("/users/recovered-name/collection");
  });

  it("sends the visitor's own token, never the deployment's", async () => {
    process.env.DISCOGS_DEMO_TOKEN = DEMO_TOKEN;
    jar.set("discogs_user", "the-visitor");

    const { collection } = await collectionRequest();

    expect(collection?.auth).toBe("Discogs token=the-visitors-own-token");
  });
});

describe("withAuth: sessions Discogs no longer accepts", () => {
  it("refuses a request with no credential at all", async () => {
    const { response } = await collectionRequest();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Not signed in to Discogs.",
    });
  });

  it("clears the session when Discogs rejects the token", async () => {
    jar.set("discogs_token", "revoked");
    jar.set("discogs_user", "the-visitor");
    replies = [
      () =>
        new Response(JSON.stringify({ message: "Invalid token." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    ];

    const { response } = await collectionRequest();

    expect(response.status).toBe(401);
    expect(jar.has("discogs_token")).toBe(false);
    expect(jar.has("discogs_user")).toBe(false);
  });

  it("keeps the session when Discogs merely errors", async () => {
    jar.set("discogs_token", "fine");
    jar.set("discogs_user", "the-visitor");
    replies = [
      () =>
        new Response(JSON.stringify({ message: "Service unavailable." }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    ];

    const { response } = await collectionRequest();

    expect(response.status).toBe(503);
    expect(jar.has("discogs_token")).toBe(true);
  });
});

describe("getAuthStrategy: which credential wins", () => {
  it("prefers a real sign-in over a lingering demo cookie", async () => {
    process.env.DISCOGS_DEMO_TOKEN = DEMO_TOKEN;
    jar.set("discogs_demo", "1");
    jar.set("discogs_token", "the-visitors-own-token");
    jar.set("discogs_user", "the-visitor");

    const { collection } = await collectionRequest();

    expect(collection?.auth).toBe("Discogs token=the-visitors-own-token");
  });

  it("prefers OAuth over a pasted token", async () => {
    process.env.DISCOGS_CONSUMER_KEY = "key";
    process.env.DISCOGS_CONSUMER_SECRET = "secret";
    jar.set("discogs_oauth_token", "oauth-token");
    jar.set("discogs_oauth_secret", "oauth-secret");
    jar.set("discogs_token", "the-visitors-own-token");
    jar.set("discogs_user", "the-visitor");

    const { collection } = await collectionRequest();

    expect(collection?.auth).toMatch(/^OAuth /);
    expect(collection?.auth).toContain('oauth_token="oauth-token"');
    expect(collection?.auth).not.toContain("the-visitors-own-token");
  });

  it("ignores OAuth cookies when the app has no consumer credentials", async () => {
    jar.set("discogs_oauth_token", "oauth-token");
    jar.set("discogs_oauth_secret", "oauth-secret");
    jar.set("discogs_token", "the-visitors-own-token");
    jar.set("discogs_user", "the-visitor");

    const { collection } = await collectionRequest();

    expect(collection?.auth).toBe("Discogs token=the-visitors-own-token");
  });
});
