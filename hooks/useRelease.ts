"use client";

import { useEffect, useState } from "react";
import type { ReleaseDetail } from "@/lib/discogs/types";

interface UseRelease {
  release: ReleaseDetail | null;
  loading: boolean;
  error: string | null;
}

interface State {
  /** Which release the stored result belongs to. */
  id: number | null;
  release: ReleaseDetail | null;
  error: string | null;
}

const EMPTY: State = { id: null, release: null, error: null };

/**
 * Extended metadata for one release, fetched only when a panel opens.
 *
 * State is tagged with the id it describes and "loading" is derived from that
 * tag, so switching albums doesn't need a reset render — the previous
 * release's tracklist simply stops matching and is never shown.
 */
export function useRelease(releaseId: number | null): UseRelease {
  const [state, setState] = useState<State>(EMPTY);

  useEffect(() => {
    if (releaseId === null) return;

    const controller = new AbortController();

    fetch(`/api/release/${releaseId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Could not load this release.");
        }
        return (await response.json()) as ReleaseDetail;
      })
      .then((release) => setState({ id: releaseId, release, error: null }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          id: releaseId,
          release: null,
          error:
            cause instanceof Error
              ? cause.message
              : "Could not load this release.",
        });
      });

    return () => controller.abort();
  }, [releaseId]);

  const settled = releaseId !== null && state.id === releaseId;

  return {
    release: settled ? state.release : null,
    loading: releaseId !== null && !settled,
    error: settled ? state.error : null,
  };
}
