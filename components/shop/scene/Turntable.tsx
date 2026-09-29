"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { tag } from "../interact";
import { brushedMetal, darkOak, grilleCloth, metreUVs, tiled } from "../materials";
import { Disc, Sleeve } from "./Vinyl";

/** 33⅓ revolutions a minute, in radians a second. */
const RPM_33 = ((100 / 3) * Math.PI * 2) / 60;
const ARM_REST = 0.05;
const ARM_PLAY = -0.55;

const PLINTH = { width: 0.453, height: 0.075, depth: 0.353 };
const PLATTER = { x: -0.05, radius: 0.166 };
const ARM_PIVOT = new THREE.Vector3(0.17, PLINTH.height, -0.12);

/** The strobe dots round the platter's rim, for setting the speed by eye. */
function strobeTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b7b8bd";
  ctx.fillRect(0, 0, 1024, 32);
  ctx.fillStyle = "#3a3b40";
  for (let row = 0; row < 3; row++) {
    const count = [180, 150, 120][row];
    for (let i = 0; i < count; i++) {
      ctx.fillRect((i / count) * 1024, 4 + row * 9, 1024 / count / 2, 6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** An S-shaped arm, pivot at the origin, reaching along +z to the stylus. */
function armGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.055, -0.02),
    new THREE.Vector3(0, 0.055, 0.06),
    new THREE.Vector3(0.018, 0.055, 0.13),
    new THREE.Vector3(-0.012, 0.055, 0.2),
    new THREE.Vector3(-0.02, 0.05, 0.23),
  ]);
  return new THREE.TubeGeometry(curve, 48, 0.0042, 10, false);
}

interface Props {
  layout: ShopLayout;
  playing: Album | null;
  /** Something in your hands that could go on. */
  ready: boolean;
}

/**
 * The deck on the counter in the back corner — a silver direct-drive in the
 * classic DJ shape — with a pair of bookshelf speakers either side and a
 * stand for the sleeve of whatever is on. Put a record on it and the platter
 * spins up, the strobe lamp lights and the arm swings over.
 */
export function Turntable({ layout, playing, ready }: Props) {
  const deck = useRef<THREE.Group>(null);
  const platter = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const drop = useRef<THREE.Group>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const strobe = useRef<THREE.MeshStandardMaterial>(null);
  const speed = useRef(0);

  useEffect(() => {
    tag(deck.current, { resolve: () => ({ kind: "deck" }) });
  }, []);

  const parts = useMemo(() => {
    const metal = brushedMetal();
    const plinthGeometry = metreUVs(
      new RoundedBoxGeometry(PLINTH.width, PLINTH.height, PLINTH.depth, 3, 0.008),
      PLINTH,
      0.3,
    );
    const strobeMap = strobeTexture();
    const cover = new RoundedBoxGeometry(0.45, 0.1, 0.35, 2, 0.006);
    // Hinged at the back, so the lid swings up from there.
    cover.translate(0, 0.05, 0.175);
    return {
      plinthGeometry,
      plinth: new THREE.MeshStandardMaterial({ ...metal, color: "#9fa1a6", metalness: 0.85, roughness: 1 }),
      rim: new THREE.MeshStandardMaterial({ map: strobeMap, metalness: 0.9, roughness: 0.28 }),
      platterTop: new THREE.MeshStandardMaterial({ color: "#8d8e92", metalness: 0.9, roughness: 0.35 }),
      mat: new THREE.MeshStandardMaterial({ color: "#161616", roughness: 1 }),
      chrome: new THREE.MeshStandardMaterial({ color: "#e4e4e8", metalness: 1, roughness: 0.12 }),
      black: new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.45 }),
      rubber: new THREE.MeshStandardMaterial({ color: "#0d0d0d", roughness: 0.9 }),
      arm: armGeometry(),
      cover,
      lid: new THREE.MeshPhysicalMaterial({
        color: "#dfe6ee",
        transparent: true,
        opacity: 0.07,
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        depthWrite: false,
      }),
      strobeMap,
    };
  }, []);
  useEffect(
    () => () => {
      parts.plinthGeometry.dispose();
      parts.arm.dispose();
      parts.cover.dispose();
      parts.strobeMap.dispose();
    },
    [parts],
  );

  const speakers = useMemo(() => {
    const cabinet = new THREE.MeshStandardMaterial({ ...tiled(darkOak(), 1, 1), roughness: 1 });
    const cloth = new THREE.MeshStandardMaterial({ ...tiled(grilleCloth(), 2, 3), roughness: 1 });
    return { cabinet, cloth };
  }, []);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const on = playing !== null;

    // Direct drive: up to speed in well under a second, and a slower wind-down.
    speed.current = THREE.MathUtils.damp(speed.current, on ? RPM_33 : 0, on ? 6 : 1.5, delta);
    if (platter.current) platter.current.rotation.y -= speed.current * delta;

    if (arm.current) {
      arm.current.rotation.y = THREE.MathUtils.damp(arm.current.rotation.y, on ? ARM_PLAY : ARM_REST, 2.5, delta);
    }
    if (drop.current) {
      drop.current.position.y = THREE.MathUtils.damp(drop.current.position.y, 0, 9, delta);
    }
    if (halo.current) halo.current.opacity = ready ? 0.25 + Math.sin(t * 4) * 0.2 : 0;
    if (strobe.current) {
      strobe.current.emissiveIntensity = THREE.MathUtils.damp(
        strobe.current.emissiveIntensity,
        on ? 2 : 0.2,
        4,
        delta,
      );
    }
  });

  const { turntable: at, nowPlaying, counter } = layout;
  const top = PLINTH.height;

  return (
    <group>
      <group ref={deck} position={[at.x, at.y, at.z]}>
        {/* A generous invisible target, so the deck is easy to aim at. */}
        <mesh position={[0, 0.1, 0.02]} visible={false}>
          <boxGeometry args={[0.6, 0.24, 0.5]} />
        </mesh>

        <mesh geometry={parts.plinthGeometry} material={parts.plinth} position={[0, top / 2 + 0.012, 0]} castShadow receiveShadow />
        {[
          [-0.19, -0.14],
          [0.19, -0.14],
          [-0.19, 0.14],
          [0.19, 0.14],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.006, z]} material={parts.rubber}>
            <cylinderGeometry args={[0.028, 0.032, 0.012, 20]} />
          </mesh>
        ))}

        {/* Platter, mat, spindle, and the record on it. */}
        <group position={[PLATTER.x, top + 0.012, 0]}>
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[PLATTER.radius + 0.004, PLATTER.radius + 0.03, 64]} />
            <meshBasicMaterial ref={halo} color="#ffcc4d" transparent opacity={0} toneMapped={false} />
          </mesh>
          <group ref={platter}>
            <mesh
              position={[0, 0.016, 0]}
              material={[parts.rim, parts.platterTop, parts.platterTop]}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[PLATTER.radius, PLATTER.radius - 0.002, 0.032, 96]} />
            </mesh>
            <mesh position={[0, 0.034, 0]} material={parts.mat} receiveShadow>
              <cylinderGeometry args={[0.152, 0.152, 0.003, 64]} />
            </mesh>
            <mesh position={[0, 0.048, 0]} material={parts.chrome}>
              <cylinderGeometry args={[0.0035, 0.0035, 0.028, 12]} />
            </mesh>
            {playing ? (
              <group key={playing.id} ref={drop} position={[0, 0.06, 0]}>
                <Disc album={playing} position={[0, 0.037, 0]} />
              </group>
            ) : null}
          </group>
        </group>

        {/* Strobe lamp, peering up at the dots on the rim. */}
        <mesh position={[PLATTER.x - 0.17, top + 0.02, 0.15]}>
          <cylinderGeometry args={[0.013, 0.013, 0.018, 16]} />
          <meshStandardMaterial ref={strobe} color="#331a0a" emissive="#ff7a2a" emissiveIntensity={0.2} />
        </mesh>

        {/* Start/stop, and the speed buttons. */}
        <mesh position={[-0.19, top + 0.016, 0.145]} material={parts.black}>
          <boxGeometry args={[0.045, 0.008, 0.03]} />
        </mesh>
        {[-0.13, -0.095].map((x) => (
          <mesh key={x} position={[x, top + 0.015, 0.155]} material={parts.black}>
            <boxGeometry args={[0.022, 0.006, 0.012]} />
          </mesh>
        ))}

        {/* Pitch fader. */}
        <mesh position={[0.19, top + 0.0125, 0.06]} material={parts.black}>
          <boxGeometry args={[0.012, 0.002, 0.12]} />
        </mesh>
        <mesh position={[0.19, top + 0.02, 0.07]} material={parts.black} castShadow>
          <boxGeometry args={[0.026, 0.012, 0.018]} />
        </mesh>

        {/* Tonearm: base, S-shaped arm, headshell, counterweight, rest. */}
        <mesh position={[ARM_PIVOT.x, top + 0.02, ARM_PIVOT.z]} material={parts.chrome} castShadow>
          <cylinderGeometry args={[0.03, 0.034, 0.016, 32]} />
        </mesh>
        <group ref={arm} position={[ARM_PIVOT.x, top + 0.012, ARM_PIVOT.z]} rotation={[0, ARM_REST, 0]}>
          <mesh position={[0, 0.03, 0]} material={parts.chrome}>
            <cylinderGeometry args={[0.012, 0.014, 0.05, 20]} />
          </mesh>
          <mesh geometry={parts.arm} material={parts.chrome} castShadow />
          <mesh position={[-0.02, 0.046, 0.245]} rotation={[0, 0.3, 0]} material={parts.black} castShadow>
            <boxGeometry args={[0.018, 0.008, 0.045]} />
          </mesh>
          <mesh position={[-0.02, 0.038, 0.252]} material={parts.chrome}>
            <boxGeometry args={[0.012, 0.01, 0.018]} />
          </mesh>
          <mesh position={[0, 0.055, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={parts.black} castShadow>
            <cylinderGeometry args={[0.019, 0.019, 0.04, 24]} />
          </mesh>
        </group>
        <mesh position={[ARM_PIVOT.x + 0.018, top + 0.035, ARM_PIVOT.z + 0.19]} material={parts.black}>
          <cylinderGeometry args={[0.004, 0.004, 0.04, 8]} />
        </mesh>

        {/* The dust cover, propped open. */}
        <group position={[0, top + 0.012, -PLINTH.depth / 2]} rotation={[-1.25, 0, 0]}>
          <mesh geometry={parts.cover} material={parts.lid} />
        </group>
      </group>

      {/* Bookshelf speakers either side, toed in toward the shop. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side < 0 ? counter.x - 0.25 : at.x + 0.52, counter.height, counter.z - 0.1]}
          rotation={[0, -side * 0.22, 0]}
        >
          <mesh position={[0, 0.2, 0]} material={speakers.cabinet} castShadow receiveShadow>
            <boxGeometry args={[0.24, 0.4, 0.24]} />
          </mesh>
          <mesh position={[0, 0.2, 0.121]} material={speakers.cloth}>
            <planeGeometry args={[0.215, 0.375]} />
          </mesh>
          <mesh position={[0, 0.04, 0.123]} material={parts.chrome}>
            <boxGeometry args={[0.04, 0.008, 0.002]} />
          </mesh>
        </group>
      ))}

      {/* The now-playing stand: the sleeve up on a little easel for the shop to see. */}
      <group position={[nowPlaying.x, nowPlaying.y, nowPlaying.z]}>
        <mesh position={[0, 0.012, 0.03]} material={speakers.cabinet} castShadow>
          <boxGeometry args={[0.36, 0.024, 0.1]} />
        </mesh>
        <mesh position={[0, 0.16, -0.05]} rotation={[-0.2, 0, 0]} material={speakers.cabinet} castShadow>
          <boxGeometry args={[0.04, 0.3, 0.015]} />
        </mesh>
        {playing ? (
          <Sleeve key={playing.id} album={playing} position={[0, 0.185, 0]} rotation={[-0.17, 0, 0]} />
        ) : null}
      </group>
    </group>
  );
}
