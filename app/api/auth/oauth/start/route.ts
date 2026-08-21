import type { NextRequest } from "next/server";
import { setPendingOAuth } from "@/lib/discogs/auth";
import {
  OAuthFlowError,
  authorizeUrl,
  fetchRequestToken,
  oauthConsumer,
} from "@/lib/discogs/oauth";
import { UntrustedOriginError, callbackUrl, gateRedirect } from "../shared";

/**
 * Leg one of the OAuth dance: take a request token, park its secret in a
 * short-lived cookie, and send the user to Discogs to approve the app.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const consumer = oauthConsumer();
  if (!consumer) return gateRedirect("oauth_unconfigured");

  let callback: string;
  try {
    callback = callbackUrl(request);
  } catch (error) {
    // A deployment with OAuth credentials but no pinned origin. Refusing is
    // the whole point — see the note in shared.ts.
    console.error(
      "Refusing to start the Discogs OAuth flow",
      error instanceof UntrustedOriginError ? error.message : error,
    );
    return gateRedirect("oauth_unconfigured");
  }

  try {
    const requestToken = await fetchRequestToken(consumer, callback);
    await setPendingOAuth(requestToken.token, requestToken.tokenSecret);

    return Response.redirect(authorizeUrl(requestToken.token), 302);
  } catch (error) {
    console.error(
      "Could not get a Discogs request token",
      error instanceof OAuthFlowError ? error.message : error,
    );
    return gateRedirect("oauth_failed");
  }
}
