import { useMemo } from 'react';
import * as THREE from 'three';
import { DEFAULT_TABLE_THEME, type TableTheme } from '../theme';
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
  theme = DEFAULT_TABLE_THEME.cup,
}: {
  cup?: Pick<DicePhysicsTuning['cup'], 'radius' | 'height' | 'rimInset'>;
  theme?: TableTheme['cup'];
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
        color: theme.body,
        emissive: theme.emissive,
        emissiveIntensity: theme.emissiveIntensity,
        transparent: true,
        opacity: theme.opacity,
        roughness: 0.55,
        metalness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [theme],
  );

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, centerY, 0]} material={mat}>
        <primitive object={wallGeometry} attach="geometry" />
      </mesh>
      <mesh position={[0, cup.height * 0.5 - rimInset * 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={rimGeometry} attach="geometry" />
        <meshPhysicalMaterial
          color={theme.rim}
          transparent
          opacity={theme.rimOpacity}
          roughness={0.4}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
