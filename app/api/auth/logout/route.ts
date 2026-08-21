import { clearSession } from "@/lib/discogs/auth";
import { guardPost } from "@/lib/guard";
import type { SessionInfo } from "@/lib/discogs/types";

export async function POST(request: Request): Promise<Response> {
  // Nothing here costs a Discogs request, so an origin check is enough: it
  // stops a page elsewhere signing the visitor out behind their back.
  const refused = guardPost(request);
  if (refused) return refused;

  await clearSession();
  return Response.json({ authenticated: false } satisfies SessionInfo);
}
