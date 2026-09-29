import type { Album } from "../discogs/types";
import { artistKey, genreKey } from "../ordering";

/**
 * Floor plan for the 3D shop. Pure and deterministic: the same collection
 * always builds the same shop, so a shared link looks the same to everyone.
 *
 * All units are metres. The room is centred on the origin, with the entrance
 * along +z and the counter along the back wall at -z. Each crate's own +z is
 * the side you stand at to dig through it.
 */

/** A real crate holds a hundred; this shop keeps each one to a quick flick. */
export const MAX_PER_CRATE = 5;

export const CRATE = { width: 0.38, depth: 0.3, height: 0.2 } as const;

/**
 * Bins sit at the height that puts a crate's rim at a standing adult's waist,
 * with the sleeves poking up above it to be thumbed through.
 */
export const BIN_HEIGHT = 0.74;
export const CRATE_RIM = BIN_HEIGHT + CRATE.height;
export const EYE_HEIGHT = 1.62;

/** Crates along one side of a bin; every bin has two sides, back to back. */
export const CRATES_PER_SIDE = 5;
const CRATE_PITCH = 0.44;
const BIN_LENGTH = CRATES_PER_SIDE * CRATE_PITCH + 0.2;
const BIN_DEPTH = CRATE.depth * 2 + 0.12;

/** Gap between the ends of two bins in a row. */
const BIN_GAP = 1.3;
/** Aisle between rows of bins — room to stand and dig with someone behind. */
const AISLE = 1.7;
const SIDE_MARGIN = 1.6;
/** Clear floor inside the door. */
const FRONT_ZONE = 2.8;
/** Counter, turntable and the space to stand at them. */
const BACK_ZONE = 3.6;

const MIN_WIDTH = 8;
const MIN_DEPTH = 9;

export const UNFILED = "Unfiled";

export interface ShopCrate {
  id: string;
  genre: string;
  /** 1-based position among this genre's crates. */
  part: number;
  parts: number;
  albums: Album[];
}

export interface PlacedCrate extends ShopCrate {
  x: number;
  z: number;
  /** About y. 0 faces +z, π faces -z. */
  rotation: number;
  /** The first crate of its genre, which carries the section header. */
  leadsGenre: boolean;
}

export interface Box {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface ShopLayout {
  room: { width: number; depth: number; height: number };
  crates: PlacedCrate[];
  bins: Box[];
  counter: Box & { height: number };
  turntable: { x: number; z: number; y: number };
  /** Where the sleeve of whatever is playing stands up on the counter. */
  nowPlaying: { x: number; z: number; y: number };
  cat: { x: number; z: number; y: number };
  /** Shelving along the right-hand wall, between the door and the counter. */
  wallShelf: Box;
  spawn: { x: number; z: number; yaw: number };
  /** Everything the player cannot walk through, besides the walls. */
  obstacles: Box[];
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/**
 * Files the collection into genre crates. Genres are shelved alphabetically,
 * with untagged records last; inside a genre records are filed by artist the
 * way a shop does it, then by year.
 */
export function buildCrates(
  albums: Album[],
  maxPerCrate = MAX_PER_CRATE,
): ShopCrate[] {
  const byGenre = new Map<string, Album[]>();
  for (const album of albums) {
    const genre = genreKey(album)?.trim() || UNFILED;
    const bucket = byGenre.get(genre);
    if (bucket) bucket.push(album);
    else byGenre.set(genre, [album]);
  }

  const genres = [...byGenre.keys()].sort((a, b) => {
    if (a === UNFILED) return 1;
    if (b === UNFILED) return -1;
    return collator.compare(a, b);
  });

  const crates: ShopCrate[] = [];
  for (const genre of genres) {
    const filed = [...byGenre.get(genre)!].sort(
      (a, b) =>
        collator.compare(artistKey(a.artist), artistKey(b.artist)) ||
        (a.year ?? Infinity) - (b.year ?? Infinity) ||
        collator.compare(a.title, b.title),
    );

    const parts = Math.ceil(filed.length / maxPerCrate);
    for (let part = 0; part < parts; part++) {
      crates.push({
        id: `${genre}:${part + 1}`,
        genre,
        part: part + 1,
        parts,
        albums: filed.slice(part * maxPerCrate, (part + 1) * maxPerCrate),
      });
    }
  }

  return crates;
}

/**
 * Lays the crates out on double-sided bins in a grid of aisles, growing the
 * room to fit. The grid stays roughly square until it is four bins wide, then
 * grows deeper, so a huge collection becomes a long shop rather than an
 * absurdly wide one.
 */
export function placeCrates(crates: ShopCrate[]): ShopLayout {
  const perBin = CRATES_PER_SIDE * 2;
  const binCount = Math.max(1, Math.ceil(crates.length / perBin));
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(binCount / 1.5))));
  const rows = Math.ceil(binCount / columns);

  const gridWidth = columns * BIN_LENGTH + (columns - 1) * BIN_GAP;
  const gridDepth = rows * BIN_DEPTH + (rows - 1) * AISLE;

  const width = Math.max(MIN_WIDTH, gridWidth + SIDE_MARGIN * 2);
  const depth = Math.max(MIN_DEPTH, FRONT_ZONE + gridDepth + AISLE + BACK_ZONE);
  const height = 3.4;

  // The grid sits between the door and the counter, centred across the room.
  const gridBack = -depth / 2 + BACK_ZONE + AISLE / 2;
  const gridLeft = -gridWidth / 2;

  const bins: Box[] = [];
  const placed: PlacedCrate[] = [];

  for (let b = 0; b < binCount; b++) {
    const row = Math.floor(b / columns);
    const column = b % columns;
    const bin: Box = {
      x: gridLeft + column * (BIN_LENGTH + BIN_GAP) + BIN_LENGTH / 2,
      z: gridBack + row * (BIN_DEPTH + AISLE) + BIN_DEPTH / 2,
      width: BIN_LENGTH,
      depth: BIN_DEPTH,
    };
    bins.push(bin);

    // Front side first (facing the door), read left to right, then round the
    // back reading left to right from that side too.
    for (let slot = 0; slot < perBin; slot++) {
      const crate = crates[b * perBin + slot];
      if (!crate) break;

      const back = slot >= CRATES_PER_SIDE;
      const along = (slot % CRATES_PER_SIDE) - (CRATES_PER_SIDE - 1) / 2;
      const offset = BIN_DEPTH / 4;

      placed.push({
        ...crate,
        x: bin.x + (back ? -along : along) * CRATE_PITCH,
        z: bin.z + (back ? -offset : offset),
        rotation: back ? Math.PI : 0,
        leadsGenre: false,
      });
    }
  }

  for (let i = 0; i < placed.length; i++) {
    placed[i].leadsGenre = i === 0 || placed[i - 1].genre !== placed[i].genre;
  }

  // The counter runs along the back wall into the right-hand corner, where the
  // turntable lives.
  const counterWidth = 3.2;
  const counter = {
    x: width / 2 - counterWidth / 2 - 0.25,
    z: -depth / 2 + 0.75,
    width: counterWidth,
    depth: 0.7,
    height: 0.96,
  };

  // Floor-to-ceiling shelving down the right-hand wall, stopping short of the
  // counter and of the door end so neither corner is boxed in.
  const shelfFront = depth / 2 - 1.4;
  const shelfBack = counter.z + counter.depth / 2 + 1.6;
  const wallShelf = {
    x: width / 2 - 0.2,
    z: (shelfFront + shelfBack) / 2,
    width: 0.4,
    depth: Math.max(0, shelfFront - shelfBack),
  };

  const obstacles: Box[] = [...bins, counter, wallShelf];

  return {
    room: { width, depth, height },
    crates: placed,
    bins,
    counter,
    turntable: {
      x: counter.x + counterWidth / 2 - 0.45,
      z: counter.z,
      y: counter.height,
    },
    nowPlaying: { x: counter.x - 0.1, z: counter.z - 0.12, y: counter.height },
    cat: {
      x: counter.x - counterWidth / 2 + 0.45,
      z: counter.z,
      y: counter.height,
    },
    wallShelf,
    spawn: { x: 0, z: depth / 2 - 1.2, yaw: 0 },
    obstacles,
  };
}

export function layoutShop(albums: Album[]): ShopLayout {
  return placeCrates(buildCrates(albums));
}

/** Where to stand to dig through a crate: just in front of it, looking in. */
export function digStance(crate: Pick<PlacedCrate, "x" | "z" | "rotation">) {
  const reach = 0.5;
  return {
    x: crate.x + Math.sin(crate.rotation) * reach,
    z: crate.z + Math.cos(crate.rotation) * reach,
    // Facing back along the crate's +z.
    yaw: crate.rotation,
  };
}

const PLAYER_RADIUS = 0.28;

/**
 * Slides a step out of anything solid. Axes are resolved separately so walking
 * into a bin at an angle glides along it instead of stopping dead.
 */
export function resolveMove(
  layout: Pick<ShopLayout, "room" | "obstacles">,
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number } {
  const halfW = layout.room.width / 2 - PLAYER_RADIUS;
  const halfD = layout.room.depth / 2 - PLAYER_RADIUS;
  const clampX = (x: number) => Math.min(halfW, Math.max(-halfW, x));
  const clampZ = (z: number) => Math.min(halfD, Math.max(-halfD, z));

  const blocked = (x: number, z: number) =>
    layout.obstacles.some(
      (box) =>
        Math.abs(x - box.x) < box.width / 2 + PLAYER_RADIUS &&
        Math.abs(z - box.z) < box.depth / 2 + PLAYER_RADIUS,
    );

  let x = clampX(to.x);
  let z = from.z;
  if (blocked(x, z)) x = from.x;

  z = clampZ(to.z);
  if (blocked(x, z)) z = from.z;

  return { x, z };
}
