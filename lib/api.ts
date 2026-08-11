import { clearSession, getAuthStrategy, getSessionUsername } from "./discogs/auth";
import type { AuthStrategy } from "./discogs/auth";
import { DiscogsApiError } from "./discogs/client";
import { fetchIdentity } from "./discogs/collection";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Wraps a route handler with the session lookup and error mapping every
 * Discogs-backed route needs. A 401 from Discogs means the stored token has
 * been revoked, so the session is cleared and the client falls back to the
 * sign-in gate rather than retrying forever with a dead credential.
 */
export async function withAuth(
  handler: (auth: AuthStrategy, username: string) => Promise<Response>,
): Promise<Response> {
  const auth = await getAuthStrategy();
  if (!auth) return jsonError("Not signed in to Discogs.", 401);

  let username = await getSessionUsername();

  try {
    if (!username) username = (await fetchIdentity(auth)).username;
    return await handler(auth, username);
  } catch (error) {
    if (error instanceof DiscogsApiError) {
      if (error.status === 401 || error.status === 403) {
        await clearSession();
        return jsonError("Your Discogs token is no longer valid.", 401);
      }
      return jsonError(error.message, error.status);
    }
    console.error("Unexpected Discogs failure", error);
    return jsonError("Could not reach Discogs. Try again.", 502);
  }
}
