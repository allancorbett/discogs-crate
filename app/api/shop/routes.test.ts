import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two public routes behind the shareable shop: someone's public
 * collection, and sleeve art for WebGL. Neither needs a session, so both are
 * checked for what they will and won't spend, and where they will reach.
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

interface Sent {
  url: string;
  init: RequestInit;
}
const sent: Sent[] = [];
let reply: () => Response = () => collection();

vi.stubGlobal("fetch", async (url: string | URL, init: RequestInit = {}) => {
  sent.push({ url: String(url), init });
  return reply();
});

const collection = () =>
  new Response(
    JSON.stringify({
      pagination: { page: 1, pages: 1, items: 0 },
      releases: [],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const authOf = (request: Sent) =>
  (request.init.headers as Record<string, string>).Authorization;

let ip = 0;
function get(path: string) {
  // A fresh client per request, so the rate limit never gets in the way.
  return new NextRequest(`https://crate.example.com${path}`, {
    headers: { "x-forwarded-for": `10.0.0.${++ip % 250}` },
  });
}

async function shop(username: string, page = 1) {
  const { GET } = await import("./[username]/route");
  return GET(get(`/api/shop/${username}?page=${page}`), {
    params: Promise.resolve({ username }),
  });
}

beforeEach(() => {
  vi.resetModules();
  jar.clear();
  sent.length = 0;
  reply = () => collection();
  process.env.DISCOGS_DEMO_TOKEN = "server-side-demo-token";
});

describe("GET /api/shop/[username]", () => {
  it("refuses anything that isn't a Discogs username", async () => {
    for (const name of ["..", "a b", "a/b"]) {
      expect((await shop(name)).status).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });

  it("reads the named collection without any credential for a stranger", async () => {
    const response = await shop("someone");

    expect(response.status).toBe(200);
    expect(sent[0].url).toContain("/users/someone/collection/");
    expect(authOf(sent[0])).toBeUndefined();
  });

  it("never spends the demo token on an account the visitor named", async () => {
    jar.set("discogs_demo", "1");

    await shop("someone-else");

    expect(sent[0].url).toContain("/users/someone-else/");
    expect(authOf(sent[0])).toBeUndefined();
  });

  it("lets a signed-in visitor spend their own token", async () => {
    jar.set("discogs_token", "visitors-own");

    await shop("someone");

    expect(authOf(sent[0])).toBe("Discogs token=visitors-own");
  });

  it("says a private collection is private, without signing anyone out", async () => {
    jar.set("discogs_token", "visitors-own");
    reply = () => new Response(JSON.stringify({ message: "nope" }), { status: 403 });

    const response = await shop("private-person");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "That collection is private on Discogs.",
    });
    expect(jar.get("discogs_token")).toBe("visitors-own");
  });

  it("remembers anonymous pages rather than asking Discogs again", async () => {
    const { GET } = await import("./[username]/route");
    const call = () =>
      GET(get("/api/shop/popular?page=1"), {
        params: Promise.resolve({ username: "popular" }),
      });

    await call();
    await call();

    expect(sent).toHaveLength(1);
  });
});

describe("GET /api/cover", () => {
  const COVER = "https://i.discogs.com/abc/rs:fit/w:600/cover.jpeg";

  async function cover(u: string) {
    const { GET } = await import("../cover/route");
    return GET(get(`/api/cover?u=${encodeURIComponent(u)}`));
  }

  it("serves Discogs sleeve art from our own origin, cached for good", async () => {
    reply = () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/jpeg" },
      });

    const response = await cover(COVER);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    // A redirect off Discogs' CDN is refused rather than followed.
    expect(sent[0].init.redirect).toBe("error");
  });

  it("will not fetch from anywhere else", async () => {
    for (const u of [
      "https://evil.example/a.jpg",
      "http://169.254.169.254/latest/meta-data",
      "https://i.discogs.com.evil.example/a.jpg",
    ]) {
      expect((await cover(u)).status).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });

  it("refuses to pass on something that isn't an image", async () => {
    reply = () =>
      new Response("<html></html>", { headers: { "content-type": "text/html" } });

    expect((await cover(COVER)).status).toBe(502);
  });
});
