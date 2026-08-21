import { cookies } from "next/headers";
import {
  type OAuthConsumer,
  oauthAuthorizationHeader,
  oauthConsumer,
} from "./oauth";

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

/**
 * A user who signed in through the OAuth 1.0a flow. Unlike the token strategy,
 * this one genuinely needs both arguments: an OAuth 1.0a signature is computed
 * over the request's method and full URL, so every call gets its own header.
 */
export class OAuth1Strategy implements AuthStrategy {
  constructor(
    private readonly consumer: OAuthConsumer,
    private readonly token: string,
    private readonly tokenSecret: string,
  ) {}

  authHeader(method: string, url: string): Promise<string> {
    return oauthAuthorizationHeader({
      method,
      url,
      consumer: this.consumer,
      token: this.token,
      tokenSecret: this.tokenSecret,
    });
  }
}

const SESSION_COOKIE = "discogs_token";
const USER_COOKIE = "discogs_user";
const DEMO_COOKIE = "discogs_demo";
const OAUTH_TOKEN_COOKIE = "discogs_oauth_token";
const OAUTH_SECRET_COOKIE = "discogs_oauth_secret";
/** Holds the *request* token secret for the few seconds the flow is in flight. */
const OAUTH_PENDING_COOKIE = "discogs_oauth_pending";

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
 * Shared shape for every session cookie this app sets.
 *
 * `httpOnly` is on for all of them, the username included. Nothing on the
 * client reads it — the UI gets the name from `/api/auth/session` — so leaving
 * it script-readable only offered an injected script one more thing to take.
 * It is worth being clear about what this does and does not buy: `httpOnly`
 * stops scripts reading a cookie, not a person retyping one in devtools, so
 * the server still never trusts the username to choose whose collection to
 * fetch. See `resolveUsername` in lib/api.ts.
 */
function sessionCookie(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
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
  const base = sessionCookie(COOKIE_MAX_AGE);
  store.set(SESSION_COOKIE, token, base);
  store.set(USER_COOKIE, username, base);
}

/**
 * Starts a demo session. Only a marker is stored — deliberately not the token.
 * `httpOnly` stops *scripts* reading a cookie, but any visitor can read a
 * cookie's value straight out of devtools, so putting the shared demo token in
 * one would hand it to everyone who tried the demo.
 */
export async function setDemoSession(username: string): Promise<void> {
  const store = await cookies();
  const base = sessionCookie(DEMO_MAX_AGE);
  store.set(DEMO_COOKIE, "1", base);
  store.set(USER_COOKIE, username, base);
}

/** Stores the access token from a completed OAuth flow. */
export async function setOAuthSession(
  token: string,
  tokenSecret: string,
  username: string,
): Promise<void> {
  const store = await cookies();
  const base = sessionCookie(COOKIE_MAX_AGE);
  store.set(OAUTH_TOKEN_COOKIE, token, base);
  store.set(OAUTH_SECRET_COOKIE, tokenSecret, base);
  store.set(USER_COOKIE, username, base);
  store.delete(OAUTH_PENDING_COOKIE);
}

/**
 * Parks the in-flight request token while the user is away at Discogs
 * approving the app. Short-lived: if they never come back, it should not
 * linger.
 */
export async function setPendingOAuth(
  token: string,
  tokenSecret: string,
): Promise<void> {
  const store = await cookies();
  store.set(
    OAUTH_PENDING_COOKIE,
    `${token}:${tokenSecret}`,
    sessionCookie(15 * 60),
  );
}

export async function takePendingOAuth(): Promise<{
  token: string;
  tokenSecret: string;
} | null> {
  const store = await cookies();
  const raw = store.get(OAUTH_PENDING_COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.indexOf(":");
  if (separator < 1) return null;

  return {
    token: raw.slice(0, separator),
    tokenSecret: raw.slice(separator + 1),
  };
}

export async function clearPendingOAuth(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_PENDING_COOKIE);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(USER_COOKIE);
  store.delete(DEMO_COOKIE);
  store.delete(OAUTH_TOKEN_COOKIE);
  store.delete(OAUTH_SECRET_COOKIE);
  store.delete(OAUTH_PENDING_COOKIE);
}

export async function isDemoSession(): Promise<boolean> {
  const store = await cookies();
  return store.get(DEMO_COOKIE)?.value === "1" && isDemoConfigured();
}

/**
 * Returns null when the visitor has not authenticated yet.
 *
 * Order matters: a real sign-in — OAuth first, then a pasted token — always
 * beats a lingering demo cookie, so signing in properly does what you'd expect
 * without having to leave the demo first. The demo token is resolved from the
 * environment here, per request, and never leaves the server.
 */
export async function getAuthStrategy(): Promise<AuthStrategy | null> {
  const store = await cookies();

  const oauthToken = store.get(OAUTH_TOKEN_COOKIE)?.value;
  const oauthSecret = store.get(OAUTH_SECRET_COOKIE)?.value;
  const consumer = oauthConsumer();
  if (oauthToken && oauthSecret && consumer) {
    return new OAuth1Strategy(consumer, oauthToken, oauthSecret);
  }

  const token = store.get(SESSION_COOKIE)?.value;
  if (token) return new PersonalTokenStrategy(token);

  if (store.get(DEMO_COOKIE)?.value === "1") {
    const demo = demoToken();
    // The demo may have been switched off since the cookie was set.
    if (demo) return new PersonalTokenStrategy(demo);
  }

  return null;
}

export function isOAuthConfigured(): boolean {
  return oauthConsumer() !== null;
}

export async function getSessionUsername(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}
