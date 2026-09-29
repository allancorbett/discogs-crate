"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { QualityGovernor, type QualityLevel } from "@/lib/shop/quality";

interface Pipeline {
  composer: EffectComposer;
  ao: GTAOPass;
  bloom: UnrealBloomPass;
}

/** Switches the optional passes to match a quality level. */
function enablePasses(pipeline: Pipeline, quality: QualityLevel) {
  pipeline.ao.enabled = quality.ambientOcclusion;
  pipeline.bloom.enabled = quality.bloom;
}

interface Props {
  quality: QualityLevel;
  onQualityChange: (level: QualityLevel) => void;
  touch: boolean;
  /** Where the governor starts on the quality ladder. */
  startLevel: number;
  /** Renders one finished frame on demand, for the snapshot button. */
  renderRef: RefObject<(() => void) | null>;
}

/**
 * Everything between the scene and the screen: soft shadows, a faint room
 * reflection in anything glossy, ambient occlusion where things meet, bloom
 * round the bulbs and the neon, filmic tone mapping and a vignette.
 *
 * It takes over rendering from R3F (a frame callback at priority 1), and
 * watches its own frame times, stepping the expensive parts down on a device
 * that can't keep up.
 */
export function PostFX({ quality, onQualityChange, touch, startLevel, renderRef }: Props) {
  const { gl, scene, camera, size, setDpr } = useThree();
  // The renderer and scene are configured imperatively; read them through
  // `get` so what gets changed is the live object, not a render-time value.
  const get = useThree((state) => state.get);

  // Filmic response and a reflection environment, set once.
  useEffect(() => {
    const { gl, scene } = get();
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    // Filtered PCF; the lights set a blur radius for soft edges.
    gl.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.16;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [get]);

  const pipeline = useMemo<Pipeline>(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    const ao = new GTAOPass(scene, camera, 1, 1);
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1, scale: 1 });
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.82);
    const output = new OutputPass();
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.95;
    vignette.uniforms.darkness.value = 1.15;
    composer.addPass(render);
    composer.addPass(ao);
    composer.addPass(bloom);
    composer.addPass(output);
    composer.addPass(vignette);
    return { composer, ao, bloom };
  }, [gl, scene, camera]);

  useEffect(() => () => pipeline.composer.dispose(), [pipeline]);

  // Apply whichever quality level the governor has settled on.
  useEffect(() => {
    const { gl, scene } = get();
    enablePasses(pipeline, quality);
    setDpr(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
    if (gl.shadowMap.enabled === quality.shadows) return;
    gl.shadowMap.enabled = quality.shadows;
    // Materials compiled with or without shadows need recompiling — costly,
    // so only when that is what actually changed.
    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material]) m.needsUpdate = true;
    });
  }, [get, pipeline, quality, setDpr]);

  useEffect(() => {
    const ratio = gl.getPixelRatio();
    pipeline.composer.setPixelRatio(ratio);
    pipeline.composer.setSize(size.width, size.height);
  }, [gl, pipeline, size.width, size.height, quality]);

  const governor = useMemo(() => new QualityGovernor(touch, startLevel), [touch, startLevel]);

  useEffect(() => {
    renderRef.current = () => pipeline.composer.render();
    return () => {
      renderRef.current = null;
    };
  }, [pipeline, renderRef]);

  useFrame((state, delta) => {
    pipeline.composer.render(delta);
    const next = governor.sample(delta * 1000, state.clock.elapsedTime * 1000);
    if (next) onQualityChange(next);
  }, 1);

  return null;
}
