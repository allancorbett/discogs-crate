import * as THREE from "three";
import type { PlacedCrate } from "@/lib/shop/layout";

/**
 * What the crosshair can be on. With the pointer locked there is no cursor to
 * click things with, so the scene is asked what lies under the aim instead:
 * objects that can be used carry a tag in their `userData`, and the nearest
 * hit — walls and floor included, so nothing is reachable through a bin — wins.
 */
export type Interaction =
  | { kind: "crate"; crate: PlacedCrate }
  | { kind: "deck" }
  | { kind: "cat" };

export interface InteractTag {
  /** For instanced meshes, which instance was hit. */
  resolve: (instanceId: number | undefined) => Interaction | null;
}

const TAG = "interact";
const IGNORE = "ignoreAim";

export function tag(object: THREE.Object3D | null, value: InteractTag) {
  if (object) object.userData[TAG] = value;
}

/** Things that should never block the aim: the record in your hands, dust. */
export function ignoreAim(object: THREE.Object3D | null) {
  if (object) object.userData[IGNORE] = true;
}

/** How far you can reach from where you stand, in metres. */
export const REACH = 3.2;

const raycaster = new THREE.Raycaster();

export function pick(
  scene: THREE.Scene,
  camera: THREE.Camera,
  aim: { x: number; y: number },
): Interaction | null {
  raycaster.setFromCamera(new THREE.Vector2(aim.x, aim.y), camera);
  raycaster.near = 0.05;
  raycaster.far = REACH;

  for (const hit of raycaster.intersectObjects(scene.children, true)) {
    let ignored = false;
    let found: InteractTag | undefined;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.userData[IGNORE]) {
        ignored = true;
        break;
      }
      if (!found && o.userData[TAG]) found = o.userData[TAG] as InteractTag;
    }
    if (ignored) continue;
    // Invisible helpers still get hit; only what you could actually see counts.
    if (!found && !hit.object.visible) continue;
    return found ? found.resolve(hit.instanceId) : null;
  }
  return null;
}

/** What the crosshair says it is on. */
export function describe(interaction: Interaction | null): string | null {
  if (!interaction) return null;
  if (interaction.kind === "deck") return "Turntable";
  if (interaction.kind === "cat") return "Shop cat";
  const { crate } = interaction;
  return crate.parts > 1 ? `${crate.genre} · ${crate.part} of ${crate.parts}` : crate.genre;
}
