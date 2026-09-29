"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { BIN_HEIGHT, CRATE, type PlacedCrate } from "@/lib/shop/layout";
import { sleevePose } from "@/lib/shop/sleeves";
import { crateLabel, useSleeveTexture } from "../textures";
import { isTap } from "./events";
import { sleeveMaterial, sleeveOnEdge } from "./sleeve";

const card = new THREE.MeshStandardMaterial({ color: "#e6d8bb", roughness: 0.9 });

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
      <mesh geometry={sleeveOnEdge} material={sleeveMaterial(texture)} />
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
  onTap: (crate: PlacedCrate) => void;
}

/**
 * A crate near you, with real sleeve art in it and its divider cards. Only a
 * couple of dozen of these exist at once, whichever are closest.
 */
export const CrateDetail = memo(function CrateDetail({
  crate,
  albums,
  current,
  registry,
  onTap,
}: Props) {
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

  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event)) return;
    event.stopPropagation();
    onTap(crate);
  };

  return (
    <group
      position={[crate.x, BIN_HEIGHT, crate.z]}
      rotation={[0, crate.rotation, 0]}
      onClick={tap}
    >
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

      {/* The crate's own card, on the outside of its front lip. */}
      <mesh position={[0, 0.05, CRATE.depth / 2 + 0.002]}>
        <planeGeometry args={[0.26, 0.085]} />
        <meshStandardMaterial map={front} roughness={0.9} />
      </mesh>

      {/* The first crate of a genre carries a tall divider at the back. */}
      {header ? (
        <mesh
          position={[0, CRATE.height + 0.15, -CRATE.depth / 2 - 0.004]}
          rotation={[-0.2, 0, 0]}
          material={[card, card, card, card, headerMaterial!, card]}
        >
          <boxGeometry args={[0.34, 0.13, 0.004]} />
        </mesh>
      ) : null}

      {/* Something to tap on an empty crate. */}
      {albums.length === 0 ? (
        <mesh position={[0, 0.1, 0]} visible={false}>
          <boxGeometry args={[CRATE.width, 0.2, CRATE.depth]} />
        </mesh>
      ) : null}
    </group>
  );
});
