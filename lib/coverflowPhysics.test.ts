import { describe, expect, it } from "vitest";
import {
  FOLLOW_SPRING,
  FRICTION,
  SETTLE_SPRING,
  SETTLE_SPRING_CALM,
  SWAY,
  coast,
  glideVelocity,
  isAtRest,
  leanFor,
  restingPoint,
  stepSpring,
  swaySpring,
  type Body,
  type Spring,
} from "./coverflowPhysics";

const FRAME = 1 / 60;

/** Runs a spring at 60fps and records every position it passes through. */
function run(body: Body, target: number, spring: Spring, seconds: number) {
  const path: number[] = [];
  for (let t = 0; t < seconds; t += FRAME) {
    stepSpring(body, target, spring, FRAME);
    path.push(body.position);
  }
  return path;
}

describe("stepSpring", () => {
  it("brings the settle spring to rest on its target", () => {
    const body = { position: 0, velocity: 0 };
    run(body, 1, SETTLE_SPRING, 1.5);
    expect(isAtRest(body, 1)).toBe(true);
  });

  it("lands the settle spring with a small overshoot, for weight", () => {
    const path = run({ position: 0, velocity: 0 }, 1, SETTLE_SPRING, 1.5);
    const peak = Math.max(...path);
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.1);
  });

  it("never overshoots on the reduced-motion spring", () => {
    const path = run({ position: 0, velocity: 0 }, 1, SETTLE_SPRING_CALM, 1.5);
    expect(Math.max(...path)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("stays stable on a long, dropped frame", () => {
    const body = { position: 0, velocity: 0 };
    stepSpring(body, 5, FOLLOW_SPRING, 0.05);
    expect(Number.isFinite(body.position)).toBe(true);
    expect(body.position).toBeLessThan(5.01);
  });

  it("tracks a moving target closely enough to feel direct", () => {
    const body = { position: 0, velocity: 0 };
    let target = 0;
    for (let i = 0; i < 60; i++) {
      target += 4 * FRAME; // four covers a second
      stepSpring(body, target, FOLLOW_SPRING, FRAME);
    }
    expect(target - body.position).toBeLessThan(0.25);
    expect(body.velocity).toBeGreaterThan(3.6);
    expect(body.velocity).toBeLessThan(4.4);
  });
});

describe("coast", () => {
  it("comes to rest where restingPoint predicted", () => {
    const body = { position: 3, velocity: 12 };
    const predicted = restingPoint(body, FRICTION);
    for (let i = 0; i < 600; i++) coast(body, FRICTION, FRAME);
    expect(body.position).toBeCloseTo(predicted, 6);
  });

  it("does not depend on the frame rate", () => {
    const fast = { position: 0, velocity: 10 };
    const slow = { position: 0, velocity: 10 };
    for (let i = 0; i < 120; i++) coast(fast, FRICTION, 1 / 120);
    for (let i = 0; i < 30; i++) coast(slow, FRICTION, 1 / 30);
    expect(fast.position).toBeCloseTo(slow.position, 9);
    expect(fast.velocity).toBeCloseTo(slow.velocity, 9);
  });
});

describe("glideVelocity", () => {
  it("throws hard enough to coast exactly onto the target", () => {
    for (const [from, to] of [
      [0, 7],
      [12.4, 3],
      [-5, 30],
    ]) {
      const body = { position: from, velocity: glideVelocity(from, to, FRICTION) };
      expect(restingPoint(body, FRICTION)).toBeCloseTo(to, 9);
    }
  });
});

describe("leanFor", () => {
  it("leans against the direction of travel", () => {
    expect(leanFor(5)).toBeLessThan(0);
    expect(leanFor(-5)).toBeGreaterThan(0);
    expect(leanFor(0)).toBe(0);
  });

  it("is capped however hard the flick", () => {
    expect(leanFor(1e6)).toBe(-SWAY.maxDegrees);
    expect(leanFor(-1e6)).toBe(SWAY.maxDegrees);
  });
});

describe("sway", () => {
  it("wobbles past upright and back when the carousel stops dead", () => {
    const sway = { position: leanFor(10), velocity: 0 };
    const path = run(sway, 0, swaySpring(0), 3);
    expect(Math.max(...path)).toBeGreaterThan(1);
    expect(Math.abs(sway.position)).toBeLessThan(0.05);
  });

  it("hangs outer covers on softer springs, so a stop ripples outward", () => {
    expect(swaySpring(4).omega).toBeLessThan(swaySpring(0).omega);
    expect(swaySpring(-4).omega).toBe(swaySpring(4).omega);
    expect(swaySpring(100).omega).toBeGreaterThan(0);
  });
});
