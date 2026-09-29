"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import {
  CRATE_RIM,
  EYE_HEIGHT,
  digStance,
  resolveMove,
  type ShopLayout,
} from "@/lib/shop/layout";
import type { Rig } from "../rig";

const WALK_SPEED = 1.9;
/** Leaning over a crate: a little lower than standing, looking down into it. */
const DIG_EYE = 1.5;
/** How far back from the crate's centre your eyes are while digging. */
const DIG_BACK = 0.62;

const targetPosition = new THREE.Vector3();
const targetQuaternion = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const lookFrom = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const lookMatrix = new THREE.Matrix4();
const up = new THREE.Vector3(0, 1, 0);

/** Turns `from` toward `to` by the shortest way round. */
function turnToward(from: number, to: number, amount: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}

interface Props {
  rig: RefObject<Rig>;
  layout: ShopLayout;
}

/**
 * Moves the camera: walking on keys, the stick or a tap-to-go target, and
 * easing over a crate when you dig into one. Every change of pose is smoothed,
 * so switching between walking and digging reads as leaning in, not a cut.
 */
export function Player({ rig: rigRef, layout }: Props) {
  const bob = useRef(0);

  useFrame((state, rawDelta) => {
    const rig = rigRef.current;
    const delta = Math.min(rawDelta, 0.05);
    const camera = state.camera;

    if (rig.digging) {
      const crate = rig.digging;
      const stance = digStance(crate);
      // Stand where the dig leaves you, so backing out puts you right there.
      rig.x = stance.x;
      rig.z = stance.z;
      rig.yaw = stance.yaw;
      rig.pitch = -0.35;

      lookFrom.set(
        crate.x + Math.sin(crate.rotation) * DIG_BACK,
        DIG_EYE,
        crate.z + Math.cos(crate.rotation) * DIG_BACK,
      );
      // Aim a little below the crate, so it sits in the upper part of the view
      // and the controls along the bottom never cover it.
      lookAt.set(
        crate.x - Math.sin(crate.rotation) * 0.1,
        CRATE_RIM - 0.2,
        crate.z - Math.cos(crate.rotation) * 0.1,
      );
      targetPosition.copy(lookFrom);
      lookMatrix.lookAt(lookFrom, lookAt, up);
      targetQuaternion.setFromRotationMatrix(lookMatrix);
    } else {
      let forward = rig.input.forward - rig.input.stickY;
      let strafe = rig.input.strafe + rig.input.stickX;
      const length = Math.hypot(forward, strafe);
      if (length > 1) {
        forward /= length;
        strafe /= length;
      }

      if (length > 0.05) {
        rig.walkTo = null;
      } else if (rig.walkTo) {
        const walk = rig.walkTo;
        const arrive = () => {
          rig.walkTo = null;
          rig.facing = walk.face ?? null;
          walk.then?.();
        };
        const waypoint = walk.path[0];
        if (!waypoint) {
          arrive();
        } else {
          const dx = waypoint.x - rig.x;
          const dz = waypoint.z - rig.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.08) {
            walk.path.shift();
            if (walk.path.length === 0) arrive();
          } else {
            const heading = Math.atan2(-dx, -dz);
            rig.yaw = turnToward(rig.yaw, heading, Math.min(1, delta * 5));
            const step = Math.min(distance, WALK_SPEED * delta);
            const next = resolveMove(layout, rig, {
              x: rig.x + (dx / distance) * step,
              z: rig.z + (dz / distance) * step,
            });
            // Pressed up against something the route didn't foresee: stop
            // there rather than pushing against it forever.
            if (Math.hypot(next.x - rig.x, next.z - rig.z) < step * 0.2) arrive();
            rig.x = next.x;
            rig.z = next.z;
            bob.current += delta * 9;
          }
        }
      }

      if (length > 0.05) rig.facing = null;
      if (rig.facing) {
        const turn = Math.min(1, delta * 4);
        rig.yaw = turnToward(rig.yaw, rig.facing.yaw, turn);
        rig.pitch += (rig.facing.pitch - rig.pitch) * turn;
        if (
          Math.abs(Math.atan2(Math.sin(rig.facing.yaw - rig.yaw), Math.cos(rig.facing.yaw - rig.yaw))) < 0.01 &&
          Math.abs(rig.facing.pitch - rig.pitch) < 0.01
        ) {
          rig.facing = null;
        }
      }

      if (length > 0.05) {
        const sin = Math.sin(rig.yaw);
        const cos = Math.cos(rig.yaw);
        const speed = WALK_SPEED * delta;
        const next = resolveMove(layout, rig, {
          x: rig.x + (-sin * forward + cos * strafe) * speed,
          z: rig.z + (-cos * forward - sin * strafe) * speed,
        });
        rig.x = next.x;
        rig.z = next.z;
        bob.current += delta * 9 * Math.min(1, length);
      }

      targetPosition.set(
        rig.x,
        EYE_HEIGHT + Math.sin(bob.current) * 0.018,
        rig.z,
      );
      euler.set(rig.pitch, rig.yaw, 0);
      targetQuaternion.setFromEuler(euler);
    }

    // A phone held upright sees a sliver of the room at a landscape field of
    // view, so tall screens get a wider one.
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = camera.aspect < 0.8 ? 80 : camera.aspect < 1.2 ? 70 : 62;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }

    const ease = 1 - Math.exp(-delta * (rig.digging ? 5 : 14));
    camera.position.lerp(targetPosition, ease);
    camera.quaternion.slerp(targetQuaternion, ease);
  });

  return null;
}
