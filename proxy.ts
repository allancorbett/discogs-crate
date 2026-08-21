import { NextResponse, type NextRequest } from "next/server";

/**
 * Response security headers, and the per-request nonce the CSP is built around.
 *
 * A nonce rather than `'unsafe-inline'`: Next puts its bootstrap and hydration
 * payload in inline `<script>` tags, and the only way to allow those without
 * also allowing anything an injection manages to insert is to name them. Next
 * reads the nonce off the request headers and stamps it onto the scripts it
 * emits, so this file generates one per request and passes it both ways.
 *
 * `'strict-dynamic'` lets those nonced scripts load the chunks they need
 * without every chunk URL having to be listed.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // React reconstructs server-side error stacks with `eval` in development.
  // Neither React nor Next uses it in a production build.
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // CSS Modules and next/font both compile to real stylesheets served from
    // this origin; the nonce covers the critical CSS Next inlines.
    `style-src 'self' 'nonce-${nonce}'`,
    // Sleeve art is served from Discogs' own CDN, which is the one third party
    // this app loads anything from.
    "img-src 'self' https://*.discogs.com data: blob:",
    "font-src 'self'",
    // The browser only ever talks to our own routes — every Discogs call is
    // made server-side, so nothing legitimate needs an outbound origin here.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // frame-ancestors covers this for anything current; the header is here for
  // browsers that predate it.
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except the paths that are served straight from disk and carry
     * no markup for a CSP to govern — and prefetches, which never execute.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
