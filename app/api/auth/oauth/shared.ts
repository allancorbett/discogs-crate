import type { NextRequest } from "next/server";

/** Thrown when the app's own origin cannot be established safely. */
export class UntrustedOriginError extends Error {}

/**
 * The app's public origin, needed to tell Discogs where to send the user back
 * to.
 *
 * Deriving it from the request is convenient — localhost and Vercel previews
 * each get their own correct callback with no configuration — but the incoming
 * host headers are only as trustworthy as the proxy in front of us, and Next
 * honours `X-Forwarded-Host`. A forged one is enough to complete somebody
 * else's sign-in: the attacker starts the flow with a callback pointing at
 * their own host, so the request token secret lands in *their* pending cookie,
 * and the verifier Discogs delivers after the victim approves gives them both
 * halves of the exchange. The `oauth_token` check in the callback route does
 * not help, because both sides of that comparison are theirs.
 *
 * So the convenience stays in development and production must pin the origin.
 */
function origin(request: NextRequest): string {
  const configured = process.env.DISCOGS_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new UntrustedOriginError(
      "DISCOGS_APP_URL must be set to use Discogs sign-in in production.",
    );
  }

  return request.nextUrl.origin;
}

export function callbackUrl(request: NextRequest): string {
  return `${origin(request)}/api/auth/oauth/callback`;
}

/**
 * Back to the sign-in screen, carrying a reason the gate can explain.
 *
 * Deliberately a relative Location: every failure path leads here, including
 * the one where the origin is the thing that could not be trusted, and a
 * same-document redirect needs no origin at all.
 */
export function gateRedirect(error?: string): Response {
  const target = error
    ? `/?error=${encodeURIComponent(error)}`
    : "/";

  return new Response(null, { status: 302, headers: { Location: target } });
}
