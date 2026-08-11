# Crate

Flip through your Discogs collection like a crate of records — a vertical
CoverFlow you drag, scroll or arrow through — filed by artist, year or genre, or
shuffled. Or let it pick a record for you, at random or narrowed to the genres
and styles you're in the mood for.

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

| Variable             | Required | Purpose                                                                                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOGS_USER_AGENT` | No       | Sent on every Discogs request. Defaults to a generic string; set it to something identifying your deployment, e.g. `Crate/1.0 +https://crate.example.com`. |
| `DISCOGS_DEMO_TOKEN` | No       | Enables the demo (see below). Leave unset and the demo button never appears.                                                                              |

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
- Swapping token auth for OAuth later touches only server code.

```
app/api/auth/{token,session,logout}   sign in, check session, sign out
app/api/collection                    one normalized page of the collection
app/api/release/[id]                  tracklist and extended metadata

lib/discogs/auth.ts        AuthStrategy seam (see below)
lib/discogs/client.ts      fetch wrapper: User-Agent, credential, 429 backoff
lib/discogs/collection.ts  paging and normalization to `Album`
lib/coverflow.ts           crate geometry and index maths (pure)
lib/coverflowEngine.ts     the crate's DOM/animation controller
lib/ordering.ts            artist / year / genre / shuffle ordering (pure)
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

### The crate

`lib/coverflowEngine.ts` is deliberately plain DOM code rather than React. The
crate rewrites every cover's transform on every animation frame; routing that
through React state would mean a full render per frame while dragging or
spinning. React owns the markup, the engine owns everything that moves, and the
two meet at a small imperative handle.

It renders a fixed pool of 13 cover elements no matter how large the collection
is. Each slot owns one residue class modulo the pool size, so a given slot's
album changes once every 13 steps instead of on every step — roughly one image
swap per cover crossed, rather than one per slot per step.

The stack runs top to bottom: the centred record stands square-on, the ones
either side tip back at a steep angle so their inner edge faces you. Vertical
room is the scarce dimension in a browser window, so the fan is tuned to keep
every still-visible cover within about one cover-height of the centre — past
that they would be clipped at the edge of the stage rather than fading there.

### Ordering

`lib/ordering.ts` files the crate by artist, year or genre, or shuffles it.
Every mode falls through the same tiebreakers, so the result is fully
determined — no record drifting position between renders. Artists are filed the
way a record shop does it, ignoring leading articles, and undated or untagged
releases go at the end rather than at the front.

Shuffle places each record by hashing its own id against the seed rather than
walking the array. The collection arrives a page at a time, and a Fisher–Yates
shuffle would re-deal the whole crate on each arrival, yanking the covers out
from under whoever is browsing. Hashing leaves the records already on screen in
the same relative order and slots the new ones in among them; re-rolling the
seed re-deals everything, which is what pressing shuffle again should do.

## Tests

```bash
npm test
```

Covers the pure layers: crate geometry and wrapping, slot recycling, spin
planning, ordering and shuffling, genre filtering and picking, and collection
normalization — including Discogs quirks like the `(2)` disambiguator in
"Nirvana (2)" and `year: 0` meaning "unknown".

```bash
npm run lint
npm run typecheck
```

## Deploying

Push to a repository and import it on Vercel — no configuration needed beyond
setting `DISCOGS_USER_AGENT`. Each visitor signs in with their own token.
