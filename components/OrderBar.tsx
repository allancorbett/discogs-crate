"use client";

import { memo } from "react";
import { SORT_MODES, type SortMode } from "@/lib/ordering";
import styles from "./OrderBar.module.css";

interface Props {
  sort: SortMode;
  onSort: (mode: SortMode) => void;
}

/**
 * Memoized alongside the carousel: a progress count ticking up mid-import is
 * no reason to re-render the order pills.
 */
export const OrderBar = memo(function OrderBar({ sort, onSort }: Props) {
  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <span className={styles.label} aria-hidden="true">
          Order
        </span>
        <div className={styles.chips} role="group" aria-label="Order the crate">
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
    </div>
  );
});
