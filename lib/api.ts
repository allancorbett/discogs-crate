import {
  clearSession,
  getAuthStrategy,
  getSessionUsername,
  isDemoSession,
} from "./discogs/auth";
import type { AuthStrategy } from "./discogs/auth";
import { DiscogsApiError } from "./discogs/client";
import { fetchIdentity } from "./discogs/collection";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * The demo account's username, resolved from the token once per process.
 *
 * The demo credential is fixed for the lifetime of the deployment, so asking
 * Discogs who it belongs to on every request would spend the rate limit the
 * demo is already short of. A rejected lookup clears the memo so a transient
 * failure doesn't stick.
 */
let demoUsername: Promise<string> | null = null;

function resolveDemoUsername(auth: AuthStrategy): Promise<string> {
  demoUsername ??= fetchIdentity(auth)
    .then((identity) => identity.username)
    .catch((error: unknown) => {
      demoUsername = null;
      throw error;
    });

  return demoUsername;
}

/**
 * Whose collection this request is for.
 *
 * The username decides which Discogs account every downstream URL points at,
 * so where it comes from is a trust boundary rather than a detail. A cookie is
 * the visitor's to edit — `httpOnly` stops scripts reading one, not a person
 * retyping it in devtools — which is fine while the credential travelling with
 * it is also theirs: aiming their own token at another account buys them
 * nothing they could not get from Discogs directly.
 *
 * A demo session is the case where that stops holding. The credential there is
 * the deployment's own token, held server-side precisely so visitors never get
 * it; honouring a username they chose would hand them the use of it against
 * any account they name. So the demo resolves who it is from the token itself
 * and ignores the cookie entirely.
 */
async function resolveUsername(auth: AuthStrategy): Promise<string> {
  if (await isDemoSession()) return resolveDemoUsername(auth);

  return (await getSessionUsername()) ?? (await fetchIdentity(auth)).username;
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

  try {
    return await handler(auth, await resolveUsername(auth));
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
