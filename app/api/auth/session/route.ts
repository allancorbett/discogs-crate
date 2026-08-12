import {
  clearSession,
  getAuthStrategy,
  getSessionUsername,
  isDemoConfigured,
  isDemoSession,
  isOAuthConfigured,
} from "@/lib/discogs/auth";
import { DiscogsApiError } from "@/lib/discogs/client";
import { fetchIdentity, fetchProfile } from "@/lib/discogs/collection";
import type { SessionInfo } from "@/lib/discogs/types";

/**
 * Drives the sign-in gate on load. This does hit Discogs rather than trusting
 * the cookie blindly: it costs one request against a 60/min budget and means a
 * revoked token sends the user back to the gate immediately instead of
 * breaking further in.
 */
export async function GET(): Promise<Response> {
  const demoAvailable = isDemoConfigured();
  const oauthAvailable = isOAuthConfigured();
  const signedOut: SessionInfo = {
    authenticated: false,
    demoAvailable,
    oauthAvailable,
  };

  const auth = await getAuthStrategy();
  if (!auth) return Response.json(signedOut);

  const demo = await isDemoSession();

  try {
    const username =
      (await getSessionUsername()) ?? (await fetchIdentity(auth)).username;
    const profile = await fetchProfile(auth, username);

    return Response.json({
      authenticated: true,
      username,
      avatarUrl: profile.avatar_url,
      demo,
      demoAvailable,
      oauthAvailable,
    } satisfies SessionInfo);
  } catch (error) {
    if (
      error instanceof DiscogsApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      await clearSession();
      return Response.json(signedOut);
    }
    // A network blip shouldn't sign the user out; report the session as live
    // and let the collection request surface the real problem.
    console.error("Session check failed", error);
    const username = await getSessionUsername();
    return Response.json(
      username
        ? { authenticated: true, username, demo, demoAvailable, oauthAvailable }
        : signedOut,
    );
  }
}
