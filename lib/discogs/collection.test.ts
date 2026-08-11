import { describe, expect, it } from "vitest";
import {
  cleanArtistName,
  formatArtistCredit,
  formatTags,
  normalizeAlbum,
} from "./collection";
import type { DiscogsArtist, DiscogsCollectionItem } from "./types";

function artist(partial: Partial<DiscogsArtist> & { name: string }) {
  return {
    id: 1,
    anv: "",
    join: "",
    role: "",
    tracks: "",
    resource_url: "",
    ...partial,
  };
}

describe("cleanArtistName", () => {
  it("strips Discogs' numeric disambiguator", () => {
    expect(cleanArtistName("Nirvana (2)")).toBe("Nirvana");
  });

  it("leaves numbers that are part of the name", () => {
    expect(cleanArtistName("Sunn O)))")).toBe("Sunn O)))");
    expect(cleanArtistName("Front 242")).toBe("Front 242");
    expect(cleanArtistName("Blink-182")).toBe("Blink-182");
  });

  it("only strips a suffix, not a mid-name parenthetical", () => {
    expect(cleanArtistName("Add (N) To (X)")).toBe("Add (N) To (X)");
  });
});

describe("formatArtistCredit", () => {
  it("uses the single artist's name", () => {
    expect(formatArtistCredit([artist({ name: "Aphex Twin" })])).toBe(
      "Aphex Twin",
    );
  });

  it("prefers the name variation credited on the release", () => {
    expect(
      formatArtistCredit([artist({ name: "Richard D. James", anv: "AFX" })]),
    ).toBe("AFX");
  });

  it("joins collaborators with the join text from Discogs", () => {
    expect(
      formatArtistCredit([
        artist({ name: "Massive Attack", join: "&" }),
        artist({ name: "Mad Professor" }),
      ]),
    ).toBe("Massive Attack & Mad Professor");
  });

  it("handles a featuring credit", () => {
    expect(
      formatArtistCredit([
        artist({ name: "Burial", join: "Feat." }),
        artist({ name: "Four Tet" }),
      ]),
    ).toBe("Burial Feat. Four Tet");
  });

  it("falls back to a comma when no join text is given", () => {
    expect(
      formatArtistCredit([
        artist({ name: "A" }),
        artist({ name: "B" }),
        artist({ name: "C" }),
      ]),
    ).toBe("A, B, C");
  });

  it("cleans disambiguators inside a multi-artist credit", () => {
    expect(
      formatArtistCredit([
        artist({ name: "Orbital (2)", join: "&" }),
        artist({ name: "Sasha (2)" }),
      ]),
    ).toBe("Orbital & Sasha");
  });

  it("degrades gracefully when Discogs gives no artists", () => {
    expect(formatArtistCredit([])).toBe("Unknown Artist");
  });
});

describe("formatTags", () => {
  it("flattens names and descriptions into searchable tags", () => {
    expect(
      formatTags([
        { name: "Vinyl", qty: "2", descriptions: ["LP", "Album"] },
      ]),
    ).toEqual(["Vinyl", "LP", "Album"]);
  });

  it("de-duplicates across multiple format entries", () => {
    expect(
      formatTags([
        { name: "Vinyl", qty: "1", descriptions: ["LP"] },
        { name: "Vinyl", qty: "1", descriptions: ["LP", "Reissue"] },
      ]),
    ).toEqual(["Vinyl", "LP", "Reissue"]);
  });

  it("copes with a format carrying no descriptions", () => {
    expect(formatTags([{ name: "CD", qty: "1" }])).toEqual(["CD"]);
  });
});

describe("normalizeAlbum", () => {
  const item: DiscogsCollectionItem = {
    id: 7024,
    instance_id: 244018,
    date_added: "2009-08-20T07:00:00-07:00",
    rating: 0,
    basic_information: {
      id: 7024,
      master_id: 82134,
      master_url: "",
      resource_url: "",
      thumb: "https://i.discogs.com/thumb.jpeg",
      cover_image: "https://i.discogs.com/cover.jpeg",
      title: "Selected Ambient Works",
      year: 1992,
      formats: [{ name: "Vinyl", qty: "2", descriptions: ["LP"] }],
      labels: [
        {
          id: 5,
          name: "Apollo",
          catno: "AMB1",
          entity_type: "1",
          resource_url: "",
        },
        {
          id: 5,
          name: "Apollo",
          catno: "AMB2",
          entity_type: "1",
          resource_url: "",
        },
      ],
      artists: [artist({ name: "Aphex Twin" })],
      genres: ["Electronic"],
      styles: ["Ambient", "Techno"],
    },
  };

  it("flattens a collection item for rendering", () => {
    expect(normalizeAlbum(item)).toEqual({
      id: 7024,
      instanceId: 244018,
      artist: "Aphex Twin",
      title: "Selected Ambient Works",
      year: 1992,
      coverImage: "https://i.discogs.com/cover.jpeg",
      thumb: "https://i.discogs.com/thumb.jpeg",
      genres: ["Electronic"],
      styles: ["Ambient", "Techno"],
      formats: ["Vinyl", "LP"],
      labels: ["Apollo"],
      dateAdded: "2009-08-20T07:00:00-07:00",
      discogsUrl: "https://www.discogs.com/release/7024",
    });
  });

  it("treats year 0 as unknown rather than showing it", () => {
    const undated = {
      ...item,
      basic_information: { ...item.basic_information, year: 0 },
    };
    expect(normalizeAlbum(undated).year).toBeNull();
  });

  it("falls back to the thumbnail when there is no cover image", () => {
    const noCover = {
      ...item,
      basic_information: { ...item.basic_information, cover_image: "" },
    };
    expect(normalizeAlbum(noCover).coverImage).toBe(
      "https://i.discogs.com/thumb.jpeg",
    );
  });

  it("leaves both image fields empty when Discogs has no art", () => {
    const noArt = {
      ...item,
      basic_information: {
        ...item.basic_information,
        cover_image: "",
        thumb: "",
      },
    };
    const album = normalizeAlbum(noArt);
    expect(album.coverImage).toBe("");
    expect(album.thumb).toBe("");
  });

  it("tolerates a release with no styles", () => {
    const noStyles = {
      ...item,
      basic_information: { ...item.basic_information, styles: undefined },
    };
    expect(normalizeAlbum(noStyles).styles).toEqual([]);
  });
});
