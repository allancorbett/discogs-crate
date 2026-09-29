"use client";

import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { useSleeveTexture } from "../textures";
import { sleeveCentred, sleeveMaterial } from "./sleeve";

const DISC_RADIUS = 0.15;

const discGeometry = new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, 0.003, 40);
const labelGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.0034, 24);
const grooveGeometry = new THREE.RingGeometry(0.06, 0.145, 40, 3);
const vinylMaterial = new THREE.MeshStandardMaterial({
  color: "#0c0c0e",
  roughness: 0.28,
  metalness: 0.3,
});
const grooveMaterial = new THREE.MeshStandardMaterial({
  color: "#1b1b20",
  roughness: 0.18,
  metalness: 0.55,
  side: THREE.DoubleSide,
});

type GroupProps = ThreeElements["group"];

/**
 * A record lying flat, label up, centred on its spindle hole — the shape on
 * the platter, and the disc peeking out of a sleeve you are holding. The label
 * is the sleeve art, as on so many real pressings.
 */
export function Disc({ album, ...props }: { album: Album } & GroupProps) {
    const texture = useSleeveTexture(album, false);
    const label = sleeveMaterial(texture);

    return (
      <group {...props}>
        <mesh geometry={discGeometry} material={vinylMaterial} />
        <mesh
          geometry={grooveGeometry}
          material={grooveMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.0016, 0]}
        />
        <mesh geometry={labelGeometry} material={label} />
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
      <mesh geometry={sleeveCentred} material={sleeveMaterial(texture)} />
    </group>
  );
}
