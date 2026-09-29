/**
 * Discogs usernames are letters, digits and `.`, `_`, `-`. Anything else in a
 * shop link is refused before it gets anywhere near a Discogs URL.
 */
const USERNAME = /^[A-Za-z0-9._-]{1,64}$/;

export function isDiscogsUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME.test(value) && !/^\.+$/.test(value);
}

/** The public, shareable address of someone's shop. */
export function shopPath(username: string): string {
  return `/shop/${encodeURIComponent(username)}`;
}
