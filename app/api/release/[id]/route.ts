import { jsonError, withAuth } from "@/lib/api";
import { fetchRelease } from "@/lib/discogs/collection";

/**
 * Extended metadata for one release — tracklist, credits and the
 * community-contributed video links — fetched only when a detail panel opens.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/release/[id]">,
): Promise<Response> {
  const { id } = await ctx.params;
  const releaseId = Number(id);

  if (!Number.isInteger(releaseId) || releaseId < 1) {
    return jsonError("Invalid release id.", 400);
  }

  return withAuth(async (auth) =>
    Response.json(await fetchRelease(auth, releaseId)),
  );
}
