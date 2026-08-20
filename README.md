# Crate

Browse your Discogs collection as a CoverFlow-style carousel — filed by artist,
year or genre, or shuffled.

Next.js (App Router) + TypeScript, deployable to Vercel as-is.

## Running it

```bash
npm install && npm run dev
```

Then open http://localhost:3000. There are up to three ways in, depending on
what the deployment is configured with:

- **Sign in with Discogs** — the OAuth flow, when consumer credentials are set.
- **A personal access token** — pasted from Discogs →
  [Settings → Developers](https://www.discogs.com/settings/developers) →
  *Generate token*. Always available, and the only option out of the box.
- **The demo** — browse a sample collection without signing in, when a demo
  token is set.

Credentials are verified against Discogs before being stored, and live in
httpOnly cookies that client-side JavaScript cannot read.

### Environment

| Variable                  | Required | Purpose                                                                                                                                                   |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOGS_USER_AGENT`      | No       | Sent on every Discogs request. Defaults to a generic string; set it to something identifying your deployment, e.g. `Crate/1.0 +https://crate.example.com`. |
| `DISCOGS_CONSUMER_KEY`    | No       | Enables "Sign in with Discogs" (see below). Both this and the secret must be set.                                                                          |
| `DISCOGS_CONSUMER_SECRET` | No       | The other half of the OAuth credentials.                                                                                                                  |
| `DISCOGS_APP_URL`         | In prod, with OAuth | The origin used to build the OAuth callback URL. Required in production whenever OAuth is configured; derived from the request in development.               |
| `DISCOGS_DEMO_TOKEN`      | No       | Enables the demo (see below). Leave unset and the demo button never appears.                                                                               |

### Sign in with Discogs (OAuth)

Create an application at [Discogs → Settings →
Developers](https://www.discogs.com/settings/developers), then set
`DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET`. A **Sign in with Discogs**
button appears on the gate and the token field becomes a fallback. With neither
set, the token field is the only way in — nothing else changes.

Discogs supports **OAuth 1.0a only**; there is no OAuth 2 flow. Two consequences
shaped the implementation:

- **Signatures are per-request.** A 1.0a signature covers the HTTP method and
  full URL, so `AuthStrategy.authHeader(method, url)` takes both rather than
  handing back a cached header. `OAuth1Strategy` signs each call as it goes out.
- **HMAC-SHA1, not PLAINTEXT.** Discogs accepts PLAINTEXT, where the signature
  is just the two secrets concatenated. Both travel over TLS, but PLAINTEXT puts
  the consumer secret in an `Authorization` header on *every* API call, and
  request headers routinely end up in proxy logs, error trackers and platform
  request logs. HMAC keeps the secrets local.

Discogs does not require the callback URL to be registered in advance, so in
development it is derived from the incoming request and localhost works with no
extra configuration. **In production you must set `DISCOGS_APP_URL`**, and the
flow refuses to start without it. The derived origin comes from the request's
host headers — Next honours `X-Forwarded-Host` — and a proxy that passes a
forged one through would let an attacker point the callback at their own host
while holding the matching request token secret, which is enough to finish
somebody else's sign-in. Pinning the origin is what closes that.

While the user is away approving the app, the request token secret sits in a
15-minute `httpOnly` cookie, and the token that comes back must match the one
this browser started with — otherwise someone else's approval could be replayed
into the session.

### Demo mode

Setting `DISCOGS_DEMO_TOKEN` to a personal access token adds a **Take a look
around a demo crate** button to the sign-in screen, so someone can try the app
without generating a token of their own. Sessions started that way are marked
with a `Demo` badge.

The token stays on the server. The demo session cookie holds only a marker, and
the credential is resolved from the environment on each request — `httpOnly`
stops *scripts* reading a cookie, but any visitor can read a cookie's value out
of devtools, so a token placed there would be handed to everyone who tried the
demo.

Worth knowing before switching it on: anyone using the demo sees that account's
username and entire collection, and spends its Discogs rate limit (60
requests/minute) — a busy demo will throttle. A Discogs personal access token
also grants **write** access to the account it belongs to, so prefer a token
from a secondary account, and never commit the value.

## How it fits together

Every Discogs call is proxied through this app's own route handlers rather than
made from the browser. Discogs' API does send permissive CORS headers, so direct
browser calls would work — but proxying buys four things:

- The token is never exposed to client-side JavaScript.
- Discogs **requires** a descriptive `User-Agent`, and browsers forbid scripts
  from setting that header. A request without one is rejected outright.
- Rate-limit handling and retries live in one place.
- Adding OAuth touched only server code — no client changes at all.

```
app/api/auth/{token,demo,session,logout}   sign in, check session, sign out
app/api/auth/oauth/{start,callback}        the OAuth 1.0a redirect flow
app/api/collection                         one normalized page of the collection
app/api/release/[id]                       tracklist and extended metadata

lib/discogs/auth.ts        AuthStrategy seam (see below) and session cookies
lib/discogs/oauth.ts       OAuth 1.0a signing and the three-legged flow
lib/discogs/client.ts      fetch wrapper: User-Agent, credential, 429 backoff
lib/discogs/collection.ts  paging and normalization to `Album`
lib/coverflow.ts           carousel geometry and index maths (pure)
lib/coverflowEngine.ts     the carousel's DOM/animation controller
lib/ordering.ts            artist / year / genre / shuffle ordering (pure)
```

### The auth seam

Three ways of authenticating meet behind one interface:

```ts
interface AuthStrategy {
  authHeader(method: string, url: string): Promise<string>;
}
```

`PersonalTokenStrategy` ignores both arguments and returns a static header.
`OAuth1Strategy` needs both, because a 1.0a signature is computed over the
request's method and full URL. `client.ts` and every route handler only ever
call this method, so all three paths — OAuth, pasted token, demo — are
interchangeable from there down.

`getAuthStrategy()` is the single place they are resolved, in order: a real
sign-in (OAuth, then a pasted token) always beats a lingering demo cookie, so
signing in properly does what you'd expect without leaving the demo first.

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

### Ordering

`lib/ordering.ts` files the collection by artist, year or genre, or shuffles it.
Every mode falls through the same tiebreakers, so the result is fully
determined — no record drifting position between renders. Artists are filed the
way a record shop does it, ignoring leading articles, and undated or untagged
releases go at the end rather than at the front.

Shuffle places each record by hashing its own id against the seed rather than
walking the array. The collection arrives a page at a time, and a Fisher–Yates
shuffle would re-deal everything on each arrival, yanking the covers out from
under whoever is browsing. Hashing leaves the records already on screen in
the same relative order and slots the new ones in among them; re-rolling the
seed re-deals everything, which is what pressing shuffle again should do.

## Tests

```bash
npm test
```

Covers the pure layers: carousel geometry and wrapping, slot recycling, spin
planning, ordering and shuffling, and collection normalization — including Discogs quirks like the `(2)` disambiguator in
"Nirvana (2)" and `year: 0` meaning "unknown".

The OAuth signer is tested too: RFC 3986 percent-encoding, signature base string
construction (parameter sorting, repeated keys, query strings excluded from the
base URL), and HMAC-SHA1 against the RFC 2202 test vector — so the crypto is
checked against an external reference rather than only itself.

```bash
npm run lint
npm run typecheck
```

## Deploying

Push to a repository and import it on Vercel. Nothing is required beyond
`DISCOGS_USER_AGENT`; add the OAuth and demo variables above to enable those
routes. Each visitor signs in as themselves — the app holds no shared user
state.
