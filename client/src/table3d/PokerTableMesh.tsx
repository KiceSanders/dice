import { useMemo } from 'react';
import { FELT_SCALE, RAIL_HIGHLIGHT_SCALE, RAIL_MESH_SCALE, TABLE } from './layout';
import {
  createFeltGeometry,
  createRailHighlightGeometry,
  createRailRingGeometry,
} from './tableGeometry';

const FELT = '#1d6b3a';
const RAIL = '#3a2a1a';
const RAIL_HIGHLIGHT = '#5c4228';

/** Oval poker table: felt top and padded rail. */
export default function PokerTableMesh() {
  const y = TABLE.surfaceY;
  const feltGeometry = useMemo(() => createFeltGeometry(), []);
  const railGeometry = useMemo(() => createRailRingGeometry(), []);
  const railHighlightGeometry = useMemo(() => createRailHighlightGeometry(), []);

  return (
    <group>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x, FELT_SCALE.z, 1]}
        receiveShadow
      >
        <primitive object={feltGeometry} attach="geometry" />
        <meshStandardMaterial color={FELT} roughness={0.92} metalness={0.02} />
      </mesh>

      <mesh
        position={[0, y + TABLE.railHeight * 0.35, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_MESH_SCALE, FELT_SCALE.z * RAIL_MESH_SCALE, 1]}
        castShadow
      >
        <primitive object={railGeometry} attach="geometry" />
        <meshStandardMaterial color={RAIL} roughness={0.78} metalness={0.04} />
      </mesh>

      <mesh
        position={[0, y + TABLE.railHeight * 0.55, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_HIGHLIGHT_SCALE, FELT_SCALE.z * RAIL_HIGHLIGHT_SCALE, 1]}
        castShadow
      >
        <primitive object={railHighlightGeometry} attach="geometry" />
        <meshStandardMaterial color={RAIL_HIGHLIGHT} roughness={0.65} metalness={0.05} />
      </mesh>
    </group>
  );
}
