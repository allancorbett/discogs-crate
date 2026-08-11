"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearCache, readCache, writeCache } from "@/lib/collectionCache";
import type { Album, CollectionPage } from "@/lib/discogs/types";

export interface UseCollection {
  albums: Album[];
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
  total: number | null;
  /** All pages have arrived, or the attempt failed. */
  done: boolean;
  error: string | null;
  unauthorized: boolean;
}

const EMPTY: State = {
  token: "",
  albums: [],
  total: null,
  done: false,
  error: null,
  unauthorized: false,
};

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
          total: cached.length,
          done: true,
          error: null,
          unauthorized: false,
        }));
        return;
      }

      const collected: Album[] = [];
      try {
        const first = await fetchPage(1, controller.signal);
        if (cancelled) return;

        collected.push(...first.albums);
        update(() => ({
          token,
          albums: [...collected],
          total: first.totalItems,
          done: first.pages <= 1,
          error: null,
          unauthorized: false,
        }));

        for (let page = 2; page <= first.pages; page++) {
          const next = await fetchPage(page, controller.signal);
          if (cancelled) return;

          collected.push(...next.albums);
          update((previous) => ({
            ...previous,
            token,
            albums: [...collected],
            done: page === first.pages,
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
    total: current ? state.total : null,
    loading: Boolean(username) && (!current || !state.done),
    error: current ? state.error : null,
    unauthorized: current ? state.unauthorized : false,
    refresh,
  };
}
