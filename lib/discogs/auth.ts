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

/** A year. Discogs personal tokens do not expire on their own. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
}

/** Returns null when the visitor has not authenticated yet. */
export async function getAuthStrategy(): Promise<AuthStrategy | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? new PersonalTokenStrategy(token) : null;
}

export async function getSessionUsername(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}
