/**
 * Entry checks for the routes a browser can POST to without being signed in.
 *
 * Neither of these defends against a determined attacker with their own HTTP
 * client — they are not meant to. They close the two things a *page on another
 * origin* can do to a visitor of this one, and put a ceiling on how fast the
 * deployment's own Discogs budget can be spent.
 */

/**
 * Whether the request came from this app's own pages.
 *
 * `sameSite: "lax"` already stops a cross-site POST carrying our cookies, but
 * it does not stop the response from setting them: a form on another origin can
 * still POST here and drop a demo session on the visitor, or sign them out.
 * Browsers send `Origin` on every POST, so comparing it to the host we were
 * addressed as settles it. `Origin` is set by the browser and cannot be forged
 * from a page, which is what makes it worth more than `Referer` here.
 *
 * A missing `Origin` is refused rather than waved through. Only a non-browser
 * client omits it on a POST, and none of these routes exist for one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const configured = process.env.DISCOGS_APP_URL?.trim();
  if (configured) {
    return origin.replace(/\/$/, "") === configured.replace(/\/$/, "");
  }

  // Fall back to the host we were addressed as. A forged X-Forwarded-Host does
  // not help an attacker here the way it does in the OAuth flow: they would
  // have to make the victim's browser send a matching Origin, which it will
  // only do for a page actually served from that host.
  const host = request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Long enough to matter, short enough that a stuck client recovers. */
const WINDOW_MS = 60_000;

/**
 * A fixed window per client, held in memory.
 *
 * Deliberately modest: this is one process's view, so on a platform that runs
 * several instances the real ceiling is the limit times the instance count. It
 * is a brake on the obvious abuse — holding the demo token at its 60/minute
 * ceiling so nobody else can use it, or walking a list of stolen tokens through
 * the sign-in route to see which still work — not a quota system. Anything
 * stricter needs shared state this app does not have.
 */
export function withinRateLimit(
  key: string,
  limit: number,
  now = Date.now(),
): boolean {
  const current = windows.get(key);

  if (!current || now >= current.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (windows.size > 1000) sweep(now);
    return true;
  }

  if (current.count >= limit) return false;

  current.count += 1;
  return true;
}

/** Expired windows are only dropped when the map has grown enough to matter. */
function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (now >= window.resetAt) windows.delete(key);
  }
}

/**
 * Who to count against. Behind a proxy the first `X-Forwarded-For` hop is the
 * client; everything else collapses to one bucket, which is the safe direction
 * to be wrong in for a brake like this.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Runs both checks. Returns the response to send back, or null to carry on.
 *
 * Kept free of any import that reaches `next/headers`, so the checks stay
 * testable as the plain functions they are.
 */
export function guardPost(
  request: Request,
  options: { limit?: number; bucket?: string } = {},
): Response | null {
  if (!isSameOrigin(request)) {
    return refuse("This request didn't come from the app.", 403);
  }

  if (options.limit !== undefined) {
    const key = `${options.bucket ?? "default"}:${clientKey(request)}`;
    if (!withinRateLimit(key, options.limit)) {
      return refuse("Too many attempts. Wait a minute and try again.", 429);
    }
  }

  return null;
}

const refuse = (message: string, status: number) =>
  Response.json({ error: message }, { status });
