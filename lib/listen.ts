import type { Album } from "./discogs/types";

export type ListenService = "spotify" | "apple" | "qobuz" | "youtube";

export interface ListenLink {
  id: ListenService;
  label: string;
  href: string;
}

/** Key-free search links — no streaming API credentials needed. */
export function listenLinks(album: Album): ListenLink[] {
  const query = encodeURIComponent(`${album.artist} ${album.title}`);
  return [
    {
      id: "spotify",
      label: "Spotify",
      href: `https://open.spotify.com/search/${query}`,
    },
    {
      id: "apple",
      label: "Apple Music",
      href: `https://music.apple.com/search?term=${query}`,
    },
    {
      id: "qobuz",
      label: "Qobuz",
      // Qobuz store routes are locale-prefixed; a bare /search 404s.
      href: `https://www.qobuz.com/gb-en/search?q=${query}`,
    },
    {
      id: "youtube",
      label: "YouTube",
      href: `https://www.youtube.com/results?search_query=${query}`,
    },
  ];
}

export const LISTEN_SERVICES: { id: ListenService; label: string }[] = [
  { id: "spotify", label: "Spotify" },
  { id: "apple", label: "Apple Music" },
  { id: "qobuz", label: "Qobuz" },
  { id: "youtube", label: "YouTube" },
];

export function isListenService(value: unknown): value is ListenService {
  return LISTEN_SERVICES.some((service) => service.id === value);
}

/** Where dropping a record on the turntable sends you. */
export function listenUrl(album: Album, service: ListenService): string {
  const links = listenLinks(album);
  return (links.find((link) => link.id === service) ?? links[0]).href;
}

const SERVICE_KEY = "crate:listen-service";

/**
 * The turntable's output, remembered per browser. Storage failing (private
 * mode, quota) just means the default comes back next time.
 */
export function readListenService(): ListenService {
  try {
    const stored = localStorage.getItem(SERVICE_KEY);
    if (isListenService(stored)) return stored;
  } catch {
    // Fall through to the default.
  }
  return "spotify";
}

export function writeListenService(service: ListenService): void {
  try {
    localStorage.setItem(SERVICE_KEY, service);
  } catch {
    // Not worth surfacing; the choice still holds for this visit.
  }
}
