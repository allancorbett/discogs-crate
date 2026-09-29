"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { dominantColour } from "@/lib/shop/palette";
import type { QualityLevel } from "@/lib/shop/quality";
import { ignoreAim } from "../interact";
import type { Rig } from "../rig";
import { mote, samplePixels, useSleeveTexture } from "../textures";

const WARM = new THREE.Color("#ffb66e");
const mood = new THREE.Color();
const tint = new THREE.Color();

/** Height of the pendant bulbs above the floor. */
export const LAMP_Y = 2.45;

/** Enamel shade: a shallow dome flaring to a lip, drawn as a lathe profile. */
function shadeGeometry() {
  const profile = [
    new THREE.Vector2(0.018, 0.2),
    new THREE.Vector2(0.03, 0.19),
    new THREE.Vector2(0.09, 0.15),
    new THREE.Vector2(0.17, 0.07),
    new THREE.Vector2(0.215, 0.012),
    new THREE.Vector2(0.222, 0),
  ];
  const geometry = new THREE.LatheGeometry(profile, 40);
  geometry.translate(0, -0.1, 0);
  return geometry;
}

// Area lights need their lookup tables in the shader library before first use.
RectAreaLightUniformsLib.init();

interface LightingProps {
  layout: ShopLayout;
  rig: React.RefObject<Rig>;
  playing: Album | null;
  quality: QualityLevel;
}

/**
 * The light in the room, which is most of what makes it feel like somewhere.
 *
 * A green enamel pendant hangs over every bin, its bulb glowing (bloom does
 * the rest). Real, shadow-casting spotlights are expensive, so there are only
 * three: one over the counter, whose colour drifts toward the sleeve of what
 * is playing, and two that follow you from pendant to pendant — fading out,
 * hopping over and fading back up, so the swap is never seen. A cool wash from
 * the rainy window and a low warm fill do the rest.
 */
export function Lighting({ layout, rig, playing, quality }: LightingProps) {
  const counterSpot = useRef<THREE.SpotLight>(null);
  const aisle = useRef<(THREE.SpotLight | null)[]>([]);
  const assigned = useRef<number[]>([-1, -1]);
  const windowLight = useRef<THREE.RectAreaLight>(null);
  const target = useRef(new THREE.Color(WARM));
  const shades = useRef<THREE.InstancedMesh>(null);
  const bulbs = useRef<THREE.InstancedMesh>(null);
  const cords = useRef<THREE.InstancedMesh>(null);

  // Pendants: one over every bin, and one over the counter.
  const lamps = useMemo(
    () => [
      ...layout.bins.map((bin) => ({ x: bin.x, z: bin.z })),
      { x: layout.counter.x, z: layout.counter.z + 0.3 },
    ],
    [layout.bins, layout.counter],
  );

  const geometry = useMemo(
    () => ({
      shade: shadeGeometry(),
      bulb: new THREE.SphereGeometry(0.045, 20, 12),
      cord: new THREE.CylinderGeometry(0.004, 0.004, 1, 6),
    }),
    [],
  );
  const materials = useMemo(
    () => ({
      shade: new THREE.MeshStandardMaterial({
        color: "#1f4a37",
        metalness: 0.2,
        roughness: 0.28,
        side: THREE.DoubleSide,
      }),
      bulb: new THREE.MeshStandardMaterial({
        color: "#fff1d6",
        emissive: "#ffc27a",
        emissiveIntensity: 9,
      }),
      cord: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.6 }),
    }),
    [],
  );

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const drop = layout.room.height - LAMP_Y - 0.1;
    lamps.forEach((lamp, i) => {
      shades.current?.setMatrixAt(i, m.makeTranslation(lamp.x, LAMP_Y + 0.08, lamp.z));
      bulbs.current?.setMatrixAt(i, m.makeTranslation(lamp.x, LAMP_Y, lamp.z));
      cords.current?.setMatrixAt(
        i,
        m.makeScale(1, drop, 1).setPosition(lamp.x, LAMP_Y + 0.1 + drop / 2, lamp.z),
      );
    });
    for (const mesh of [shades.current, bulbs.current, cords.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [lamps, layout.room.height]);

  useEffect(() => {
    const light = windowLight.current;
    if (!light) return;
    light.lookAt(light.position.x + 1, light.position.y - 0.4, light.position.z);
  }, []);

  // Shadow maps sized to the quality level.
  useEffect(() => {
    for (const light of [counterSpot.current, ...aisle.current]) {
      if (!light) continue;
      light.castShadow = quality.shadows;
      light.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }, [quality]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const { x, z } = rig.current;

    const nearest = layout.bins
      .map((bin, i) => ({ i, d: (bin.x - x) ** 2 + (bin.z - z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((entry) => entry.i);

    aisle.current.forEach((light, slot) => {
      if (!light) return;
      const want = nearest[slot] ?? -1;
      let current = assigned.current[slot];
      // Another slot already holds the lamp this one wants: keep what we have.
      if (want !== current && assigned.current.includes(want)) return;
      const full = 38;
      if (want !== current) {
        light.intensity = Math.max(0, light.intensity - delta * full * 5);
        if (light.intensity === 0) {
          current = want;
          assigned.current[slot] = want;
          const bin = layout.bins[want];
          if (bin) {
            light.position.set(bin.x, LAMP_Y - 0.05, bin.z);
            light.target.position.set(bin.x, 0, bin.z);
            light.target.updateMatrixWorld();
          }
        }
      } else if (current >= 0) {
        light.intensity = Math.min(full, light.intensity + delta * full * 3);
      }
      light.color.lerp(tint.copy(WARM).lerp(target.current, 0.3), 1 - Math.exp(-delta * 1.5));
    });

    counterSpot.current?.color.lerp(target.current, 1 - Math.exp(-delta * 1.2));
  });

  const counterLamp = lamps[lamps.length - 1];
  const glass = { z: layout.room.depth / 2 - 2.6, x: -layout.room.width / 2 + 0.05 };

  return (
    <>
      <ambientLight color="#ffd2a6" intensity={0.14} />
      <hemisphereLight args={["#ffcf9a", "#2a1a10", 0.3]} />

      <instancedMesh ref={shades} args={[geometry.shade, materials.shade, lamps.length]} castShadow />
      <instancedMesh ref={bulbs} args={[geometry.bulb, materials.bulb, lamps.length]} />
      <instancedMesh ref={cords} args={[geometry.cord, materials.cord, lamps.length]} />

      <spotLight
        ref={counterSpot}
        color={WARM}
        intensity={30}
        distance={6}
        decay={1.6}
        angle={0.95}
        penumbra={0.8}
        position={[counterLamp.x, LAMP_Y - 0.05, counterLamp.z]}
        shadow-bias={-0.0004}
        shadow-radius={5}
        shadow-normalBias={0.02}
        shadow-camera-near={0.2}
        shadow-camera-far={5}
      >
        <object3D attach="target" position={[counterLamp.x, 0, counterLamp.z]} />
      </spotLight>

      {[0, 1].map((slot) => (
        <spotLight
          key={slot}
          ref={(light) => {
            aisle.current[slot] = light;
          }}
          color={WARM}
          intensity={0}
          distance={7}
          decay={1.6}
          angle={1.0}
          penumbra={0.85}
          position={[0, LAMP_Y - 0.05, 0]}
          shadow-bias={-0.0004}
          shadow-radius={5}
          shadow-normalBias={0.02}
          shadow-camera-near={0.2}
          shadow-camera-far={5}
        />
      ))}

      <rectAreaLight
        ref={windowLight}
        color="#8aa6d8"
        intensity={2.2}
        width={1.9}
        height={1.4}
        position={[glass.x, 1.6, glass.z]}
      />

      {playing ? <MoodFrom album={playing} into={target} /> : <MoodReset into={target} />}
    </>
  );
}

/** Samples the playing sleeve and sets the room's mood colour from it. */
function MoodFrom({ album, into }: { album: Album; into: React.RefObject<THREE.Color> }) {
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
    into.current.copy(WARM).lerp(mood, 0.7);
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
const SPREAD = { x: 7, y: 2.4, z: 7 };

/** Deterministic scatter, so render stays pure. */
const scatter = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

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
  useEffect(() => ignoreAim(points.current), []);

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
        size={0.02}
        color="#ffe2b8"
        transparent
        opacity={0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
