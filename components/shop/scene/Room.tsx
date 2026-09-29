"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { rng } from "@/lib/shop/noise";
import { sleeveColour } from "@/lib/shop/palette";
import {
  brick,
  butcherBlock,
  ceilingBoards,
  darkOak,
  floorOak,
  panelling,
  tartanRug,
  tiled,
  type PbrSet,
} from "../materials";
import { neonSign, signwriting } from "../textures";
import { Sleeve } from "./Vinyl";

const DADO = 1.1;

/** A textured standard material that frees its tiled texture copies with it. */
function useSurface(make: () => PbrSet, repeat: [number, number], extra: THREE.MeshStandardMaterialParameters = {}) {
  const [rx, ry] = repeat;
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ ...tiled(make(), rx, ry), roughness: 1, ...extra }),
    // `extra` is a literal at every call site; the repeat is what varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [make, rx, ry],
  );
  useEffect(
    () => () => {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.dispose();
    },
    [material],
  );
  return material;
}

interface Props {
  layout: ShopLayout;
  username: string;
  /** Records to frame on the walls and stand face-out as staff picks. */
  posters: Album[];
}

/**
 * The shop itself: oak boards, exposed brick above green panelling, dark
 * beams, a rain-streaked shop window with the name in gold leaf, a wall of
 * records, the counter, the owner's name in neon, festoon lights and a tartan
 * rug.
 */
export function Room({ layout, username, posters }: Props) {
  const { width, depth, height } = layout.room;

  const floor = useSurface(floorOak, [width / 2, depth / 2]);
  const ceiling = useSurface(ceilingBoards, [width, depth]);
  const beam = useSurface(darkOak, [1, 1]);

  const walls: { position: [number, number, number]; rotation: number; length: number }[] = [
    { position: [0, 0, -depth / 2], rotation: 0, length: width },
    { position: [0, 0, depth / 2], rotation: Math.PI, length: width },
    { position: [-width / 2, 0, 0], rotation: Math.PI / 2, length: depth },
    { position: [width / 2, 0, 0], rotation: -Math.PI / 2, length: depth },
  ];

  const beams = Math.max(2, Math.round(depth / 2.2));

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={floor} receiveShadow>
        <planeGeometry args={[width, depth]} />
      </mesh>

      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]} material={ceiling}>
        <planeGeometry args={[width, depth]} />
      </mesh>
      {Array.from({ length: beams }, (_, i) => (
        <mesh
          key={i}
          position={[0, height - 0.1, -depth / 2 + (depth / beams) * (i + 0.5)]}
          material={beam}
          castShadow
        >
          <boxGeometry args={[width, 0.2, 0.16]} />
        </mesh>
      ))}

      {walls.map((wall, i) => (
        <Wall key={i} {...wall} height={height} />
      ))}

      <Counter layout={layout} />
      <RecordWall layout={layout} picks={posters.slice(2, 8)} />
      <ShopWindow
        username={username}
        position={[-width / 2 + 0.02, 1.62, depth / 2 - 2.6]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Door position={[0, 0, depth / 2 - 0.02]} />
      <Neon
        text={`${username}'s Records`}
        position={[-width / 2 + Math.min(width / 2 - 0.5, 3.2), 2.45, -depth / 2 + 0.03]}
      />
      <Festoon width={width} z={-depth / 2 + 0.15} y={height - 0.3} />
      <Rug position={[layout.counter.x - 0.2, 0.004, layout.counter.z + 1.5]} />
      <Frames posters={posters.slice(0, 2)} width={width} depth={depth} />
      <Plant position={[-width / 2 + 0.5, 0, -depth / 2 + 0.5]} />
      <Plant position={[-width / 2 + 0.45, 0, depth / 2 - 0.5]} scale={1.15} />
    </group>
  );
}

/** Panelling to the dado rail, brick above, a skirting board at the foot. */
function Wall({
  position,
  rotation,
  length,
  height,
}: {
  position: [number, number, number];
  rotation: number;
  length: number;
  height: number;
}) {
  const brickHeight = height - DADO;
  const bricks = useSurface(brick, [length / 1.2, brickHeight / 1.2]);
  const panels = useSurface(panelling, [length, DADO]);
  const trim = useSurface(darkOak, [length, 1]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, DADO + brickHeight / 2, 0]} material={bricks} receiveShadow>
        <planeGeometry args={[length, brickHeight]} />
      </mesh>
      <mesh position={[0, DADO / 2, 0.015]} material={panels} receiveShadow>
        <boxGeometry args={[length, DADO, 0.03]} />
      </mesh>
      <mesh position={[0, DADO, 0.04]} material={trim} castShadow>
        <boxGeometry args={[length, 0.06, 0.05]} />
      </mesh>
      <mesh position={[0, 0.07, 0.04]} material={trim}>
        <boxGeometry args={[length, 0.14, 0.03]} />
      </mesh>
    </group>
  );
}

function Counter({ layout }: { layout: ShopLayout }) {
  const { counter } = layout;
  const carcass = useSurface(darkOak, [counter.width, 1]);
  const top = useSurface(butcherBlock, [counter.width / 0.8, 1]);
  const brass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c09a48", metalness: 1, roughness: 0.28 }),
    [],
  );
  const panels = Array.from({ length: Math.floor(counter.width / 0.55) }, (_, i) => i);

  return (
    <group position={[counter.x, 0, counter.z]}>
      <mesh position={[0, (counter.height - 0.05) / 2, 0]} material={carcass} castShadow receiveShadow>
        <boxGeometry args={[counter.width, counter.height - 0.05, counter.depth]} />
      </mesh>
      {panels.map((i) => (
        <mesh
          key={i}
          position={[(i - (panels.length - 1) / 2) * 0.55, counter.height / 2, counter.depth / 2 + 0.008]}
          material={carcass}
          castShadow
        >
          <boxGeometry args={[0.45, counter.height - 0.32, 0.016]} />
        </mesh>
      ))}
      <mesh position={[0, counter.height - 0.025, 0.03]} material={top} castShadow receiveShadow>
        <boxGeometry args={[counter.width + 0.08, 0.05, counter.depth + 0.1]} />
      </mesh>
      {/* Brass foot rail on its brackets. */}
      <mesh position={[0, 0.16, counter.depth / 2 + 0.1]} rotation={[0, 0, Math.PI / 2]} material={brass} castShadow>
        <cylinderGeometry args={[0.022, 0.022, counter.width - 0.1, 20]} />
      </mesh>
      {[-1, 0, 1].map((k) => (
        <mesh key={k} position={[k * (counter.width / 2 - 0.2), 0.16, counter.depth / 2 + 0.05]} rotation={[Math.PI / 2, 0, 0]} material={brass}>
          <cylinderGeometry args={[0.01, 0.01, 0.1, 10]} />
        </mesh>
      ))}
      <Till position={[-counter.width / 2 + 1.05, counter.height, -0.08]} brass={brass} />
    </group>
  );
}

/** An old cash register: enamelled body, rows of chrome keys, a raised display. */
function Till({ position, brass }: { position: [number, number, number]; brass: THREE.Material }) {
  const body = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2d4a3a", metalness: 0.4, roughness: 0.35 }),
    [],
  );
  const keys = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = keys.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        m.makeTranslation(-0.1 + col * 0.04, 0.115 + row * 0.018, 0.1 - row * 0.035);
        mesh.setMatrixAt(n++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group position={position} rotation={[0, 0.25, 0]}>
      <mesh position={[0, 0.06, 0]} material={body} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.12, 0.34]} />
      </mesh>
      <mesh position={[0, 0.1, 0.04]} rotation={[0.45, 0, 0]} material={body} castShadow>
        <boxGeometry args={[0.32, 0.03, 0.22]} />
      </mesh>
      <instancedMesh ref={keys} args={[undefined, brass, 18]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.012, 14]} />
      </instancedMesh>
      <mesh position={[0, 0.22, -0.12]} material={body} castShadow>
        <boxGeometry args={[0.24, 0.12, 0.06]} />
      </mesh>
      <mesh position={[0, 0.235, -0.089]}>
        <planeGeometry args={[0.18, 0.05]} />
        <meshStandardMaterial color="#141008" emissive="#ffb347" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Shelving down the right-hand wall, three shelves deep in spines, with a top
 * ledge of face-out staff picks from the collection.
 */
function RecordWall({ layout, picks }: { layout: ShopLayout; picks: Album[] }) {
  const { wallShelf: box, room } = layout;
  const wood = useSurface(darkOak, [box.depth, 1]);
  const spines = useRef<THREE.InstancedMesh>(null);

  const shelves = [0.06, 0.46, 0.86, 1.26, 1.66];
  const spineRows = shelves.slice(0, 4);
  const perRow = Math.max(0, Math.floor((box.depth - 0.1) / 0.0062));
  const count = perRow * spineRows.length;

  useLayoutEffect(() => {
    const mesh = spines.current;
    if (!mesh || count === 0) return;
    const random = rng(97);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const y of spineRows) {
      let z = box.z - box.depth / 2 + 0.05;
      for (let i = 0; i < perRow; i++) {
        const thick = 0.0035 + random() * 0.0025;
        // Now and then a small gap, and a record leaning into it.
        const lean = random() < 0.02 ? 0.18 : 0;
        if (lean) z += 0.04;
        m.makeRotationX(lean).setPosition(box.x + 0.02, y + 0.02 + 0.155, z);
        m.scale(new THREE.Vector3(1, 0.97 + random() * 0.03, thick / 0.005));
        mesh.setMatrixAt(n, m);
        const pick = random();
        if (pick < 0.12) c.set("#f2eee6");
        else if (pick < 0.3) c.set("#141414");
        else {
          const [r, g, b] = sleeveColour(Math.floor(random() * 1e6));
          c.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
        }
        mesh.setColorAt(n, c);
        n++;
        z += thick + 0.0008;
        if (z > box.z + box.depth / 2 - 0.05) break;
      }
      while (n % perRow !== 0) mesh.setMatrixAt(n++, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [box, count, perRow, spineRows]);

  if (box.depth <= 0.5) return null;

  const uprights = Math.max(2, Math.round(box.depth / 1.2) + 1);
  const ledgeY = 2.06;

  return (
    <group>
      {shelves.map((y) => (
        <mesh key={y} position={[box.x, y, box.z]} material={wood} castShadow receiveShadow>
          <boxGeometry args={[box.width, 0.025, box.depth]} />
        </mesh>
      ))}
      <mesh position={[box.x - 0.02, ledgeY, box.z]} material={wood} castShadow receiveShadow>
        <boxGeometry args={[box.width - 0.1, 0.025, box.depth]} />
      </mesh>
      {Array.from({ length: uprights }, (_, i) => (
        <mesh
          key={i}
          position={[box.x, ledgeY / 2 + 0.03, box.z - box.depth / 2 + (box.depth / (uprights - 1)) * i]}
          material={wood}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[box.width, ledgeY + 0.06, 0.03]} />
        </mesh>
      ))}
      {count > 0 ? (
        <instancedMesh ref={spines} args={[undefined, undefined, count]} castShadow receiveShadow>
          <boxGeometry args={[0.31, 0.31, 0.005]} />
          <meshStandardMaterial roughness={0.5} />
        </instancedMesh>
      ) : null}
      {/* Staff picks, face out along the top, leaning on the wall. */}
      {picks.map((album, i) => {
        const spacing = box.depth / Math.max(picks.length, 1);
        const z = box.z - box.depth / 2 + spacing * (i + 0.5);
        return (
          <Sleeve
            key={album.id}
            album={album}
            position={[room.width / 2 - 0.1, ledgeY + 0.17, z]}
            rotation={[0, -Math.PI / 2, 0.12]}
          />
        );
      })}
    </group>
  );
}

const rainVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const rainFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    // A wet night: navy sky, a sodium streetlamp, lit windows across the road.
    vec3 colour = mix(vec3(0.004, 0.006, 0.014), vec3(0.018, 0.024, 0.045), uv.y);
    float lamp = distance(uv * vec2(1.3, 1.0), vec2(0.95, 0.7));
    colour += vec3(1.0, 0.45, 0.12) * 0.5 * exp(-lamp * lamp * 30.0);
    vec2 cell = floor(uv * vec2(9.0, 5.0));
    float lit = step(0.72, hash(cell)) * step(uv.y, 0.55);
    vec2 inCell = fract(uv * vec2(9.0, 5.0));
    lit *= step(0.25, inCell.x) * step(inCell.x, 0.75) * step(0.3, inCell.y) * step(inCell.y, 0.8);
    colour += vec3(0.9, 0.6, 0.25) * lit * 0.12;

    // Rain falling outside.
    float columns = 90.0;
    float column = floor(uv.x * columns);
    float speed = 0.8 + hash(vec2(column, 3.1)) * 0.8;
    float y = fract(uv.y * 1.6 + uTime * speed + hash(vec2(column, 7.7)));
    float streak = smoothstep(0.0, 0.05, y) * smoothstep(0.25, 0.05, y);
    float thin = smoothstep(0.35, 0.0, abs(fract(uv.x * columns) - 0.5));
    colour += vec3(0.4, 0.5, 0.65) * streak * thin * 0.08;

    // Drops running down the glass, catching the shop's own light.
    vec2 grid = uv * vec2(16.0, 10.0);
    vec2 id = floor(grid);
    float h = hash(id);
    float slide = fract(uTime * (0.05 + h * 0.12) + h);
    vec2 drop = fract(grid) - vec2(0.5 + (h - 0.5) * 0.5, 1.0 - slide);
    float bead = smoothstep(0.1, 0.03, length(drop * vec2(1.0, 0.7))) * step(0.45, h);
    float trail = smoothstep(0.03, 0.0, abs(drop.x)) * step(0.0, drop.y) * step(drop.y, 0.45) * step(0.45, h);
    colour += vec3(0.9, 0.75, 0.55) * (bead * 0.18 + trail * 0.03);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

/** The shop front: rain on the glass, and the name in gold leaf, reversed. */
function ShopWindow({
  username,
  ...props
}: {
  username: string;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const lettering = useMemo(() => signwriting(`${username}'s Records`), [username]);
  useEffect(() => () => lettering.dispose(), [lettering]);
  const paint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.35 }),
    [],
  );
  const iron = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8e3da", roughness: 0.25, metalness: 0.1 }),
    [],
  );

  useFrame((state) => {
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const w = 2;
  const h = 1.5;
  return (
    <group {...props}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <shaderMaterial ref={material} uniforms={uniforms} vertexShader={rainVertex} fragmentShader={rainFragment} />
      </mesh>
      {/* Glass, catching reflections of the room. */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[w, h]} />
        <meshPhysicalMaterial color="#0b0f16" transparent opacity={0.25} roughness={0.04} clearcoat={1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.3, 0.015]}>
        <planeGeometry args={[1.7, 0.42]} />
        <meshStandardMaterial map={lettering} transparent metalness={1} roughness={0.28} color="#e8c46a" depthWrite={false} />
      </mesh>
      {[
        [0, h / 2 + 0.04, w + 0.16, 0.08],
        [0, -h / 2 - 0.04, w + 0.16, 0.08],
        [0, -0.12, w, 0.035],
      ].map(([x, y, bw, bh], i) => (
        <mesh key={`h${i}`} position={[x, y, 0.035]} material={paint} castShadow>
          <boxGeometry args={[bw, bh, 0.07]} />
        </mesh>
      ))}
      {[-w / 2 - 0.04, -w / 6, w / 6, w / 2 + 0.04].map((x, i) => (
        <mesh key={`v${i}`} position={[x, 0, 0.035]} material={paint} castShadow>
          <boxGeometry args={[i === 0 || i === 3 ? 0.08 : 0.035, h, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, -h / 2 - 0.09, 0.12]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[w + 0.3, 0.05, 0.24]} />
      </mesh>
      {/* A cast-iron radiator under the sill. */}
      <group position={[0, -h / 2 - 0.62, 0.12]}>
        {Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[(i - 7.5) * 0.075, 0, 0]} material={iron} castShadow>
            <boxGeometry args={[0.05, 0.55, 0.14]} />
          </mesh>
        ))}
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]} material={iron}>
          <cylinderGeometry args={[0.02, 0.02, 1.25, 12]} />
        </mesh>
      </group>
    </group>
  );
}

function Door({ position }: { position: [number, number, number] }) {
  const paint = useMemo(
    () => new THREE.MeshStandardMaterial({ ...tiled(panelling(), 1, 2), roughness: 1 }),
    [],
  );
  const brass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c09a48", metalness: 1, roughness: 0.25 }),
    [],
  );
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.1, 0.03]} material={paint} castShadow receiveShadow>
        <boxGeometry args={[1.05, 2.2, 0.06]} />
      </mesh>
      <mesh position={[0, 1.5, 0.062]}>
        <planeGeometry args={[0.72, 0.95]} />
        <meshPhysicalMaterial color="#060a10" roughness={0.03} clearcoat={1} />
      </mesh>
      <mesh position={[0.4, 1.0, 0.09]} material={brass}>
        <sphereGeometry args={[0.035, 20, 14]} />
      </mesh>
      <mesh position={[0, 0.75, 0.064]} material={brass}>
        <boxGeometry args={[0.3, 0.06, 0.006]} />
      </mesh>
    </group>
  );
}

/** Neon tube lettering on a smoked acrylic panel, glowing (bloom does the halo). */
function Neon({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useMemo(() => neonSign(text, "#ff4fa3"), [text]);
  const glow = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Over 1 so the bloom picks the tubes out.
    material.color.setScalar(1.35);
    return material;
  }, [texture]);
  useEffect(
    () => () => {
      texture.dispose();
      glow.dispose();
    },
    [texture, glow],
  );
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Mostly steady, with the odd stutter of an old transformer.
    const stutter = Math.sin(t * 0.7) > 0.985 ? (Math.sin(t * 90) > 0 ? 0.35 : 1) : 1;
    const level = (0.94 + Math.sin(t * 13) * 0.03) * stutter;
    glow.color.setScalar(1.35 * level);
    if (light.current) light.current.intensity = 1.8 * level;
  });

  return (
    <group position={position}>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[2.9, 0.78, 0.012]} />
        <meshPhysicalMaterial color="#0c0c10" transparent opacity={0.55} roughness={0.08} clearcoat={1} />
      </mesh>
      {[
        [-1.35, 0.33],
        [1.35, 0.33],
        [-1.35, -0.33],
        [1.35, -0.33],
      ].map(([x, y]) => (
        <mesh key={`${x}${y}`} position={[x, y, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.03, 12]} />
          <meshStandardMaterial color="#d8d8dc" metalness={1} roughness={0.15} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.03]} material={glow}>
        <planeGeometry args={[2.8, 0.7]} />
      </mesh>
      <pointLight ref={light} color="#ff4fa3" intensity={1.8} distance={4.5} decay={1.8} position={[0, 0, 0.5]} />
    </group>
  );
}

/** Edison bulbs on a sagging cable along the back wall. */
function Festoon({ width, z, y }: { width: number; z: number; y: number }) {
  const count = Math.max(10, Math.round(width * 2.2));
  const mesh = useRef<THREE.InstancedMesh>(null);
  const swags = Math.max(2, Math.round(width / 1.8));

  const { points, cable } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const samples = 200;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const phase = (u * swags) % 1;
      pts.push(new THREE.Vector3(-width / 2 + 0.2 + u * (width - 0.4), y - Math.sin(phase * Math.PI) * 0.25, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const bulbs = Array.from({ length: count }, (_, i) => curve.getPointAt((i + 0.5) / count));
    return { points: bulbs, cable: new THREE.TubeGeometry(curve, 400, 0.004, 6, false) };
  }, [count, swags, width, y, z]);
  useEffect(() => () => cable.dispose(), [cable]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#fff3dc", emissive: "#ffb45e", emissiveIntensity: 1.6 }),
    [],
  );

  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    const m = new THREE.Matrix4();
    points.forEach((p, i) => instances.setMatrixAt(i, m.makeTranslation(p.x, p.y - 0.05, p.z)));
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
  }, [points]);

  const colour = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const instances = mesh.current;
    if (!instances) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const flicker = 0.85 + 0.15 * Math.sin(t * (1.1 + (i % 5) * 0.37) + i * 1.7);
      instances.setColorAt(i, colour.setScalar(flicker));
    }
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <mesh geometry={cable}>
        <meshStandardMaterial color="#141414" roughness={0.6} />
      </mesh>
      <instancedMesh ref={mesh} args={[undefined, material, count]}>
        <sphereGeometry args={[0.028, 16, 12]} />
      </instancedMesh>
    </group>
  );
}

function Rug({ position }: { position: [number, number, number] }) {
  const wool = useSurface(tartanRug, [3, 2]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0.04]} material={wool} receiveShadow>
      <planeGeometry args={[2.4, 1.6]} />
    </mesh>
  );
}

/** Two framed sleeves on the left-hand wall, beyond the window. */
function Frames({ posters, width, depth }: { posters: Album[]; width: number; depth: number }) {
  const frame = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#16110c", roughness: 0.4, metalness: 0.1 }),
    [],
  );
  const mount = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f3eee4", roughness: 0.9 }), []);
  return (
    <>
      {posters.map((album, i) => (
        <group
          key={album.id}
          position={[-width / 2 + 0.03, 2.0, -depth / 2 + 2.2 + i * 1.3]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <mesh position={[0, 0, 0.012]} material={frame} castShadow>
            <boxGeometry args={[0.72, 0.72, 0.03]} />
          </mesh>
          <mesh position={[0, 0, 0.028]} material={mount}>
            <planeGeometry args={[0.64, 0.64]} />
          </mesh>
          <Sleeve album={album} scale={[1.55, 1.55, 1]} position={[0, 0, 0.034]} />
        </group>
      ))}
    </>
  );
}

/** A leggy fiddle-leaf fig in a terracotta pot. */
function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const leaves = useRef<THREE.InstancedMesh>(null);
  const pot = useMemo(() => {
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.13, 0),
      new THREE.Vector2(0.17, 0.34),
      new THREE.Vector2(0.185, 0.36),
      new THREE.Vector2(0.185, 0.4),
      new THREE.Vector2(0.165, 0.4),
      new THREE.Vector2(0.16, 0.36),
    ];
    return new THREE.LatheGeometry(profile, 32);
  }, []);
  useEffect(() => () => pot.dispose(), [pot]);

  const count = 26;
  useLayoutEffect(() => {
    const mesh = leaves.current;
    if (!mesh) return;
    const random = rng(Math.round(position[0] * 100 + position[2] * 7));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const up = 0.55 + (i / count) * 0.75;
      const around = i * 2.4;
      const out = 0.1 + random() * 0.08;
      e.set(-0.5 - random() * 0.5, around, 0, "YXZ");
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(Math.sin(around) * out, up, Math.cos(around) * out),
        q,
        // A broad, flat, fiddle-shaped leaf.
        new THREE.Vector3(0.62, 0.1, 1.3),
      );
      mesh.setMatrixAt(i, m);
      c.setHSL(0.28 + random() * 0.04, 0.45, 0.18 + random() * 0.08);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [position]);

  return (
    <group position={position} scale={scale}>
      <mesh geometry={pot} castShadow receiveShadow>
        <meshStandardMaterial color="#a4583a" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.01, 24]} />
        <meshStandardMaterial color="#2b1d12" roughness={1} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.012, 0.016, 0.85, 8]} />
        <meshStandardMaterial color="#4a3a24" roughness={0.9} />
      </mesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, count]} castShadow>
        <sphereGeometry args={[0.09, 12, 8]} />
        <meshStandardMaterial roughness={0.55} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
