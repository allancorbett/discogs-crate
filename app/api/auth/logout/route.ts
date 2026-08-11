import { clearSession } from "@/lib/discogs/auth";
import type { SessionInfo } from "@/lib/discogs/types";

export async function POST(): Promise<Response> {
  await clearSession();
  return Response.json({ authenticated: false } satisfies SessionInfo);
}
