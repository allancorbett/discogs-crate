"use client";

import { useMemo, useState } from "react";
import { facetsOf } from "@/lib/picker";
import type { Album } from "@/lib/discogs/types";
import styles from "./PickerBar.module.css";

/** Genres shown before the list is truncated. */
const GENRE_LIMIT = 10;
const STYLE_LIMIT = 24;

interface Props {
  albums: Album[];
  selected: Set<string>;
  matchCount: number;
  spinning: boolean;
  onToggle: (tag: string) => void;
  onClear: () => void;
  onPick: () => void;
}

export function PickerBar({
  albums,
  selected,
  matchCount,
  spinning,
  onToggle,
  onClear,
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

      {showStyles ? (
        <div
          className={`${styles.chips} ${styles.styleRow}`}
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
}
