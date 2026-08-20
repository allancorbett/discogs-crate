import type { NextRequest } from "next/server";
import { jsonError, withAuth } from "@/lib/api";
import { fetchCollectionPage } from "@/lib/discogs/collection";

/**
 * One page of the signed-in user's collection, normalized. The client walks
 * pages itself so the carousel can render the first hundred covers while the
 * rest are still arriving, and files them in whatever order the user picked
 * once they are all here — which is why there is no sort parameter.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");

  if (!Number.isInteger(page) || page < 1) {
    return jsonError("page must be a positive integer.", 400);
  }

  return withAuth(async (auth, username) =>
    Response.json(await fetchCollectionPage(auth, username, page)),
  );
}
