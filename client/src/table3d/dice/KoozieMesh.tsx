import { useMemo } from 'react';
import * as THREE from 'three';
import { KOOZIE } from './constants';
import type { DicePhysicsTuning } from './tuning';

/** Closed-bottom, open-top cup visual (no physics — colliders live on KoozieBody). */
export default function KoozieMesh({ cup = KOOZIE }: { cup?: Pick<DicePhysicsTuning['cup'], 'radius' | 'height' | 'rimInset'> }) {
  const { radius, height, rimInset } = cup;
  const wallH = height - rimInset;
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#b8d8ec',
        emissive: '#3a5a6e',
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.52,
        roughness: 0.55,
        metalness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -rimInset * 0.5, 0]} material={mat}>
        <cylinderGeometry args={[radius, radius, wallH, 32, 1, false]} />
      </mesh>
      <mesh position={[0, height * 0.5 - rimInset * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.98, 0.006, 8, 32]} />
        <meshPhysicalMaterial color="#e8f4fa" transparent opacity={0.55} roughness={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}
