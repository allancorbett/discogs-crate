/**
 * Pure geometry and index maths for the crate carousel. Kept free of DOM
 * access so the awkward parts — slot recycling, wrapping, easing — can be
 * reasoned about and tested on their own.
 *
 * The stack runs vertically: the centred record stands square-on, the ones
 * behind it lean back above, the ones already flipped past lean back below.
 * That's the read of a record crate tipped towards you, rather than the
 * left-to-right shelf the horizontal cover flow drew.
 */

/**
 * How many cover elements exist in the DOM, regardless of collection size.
 * Only needs to cover the centre plus everything before the fade completes —
 * see FADE_END — with a slot to spare at each end.
 */
export const SLOT_COUNT = 13;

export interface Geometry {
  /** Vertical offset in cover-heights, positive downwards. */
  y: number;
  /** Depth in pixels; the covers above and below sit behind the centre one. */
  z: number;
  /**
   * X rotation in degrees. Negative below the centre and positive above it, so
   * each cover's inner edge — the one nearest the centre — tips towards the
   * viewer and the stack opens up like a crate being leafed through.
   */
  rotate: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

/*
 * Tuned against a different constraint than the horizontal version was.
 * Vertical room is the scarce dimension in a browser window, so the whole
 * stack has to live inside roughly one cover-height either side of the centre
 * — see the corresponding test — or covers get clipped at the edge of the
 * stage instead of fading there.
 *
 * The angle is steeper than a horizontal cover flow's for that reason: it
 * foreshortens each sleeve harder, so a shorter fan still shows a decent slice
 * of every cover rather than a stack of thin slats. It also happens to be much
 * closer to how records actually sit in a crate.
 */
const CENTRE_GAP = 0.62; // gap between the centre cover and the first one out
const SIDE_STEP = 0.19; // additional offset per cover further out
const SIDE_COMPRESSION = 0.68; // <1 packs distant covers tighter, as iTunes did
const ANGLE = 68; // degrees the covers above and below are tipped by
const DEPTH = 190; // px the two stacks sit behind the centre cover
const CENTRE_LIFT = 0.12; // extra scale on the centre cover
const FADE_START = 2.6; // covers begin fading this far out…
const FADE_END = 5; // …and are fully transparent here

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Positive modulo — JS `%` keeps the sign of the dividend. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * Which album a recycled slot should display.
 *
 * Each slot owns one residue class mod `slotCount`, so as the carousel moves,
 * a given slot's album changes once every `slotCount` steps rather than on
 * every step. That keeps image swaps to roughly one per album crossed instead
 * of one per slot per step, which matters a lot during a fast spin.
 */
export function slotPosition(
  slot: number,
  position: number,
  slotCount: number,
): number {
  return slot + slotCount * Math.round((position - slot) / slotCount);
}

/**
 * Places a cover from its signed distance to the centre — positive for records
 * further down the crate. Distance is fractional, so covers interpolate
 * smoothly between states instead of snapping as the centre changes.
 */
export function geometryFor(distance: number): Geometry {
  const inner = clamp(distance, -1, 1);
  const outer = distance - inner;
  const magnitude = Math.abs(distance);

  const y =
    inner * CENTRE_GAP +
    Math.sign(outer) * SIDE_STEP * Math.abs(outer) ** SIDE_COMPRESSION;

  const fade = 1 - (magnitude - FADE_START) / (FADE_END - FADE_START);

  return {
    y,
    // The small extra depth per cover further out keeps the browser's own 3D
    // sorting in agreement with zIndex, instead of leaving coplanar covers to
    // paint in an arbitrary order.
    z: -DEPTH * Math.abs(inner) - 2 * Math.abs(outer),
    // Negated because a positive rotateX swings the *bottom* edge forwards:
    // the covers below the centre need their top edge brought towards the
    // viewer, and the ones above their bottom edge.
    rotate: -inner * ANGLE,
    scale: 1 + CENTRE_LIFT * (1 - Math.abs(inner)),
    opacity: clamp(fade, 0, 1),
    zIndex: 1000 - Math.round(magnitude * 10),
  };
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** Fast start, long decelerating tail — the slot-machine feel. */
export function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

/** Ease-out that drifts just past the target and settles back onto it. */
export function easeOutBack(t: number, overshoot = 0.7): number {
  const c = overshoot + 1;
  return 1 + c * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

export interface SpinPlan {
  from: number;
  to: number;
  durationMs: number;
}

/** Longest sweep worth animating; past this it's just a blur, not a reveal. */
const MAX_SWEEP = 90;
const MIN_SWEEP = 12;

/**
 * Plans the spin onto an already-decided winner: keep travelling forwards
 * through at least a few dozen covers, then land on the first position
 * congruent to the target index.
 */
export function planSpin(
  from: number,
  targetIndex: number,
  count: number,
  reducedMotion = false,
): SpinPlan {
  if (count <= 0) return { from, to: from, durationMs: 0 };

  if (reducedMotion) {
    // Shortest path to the target, no laps.
    const delta = shortestDelta(from, targetIndex, count);
    return { from, to: from + delta, durationMs: 400 };
  }

  const sweep = clamp(count * 3, MIN_SWEEP, MAX_SWEEP);
  const floor = from + sweep;
  // Smallest value >= floor that is congruent to targetIndex (mod count).
  const to = floor + wrapIndex(targetIndex - floor, count);

  return { from, to, durationMs: 2400 + Math.min(count, 400) };
}

/** Signed distance from `position` to `targetIndex` the short way round. */
export function shortestDelta(
  position: number,
  targetIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const raw = wrapIndex(targetIndex - position, count);
  return raw > count / 2 ? raw - count : raw;
}
