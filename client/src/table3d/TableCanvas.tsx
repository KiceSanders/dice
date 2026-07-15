import type { PoseFrame } from '@dice/shared';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense } from 'react';
import DicePhysics from './dice/DicePhysics';
import ParkedKoozie from './dice/ParkedKoozie';
import RemoteDiceView from './dice/RemoteDiceView';
import type { RemoteRollFeed } from './dice/remoteFeed';
import StaticDiceView from './dice/StaticDiceView';
import TableColliders from './dice/TableColliders';
import { useDicePhysicsTuning } from './dice/tuning';
import type { TableDiceProps } from './dice/types';
import FixedCamera from './FixedCamera';
import { FELT_HALF_EXTENT, SEAT_VIEW } from './layout';
import PokerTableMesh from './PokerTableMesh';
import { DEFAULT_TABLE_THEME } from './theme';

/**
 * The scene renders in the local player's view space: the viewer is always at
 * the bottom (+Z), the camera and table never rotate. Seat identity is applied
 * to pose DATA at the wire boundary instead (seatTransform.ts) — remote frames
 * arrive here already converted to this client's view space.
 */
function SceneContent({
  dice,
  remoteFeed,
  heldPose,
  parkedKoozieAngle,
}: {
  dice?: TableDiceProps;
  remoteFeed?: RemoteRollFeed;
  heldPose?: PoseFrame | null;
  /** Active turn card's occupied-seat angle for the spectator cup; null to hide. */
  parkedKoozieAngle?: number | null;
}) {
  const tuning = useDicePhysicsTuning();
  const gravityY = tuning.world.gravityY * tuning.world.timeScale * tuning.world.timeScale;
  // Roller owns the interactive cup in DicePhysics. Spectators get a
  // read-only dock at the active card's reflowed angle whenever Room passes
  // one —
  // including mid-turn while selecting-phase pose frames keep remoteFeed
  // "live" (those frames have cupVisible:false, so RemoteDiceView would
  // otherwise leave the cup missing). Room nulls the angle once the roller
  // grabs (cupInPlay) or throws, so the streamed cup is the only one on screen.
  const showParkedKoozie = !dice && parkedKoozieAngle !== null && parkedKoozieAngle !== undefined;

  return (
    <>
      <FixedCamera />

      {/* No scene background: the canvas is transparent (gl alpha) so the
          top-band HUD widgets — stacked UNDER the canvas — show through empty
          pixels while rendered geometry (the raised koozie) paints over them.
          Fog must match the page --bg for the horizon seam to stay invisible. */}
      <fog attach="fog" args={[DEFAULT_TABLE_THEME.background, 6, 14]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#c8d4e0', '#1a1208', 0.35]} />
      <directionalLight
        position={[2.5, 4.5, 1.8]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={18}
        shadow-camera-left={-FELT_HALF_EXTENT.x - 1}
        shadow-camera-right={FELT_HALF_EXTENT.x + 1}
        shadow-camera-top={4}
        shadow-camera-bottom={-2}
      />
      <directionalLight position={[-2, 2.5, -2]} intensity={0.3} />
      <pointLight position={[0.4, 1.6, 1.2]} intensity={0.12} color="#f2b441" />

      <PokerTableMesh />

      <Physics
        gravity={[0, gravityY, 0]}
        timeStep={tuning.world.timeStep}
        interpolate
        debug={tuning.world.debug}
      >
        {/* Key flip forces a runtime rebuild entering/leaving bonus mode
            (docs/GAME_RULES.md "Yahtzee bonus"): 5 railed quint dice + a
            temporary sixth die in the cup. */}
        {dice ? (
          <DicePhysics key={dice.bonusMode ? 'bonus' : 'hand'} {...dice} />
        ) : (
          <TableColliders />
        )}
      </Physics>

      {/* Remote throw playback: plain meshes outside the physics world. The
          static held pose MAY coexist with the roller's idle sim (its dice
          are hidden inside the docked cup) — the previous turn's dice stay on
          the felt until the roller grabs the koozie. Room.tsx hides it once
          the roller is dragging, rolling, or has dice of their own. */}
      {!dice && remoteFeed && <RemoteDiceView feed={remoteFeed} />}
      {!remoteFeed && heldPose && <StaticDiceView frame={heldPose} />}
      {showParkedKoozie && <ParkedKoozie displayAngle={parkedKoozieAngle} />}
    </>
  );
}

interface Props {
  dice?: TableDiceProps;
  remoteFeed?: RemoteRollFeed;
  heldPose?: PoseFrame | null;
  parkedKoozieAngle?: number | null;
}

/** Cap pixel ratio on high-DPR displays so Chromebook-class GPUs keep frame budget. */
function tableCanvasDpr(): number | [number, number] {
  if (typeof window === 'undefined') return [1, 2];
  return window.devicePixelRatio > 1.5 ? 1 : [1, 2];
}

/** WebGL canvas — table mesh + physics dice; labels are 2D overlays in Table.tsx. */
export default function TableCanvas({
  dice,
  remoteFeed,
  heldPose = null,
  parkedKoozieAngle = null,
}: Props) {
  return (
    <Canvas
      className="table-canvas"
      shadows
      dpr={tableCanvasDpr()}
      camera={{
        position: [...SEAT_VIEW.position],
        fov: SEAT_VIEW.fov,
        near: 0.1,
        far: 30,
        // FixedCamera owns the projection: aspect stays the 16:9 virtual
        // frame and a view offset exposes the top-band bleed strip. r3f's
        // responsive resize would overwrite both with canvas width/height.
        manual: true,
      }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onCreated={({ camera }) => {
        camera.lookAt(...SEAT_VIEW.target);
      }}
    >
      <Suspense fallback={null}>
        <SceneContent
          dice={dice}
          remoteFeed={remoteFeed}
          heldPose={heldPose}
          parkedKoozieAngle={parkedKoozieAngle}
        />
      </Suspense>
    </Canvas>
  );
}
