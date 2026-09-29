import { describe, expect, it } from "vitest";
import { findPath } from "./path";
import { layoutShop, resolveMove, type ShopLayout } from "./layout";
import type { Album } from "../discogs/types";

const room = (obstacles: ShopLayout["obstacles"]) => ({
  room: { width: 10, depth: 10, height: 3 },
  obstacles,
});

/** Walks a path with the same collision the player uses; true if it gets there. */
function walks(
  layout: Pick<ShopLayout, "room" | "obstacles">,
  from: { x: number; z: number },
  path: { x: number; z: number }[],
) {
  let at = from;
  for (const waypoint of path) {
    for (let i = 0; i < 400; i++) {
      const dx = waypoint.x - at.x;
      const dz = waypoint.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.02) break;
      const step = Math.min(d, 0.05);
      at = resolveMove(layout, at, { x: at.x + (dx / d) * step, z: at.z + (dz / d) * step });
    }
    if (Math.hypot(waypoint.x - at.x, waypoint.z - at.z) > 0.05) return false;
  }
  return true;
}

describe("findPath", () => {
  it("goes straight across open floor", () => {
    const path = findPath(room([]), { x: -3, z: 0 }, { x: 3, z: 0 });
    expect(path).toEqual([{ x: 3, z: 0 }]);
  });

  it("goes round a bin in the way", () => {
    const layout = room([{ x: 0, z: 0, width: 4, depth: 1 }]);
    const from = { x: 0, z: 2 };
    const to = { x: 0, z: -2 };
    const path = findPath(layout, from, to)!;

    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(to);
    expect(walks(layout, from, path)).toBe(true);
  });

  it("finds its way from the door to the turntable in a busy shop", () => {
    const albums: Album[] = Array.from({ length: 400 }, (_, i) => ({
      id: i + 1,
      artist: `A${i}`,
      title: `T${i}`,
      year: null,
      coverImage: "",
      thumb: "",
      genres: [["Rock", "Jazz", "Electronic"][i % 3]],
      styles: [],
      formats: [],
      labels: [],
      discogsUrl: "",
    }));
    const layout = layoutShop(albums);
    const to = {
      x: layout.turntable.x - 0.35,
      z: layout.turntable.z + layout.counter.depth / 2 + 0.6,
    };
    const path = findPath(layout, layout.spawn, to)!;

    expect(path).not.toBeNull();
    expect(walks(layout, layout.spawn, path)).toBe(true);
  });

  it("gets as close as it can to a spot inside a bin", () => {
    const layout = room([{ x: 0, z: 0, width: 2, depth: 1 }]);
    const path = findPath(layout, { x: 0, z: 3 }, { x: 0, z: 0 })!;
    const end = path.at(-1)!;
    expect(Math.abs(end.z)).toBeGreaterThan(0.5);
    expect(Math.abs(end.z)).toBeLessThan(1.3);
  });
});
