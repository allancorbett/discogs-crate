import { describe, expect, it } from "vitest";
import type { Album } from "../discogs/types";
import {
  BIN_HEIGHT,
  CRATE_RIM,
  MAX_PER_CRATE,
  UNFILED,
  buildCrates,
  digStance,
  layoutShop,
  placeCrates,
  resolveMove,
} from "./layout";

let nextId = 1;

function album(partial: Partial<Album> = {}): Album {
  const id = partial.id ?? nextId++;
  return {
    id,
    artist: `Artist ${id}`,
    title: `Title ${id}`,
    year: null,
    coverImage: "",
    thumb: "",
    genres: [],
    styles: [],
    formats: [],
    labels: [],
    discogsUrl: "",
    ...partial,
  };
}

function collection(counts: Record<string, number>): Album[] {
  return Object.entries(counts).flatMap(([genre, count]) =>
    Array.from({ length: count }, () =>
      album({ genres: genre === UNFILED ? [] : [genre] }),
    ),
  );
}

describe("buildCrates", () => {
  it("gives every genre at least one crate, and none more than five records", () => {
    const albums = collection({ Rock: 12, Jazz: 1, Electronic: 5, [UNFILED]: 3 });
    const crates = buildCrates(albums);

    expect(new Set(crates.map((c) => c.genre))).toEqual(
      new Set(["Rock", "Jazz", "Electronic", UNFILED]),
    );
    for (const crate of crates) {
      expect(crate.albums.length).toBeGreaterThan(0);
      expect(crate.albums.length).toBeLessThanOrEqual(MAX_PER_CRATE);
    }
    expect(crates.filter((c) => c.genre === "Rock")).toHaveLength(3);
    expect(crates.flatMap((c) => c.albums)).toHaveLength(albums.length);
  });

  it("never mixes genres in a crate", () => {
    const crates = buildCrates(collection({ Rock: 3, Jazz: 3 }));
    for (const crate of crates) {
      expect(new Set(crate.albums.map((a) => a.genres[0]))).toEqual(
        new Set([crate.genre]),
      );
    }
  });

  it("shelves genres alphabetically with unfiled records last", () => {
    const crates = buildCrates(collection({ [UNFILED]: 1, Rock: 1, Blues: 1 }));
    expect(crates.map((c) => c.genre)).toEqual(["Blues", "Rock", UNFILED]);
  });

  it("files by artist the way a shop does, ignoring a leading The", () => {
    const crates = buildCrates([
      album({ artist: "The Smiths", genres: ["Rock"] }),
      album({ artist: "Blur", genres: ["Rock"] }),
      album({ artist: "Pixies", genres: ["Rock"] }),
    ]);
    expect(crates[0].albums.map((a) => a.artist)).toEqual([
      "Blur",
      "Pixies",
      "The Smiths",
    ]);
  });

  it("numbers a genre's crates", () => {
    const crates = buildCrates(collection({ Jazz: 11 }));
    expect(crates.map((c) => `${c.part}/${c.parts}`)).toEqual([
      "1/3",
      "2/3",
      "3/3",
    ]);
  });
});

describe("placeCrates", () => {
  const sizes = [0, 1, 7, 60, 400, 1500];

  it.each(sizes)("keeps every crate inside the room (%i crates)", (count) => {
    const layout = placeCrates(buildCrates(collection({ Rock: count * 5 })));
    const { width, depth } = layout.room;

    expect(layout.crates).toHaveLength(count);
    for (const crate of layout.crates) {
      expect(Math.abs(crate.x)).toBeLessThan(width / 2 - 1);
      expect(Math.abs(crate.z)).toBeLessThan(depth / 2 - 1);
    }
  });

  it.each(sizes)("never stacks two crates in one spot (%i crates)", (count) => {
    const layout = placeCrates(buildCrates(collection({ Rock: count * 5 })));
    const spots = layout.crates.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)}`);
    expect(new Set(spots).size).toBe(spots.length);

    let overlaps = 0;
    for (let i = 0; i < layout.crates.length; i++) {
      for (let j = i + 1; j < layout.crates.length; j++) {
        const a = layout.crates[i];
        const b = layout.crates[j];
        if (Math.abs(a.x - b.x) < 0.38 && Math.abs(a.z - b.z) < 0.3) {
          overlaps++;
        }
      }
    }
    expect(overlaps).toBe(0);
  });

  it("puts the crate rims at waist height", () => {
    expect(BIN_HEIGHT).toBeGreaterThan(0.6);
    expect(CRATE_RIM).toBeGreaterThanOrEqual(0.85);
    expect(CRATE_RIM).toBeLessThanOrEqual(1.05);
  });

  it("keeps the counter, turntable and door clear of the bins", () => {
    const layout = layoutShop(collection({ Rock: 300 }));
    const { counter, spawn } = layout;
    const touches = (x: number, z: number, pad: number) =>
      layout.bins.some(
        (bin) =>
          Math.abs(x - bin.x) < bin.width / 2 + pad &&
          Math.abs(z - bin.z) < bin.depth / 2 + pad,
      );

    expect(touches(counter.x, counter.z, counter.depth)).toBe(false);
    expect(touches(layout.turntable.x, layout.turntable.z, 0.8)).toBe(false);
    expect(touches(spawn.x, spawn.z, 0.5)).toBe(false);
  });

  it("marks the first crate of each genre", () => {
    const layout = layoutShop(collection({ Blues: 6, Rock: 2 }));
    expect(layout.crates.map((c) => c.leadsGenre)).toEqual([true, false, true]);
  });

  it("builds the same shop from the same collection", () => {
    const albums = collection({ Rock: 17, Jazz: 4 });
    expect(layoutShop(albums)).toEqual(layoutShop([...albums]));
  });
});

describe("digStance", () => {
  it("stands in front of a crate, facing it", () => {
    const front = digStance({ x: 1, z: 2, rotation: 0 });
    expect(front.z).toBeGreaterThan(2);
    expect(front.x).toBeCloseTo(1);

    const back = digStance({ x: 1, z: 2, rotation: Math.PI });
    expect(back.z).toBeLessThan(2);
  });

  it("is somewhere the player can actually stand", () => {
    const layout = layoutShop(collection({ Rock: 60 }));
    for (const crate of layout.crates) {
      const stance = digStance(crate);
      expect(resolveMove(layout, stance, stance)).toEqual({
        x: stance.x,
        z: stance.z,
      });
    }
  });
});

describe("resolveMove", () => {
  const layout = {
    room: { width: 10, depth: 10, height: 3 },
    obstacles: [{ x: 0, z: 0, width: 2, depth: 1 }],
  };

  it("walks freely across open floor", () => {
    expect(resolveMove(layout, { x: 3, z: 3 }, { x: 3.2, z: 2.9 })).toEqual({
      x: 3.2,
      z: 2.9,
    });
  });

  it("stops at the walls", () => {
    const next = resolveMove(layout, { x: 4.5, z: 0 }, { x: 9, z: 0 });
    expect(next.x).toBeLessThan(5);
  });

  it("slides along a bin instead of walking through it", () => {
    const next = resolveMove(layout, { x: 0, z: 1 }, { x: 0.3, z: 0.6 });
    expect(next).toEqual({ x: 0.3, z: 1 });
  });
});
