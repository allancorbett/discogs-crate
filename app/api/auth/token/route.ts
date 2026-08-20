import { jsonError } from "@/lib/api";
import { PersonalTokenStrategy, setSession } from "@/lib/discogs/auth";
import { DiscogsApiError } from "@/lib/discogs/client";
import { fetchIdentity } from "@/lib/discogs/collection";
import type { SessionInfo } from "@/lib/discogs/types";
import { guardPost } from "@/lib/guard";

/**
 * Exchanges a personal access token for a session. The token is verified
 * against /oauth/identity before it is stored, so a bad paste fails here with
 * a clear message instead of surfacing as a mysterious empty collection later.
 */
export async function POST(request: Request): Promise<Response> {
  // The JSON content type already forces a preflight, so this is mostly about
  // the second job this route can be put to: it answers, quickly and
  // distinguishably, whether an arbitrary Discogs token is still live. Ten
  // tries a minute is plenty for someone fixing a bad paste and useless for
  // walking a stolen list.
  const refused = guardPost(request, { limit: 10, bucket: "token" });
  if (refused) return refused;

  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  if (typeof token !== "string" || !token.trim()) {
    return jsonError("Paste your Discogs personal access token.", 400);
  }

  const auth = new PersonalTokenStrategy(token.trim());

  try {
    const identity = await fetchIdentity(auth);
    await setSession(token.trim(), identity.username);

    return Response.json({
      authenticated: true,
      username: identity.username,
    } satisfies SessionInfo);
  } catch (error) {
    if (error instanceof DiscogsApiError) {
      if (error.status === 401 || error.status === 403) {
        return jsonError(
          "Discogs did not accept that token. Check you copied all of it.",
          401,
        );
      }
      console.error("Token verification failed", error.status, error.message);
      return jsonError("Discogs could not verify that token.", error.status);
    }
    console.error("Token verification failed", error);
    return jsonError("Could not reach Discogs. Try again.", 502);
  }
}
