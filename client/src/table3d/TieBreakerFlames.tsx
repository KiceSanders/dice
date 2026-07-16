import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { FLAME_CARDS, FLAME_LIGHT, FLAME_RING, FLAME_RING_COLORS, flameCards } from './flameRing';

/**
 * Two additive layers make the fire read volumetric from the fixed camera
 * (the classic cheap-game-fire recipe — billboarded cards over an ember
 * shell — rather than raymarched volume fire, which Chromebook-class GPUs
 * can't afford):
 *
 * 1. An ember shell hugging the apron (seamless 3D-noise fbm on a cylinder).
 * 2. Instanced camera-facing flame cards in two staggered rows — parallax
 *    between the rows gives depth, and cards never go edge-on at the ring's
 *    sides the way a lone cylinder does. The camera never moves (SEAT_VIEW),
 *    so facing is baked into the instance matrices once.
 *
 * Purely aesthetic shaping literals live in the GLSL; placement/motion
 * constants are in flameRing.ts where tests pin them.
 */
const SHELL_VERTEX = /* glsl */ `
  uniform float uHeight;
  varying float vAngle;
  varying float vH;

  void main() {
    vAngle = atan(position.z, position.x);
    vH = position.y / uHeight + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise3(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }
`;

const SHELL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uTongues;
  uniform float uNoiseScale;
  uniform float uVerticalScale;
  uniform float uScrollSpeed;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uTip;
  varying float vAngle;
  varying float vH;

  ${NOISE_GLSL}

  void main() {
    vec3 domain = vec3(cos(vAngle), sin(vAngle), 0.0) * uNoiseScale;
    domain.z = vH * uVerticalScale - uTime * uScrollSpeed;
    float n = fbm(domain);

    // Angular comb → discrete tongues; the noise term makes them wander.
    float tongue = 0.72 + 0.28 * sin(vAngle * uTongues + n * 4.0);
    // Solid at the base, noise-eroded toward the tips.
    float body = n * 1.5 * tongue - (0.22 + vH * vH * 1.55);
    float alpha = smoothstep(0.0, 0.3, body);
    // Dissolve before the geometry's bottom edge — behind the apron, so the
    // shell never shows a flat cutoff line.
    alpha *= smoothstep(0.0, 0.2, vH);
    if (alpha < 0.01) discard;

    vec3 color = mix(uDeep, uMid, clamp(body * 2.2, 0.0, 1.0));
    color = mix(color, uTip, clamp((body - 0.32) * 2.4, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

const CARD_VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;

  void main() {
    vUv = uv;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const CARD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uScrollSpeed;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uTip;
  varying vec2 vUv;
  varying float vSeed;

  ${NOISE_GLSL}

  void main() {
    vec2 p = vec2(vUv.x - 0.5, vUv.y);
    float scroll = uTime * uScrollSpeed;
    // Sway grows with height; the seed decorrelates neighbouring cards.
    float sway = (fbm(vec3(vSeed * 37.0, p.y * 2.2 - scroll, 0.0)) - 0.5) * 0.5 * p.y;
    float x = p.x - sway;
    float n = fbm(vec3(x * 3.5 + vSeed * 61.0, p.y * 2.8 - scroll, vSeed * 7.0));

    // Teardrop envelope: wide bright base narrowing to a flickering tip.
    float halfWidth = 0.34 * (1.0 - 0.72 * p.y) + 0.02;
    float radial = 1.0 - abs(x) / halfWidth;
    float body = radial * (0.62 + 0.55 * n) - p.y * 0.5 - 0.18;
    // Alpha reaches zero exactly at the card's bottom and top edges — no
    // cutoff lines; the root fade happens behind/below the apron lip.
    body *= smoothstep(0.0, 0.14, p.y);
    body *= 1.0 - smoothstep(0.85, 1.0, p.y);
    float alpha = smoothstep(0.02, 0.4, body);
    if (alpha < 0.01) discard;

    vec3 color = mix(uDeep, uMid, clamp(body * 2.4, 0.0, 1.0));
    color = mix(color, uTip, clamp((body - 0.4) * 2.6, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Frozen-time fallback so reduced-motion users still see a (static) fire state. */
const REDUCED_MOTION_TIME = 1.7;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fireColorUniforms() {
  return {
    uDeep: { value: new THREE.Color(FLAME_RING_COLORS.deep) },
    uMid: { value: new THREE.Color(FLAME_RING_COLORS.mid) },
    uTip: { value: new THREE.Color(FLAME_RING_COLORS.tip) },
  };
}

/**
 * Purely cosmetic fire shown while a tie-breaker sub-round is active, rising
 * from under the table and licking up around its sides. Lives in SceneContent
 * beside PokerTableMesh — always mounted regardless of which dice renderer is
 * up, so roller, spectators, and the between-turns view all see it. Additive,
 * depth-tested (the table occludes the far side naturally), never writes
 * depth. Placement is framing-tested via flameRing.test.ts.
 */
export default function TieBreakerFlames() {
  const shellRef = useRef<THREE.ShaderMaterial>(null);
  const cardsRef = useRef<THREE.InstancedMesh>(null);
  const cardMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const cards = useMemo(() => flameCards(), []);
  const cardSeeds = useMemo(() => new Float32Array(cards.map((card) => card.seed)), [cards]);

  const shellUniforms = useMemo(
    () => ({
      uTime: { value: REDUCED_MOTION_TIME },
      uHeight: { value: FLAME_RING.topY - FLAME_RING.baseY },
      uTongues: { value: FLAME_RING.tongues },
      uNoiseScale: { value: FLAME_RING.noiseScale },
      uVerticalScale: { value: FLAME_RING.verticalScale },
      uScrollSpeed: { value: FLAME_RING.scrollSpeed },
      ...fireColorUniforms(),
    }),
    [],
  );

  const cardUniforms = useMemo(
    () => ({
      uTime: { value: REDUCED_MOTION_TIME },
      uScrollSpeed: { value: FLAME_RING.scrollSpeed },
      ...fireColorUniforms(),
    }),
    [],
  );

  // The camera is fixed, so instance transforms are baked exactly once.
  useLayoutEffect(() => {
    const mesh = cardsRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    cards.forEach((card, i) => {
      dummy.position.set(card.x, FLAME_CARDS.baseY + card.height / 2, card.z);
      dummy.rotation.set(0, card.yaw, 0);
      dummy.scale.set(card.width, card.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cards]);

  useFrame(({ clock }) => {
    if (prefersReducedMotion()) return;
    const t = clock.elapsedTime;
    const shellTime = shellRef.current?.uniforms.uTime;
    if (shellTime) shellTime.value = t;
    const cardTime = cardMaterialRef.current?.uniforms.uTime;
    if (cardTime) cardTime.value = t;
    if (lightRef.current) {
      lightRef.current.intensity =
        FLAME_LIGHT.baseIntensity + 0.25 * Math.sin(t * 7.3) + 0.15 * Math.sin(t * 11.7);
    }
  });

  const shellHeight = FLAME_RING.topY - FLAME_RING.baseY;
  const shellCenterY = (FLAME_RING.topY + FLAME_RING.baseY) / 2;

  return (
    <group>
      {/* Ember shell hugging the apron. */}
      <mesh position={[0, shellCenterY, 0]} frustumCulled={false}>
        <cylinderGeometry
          args={[
            FLAME_RING.radius,
            FLAME_RING.radius,
            shellHeight,
            FLAME_RING.radialSegments,
            1,
            true,
          ]}
        />
        <shaderMaterial
          ref={shellRef}
          vertexShader={SHELL_VERTEX}
          fragmentShader={SHELL_FRAGMENT}
          uniforms={shellUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Licking tongues: camera-facing instanced cards, two staggered rows.
          Instance matrices place the cards; culling must not use the unit
          plane's bounds. */}
      <instancedMesh
        ref={cardsRef}
        args={[undefined, undefined, cards.length]}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]}>
          <instancedBufferAttribute attach="attributes-aSeed" args={[cardSeeds, 1]} />
        </planeGeometry>
        <shaderMaterial
          ref={cardMaterialRef}
          vertexShader={CARD_VERTEX}
          fragmentShader={CARD_FRAGMENT}
          uniforms={cardUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* Warm flicker on the apron sells "fire under the table". */}
      <pointLight
        ref={lightRef}
        position={[0, FLAME_LIGHT.y, 0]}
        color={FLAME_LIGHT.color}
        intensity={FLAME_LIGHT.baseIntensity}
        distance={FLAME_LIGHT.distance}
        decay={2}
      />
    </group>
  );
}
