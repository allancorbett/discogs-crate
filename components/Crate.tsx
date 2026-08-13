"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumDetail } from "./AlbumDetail";
import { CoverFlow, type CoverFlowHandle } from "./CoverFlow";
import { OrderBar } from "./OrderBar";
import { useCollection } from "@/hooks/useCollection";
import { orderAlbums, type SortMode } from "@/lib/ordering";
import styles from "./Crate.module.css";

interface Props {
  username: string;
  /** Browsing the shared demo collection rather than the visitor's own. */
  demo?: boolean;
  onSignOut: () => void;
}

export function Crate({ username, demo = false, onSignOut }: Props) {
  const { albums, loaded, total, loading, error, unauthorized, refresh } =
    useCollection(username);

  const [sort, setSort] = useState<SortMode>("artist");
  /**
   * Only meaningful in shuffle mode. Seeded from a constant rather than
   * Math.random so the first render matches on the server, and re-rolled the
   * moment the user actually asks to shuffle.
   */
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [panelIndex, setPanelIndex] = useState<number | null>(null);

  const coverFlow = useRef<CoverFlowHandle>(null);

  // A revoked token can only be discovered mid-flight; drop back to the gate.
  useEffect(() => {
    if (unauthorized) onSignOut();
  }, [unauthorized, onSignOut]);

  /** The whole crate, filed in whichever order is on. */
  const visible = useMemo(
    () => orderAlbums(albums, sort, shuffleSeed),
    [albums, sort, shuffleSeed],
  );

  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  // Which release is centred, so an order change can keep it in view.
  const centreIdRef = useRef<number | null>(null);
  const handleCentreChange = useCallback((index: number) => {
    centreIdRef.current = visibleRef.current[index]?.id ?? null;
  }, []);

  /** Everything the user can change that moves records around in `visible`. */
  const viewKey = useMemo(
    () => [sort, sort === "shuffle" ? shuffleSeed : ""].join("|"),
    [sort, shuffleSeed],
  );
  const lastViewKey = useRef(viewKey);

  /**
   * After the visible set is re-filed, stay on the record the user was looking
   * at, and fall back to the start when it has yet to arrive. Deliberately
   * keyed on the order alone — collection pages arriving also change `visible`,
   * and those must not yank the crate around.
   */
  useEffect(() => {
    if (lastViewKey.current === viewKey) return;
    lastViewKey.current = viewKey;

    setPanelIndex(null);

    const id = centreIdRef.current;
    const next = id === null ? -1 : visible.findIndex((a) => a.id === id);
    coverFlow.current?.goTo(next >= 0 ? next : 0, false);
  }, [viewKey, visible]);

  /**
   * Choosing shuffle — including choosing it while it is already on — deals a
   * fresh order, so the button doubles as "shuffle again".
   */
  const chooseSort = useCallback((mode: SortMode) => {
    if (mode === "shuffle") {
      setShuffleSeed(Math.floor(Math.random() * 0x7fffffff) + 1);
    }
    setSort(mode);
  }, []);

  const openCentre = useCallback((index: number) => {
    setPanelIndex(index);
  }, []);

  const closePanel = useCallback(() => {
    setPanelIndex(null);
    coverFlow.current?.focus();
  }, []);

  const panelAlbum = panelIndex === null ? undefined : visible[panelIndex];

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

      {albums.length === 0 ? (
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
            albums={visible}
            ref={coverFlow}
            onCentreChange={handleCentreChange}
            onSelect={openCentre}
          />
          <OrderBar sort={sort} onSort={chooseSort} />
        </>
      )}

      {panelAlbum ? (
        <AlbumDetail album={panelAlbum} onClose={closePanel} />
      ) : null}
    </div>
  );
}
