"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { BIN_HEIGHT, CRATE, type PlacedCrate } from "@/lib/shop/layout";
import { sleevePose } from "@/lib/shop/sleeves";
import { tag } from "../interact";
import { crateLabel, useSleeveTexture } from "../textures";
import { sleeveMaterial, sleeveOnEdge } from "./sleeve";

const card = new THREE.MeshStandardMaterial({ color: "#e6d8bb", roughness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: "#b8913f", metalness: 1, roughness: 0.32 });

interface SleeveProps {
  album: Album;
  index: number;
  current: number | null;
  full: boolean;
  registry: Map<number, THREE.Object3D>;
}

/** One record standing in a crate, easing toward wherever digging puts it. */
function Sleeve({ album, index, current, full, registry }: SleeveProps) {
  const pivot = useRef<THREE.Group>(null);
  const texture = useSleeveTexture(album, full);

  useEffect(() => {
    const object = pivot.current;
    if (!object) return;
    registry.set(album.id, object);
    return () => {
      if (registry.get(album.id) === object) registry.delete(album.id);
    };
  }, [album.id, registry]);

  useFrame((_, rawDelta) => {
    const object = pivot.current;
    if (!object) return;
    const delta = Math.min(rawDelta, 0.05);
    const target = sleevePose(index, current);
    // Quick to tip, like a flick of the fingers, with a little settle.
    object.position.z = THREE.MathUtils.damp(object.position.z, target.z, 14, delta);
    object.position.y = THREE.MathUtils.damp(object.position.y, target.y, 14, delta);
    object.rotation.x = THREE.MathUtils.damp(object.rotation.x, target.angle, 11, delta);
  });

  const rest = sleevePose(index, null);

  return (
    <group ref={pivot} position={[0, rest.y, rest.z]} rotation={[rest.angle, 0, 0]}>
      <mesh geometry={sleeveOnEdge} material={sleeveMaterial(texture)} castShadow receiveShadow />
    </group>
  );
}

interface Props {
  crate: PlacedCrate;
  /** The records still in the crate, in filing order. */
  albums: Album[];
  /** Which record is up, while this is the crate being dug. */
  current: number | null;
  registry: Map<number, THREE.Object3D>;
}

/**
 * A crate near you, with real sleeve art in it and its cards. Only a couple
 * of dozen of these exist at once, whichever are closest; the crate itself is
 * drawn with all the others, instanced, in Bins.
 */
export const CrateDetail = memo(function CrateDetail({ crate, albums, current, registry }: Props) {
  const group = useRef<THREE.Group>(null);
  useEffect(() => {
    tag(group.current, { resolve: () => ({ kind: "crate", crate }) });
  }, [crate]);

  const front = useMemo(
    () => crateLabel(crate.genre, crate.part, crate.parts),
    [crate.genre, crate.part, crate.parts],
  );
  const header = useMemo(
    () => (crate.leadsGenre ? crateLabel(crate.genre, 1, 1) : null),
    [crate.leadsGenre, crate.genre],
  );
  const headerMaterial = useMemo(
    () => (header ? new THREE.MeshStandardMaterial({ map: header, roughness: 0.9 }) : null),
    [header],
  );
  useEffect(() => () => front.dispose(), [front]);
  useEffect(
    () => () => {
      header?.dispose();
      headerMaterial?.dispose();
    },
    [header, headerMaterial],
  );

  return (
    <group ref={group} position={[crate.x, BIN_HEIGHT, crate.z]} rotation={[0, crate.rotation, 0]}>
      {albums.map((album, index) => (
        <Sleeve
          key={album.id}
          album={album}
          index={index}
          current={current}
          full={current === index}
          registry={registry}
        />
      ))}

      {/* The crate's own card, in a brass holder on its front slat. */}
      <mesh position={[0, 0.048, CRATE.depth / 2 + 0.002]} material={brass} castShadow>
        <boxGeometry args={[0.2, 0.068, 0.004]} />
      </mesh>
      <mesh position={[0, 0.046, CRATE.depth / 2 + 0.0045]}>
        <planeGeometry args={[0.186, 0.056]} />
        <meshStandardMaterial map={front} roughness={0.85} />
      </mesh>

      {/* The first crate of a genre carries a tall divider at the back. */}
      {header ? (
        <mesh
          position={[0, CRATE.height + 0.15, -CRATE.depth / 2 - 0.004]}
          rotation={[-0.2, 0, 0]}
          material={[card, card, card, card, headerMaterial!, card]}
          castShadow
        >
          <boxGeometry args={[0.34, 0.13, 0.004]} />
        </mesh>
      ) : null}

      {/* Something to aim at in an empty crate. */}
      {albums.length === 0 ? (
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[CRATE.width - 0.04, 0.02, CRATE.depth - 0.04]} />
          <meshStandardMaterial color="#1a120c" roughness={1} />
        </mesh>
      ) : null}
    </group>
  );
});
