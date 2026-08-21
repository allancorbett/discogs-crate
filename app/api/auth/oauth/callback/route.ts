import type { NextRequest } from "next/server";
import {
  clearPendingOAuth,
  OAuth1Strategy,
  setOAuthSession,
  takePendingOAuth,
} from "@/lib/discogs/auth";
import { fetchIdentity } from "@/lib/discogs/collection";
import {
  OAuthFlowError,
  fetchAccessToken,
  oauthConsumer,
} from "@/lib/discogs/oauth";
import { gateRedirect } from "../shared";

/**
 * Leg three: Discogs sends the user back here after they approve (or decline)
 * the app. Swap the approved request token for a long-lived access token and
 * open a session.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const token = params.get("oauth_token");
  const verifier = params.get("oauth_verifier");

  const consumer = oauthConsumer();
  if (!consumer) {
    return gateRedirect("oauth_unconfigured");
  }

  // Discogs sends the user back with no verifier when they decline.
  if (!token || !verifier) {
    await clearPendingOAuth();
    return gateRedirect("oauth_declined");
  }

  const pending = await takePendingOAuth();
  if (!pending) {
    return gateRedirect("oauth_expired");
  }

  // The returned token must be the one this browser started with — otherwise
  // someone else's approval is being replayed into this session.
  if (pending.token !== token) {
    await clearPendingOAuth();
    return gateRedirect("oauth_mismatch");
  }

  try {
    const access = await fetchAccessToken(
      consumer,
      { token: pending.token, tokenSecret: pending.tokenSecret },
      verifier,
    );

    // Who did we just sign in? Also proves the access token actually works
    // before it is stored.
    const identity = await fetchIdentity(
      new OAuth1Strategy(consumer, access.token, access.tokenSecret),
    );

    await setOAuthSession(access.token, access.tokenSecret, identity.username);
    return gateRedirect();
  } catch (error) {
    console.error(
      "OAuth access token exchange failed",
      error instanceof OAuthFlowError ? error.message : error,
    );
    await clearPendingOAuth();
    return gateRedirect("oauth_failed");
  }
}
