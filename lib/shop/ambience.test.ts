import { describe, expect, it } from "vitest";
import { crackleSamples } from "./ambience";

/** A repeatable stand-in for Math.random. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("crackleSamples", () => {
  const samples = crackleSamples(44100, seeded(7));

  it("is mostly a quiet hiss", () => {
    const quiet = samples.filter((s) => Math.abs(s) < 0.02).length;
    expect(quiet / samples.length).toBeGreaterThan(0.97);
  });

  it("has the odd click in it", () => {
    const clicks = samples.filter((s) => Math.abs(s) > 0.15).length;
    expect(clicks).toBeGreaterThan(5);
    expect(clicks).toBeLessThan(400);
  });

  it("never clips", () => {
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(1);
  });
});
