import { useMemo } from 'react';
import * as THREE from 'three';
import { KOOZIE } from './constants';
import {
  createKoozieRimVisualGeometry,
  createKoozieWallVisualGeometry,
  koozieWallLayout,
} from './koozieGeometry';
import type { DicePhysicsTuning } from './tuning';

/** Closed-bottom, open-top cup visual (no physics — colliders live on KoozieBody). */
export default function KoozieMesh({
  cup = KOOZIE,
}: {
  cup?: Pick<DicePhysicsTuning['cup'], 'radius' | 'height' | 'rimInset'>;
}) {
  const { rimInset } = cup;
  const { centerY } = koozieWallLayout(cup);
  const wallGeometry = useMemo(
    () => createKoozieWallVisualGeometry(cup),
    [cup.radius, cup.height, cup.rimInset],
  );
  const rimGeometry = useMemo(() => createKoozieRimVisualGeometry(cup), [cup.radius, cup.rimInset]);
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
      <mesh castShadow receiveShadow position={[0, centerY, 0]} material={mat}>
        <primitive object={wallGeometry} attach="geometry" />
      </mesh>
      <mesh position={[0, cup.height * 0.5 - rimInset * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={rimGeometry} attach="geometry" />
        <meshPhysicalMaterial
          color="#e8f4fa"
          transparent
          opacity={0.55}
          roughness={0.4}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
