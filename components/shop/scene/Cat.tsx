"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { isTap } from "./events";

const FUR = "#d9803a";
const STRIPE = "#a8551f";

/**
 * The shop cat, a ginger, curled up asleep on the end of the counter. It
 * breathes; give it a tap and it purrs and flicks an ear.
 */
export function Cat({
  position,
  onPet,
}: {
  position: [number, number, number];
  onPet: () => void;
}) {
  const body = useRef<THREE.Mesh>(null);
  const ear = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Group>(null);
  const petted = useRef(-10);
  const pending = useRef(false);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pending.current) {
      pending.current = false;
      petted.current = t;
    }
    const since = t - petted.current;
    const purring = since < 2.2;
    const breath = Math.sin(t * (purring ? 3 : 1.4));
    if (body.current) body.current.scale.set(1.35, 0.72 + breath * 0.025, 1);
    if (ear.current) {
      ear.current.rotation.z = -0.25 + (since < 0.5 ? Math.sin(since * 40) * 0.25 : 0);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 0.6) * 0.08;
  });

  const pet = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event)) return;
    event.stopPropagation();
    pending.current = true;
    onPet();
  };

  return (
    <group position={position} rotation={[0, 0.6, 0]} onClick={pet}>
      <mesh ref={body} position={[0, 0.08, 0]} scale={[1.35, 0.72, 1]}>
        <icosahedronGeometry args={[0.12, 1]} />
        <meshStandardMaterial color={FUR} roughness={0.9} flatShading />
      </mesh>
      {/* Back stripes. */}
      {[-0.06, 0, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.155, -0.01]}>
          <boxGeometry args={[0.025, 0.012, 0.13]} />
          <meshStandardMaterial color={STRIPE} flatShading />
        </mesh>
      ))}
      {/* Head, tucked down on its paws. */}
      <group position={[0.15, 0.07, 0.07]} rotation={[0, -0.5, 0.15]}>
        <mesh>
          <icosahedronGeometry args={[0.075, 1]} />
          <meshStandardMaterial color={FUR} roughness={0.9} flatShading />
        </mesh>
        <mesh ref={ear} position={[-0.02, 0.07, -0.035]} rotation={[0, 0, -0.25]}>
          <coneGeometry args={[0.028, 0.05, 4]} />
          <meshStandardMaterial color={FUR} flatShading />
        </mesh>
        <mesh position={[-0.02, 0.07, 0.035]} rotation={[0, 0, -0.25]}>
          <coneGeometry args={[0.028, 0.05, 4]} />
          <meshStandardMaterial color={FUR} flatShading />
        </mesh>
        {/* Closed eyes. */}
        {[-0.025, 0.025].map((z) => (
          <mesh key={z} position={[0.066, 0.012, z]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.022, 0.004, 0.004]} />
            <meshBasicMaterial color="#2a1608" />
          </mesh>
        ))}
        <mesh position={[0.074, -0.01, 0]}>
          <sphereGeometry args={[0.008, 5, 4]} />
          <meshStandardMaterial color="#e89b8b" />
        </mesh>
      </group>
      {/* Tail curled round the front. */}
      <group ref={tail} position={[-0.02, 0.03, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0.3]}>
          <torusGeometry args={[0.16, 0.025, 5, 12, Math.PI * 0.9]} />
          <meshStandardMaterial color={STRIPE} roughness={0.9} flatShading />
        </mesh>
      </group>
    </group>
  );
}
