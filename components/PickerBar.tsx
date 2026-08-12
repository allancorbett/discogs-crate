"use client";

import { memo, useMemo, useState } from "react";
import { SORT_MODES, type SortMode } from "@/lib/ordering";
import { facetsOf } from "@/lib/picker";
import type { Album } from "@/lib/discogs/types";
import styles from "./PickerBar.module.css";

/** Genres shown before the list is truncated. */
const GENRE_LIMIT = 10;
const STYLE_LIMIT = 24;

interface Props {
  albums: Album[];
  selected: Set<string>;
  sort: SortMode;
  matchCount: number;
  spinning: boolean;
  onToggle: (tag: string) => void;
  onClear: () => void;
  onSort: (mode: SortMode) => void;
  onPick: () => void;
}

/**
 * Memoized alongside the carousel: a progress count ticking up mid-import is
 * no reason to re-render three dozen filter chips.
 */
export const PickerBar = memo(function PickerBar({
  albums,
  selected,
  sort,
  matchCount,
  spinning,
  onToggle,
  onClear,
  onSort,
  onPick,
}: Props) {
  const [showStyles, setShowStyles] = useState(false);

  const genres = useMemo(
    () => facetsOf(albums, "genres").slice(0, GENRE_LIMIT),
    [albums],
  );
  const stylesFacets = useMemo(
    () => facetsOf(albums, "styles").slice(0, STYLE_LIMIT),
    [albums],
  );

  const filtered = selected.size > 0;

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.pick}
          onClick={onPick}
          disabled={spinning || matchCount === 0}
        >
          {spinning ? "Picking…" : "Pick one for me"}
        </button>

        <div className={styles.chips} role="group" aria-label="Filter by genre">
          {genres.map((facet) => (
            <button
              key={facet.name}
              type="button"
              className="pill"
              data-active={selected.has(facet.name)}
              aria-pressed={selected.has(facet.name)}
              onClick={() => onToggle(facet.name)}
            >
              {facet.name}
              <span className={styles.count}>{facet.count}</span>
            </button>
          ))}

          {stylesFacets.length > 0 ? (
            <button
              type="button"
              className="pill"
              aria-expanded={showStyles}
              onClick={() => setShowStyles((open) => !open)}
            >
              {showStyles ? "Fewer styles" : "More styles"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={`${styles.row} ${styles.orderRow}`}>
        <span className={styles.label} aria-hidden="true">
          Order
        </span>
        <div
          className={`${styles.chips} ${styles.wrapRow}`}
          role="group"
          aria-label="Order the crate"
        >
          {SORT_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="pill"
              data-active={sort === mode.id}
              aria-pressed={sort === mode.id}
              onClick={() => onSort(mode.id)}
            >
              {/* Picking shuffle again re-deals, so say so once it's on. */}
              {mode.id === "shuffle" && sort === "shuffle"
                ? "Shuffle again"
                : mode.label}
            </button>
          ))}
        </div>
      </div>

      {showStyles ? (
        <div
          className={`${styles.chips} ${styles.wrapRow} ${styles.styleRow}`}
          role="group"
          aria-label="Filter by style"
        >
          {stylesFacets.map((facet) => (
            <button
              key={facet.name}
              type="button"
              className="pill"
              data-active={selected.has(facet.name)}
              aria-pressed={selected.has(facet.name)}
              onClick={() => onToggle(facet.name)}
            >
              {facet.name}
              <span className={styles.count}>{facet.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {filtered ? (
        <p className={styles.summary}>
          {/* The carousel is filtered too, so the count reads off the header
              rather than being repeated here. */}
          Showing {matchCount.toLocaleString()} record
          {matchCount === 1 ? "" : "s"}.{" "}
          <button type="button" className={styles.clear} onClick={onClear}>
            Clear filters
          </button>
        </p>
      ) : null}
    </div>
  );
});
