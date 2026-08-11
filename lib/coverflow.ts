/**
 * Pure geometry and index maths for the CoverFlow carousel. Kept free of DOM
 * access so the awkward parts — slot recycling, wrapping, easing — can be
 * reasoned about and tested on their own.
 */

/** How many cover elements exist in the DOM, regardless of collection size. */
export const SLOT_COUNT = 23;

export interface Geometry {
  /** Horizontal offset in cover-widths. */
  x: number;
  /** Depth in pixels; side covers sit behind the centre one. */
  z: number;
  /** Y rotation in degrees. */
  rotate: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

const CENTRE_GAP = 0.58; // gap between the centre cover and the first side one
const SIDE_STEP = 0.3; // additional offset per cover further out
const SIDE_COMPRESSION = 0.72; // <1 packs distant covers tighter, as iTunes did
const ANGLE = 62; // degrees the side covers are turned by
const DEPTH = 190; // px the side stacks sit behind the centre cover
const CENTRE_LIFT = 0.14; // extra scale on the centre cover
const FADE_START = 6; // covers begin fading this far out…
const FADE_END = 10.5; // …and are fully transparent here

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
 * Places a cover from its signed distance to the centre. Distance is
 * fractional, so covers interpolate smoothly between states instead of
 * snapping as the centre changes.
 */
export function geometryFor(distance: number): Geometry {
  const inner = clamp(distance, -1, 1);
  const outer = distance - inner;
  const magnitude = Math.abs(distance);

  const x =
    inner * CENTRE_GAP +
    Math.sign(outer) * SIDE_STEP * Math.abs(outer) ** SIDE_COMPRESSION;

  const fade = 1 - (magnitude - FADE_START) / (FADE_END - FADE_START);

  return {
    x,
    // The small extra depth per cover further out keeps the browser's own 3D
    // sorting in agreement with zIndex, instead of leaving coplanar covers to
    // paint in an arbitrary order.
    z: -DEPTH * Math.abs(inner) - 2 * Math.abs(outer),
    // Side covers turn to face outward, so the edge nearest the centre reads
    // as closest to the viewer — the classic fanned-stack look.
    rotate: inner * ANGLE,
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
