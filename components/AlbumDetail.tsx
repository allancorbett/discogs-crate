"use client";

import { useEffect, useRef } from "react";
import { useRelease } from "@/hooks/useRelease";
import type { Album } from "@/lib/discogs/types";
import styles from "./AlbumDetail.module.css";

interface Props {
  album: Album;
  /** Shown only when the panel was opened by a pick, not by browsing. */
  onReroll?: () => void;
  rerolling?: boolean;
  onClose: () => void;
}

/** Key-free search links — no streaming API credentials needed. */
function listenLinks(album: Album) {
  const query = `${album.artist} ${album.title}`;
  return [
    {
      label: "Spotify",
      href: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    },
    {
      label: "Apple Music",
      href: `https://music.apple.com/search?term=${encodeURIComponent(query)}`,
    },
    {
      label: "YouTube",
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    },
  ];
}

export function AlbumDetail({ album, onReroll, rerolling, onClose }: Props) {
  const { release, loading, error } = useRelease(album.id);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, [album.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const cover = release?.coverImage || album.coverImage;
  const tags = [...new Set([...album.genres, ...album.styles])];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${album.title} by ${album.artist}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
          <span className="visually-hidden">Close</span>
        </button>

        <div className={styles.art}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={`${album.title} by ${album.artist}`} />
          ) : (
            <div className={styles.noArt}>{album.title}</div>
          )}
        </div>

        <div className={styles.body}>
          <header className={styles.header}>
            <p className={styles.artist}>{album.artist}</p>
            <h2 className={styles.title}>{album.title}</h2>
            <p className={styles.meta}>
              {[
                album.year,
                release?.labels[0]?.name ?? album.labels[0],
                album.formats.slice(0, 2).join(", "),
                release?.country,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </header>

          {tags.length > 0 ? (
            <ul className={styles.tags}>
              {tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}

          <div className={styles.tracklist}>
            {loading ? (
              <p className={styles.status}>Loading tracklist…</p>
            ) : error ? (
              <p className={styles.status}>{error}</p>
            ) : release?.tracklist.length ? (
              <ol>
                {release.tracklist.map((track, index) =>
                  track.isHeading ? (
                    <li key={index} className={styles.heading}>
                      {track.title}
                    </li>
                  ) : (
                    <li key={index} className={styles.track}>
                      <span className={styles.position}>{track.position}</span>
                      <span className={styles.trackTitle}>
                        {track.title}
                        {track.artist ? (
                          <span className={styles.trackArtist}>
                            {" "}
                            — {track.artist}
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.duration}>{track.duration}</span>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <p className={styles.status}>No tracklist on Discogs.</p>
            )}
          </div>

          {release?.videos.length ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Listen</h3>
              <ul className={styles.videos}>
                {release.videos.slice(0, 4).map((video) => (
                  <li key={video.uri}>
                    <a href={video.uri} target="_blank" rel="noreferrer noopener">
                      {video.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <footer className={styles.actions}>
            {onReroll ? (
              <button
                type="button"
                className={styles.primary}
                onClick={onReroll}
                disabled={rerolling}
              >
                {rerolling ? "Picking…" : "Pick another"}
              </button>
            ) : null}

            <a
              className="pill"
              href={release?.discogsUrl ?? album.discogsUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              View on Discogs ↗
            </a>

            {listenLinks(album).map((link) => (
              <a
                key={link.label}
                className="pill"
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                {link.label} ↗
              </a>
            ))}
          </footer>
        </div>
      </section>
    </div>
  );
}
