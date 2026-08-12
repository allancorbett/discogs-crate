import type { NextRequest } from "next/server";
import { setPendingOAuth } from "@/lib/discogs/auth";
import {
  OAuthFlowError,
  authorizeUrl,
  fetchRequestToken,
  oauthConsumer,
} from "@/lib/discogs/oauth";
import { callbackUrl, gateUrl } from "../shared";

/**
 * Leg one of the OAuth dance: take a request token, park its secret in a
 * short-lived cookie, and send the user to Discogs to approve the app.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const consumer = oauthConsumer();
  if (!consumer) {
    return Response.redirect(gateUrl(request, "oauth_unconfigured"), 302);
  }

  try {
    const requestToken = await fetchRequestToken(
      consumer,
      callbackUrl(request),
    );
    await setPendingOAuth(requestToken.token, requestToken.tokenSecret);

    return Response.redirect(authorizeUrl(requestToken.token), 302);
  } catch (error) {
    console.error(
      "Could not get a Discogs request token",
      error instanceof OAuthFlowError ? error.message : error,
    );
    return Response.redirect(gateUrl(request, "oauth_failed"), 302);
  }
}
