import type { Album } from "./discogs/types";

/**
 * How the crate is filed. Everything here is pure and returns a new array, so
 * the ordering can be recomputed from the collection whenever the mode, the
 * filters or the shuffle seed change.
 */

export type SortMode = "artist" | "year" | "genre" | "shuffle";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "artist", label: "Artist" },
  { id: "year", label: "Year" },
  { id: "genre", label: "Genre" },
  { id: "shuffle", label: "Shuffle" },
];

/** `numeric` so "Vol. 2" files before "Vol. 10", as a person would file them. */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Files an artist the way a record shop does: leading articles are ignored, so
 * The Beatles sits under B, and any punctuation the sleeve carries is dropped
 * rather than sorting ahead of the alphabet.
 */
export function artistKey(artist: string): string {
  return artist
    .replace(/^\s*(the|a|an)\s+/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

/**
 * Unknown years file at the end rather than at year zero. A large finite
 * sentinel, not Infinity, so subtracting two of them still gives 0.
 */
const UNKNOWN_YEAR = Number.MAX_SAFE_INTEGER;

const yearKey = (album: Album): number => album.year ?? UNKNOWN_YEAR;

/**
 * Discogs lists the broad genres first and the specific styles separately; the
 * first genre is the one that reads as the section divider in a shop.
 */
export function genreKey(album: Album): string | null {
  return album.genres.find((genre) => genre.trim()) ?? null;
}

/** Compares two optional strings, filing the missing ones at the end. */
function compareOptional(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return collator.compare(a, b);
}

interface SortKeys {
  artist: string;
  year: number;
  genre: string | null;
}

/**
 * Derived keys, computed once per record and cached against the record itself.
 *
 * The collection arrives a page at a time and the whole crate is re-filed on
 * every arrival, so a comparator that derives its keys inline runs `artistKey`
 * — two regexes and a trim — twice per comparison, tens of thousands of times
 * per page. Records are immutable once normalized, so the keys can simply be
 * remembered; a WeakMap means a collection that gets replaced is collectable.
 */
const sortKeys = new WeakMap<Album, SortKeys>();

function keysOf(album: Album): SortKeys {
  let keys = sortKeys.get(album);
  if (!keys) {
    keys = {
      artist: artistKey(album.artist),
      year: yearKey(album),
      genre: genreKey(album),
    };
    sortKeys.set(album, keys);
  }
  return keys;
}

const byArtist = (a: Album, b: Album): number => {
  const x = keysOf(a);
  const y = keysOf(b);
  return (
    collator.compare(x.artist, y.artist) ||
    x.year - y.year ||
    collator.compare(a.title, b.title)
  );
};

const byYear = (a: Album, b: Album): number => {
  const x = keysOf(a);
  const y = keysOf(b);
  return (
    x.year - y.year ||
    collator.compare(x.artist, y.artist) ||
    collator.compare(a.title, b.title)
  );
};

const byGenre = (a: Album, b: Album): number => {
  const x = keysOf(a);
  const y = keysOf(b);
  return (
    compareOptional(x.genre, y.genre) ||
    collator.compare(x.artist, y.artist) ||
    x.year - y.year ||
    collator.compare(a.title, b.title)
  );
};

/** MurmurHash3's finaliser: cheap, and avalanches well enough to look random. */
function mix(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Deals the collection into a random-looking but *stable* order.
 *
 * Each record's place comes from hashing its own id against the seed, rather
 * than from a walk over the array. That matters because the collection arrives
 * a page at a time: a Fisher–Yates shuffle would re-deal the whole crate every
 * time a page landed, yanking the covers out from under the user. Hashing
 * leaves the records already on screen in the same relative order and simply
 * slots the new ones in among them. Re-rolling the seed re-deals everything,
 * which is exactly what asking to shuffle again should do.
 */
export function shuffleOrder(albums: Album[], seed: number): Album[] {
  const salt = mix(seed);
  return [...albums].sort(
    (a, b) => mix(a.id ^ salt) - mix(b.id ^ salt) || a.id - b.id,
  );
}

/**
 * The crate in the requested order. Ties fall back through artist, year and
 * title so the result is fully determined — no record drifting position
 * between renders just because two of them share a genre.
 */
export function orderAlbums(
  albums: Album[],
  mode: SortMode,
  seed = 0,
): Album[] {
  switch (mode) {
    case "shuffle":
      return shuffleOrder(albums, seed);
    case "year":
      return [...albums].sort(byYear);
    case "genre":
      return [...albums].sort(byGenre);
    case "artist":
      return [...albums].sort(byArtist);
  }
}
