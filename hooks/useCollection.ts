"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearCache, readCache, writeCache } from "@/lib/collectionCache";
import type { Album, CollectionPage } from "@/lib/discogs/types";

export interface UseCollection {
  albums: Album[];
  /**
   * Records fetched so far. Runs a little ahead of `albums.length` while pages
   * are still arriving, because arrivals are published in batches — see
   * PUBLISH_INTERVAL_MS — while the progress count keeps moving with every one.
   */
  loaded: number;
  /** Total the API reports, so progress can be shown before everything lands. */
  total: number | null;
  /** True while pages are still arriving; covers already render regardless. */
  loading: boolean;
  error: string | null;
  /** True when the token was rejected — the caller should sign the user out. */
  unauthorized: boolean;
  refresh: () => void;
}

interface State {
  /** Which (user, reload) attempt this result belongs to. */
  token: string;
  albums: Album[];
  loaded: number;
  total: number | null;
  /** All pages have arrived, or the attempt failed. */
  done: boolean;
  error: string | null;
  unauthorized: boolean;
}

const EMPTY: State = {
  token: "",
  albums: [],
  loaded: 0,
  total: null,
  done: false,
  error: null,
  unauthorized: false,
};

/**
 * How long the collection may go unpublished while pages are still arriving.
 *
 * Everything downstream is derived from the whole array — the tag filter, the
 * filing order, the facet counts, every slot's album in the carousel — so each
 * new array costs a pass over the entire collection. Publishing all fifty
 * pages of a five thousand record crate separately spends most of the import
 * redoing work that the next page invalidates a moment later, and it is the
 * user's scrolling and dragging that pays for it.
 *
 * Page one still publishes the moment it lands, so covers appear just as fast;
 * the rest arrives in a handful of batches rather than one jolt per page.
 */
const PUBLISH_INTERVAL_MS = 400;

class UnauthorizedError extends Error {}

async function fetchPage(page: number, signal: AbortSignal) {
  const response = await fetch(`/api/collection?page=${page}`, { signal });

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? "Could not load your collection.");
  }

  return (await response.json()) as CollectionPage;
}

/**
 * Loads the whole collection a page at a time, publishing after each one so
 * the carousel can start rendering the first hundred covers while the rest are
 * still in flight. A completed load is cached, making a return visit instant
 * and free of API budget.
 *
 * Results are tagged with the attempt they belong to and everything the caller
 * sees is derived from that tag, so a user or refresh change invalidates the
 * previous result without a reset render.
 */
export function useCollection(username: string | undefined): UseCollection {
  const [state, setState] = useState<State>(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);

  const token = `${username ?? ""}:${reloadKey}`;

  // Held so refresh() can invalidate the cache for the right user.
  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  const refresh = useCallback(() => {
    if (usernameRef.current) clearCache(usernameRef.current);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!username) return;

    const controller = new AbortController();
    let cancelled = false;

    // Only replace state that still belongs to this attempt — a slow page
    // arriving after the user signed out or refreshed must not resurrect it.
    const update = (next: (previous: State) => State) => {
      if (cancelled) return;
      setState((previous) =>
        previous.token === token ? next(previous) : next({ ...EMPTY, token }),
      );
    };

    (async () => {
      const cached = reloadKey === 0 ? readCache(username) : null;
      if (cached?.length) {
        update(() => ({
          token,
          albums: cached,
          loaded: cached.length,
          total: cached.length,
          done: true,
          error: null,
          unauthorized: false,
        }));
        return;
      }

      const collected: Album[] = [];
      // The most recent snapshot handed to the UI. Held between arrivals so a
      // batched-over page republishes the same array, and the memoized work
      // downstream stays memoized.
      let published: Album[] = [];
      let publishedAt = 0;

      try {
        const first = await fetchPage(1, controller.signal);
        if (cancelled) return;

        collected.push(...first.albums);
        published = [...collected];
        publishedAt = Date.now();
        update(() => ({
          token,
          albums: published,
          loaded: collected.length,
          total: first.totalItems,
          done: first.pages <= 1,
          error: null,
          unauthorized: false,
        }));

        for (let page = 2; page <= first.pages; page++) {
          const next = await fetchPage(page, controller.signal);
          if (cancelled) return;

          collected.push(...next.albums);

          // The last page always publishes, however soon after the one before
          // it — nothing is coming along later to carry it in.
          const last = page === first.pages;
          if (last || Date.now() - publishedAt >= PUBLISH_INTERVAL_MS) {
            published = [...collected];
            publishedAt = Date.now();
          }

          update((previous) => ({
            ...previous,
            token,
            albums: published,
            loaded: collected.length,
            done: last,
          }));
        }

        writeCache(username, collected);
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;

        update((previous) => ({
          ...previous,
          token,
          done: true,
          unauthorized: cause instanceof UnauthorizedError,
          error:
            cause instanceof UnauthorizedError
              ? null
              : cause instanceof Error
                ? cause.message
                : "Could not load your collection.",
        }));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [username, reloadKey, token]);

  const current = state.token === token;

  return {
    albums: current ? state.albums : [],
    loaded: current ? state.loaded : 0,
    total: current ? state.total : null,
    loading: Boolean(username) && (!current || !state.done),
    error: current ? state.error : null,
    unauthorized: current ? state.unauthorized : false,
    refresh,
  };
}
