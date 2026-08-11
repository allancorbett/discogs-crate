"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumDetail } from "./AlbumDetail";
import { CoverFlow, type CoverFlowHandle } from "./CoverFlow";
import { PickerBar } from "./PickerBar";
import { useCollection } from "@/hooks/useCollection";
import { matches, pickIndex, rememberPick } from "@/lib/picker";
import styles from "./Crate.module.css";

interface Props {
  username: string;
  /** Browsing the shared demo collection rather than the visitor's own. */
  demo?: boolean;
  onSignOut: () => void;
}

interface OpenPanel {
  index: number;
  /** Distinguishes "the app chose this" from "I clicked this cover". */
  fromPick: boolean;
}

export function Crate({ username, demo = false, onSignOut }: Props) {
  const { albums, total, loading, error, unauthorized, refresh } =
    useCollection(username);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<OpenPanel | null>(null);
  const [spinning, setSpinning] = useState(false);
  /**
   * Recent picks are tracked by release id rather than by position, because
   * positions are into the *filtered* list and shift the moment a genre chip
   * is toggled.
   */
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [centre, setCentre] = useState(0);

  const coverFlow = useRef<CoverFlowHandle>(null);

  // A revoked token can only be discovered mid-flight; drop back to the gate.
  useEffect(() => {
    if (unauthorized) onSignOut();
  }, [unauthorized, onSignOut]);

  /** The carousel shows exactly what the filters select, nothing more. */
  const visible = useMemo(
    () => albums.filter((album) => matches(album, selected)),
    [albums, selected],
  );

  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Which release is centred, so a filter change can keep it in view.
  const centreIdRef = useRef<number | null>(null);
  const handleCentreChange = useCallback((index: number) => {
    setCentre(index);
    centreIdRef.current = visibleRef.current[index]?.id ?? null;
  }, []);

  const filterKey = useMemo(() => [...selected].sort().join("|"), [selected]);
  const lastFilterKey = useRef(filterKey);

  /**
   * After the visible set narrows or widens, stay on the record the user was
   * looking at when it survived the change, and fall back to the start when it
   * didn't. Deliberately keyed on the filter alone — collection pages arriving
   * also change `visible`, and those must not yank the carousel around.
   */
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return;
    lastFilterKey.current = filterKey;

    setPanel(null);

    const id = centreIdRef.current;
    const next = id === null ? -1 : visible.findIndex((a) => a.id === id);
    coverFlow.current?.goTo(next >= 0 ? next : 0, false);
  }, [filterKey, visible]);

  const toggleTag = useCallback((tag: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }, []);

  const clearTags = useCallback(() => setSelected(new Set()), []);

  const pick = useCallback(async () => {
    if (spinning || !visible.length) return;

    // Recent picks are ids; translate them into positions in the current view.
    const recent = new Set(recentIds);
    const exclude = [centre];
    visible.forEach((album, index) => {
      if (recent.has(album.id)) exclude.push(index);
    });

    const index = pickIndex(visible, { exclude });
    if (index === null) return;

    setPanel(null);
    setSpinning(true);
    try {
      await coverFlow.current?.spinTo(index);
    } finally {
      setSpinning(false);
    }
    setRecentIds((current) => rememberPick(current, visible[index].id));
    setPanel({ index, fromPick: true });
  }, [centre, recentIds, spinning, visible]);

  const openCentre = useCallback((index: number) => {
    setPanel({ index, fromPick: false });
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    coverFlow.current?.focus();
  }, []);

  const loaded = albums.length;
  const filtered = selected.size > 0;
  const panelAlbum = panel ? visible[panel.index] : undefined;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark}>Crate</span>
          {demo ? <span className={styles.badge}>Demo</span> : null}
          <span className={styles.user}>{username}</span>
        </div>

        <div className={styles.status}>
          {loading ? (
            <span className={styles.loading}>
              Loading {loaded.toLocaleString()}
              {total ? ` / ${total.toLocaleString()}` : ""}…
            </span>
          ) : (
            <span>
              {filtered
                ? `${visible.length.toLocaleString()} of ${loaded.toLocaleString()}`
                : `${loaded.toLocaleString()} records`}
            </span>
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
            {demo ? "Leave demo" : "Sign out"}
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
          {visible.length === 0 ? (
            <div className={styles.empty}>
              <p>
                Nothing matches those filters.{" "}
                <button
                  type="button"
                  className={styles.link}
                  onClick={clearTags}
                >
                  Clear them
                </button>{" "}
                to see the whole crate.
              </p>
            </div>
          ) : (
            <CoverFlow
              albums={visible}
              ref={coverFlow}
              onCentreChange={handleCentreChange}
              onSelect={openCentre}
            />
          )}
          <PickerBar
            albums={albums}
            selected={selected}
            matchCount={visible.length}
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
