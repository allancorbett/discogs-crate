/**
 * Colour helpers for the shop: the mood lighting that follows whatever is on
 * the turntable, and stand-in sleeve colours for records without artwork.
 */

export type Rgb = [number, number, number];

/**
 * The colour a sleeve reads as from across the room, from raw RGBA pixels.
 *
 * A plain average of a cover turns most of them into mud, so pixels are
 * weighted by how saturated they are, and near-black, near-white and
 * transparent ones barely count. A cover that is all greys still gets its grey.
 */
export function dominantColour(pixels: ArrayLike<number>): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  let plainR = 0;
  let plainG = 0;
  let plainB = 0;
  let plain = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.5) continue;

    const pr = pixels[i];
    const pg = pixels[i + 1];
    const pb = pixels[i + 2];
    plainR += pr;
    plainG += pg;
    plainB += pb;
    plain++;

    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const lightness = (max + min) / 510;
    // Favour vivid mid-tones; the extremes are the paper and the ink.
    const w = saturation ** 2 * (1 - Math.abs(lightness - 0.5) * 1.6);
    if (w <= 0) continue;

    r += pr * w;
    g += pg * w;
    b += pb * w;
    weight += w;
  }

  if (weight > plain * 0.02 && weight > 0) {
    return [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)];
  }
  if (plain > 0) {
    return [
      Math.round(plainR / plain),
      Math.round(plainG / plain),
      Math.round(plainB / plain),
    ];
  }
  return [128, 128, 128];
}

/**
 * A stable, pleasant sleeve colour for a record with no artwork, so the same
 * record is always the same colour in every visit to the shop.
 */
export function sleeveColour(seed: number): Rgb {
  // Integer hash (a variant of splitmix) so neighbouring ids scatter.
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  const hue = ((h >>> 0) % 360) / 360;
  return hslToRgb(hue, 0.45, 0.42);
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

export const toCss = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
