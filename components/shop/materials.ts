"use client";

import * as THREE from "three";
import { fbm, rng, tileNoise } from "@/lib/shop/noise";
import { heightToNormal } from "@/lib/shop/normals";

/**
 * The shop's surfaces, painted at runtime: colour, relief and sheen for oak
 * boards, old brick, painted panelling, grille cloth and the rest. Generated
 * from fixed seeds, so they look the same everywhere, cost no downloads and
 * need nothing from the CSP.
 *
 * Each generator runs once, on first use, and is shared from then on.
 */

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

interface Pixel {
  r: number;
  g: number;
  b: number;
  /** Relief, 0 (deep) to 1 (proud). */
  h: number;
  /** 0 glossy to 1 matte. */
  rough: number;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function dataTexture(data: Uint8Array, size: number, colour: boolean) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Runs a per-texel painter over a square and packs the result as PBR maps. */
function paint(
  size: number,
  normalStrength: number,
  painter: (u: number, v: number, out: Pixel) => void,
): PbrSet {
  const colour = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const px: Pixel = { r: 0, g: 0, b: 0, h: 0, rough: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      px.r = px.g = px.b = 0;
      px.h = 0.5;
      px.rough = 0.8;
      painter(x / size, y / size, px);
      const i = y * size + x;
      colour[i * 4] = clamp255(px.r);
      colour[i * 4 + 1] = clamp255(px.g);
      colour[i * 4 + 2] = clamp255(px.b);
      colour[i * 4 + 3] = 255;
      // three reads roughness from the green channel.
      const r = clamp255(px.rough * 255);
      rough[i * 4] = r;
      rough[i * 4 + 1] = r;
      rough[i * 4 + 2] = r;
      rough[i * 4 + 3] = 255;
      height[i] = px.h;
    }
  }

  return {
    map: dataTexture(colour, size, true),
    normalMap: dataTexture(heightToNormal(height, size, size, normalStrength), size, false),
    roughnessMap: dataTexture(rough, size, false),
  };
}

const cache = new Map<string, PbrSet>();
function cached(key: string, make: () => PbrSet): PbrSet {
  let set = cache.get(key);
  if (!set) {
    set = make();
    cache.set(key, set);
  }
  return set;
}

/** A copy of a set with its own tiling, sharing the pixels on the GPU. */
export function tiled(set: PbrSet, repeatX: number, repeatY: number): PbrSet {
  const copy = (texture: THREE.Texture) => {
    const clone = texture.clone();
    clone.repeat.set(repeatX, repeatY);
    return clone;
  };
  return { map: copy(set.map), normalMap: copy(set.normalMap), roughnessMap: copy(set.roughnessMap) };
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

interface WoodTone {
  base: [number, number, number];
  /** How much each board's tint wanders from the base. */
  spread: number;
  /** Ring darkness, 0-1. */
  figure: number;
}

const OAK: WoodTone = { base: [146, 98, 58], spread: 18, figure: 0.1 };
const DARK_OAK: WoodTone = { base: [86, 52, 30], spread: 12, figure: 0.28 };
const PINE: WoodTone = { base: [196, 150, 98], spread: 16, figure: 0.18 };
const BEECH: WoodTone = { base: [190, 138, 88], spread: 26, figure: 0.12 };

/**
 * Boards running down the texture: `boards` across the square, each broken
 * into `lengths` pieces with staggered end joints. With `boards = 1` and no
 * joints it is plain grain for furniture.
 */
function boards(
  size: number,
  tone: WoodTone,
  seed: number,
  options: { boards: number; lengths: number; gap: number; gloss: number },
): PbrSet {
  const random = rng(seed);
  const offsets = Array.from({ length: options.boards }, () => random());
  const tints = Array.from({ length: options.boards * options.lengths }, () => [
    (random() - 0.5) * tone.spread,
    random(),
  ]);

  return paint(size, 5, (u, v, px) => {
    const column = Math.min(options.boards - 1, Math.floor(u * options.boards));
    const across = u * options.boards - column;
    const along = (v + offsets[column]) * options.lengths;
    const piece = Math.floor(along) % options.lengths;
    const alongLocal = along - Math.floor(along);
    const [tint, knotSeed] = tints[column * options.lengths + piece];

    // Growth rings, warped by low-frequency noise so they wander.
    const warp = fbm(u, v, options.boards * 2, 3, seed + 7, options.lengths * 2);
    const rings = 0.5 + 0.5 * Math.sin((across * 2.2 + warp * 3 + knotSeed * 10) * Math.PI * 2 * 1.2);
    const fine = fbm(u, v, options.boards * 24, 2, seed + 3, options.lengths * 2);
    const figure = 1 - tone.figure * rings - 0.12 * (fine - 0.5);

    // An occasional knot, where the rings bunch up and darken.
    let knot = 0;
    if (knotSeed > 0.82) {
      const kx = (across - 0.5) * 2;
      const ky = (alongLocal - knotSeed) * options.lengths * 3;
      knot = Math.max(0, 1 - Math.hypot(kx * 1.4, ky));
    }

    const shade = figure * (1 - knot * 0.45);
    px.r = (tone.base[0] + tint) * shade;
    px.g = (tone.base[1] + tint * 0.7) * shade;
    px.b = (tone.base[2] + tint * 0.4) * shade;

    // Gaps between boards, and bevelled edges either side of them.
    const edge = Math.min(across, 1 - across) * (size / options.boards);
    const end = Math.min(alongLocal, 1 - alongLocal) * (size / options.lengths);
    const toGap = Math.min(edge, options.lengths > 1 ? end : Infinity);
    const inGap = toGap < options.gap;
    const bevel = smoothstep(options.gap, options.gap + 3, toGap);

    // Varnish worn back where feet go.
    const wear = fbm(u, v, 3, 3, seed + 11);
    px.rough = inGap ? 0.95 : options.gloss + wear * 0.3 + (1 - rings) * 0.05;
    px.h = inGap ? 0 : 0.35 + bevel * 0.4 + rings * 0.04 + (fine - 0.5) * 0.08 - knot * 0.05;
    if (inGap) {
      px.r *= 0.25;
      px.g *= 0.22;
      px.b *= 0.2;
    }
  });
}

/** Oak floorboards: one tile is 2 m square. */
export const floorOak = () =>
  cached("floorOak", () => boards(1024, OAK, 11, { boards: 10, lengths: 2, gap: 1.6, gloss: 0.32 }));

/** Dark stained ceiling boards and beams. */
export const ceilingBoards = () =>
  cached("ceiling", () => boards(512, DARK_OAK, 23, { boards: 6, lengths: 1, gap: 1.4, gloss: 0.7 }));

/** Plain dark oak for the browser bins and the counter carcass: 1 m tile. */
export const darkOak = () =>
  cached("darkOak", () => boards(512, DARK_OAK, 31, { boards: 3, lengths: 1, gap: -1, gloss: 0.38 }));

/** Pale pine for the crates. */
export const pine = () =>
  cached("pine", () => boards(512, PINE, 41, { boards: 4, lengths: 1, gap: -1, gloss: 0.62 }));

/** Butcher-block counter top: narrow glued strips of beech. */
export const butcherBlock = () =>
  cached("butcher", () => boards(512, BEECH, 53, { boards: 14, lengths: 3, gap: 0.6, gloss: 0.4 }));

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

const BRICK_REDS: [number, number, number][] = [
  [150, 72, 52],
  [128, 60, 44],
  [164, 88, 62],
  [112, 56, 42],
  [141, 92, 70],
  [120, 70, 55],
];

/** Old red brick in running bond, sooty toward the top: 1.2 m square tile. */
export const brick = () =>
  cached("brick", () => {
    const across = 6;
    const rows = 16;
    const random = rng(61);
    const colours = Array.from({ length: across * rows }, () => ({
      base: BRICK_REDS[Math.floor(random() * BRICK_REDS.length)],
      shade: 0.85 + random() * 0.25,
    }));

    return paint(1024, 7, (u, v, px) => {
      const row = Math.min(rows - 1, Math.floor(v * rows));
      const ly = v * rows - row;
      const bx = u * across + (row % 2) * 0.5;
      const column = Math.floor(bx);
      const lx = bx - column;
      const index = (((column % across) + across) % across) * rows + row;
      const { base, shade } = colours[index];

      // Mortar joints: 10 mm in a 200 x 75 mm brick-plus-joint.
      const ex = Math.min(lx, 1 - lx) * 0.2;
      const ey = Math.min(ly, 1 - ly) * 0.075;
      const toJoint = Math.min(ex, ey) - 0.005;
      const speckle = fbm(u, v, 96, 2, 5);
      const soot = fbm(u, v, 4, 3, 9);

      if (toJoint < 0) {
        const grit = 150 + speckle * 40;
        px.r = grit;
        px.g = grit * 0.95;
        px.b = grit * 0.86;
        px.h = 0.12 + speckle * 0.08;
        px.rough = 0.98;
      } else {
        const pit = fbm(u, v, 48, 3, 13);
        const k = shade * (0.8 + speckle * 0.35) * (1 - soot * 0.35);
        px.r = base[0] * k;
        px.g = base[1] * k;
        px.b = base[2] * k;
        px.h = 0.45 + smoothstep(0, 0.006, toJoint) * 0.4 + (pit - 0.5) * 0.25;
        px.rough = 0.86 + pit * 0.1;
      }
    });
  });

/** Tongue-and-groove panelling, painted a deep green: 1 m square tile. */
export const panelling = () =>
  cached("panelling", () =>
    paint(512, 6, (u, v, px) => {
      const boardsAcross = 10;
      const across = u * boardsAcross - Math.floor(u * boardsAcross);
      const groove = smoothstep(0, 0.08, Math.min(across, 1 - across));
      const brush = fbm(u, v, 160, 2, 17, 6);
      const k = 0.9 + brush * 0.15 - (1 - groove) * 0.35;
      px.r = 34 * k;
      px.g = 66 * k;
      px.b = 52 * k;
      px.h = 0.3 + groove * 0.5 + brush * 0.04;
      px.rough = 0.42 + brush * 0.12 + (1 - groove) * 0.2;
    }),
  );

// ---------------------------------------------------------------------------
// Soft furnishings and fittings
// ---------------------------------------------------------------------------

/** A red tartan rug with a woollen twill: one repeat of the sett per tile. */
export const tartanRug = () =>
  cached("tartan", () =>
    paint(512, 3, (u, v, px) => {
      const band = (t: number) => {
        // Green, navy and a fine gold and black line over a red ground.
        if (t < 0.16) return [18, 40, 28, 0.75];
        if (t > 0.24 && t < 0.31) return [15, 25, 60, 0.7];
        if (t > 0.39 && t < 0.415) return [240, 210, 120, 0.6];
        if (t > 0.6 && t < 0.76) return [18, 40, 28, 0.75];
        if (t > 0.82 && t < 0.845) return [10, 10, 10, 0.6];
        return null;
      };
      let r = 143;
      let g = 29;
      let b = 33;
      for (const t of [u, v]) {
        const over = band(t);
        if (over) {
          r = r * (1 - over[3]) + over[0] * over[3];
          g = g * (1 - over[3]) + over[1] * over[3];
          b = b * (1 - over[3]) + over[2] * over[3];
        }
      }
      // The twill: a fine diagonal rib, and fuzz over everything.
      const twill = 0.5 + 0.5 * Math.sin((u + v) * Math.PI * 2 * 180);
      const fuzz = fbm(u, v, 128, 2, 21);
      const k = 0.82 + twill * 0.12 + fuzz * 0.12;
      px.r = r * k;
      px.g = g * k;
      px.b = b * k;
      px.h = twill * 0.4 + fuzz * 0.6;
      px.rough = 0.95;
    }),
  );

/** Speaker grille cloth: a tight dark weave. */
export const grilleCloth = () =>
  cached("grille", () =>
    paint(256, 4, (u, v, px) => {
      const weave =
        0.5 + 0.25 * Math.sin(u * Math.PI * 2 * 64) + 0.25 * Math.sin(v * Math.PI * 2 * 64);
      const k = 0.7 + weave * 0.4;
      px.r = 40 * k;
      px.g = 36 * k;
      px.b = 34 * k;
      px.h = weave;
      px.rough = 0.95;
    }),
  );

/** Brushed aluminium, streaked side to side. */
export const brushedMetal = () =>
  cached("brushed", () =>
    paint(256, 0.5, (u, v, px) => {
      const streak = tileNoise(u * 2, v * 256, 2, 71, 256) * 0.6 + fbm(u, v, 4, 2, 73, 128) * 0.4;
      const k = 0.9 + streak * 0.12;
      px.r = 196 * k;
      px.g = 198 * k;
      px.b = 204 * k;
      px.h = streak;
      px.rough = 0.26 + streak * 0.18;
    }),
  );

/** Concentric grooves for the playing side of a record, centred on the texture. */
export const grooves = () =>
  cached("grooves", () =>
    // Gentle relief and a modest ring count: real grooves are far finer than
    // any texel, and drawing them literally only shimmers.
    paint(512, 0.5, (u, v, px) => {
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const inBand = r > 0.36 && r < 0.97;
      // A few blank bands between tracks.
      const gap = [0.52, 0.66, 0.8].some((g) => Math.abs(r - g) < 0.008);
      const groove = inBand && !gap ? 0.5 + 0.5 * Math.sin(r * Math.PI * 2 * 48) : 0.5;
      px.r = px.g = px.b = 14 + groove * 8;
      px.h = groove;
      px.rough = inBand ? (gap ? 0.2 : 0.3 + groove * 0.15) : 0.5;
    }),
  );

/** Ginger tabby fur: soft stripes and a fine pile. */
export const tabby = () =>
  cached("tabby", () =>
    paint(256, 2, (u, v, px) => {
      const warp = fbm(u, v, 3, 3, 81);
      const stripe = smoothstep(0.55, 0.85, 0.5 + 0.5 * Math.sin((u * 7 + warp * 1.6) * Math.PI * 2));
      const pile = fbm(u, v, 96, 2, 83, 24);
      const k = (1 - stripe * 0.4) * (0.85 + pile * 0.25);
      px.r = 222 * k;
      px.g = 132 * k;
      px.b = 62 * k;
      px.h = pile;
      px.rough = 0.92;
    }),
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rescales a BoxGeometry's UVs to metres, so a texture tiles at the same size
 * on every face of every box instead of stretching to fit each one.
 */
export function metreUVs<T extends THREE.BufferGeometry>(
  geometry: T,
  size: { width: number; height: number; depth: number },
  metresPerTile = 1,
): T {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const { width: w, height: h, depth: d } = size;
  // BoxGeometry: +x, -x, +y, -y, +z, -z, four vertices a face.
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  const perFace = uv.count / 6;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < perFace; i++) {
      const k = f * perFace + i;
      uv.setXY(k, (uv.getX(k) * faces[f][0]) / metresPerTile, (uv.getY(k) * faces[f][1]) / metresPerTile);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A box, positioned, with UVs in metres. */
export function woodBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  metresPerTile = 1,
) {
  const geometry = metreUVs(new THREE.BoxGeometry(w, h, d), { width: w, height: h, depth: d }, metresPerTile);
  geometry.translate(x, y, z);
  return geometry;
}

// ---------------------------------------------------------------------------
// Getting ready
// ---------------------------------------------------------------------------

/** Every surface the shop uses, with what the loading bar says about it. */
const SURFACES: [label: string, make: () => PbrSet][] = [
  ["Sanding the floorboards", floorOak],
  ["Pointing the brickwork", brick],
  ["Painting the panelling", panelling],
  ["Oiling the beams", ceilingBoards],
  ["Staining the browsers", darkOak],
  ["Knocking the crates together", pine],
  ["Oiling the counter", butcherBlock],
  ["Beating the rug", tartanRug],
  ["Stretching the speaker cloth", grilleCloth],
  ["Polishing the deck", brushedMetal],
  ["Cutting the grooves", grooves],
  ["Waking the cat", tabby],
];

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Paints every surface up front, one per frame, reporting as it goes — so the
 * work happens behind a loading bar rather than as a freeze the first time
 * the shop is drawn.
 */
export async function prepareSurfaces(
  onProgress: (done: number, label: string) => void,
  cancelled: () => boolean = () => false,
): Promise<void> {
  for (let i = 0; i < SURFACES.length; i++) {
    const [label, make] = SURFACES[i];
    onProgress(i / SURFACES.length, label);
    // Let the bar paint before the next chunk of work blocks the thread.
    await nextFrame();
    if (cancelled()) return;
    make();
  }
  onProgress(1, "Switching on the lights");
}
