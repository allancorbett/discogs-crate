"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BIN_HEIGHT, CRATE, type ShopLayout } from "@/lib/shop/layout";
import { sleeveColour } from "@/lib/shop/palette";
import { SLEEVE, sleevePose } from "@/lib/shop/sleeves";
import { tag } from "../interact";
import { darkOak, metreUVs, pine, woodBox } from "../materials";

/**
 * Everything there is one of per bin or per crate, drawn as instances: a shop
 * with a thousand crates is still a handful of draw calls. The crates close to
 * you get their sleeves drawn again in detail by CrateDetail, which is why the
 * far sleeves here skip them.
 */

/** A rounded slat, positioned, UVs in metres so the grain is to scale. */
function slat(w: number, h: number, d: number, x: number, y: number, z: number) {
  const geometry = metreUVs(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.35), {
    width: w,
    height: h,
    depth: d,
  });
  geometry.translate(x, y, z);
  return geometry.toNonIndexed();
}

/** A crate end, with a hand-hole cut through it near the top. */
function crateEnd(x: number) {
  const { depth: d, height: h } = CRATE;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(d / 2, h);
  shape.lineTo(-d / 2, h);
  shape.closePath();

  const hole = new THREE.Path();
  const hw = 0.045;
  const hy = h - 0.045;
  const r = 0.014;
  hole.absarc(-hw, hy, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  hole.absarc(hw, hy, r, -Math.PI / 2, Math.PI / 2, false);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 1,
    curveSegments: 6,
  });
  // Extruded along +z; stand it up across the crate's width.
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x, 0, 0);
  // Planar UVs from extrusion are in metres already, and it is unindexed.
  return geometry;
}

function crateGeometry() {
  const { width: w, depth: d } = CRATE;
  const t = 0.016;
  const inner = w - t * 2 - 0.004;
  return mergeGeometries([
    crateEnd(-w / 2),
    crateEnd(w / 2 - t),
    slat(inner, 0.014, d - 0.004, 0, 0.007, 0),
    // Back: two slats with a gap, as real crates are.
    slat(inner, 0.07, t, 0, 0.04, -d / 2 + t / 2),
    slat(inner, 0.07, t, 0, 0.155, -d / 2 + t / 2),
    // Front: one low slat, so flicked sleeves can tip over it.
    slat(inner, 0.085, t, 0, 0.048, d / 2 - t / 2),
  ])!;
}

/**
 * A record-shop browser: a stained-oak cabinet on a recessed plinth, with a
 * raised rail round the top to keep the crates on.
 */
function binGeometry(length: number, depth: number) {
  const body = BIN_HEIGHT - 0.12;
  const parts = [
    woodBox(length - 0.08, 0.1, depth - 0.08, 0, 0.05, 0),
    woodBox(length, body, depth, 0, 0.1 + body / 2, 0),
    // Top board, overhanging.
    woodBox(length + 0.05, 0.022, depth + 0.05, 0, BIN_HEIGHT - 0.011, 0),
    // Rails along both long edges and a divider down the middle.
    woodBox(length + 0.05, 0.035, 0.02, 0, BIN_HEIGHT + 0.017, depth / 2 + 0.015),
    woodBox(length + 0.05, 0.035, 0.02, 0, BIN_HEIGHT + 0.017, -depth / 2 - 0.015),
    woodBox(length, 0.06, 0.018, 0, BIN_HEIGHT + 0.03, 0),
  ];
  // Raised panels on both faces: a frame of moulding round each bay.
  const bays = 3;
  const bayWidth = (length - 0.12) / bays;
  for (let b = 0; b < bays; b++) {
    const x = -length / 2 + 0.06 + bayWidth * (b + 0.5);
    for (const side of [1, -1]) {
      parts.push(woodBox(bayWidth - 0.08, body - 0.14, 0.012, x, 0.1 + body / 2, side * (depth / 2 + 0.006)));
    }
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
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
}

export function Bins({ layout, near, away }: Props) {
  const { crates, bins } = layout;
  const binMesh = useRef<THREE.InstancedMesh>(null);
  const crateMesh = useRef<THREE.InstancedMesh>(null);
  const sleeveMesh = useRef<THREE.InstancedMesh>(null);

  const geometries = useMemo(
    () => ({
      crate: crateGeometry(),
      bin: binGeometry(bins[0]?.width ?? 2, bins[0]?.depth ?? 0.7),
      sleeve: sleeveGeometry(),
    }),
    [bins],
  );
  useLayoutEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries]);

  const materials = useMemo(() => {
    const oak = darkOak();
    const deal = pine();
    return {
      bin: new THREE.MeshStandardMaterial({ ...oak, roughness: 1 }),
      crate: new THREE.MeshStandardMaterial({ ...deal, roughness: 1 }),
      sleeve: new THREE.MeshStandardMaterial({ roughness: 0.55 }),
    };
  }, []);
  useLayoutEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  const sleeveCount = useMemo(
    () => crates.reduce((sum, crate) => sum + crate.albums.length, 0),
    [crates],
  );
  // Sleeve instances are numbered crate by crate; map back through this.
  const sleeveOwners = useMemo(
    () => crates.flatMap((crate) => crate.albums.map(() => crate)),
    [crates],
  );

  useLayoutEffect(() => {
    const mesh = binMesh.current;
    if (!mesh) return;
    bins.forEach((bin, i) => mesh.setMatrixAt(i, matrix.makeTranslation(bin.x, 0, bin.z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
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
    tag(mesh, {
      resolve: (id) => (id === undefined || !crates[id] ? null : { kind: "crate", crate: crates[id] }),
    });
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
    tag(mesh, {
      resolve: (id) =>
        id === undefined || !sleeveOwners[id] ? null : { kind: "crate", crate: sleeveOwners[id] },
    });
  }, [crates, near, away, sleeveOwners]);

  return (
    <group>
      <instancedMesh
        ref={binMesh}
        args={[geometries.bin, materials.bin, bins.length]}
        castShadow
        receiveShadow
      />
      {crates.length > 0 ? (
        <instancedMesh
          ref={crateMesh}
          args={[geometries.crate, materials.crate, crates.length]}
          castShadow
          receiveShadow
        />
      ) : null}
      {sleeveCount > 0 ? (
        <instancedMesh
          ref={sleeveMesh}
          args={[geometries.sleeve, materials.sleeve, sleeveCount]}
          castShadow
        />
      ) : null}
    </group>
  );
}
