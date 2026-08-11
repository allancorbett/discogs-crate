import { describe, expect, it } from "vitest";
import {
  SLOT_COUNT,
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
    expect(centre.y).toBe(0);
    // toBeCloseTo, because negating zero gives -0 and Object.is minds.
    expect(centre.rotate).toBeCloseTo(0);
    expect(centre.z).toBeCloseTo(0);
    expect(centre.scale).toBeGreaterThan(1);
    expect(centre.opacity).toBe(1);
  });

  it("stacks below the centre for later records and above for earlier ones", () => {
    expect(geometryFor(2).y).toBeGreaterThan(0);
    expect(geometryFor(-2).y).toBeLessThan(0);
  });

  it("mirrors the two halves of the stack", () => {
    const above = geometryFor(-3);
    const below = geometryFor(3);
    expect(above.y).toBeCloseTo(-below.y);
    expect(above.rotate).toBeCloseTo(-below.rotate);
    expect(above.z).toBeCloseTo(below.z);
  });

  it("tips each cover's inner edge towards the viewer", () => {
    // rotateX is positive towards the bottom of the screen, so a cover below
    // the centre needs a negative angle to bring its top edge forward.
    expect(geometryFor(1).rotate).toBeLessThan(0);
    expect(geometryFor(-1).rotate).toBeGreaterThan(0);
  });

  it("tips covers to a fixed angle once clear of the centre", () => {
    expect(geometryFor(1).rotate).toBe(geometryFor(6).rotate);
    expect(Math.abs(geometryFor(1).rotate)).toBeGreaterThan(45);
  });

  it("interpolates rather than snapping between states", () => {
    const half = geometryFor(0.5);
    expect(Math.abs(half.rotate)).toBeGreaterThan(0);
    expect(Math.abs(half.rotate)).toBeLessThan(Math.abs(geometryFor(1).rotate));
    expect(half.y).toBeGreaterThan(0);
    expect(half.y).toBeLessThan(geometryFor(1).y);
  });

  it("moves covers monotonically down the stack", () => {
    let previous = 0;
    for (let distance = 0.25; distance < 11; distance += 0.25) {
      const { y } = geometryFor(distance);
      expect(y).toBeGreaterThan(previous);
      previous = y;
    }
  });

  it("packs distant covers progressively tighter", () => {
    const near = geometryFor(3).y - geometryFor(2).y;
    const far = geometryFor(11).y - geometryFor(10).y;
    expect(far).toBeLessThan(near);
  });

  it("keeps every visible cover within about one cover-height of the centre", () => {
    // Vertical room is scarce. Once a cover has faded out it may be clipped,
    // but everything still visible has to fit inside the stage, or covers
    // vanish at its edge instead of fading there.
    for (let distance = 0; distance < 40; distance += 0.05) {
      const { y, opacity } = geometryFor(distance);
      if (opacity > 0) expect(y).toBeLessThanOrEqual(1.15);
    }
  });

  it("paints covers nearer the centre in front", () => {
    expect(geometryFor(1).zIndex).toBeGreaterThan(geometryFor(4).zIndex);
    expect(geometryFor(0).zIndex).toBeGreaterThan(geometryFor(1).zIndex);
  });

  it("fades the window edge out instead of popping it", () => {
    expect(geometryFor(2).opacity).toBe(1);
    expect(geometryFor(8).opacity).toBe(0);
    expect(geometryFor(4).opacity).toBeGreaterThan(0);
    expect(geometryFor(4).opacity).toBeLessThan(1);
  });

  it("has faded out well before a slot is recycled to the other end", () => {
    // Slots wrap at half a window; anything still visible there would jump.
    expect(geometryFor(SLOT_COUNT / 2).opacity).toBe(0);
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
