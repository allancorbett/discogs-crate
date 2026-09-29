import type { NextRequest } from "next/server";
import { jsonError, visitorStrategy, withPublicDiscogs } from "@/lib/api";
import { AnonymousStrategy } from "@/lib/discogs/auth";
import { fetchCollectionPage } from "@/lib/discogs/collection";
import type { CollectionPage } from "@/lib/discogs/types";
import { clientKey, withinRateLimit } from "@/lib/guard";
import { isDiscogsUsername } from "@/lib/shop/share";

/**
 * One page of someone's *public* collection, for the shareable shop links.
 *
 * Anyone can call this, so it is careful with what it spends. Anonymous pages
 * are remembered for a few minutes — a link doing the rounds means the same
 * shop being opened over and over — and each visitor is held to a pace that a
 * person walking into a shop never gets near.
 */

const CACHE_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 500;
const cache = new Map<string, { page: CollectionPage; expires: number }>();

function remember(key: string, page: CollectionPage) {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest first: a Map iterates in insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { page, expires: Date.now() + CACHE_MS });
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/shop/[username]">,
): Promise<Response> {
  const { username } = await ctx.params;
  if (!isDiscogsUsername(username)) {
    return jsonError("That isn't a Discogs username.", 400);
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 1000) {
    return jsonError("page must be a positive integer.", 400);
  }

  if (!withinRateLimit(`shop:${clientKey(request)}`, 90)) {
    return jsonError("Too many requests. Wait a minute and try again.", 429);
  }

  const auth = await visitorStrategy();
  const anonymous = auth instanceof AnonymousStrategy;
  const key = `${username.toLowerCase()}:${page}`;

  if (anonymous) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return Response.json(hit.page);
  }

  return withPublicDiscogs(async () => {
    const result = await fetchCollectionPage(auth, username, page);
    if (anonymous) remember(key, result);
    return Response.json(result);
  });
}
