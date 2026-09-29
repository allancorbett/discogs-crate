"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { EYE_HEIGHT, type PlacedCrate, type ShopLayout } from "@/lib/shop/layout";
import { QUALITY_LEVELS, requestedLevel, startingLevel, type QualityLevel } from "@/lib/shop/quality";
import { Controls, type Aim } from "../controls";
import { pick, type Interaction } from "../interact";
import type { Rig } from "../rig";
import { DustMotes, Lighting } from "./Atmosphere";
import { Bins } from "./Bins";
import { Cat } from "./Cat";
import { CrateDetail } from "./CrateDetail";
import { HeldRecord } from "./HeldRecord";
import { Player } from "./Player";
import { PostFX } from "./PostFX";
import { Room } from "./Room";
import { Turntable } from "./Turntable";

/** How far away crates are drawn with real sleeve art in them. */
const NEAR_RADIUS = 4.5;
const NEAR_LIMIT = 18;

export interface SceneHandle {
  /** Renders a frame and returns it as an image, for the snapshot button. */
  capture: () => string | null;
  /** What lies under a point on the screen, within reach. */
  pick: (aim: Aim) => Interaction | null;
}

export interface ShopSceneProps {
  layout: ShopLayout;
  username: string;
  rig: RefObject<Rig>;
  /** Where the camera starts, before the first frame moves it. */
  start: { x: number; z: number };
  posters: Album[];
  digging: { crate: PlacedCrate; index: number } | null;
  held: { album: Album; from: THREE.Object3D | null } | null;
  playing: Album | null;
  /** Records out of their crates, in hand or on the deck. */
  away: Set<number>;
  registry: Map<number, THREE.Object3D>;
  handleRef: RefObject<SceneHandle | null>;
  controlsRef: RefObject<Controls | null>;
  touch: boolean;
  /** Bumped each time the cat is stroked, to set it purring. */
  petted: number;
  onFire: (aim: Aim) => void;
  onLockChange: (locked: boolean) => void;
  onStick: (stick: { origin: Aim; vector: Aim } | null) => void;
  /** What the crosshair is on, when that changes. */
  onAim: (interaction: Interaction | null) => void;
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

/**
 * Wires the musicmaze-style controls to the canvas, exposes picking and
 * snapshots to the page, and keeps the crosshair told what it is over.
 */
function Bridge(props: {
  handleRef: RefObject<SceneHandle | null>;
  controlsRef: RefObject<Controls | null>;
  renderRef: RefObject<(() => void) | null>;
  onFire: (aim: Aim) => void;
  onLockChange: (locked: boolean) => void;
  onStick: (stick: { origin: Aim; vector: Aim } | null) => void;
  onAim: (interaction: Interaction | null) => void;
}) {
  const { gl, scene, camera } = useThree();
  const { handleRef, controlsRef, renderRef } = props;

  // The latest callbacks, read at event time so the controls are built once.
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    const controls = new Controls(gl.domElement);
    controls.onFire = (aim) => callbacks.current.onFire(aim);
    controls.onLockChange = (locked) => callbacks.current.onLockChange(locked);
    controls.onStick = (stick) => callbacks.current.onStick(stick);
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [gl, controlsRef]);

  useEffect(() => {
    handleRef.current = {
      capture: () => {
        // Draw a finished frame and read it straight back, before the browser
        // gets a chance to clear the buffer.
        renderRef.current?.();
        try {
          return gl.domElement.toDataURL("image/jpeg", 0.92);
        } catch {
          return null;
        }
      },
      pick: (aim) => pick(scene, camera, aim),
    };
    return () => {
      handleRef.current = null;
    };
  }, [gl, scene, camera, handleRef, renderRef]);

  const frame = useRef(0);
  const last = useRef<Interaction | null>(null);
  useFrame(() => {
    if (++frame.current % 6 !== 0) return;
    const found = pick(scene, camera, { x: 0, y: 0 });
    const prev = last.current;
    const same =
      prev === found ||
      (prev?.kind === found?.kind &&
        (prev?.kind !== "crate" || (found?.kind === "crate" && prev.crate.id === found.crate.id)));
    if (!same) {
      last.current = found;
      callbacks.current.onAim(found);
    }
  });

  return null;
}

export function ShopScene(props: ShopSceneProps) {
  const { layout, rig, digging, held, playing, away, registry, touch } = props;
  const [near, setNear] = useState<Set<string>>(() => new Set());
  const [startLevel] = useState(
    () => requestedLevel(window.location.search) ?? startingLevel(touch),
  );
  const [quality, setQuality] = useState<QualityLevel>(() => QUALITY_LEVELS[startLevel]);
  const renderRef = useRef<(() => void) | null>(null);

  const crateById = useMemo(
    () => new Map(layout.crates.map((crate) => [crate.id, crate])),
    [layout.crates],
  );

  const { x, z } = props.start;

  return (
    <Canvas
      dpr={1}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 62, near: 0.05, far: 60, position: [x, EYE_HEIGHT, z] }}
      onCreated={({ scene, camera }) => {
        camera.rotation.order = "YXZ";
        scene.background = new THREE.Color("#0d0906");
        scene.fog = new THREE.Fog("#0d0906", 10, 32);
      }}
    >
      <Bridge
        handleRef={props.handleRef}
        controlsRef={props.controlsRef}
        renderRef={renderRef}
        onFire={props.onFire}
        onLockChange={props.onLockChange}
        onStick={props.onStick}
        onAim={props.onAim}
      />
      <PostFX
        quality={quality}
        onQualityChange={setQuality}
        touch={touch}
        startLevel={startLevel}
        renderRef={renderRef}
      />
      <Player rig={rig} layout={layout} controlsRef={props.controlsRef} />
      <NearWatcher layout={layout} rig={rig} digging={digging?.crate ?? null} onChange={setNear} />
      <Lighting layout={layout} rig={rig} playing={playing} quality={quality} />

      <Room layout={layout} username={props.username} posters={props.posters} />
      <Bins layout={layout} near={near} away={away} />

      {[...near].map((id) => {
        const crate = crateById.get(id);
        if (!crate) return null;
        const albums = crate.albums.filter((album) => !away.has(album.id));
        const current = digging?.crate.id === id ? digging.index : null;
        return (
          <CrateDetail key={id} crate={crate} albums={albums} current={current} registry={registry} />
        );
      })}

      <Turntable layout={layout} playing={playing} ready={held !== null} />
      <Cat position={[layout.cat.x, layout.cat.y, layout.cat.z]} petted={props.petted} />

      {held ? <HeldRecord key={held.album.id} album={held.album} from={held.from} /> : null}

      <DustMotes rig={rig} />
    </Canvas>
  );
}
