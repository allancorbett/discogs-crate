/**
 * Sleeve art for WebGL.
 *
 * An `<img>` can show a picture from any origin, but WebGL can only upload one
 * to the GPU when the server that sent it allows cross-origin reads. Rather
 * than depend on Discogs' CDN headers, covers for the 3D shop come through a
 * same-origin route, which only ever fetches from Discogs' image hosts.
 */

const COVER_HOSTS = new Set(["i.discogs.com", "img.discogs.com"]);

/** The upstream URL, if it is one the proxy is willing to fetch. */
export function coverSource(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!COVER_HOSTS.has(url.hostname)) return null;
  if (url.port || url.username || url.password) return null;

  return url;
}

/** Where the browser should load a cover from, or null for none. */
export function coverProxyUrl(src: string | null | undefined): string | null {
  const url = coverSource(src);
  return url ? `/api/cover?u=${encodeURIComponent(url.toString())}` : null;
}
