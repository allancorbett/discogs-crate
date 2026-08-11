# Crate

Browse your Discogs collection as a CoverFlow-style carousel, or let it pick a
record for you — at random, or narrowed to the genres and styles you're in the
mood for.

Next.js (App Router) + TypeScript, deployable to Vercel as-is.

## Running it

```bash
npm install && npm run dev
```

Then open http://localhost:3000 and paste a Discogs **personal access token**
(Discogs → [Settings → Developers](https://www.discogs.com/settings/developers)
→ *Generate token*).

The token is verified against Discogs before it is stored, and kept in an
httpOnly cookie that client-side JavaScript cannot read.

### Environment

| Variable              | Required | Purpose                                                                    |
| --------------------- | -------- | -------------------------------------------------------------------------- |
| `DISCOGS_USER_AGENT`  | No       | Sent on every Discogs request. Defaults to a generic string; set it to something identifying your deployment, e.g. `Crate/1.0 +https://crate.example.com`. |

## How it fits together

Every Discogs call is proxied through this app's own route handlers rather than
made from the browser. Discogs' API does send permissive CORS headers, so direct
browser calls would work — but proxying buys four things:

- The token is never exposed to client-side JavaScript.
- Discogs **requires** a descriptive `User-Agent`, and browsers forbid scripts
  from setting that header. A request without one is rejected outright.
- Rate-limit handling and retries live in one place.
- Swapping token auth for OAuth later touches only server code.

```
app/api/auth/{token,session,logout}   sign in, check session, sign out
app/api/collection                    one normalized page of the collection
app/api/release/[id]                  tracklist and extended metadata

lib/discogs/auth.ts        AuthStrategy seam (see below)
lib/discogs/client.ts      fetch wrapper: User-Agent, credential, 429 backoff
lib/discogs/collection.ts  paging and normalization to `Album`
lib/coverflow.ts           carousel geometry and index maths (pure)
lib/coverflowEngine.ts     the carousel's DOM/animation controller
lib/picker.ts              genre filtering and random choice (pure)
```

### Adding OAuth later

Discogs supports personal access tokens and OAuth **1.0a** — there is no OAuth 2
flow. A 1.0a signature is computed over the HTTP method and full URL of each
request, so the credential cannot be a fixed header string. `AuthStrategy`
accounts for that:

```ts
interface AuthStrategy {
  authHeader(method: string, url: string): Promise<string>;
}
```

`PersonalTokenStrategy` ignores both arguments. Adding a real "Log in with
Discogs" button means writing an `OAuth1Strategy` that signs per request, plus
`/api/auth/oauth/start` and `/api/auth/oauth/callback` route handlers. Nothing
else changes — `client.ts` and every route handler already go through the seam.

### The carousel

`lib/coverflowEngine.ts` is deliberately plain DOM code rather than React. The
carousel rewrites every cover's transform on every animation frame; routing that
through React state would mean a full render per frame while dragging or
spinning. React owns the markup, the engine owns everything that moves, and the
two meet at a small imperative handle.

It renders a fixed pool of 23 cover elements no matter how large the collection
is. Each slot owns one residue class modulo the pool size, so a given slot's
album changes once every 23 steps instead of on every step — roughly one image
swap per cover crossed, rather than one per slot per step.

Reflections use `-webkit-box-reflect` (Chrome, Safari, Edge). Firefox has no
equivalent, so it falls back to a mirrored, masked copy of the artwork.

## Tests

```bash
npm test
```

Covers the pure layers: carousel geometry and wrapping, slot recycling, spin
planning, genre filtering and picking, and collection normalization — including
Discogs quirks like the `(2)` disambiguator in "Nirvana (2)" and `year: 0`
meaning "unknown".

```bash
npm run lint
npm run typecheck
```

## Deploying

Push to a repository and import it on Vercel — no configuration needed beyond
setting `DISCOGS_USER_AGENT`. Each visitor signs in with their own token.
