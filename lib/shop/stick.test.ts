import { describe, expect, it } from "vitest";
import { STICK_RANGE, stickVector } from "./stick";

describe("stickVector", () => {
  const origin = { x: 100, y: 500 };

  it("is centred where the thumb landed", () => {
    expect(stickVector(origin, origin)).toEqual({ x: 0, y: 0 });
  });

  it("deflects in proportion inside its range", () => {
    const half = stickVector(origin, { x: 100 + STICK_RANGE / 2, y: 500 });
    expect(half.x).toBeCloseTo(0.5);
    expect(half.y).toBeCloseTo(0);
  });

  it("never pushes past full deflection, whichever way", () => {
    const far = stickVector(origin, { x: 100 + 400, y: 500 - 400 });
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1);
    expect(far.x).toBeGreaterThan(0);
    expect(far.y).toBeLessThan(0);
  });
});
