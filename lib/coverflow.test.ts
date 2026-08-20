import { describe, expect, it } from "vitest";
import {
  SLOT_COUNT,
  easeOutBack,
  easeOutQuint,
  geometryFor,
  planSpin,
  shortestDelta,
  slotPosition,
  wrapIndex,
} from "./coverflow";

describe("wrapIndex", () => {
  it("wraps forwards past the end", () => {
    expect(wrapIndex(12, 10)).toBe(2);
  });

  it("wraps negatives, unlike the % operator", () => {
    expect(wrapIndex(-1, 10)).toBe(9);
    expect(wrapIndex(-11, 10)).toBe(9);
  });

  it("is a no-op inside the range", () => {
    expect(wrapIndex(5, 10)).toBe(5);
  });

  it("survives an empty collection", () => {
    expect(wrapIndex(3, 0)).toBe(0);
  });
});

describe("slotPosition", () => {
  const slots = SLOT_COUNT;

  it("keeps every slot within half a window of the centre", () => {
    for (let position = 0; position < 200; position += 0.5) {
      for (let slot = 0; slot < slots; slot++) {
        const distance = slotPosition(slot, position, slots) - position;
        expect(Math.abs(distance)).toBeLessThanOrEqual(slots / 2);
      }
    }
  });

  it("never assigns two slots the same position", () => {
    const positions = Array.from({ length: slots }, (_, slot) =>
      slotPosition(slot, 47.3, slots),
    );
    expect(new Set(positions).size).toBe(slots);
  });

  it("holds a slot's album steady until the window has moved past it", () => {
    // The recycling only pays off if a slot's assignment is stable across
    // many steps — one image swap per cover crossed, not one per slot.
    const first = slotPosition(0, 0, slots);
    expect(slotPosition(0, slots / 2 - 1, slots)).toBe(first);
    expect(slotPosition(0, slots, slots)).not.toBe(first);
  });
});

describe("geometryFor", () => {
  it("leaves the centre cover square-on and largest", () => {
    const centre = geometryFor(0);
    expect(centre.x).toBe(0);
    expect(centre.rotate).toBe(0);
    // toBeCloseTo, because negating zero gives -0 and Object.is minds.
    expect(centre.z).toBeCloseTo(0);
    expect(centre.scale).toBeGreaterThan(1);
    expect(centre.opacity).toBe(1);
  });

  it("mirrors the two sides", () => {
    const left = geometryFor(-3);
    const right = geometryFor(3);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.rotate).toBeCloseTo(-right.rotate);
    expect(left.z).toBeCloseTo(right.z);
  });

  it("turns side covers to a fixed angle once clear of the centre", () => {
    expect(geometryFor(1).rotate).toBe(geometryFor(6).rotate);
    expect(Math.abs(geometryFor(1).rotate)).toBeGreaterThan(45);
  });

  it("interpolates rather than snapping between states", () => {
    const half = geometryFor(0.5);
    expect(half.rotate).toBeGreaterThan(0);
    expect(half.rotate).toBeLessThan(geometryFor(1).rotate);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(geometryFor(1).x);
  });

  it("moves covers monotonically outwards", () => {
    let previous = 0;
    for (let distance = 0.25; distance < 11; distance += 0.25) {
      const { x } = geometryFor(distance);
      expect(x).toBeGreaterThan(previous);
      previous = x;
    }
  });

  it("packs distant covers progressively tighter", () => {
    const near = geometryFor(3).x - geometryFor(2).x;
    const far = geometryFor(11).x - geometryFor(10).x;
    expect(far).toBeLessThan(near);
  });

  it("paints covers nearer the centre in front", () => {
    expect(geometryFor(1).zIndex).toBeGreaterThan(geometryFor(4).zIndex);
    expect(geometryFor(0).zIndex).toBeGreaterThan(geometryFor(1).zIndex);
  });

  it("fades the window edge out instead of popping it", () => {
    expect(geometryFor(4).opacity).toBe(1);
    expect(geometryFor(11).opacity).toBe(0);
    expect(geometryFor(8).opacity).toBeGreaterThan(0);
    expect(geometryFor(8).opacity).toBeLessThan(1);
  });
});

describe("shortestDelta", () => {
  it("goes forwards when that is nearer", () => {
    expect(shortestDelta(0, 3, 100)).toBe(3);
  });

  it("goes backwards across the seam rather than the long way round", () => {
    expect(shortestDelta(0, 98, 100)).toBe(-2);
  });

  it("works from a wrapped-past position", () => {
    // The carousel's position grows without bound as it spins.
    expect(shortestDelta(250, 51, 100)).toBe(1);
  });

  it("returns zero when already there", () => {
    expect(shortestDelta(40, 40, 100)).toBe(0);
  });
});

describe("planSpin", () => {
  it("always travels forwards, never jumps backwards", () => {
    const plan = planSpin(0, 1, 100);
    expect(plan.to).toBeGreaterThan(plan.from);
  });

  it("lands exactly on the chosen winner", () => {
    for (const target of [0, 7, 42, 99]) {
      const plan = planSpin(13.0, target, 100);
      expect(wrapIndex(plan.to, 100)).toBe(target);
      expect(Number.isInteger(plan.to)).toBe(true);
    }
  });

  it("does several laps of a small collection", () => {
    const plan = planSpin(0, 2, 5);
    expect(plan.to - plan.from).toBeGreaterThanOrEqual(12);
  });

  it("caps the sweep on a big collection", () => {
    // Past a certain point it's a blur, not a reveal — no need to cross 3000
    // covers to feel random.
    const plan = planSpin(0, 500, 3000);
    expect(plan.to - plan.from).toBeLessThanOrEqual(3000);
  });

  it("collapses to a short glide under reduced motion", () => {
    const plan = planSpin(10, 60, 100, true);
    expect(plan.durationMs).toBeLessThanOrEqual(400);
    // Shortest path, so it may travel backwards — no theatre.
    expect(plan.to).toBe(10 + shortestDelta(10, 60, 100));
    expect(wrapIndex(plan.to, 100)).toBe(60);
  });

  it("does nothing with an empty collection", () => {
    const plan = planSpin(5, 0, 0);
    expect(plan.to).toBe(5);
    expect(plan.durationMs).toBe(0);
  });
});

describe("easeOutQuint", () => {
  it("starts at the start and ends at the end", () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
  });

  it("front-loads the movement, which is what makes it read as a spin", () => {
    // Half the time, well past half the distance.
    expect(easeOutQuint(0.5)).toBeGreaterThan(0.9);
  });

  it("never goes backwards", () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const value = easeOutQuint(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("stays within the travel it was given", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeOutQuint(t)).toBeGreaterThanOrEqual(0);
      expect(easeOutQuint(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("easeOutBack", () => {
  it("starts at the start and settles exactly on the target", () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it("overshoots before it settles — the point of the curve", () => {
    const peak = Math.max(
      ...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)),
    );
    expect(peak).toBeGreaterThan(1);
  });

  it("keeps the overshoot small enough to read as a settle, not a bounce", () => {
    const peak = Math.max(
      ...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100)),
    );
    expect(peak).toBeLessThan(1.1);
  });

  it("takes a bigger overshoot when asked for one", () => {
    const gentle = Math.max(
      ...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100, 0.7)),
    );
    const strong = Math.max(
      ...Array.from({ length: 101 }, (_, i) => easeOutBack(i / 100, 2)),
    );
    expect(strong).toBeGreaterThan(gentle);
  });
});
