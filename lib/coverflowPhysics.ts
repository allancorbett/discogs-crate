/**
 * The physics behind the carousel's motion. Pure maths, no DOM, so the feel
 * can be tuned and tested on its own.
 *
 * Everything is in covers and seconds. The carousel is modelled as one heavy
 * body sliding along a rail: it coasts under drag after a flick, and a damped
 * spring catches it on the nearest cover once it's slow enough. Each cover also
 * hangs off that body on a spring of its own, so it leans into a change of
 * speed and wobbles to a stop after it rather than moving as one rigid sheet.
 */

export interface Body {
  position: number;
  velocity: number;
}

export interface Spring {
  /** Natural frequency in rad/s: how stiff the spring is. */
  omega: number;
  /** 1 is critically damped; below it overshoots and settles back. */
  zeta: number;
}

/** Pulls the carousel onto a cover. Slightly underdamped, so it lands with heft. */
export const SETTLE_SPRING: Spring = { omega: 13, zeta: 0.72 };
/** Reduced-motion users get the same catch with no overshoot. */
export const SETTLE_SPRING_CALM: Spring = { omega: 16, zeta: 1 };
/**
 * Couples the carousel to a finger or a wheel. Stiff enough to feel direct,
 * soft enough that the body has momentum of its own instead of teleporting
 * with every noisy pointer sample — which is also what gives a release a clean
 * velocity to fling with.
 */
export const FOLLOW_SPRING: Spring = { omega: 38, zeta: 1 };

/** Drag coefficient while coasting, per second. Lower coasts further. */
export const FRICTION = 4.5;
/** Below this speed (covers/sec) a coasting carousel is handed to the settle spring. */
export const HANDOFF_SPEED = 3.5;

/** How the covers hang off the carousel. */
export const SWAY = {
  omega: 11,
  zeta: 0.32,
  /** Degrees of lean per cover/sec of carousel speed. */
  lean: 0.9,
  /** Never lean further than this, however hard the flick. */
  maxDegrees: 13,
  /** Covers further out hang on slightly softer springs, so a stop ripples outward. */
  softening: 0.035,
} as const;

/** Longest step the integrator takes; stiff springs need small ones. */
const MAX_STEP = 1 / 240;

/**
 * Advances a damped spring towards `target`. Semi-implicit Euler, substepped,
 * which stays stable for the stiff follow spring even on a dropped frame.
 */
export function stepSpring(
  body: Body,
  target: number,
  spring: Spring,
  dt: number,
): void {
  const k = spring.omega * spring.omega;
  const c = 2 * spring.zeta * spring.omega;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / steps;

  for (let i = 0; i < steps; i++) {
    const acceleration = k * (target - body.position) - c * body.velocity;
    body.velocity += acceleration * h;
    body.position += body.velocity * h;
  }
}

/** Free coasting under viscous drag, solved exactly rather than integrated. */
export function coast(body: Body, friction: number, dt: number): void {
  const decay = Math.exp(-friction * dt);
  body.position += (body.velocity / friction) * (1 - decay);
  body.velocity *= decay;
}

/** Where a coasting body would come to rest if left alone. */
export function restingPoint(body: Body, friction: number): number {
  return body.position + body.velocity / friction;
}

/** The launch speed that coasts from `from` to rest exactly on `to`. */
export function glideVelocity(from: number, to: number, friction: number): number {
  return (to - from) * friction;
}

/** How far a cover leans (degrees) for a given carousel speed. */
export function leanFor(velocity: number): number {
  const lean = velocity ? -velocity * SWAY.lean : 0;
  return Math.min(SWAY.maxDegrees, Math.max(-SWAY.maxDegrees, lean));
}

/** The sway spring for a cover `distance` covers from the centre. */
export function swaySpring(distance: number): Spring {
  const softer = 1 - Math.min(Math.abs(distance), 8) * SWAY.softening;
  return { omega: SWAY.omega * softer, zeta: SWAY.zeta };
}

/** Close enough to its target, and slow enough, to call still. */
export function isAtRest(
  body: Body,
  target: number,
  positionTolerance = 0.0008,
  velocityTolerance = 0.01,
): boolean {
  return (
    Math.abs(target - body.position) < positionTolerance &&
    Math.abs(body.velocity) < velocityTolerance
  );
}
