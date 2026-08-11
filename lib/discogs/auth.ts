import { cookies } from "next/headers";

/**
 * The seam between this app and Discogs' two authentication schemes.
 *
 * Discogs supports personal access tokens and OAuth **1.0a** (there is no
 * OAuth 2 flow). An OAuth 1.0a signature is computed over the HTTP method and
 * the full request URL, so the credential cannot be a fixed header string —
 * hence `authHeader(method, url)` rather than a plain property. Everything
 * downstream (`client.ts` and every route handler) only ever calls this
 * method, so adding OAuth later means writing one new strategy plus the two
 * redirect routes, and changing nothing else.
 */
export interface AuthStrategy {
  authHeader(method: string, url: string): Promise<string>;
}

/**
 * Personal access token from https://www.discogs.com/settings/developers.
 * The signature ignores method and url — that's the whole point of the seam.
 */
export class PersonalTokenStrategy implements AuthStrategy {
  constructor(private readonly token: string) {}

  async authHeader(_method: string, _url: string): Promise<string> {
    return `Discogs token=${this.token}`;
  }
}

export const SESSION_COOKIE = "discogs_token";
export const USER_COOKIE = "discogs_user";
export const DEMO_COOKIE = "discogs_demo";

/** A year. Discogs personal tokens do not expire on their own. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A demo browses someone else's collection; a day is plenty. */
const DEMO_MAX_AGE = 60 * 60 * 24;

/**
 * The token behind the optional "try the demo" mode, read fresh from the
 * environment on every request. It is never written to a cookie or sent to a
 * browser in any form — see `getAuthStrategy` for why that distinction
 * matters.
 */
export function demoToken(): string | null {
  return process.env.DISCOGS_DEMO_TOKEN?.trim() || null;
}

export function isDemoConfigured(): boolean {
  return demoToken() !== null;
}

/**
 * The token lives in an httpOnly cookie so client JS can never read it; the
 * browser only ever talks to our own routes, which attach the credential
 * server-side. The username is stored alongside it — not a secret, and having
 * it saves an identity round trip on every collection page request.
 */
export async function setSession(
  token: string,
  username: string,
): Promise<void> {
  const store = await cookies();
  const base = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
  store.set(SESSION_COOKIE, token, { ...base, httpOnly: true });
  store.set(USER_COOKIE, username, { ...base, httpOnly: false });
}

/**
 * Starts a demo session. Only a marker is stored — deliberately not the token.
 * `httpOnly` stops *scripts* reading a cookie, but any visitor can read a
 * cookie's value straight out of devtools, so putting the shared demo token in
 * one would hand it to everyone who tried the demo.
 */
export async function setDemoSession(username: string): Promise<void> {
  const store = await cookies();
  const base = {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEMO_MAX_AGE,
  };
  store.set(DEMO_COOKIE, "1", { ...base, httpOnly: true });
  store.set(USER_COOKIE, username, { ...base, httpOnly: false });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
  store.delete(DEMO_COOKIE);
}

export async function isDemoSession(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1" && isDemoConfigured();
}

/**
 * Returns null when the visitor has not authenticated yet.
 *
 * A visitor's own token takes precedence over the demo, so signing in properly
 * while a demo cookie lingers does what you'd expect. The demo token is
 * resolved from the environment here, per request, and never leaves the server.
 */
export async function getAuthStrategy(): Promise<AuthStrategy | null> {
  const store = await cookies();

  const token = store.get(SESSION_COOKIE)?.value;
  if (token) return new PersonalTokenStrategy(token);

  if (store.get(DEMO_COOKIE)?.value === "1") {
    const demo = demoToken();
    // The demo may have been switched off since the cookie was set.
    if (demo) return new PersonalTokenStrategy(demo);
  }

  return null;
}

export async function getSessionUsername(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}
