"use client";

import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { grooves } from "../materials";
import { useSleeveTexture } from "../textures";
import { sleeveCentred, sleeveMaterial } from "./sleeve";

const DISC_RADIUS = 0.15;

const discGeometry = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, 0.0028, 64);
const labelGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.0032, 40);
const spindleHole = new THREE.CylinderGeometry(0.0036, 0.0036, 0.0036, 12);

let vinyl: THREE.Material[] | null = null;

/**
 * Black vinyl: glossy, with the grooves in the playing surface picking the
 * lamps out in rings. Cylinder groups are side, top, bottom.
 */
function vinylMaterials(): THREE.Material[] {
  if (vinyl) return vinyl;
  const set = grooves();
  const face = new THREE.MeshPhysicalMaterial({
    color: "#0b0b0d",
    ...set,
    roughness: 1,
    metalness: 0.1,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
  const edge = new THREE.MeshStandardMaterial({ color: "#101012", roughness: 0.4 });
  vinyl = [edge, face, face];
  return vinyl;
}

const holeMaterial = new THREE.MeshBasicMaterial({ color: "#050505" });

type GroupProps = ThreeElements["group"];

/**
 * A record lying flat, label up, centred on its spindle hole — the shape on
 * the platter, and the disc peeking out of a sleeve you are holding. The label
 * is the sleeve art, as on so many real pressings.
 */
export function Disc({ album, ...props }: { album: Album } & GroupProps) {
  const texture = useSleeveTexture(album, false);
  return (
    <group {...props}>
      <mesh geometry={discGeometry} material={vinylMaterials()} castShadow receiveShadow />
      <mesh geometry={labelGeometry} material={sleeveMaterial(texture)} />
      <mesh geometry={spindleHole} material={holeMaterial} />
    </group>
  );
}

/** A sleeve on its own, centred, cover toward +z. `full` loads the big scan. */
export function Sleeve({
  album,
  full = true,
  ...props
}: { album: Album; full?: boolean } & GroupProps) {
  const texture = useSleeveTexture(album, full);
  return (
    <group {...props}>
      <mesh geometry={sleeveCentred} material={sleeveMaterial(texture)} castShadow receiveShadow />
    </group>
  );
}
