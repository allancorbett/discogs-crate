import { describe, expect, it } from "vitest";
import {
  RECENT_PICKS,
  candidateIndices,
  facetsOf,
  matches,
  pickIndex,
  rememberPick,
} from "./picker";
import type { Album } from "./discogs/types";

function album(partial: Partial<Album> & { id: number }): Album {
  return {
    instanceId: partial.id,
    artist: "Artist",
    title: "Title",
    year: 2000,
    coverImage: "",
    thumb: "",
    genres: [],
    styles: [],
    formats: [],
    labels: [],
    dateAdded: "2020-01-01T00:00:00-00:00",
    discogsUrl: "",
    ...partial,
  };
}

const collection = [
  album({ id: 1, genres: ["Electronic"], styles: ["Techno"] }),
  album({ id: 2, genres: ["Rock"], styles: ["Post-Punk"] }),
  album({ id: 3, genres: ["Electronic", "Rock"], styles: ["Synth-pop"] }),
  album({ id: 4, genres: ["Jazz"], styles: [] }),
];

describe("facetsOf", () => {
  it("counts tags and orders by frequency", () => {
    expect(facetsOf(collection, "genres")).toEqual([
      { name: "Electronic", count: 2 },
      { name: "Rock", count: 2 },
      { name: "Jazz", count: 1 },
    ]);
  });

  it("breaks ties alphabetically so the order is stable", () => {
    const facets = facetsOf(collection, "genres");
    expect(facets[0].name).toBe("Electronic");
    expect(facets[1].name).toBe("Rock");
  });

  it("returns nothing for an empty collection", () => {
    expect(facetsOf([], "styles")).toEqual([]);
  });
});

describe("matches", () => {
  it("matches everything when nothing is selected", () => {
    expect(matches(collection[3], new Set())).toBe(true);
  });

  it("matches on genre", () => {
    expect(matches(collection[1], new Set(["Rock"]))).toBe(true);
  });

  it("matches on style as well as genre", () => {
    expect(matches(collection[0], new Set(["Techno"]))).toBe(true);
  });

  it("rejects an album sharing no selected tag", () => {
    expect(matches(collection[3], new Set(["Rock", "Techno"]))).toBe(false);
  });
});

describe("candidateIndices", () => {
  it("returns positions, not albums, so the carousel can spin to them", () => {
    expect(candidateIndices(collection, ["Rock"])).toEqual([1, 2]);
  });

  it("treats an empty selection as the whole collection", () => {
    expect(candidateIndices(collection, [])).toEqual([0, 1, 2, 3]);
  });

  it("mixes genre and style selections", () => {
    expect(candidateIndices(collection, ["Jazz", "Techno"])).toEqual([0, 3]);
  });
});

describe("pickIndex", () => {
  it("returns null when nothing matches", () => {
    expect(pickIndex(collection, { selected: ["Reggae"] })).toBeNull();
  });

  it("returns null for an empty collection", () => {
    expect(pickIndex([], {})).toBeNull();
  });

  it("only ever picks from the matching pool", () => {
    for (let run = 0; run < 50; run++) {
      const index = pickIndex(collection, { selected: ["Rock"] });
      expect([1, 2]).toContain(index);
    }
  });

  it("avoids recently picked albums", () => {
    const index = pickIndex(collection, {
      selected: ["Rock"],
      exclude: [1],
    });
    expect(index).toBe(2);
  });

  it("drops the exclusion rather than refusing to pick", () => {
    // Everything eligible was seen recently — a narrow filter or a small
    // collection. Returning nothing would be the useless answer.
    const index = pickIndex(collection, {
      selected: ["Rock"],
      exclude: [1, 2],
    });
    expect([1, 2]).toContain(index);
  });

  it("spreads uniformly across the pool", () => {
    // random() at 0 picks the first candidate, just under 1 picks the last.
    expect(pickIndex(collection, { random: () => 0 })).toBe(0);
    expect(pickIndex(collection, { random: () => 0.999 })).toBe(3);
  });
});

describe("rememberPick", () => {
  it("puts the newest pick first", () => {
    expect(rememberPick([2, 3], 1)).toEqual([1, 2, 3]);
  });

  it("moves a repeat to the front instead of duplicating it", () => {
    expect(rememberPick([1, 2, 3], 2)).toEqual([2, 1, 3]);
  });

  it("keeps the history bounded", () => {
    let history: number[] = [];
    for (let index = 0; index < 40; index++) {
      history = rememberPick(history, index);
    }
    expect(history).toHaveLength(RECENT_PICKS);
    expect(history[0]).toBe(39);
  });
});
