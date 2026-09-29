"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { HeadBob, prefersReducedMotion } from "@/lib/shop/headbob";
import { CRATE_RIM, EYE_HEIGHT, digStance, resolveMove, type ShopLayout } from "@/lib/shop/layout";
import { MAX_PITCH, type Controls } from "../controls";
import type { Rig } from "../rig";

/** Metres a second, as in musicmaze. */
const WALK_SPEED = 3.4;
const SPRINT_MULTIPLIER = 1.7;
/** musicmaze holds this horizontal field of view whatever the screen shape. */
const HORIZONTAL_FOV = 88;

/** Leaning over a crate: a little lower than standing, looking down into it. */
const DIG_EYE = 1.5;
/** How far back from the crate's centre your eyes are while digging. */
const DIG_BACK = 0.62;
/** Seconds to ease out of a crate back to walking. */
const STAND_UP = 0.35;

const targetPosition = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const lookFrom = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const lookMatrix = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);

interface Props {
  rig: RefObject<Rig>;
  layout: ShopLayout;
  controlsRef: RefObject<Controls | null>;
}

/**
 * Walking, the musicmaze way: instant velocity (full speed while a key is
 * held, none when it's let go), mouse look with no smoothing, Shift to hurry,
 * sliding along whatever you walk into, and a head bob tied to the ground
 * actually covered. Digging into a crate is the one time the camera eases:
 * it leans in over the crate, and back out when you step away.
 */
export function Player({ rig: rigRef, layout, controlsRef }: Props) {
  const bob = useMemo(() => new HeadBob(!prefersReducedMotion()), []);
  const standing = useRef(STAND_UP);
  const wasDigging = useRef(false);

  useFrame((state, rawDelta) => {
    const rig = rigRef.current;
    const input = controlsRef.current;
    const dt = Math.min(rawDelta, 0.1);
    const camera = state.camera as THREE.PerspectiveCamera;

    const vfov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HORIZONTAL_FOV / 2)) / camera.aspect),
    );
    const fov = Math.min(80, Math.max(58, vfov));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (rig.digging) {
      if (input) input.enabled = false;
      wasDigging.current = true;
      const crate = rig.digging;
      const stance = digStance(crate);
      // Stand where the dig leaves you, so stepping back puts you right there.
      rig.x = stance.x;
      rig.z = stance.z;
      rig.yaw = stance.yaw;
      rig.pitch = -0.3;

      lookFrom.set(
        crate.x + Math.sin(crate.rotation) * DIG_BACK,
        DIG_EYE,
        crate.z + Math.cos(crate.rotation) * DIG_BACK,
      );
      // Aim a little below the crate, so it sits in the upper part of the
      // view and the controls along the bottom never cover it.
      lookAt.set(
        crate.x - Math.sin(crate.rotation) * 0.1,
        CRATE_RIM - 0.2,
        crate.z - Math.cos(crate.rotation) * 0.1,
      );
      lookMatrix.lookAt(lookFrom, lookAt, up);
      targetQuaternion.setFromRotationMatrix(lookMatrix);
      const ease = 1 - Math.exp(-dt * 6);
      camera.position.lerp(lookFrom, ease);
      camera.quaternion.slerp(targetQuaternion, ease);
      return;
    }

    if (input) input.enabled = true;
    if (wasDigging.current) {
      wasDigging.current = false;
      standing.current = 0;
    }

    const intent = input?.consume() ?? { forward: 0, strafe: 0, yawDelta: 0, pitchDelta: 0 };
    rig.yaw += intent.yawDelta;
    rig.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rig.pitch + intent.pitchDelta));

    let stepped = 0;
    if (intent.forward !== 0 || intent.strafe !== 0) {
      const speed = WALK_SPEED * (input?.sprinting ? SPRINT_MULTIPLIER : 1) * dt;
      const sin = Math.sin(rig.yaw);
      const cos = Math.cos(rig.yaw);
      const moved = resolveMove(layout, rig, {
        x: rig.x + (-sin * intent.forward + cos * intent.strafe) * speed,
        z: rig.z + (-cos * intent.forward - sin * intent.strafe) * speed,
      });
      stepped = Math.hypot(moved.x - rig.x, moved.z - rig.z);
      rig.x = moved.x;
      rig.z = moved.z;
    }

    const { y, sway } = bob.update(stepped, dt);
    targetPosition.set(
      rig.x + Math.cos(rig.yaw) * sway,
      EYE_HEIGHT + y,
      rig.z - Math.sin(rig.yaw) * sway,
    );
    euler.set(rig.pitch, rig.yaw, 0, "YXZ");
    targetQuaternion.setFromEuler(euler);

    if (standing.current < STAND_UP) {
      // Straightening up from the crate: the one eased move while walking.
      standing.current += dt;
      const ease = 1 - Math.exp(-dt * 12);
      camera.position.lerp(targetPosition, ease);
      camera.quaternion.slerp(targetQuaternion, ease);
    } else {
      camera.position.copy(targetPosition);
      camera.quaternion.copy(targetQuaternion);
    }
  });

  return null;
}
