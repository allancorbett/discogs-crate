/**
 * Seeded, tileable noise for painting the shop's surfaces. Every texture is
 * generated from a fixed seed, so the floor is the same floor on every visit
 * and on every device, and nothing has to be downloaded.
 */

/** mulberry32: small, fast, and good enough to scatter bricks and knots. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/**
 * Value noise in [0, 1] that repeats every `periodX` lattice cells across and
 * `periodY` down, so a texture built from it tiles without a seam.
 */
export function tileNoise(
  x: number,
  y: number,
  periodX: number,
  seed = 0,
  periodY = periodX,
): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const wrapX = (v: number) => ((v % periodX) + periodX) % periodX;
  const wrapY = (v: number) => ((v % periodY) + periodY) % periodY;
  const x0 = wrapX(xi);
  const x1 = wrapX(xi + 1);
  const y0 = wrapY(yi);
  const y1 = wrapY(yi + 1);
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/**
 * Fractal noise over a unit square: `u`, `v` in [0, 1), with `scaleX` lattice
 * cells across and `scaleY` down at the coarsest octave (stretch one to get
 * grain). Tiles at the square's edges.
 */
export function fbm(
  u: number,
  v: number,
  scaleX: number,
  octaves = 4,
  seed = 0,
  scaleY = scaleX,
): number {
  let sum = 0;
  let amplitude = 0.5;
  let norm = 0;
  let cx = Math.max(1, Math.round(scaleX));
  let cy = Math.max(1, Math.round(scaleY));
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(u * cx, v * cy, cx, seed + o * 101, cy) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    cx *= 2;
    cy *= 2;
  }
  return sum / norm;
}
