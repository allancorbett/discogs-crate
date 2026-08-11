import type { Album } from "./discogs/types";

/**
 * Choosing a record for the user. Everything here is pure and works in terms
 * of indices into the collection array, because the carousel needs to spin to
 * a position, not just be handed an album.
 */

export interface Facet {
  name: string;
  count: number;
}

/**
 * Genre and style tallies across the collection, most common first. Discogs
 * gives every release a handful of broad `genres` and more specific `styles`;
 * both are worth offering, so both are counted the same way.
 */
export function facetsOf(albums: Album[], key: "genres" | "styles"): Facet[] {
  const counts = new Map<string, number>();

  for (const album of albums) {
    for (const tag of album[key]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** An album matches when any of its genres or styles is selected. */
export function matches(album: Album, selected: Set<string>): boolean {
  if (selected.size === 0) return true;

  for (const tag of album.genres) if (selected.has(tag)) return true;
  for (const tag of album.styles) if (selected.has(tag)) return true;
  return false;
}

/** Positions in the collection that satisfy the current tag selection. */
export function candidateIndices(
  albums: Album[],
  selected: Iterable<string>,
): number[] {
  const set = new Set(selected);
  const indices: number[] = [];

  for (let index = 0; index < albums.length; index++) {
    if (matches(albums[index], set)) indices.push(index);
  }
  return indices;
}

export interface PickOptions {
  selected?: Iterable<string>;
  /** Recently picked positions to avoid repeating. */
  exclude?: Iterable<number>;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
}

/**
 * Picks uniformly from the matching records, avoiding recent picks where it
 * can. If everything eligible has been seen recently — a small collection, or
 * a narrow genre filter — the exclusion is dropped rather than returning
 * nothing, because refusing to pick is never the useful answer.
 */
export function pickIndex(
  albums: Album[],
  { selected = [], exclude = [], random = Math.random }: PickOptions = {},
): number | null {
  const pool = candidateIndices(albums, selected);
  if (pool.length === 0) return null;

  const excluded = new Set(exclude);
  const unseen = pool.filter((index) => !excluded.has(index));
  const choices = unseen.length > 0 ? unseen : pool;

  return choices[Math.floor(random() * choices.length)];
}

/** How many recent picks to keep out of the next roll. */
export const RECENT_PICKS = 10;

export function rememberPick(recent: number[], index: number): number[] {
  return [index, ...recent.filter((item) => item !== index)].slice(
    0,
    RECENT_PICKS,
  );
}
