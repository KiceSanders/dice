import { useMemo } from 'react';
import {
  FELT_SCALE,
  RAIL_HIGHLIGHT_SCALE,
  RAIL_INNER_WORLD,
  RAIL_MESH_SCALE,
  RAIL_OUTER_WORLD,
  TABLE,
} from './layout';
import {
  createExtrudedOvalRingGeometry,
  createFeltGeometry,
  createRailHighlightGeometry,
  createRailRingGeometry,
} from './tableGeometry';
import { DEFAULT_TABLE_THEME, type TableTheme } from './theme';

/** How far the solid rail apron drops below the surface (world units). */
const APRON_DROP = 0.35;

/** Round poker table: felt top, padded rail, and a solid rail apron. */
export default function PokerTableMesh({ theme = DEFAULT_TABLE_THEME }: { theme?: TableTheme }) {
  const y = TABLE.surfaceY;
  const railTopY = y + TABLE.railHeight;
  const feltGeometry = useMemo(() => createFeltGeometry(), []);
  const railGeometry = useMemo(() => createRailRingGeometry(), []);
  const railHighlightGeometry = useMemo(() => createRailHighlightGeometry(), []);
  // Solid rail body: matches the flat rail rings' footprint, top at the
  // physics rail height, dropping below the felt. Without it the table is
  // paper-thin and anything behind the far edge (the docked koozie) shows
  // straight through — this is the occluder that makes "sunken behind the
  // rail" true visually, not just in the hit-test math.
  const apronGeometry = useMemo(
    () =>
      createExtrudedOvalRingGeometry({
        innerRadius: RAIL_INNER_WORLD,
        outerRadius: RAIL_OUTER_WORLD,
        centerY: railTopY - (TABLE.railHeight + APRON_DROP) / 2,
        height: TABLE.railHeight + APRON_DROP,
      }),
    [railTopY],
  );

  return (
    <group>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x, FELT_SCALE.z, 1]}
        receiveShadow
      >
        <primitive object={feltGeometry} attach="geometry" />
        <meshStandardMaterial color={theme.felt} roughness={0.92} metalness={0.02} />
      </mesh>

      <mesh>
        <primitive object={apronGeometry} attach="geometry" />
        <meshStandardMaterial color={theme.apron} roughness={0.85} metalness={0.03} />
      </mesh>

      {/* Flat rail rings sit just above the apron top so they never z-fight. */}
      <mesh
        position={[0, railTopY + 0.0015, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_MESH_SCALE, FELT_SCALE.z * RAIL_MESH_SCALE, 1]}
        castShadow
      >
        <primitive object={railGeometry} attach="geometry" />
        <meshStandardMaterial color={theme.rail} roughness={0.78} metalness={0.04} />
      </mesh>

      <mesh
        position={[0, railTopY + 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[FELT_SCALE.x * RAIL_HIGHLIGHT_SCALE, FELT_SCALE.z * RAIL_HIGHLIGHT_SCALE, 1]}
        castShadow
      >
        <primitive object={railHighlightGeometry} attach="geometry" />
        <meshStandardMaterial color={theme.railHighlight} roughness={0.65} metalness={0.05} />
      </mesh>
    </group>
  );
}
