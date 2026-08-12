/**
 * Types for the subset of the Discogs API this app consumes, plus the
 * normalized shapes the UI actually renders.
 */

// ---------------------------------------------------------------------------
// Raw Discogs API responses
// ---------------------------------------------------------------------------

export interface DiscogsArtist {
  id: number;
  name: string;
  /** Artist Name Variation: how the artist is credited on *this* release. */
  anv: string;
  /** Text joining this artist to the next one, e.g. " & ", " Feat. ". */
  join: string;
  role: string;
  tracks: string;
  resource_url: string;
}

export interface DiscogsFormat {
  name: string;
  qty: string;
  text?: string;
  descriptions?: string[];
}

export interface DiscogsLabel {
  id: number;
  name: string;
  catno: string;
  entity_type: string;
  entity_type_name?: string;
  resource_url: string;
  thumbnail_url?: string;
}

export interface DiscogsBasicInformation {
  id: number;
  master_id: number | null;
  master_url: string | null;
  resource_url: string;
  thumb: string;
  cover_image: string;
  title: string;
  year: number;
  formats: DiscogsFormat[];
  labels: DiscogsLabel[];
  artists: DiscogsArtist[];
  genres: string[];
  styles?: string[];
}

export interface DiscogsCollectionItem {
  id: number;
  instance_id: number;
  folder_id?: number;
  date_added: string;
  rating: number;
  basic_information: DiscogsBasicInformation;
}

export interface DiscogsPagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
  urls: { first?: string; prev?: string; next?: string; last?: string };
}

export interface DiscogsCollectionResponse {
  pagination: DiscogsPagination;
  releases: DiscogsCollectionItem[];
}

export interface DiscogsIdentity {
  id: number;
  username: string;
  resource_url: string;
  consumer_name: string;
}

export interface DiscogsUserProfile {
  id: number;
  username: string;
  avatar_url?: string;
  num_collection?: number;
}

export interface DiscogsTrack {
  position: string;
  /** "track" for real tracks; "heading" / "index" for structural rows. */
  type_: string;
  title: string;
  duration: string;
  artists?: DiscogsArtist[];
}

export interface DiscogsVideo {
  uri: string;
  title: string;
  description: string;
  duration: number;
  embed: boolean;
}

export interface DiscogsReleaseResponse {
  id: number;
  title: string;
  year: number;
  uri: string;
  country?: string;
  released?: string;
  released_formatted?: string;
  notes?: string;
  artists: DiscogsArtist[];
  genres?: string[];
  styles?: string[];
  labels: DiscogsLabel[];
  formats: DiscogsFormat[];
  tracklist: DiscogsTrack[];
  videos?: DiscogsVideo[];
  images?: { type: string; uri: string; width: number; height: number }[];
  community?: { rating?: { count: number; average: number } };
}

// ---------------------------------------------------------------------------
// Normalized app shapes
// ---------------------------------------------------------------------------

/** One record in the collection, flattened for rendering and filtering. */
export interface Album {
  id: number;
  instanceId: number;
  artist: string;
  title: string;
  year: number | null;
  coverImage: string;
  thumb: string;
  genres: string[];
  styles: string[];
  formats: string[];
  labels: string[];
  dateAdded: string;
  discogsUrl: string;
}

export interface CollectionPage {
  albums: Album[];
  page: number;
  pages: number;
  totalItems: number;
}

export interface Track {
  position: string;
  title: string;
  duration: string;
  /** Track-level artist credit, only set where it differs from the release. */
  artist?: string;
  isHeading: boolean;
}

export interface ReleaseDetail {
  id: number;
  artist: string;
  title: string;
  year: number | null;
  country: string | null;
  released: string | null;
  notes: string | null;
  coverImage: string | null;
  genres: string[];
  styles: string[];
  labels: { name: string; catno: string }[];
  formats: string[];
  tracklist: Track[];
  videos: { uri: string; title: string }[];
  rating: { average: number; count: number } | null;
  discogsUrl: string;
}

export interface SessionInfo {
  authenticated: boolean;
  username?: string;
  avatarUrl?: string;
  /** This session is browsing the shared demo collection, not the user's own. */
  demo?: boolean;
  /** Whether a demo is offered at all, so the sign-in gate knows to show it. */
  demoAvailable?: boolean;
  /** Whether "Sign in with Discogs" is configured on this deployment. */
  oauthAvailable?: boolean;
}
