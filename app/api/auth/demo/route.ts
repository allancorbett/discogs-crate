import { jsonError } from "@/lib/api";
import {
  PersonalTokenStrategy,
  demoToken,
  setDemoSession,
} from "@/lib/discogs/auth";
import { DiscogsApiError } from "@/lib/discogs/client";
import { fetchIdentity } from "@/lib/discogs/collection";
import type { SessionInfo } from "@/lib/discogs/types";

/**
 * Starts a demo session against the collection behind `DISCOGS_DEMO_TOKEN`, so
 * someone can look around without generating a token of their own.
 *
 * The token stays server-side: this sets only a marker cookie, and every
 * subsequent request resolves the credential from the environment again.
 */
export async function POST(): Promise<Response> {
  const token = demoToken();
  if (!token) {
    return jsonError("No demo collection is configured for this app.", 404);
  }

  try {
    const identity = await fetchIdentity(new PersonalTokenStrategy(token));
    await setDemoSession(identity.username);

    return Response.json({
      authenticated: true,
      username: identity.username,
      demo: true,
      demoAvailable: true,
    } satisfies SessionInfo);
  } catch (error) {
    if (error instanceof DiscogsApiError) {
      // The deployment's own demo token is bad or revoked — the visitor can't
      // do anything about that, so don't dress it up as their mistake.
      console.error("Demo token rejected by Discogs", error);
      return jsonError("The demo is unavailable right now.", 503);
    }
    console.error("Demo sign-in failed", error);
    return jsonError("Could not reach Discogs. Try again.", 502);
  }
}
