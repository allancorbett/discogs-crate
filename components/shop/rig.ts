import type { PlacedCrate } from "@/lib/shop/layout";
import { resolveMove, type ShopLayout } from "@/lib/shop/layout";

/**
 * The player's body, shared between the input that steers it and the frame
 * loop that moves the camera. Mutated in place every frame, so it lives in a
 * ref rather than in React state — a re-render per frame would be absurd.
 */
export interface Rig {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** The crate being dug through, which takes the camera over. */
  digging: PlacedCrate | null;
}

export function createRig(spawn: { x: number; z: number; yaw: number }): Rig {
  return { x: spawn.x, z: spawn.z, yaw: spawn.yaw, pitch: -0.1, digging: null };
}

const key = (username: string) => `crate:shop-position:${username.toLowerCase()}`;

/**
 * Where you were standing last time, as musicmaze remembers your place in the
 * maze. Refused if the shop has changed shape since and it would put you
 * inside a bin — or anywhere else you couldn't have walked to.
 */
export function restoreRig(username: string, layout: ShopLayout): Rig {
  const fresh = createRig(layout.spawn);
  try {
    const raw = localStorage.getItem(key(username));
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Partial<Rig>;
    const { x, z, yaw, pitch } = saved;
    if (![x, z, yaw, pitch].every((v) => typeof v === "number" && Number.isFinite(v))) {
      return fresh;
    }
    const here = { x: x!, z: z! };
    const settled = resolveMove(layout, here, here);
    if (settled.x !== here.x || settled.z !== here.z) return fresh;
    return { x: x!, z: z!, yaw: yaw!, pitch: pitch!, digging: null };
  } catch {
    return fresh;
  }
}

export function saveRig(username: string, rig: Rig): void {
  try {
    const { x, z, yaw, pitch } = rig;
    localStorage.setItem(key(username), JSON.stringify({ x, z, yaw, pitch }));
  } catch {
    // Only a convenience.
  }
}
