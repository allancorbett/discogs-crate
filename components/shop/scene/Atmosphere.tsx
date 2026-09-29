"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { dominantColour } from "@/lib/shop/palette";
import type { Rig } from "../rig";
import { mote, samplePixels, useSleeveTexture } from "../textures";

const WARM = new THREE.Color("#ffb46b");
const mood = new THREE.Color();
const tint = new THREE.Color();

/**
 * The light in the room. A low warm fill everywhere; the counter lamp, whose
 * colour drifts toward the sleeve of whatever is on the turntable; and a pair
 * of lamps that follow you from bin to bin, so every aisle you walk down is
 * lit without paying for a real light over each one of them.
 */
export function Lighting({
  layout,
  rig,
  playing,
}: {
  layout: ShopLayout;
  rig: React.RefObject<Rig>;
  playing: Album | null;
}) {
  const counterLight = useRef<THREE.PointLight>(null);
  const aisle = useRef<(THREE.PointLight | null)[]>([]);
  const target = useRef(new THREE.Color(WARM));

  // Every bin has a pendant over it; these are the two nearest you.
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const { x, z } = rig.current;
    const nearest = [...layout.bins]
      .map((bin) => ({ bin, d: (bin.x - x) ** 2 + (bin.z - z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    aisle.current.forEach((light, i) => {
      const spot = nearest[i]?.bin;
      if (!light || !spot) return;
      light.position.x = THREE.MathUtils.damp(light.position.x, spot.x, 4, delta);
      light.position.z = THREE.MathUtils.damp(light.position.z, spot.z, 4, delta);
      light.color.lerp(tint.copy(WARM).lerp(target.current, 0.35), 1 - Math.exp(-delta * 1.5));
    });
    if (counterLight.current) {
      counterLight.current.color.lerp(target.current, 1 - Math.exp(-delta * 1.2));
    }
  });

  return (
    <>
      <ambientLight color="#ffd2a6" intensity={0.45} />
      <hemisphereLight args={["#ffd9ae", "#3b2416", 0.85]} />
      <directionalLight color="#ffe2bd" intensity={0.55} position={[2, 6, 3]} />
      <pointLight
        ref={counterLight}
        color={WARM}
        intensity={9}
        distance={7}
        decay={1.5}
        position={[layout.counter.x, 2.3, layout.counter.z + 0.4]}
      />
      {[0, 1].map((i) => (
        <pointLight
          key={i}
          ref={(light) => {
            aisle.current[i] = light;
          }}
          color={WARM}
          intensity={6}
          distance={5.5}
          decay={1.5}
          position={[layout.bins[i]?.x ?? 0, 2.35, layout.bins[i]?.z ?? 0]}
        />
      ))}
      {playing ? <MoodFrom album={playing} into={target} /> : <MoodReset into={target} />}
    </>
  );
}

/** Samples the playing sleeve and sets the room's mood colour from it. */
function MoodFrom({
  album,
  into,
}: {
  album: Album;
  into: React.RefObject<THREE.Color>;
}) {
  const texture = useSleeveTexture(album, false);
  useEffect(() => {
    const pixels = samplePixels(texture);
    if (!pixels) return;
    const [r, g, b] = dominantColour(pixels);
    mood.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    // Keep it lamplight: never darker or greyer than a warm bulb could be.
    const hsl = { h: 0, s: 0, l: 0 };
    mood.getHSL(hsl);
    mood.setHSL(hsl.h, Math.max(0.55, hsl.s), 0.6);
    into.current.copy(WARM).lerp(mood, 0.75);
  }, [texture, into]);
  return null;
}

function MoodReset({ into }: { into: React.RefObject<THREE.Color> }) {
  useEffect(() => {
    into.current.copy(WARM);
  }, [into]);
  return null;
}

const MOTES = 260;

/** Deterministic scatter, so render stays pure. */
const scatter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const SPREAD = { x: 7, y: 2.4, z: 7 };

/** Dust hanging in the lamplight around you, drifting and catching the light. */
export function DustMotes({ rig }: { rig: React.RefObject<Rig> }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      positions[i * 3] = (scatter(i, 1) - 0.5) * SPREAD.x;
      positions[i * 3 + 1] = 0.4 + scatter(i, 2) * SPREAD.y;
      positions[i * 3 + 2] = (scatter(i, 3) - 0.5) * SPREAD.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = state.clock.elapsedTime;
    const cloud = points.current;
    if (!cloud) return;
    // The cloud travels with you; each speck wraps round within it.
    cloud.position.set(rig.current.x, 0, rig.current.z);
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < MOTES; i++) {
      const k = i * 3;
      array[k] += Math.sin(t * 0.3 + i) * 0.02 * delta;
      array[k + 1] += (Math.sin(t * 0.2 + i * 1.3) * 0.02 - 0.006) * delta;
      array[k + 2] += Math.cos(t * 0.25 + i * 0.7) * 0.02 * delta;
      if (array[k + 1] < 0.3) array[k + 1] += SPREAD.y;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={mote()}
        size={0.03}
        color="#ffe2b8"
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
