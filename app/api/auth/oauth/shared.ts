import type { NextRequest } from "next/server";

/**
 * The app's public origin. Derived from the request so localhost, Vercel
 * preview deployments and production each get their own correct callback
 * without configuration, with an override for setups where the proxy headers
 * can't be trusted.
 */
function origin(request: NextRequest): string {
  const configured = process.env.DISCOGS_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin;
}

export function callbackUrl(request: NextRequest): string {
  return `${origin(request)}/api/auth/oauth/callback`;
}

/** Back to the sign-in screen, carrying a reason the gate can explain. */
export function gateUrl(request: NextRequest, error?: string): string {
  const url = new URL("/", origin(request));
  if (error) url.searchParams.set("error", error);
  return url.toString();
}
