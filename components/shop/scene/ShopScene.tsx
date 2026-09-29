"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { EYE_HEIGHT, type PlacedCrate, type ShopLayout } from "@/lib/shop/layout";
import type { Rig } from "../rig";
import { DustMotes, Lighting } from "./Atmosphere";
import { Bins } from "./Bins";
import { Cat } from "./Cat";
import { CrateDetail } from "./CrateDetail";
import { isTap } from "./events";
import { HeldRecord } from "./HeldRecord";
import { Player } from "./Player";
import { Room } from "./Room";
import { Turntable } from "./Turntable";

/** How far away crates are drawn with real sleeve art in them. */
const NEAR_RADIUS = 4.5;
const NEAR_LIMIT = 18;

export interface SceneHandle {
  /** Renders a frame and returns it as an image, for the snapshot button. */
  capture: () => string | null;
}

export interface ShopSceneProps {
  layout: ShopLayout;
  username: string;
  rig: RefObject<Rig>;
  posters: Album[];
  digging: { crate: PlacedCrate; index: number } | null;
  held: { album: Album; from: THREE.Object3D | null } | null;
  playing: Album | null;
  /** Records out of their crates, in hand or on the deck. */
  away: Set<number>;
  registry: Map<number, THREE.Object3D>;
  handleRef: RefObject<SceneHandle | null>;
  onCrateTap: (crate: PlacedCrate) => void;
  onDeckTap: () => void;
  onFloorTap: (point: { x: number; z: number }) => void;
  onPet: () => void;
}

/** Keeps track of which crates are close enough to draw in detail. */
function NearWatcher({
  layout,
  rig,
  digging,
  onChange,
}: {
  layout: ShopLayout;
  rig: RefObject<Rig>;
  digging: PlacedCrate | null;
  onChange: (near: Set<string>) => void;
}) {
  const last = useRef("");
  const since = useRef(1);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current < 0.25) return;
    since.current = 0;

    const { x, z } = rig.current;
    const ids = layout.crates
      .map((crate) => ({ id: crate.id, d: Math.hypot(crate.x - x, crate.z - z) }))
      .filter((entry) => entry.d < NEAR_RADIUS)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEAR_LIMIT)
      .map((entry) => entry.id);
    if (digging && !ids.includes(digging.id)) ids.push(digging.id);

    const key = [...ids].sort().join("|");
    if (key !== last.current) {
      last.current = key;
      onChange(new Set(ids));
    }
  });

  return null;
}

function Bridge({ handleRef }: { handleRef: RefObject<SceneHandle | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    handleRef.current = {
      capture: () => {
        // Draw a fresh frame and read it straight back, before the browser
        // gets a chance to clear the buffer.
        gl.render(scene, camera);
        try {
          return gl.domElement.toDataURL("image/jpeg", 0.92);
        } catch {
          return null;
        }
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [gl, scene, camera, handleRef]);
  return null;
}

export function ShopScene(props: ShopSceneProps) {
  const { layout, rig, digging, held, playing, away, registry } = props;
  const [near, setNear] = useState<Set<string>>(() => new Set());

  const crateById = useMemo(
    () => new Map(layout.crates.map((crate) => [crate.id, crate])),
    [layout.crates],
  );

  const tapFloor = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event)) return;
    event.stopPropagation();
    props.onFloorTap({ x: event.point.x, z: event.point.z });
  };

  const spawn = layout.spawn;

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{
        fov: 62,
        near: 0.05,
        far: 60,
        position: [spawn.x, EYE_HEIGHT, spawn.z],
      }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color("#140d09");
        scene.fog = new THREE.Fog("#140d09", 8, 28);
      }}
    >
      <Bridge handleRef={props.handleRef} />
      <Player rig={rig} layout={layout} />
      <NearWatcher
        layout={layout}
        rig={rig}
        digging={digging?.crate ?? null}
        onChange={setNear}
      />
      <Lighting layout={layout} rig={rig} playing={playing} />

      <Room
        layout={layout}
        username={props.username}
        posters={props.posters}
        onFloorTap={tapFloor}
      />

      <Bins layout={layout} near={near} away={away} onCrateTap={props.onCrateTap} />

      {[...near].map((id) => {
        const crate = crateById.get(id);
        if (!crate) return null;
        const albums = crate.albums.filter((album) => !away.has(album.id));
        const current = digging?.crate.id === id ? digging.index : null;
        return (
          <CrateDetail
            key={id}
            crate={crate}
            albums={albums}
            current={current}
            registry={registry}
            onTap={props.onCrateTap}
          />
        );
      })}

      <Turntable
        layout={layout}
        playing={playing}
        ready={held !== null}
        onTap={props.onDeckTap}
      />
      <Cat position={[layout.cat.x, layout.cat.y, layout.cat.z]} onPet={props.onPet} />

      {held ? <HeldRecord key={held.album.id} album={held.album} from={held.from} /> : null}

      <DustMotes rig={rig} />
    </Canvas>
  );
}

