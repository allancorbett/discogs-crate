import { describe, expect, it } from "vitest";
import { heightToNormal } from "./normals";
import { fbm, rng, tileNoise } from "./noise";

const pixel = (normals: Uint8Array, width: number, x: number, y: number) =>
  Array.from(normals.slice((y * width + x) * 4, (y * width + x) * 4 + 3));

describe("heightToNormal", () => {
  it("points a flat surface straight out", () => {
    const flat = new Float32Array(16).fill(0.5);
    expect(pixel(heightToNormal(flat, 4, 4, 4), 4, 1, 1)).toEqual([128, 128, 255]);
  });

  it("tilts away from a rise to the right", () => {
    // Height increasing with x: the surface faces back toward -x.
    const ramp = new Float32Array(16).map((_, i) => (i % 4) / 4);
    const [r, g, b] = pixel(heightToNormal(ramp, 4, 4, 4), 4, 1, 1);
    expect(r).toBeLessThan(128);
    expect(g).toBe(128);
    expect(b).toBeLessThan(255);
  });

  it("tilts toward +y when the surface rises down the image", () => {
    // Rows further down are higher, so the slope faces up the texture.
    const ramp = new Float32Array(16).map((_, i) => Math.floor(i / 4) / 4);
    const [, g] = pixel(heightToNormal(ramp, 4, 4, 4), 4, 1, 1);
    expect(g).toBeGreaterThan(128);
  });

  it("gives every texel a unit-length normal", () => {
    const random = rng(3);
    const noisy = new Float32Array(64).map(() => random());
    const normals = heightToNormal(noisy, 8, 8, 6);
    for (let i = 0; i < 64; i++) {
      const [x, y, z] = [0, 1, 2].map((k) => normals[i * 4 + k] / 127.5 - 1);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
    }
  });
});

describe("noise", () => {
  it("is repeatable from its seed", () => {
    expect(fbm(0.3, 0.7, 4, 4, 9)).toBe(fbm(0.3, 0.7, 4, 4, 9));
    expect(rng(5)()).toBe(rng(5)());
  });

  it("tiles: the left edge matches the right, the top the bottom", () => {
    expect(tileNoise(0, 2.5, 8, 1)).toBeCloseTo(tileNoise(8, 2.5, 8, 1));
    expect(fbm(0, 0.4, 3, 4, 2)).toBeCloseTo(fbm(1, 0.4, 3, 4, 2));
    expect(fbm(0.4, 0, 3, 4, 2)).toBeCloseTo(fbm(0.4, 1, 3, 4, 2));
  });

  it("stays in [0, 1]", () => {
    for (let i = 0; i < 500; i++) {
      const value = fbm(i / 97, i / 53, 5, 4, 1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
