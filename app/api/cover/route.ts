import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { userAgent } from "@/lib/discogs/client";
import { coverSource } from "@/lib/cover";
import { clientKey, withinRateLimit } from "@/lib/guard";

/**
 * Sleeve art for the 3D shop, served from our own origin so WebGL may read it.
 * See lib/cover.ts for why, and for the allow-list that keeps this from being
 * an open proxy: it only ever fetches from Discogs' image hosts.
 */

/** Discogs covers are tens of kilobytes; anything near this is not a cover. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(request: NextRequest): Promise<Response> {
  const source = coverSource(request.nextUrl.searchParams.get("u"));
  if (!source) return jsonError("Not a Discogs cover.", 400);

  // A shop full of crates asks for a lot of covers at once, and the browser
  // caches each one for good, so this only catches something hammering it.
  if (!withinRateLimit(`cover:${clientKey(request)}`, 900)) {
    return jsonError("Too many requests. Wait a minute and try again.", 429);
  }

  let upstream: Response;
  try {
    upstream = await fetch(source, {
      headers: { "User-Agent": userAgent(), Accept: "image/*" },
      // A redirect could lead anywhere; the allow-list only vouches for here.
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError("Could not fetch that cover.", 502);
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !/^image\/(jpeg|png|webp|gif|avif)(;|$)/.test(type)) {
    return jsonError("Could not fetch that cover.", 502);
  }

  const declared = Number(upstream.headers.get("content-length"));
  if (declared > MAX_BYTES) return jsonError("That cover is too large.", 502);

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    return jsonError("That cover is too large.", 502);
  }

  return new Response(body, {
    headers: {
      "Content-Type": type,
      // Discogs image URLs are signed and never change what they point at.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
