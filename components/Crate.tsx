"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumDetail } from "./AlbumDetail";
import { CoverFlow, type CoverFlowHandle } from "./CoverFlow";
import { PickerBar } from "./PickerBar";
import { useCollection } from "@/hooks/useCollection";
import { candidateIndices, pickIndex, rememberPick } from "@/lib/picker";
import styles from "./Crate.module.css";

interface Props {
  username: string;
  onSignOut: () => void;
}

interface OpenPanel {
  index: number;
  /** Distinguishes "the app chose this" from "I clicked this cover". */
  fromPick: boolean;
}

export function Crate({ username, onSignOut }: Props) {
  const { albums, total, loading, error, unauthorized, refresh } =
    useCollection(username);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<OpenPanel | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  const [centre, setCentre] = useState(0);

  const coverFlow = useRef<CoverFlowHandle>(null);

  // A revoked token can only be discovered mid-flight; drop back to the gate.
  useEffect(() => {
    if (unauthorized) onSignOut();
  }, [unauthorized, onSignOut]);

  const matchCount = useMemo(
    () => candidateIndices(albums, selected).length,
    [albums, selected],
  );

  const toggleTag = useCallback((tag: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setSelected(new Set()), []);

  const pick = useCallback(async () => {
    if (spinning || !albums.length) return;

    const index = pickIndex(albums, {
      selected,
      exclude: [...recent, centre],
    });
    if (index === null) return;

    setPanel(null);
    setSpinning(true);
    try {
      await coverFlow.current?.spinTo(index);
    } finally {
      setSpinning(false);
    }
    setRecent((current) => rememberPick(current, index));
    setPanel({ index, fromPick: true });
  }, [albums, centre, recent, selected, spinning]);

  const openCentre = useCallback((index: number) => {
    setPanel({ index, fromPick: false });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    coverFlow.current?.focus();
  }, []);

  const loaded = albums.length;
  const panelAlbum = panel ? albums[panel.index] : undefined;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark}>Crate</span>
          <span className={styles.user}>{username}</span>
        </div>

        <div className={styles.status}>
          {loading ? (
            <span className={styles.loading}>
              Loading {loaded.toLocaleString()}
              {total ? ` / ${total.toLocaleString()}` : ""}…
            </span>
          ) : (
            <span>{loaded.toLocaleString()} records</span>
          )}
          <button
            type="button"
            className={styles.link}
            onClick={refresh}
            disabled={loading}
          >
            Refresh
          </button>
          <button type="button" className={styles.link} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button type="button" className={styles.link} onClick={refresh}>
            Try again
          </button>
        </p>
      ) : null}

      {loaded === 0 ? (
        <div className={styles.empty}>
          {loading ? (
            <p>Fetching your collection from Discogs…</p>
          ) : error ? null : (
            <p>
              Your Discogs collection looks empty. Add some records and{" "}
              <button type="button" className={styles.link} onClick={refresh}>
                refresh
              </button>
              .
            </p>
          )}
        </div>
      ) : (
        <>
          <CoverFlow
            ref={coverFlow}
            albums={albums}
            onCentreChange={setCentre}
            onSelect={openCentre}
          />
          <PickerBar
            albums={albums}
            selected={selected}
            matchCount={matchCount}
            spinning={spinning}
            onToggle={toggleTag}
            onClear={clearTags}
            onPick={pick}
          />
        </>
      )}

      {panelAlbum ? (
        <AlbumDetail
          album={panelAlbum}
          onClose={closePanel}
          onReroll={panel?.fromPick ? pick : undefined}
          rerolling={spinning}
        />
      ) : null}
    </div>
  );
}
