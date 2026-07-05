import type { Die as DieValue } from '@dice/shared';
import { RoundedBox } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { DIE_HALF, DIE_SIZE } from './constants';

const PIP = '#141414';
const FACE = '#f5efe0';

/** Pip layout on a unit square face (±1) — wider spacing. */
const PIP_LAYOUTS: Record<DieValue, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.38, -0.38],
    [0.38, 0.38],
  ],
  3: [
    [-0.38, -0.38],
    [0, 0],
    [0.38, 0.38],
  ],
  4: [
    [-0.38, -0.38],
    [0.38, -0.38],
    [-0.38, 0.38],
    [0.38, 0.38],
  ],
  5: [
    [-0.38, -0.38],
    [0.38, -0.38],
    [0, 0],
    [-0.38, 0.38],
    [0.38, 0.38],
  ],
  6: [
    [-0.38, -0.44],
    [0.38, -0.44],
    [-0.38, 0],
    [0.38, 0],
    [-0.38, 0.44],
    [0.38, 0.44],
  ],
};

const PIP_RADIUS = DIE_HALF * 0.155;
/** Tiny inset reads as flush / slightly concave without hiding inside the cube. */
const FACE_INSET = 0.0006;

type FaceAxis = 'x' | 'y' | 'z';

interface PipDiscProps {
  u: number;
  v: number;
  axis: FaceAxis;
  sign: 1 | -1;
  material: THREE.MeshStandardMaterial;
}

/** Flat disc coplanar with the die face (CircleGeometry default normal = +Z). */
function PipDisc({ u, v, axis, sign, material }: PipDiscProps) {
  const spread = DIE_HALF * 0.92;
  const a = u * spread;
  const b = v * spread;
  const face = sign * DIE_HALF;
  const inset = sign * FACE_INSET;

  let position: [number, number, number];
  let rotation: [number, number, number];

  switch (axis) {
    case 'y':
      position = [a, face - inset, b];
      rotation = sign === 1 ? [-Math.PI / 2, 0, 0] : [Math.PI / 2, 0, 0];
      break;
    case 'z':
      position = [a, b, face - inset];
      rotation = sign === 1 ? [0, 0, 0] : [0, Math.PI, 0];
      break;
    case 'x':
      position = [face - inset, a, b];
      rotation = sign === 1 ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];
      break;
  }

  return (
    <mesh position={position} rotation={rotation} material={material} renderOrder={2}>
      <circleGeometry args={[PIP_RADIUS, 24]} />
    </mesh>
  );
}

interface FaceProps {
  value: DieValue;
  axis: FaceAxis;
  sign: 1 | -1;
  material: THREE.MeshStandardMaterial;
}

function PipFace({ value, axis, sign, material }: FaceProps) {
  return (
    <>
      {PIP_LAYOUTS[value].map(([u, v], i) => (
        <PipDisc key={i} u={u} v={v} axis={axis} sign={sign} material={material} />
      ))}
    </>
  );
}

/** Visual die mesh — physics collider is a separate cuboid on the RigidBody. */
export default function PipDie() {
  const pipMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: PIP,
        roughness: 0.88,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        depthWrite: false,
      }),
    [],
  );

  return (
    <group>
      <RoundedBox
        args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]}
        radius={0.006}
        smoothness={4}
        castShadow
        receiveShadow
        renderOrder={0}
      >
        <meshStandardMaterial color={FACE} roughness={0.62} metalness={0.03} />
      </RoundedBox>
      <PipFace value={1} axis="y" sign={1} material={pipMaterial} />
      <PipFace value={6} axis="y" sign={-1} material={pipMaterial} />
      <PipFace value={2} axis="z" sign={1} material={pipMaterial} />
      <PipFace value={5} axis="z" sign={-1} material={pipMaterial} />
      <PipFace value={3} axis="x" sign={1} material={pipMaterial} />
      <PipFace value={4} axis="x" sign={-1} material={pipMaterial} />
    </group>
  );
}
