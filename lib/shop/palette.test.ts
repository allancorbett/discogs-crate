import { describe, expect, it } from "vitest";
import { dominantColour, hslToRgb, sleeveColour } from "./palette";

function image(...pixels: [number, number, number, number?][]): number[] {
  return pixels.flatMap(([r, g, b, a = 255]) => [r, g, b, a]);
}

describe("dominantColour", () => {
  it("finds the colour on a sleeve that is mostly paper and ink", () => {
    const pixels = image(
      ...Array.from({ length: 40 }, () => [250, 250, 248] as [number, number, number]),
      ...Array.from({ length: 40 }, () => [8, 8, 10] as [number, number, number]),
      ...Array.from({ length: 10 }, () => [220, 40, 30] as [number, number, number]),
    );
    const [r, g, b] = dominantColour(pixels);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
  });

  it("keeps a grey sleeve grey", () => {
    expect(dominantColour(image([100, 100, 100], [140, 140, 140]))).toEqual([
      120, 120, 120,
    ]);
  });

  it("ignores transparent pixels", () => {
    const [, g] = dominantColour(image([0, 200, 0], [255, 0, 0, 0]));
    expect(g).toBe(200);
  });

  it("copes with an empty image", () => {
    expect(dominantColour([])).toEqual([128, 128, 128]);
  });
});

describe("sleeveColour", () => {
  it("always gives a record the same colour", () => {
    expect(sleeveColour(12345)).toEqual(sleeveColour(12345));
  });

  it("gives neighbouring records different colours", () => {
    const colours = new Set(
      Array.from({ length: 20 }, (_, i) => sleeveColour(i + 1).join()),
    );
    expect(colours.size).toBeGreaterThan(15);
  });
});

describe("hslToRgb", () => {
  it("converts the primaries", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(1 / 3, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(2 / 3, 1, 0.5)).toEqual([0, 0, 255]);
  });
});
