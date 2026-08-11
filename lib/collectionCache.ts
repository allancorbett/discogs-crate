import type { Album } from "./discogs/types";

const PREFIX = "crate:collection:";
const TTL_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;

interface CacheEntry {
  version: number;
  savedAt: number;
  albums: Album[];
}

const keyFor = (username: string) => `${PREFIX}${username}`;

/**
 * Returns the cached collection when it is fresh, otherwise null. Every path
 * is guarded: a collection cache is an optimization, and no failure reading or
 * writing it should ever stop the app from loading normally.
 */
export function readCache(username: string): Album[] | null {
  try {
    const raw = localStorage.getItem(keyFor(username));
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry;
    const fresh =
      entry.version === VERSION && Date.now() - entry.savedAt < TTL_MS;

    if (!fresh) {
      localStorage.removeItem(keyFor(username));
      return null;
    }
    return entry.albums;
  } catch {
    return null;
  }
}

export function writeCache(username: string, albums: Album[]): void {
  try {
    const entry: CacheEntry = { version: VERSION, savedAt: Date.now(), albums };
    localStorage.setItem(keyFor(username), JSON.stringify(entry));
  } catch {
    // Almost certainly QuotaExceededError on a very large collection. Drop the
    // stale entry so we don't keep a half-written one, and carry on — the next
    // load just refetches.
    try {
      localStorage.removeItem(keyFor(username));
    } catch {
      // Storage is unavailable entirely (private mode); nothing to do.
    }
  }
}

export function clearCache(username: string): void {
  try {
    localStorage.removeItem(keyFor(username));
  } catch {
    // Ignore — see writeCache.
  }
}
