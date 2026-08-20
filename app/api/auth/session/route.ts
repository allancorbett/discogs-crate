import {
  clearSession,
  getAuthStrategy,
  getSessionUsername,
  isDemoConfigured,
  isDemoSession,
  isOAuthConfigured,
} from "@/lib/discogs/auth";
import { DiscogsApiError } from "@/lib/discogs/client";
import { fetchIdentity } from "@/lib/discogs/collection";
import type { SessionInfo } from "@/lib/discogs/types";

/**
 * Drives the sign-in gate on load. This does hit Discogs rather than trusting
 * the cookie blindly: it costs one request against a 60/min budget and means a
 * revoked token sends the user back to the gate immediately instead of
 * breaking further in.
 *
 * The same request answers who the credential belongs to, so the username the
 * app then displays and files its cache under comes from Discogs rather than
 * from a cookie the visitor could have edited.
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
    const { username } = await fetchIdentity(auth);

    return Response.json({
      authenticated: true,
      username,
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
    // and let the collection request surface the real problem. The cookie is
    // only trusted for the name on screen here — never to choose an account to
    // fetch, which is why a demo session falls back to no name at all.
    console.error("Session check failed", error);
    const username = demo ? null : await getSessionUsername();
    return Response.json(
      username
        ? { authenticated: true, username, demo, demoAvailable, oauthAvailable }
        : signedOut,
    );
  }
}
