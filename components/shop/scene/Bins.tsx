"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BIN_HEIGHT, CRATE, type PlacedCrate, type ShopLayout } from "@/lib/shop/layout";
import { sleeveColour } from "@/lib/shop/palette";
import { SLEEVE, sleevePose } from "@/lib/shop/sleeves";
import { isTap } from "./events";

/**
 * Everything there is one of per bin or per crate, drawn as instances: a shop
 * with a thousand crates is still a handful of draw calls. The crates close to
 * you are drawn again in detail by CrateDetail, which is why the far sleeves
 * here can skip them.
 */

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y, z);
  return geometry;
}

function crateGeometry() {
  const { width: w, depth: d, height: h } = CRATE;
  const t = 0.018;
  return mergeGeometries([
    box(w, 0.02, d, 0, 0.01, 0),
    box(t, h, d, -w / 2 + t / 2, h / 2, 0),
    box(t, h, d, w / 2 - t / 2, h / 2, 0),
    box(w, h, t, 0, h / 2, -d / 2 + t / 2),
    // A low front lip, so flipped sleeves can tip over it.
    box(w, 0.1, t, 0, 0.05, d / 2 - t / 2),
  ])!;
}

function binGeometry(length: number, depth: number) {
  return mergeGeometries([
    // Kick plinth, cabinet, and an overhanging top.
    box(length - 0.06, 0.08, depth - 0.06, 0, 0.04, 0),
    box(length, BIN_HEIGHT - 0.11, depth, 0, 0.08 + (BIN_HEIGHT - 0.11) / 2, 0),
    box(length + 0.04, 0.03, depth + 0.04, 0, BIN_HEIGHT - 0.015, 0),
  ])!;
}

function sleeveGeometry() {
  const geometry = new THREE.BoxGeometry(SLEEVE.size, SLEEVE.size, SLEEVE.thickness);
  geometry.translate(0, SLEEVE.size / 2, 0);
  return geometry;
}

const matrix = new THREE.Matrix4();
const local = new THREE.Matrix4();
const colour = new THREE.Color();
const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

interface Props {
  layout: ShopLayout;
  /** Crates drawn in detail nearby; their sleeves are left out here. */
  near: Set<string>;
  /** Records out of their crates — in your hands or on the turntable. */
  away: Set<number>;
  onCrateTap: (crate: PlacedCrate) => void;
}

export function Bins({ layout, near, away, onCrateTap }: Props) {
  const { crates, bins } = layout;
  const binMesh = useRef<THREE.InstancedMesh>(null);
  const crateMesh = useRef<THREE.InstancedMesh>(null);
  const sleeveMesh = useRef<THREE.InstancedMesh>(null);
  const shadeMesh = useRef<THREE.InstancedMesh>(null);
  const bulbMesh = useRef<THREE.InstancedMesh>(null);

  const geometries = useMemo(
    () => ({
      crate: crateGeometry(),
      bin: binGeometry(bins[0]?.width ?? 2, bins[0]?.depth ?? 0.7),
      sleeve: sleeveGeometry(),
      shade: new THREE.ConeGeometry(0.22, 0.2, 7, 1, true),
      bulb: new THREE.IcosahedronGeometry(0.06, 0),
    }),
    [bins],
  );

  useLayoutEffect(
    () => () => Object.values(geometries).forEach((g) => g.dispose()),
    [geometries],
  );

  const sleeveCount = useMemo(
    () => crates.reduce((sum, crate) => sum + crate.albums.length, 0),
    [crates],
  );

  useLayoutEffect(() => {
    const binsMesh = binMesh.current;
    const shades = shadeMesh.current;
    const bulbs = bulbMesh.current;
    if (!binsMesh || !shades || !bulbs) return;
    bins.forEach((bin, i) => {
      matrix.makeTranslation(bin.x, 0, bin.z);
      binsMesh.setMatrixAt(i, matrix);
      // A pendant over every bin.
      matrix.makeTranslation(bin.x, 2.55, bin.z);
      shades.setMatrixAt(i, matrix);
      matrix.makeTranslation(bin.x, 2.46, bin.z);
      bulbs.setMatrixAt(i, matrix);
    });
    binsMesh.instanceMatrix.needsUpdate = true;
    shades.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    binsMesh.computeBoundingSphere();
  }, [bins]);

  useLayoutEffect(() => {
    const mesh = crateMesh.current;
    if (!mesh) return;
    crates.forEach((crate, i) => {
      matrix.makeRotationY(crate.rotation).setPosition(crate.x, BIN_HEIGHT, crate.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [crates]);

  useLayoutEffect(() => {
    const mesh = sleeveMesh.current;
    if (!mesh) return;
    let n = 0;
    for (const crate of crates) {
      const hidden = near.has(crate.id);
      crate.albums.forEach((album, index) => {
        if (hidden || away.has(album.id)) {
          mesh.setMatrixAt(n, hiddenMatrix);
        } else {
          const pose = sleevePose(index, null);
          matrix.makeRotationY(crate.rotation).setPosition(crate.x, BIN_HEIGHT, crate.z);
          local.makeRotationX(pose.angle).setPosition(0, pose.y, pose.z);
          mesh.setMatrixAt(n, matrix.multiply(local));
        }
        const [r, g, b] = sleeveColour(album.id);
        mesh.setColorAt(n, colour.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace));
        n++;
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [crates, near, away]);

  const tapCrate = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event) || event.instanceId === undefined) return;
    event.stopPropagation();
    const crate = crates[event.instanceId];
    if (crate) onCrateTap(crate);
  };

  // Sleeve instances are numbered crate by crate, so map back through counts.
  const sleeveOwners = useMemo(
    () => crates.flatMap((crate) => crate.albums.map(() => crate)),
    [crates],
  );
  const tapSleeve = (event: ThreeEvent<MouseEvent>) => {
    if (!isTap(event) || event.instanceId === undefined) return;
    event.stopPropagation();
    const crate = sleeveOwners[event.instanceId];
    if (crate) onCrateTap(crate);
  };

  return (
    <group>
      <instancedMesh
        ref={binMesh}
        args={[geometries.bin, undefined, bins.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#3b2416" roughness={0.8} flatShading />
      </instancedMesh>

      {crates.length > 0 ? (
        <instancedMesh
          ref={crateMesh}
          args={[geometries.crate, undefined, crates.length]}
          onClick={tapCrate}
          frustumCulled={false}
        >
          <meshStandardMaterial color="#b98a55" roughness={0.9} flatShading />
        </instancedMesh>
      ) : null}

      {sleeveCount > 0 ? (
        <instancedMesh
          ref={sleeveMesh}
          args={[geometries.sleeve, undefined, sleeveCount]}
          onClick={tapSleeve}
          frustumCulled={false}
        >
          <meshStandardMaterial roughness={0.7} />
        </instancedMesh>
      ) : null}

      <instancedMesh
        ref={shadeMesh}
        args={[geometries.shade, undefined, bins.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#1f3b2d" side={THREE.DoubleSide} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={bulbMesh}
        args={[geometries.bulb, undefined, bins.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial color="#ffd89a" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
