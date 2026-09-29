/**
 * Adaptive quality, after musicmaze's governor.
 *
 * Phones vary enormously and there is no reliable way to ask how fast one is,
 * so the only honest approach is to measure: sample frame times, and when the
 * budget is missed for a sustained stretch, step the expensive effects down a
 * notch. Steps back up when there is comfortable headroom, with a dead zone
 * between the two thresholds so it can't oscillate.
 */

export interface QualityLevel {
  /** Soft shadows from the lamps nearest you. */
  shadows: boolean;
  /** Shadow map edge, in texels. */
  shadowMapSize: number;
  /** Ambient occlusion: the soft darkening where things meet. */
  ambientOcclusion: boolean;
  /** Glow round the bulbs and the neon. */
  bloom: boolean;
  /** Cap on devicePixelRatio. */
  maxPixelRatio: number;
}

/**
 * Cheapest first. As in musicmaze, resolution is the last thing given up:
 * a blurry screen spoils the sleeves, which are the point, whereas losing
 * the occlusion or the shadows only makes the room a little flatter.
 */
export const QUALITY_LEVELS: QualityLevel[] = [
  { shadows: false, shadowMapSize: 512, ambientOcclusion: false, bloom: false, maxPixelRatio: 1 },
  { shadows: false, shadowMapSize: 512, ambientOcclusion: false, bloom: true, maxPixelRatio: 1.5 },
  { shadows: true, shadowMapSize: 1024, ambientOcclusion: false, bloom: true, maxPixelRatio: 1.5 },
  { shadows: true, shadowMapSize: 2048, ambientOcclusion: true, bloom: true, maxPixelRatio: 2 },
];

/** Start near the top on desktop and a notch lower on touch, then measure. */
export function startingLevel(touch: boolean): number {
  return touch ? 1 : QUALITY_LEVELS.length - 1;
}

/**
 * A `?quality=0`–`3` override from the address, for trying the shop on a
 * machine the governor can't read — or just seeing what each level looks like.
 */
export function requestedLevel(search: string): number | null {
  const raw = new URLSearchParams(search).get("quality");
  if (raw === null || !/^\d$/.test(raw)) return null;
  const level = Number(raw);
  return level < QUALITY_LEVELS.length ? level : null;
}

/** Frames per decision on a device hitting its budget. */
const SAMPLE_SIZE = 20;
/** Decide anyway once a window has been open this long, so slow devices get help fast. */
const MAX_WINDOW_MS = 1000;
/** Too few frames to tell signal from noise. */
const MIN_SAMPLES = 5;
/** Drop a level below this. */
const SLOW_MS = 22;
/** Only climb back up when comfortably inside budget. */
const FAST_MS = 13;
/** Don't change level more than once every couple of seconds. */
const COOLDOWN_MS = 2000;

export class QualityGovernor {
  private samples: number[] = [];
  private level: number;
  private lastChange = -Infinity;
  private windowStart = 0;

  constructor(touch: boolean, start = startingLevel(touch)) {
    this.level = Math.min(QUALITY_LEVELS.length - 1, Math.max(0, start));
  }

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }

  get index(): number {
    return this.level;
  }

  /**
   * Feed one frame's duration. Returns the new level when it changed, so the
   * caller only reconfigures the renderer when there is something to do.
   */
  sample(frameMs: number, now: number): QualityLevel | null {
    // A tab regaining focus is not a performance signal.
    if (frameMs > 500) return null;

    if (this.samples.length === 0) this.windowStart = now;
    this.samples.push(frameMs);

    const enoughFrames = this.samples.length >= SAMPLE_SIZE;
    const windowExpired =
      this.samples.length >= MIN_SAMPLES && now - this.windowStart >= MAX_WINDOW_MS;
    if (!enoughFrames && !windowExpired) return null;

    const sorted = [...this.samples].sort((a, b) => a - b);
    // Median, not mean: one stutter shouldn't cost everyone their shadows.
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples = [];

    if (now - this.lastChange < COOLDOWN_MS) return null;

    if (median > SLOW_MS && this.level > 0) {
      this.level--;
    } else if (median < FAST_MS && this.level < QUALITY_LEVELS.length - 1) {
      this.level++;
    } else {
      return null;
    }
    this.lastChange = now;
    return this.current;
  }
}
