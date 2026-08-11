import type { NextRequest } from "next/server";
import { jsonError, withAuth } from "@/lib/api";
import { fetchCollectionPage } from "@/lib/discogs/collection";
import type { CollectionSort } from "@/lib/discogs/collection";

const SORTS: CollectionSort[] = ["artist", "title", "year", "added"];

function parseSort(raw: string | null): CollectionSort {
  return SORTS.includes(raw as CollectionSort)
    ? (raw as CollectionSort)
    : "artist";
}

/**
 * One page of the signed-in user's collection, normalized. The client walks
 * pages itself so the carousel can render the first hundred covers while the
 * rest are still arriving.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");

  if (!Number.isInteger(page) || page < 1) {
    return jsonError("page must be a positive integer.", 400);
  }

  return withAuth(async (auth, username) => {
    const result = await fetchCollectionPage(
      auth,
      username,
      page,
      parseSort(params.get("sort")),
    );
    return Response.json(result);
  });
}
