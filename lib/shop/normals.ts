/**
 * Turns a height field into a tangent-space normal map (OpenGL convention,
 * +Y up, as three.js expects), using central differences that wrap at the
 * edges so a tiling texture stays seamless.
 *
 * @param strength how steep a change of 1.0 in height across one texel reads
 */
export function heightToNormal(
  height: Float32Array,
  width: number,
  heightPx: number,
  strength: number,
): Uint8Array {
  const out = new Uint8Array(width * heightPx * 4);
  const at = (x: number, y: number) =>
    height[((y + heightPx) % heightPx) * width + ((x + width) % width)];

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      // Rows run down the texture but +Y is up the surface.
      const dy = (at(x, y - 1) - at(x, y + 1)) * 0.5 * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      const i = (y * width + x) * 4;
      out[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((nz / length) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
