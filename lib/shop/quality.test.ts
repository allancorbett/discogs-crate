import { describe, expect, it } from "vitest";
import { QUALITY_LEVELS, QualityGovernor, requestedLevel } from "./quality";

/** Runs frames of a fixed duration through the governor for `seconds`. */
function run(governor: QualityGovernor, frameMs: number, seconds: number, start = 0) {
  let now = start;
  while (now < start + seconds * 1000) {
    now += frameMs;
    governor.sample(frameMs, now);
  }
  return now;
}

describe("QualityGovernor", () => {
  it("starts high on desktop and a notch lower on touch", () => {
    expect(new QualityGovernor(false).index).toBe(QUALITY_LEVELS.length - 1);
    expect(new QualityGovernor(true).index).toBeLessThan(QUALITY_LEVELS.length - 1);
  });

  it("steps down on a device that keeps missing its frames", () => {
    const governor = new QualityGovernor(false);
    run(governor, 40, 10);
    expect(governor.index).toBe(0);
  });

  it("climbs back up once there is headroom", () => {
    const governor = new QualityGovernor(false);
    const later = run(governor, 40, 10);
    run(governor, 8, 10, later);
    expect(governor.index).toBe(QUALITY_LEVELS.length - 1);
  });

  it("holds steady in the dead zone between the thresholds", () => {
    const governor = new QualityGovernor(true);
    const before = governor.index;
    run(governor, 17, 10);
    expect(governor.index).toBe(before);
  });

  it("doesn't change more than once every couple of seconds", () => {
    const governor = new QualityGovernor(false);
    run(governor, 40, 1.5);
    expect(governor.index).toBe(QUALITY_LEVELS.length - 2);
  });

  it("ignores a single absurd frame, like a tab coming back into focus", () => {
    const governor = new QualityGovernor(false);
    expect(governor.sample(5000, 100)).toBeNull();
    expect(governor.index).toBe(QUALITY_LEVELS.length - 1);
  });

  it("gives resolution up last", () => {
    const ratios = QUALITY_LEVELS.map((level) => level.maxPixelRatio);
    expect(ratios.filter((r) => r === ratios[0])).toHaveLength(1);
    expect([...ratios].sort()).toEqual(ratios);
  });
});

describe("requestedLevel", () => {
  it("reads a level from the address", () => {
    expect(requestedLevel("?quality=0")).toBe(0);
    expect(requestedLevel("?view=shop&quality=2")).toBe(2);
  });

  it("ignores anything that isn't a level", () => {
    expect(requestedLevel("")).toBeNull();
    expect(requestedLevel("?quality=9")).toBeNull();
    expect(requestedLevel("?quality=high")).toBeNull();
    expect(requestedLevel("?quality=-1")).toBeNull();
  });

  it("can start the governor anywhere on the ladder", () => {
    expect(new QualityGovernor(false, 0).index).toBe(0);
  });
});
