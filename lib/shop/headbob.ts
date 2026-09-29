/**
 * A little rise and fall as you walk.
 *
 * Driven by distance covered rather than time, so it is tied to strides: it
 * keeps pace when you sprint, slows when you scrape along a wall, and stops
 * dead when you do. A time-driven bob carries on swaying while you stand
 * still against a corner, which reads as the floor moving rather than you.
 *
 * Deliberately small. This is meant to be felt rather than noticed - the
 * covers are the thing worth looking at, and a camera that lurches makes them
 * harder to read.
 */

const TAU = Math.PI * 2;

/**
 * Metres per full cycle - two footfalls, left and right.
 *
 * Chosen to sit near the footstep sound's cadence at walking pace, so the dip
 * and the thud broadly agree. They drift apart at a sprint, because the sound
 * is on a fixed time interval and this is not; the bob is the one that is
 * right, and the sound is off by default.
 */
const STRIDE = 2.6;

/** Vertical travel, in metres. About the height of a fingernail. */
const RISE = 0.03;

/** Sideways travel, in metres, perpendicular to the view. */
const SWAY = 0.015;

/** Seconds for the bob to reach full size, and to settle back to nothing. */
const EASE_IN = 0.12;
const EASE_OUT = 0.2;

export interface Bob {
  /** Vertical offset to add to eye height, in metres. */
  y: number;
  /** Sideways offset along the camera's right vector, in metres. */
  sway: number;
}

const STILL: Bob = { y: 0, sway: 0 };

export class HeadBob {
  private phase = 0;
  private amplitude = 0;
  private readonly enabled: boolean;

  /**
   * @param enabled pass false to disable entirely. Camera motion the player
   * did not ask for is a well-known trigger for motion sickness, so this is
   * off wherever the system asks for reduced motion.
   */
  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /**
   * Advance the bob.
   *
   * @param distance metres actually travelled since the last frame - what the
   * collision solver allowed, not what was asked for, so walking into a wall
   * does not bob.
   * @param dt seconds since the last frame.
   */
  update(distance: number, dt: number): Bob {
    if (!this.enabled) return STILL;

    const moving = distance > 1e-4;

    // Ease the amplitude rather than the phase, so stopping mid-stride settles
    // smoothly to level instead of snapping the camera upright.
    const ease = moving ? EASE_IN : EASE_OUT;
    const k = ease > 0 ? Math.min(1, dt / ease) : 1;
    this.amplitude += ((moving ? 1 : 0) - this.amplitude) * k;

    if (moving) this.phase = (this.phase + (distance / STRIDE) * TAU) % TAU;

    if (this.amplitude < 1e-3) {
      this.amplitude = 0;
      return STILL;
    }

    return {
      // Twice the phase: the head dips once per footfall, twice per stride.
      y: Math.sin(this.phase * 2) * RISE * this.amplitude,
      // Once per stride: you lean onto one foot, then the other.
      sway: Math.sin(this.phase) * SWAY * this.amplitude,
    };
  }
}

/** Does the system ask for reduced motion? Safe where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export { STRIDE, RISE, SWAY };
