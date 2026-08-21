import type { AuthStrategy } from "./auth";
import { discogsFetch } from "./client";
import type {
  Album,
  CollectionPage,
  DiscogsArtist,
  DiscogsCollectionItem,
  DiscogsCollectionResponse,
  DiscogsFormat,
  DiscogsIdentity,
  DiscogsReleaseResponse,
  ReleaseDetail,
  Track,
} from "./types";

/** Discogs' maximum, and what keeps a big collection to few round trips. */
const PER_PAGE = 100;

/**
 * Discogs disambiguates same-named artists with a numeric suffix — the band
 * Nirvana is stored as "Nirvana (2)". That's a database detail, not part of
 * the name, so it never belongs on screen.
 */
export function cleanArtistName(name: string): string {
  return name.replace(/\s\(\d+\)$/, "").trim();
}

/**
 * Rebuilds the credit as printed on the sleeve. Each artist carries a `join`
 * string describing how it connects to the next one ("&", "Feat.", ","), and
 * `anv` holds the variation the release actually credits, which may differ
 * from the canonical artist name.
 */
export function formatArtistCredit(artists: DiscogsArtist[]): string {
  if (!artists?.length) return "Unknown Artist";

  return artists
    .map((artist, index) => {
      const name = cleanArtistName(artist.anv?.trim() || artist.name);
      if (index === artists.length - 1) return name;

      const join = artist.join?.trim();
      if (!join) return `${name}, `;
      if (join === ",") return `${name}, `;
      return `${name} ${join} `;
    })
    .join("")
    .trim();
}

/** Flattens format entries to searchable tags: ["Vinyl", "LP", "Album"]. */
export function formatTags(formats: DiscogsFormat[]): string[] {
  const tags = (formats ?? []).flatMap((format) => [
    format.name,
    ...(format.descriptions ?? []),
  ]);
  return [...new Set(tags.filter(Boolean))];
}

export function normalizeAlbum(item: DiscogsCollectionItem): Album {
  const info = item.basic_information;
  return {
    id: info.id,
    artist: formatArtistCredit(info.artists),
    title: info.title,
    // Discogs uses 0 for "year unknown".
    year: info.year && info.year > 0 ? info.year : null,
    coverImage: info.cover_image || info.thumb || "",
    thumb: info.thumb || info.cover_image || "",
    genres: info.genres ?? [],
    styles: info.styles ?? [],
    formats: formatTags(info.formats),
    labels: [...new Set((info.labels ?? []).map((label) => label.name))],
    discogsUrl: `https://www.discogs.com/release/${info.id}`,
  };
}

/**
 * One page of the user's collection. Folder 0 is the built-in "All" folder.
 * The client walks pages so covers can render before the whole collection
 * has arrived.
 *
 * The sort is fixed and not a parameter. What the user sees is filed by
 * `lib/ordering.ts` once the whole collection is in memory, so asking Discogs
 * for a different order would change nothing on screen. It still has to be
 * *some* stable order: paging through an unsorted collection can hand back the
 * same release twice and skip another, so this asks for the one order every
 * page agrees on.
 */
export async function fetchCollectionPage(
  auth: AuthStrategy,
  username: string,
  page: number,
): Promise<CollectionPage> {
  const data = await discogsFetch<DiscogsCollectionResponse>(
    `/users/${encodeURIComponent(username)}/collection/folders/0/releases`,
    auth,
    {
      searchParams: {
        page,
        per_page: PER_PAGE,
        sort: "artist",
        sort_order: "asc",
      },
    },
  );

  return {
    albums: data.releases.map(normalizeAlbum),
    page: data.pagination.page,
    pages: data.pagination.pages,
    totalItems: data.pagination.items,
  };
}

/** Verifies a token and tells us who it belongs to. */
export async function fetchIdentity(
  auth: AuthStrategy,
): Promise<DiscogsIdentity> {
  return discogsFetch<DiscogsIdentity>("/oauth/identity", auth);
}

function normalizeTracklist(
  tracks: DiscogsReleaseResponse["tracklist"],
): Track[] {
  return (tracks ?? []).map((track) => ({
    position: track.position,
    title: track.title,
    duration: track.duration,
    artist: track.artists?.length
      ? formatArtistCredit(track.artists)
      : undefined,
    // Discogs marks section rows on multi-part releases as "heading"/"index".
    isHeading: track.type_ !== "track",
  }));
}

export async function fetchRelease(
  auth: AuthStrategy,
  releaseId: number,
): Promise<ReleaseDetail> {
  const data = await discogsFetch<DiscogsReleaseResponse>(
    `/releases/${releaseId}`,
    auth,
  );

  const primaryImage =
    data.images?.find((image) => image.type === "primary") ?? data.images?.[0];

  return {
    id: data.id,
    artist: formatArtistCredit(data.artists),
    title: data.title,
    year: data.year && data.year > 0 ? data.year : null,
    country: data.country ?? null,
    released: data.released_formatted ?? data.released ?? null,
    coverImage: primaryImage?.uri ?? null,
    genres: data.genres ?? [],
    styles: data.styles ?? [],
    labels: (data.labels ?? []).map((label) => ({
      name: label.name,
      catno: label.catno,
    })),
    formats: formatTags(data.formats),
    tracklist: normalizeTracklist(data.tracklist),
    videos: (data.videos ?? []).map((video) => ({
      uri: video.uri,
      title: video.title,
    })),
    discogsUrl: data.uri || `https://www.discogs.com/release/${data.id}`,
  };
}
