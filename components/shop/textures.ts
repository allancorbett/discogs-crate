"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { coverProxyUrl } from "@/lib/cover";
import type { Album } from "@/lib/discogs/types";
import { sleeveColour, toCss } from "@/lib/shop/palette";

/**
 * Every texture the shop paints or downloads. Nothing here fetches anything
 * but our own `/api/cover`: signs, floors and rugs are drawn on a canvas, so
 * the page needs no third-party asset and the CSP stays as tight as it is.
 */

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const ctx = element.getContext("2d")!;
  return { element, ctx };
}

function finish(element: HTMLCanvasElement, repeat?: [number, number]) {
  const texture = new THREE.CanvasTexture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}

/** The page's own font, so painted signs match the HUD around them. */
function fontFamily() {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

// ---------------------------------------------------------------------------
// Sleeves
// ---------------------------------------------------------------------------

/**
 * A bounded cache. Only the crates near you ever hold covers, so a couple of
 * hundred is plenty, and evicting disposes the GPU copy as well.
 */
class TextureCache {
  private entries = new Map<string, THREE.Texture>();
  constructor(private readonly limit: number) {}

  get(key: string) {
    const texture = this.entries.get(key);
    if (texture) {
      // Refresh recency.
      this.entries.delete(key);
      this.entries.set(key, texture);
    }
    return texture;
  }

  set(key: string, texture: THREE.Texture) {
    this.entries.set(key, texture);
    while (this.entries.size > this.limit) {
      const [oldestKey, oldest] = this.entries.entries().next().value!;
      this.entries.delete(oldestKey);
      oldest.dispose();
    }
  }
}

const covers = new TextureCache(260);
const placeholders = new TextureCache(260);
const pending = new Map<string, Promise<THREE.Texture | null>>();
const loader = new THREE.TextureLoader();

/**
 * What a record with no artwork looks like: a plain printed sleeve in a colour
 * that is always the same for that record, with the credit set on it.
 */
export function placeholderSleeve(album: Album): THREE.Texture {
  const key = String(album.id);
  const cached = placeholders.get(key);
  if (cached) return cached;

  const { element, ctx } = canvas(256, 256);
  ctx.fillStyle = toCss(sleeveColour(album.id));
  ctx.fillRect(0, 0, 256, 256);

  // A centre label ring, as on a die-cut generic sleeve.
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(128, 128, 56, 0, Math.PI * 2);
  ctx.fill();

  const family = fontFamily();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 22px ${family}`;
  wrap(ctx, album.artist, 128, 40, 220, 24, 2);
  ctx.font = `400 18px ${family}`;
  wrap(ctx, album.title, 128, 206, 220, 21, 2);

  const texture = finish(element);
  placeholders.set(key, texture);
  return texture;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, "")}…`;
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function loadCover(url: string): Promise<THREE.Texture | null> {
  const hit = covers.get(url);
  if (hit) return Promise.resolve(hit);

  let request = pending.get(url);
  if (!request) {
    request = loader
      .loadAsync(url)
      .then((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        covers.set(url, texture);
        return texture;
      })
      .catch(() => null)
      .finally(() => pending.delete(url));
    pending.set(url, request);
  }
  return request;
}

/**
 * The sleeve art for a record: the painted placeholder straight away, swapped
 * for the real cover once it arrives. `full` asks for the large scan, for a
 * record you are holding up to your face rather than thumbing past.
 */
export function useSleeveTexture(album: Album, full = false): THREE.Texture {
  const source = full ? album.coverImage || album.thumb : album.thumb || album.coverImage;
  const url = coverProxyUrl(source);

  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(
    () => {
      const hit = url ? covers.get(url) : undefined;
      return url && hit ? { url, texture: hit } : null;
    },
  );

  useEffect(() => {
    if (!url) return;
    let live = true;
    loadCover(url).then((texture) => {
      if (live && texture) setLoaded({ url, texture });
    });
    return () => {
      live = false;
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.texture : placeholderSleeve(album);
}

/** Reads a loaded texture's pixels back, small, for colour sampling. */
export function samplePixels(texture: THREE.Texture): Uint8ClampedArray | null {
  const image = texture.image as CanvasImageSource | undefined;
  if (!image) return null;
  try {
    const { ctx } = canvas(24, 24);
    ctx.drawImage(image, 0, 0, 24, 24);
    return ctx.getImageData(0, 0, 24, 24).data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Painted surfaces
// ---------------------------------------------------------------------------

/**
 * Gold-leaf signwriting for the inside of the shop window: the name in a
 * shadowed serif with a line of trade underneath, mirrored, because you are
 * reading it through the glass from the wrong side.
 */
export function signwriting(name: string): THREE.Texture {
  const { element, ctx } = canvas(1024, 256);
  ctx.translate(1024, 0);
  ctx.scale(-1, 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let size = 96;
  const face = (px: number) => `italic 700 ${px}px Georgia, "Times New Roman", serif`;
  ctx.font = face(size);
  while (ctx.measureText(name).width > 940 && size > 40) {
    size -= 4;
    ctx.font = face(size);
  }
  // A dark keyline behind the gold, as a signwriter would shade it.
  ctx.fillStyle = "rgba(40, 20, 5, 0.9)";
  ctx.fillText(name, 516, 98);
  const gold = ctx.createLinearGradient(0, 40, 0, 150);
  gold.addColorStop(0, "#fff1b8");
  gold.addColorStop(0.5, "#d9a93f");
  gold.addColorStop(1, "#8a6420");
  ctx.fillStyle = gold;
  ctx.fillText(name, 512, 94);

  ctx.font = `600 34px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = "#d9b25a";
  ctx.fillText("RECORDS  ·  BOUGHT  ·  SOLD  ·  EXCHANGED", 512, 200);

  return finish(element);
}

/** The divider card sticking up out of a crate: genre and which crate. */
export function crateLabel(genre: string, part: number, parts: number): THREE.Texture {
  const { element, ctx } = canvas(256, 96);
  ctx.fillStyle = "#efe3c8";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = "rgba(60,40,20,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 88);

  const family = fontFamily();
  ctx.fillStyle = "#2b1a0e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 40;
  ctx.font = `700 ${size}px ${family}`;
  const label = genre.toUpperCase();
  while (ctx.measureText(label).width > 228 && size > 16) {
    size -= 2;
    ctx.font = `700 ${size}px ${family}`;
  }
  ctx.fillText(label, 128, parts > 1 ? 38 : 48);
  if (parts > 1) {
    ctx.font = `500 20px ${family}`;
    ctx.fillStyle = "rgba(43,26,14,0.7)";
    ctx.fillText(`${part} of ${parts}`, 128, 72);
  }
  return finish(element);
}

/** A glowing tube sign. Drawn with blur so it blooms without post-processing. */
export function neonSign(text: string, colour: string): THREE.Texture {
  const { element, ctx } = canvas(1024, 256);
  const family = fontFamily();
  let size = 120;
  ctx.font = `italic 700 ${size}px ${family}`;
  while (ctx.measureText(text).width > 900 && size > 40) {
    size -= 4;
    ctx.font = `italic 700 ${size}px ${family}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  for (const [blur, alpha] of [
    [48, 0.9],
    [22, 1],
    [8, 1],
  ] as const) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 10;
    ctx.strokeText(text, 512, 128);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#fff4fb";
  ctx.lineWidth = 3;
  ctx.strokeText(text, 512, 128);

  return finish(element);
}

let moteTexture: THREE.Texture | null = null;

/** A soft round speck for the dust in the lamplight. */
export function mote(): THREE.Texture {
  if (moteTexture) return moteTexture;
  const { element, ctx } = canvas(32, 32);
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,240,210,1)");
  gradient.addColorStop(1, "rgba(255,240,210,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  moteTexture = finish(element);
  return moteTexture;
}
