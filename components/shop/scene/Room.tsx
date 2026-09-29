"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Album } from "@/lib/discogs/types";
import type { ShopLayout } from "@/lib/shop/layout";
import { floorboards, neonSign, tartan } from "../textures";
import { Sleeve } from "./Vinyl";

const WALL = "#6e5a45";
const WAINSCOT = "#1f3a2c";
const WAINSCOT_HEIGHT = 1.1;

interface Props {
  layout: ShopLayout;
  username: string;
  /** Tapping open floor walks you there. */
  onFloorTap: (event: ThreeEvent<MouseEvent>) => void;
  /** A few records framed on the walls. */
  posters: Album[];
}

/**
 * The shop itself: boards, panelled walls, the counter in the back corner, a
 * rainy window, the owner's name in neon, fairy lights, a tartan rug. Nothing
 * here moves except the rain, the lights and the neon's flicker.
 */
export function Room({ layout, username, posters, onFloorTap }: Props) {
  const { width, depth, height } = layout.room;

  const floor = useMemo(() => {
    const texture = floorboards().clone();
    texture.repeat.set(width / 2.2, depth / 2.2);
    texture.needsUpdate = true;
    return texture;
  }, [width, depth]);
  useEffect(() => () => floor.dispose(), [floor]);

  const walls: { position: [number, number, number]; rotation: number; length: number }[] = [
    { position: [0, 0, -depth / 2], rotation: 0, length: width },
    { position: [0, 0, depth / 2], rotation: Math.PI, length: width },
    { position: [-width / 2, 0, 0], rotation: Math.PI / 2, length: depth },
    { position: [width / 2, 0, 0], rotation: -Math.PI / 2, length: depth },
  ];

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={onFloorTap}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={floor} roughness={0.85} />
      </mesh>

      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#24170f" roughness={1} />
      </mesh>

      {walls.map((wall, i) => (
        <group key={i} position={wall.position} rotation={[0, wall.rotation, 0]}>
          <mesh position={[0, height / 2, 0]}>
            <planeGeometry args={[wall.length, height]} />
            <meshStandardMaterial color={WALL} roughness={0.95} />
          </mesh>
          <mesh position={[0, WAINSCOT_HEIGHT / 2, 0.02]}>
            <boxGeometry args={[wall.length, WAINSCOT_HEIGHT, 0.04]} />
            <meshStandardMaterial color={WAINSCOT} roughness={0.7} flatShading />
          </mesh>
          <mesh position={[0, WAINSCOT_HEIGHT, 0.05]}>
            <boxGeometry args={[wall.length, 0.05, 0.06]} />
            <meshStandardMaterial color="#3a2415" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.06, 0.05]}>
            <boxGeometry args={[wall.length, 0.12, 0.04]} />
            <meshStandardMaterial color="#2a1a10" />
          </mesh>
        </group>
      ))}

      <Counter layout={layout} />
      <RainyWindow
        position={[-width / 2 + 0.03, 1.6, depth / 2 - 2.6]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Door position={[0, 0, depth / 2 - 0.03]} />
      <Neon
        text={`${username}'s Records`}
        position={[-width / 2 + Math.min(width / 2 - 0.5, 3.2), 2.55, -depth / 2 + 0.04]}
      />
      <FairyLights width={width} z={-depth / 2 + 0.08} y={height - 0.25} />
      <Rug position={[layout.counter.x - 0.2, 0.004, layout.counter.z + 1.5]} />
      <Posters posters={posters} width={width} depth={depth} />
      <Plant position={[-width / 2 + 0.45, 0, -depth / 2 + 0.45]} />
      <Plant position={[width / 2 - 0.45, 0, depth / 2 - 0.45]} scale={1.2} />
      <Plant position={[-width / 2 + 0.25, 0.92, depth / 2 - 2.6]} scale={0.45} />
    </group>
  );
}

function Counter({ layout }: { layout: ShopLayout }) {
  const { counter } = layout;
  const panels = Array.from({ length: Math.floor(counter.width / 0.5) }, (_, i) => i);
  return (
    <group position={[counter.x, 0, counter.z]}>
      <mesh position={[0, (counter.height - 0.04) / 2, 0]}>
        <boxGeometry args={[counter.width, counter.height - 0.04, counter.depth]} />
        <meshStandardMaterial color="#4a2e1c" roughness={0.7} flatShading />
      </mesh>
      {/* Panelled front. */}
      {panels.map((i) => (
        <mesh
          key={i}
          position={[(i - (panels.length - 1) / 2) * 0.5, counter.height / 2, counter.depth / 2 + 0.01]}
        >
          <boxGeometry args={[0.4, counter.height - 0.3, 0.02]} />
          <meshStandardMaterial color="#5a3822" roughness={0.6} flatShading />
        </mesh>
      ))}
      <mesh position={[0, counter.height - 0.02, 0.02]}>
        <boxGeometry args={[counter.width + 0.08, 0.04, counter.depth + 0.1]} />
        <meshStandardMaterial color="#2a1b12" roughness={0.35} />
      </mesh>
      {/* The till. */}
      <group position={[-counter.width / 2 + 1.05, counter.height, -0.05]} rotation={[0, 0.2, 0]}>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[0.32, 0.14, 0.3]} />
          <meshStandardMaterial color="#6b6f5c" roughness={0.5} flatShading />
        </mesh>
        <mesh position={[0, 0.2, -0.06]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.26, 0.14, 0.03]} />
          <meshStandardMaterial color="#4d5243" flatShading />
        </mesh>
      </group>
      {/* The lamp that lights the counter, whose glow follows the record on. */}
      <mesh position={[0, 2.45, 0.3]}>
        <coneGeometry args={[0.28, 0.24, 7, 1, true]} />
        <meshStandardMaterial color="#8a2a1c" side={THREE.DoubleSide} flatShading />
      </mesh>
      <mesh position={[0, 2.36, 0.3]}>
        <icosahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial color="#ffd89a" toneMapped={false} />
      </mesh>
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
    vec3 colour = mix(vec3(0.02, 0.03, 0.06), vec3(0.07, 0.09, 0.14), uv.y);
    float lamp = distance(uv * vec2(1.3, 1.0), vec2(0.95, 0.7));
    colour += vec3(1.0, 0.55, 0.2) * 0.45 * exp(-lamp * lamp * 30.0);
    vec2 cell = floor(uv * vec2(9.0, 5.0));
    float lit = step(0.72, hash(cell)) * step(uv.y, 0.55);
    vec2 inCell = fract(uv * vec2(9.0, 5.0));
    lit *= step(0.25, inCell.x) * step(inCell.x, 0.75) * step(0.3, inCell.y) * step(inCell.y, 0.8);
    colour += vec3(0.9, 0.7, 0.35) * lit * 0.22;

    // Rain falling outside.
    float columns = 90.0;
    float column = floor(uv.x * columns);
    float speed = 0.8 + hash(vec2(column, 3.1)) * 0.8;
    float y = fract(uv.y * 1.6 + uTime * speed + hash(vec2(column, 7.7)));
    float streak = smoothstep(0.0, 0.05, y) * smoothstep(0.25, 0.05, y);
    float thin = smoothstep(0.35, 0.0, abs(fract(uv.x * columns) - 0.5));
    colour += vec3(0.55, 0.65, 0.8) * streak * thin * 0.18;

    // Drops running down the glass.
    vec2 grid = uv * vec2(16.0, 10.0);
    vec2 id = floor(grid);
    float h = hash(id);
    float slide = fract(uTime * (0.05 + h * 0.12) + h);
    vec2 drop = fract(grid) - vec2(0.5 + (h - 0.5) * 0.5, 1.0 - slide);
    float bead = smoothstep(0.1, 0.03, length(drop * vec2(1.0, 0.7))) * step(0.45, h);
    float trail = smoothstep(0.03, 0.0, abs(drop.x)) * step(0.0, drop.y) * step(drop.y, 0.45) * step(0.45, h);
    colour += vec3(0.8, 0.85, 0.95) * (bead * 0.35 + trail * 0.05);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

function RainyWindow(props: { position: [number, number, number]; rotation: [number, number, number] }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((state) => {
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const w = 1.9;
  const h = 1.4;
  return (
    <group {...props}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={rainVertex}
          fragmentShader={rainFragment}
          toneMapped={false}
        />
      </mesh>
      {/* Frame and glazing bars. */}
      {[
        [0, h / 2, w + 0.1, 0.08],
        [0, -h / 2, w + 0.2, 0.1],
        [0, 0, w, 0.04],
      ].map(([x, y, bw, bh], i) => (
        <mesh key={`h${i}`} position={[x, y, 0.03]}>
          <boxGeometry args={[bw, bh, 0.06]} />
          <meshStandardMaterial color="#e7dcc4" roughness={0.6} flatShading />
        </mesh>
      ))}
      {[-w / 2, 0, w / 2].map((x, i) => (
        <mesh key={`v${i}`} position={[x, 0, 0.03]}>
          <boxGeometry args={[i === 1 ? 0.04 : 0.08, h, 0.06]} />
          <meshStandardMaterial color="#e7dcc4" roughness={0.6} flatShading />
        </mesh>
      ))}
      {/* Sill. */}
      <mesh position={[0, -h / 2 - 0.02, 0.12]}>
        <boxGeometry args={[w + 0.3, 0.05, 0.22]} />
        <meshStandardMaterial color="#e7dcc4" roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

function Door({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.08, 0.02]}>
        <boxGeometry args={[1.1, 2.16, 0.06]} />
        <meshStandardMaterial color="#1f3a2c" roughness={0.6} flatShading />
      </mesh>
      <mesh position={[0, 1.45, 0.055]}>
        <planeGeometry args={[0.7, 0.9]} />
        <meshStandardMaterial color="#0d1522" roughness={0.1} metalness={0.4} />
      </mesh>
      <mesh position={[0.4, 1.0, 0.07]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Neon({ text, position }: { text: string; position: [number, number, number] }) {
  const texture = useMemo(() => neonSign(text, "#ff4fa3"), [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Mostly steady, with the odd stutter of an old transformer.
    const stutter = Math.sin(t * 0.7) > 0.985 ? (Math.sin(t * 90) > 0 ? 0.35 : 1) : 1;
    const level = (0.92 + Math.sin(t * 13) * 0.03) * stutter;
    if (material.current) material.current.opacity = level;
    if (light.current) light.current.intensity = 2.2 * level;
  });

  return (
    <group position={position}>
      <mesh>
        <planeGeometry args={[2.8, 0.7]} />
        <meshBasicMaterial
          ref={material}
          map={texture}
          transparent
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight ref={light} color="#ff4fa3" intensity={2.2} distance={4.5} decay={1.6} position={[0, 0, 0.5]} />
    </group>
  );
}

function FairyLights({ width, z, y }: { width: number; z: number; y: number }) {
  const count = Math.max(12, Math.round(width * 4));
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.022, 0), []);
  const colour = useMemo(() => new THREE.Color(), []);

  const positions = useMemo(() => {
    const swags = Math.max(2, Math.round(width / 1.6));
    return Array.from({ length: count }, (_, i) => {
      const u = i / (count - 1);
      const x = -width / 2 + 0.2 + u * (width - 0.4);
      const phase = (u * swags) % 1;
      return new THREE.Vector3(x, y - Math.sin(phase * Math.PI) * 0.22, z);
    });
  }, [count, width, y, z]);

  useEffect(() => {
    const instances = mesh.current;
    if (!instances) return;
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => instances.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    instances.instanceMatrix.needsUpdate = true;
  }, [positions]);

  useFrame((state) => {
    const instances = mesh.current;
    if (!instances) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const twinkle = 0.65 + 0.35 * Math.sin(t * (1.1 + (i % 5) * 0.37) + i * 1.7);
      colour.setRGB(1.6 * twinkle, 1.05 * twinkle, 0.45 * twinkle);
      instances.setColorAt(i, colour);
    }
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Rug({ position }: { position: [number, number, number] }) {
  const texture = useMemo(() => tartan(), []);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0.04]}>
      <planeGeometry args={[2.4, 1.6]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  );
}

function Posters({ posters, width, depth }: { posters: Album[]; width: number; depth: number }) {
  // Two framed sleeves on each side wall, facing into the shop.
  const spots: { position: [number, number, number]; rotation: number }[] = [
    { position: [-width / 2 + 0.06, 1.95, -depth / 2 + 2.4], rotation: Math.PI / 2 },
    { position: [width / 2 - 0.06, 1.95, -depth / 2 + 3.4], rotation: -Math.PI / 2 },
    { position: [-width / 2 + 0.06, 1.95, 0], rotation: Math.PI / 2 },
    { position: [width / 2 - 0.06, 1.95, 0.6], rotation: -Math.PI / 2 },
  ];

  return (
    <>
      {posters.slice(0, spots.length).map((album, i) => (
        <group key={album.id} position={spots[i].position} rotation={[0, spots[i].rotation, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <boxGeometry args={[0.62, 0.62, 0.03]} />
            <meshStandardMaterial color="#17110c" roughness={0.5} />
          </mesh>
          <Sleeve album={album} scale={[1.75, 1.75, 1]} position={[0, 0, 0.01]} />
        </group>
      ))}
    </>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.17, 0.13, 0.36, 7]} />
        <meshStandardMaterial color="#9c4f2e" roughness={0.8} flatShading />
      </mesh>
      {[
        [0, 0.6, 0, 0.28],
        [0.14, 0.78, 0.05, 0.2],
        [-0.12, 0.85, -0.06, 0.22],
        [0.02, 1.02, 0.02, 0.16],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <icosahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={i % 2 ? "#3f6b35" : "#2f5a2b"} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  );
}
