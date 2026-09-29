import type { ThreeEvent } from "@react-three/fiber";

/**
 * A press that barely moved is a tap; anything further was a drag to look
 * around, and must not also dig into whatever the pointer ended up over.
 */
export function isTap(event: ThreeEvent<MouseEvent>): boolean {
  return event.delta < 8;
}
