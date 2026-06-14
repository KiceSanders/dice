import { FELT_SCALE, RAIL_HIGHLIGHT_INNER, RAIL_HIGHLIGHT_OUTER, RAIL_HIGHLIGHT_SCALE, RAIL_INNER, RAIL_MESH_SCALE, RAIL_OUTER, TABLE } from './layout';

const FELT = '#1d6b3a';
const RAIL = '#3a2a1a';
const RAIL_HIGHLIGHT = '#5c4228';

/** Oval poker table: felt top and padded rail. */
export default function PokerTableMesh() {
  const y = TABLE.surfaceY;

  return (
    <group>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x, FELT_SCALE.z, 1]}
        receiveShadow
      >
        <circleGeometry args={[TABLE.feltRadius, 64]} />
        <meshStandardMaterial color={FELT} roughness={0.92} metalness={0.02} />
      </mesh>

      <mesh
        position={[0, y + TABLE.railHeight * 0.35, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_MESH_SCALE, FELT_SCALE.z * RAIL_MESH_SCALE, 1]}
        castShadow
      >
        <ringGeometry args={[RAIL_INNER, RAIL_OUTER, 64]} />
        <meshStandardMaterial color={RAIL} roughness={0.78} metalness={0.04} />
      </mesh>

      <mesh
        position={[0, y + TABLE.railHeight * 0.55, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_HIGHLIGHT_SCALE, FELT_SCALE.z * RAIL_HIGHLIGHT_SCALE, 1]}
        castShadow
      >
        <ringGeometry args={[RAIL_HIGHLIGHT_INNER, RAIL_HIGHLIGHT_OUTER, 64]} />
        <meshStandardMaterial color={RAIL_HIGHLIGHT} roughness={0.65} metalness={0.05} />
      </mesh>
    </group>
  );
}
