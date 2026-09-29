import type { PlacedCrate } from "@/lib/shop/layout";

/**
 * The player's body, shared between the DOM controls that steer it and the
 * frame loop that moves the camera. Mutated in place every frame, so it lives
 * in a ref rather than in React state — a re-render per frame would be absurd.
 */
export interface Rig {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Held keys and the on-screen stick, both in [-1, 1]. */
  input: { forward: number; strafe: number; stickX: number; stickY: number };
  /** Walking somewhere on your behalf: a tapped spot, or a crate to dig. */
  walkTo: {
    /** Waypoints still to reach, round the bins. */
    path: { x: number; z: number }[];
    then?: () => void;
    face?: { yaw: number; pitch: number };
  } | null;
  /** Where to turn and look once you get there. */
  facing: { yaw: number; pitch: number } | null;
  /** The crate being dug through, which takes the camera over. */
  digging: PlacedCrate | null;
}

export function createRig(spawn: { x: number; z: number; yaw: number }): Rig {
  return {
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw,
    pitch: -0.12,
    input: { forward: 0, strafe: 0, stickX: 0, stickY: 0 },
    walkTo: null,
    facing: null,
    digging: null,
  };
}
