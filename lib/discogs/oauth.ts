import { userAgent } from "./client";

/**
 * OAuth 1.0a signing for Discogs, which supports no other OAuth version.
 *
 * Discogs accepts PLAINTEXT signatures, where the signature is simply the two
 * secrets concatenated. HMAC-SHA1 is used here instead: both travel over TLS,
 * but PLAINTEXT puts the consumer secret in an Authorization header on every
 * single API call, and request headers routinely end up in proxy logs, error
 * trackers and platform request logs. HMAC keeps the secrets local.
 */

const REQUEST_TOKEN_URL = "https://api.discogs.com/oauth/request_token";
const AUTHORIZE_URL = "https://www.discogs.com/oauth/authorize";
const ACCESS_TOKEN_URL = "https://api.discogs.com/oauth/access_token";

export interface OAuthConsumer {
  key: string;
  secret: string;
}

export interface OAuthToken {
  token: string;
  tokenSecret: string;
}

/** Null when the deployment hasn't been given Discogs app credentials. */
export function oauthConsumer(): OAuthConsumer | null {
  const key = process.env.DISCOGS_CONSUMER_KEY?.trim();
  const secret = process.env.DISCOGS_CONSUMER_SECRET?.trim();
  return key && secret ? { key, secret } : null;
}

/**
 * RFC 3986 percent-encoding. `encodeURIComponent` leaves !*'() alone, but
 * OAuth requires everything outside the unreserved set to be escaped — a
 * mismatch here silently breaks signatures for a minority of inputs.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function hmacSha1Base64(
  key: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * The signature base string: method, URL and every parameter, normalized so
 * both sides derive an identical string. Parameters are kept as pairs rather
 * than an object because OAuth permits repeated keys and sorts on the value to
 * break ties — collapsing them into an object would quietly drop one.
 */
export function signatureBaseString(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
): string {
  const target = new URL(url);

  const pairs: [string, string][] = Object.entries(oauthParams).map(
    ([key, value]) => [percentEncode(key), percentEncode(value)],
  );
  for (const [key, value] of target.searchParams) {
    pairs.push([percentEncode(key), percentEncode(value)]);
  }

  pairs.sort((a, b) => (a[0] === b[0] ? compare(a[1], b[1]) : compare(a[0], b[0])));

  const normalized = pairs.map(([key, value]) => `${key}=${value}`).join("&");
  // The base URL excludes the query string and any default port.
  const baseUrl = `${target.origin}${target.pathname}`;

  return [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(normalized),
  ].join("&");
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function signingKey(consumerSecret: string, tokenSecret = ""): string {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}

/**
 * Builds a signed `Authorization: OAuth …` header. This is what the
 * `AuthStrategy` seam calls per request — the signature covers the method and
 * URL, which is why the strategy interface takes both rather than caching a
 * header string.
 */
export async function oauthAuthorizationHeader(options: {
  method: string;
  url: string;
  consumer: OAuthConsumer;
  token?: string;
  tokenSecret?: string;
  /** Flow-only parameters: oauth_callback, oauth_verifier. */
  extra?: Record<string, string>;
}): Promise<string> {
  const params: Record<string, string> = {
    oauth_consumer_key: options.consumer.key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...(options.token ? { oauth_token: options.token } : {}),
    ...options.extra,
  };

  const signature = await hmacSha1Base64(
    signingKey(options.consumer.secret, options.tokenSecret),
    signatureBaseString(options.method, options.url, params),
  );

  return `OAuth ${Object.entries({ ...params, oauth_signature: signature })
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

// ---------------------------------------------------------------------------
// The three-legged flow
// ---------------------------------------------------------------------------

export class OAuthFlowError extends Error {}

/** Discogs answers the token endpoints with a form-encoded body. */
function parseTokenResponse(body: string): OAuthToken {
  const params = new URLSearchParams(body);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");

  if (!token || !tokenSecret) {
    throw new OAuthFlowError("Discogs did not return an OAuth token.");
  }
  return { token, tokenSecret };
}

async function requestToken(url: string, header: string): Promise<OAuthToken> {
  const response = await fetch(url, {
    headers: { Authorization: header, "User-Agent": userAgent() },
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    // Discogs returns the reason as plain text here, not JSON.
    throw new OAuthFlowError(body.trim() || `Discogs returned ${response.status}`);
  }
  return parseTokenResponse(body);
}

/** Leg one: a temporary token, tied to the callback we want to come back to. */
export async function fetchRequestToken(
  consumer: OAuthConsumer,
  callbackUrl: string,
): Promise<OAuthToken> {
  const header = await oauthAuthorizationHeader({
    method: "GET",
    url: REQUEST_TOKEN_URL,
    consumer,
    extra: { oauth_callback: callbackUrl },
  });
  return requestToken(REQUEST_TOKEN_URL, header);
}

/** Leg two: where the user goes to approve the app. */
export function authorizeUrl(requestTokenValue: string): string {
  return `${AUTHORIZE_URL}?oauth_token=${percentEncode(requestTokenValue)}`;
}

/** Leg three: swap the approved request token for a long-lived access token. */
export async function fetchAccessToken(
  consumer: OAuthConsumer,
  request: OAuthToken,
  verifier: string,
): Promise<OAuthToken> {
  const header = await oauthAuthorizationHeader({
    method: "GET",
    url: ACCESS_TOKEN_URL,
    consumer,
    token: request.token,
    tokenSecret: request.tokenSecret,
    extra: { oauth_verifier: verifier },
  });
  return requestToken(ACCESS_TOKEN_URL, header);
}
