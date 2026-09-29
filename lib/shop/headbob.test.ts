import { describe, expect, it } from "vitest";
import { HeadBob, RISE, STRIDE, SWAY } from "./headbob";

/** Walk for a while at a steady pace, collecting every offset. */
function walk(bob: HeadBob, metres: number, frames = 120): { y: number; sway: number }[] {
  const step = metres / frames;
  const out = [];
  for (let i = 0; i < frames; i++) out.push(bob.update(step, 1 / 60));
  return out;
}

describe("HeadBob", () => {
  it("is perfectly still before anything moves", () => {
    expect(new HeadBob().update(0, 1 / 60)).toEqual({ y: 0, sway: 0 });
  });

  it("rises and falls once walking", () => {
    const samples = walk(new HeadBob(), STRIDE * 3);
    const ys = samples.map((s) => s.y);
    expect(Math.max(...ys)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
  });

  it("stays subtle - never further than the amplitudes allow", () => {
    for (const s of walk(new HeadBob(), STRIDE * 5)) {
      expect(Math.abs(s.y)).toBeLessThanOrEqual(RISE + 1e-9);
      expect(Math.abs(s.sway)).toBeLessThanOrEqual(SWAY + 1e-9);
    }
  });

  /**
   * Driven by distance, not time. A time-driven bob carries on swaying while
   * you stand still against a corner, which reads as the floor moving rather
   * than you.
   */
  it("does not move when the player does not", () => {
    const bob = new HeadBob();
    walk(bob, STRIDE * 2);
    // Long enough to ease out, then check it has genuinely settled.
    for (let i = 0; i < 120; i++) bob.update(0, 1 / 60);
    expect(bob.update(0, 1 / 60)).toEqual({ y: 0, sway: 0 });
  });

  /** Walking into a wall covers no ground, so it must not bob. */
  it("ignores movement the collision solver refused", () => {
    const bob = new HeadBob();
    for (let i = 0; i < 200; i++) bob.update(0, 1 / 60);
    expect(bob.update(0, 1 / 60)).toEqual({ y: 0, sway: 0 });
  });

  it("settles gradually rather than snapping level", () => {
    const bob = new HeadBob();
    walk(bob, STRIDE * 2);
    const first = bob.update(0, 1 / 60);
    // One frame after stopping it is still somewhere, not instantly zeroed.
    expect(Math.abs(first.y) + Math.abs(first.sway)).toBeGreaterThan(0);
  });

  /** The head dips per footfall, and leans per stride - twice the rate. */
  it("bobs vertically twice per stride and sways once", () => {
    const count = (values: number[]): number => {
      let crossings = 0;
      for (let i = 1; i < values.length; i++) {
        if (Math.sign(values[i]!) !== Math.sign(values[i - 1]!)) crossings++;
      }
      return crossings;
    };
    // Warm up first so the eased amplitude is not damping the early samples.
    const bob = new HeadBob();
    walk(bob, STRIDE * 2);
    const samples = walk(bob, STRIDE * 4, 400);
    expect(count(samples.map((s) => s.y))).toBeGreaterThan(
      count(samples.map((s) => s.sway)),
    );
  });

  it("keeps pace with distance rather than frame count", () => {
    // The same ground covered in half as many frames must reach the same place.
    const coarse = new HeadBob();
    const fine = new HeadBob();
    walk(coarse, STRIDE * 3, 60);
    walk(fine, STRIDE * 3, 240);
    const a = coarse.update(0.001, 1 / 60);
    const b = fine.update(0.001, 1 / 60);
    expect(a.y).toBeCloseTo(b.y, 2);
  });

  /**
   * Camera motion the player did not ask for is a well-known trigger for
   * motion sickness.
   */
  it("does nothing at all when disabled", () => {
    const bob = new HeadBob(false);
    for (const s of walk(bob, STRIDE * 4)) expect(s).toEqual({ y: 0, sway: 0 });
  });
});
