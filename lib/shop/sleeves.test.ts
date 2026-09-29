import { describe, expect, it } from "vitest";
import { sleevePose } from "./sleeves";

describe("sleevePose", () => {
  it("stands every record leaning back together at rest", () => {
    const poses = [0, 1, 2, 3, 4].map((i) => sleevePose(i, null));
    expect(new Set(poses.map((p) => p.angle)).size).toBe(1);
    expect(poses[0].angle).toBeLessThan(0);
    // Front to back.
    for (let i = 1; i < poses.length; i++) {
      expect(poses[i].z).toBeLessThan(poses[i - 1].z);
    }
  });

  it("tips the records you've been through forward, toward you", () => {
    expect(sleevePose(0, 2).angle).toBeGreaterThan(0);
    expect(sleevePose(1, 2).angle).toBeGreaterThan(0);
    expect(sleevePose(2, 2).angle).toBeLessThanOrEqual(0);
  });

  it("lifts the record you're on clear of the rest", () => {
    const current = sleevePose(2, 2);
    expect(current.y).toBeGreaterThan(sleevePose(3, 2).y);
    expect(current.angle).toBeGreaterThan(sleevePose(3, 2).angle);
  });
});
