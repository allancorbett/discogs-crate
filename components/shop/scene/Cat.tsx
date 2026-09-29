"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tag } from "../interact";
import { tabby, tiled } from "../materials";

/**
 * The shop cat, a ginger tabby, curled up asleep on the end of the counter.
 * It breathes; aim at it and click, and it purrs and flicks an ear.
 */
export function Cat({ position, petted }: { position: [number, number, number]; petted: number }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const ear = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Group>(null);
  const pettedAt = useRef(-10);
  const lastPetted = useRef(petted);

  useEffect(() => {
    tag(root.current, { resolve: () => ({ kind: "cat" }) });
  }, []);

  const materials = useMemo(() => {
    const fur = tiled(tabby(), 2, 1);
    return {
      fur: new THREE.MeshStandardMaterial({ ...fur, roughness: 1 }),
      face: new THREE.MeshStandardMaterial({ ...tiled(tabby(), 1, 1), roughness: 1 }),
      pale: new THREE.MeshStandardMaterial({ color: "#f1d9bd", roughness: 1 }),
      nose: new THREE.MeshStandardMaterial({ color: "#d98f86", roughness: 0.6 }),
      lid: new THREE.MeshStandardMaterial({ color: "#3a1f0e", roughness: 0.8 }),
      innerEar: new THREE.MeshStandardMaterial({ color: "#e7a99c", roughness: 0.9 }),
    };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (petted !== lastPetted.current) {
      lastPetted.current = petted;
      pettedAt.current = t;
    }
    const since = t - pettedAt.current;
    const purring = since < 2.2;
    const breath = Math.sin(t * (purring ? 3 : 1.3));
    if (body.current) body.current.scale.set(1.3, 0.62 + breath * 0.02, 0.95);
    if (ear.current) {
      ear.current.rotation.z = -0.3 + (since < 0.5 ? Math.sin(since * 40) * 0.25 : 0);
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 0.5) * 0.06 + (purring ? Math.sin(t * 6) * 0.05 : 0);
  });

  return (
    <group ref={root} position={position} rotation={[0, 0.6, 0]}>
      <mesh ref={body} position={[0, 0.075, 0]} scale={[1.3, 0.62, 0.95]} material={materials.fur} castShadow receiveShadow>
        <sphereGeometry args={[0.13, 40, 24]} />
      </mesh>
      {/* Head, chin tucked onto its paws. */}
      <group position={[0.15, 0.065, 0.075]} rotation={[0, -0.5, 0.12]}>
        <mesh material={materials.face} scale={[1, 0.88, 1.05]} castShadow>
          <sphereGeometry args={[0.07, 32, 20]} />
        </mesh>
        <mesh position={[0.05, -0.022, 0]} scale={[0.8, 0.55, 1]} material={materials.pale}>
          <sphereGeometry args={[0.038, 20, 12]} />
        </mesh>
        <mesh ref={ear} position={[-0.012, 0.058, -0.034]} rotation={[-0.25, 0, -0.3]} material={materials.face} castShadow>
          <coneGeometry args={[0.024, 0.045, 12]} />
        </mesh>
        <mesh position={[-0.012, 0.058, 0.034]} rotation={[0.25, 0, -0.3]} material={materials.face} castShadow>
          <coneGeometry args={[0.024, 0.045, 12]} />
        </mesh>
        <mesh position={[-0.008, 0.054, 0.032]} rotation={[0.25, 0, -0.3]} material={materials.innerEar}>
          <coneGeometry args={[0.015, 0.03, 10]} />
        </mesh>
        {/* Closed eyes: two little crescents. */}
        {[-0.024, 0.024].map((z) => (
          <mesh key={z} position={[0.061, 0.014, z]} rotation={[0, Math.PI / 2, Math.PI / 2]} material={materials.lid}>
            <torusGeometry args={[0.009, 0.0016, 6, 12, Math.PI]} />
          </mesh>
        ))}
        <mesh position={[0.071, -0.006, 0]} material={materials.nose}>
          <sphereGeometry args={[0.0065, 12, 8]} />
        </mesh>
      </group>
      {/* Front paws, poking out under the chin. */}
      {[0.03, 0.1].map((z) => (
        <mesh key={z} position={[0.19, 0.02, z]} scale={[1.6, 0.8, 1]} material={materials.pale}>
          <sphereGeometry args={[0.022, 16, 10]} />
        </mesh>
      ))}
      {/* Tail curled round the front. */}
      <group ref={tail} position={[-0.02, 0.028, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0.3]} material={materials.fur} castShadow>
          <torusGeometry args={[0.16, 0.026, 12, 40, Math.PI * 0.95]} />
        </mesh>
      </group>
    </group>
  );
}
