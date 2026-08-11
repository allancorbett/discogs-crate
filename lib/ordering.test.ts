import { describe, expect, it } from "vitest";
import { artistKey, genreKey, orderAlbums, shuffleOrder } from "./ordering";
import type { Album } from "./discogs/types";

let nextId = 1;

function album(partial: Partial<Album> = {}): Album {
  const id = partial.id ?? nextId++;
  return {
    id,
    instanceId: id,
    artist: "Unknown Artist",
    title: "Untitled",
    year: null,
    coverImage: "",
    thumb: "",
    genres: [],
    styles: [],
    formats: [],
    labels: [],
    dateAdded: "2024-01-01T00:00:00-08:00",
    discogsUrl: "",
    ...partial,
  };
}

const titles = (albums: Album[]) => albums.map((item) => item.title);

describe("artistKey", () => {
  it("files a leading article under the next word", () => {
    expect(artistKey("The Beatles")).toBe("Beatles");
    expect(artistKey("A Tribe Called Quest")).toBe("Tribe Called Quest");
    expect(artistKey("An Emerald City")).toBe("Emerald City");
  });

  it("leaves an article that is part of the name alone", () => {
    expect(artistKey("Theo Parrish")).toBe("Theo Parrish");
    expect(artistKey("Animal Collective")).toBe("Animal Collective");
  });

  it("drops punctuation that would otherwise sort ahead of the alphabet", () => {
    expect(artistKey("...And You Will Know Us")).toBe("And You Will Know Us");
    expect(artistKey("!!!")).toBe("");
  });
});

describe("genreKey", () => {
  it("takes the first genre listed", () => {
    expect(genreKey(album({ genres: ["Jazz", "Funk"] }))).toBe("Jazz");
  });

  it("reports nothing for an untagged release", () => {
    expect(genreKey(album({ genres: [] }))).toBeNull();
    expect(genreKey(album({ genres: ["  "] }))).toBeNull();
  });
});

describe("orderAlbums", () => {
  it("does not touch the array it was given", () => {
    const albums = [album({ title: "B" }), album({ title: "A" })];
    orderAlbums(albums, "artist");
    expect(titles(albums)).toEqual(["B", "A"]);
  });

  it("files by artist, ignoring leading articles", () => {
    const albums = [
      album({ artist: "Curtis Mayfield", title: "Curtis" }),
      album({ artist: "The Beatles", title: "Revolver" }),
      album({ artist: "Alice Coltrane", title: "Journey" }),
    ];
    expect(titles(orderAlbums(albums, "artist"))).toEqual([
      "Journey", // Coltrane
      "Revolver", // Beatles, filed under B
      "Curtis", // Mayfield
    ]);
  });

  it("puts one artist's records in chronological order", () => {
    const albums = [
      album({ artist: "Bowie", title: "Low", year: 1977 }),
      album({ artist: "Bowie", title: "Hunky Dory", year: 1971 }),
      album({ artist: "Bowie", title: "Ziggy", year: 1972 }),
    ];
    expect(titles(orderAlbums(albums, "artist"))).toEqual([
      "Hunky Dory",
      "Ziggy",
      "Low",
    ]);
  });

  it("files by year, oldest first", () => {
    const albums = [
      album({ title: "Newer", year: 1995 }),
      album({ title: "Oldest", year: 1969 }),
      album({ title: "Older", year: 1980 }),
    ];
    expect(titles(orderAlbums(albums, "year"))).toEqual([
      "Oldest",
      "Older",
      "Newer",
    ]);
  });

  it("files undated records at the end rather than at year zero", () => {
    const albums = [
      album({ title: "Undated", year: null }),
      album({ title: "Dated", year: 1969 }),
    ];
    expect(titles(orderAlbums(albums, "year"))).toEqual(["Dated", "Undated"]);
  });

  it("groups by genre, then by artist within each genre", () => {
    const albums = [
      album({ title: "Rock B", genres: ["Rock"], artist: "Zappa" }),
      album({ title: "Jazz A", genres: ["Jazz"], artist: "Ayler" }),
      album({ title: "Rock A", genres: ["Rock"], artist: "Ash" }),
      album({ title: "Jazz B", genres: ["Jazz"], artist: "Coltrane" }),
    ];
    expect(titles(orderAlbums(albums, "genre"))).toEqual([
      "Jazz A",
      "Jazz B",
      "Rock A",
      "Rock B",
    ]);
  });

  it("files untagged records after every genre", () => {
    const albums = [
      album({ title: "Untagged", genres: [] }),
      album({ title: "Zydeco", genres: ["Zydeco"] }),
    ];
    expect(titles(orderAlbums(albums, "genre"))).toEqual([
      "Zydeco",
      "Untagged",
    ]);
  });

  it("keeps the same records, whatever the mode", () => {
    const albums = Array.from({ length: 30 }, (_, index) =>
      album({ title: `Record ${index}`, year: 1960 + (index % 12) }),
    );
    for (const mode of ["artist", "year", "genre", "shuffle"] as const) {
      const ordered = orderAlbums(albums, mode, 7);
      expect(ordered).toHaveLength(albums.length);
      expect(new Set(ordered.map((item) => item.id))).toEqual(
        new Set(albums.map((item) => item.id)),
      );
    }
  });
});

describe("shuffleOrder", () => {
  const crate = Array.from({ length: 200 }, (_, index) =>
    album({ id: 1000 + index * 7, title: `Record ${index}` }),
  );

  it("deals the same order every time for one seed", () => {
    expect(titles(shuffleOrder(crate, 42))).toEqual(
      titles(shuffleOrder(crate, 42)),
    );
  });

  it("deals a different order for a different seed", () => {
    expect(titles(shuffleOrder(crate, 42))).not.toEqual(
      titles(shuffleOrder(crate, 43)),
    );
  });

  it("actually moves records around", () => {
    const dealt = titles(shuffleOrder(crate, 9));
    const original = titles(crate);
    const stayed = dealt.filter((title, index) => title === original[index]);
    // A handful landing back where they started is expected; most must not.
    expect(stayed.length).toBeLessThan(crate.length / 4);
  });

  it("does not re-deal the records already on screen when a page arrives", () => {
    // The collection streams in a page at a time. A walk-based shuffle would
    // reorder everything on each arrival and yank the crate out from under the
    // user; hashing each id keeps the existing records in the same order.
    const firstPage = crate.slice(0, 100);
    const before = titles(shuffleOrder(firstPage, 5));
    const after = titles(shuffleOrder(crate, 5)).filter((title) =>
      new Set(before).has(title),
    );
    expect(after).toEqual(before);
  });

  it("is unaffected by the order the records arrived in", () => {
    const reversed = [...crate].reverse();
    expect(titles(shuffleOrder(reversed, 3))).toEqual(
      titles(shuffleOrder(crate, 3)),
    );
  });

  it("survives an empty crate", () => {
    expect(shuffleOrder([], 1)).toEqual([]);
  });
});
