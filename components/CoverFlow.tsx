"use client";

import { memo, useEffect, useImperativeHandle, useRef } from "react";
import { SLOT_COUNT } from "@/lib/coverflow";
import { CoverFlowEngine, type SlotElements } from "@/lib/coverflowEngine";
import type { Album } from "@/lib/discogs/types";
import styles from "./CoverFlow.module.css";

export interface CoverFlowHandle {
  goTo(index: number, animate?: boolean): void;
  centreIndex(): number;
  focus(): void;
}

interface Props {
  albums: Album[];
  /** Fired when the carousel comes to rest, not for every cover it passes. */
  onCentreChange?: (index: number) => void;
  /** Activating the centre cover: click, Enter or Space. */
  onSelect?: (index: number) => void;
  ref?: React.Ref<CoverFlowHandle>;
}

/**
 * Markup and caption for the carousel. All motion lives in CoverFlowEngine —
 * see the note there on why this component stays out of the animation path.
 *
 * Memoized: while a collection is importing, the crate re-renders on every
 * page to move the progress count, and the carousel has nothing to say about
 * that until the albums themselves change.
 */
export const CoverFlow = memo(function CoverFlow({
  albums,
  onCentreChange,
  onSelect,
  ref,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const artistRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);

  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const engineRef = useRef<CoverFlowEngine | null>(null);

  // Latest props, so the engine's long-lived callbacks never close over stale
  // values without being torn down and rebuilt.
  const albumsRef = useRef(albums);
  const onCentreChangeRef = useRef(onCentreChange);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onCentreChangeRef.current = onCentreChange;
    onSelectRef.current = onSelect;
  }, [onCentreChange, onSelect]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const slots = slotRefs.current
      .filter((root): root is HTMLDivElement => root !== null)
      .map((root): SlotElements => {
        const img = (role: string) =>
          root.querySelector(`img[data-role=${role}]`) as HTMLImageElement;
        return {
          root,
          thumb: img("thumb"),
          hires: img("hires"),
          reflection: img("reflection"),
        };
      });

    const engine = new CoverFlowEngine({
      stage,
      slots,
      draggingClass: styles.dragging,
      getAlbums: () => albumsRef.current,
      onCaption: (index) => {
        const album = albumsRef.current[index];
        if (!album) return;

        if (titleRef.current) titleRef.current.textContent = album.title;
        if (artistRef.current) {
          artistRef.current.textContent = album.year
            ? `${album.artist} · ${album.year}`
            : album.artist;
        }
        if (counterRef.current) {
          counterRef.current.textContent = `${index + 1} / ${albumsRef.current.length}`;
        }
      },
      onSettle: (index) => onCentreChangeRef.current?.(index),
      onSelect: (index) => onSelectRef.current?.(index),
    });

    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Pages of the collection stream in; wrapping depends on the total, so the
  // engine has to re-derive every slot when the array changes.
  useEffect(() => {
    albumsRef.current = albums;
    engineRef.current?.refresh();
  }, [albums]);

  useImperativeHandle(
    ref,
    (): CoverFlowHandle => ({
      goTo: (index, animate) => engineRef.current?.goTo(index, animate),
      centreIndex: () => engineRef.current?.centreIndex ?? 0,
      focus: () => stageRef.current?.focus(),
    }),
    [],
  );

  return (
    <div className={styles.wrap}>
      <div
        ref={stageRef}
        className={styles.stage}
        tabIndex={0}
        role="group"
        aria-label="Collection cover flow. Use the arrow keys to browse."
      >
        <div className={styles.track}>
          {Array.from({ length: SLOT_COUNT }, (_, index) => (
            <div
              key={index}
              ref={(node) => {
                slotRefs.current[index] = node;
              }}
              className={styles.slot}
            >
              <div className={styles.placeholder} aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-role="thumb"
                className={styles.art}
                alt=""
                draggable={false}
                decoding="async"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-role="hires"
                className={`${styles.art} ${styles.hires}`}
                alt=""
                aria-hidden="true"
                draggable={false}
                decoding="async"
                onLoad={(event) => {
                  event.currentTarget.style.opacity = "1";
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-role="reflection"
                className={styles.reflection}
                alt=""
                aria-hidden="true"
                draggable={false}
                decoding="async"
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.caption} aria-live="polite">
        <div ref={titleRef} className={styles.title} />
        <div ref={artistRef} className={styles.artist} />
        <div ref={counterRef} className={styles.counter} />
      </div>
    </div>
  );
});
