"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import { SLEEVE } from "@/lib/shop/sleeves";
import { ignoreAim } from "../interact";
import { Disc, Sleeve } from "./Vinyl";

/** Where the record sits in your hands, relative to your eyes. */
const IN_HAND = new THREE.Vector3(0.26, -0.17, -0.9);
const HAND_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, -0.14, 0.04));

const targetPosition = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const sway = new THREE.Quaternion();
const swayEuler = new THREE.Euler();
const lift = new THREE.Vector3();

interface Props {
  album: Album;
  /** Where it was pulled from, so it rises out of the crate into your hands. */
  from: THREE.Object3D | null;
}

/**
 * The record you are carrying, held up in front of you. It is not parented to
 * the camera — it chases a point in front of it instead, which gives it a bit
 * of weight and a lag as you turn, like something actually held.
 */
export function HeldRecord({ album, from }: Props) {
  const group = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const object = group.current;
    // Held up in front of your face, it must never be what the crosshair hits.
    ignoreAim(object);
    if (!object || !from) return;
    from.updateWorldMatrix(true, false);
    from.getWorldPosition(object.position);
    from.getWorldQuaternion(object.quaternion);
    // The crate's sleeves pivot on their bottom edge; this one on its centre.
    lift.set(0, SLEEVE.size / 2, 0).applyQuaternion(object.quaternion);
    object.position.add(lift);
    // Only ever placed once, on the frame it is pulled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, rawDelta) => {
    const object = group.current;
    if (!object) return;
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const camera = state.camera;

    targetPosition.copy(IN_HAND).applyMatrix4(camera.matrixWorld);
    swayEuler.set(Math.sin(t * 1.3) * 0.015, Math.sin(t * 0.9) * 0.02, 0);
    sway.setFromEuler(swayEuler);
    targetQuaternion.copy(camera.quaternion).multiply(HAND_TILT).multiply(sway);

    // Snappy enough to keep up with mouse look, with just a touch of weight.
    const ease = 1 - Math.exp(-delta * 16);
    object.position.lerp(targetPosition, ease);
    object.quaternion.slerp(targetQuaternion, ease);
  });

  return (
    <group ref={group} renderOrder={10}>
      <Sleeve album={album} />
      {/* The disc half out of its sleeve, the way you check the vinyl. */}
      <Disc album={album} position={[0.11, 0, -0.006]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}
