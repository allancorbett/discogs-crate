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
export const SLOT_COUNT = 15;

export interface Geometry {
  /** Vertical offset in cover-heights, positive downwards. */
  y: number;
  /** Depth in pixels; the covers above and below sit behind the centre one. */
  z: number;
  /**
   * X rotation in degrees, positive so the top edge leans away from the
   * viewer. The same sign above and below the centre — the stack leans one
   * way, like records in a crate, and is never mirrored about the middle.
   */
  rotate: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

/*
 * Depth does the work here, not rotation.
 *
 * An earlier version fanned the stack with a steep rotateX that was mirrored
 * about the centre — covers above tipped one way, covers below the opposite
 * way. Two things were wrong with that. The mirrored halves read as a
 * *reflection* of the stack rather than as more records, and a cover crossing
 * the centre swung through twice the angle, which reads as spinning end over
 * end rather than as being flipped past.
 *
 * So: every off-centre cover leans back by the *same* modest angle, and only
 * the centred one is pulled upright. Nothing is mirrored, nothing rotates far,
 * and the dominant change as the stack moves is depth — each sleeve is pulled
 * towards you as it becomes current and pushed away again as it passes, the
 * way it looks to flip through a crate in a record shop.
 *
 * Vertical room is the scarce dimension in a browser window, so the stack has
 * to stay inside roughly one cover-height either side of the centre — see the
 * corresponding test — or covers get clipped at the edge of the stage instead
 * of fading there.
 */
const CENTRE_GAP = 0.22; // gap between the centre cover and the first one out
const SIDE_STEP = 0.09; // additional offset per cover further out
const SIDE_COMPRESSION = 0.9; // <1 packs distant covers tighter
const LEAN = 13; // degrees every off-centre cover leans back by
const CENTRE_DEPTH = 115; // px the neighbours sit behind the centre cover
const FAR_DEPTH = 26; // additional px per cover beyond the first
const CENTRE_LIFT = 0.08; // extra scale on the centre cover
const FADE_START = 3.2; // covers begin fading this far out…
const FADE_END = 6; // …and are fully transparent here

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
  /** 0 while centred, 1 once a full step out. */
  const settled = Math.min(magnitude, 1);

  const y =
    inner * CENTRE_GAP +
    Math.sign(outer) * SIDE_STEP * Math.abs(outer) ** SIDE_COMPRESSION;

  const fade = 1 - (magnitude - FADE_START) / (FADE_END - FADE_START);

  return {
    y,
    // Depth is the main event: the centred cover sits at the front and every
    // other one is pushed back, so scrolling pulls each sleeve towards the
    // viewer and away again. The extra depth per cover further out also keeps
    // the browser's own 3D sorting in agreement with zIndex, instead of
    // leaving coplanar covers to paint in an arbitrary order.
    z: -CENTRE_DEPTH * settled - FAR_DEPTH * Math.abs(outer),
    // Deliberately *not* mirrored about the centre — the same lean above and
    // below. A positive rotateX swings the top edge away from the viewer,
    // which is how a record sits in a crate. Only the centred cover comes
    // upright.
    rotate: LEAN * settled,
    scale: 1 + CENTRE_LIFT * (1 - settled),
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
