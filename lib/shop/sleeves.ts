/**
 * How the records stand in a crate, in the crate's own frame: x across it, y
 * up from its floor, +z toward the person digging.
 *
 * At rest they all lean back together. Digging tips the ones you have been
 * through forward over the front lip, one on top of the next, and lifts the one
 * you are on a little clear of the rest — the way you actually flick through a
 * crate.
 */

export const SLEEVE = { size: 0.315, thickness: 0.006 } as const;

/** Crate floor above the bin top. */
export const CRATE_FLOOR = 0.02;

export interface SleevePose {
  z: number;
  y: number;
  /** Tilt about x: negative leans back, away from you; positive tips toward you. */
  angle: number;
}

const REST_ANGLE = -0.2;
const SPACING = 0.03;
const FRONT = 0.06;

/**
 * @param index which record (0 is the front of the crate)
 * @param current the record being looked at while digging, or null at rest
 */
export function sleevePose(index: number, current: number | null): SleevePose {
  if (current === null) {
    return { z: FRONT - index * SPACING, y: CRATE_FLOOR, angle: REST_ANGLE };
  }

  if (index < current) {
    // Flipped: tipped over the front lip, later ones lying on earlier ones.
    return {
      z: 0.1 + index * 0.004,
      y: CRATE_FLOOR + 0.004 * index,
      angle: 0.55 - index * 0.03,
    };
  }

  const behind = index - current;
  if (behind === 0) {
    // Lifted a touch and stood nearly upright, so the whole cover shows.
    return { z: FRONT, y: CRATE_FLOOR + 0.05, angle: -0.1 };
  }
  return { z: FRONT - behind * SPACING - 0.01, y: CRATE_FLOOR, angle: REST_ANGLE - 0.04 };
}
