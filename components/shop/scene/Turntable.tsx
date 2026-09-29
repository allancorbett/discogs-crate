"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { isTap } from "./events";
import { Disc, Sleeve } from "./Vinyl";

/** 33⅓ revolutions a minute, in radians a second. */
const RPM_33 = ((100 / 3) * Math.PI * 2) / 60;
const ARM_REST = 0.05;
const ARM_PLAY = -0.55;

interface Props {
  layout: ShopLayout;
  playing: Album | null;
  /** Something in your hands that could go on. */
  ready: boolean;
  onTap: () => void;
}

/**
 * The deck in the corner, on the counter, with a pair of speakers either side
 * and a stand for the sleeve of whatever is on. Put a record on it and the
 * platter spins up, the arm swings over and the speakers start to thump.
 */
export function Turntable({ layout, playing, ready, onTap }: Props) {
  const platter = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const drop = useRef<THREE.Group>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const cones = useRef<THREE.Mesh[]>([]);
  const led = useRef<THREE.MeshBasicMaterial>(null);
  const speed = useRef(0);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const on = playing !== null;

    // Spins up and winds down over a second or so, as a belt drive does.
    speed.current = THREE.MathUtils.damp(speed.current, on ? RPM_33 : 0, 2.2, delta);
    if (platter.current) platter.current.rotation.y -= speed.current * delta;

    if (arm.current) {
      arm.current.rotation.y = THREE.MathUtils.damp(
        arm.current.rotation.y,
        on ? ARM_PLAY : ARM_REST,
        3,
        delta,
      );
    }

    // A freshly placed record drops the last few centimetres onto the mat.
    if (drop.current) {
      drop.current.position.y = THREE.MathUtils.damp(drop.current.position.y, 0, 9, delta);
    }

    if (halo.current) {
      halo.current.opacity = ready ? 0.35 + Math.sin(t * 4) * 0.25 : 0;
    }

    if (led.current) led.current.color.set(on ? "#56ff8a" : "#ff4a3a");

    // A lazy 96 bpm pump from the speaker cones while something plays.
    const beat = on ? Math.max(0, Math.sin(t * Math.PI * 3.2)) ** 6 : 0;
    for (const cone of cones.current) cone.scale.setScalar(1 + beat * 0.08);
  });

  const tap = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event)) return;
    event.stopPropagation();
    // Called straight from the click, so the new tab it opens is not blocked.
    onTap();
  };

  const { turntable: deck, nowPlaying, counter } = layout;

  return (
    <group>
      <group position={[deck.x, deck.y, deck.z]} onClick={tap}>
        {/* A generous, invisible target, so the deck is easy to hit. */}
        <mesh position={[0, 0.12, 0.04]}>
          <boxGeometry args={[0.7, 0.26, 0.55]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* Plinth. */}
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[0.48, 0.09, 0.38]} />
          <meshStandardMaterial color="#2a1b12" roughness={0.5} flatShading />
        </mesh>
        <mesh position={[0, 0.091, 0]}>
          <boxGeometry args={[0.47, 0.004, 0.37]} />
          <meshStandardMaterial color="#1a1a1c" roughness={0.4} metalness={0.4} />
        </mesh>

        {/* Platter and mat. */}
        <group position={[-0.05, 0.1, 0]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.018, 36]} />
            <meshStandardMaterial color="#b9b9be" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.162, 0.2, 36]} />
            <meshBasicMaterial
              ref={halo}
              color="#ffcc4d"
              transparent
              opacity={0}
              toneMapped={false}
            />
          </mesh>
          <group ref={platter} position={[0, 0.011, 0]}>
            <mesh>
              <cylinderGeometry args={[0.152, 0.152, 0.004, 36]} />
              <meshStandardMaterial color="#141414" roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <cylinderGeometry args={[0.004, 0.004, 0.03, 8]} />
              <meshStandardMaterial color="#ddd" metalness={0.9} roughness={0.2} />
            </mesh>
            {playing ? (
              <group key={playing.id} ref={drop} position={[0, 0.06, 0]}>
                <Disc album={playing} position={[0, 0.004, 0]} />
              </group>
            ) : null}
          </group>
        </group>

        {/* Tonearm: pivot, arm, headshell. */}
        <group ref={arm} position={[0.17, 0.1, -0.12]} rotation={[0, ARM_REST, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.04, 10]} />
            <meshStandardMaterial color="#9a9aa0" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.045, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.24, 6]} />
            <meshStandardMaterial color="#d0d0d6" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[-0.01, 0.04, 0.245]}>
            <boxGeometry args={[0.025, 0.012, 0.035]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 0.045, -0.04]}>
            <cylinderGeometry args={[0.018, 0.018, 0.03, 10]} />
            <meshStandardMaterial color="#555" metalness={0.6} />
          </mesh>
        </group>

        {/* Speed button with its lamp. */}
        <mesh position={[-0.19, 0.095, 0.15]}>
          <sphereGeometry args={[0.008, 6, 4]} />
          <meshBasicMaterial ref={led} color="#ff4a3a" toneMapped={false} />
        </mesh>
      </group>

      {/* Speakers either side, turned a little toward the shop. */}
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          position={[
            side < 0 ? counter.x - 0.35 : deck.x + 0.5,
            counter.height,
            counter.z - 0.08,
          ]}
          rotation={[0, -side * 0.2, 0]}
        >
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.24, 0.4, 0.22]} />
            <meshStandardMaterial color="#3b2a1e" roughness={0.6} flatShading />
          </mesh>
          <mesh
            ref={(mesh) => {
              if (mesh) cones.current[i] = mesh;
            }}
            position={[0, 0.15, 0.112]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.08, 0.06, 0.02, 12]} />
            <meshStandardMaterial color="#141414" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0, 0.3, 0.112]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.025, 0.02, 10]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* The now-playing stand: the sleeve propped up for the shop to see. */}
      <group position={[nowPlaying.x, nowPlaying.y, nowPlaying.z]}>
        <mesh position={[0, 0.01, 0.02]}>
          <boxGeometry args={[0.36, 0.02, 0.1]} />
          <meshStandardMaterial color="#2a1b12" flatShading />
        </mesh>
        {playing ? (
          <Sleeve
            key={playing.id}
            album={playing}
            position={[0, 0.17, 0]}
            rotation={[-0.14, 0, 0]}
          />
        ) : null}
      </group>
    </group>
  );
}
