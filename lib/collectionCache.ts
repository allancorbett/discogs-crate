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

/** Cancels the queued write, if there is one. */
let cancelPending: (() => void) | null = null;

/**
 * Serializing a few thousand records and handing the string to localStorage is
 * tens of milliseconds of blocked main thread, and it falls due at the exact
 * moment the last page lands and the crate re-files itself. Nothing waits on
 * the cache, so let the browser spend the time when it has some to spare.
 */
function whenIdle(task: () => void): void {
  cancelPending?.();

  const run = () => {
    cancelPending = null;
    task();
  };

  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 2000 });
    cancelPending = () => cancelIdleCallback(handle);
  } else {
    const handle = setTimeout(run, 0);
    cancelPending = () => clearTimeout(handle);
  }
}

export function writeCache(username: string, albums: Album[]): void {
  whenIdle(() => save(username, albums));
}

function save(username: string, albums: Album[]): void {
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
  // A write queued by the load being refreshed must not land after the clear.
  cancelPending?.();
  cancelPending = null;

  try {
    localStorage.removeItem(keyFor(username));
  } catch {
    // Ignore — see writeCache.
  }
}
