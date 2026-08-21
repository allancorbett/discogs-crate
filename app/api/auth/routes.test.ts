import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The unauthenticated POST routes, exercised end to end: a page on another
 * origin must not be able to sign someone out, start a demo in their browser,
 * or walk a list of tokens through the sign-in check.
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

vi.stubGlobal("fetch", async () =>
  new Response(JSON.stringify({ username: "demo-account", id: 1 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
);

const HOST = "crate.example.com";

function post(path: string, origin: string | null, body?: unknown) {
  const headers: Record<string, string> = { host: HOST };
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";

  return new Request(`https://${HOST}${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ours = `https://${HOST}`;
const theirs = "https://evil.example";

beforeEach(() => {
  vi.resetModules();
  jar.clear();
  process.env.DISCOGS_DEMO_TOKEN = "server-side-demo-token";
  delete process.env.DISCOGS_APP_URL;
});

describe("POST /api/auth/logout", () => {
  it("clears the session for the app's own page", async () => {
    jar.set("discogs_token", "live");
    jar.set("discogs_user", "the-visitor");
    const { POST } = await import("./logout/route");

    const response = await POST(post("/api/auth/logout", ours));

    expect(response.status).toBe(200);
    expect(jar.size).toBe(0);
  });

  it("refuses a sign-out triggered from another origin", async () => {
    jar.set("discogs_token", "live");
    const { POST } = await import("./logout/route");

    const response = await POST(post("/api/auth/logout", theirs));

    expect(response.status).toBe(403);
    expect(jar.get("discogs_token")).toBe("live");
  });
});

describe("POST /api/auth/demo", () => {
  it("starts a demo for the app's own page", async () => {
    const { POST } = await import("./demo/route");

    const response = await POST(post("/api/auth/demo", ours));

    expect(response.status).toBe(200);
    expect(jar.get("discogs_demo")).toBe("1");
  });

  it("refuses a demo started from another origin", async () => {
    const { POST } = await import("./demo/route");

    const response = await POST(post("/api/auth/demo", theirs));

    expect(response.status).toBe(403);
    expect(jar.has("discogs_demo")).toBe(false);
  });

  it("stops one client holding the demo token at its ceiling", async () => {
    const { POST } = await import("./demo/route");

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await POST(post("/api/auth/demo", ours))).status);
    }

    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});

describe("POST /api/auth/token", () => {
  it("refuses a token posted from another origin", async () => {
    const { POST } = await import("./token/route");

    const response = await POST(
      post("/api/auth/token", theirs, { token: "abc" }),
    );

    expect(response.status).toBe(403);
    expect(jar.has("discogs_token")).toBe(false);
  });

  it("limits how fast tokens can be checked for validity", async () => {
    const { POST } = await import("./token/route");

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (await POST(post("/api/auth/token", ours, { token: `t${i}` }))).status,
      );
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  it("still rejects a missing token with a message the user can act on", async () => {
    const { POST } = await import("./token/route");

    const response = await POST(post("/api/auth/token", ours, { token: "  " }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("Paste your Discogs personal access token.");
  });
});
