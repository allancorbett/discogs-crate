import * as THREE from "three";
import { SLEEVE } from "@/lib/shop/sleeves";

/**
 * One record sleeve is one draw call. A box with a material per face costs
 * six, and with a couple of dozen crates in reach that is hundreds of draws a
 * frame for nothing: instead every face shares the cover's material, with the
 * thin edges pointed at a single texel near its corner so they pick up the
 * sleeve's own colour, and the back showing the print as if through the card.
 */
function build(pivot: "centre" | "bottom") {
  const geometry = new THREE.BoxGeometry(SLEEVE.size, SLEEVE.size, SLEEVE.thickness);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry lays its faces out +x, -x, +y, -y, +z, -z, four vertices each.
  for (let vertex = 0; vertex < 16; vertex++) uv.setXY(vertex, 0.03, 0.03);
  uv.needsUpdate = true;
  geometry.clearGroups();
  if (pivot === "bottom") geometry.translate(0, SLEEVE.size / 2, 0);
  return geometry;
}

export const sleeveCentred = build("centre");
export const sleeveOnEdge = build("bottom");

const materials = new WeakMap<THREE.Texture, THREE.MeshStandardMaterial>();

/** Shared per cover, so a sleeve seen in two places costs one material. */
export function sleeveMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  let material = materials.get(texture);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    materials.set(texture, material);
  }
  return material;
}
