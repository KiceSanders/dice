import type { PoseFrame } from '@dice/shared';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense } from 'react';
import DicePhysics from './dice/DicePhysics';
import RemoteDiceView from './dice/RemoteDiceView';
import type { RemoteRollFeed } from './dice/remoteFeed';
import StaticDiceView from './dice/StaticDiceView';
import TableColliders from './dice/TableColliders';
import { useDicePhysicsTuning } from './dice/tuning';
import type { StraightCue, TableDiceProps } from './dice/types';
import FixedCamera from './FixedCamera';
import { FELT_HALF_EXTENT, SEAT_VIEW } from './layout';
import PokerTableMesh from './PokerTableMesh';

/**
 * The scene renders in the local player's view space: the viewer is always at
 * the bottom (+Z), the camera and table never rotate. Seat identity is applied
 * to pose DATA at the wire boundary instead (seatTransform.ts) — remote frames
 * arrive here already converted to this client's view space.
 */
function SceneContent({
  dice,
  remoteFeed,
  straightCue,
  heldPose,
}: {
  dice?: TableDiceProps;
  remoteFeed?: RemoteRollFeed;
  straightCue?: StraightCue;
  heldPose?: PoseFrame | null;
}) {
  const tuning = useDicePhysicsTuning();
  const gravityY = tuning.world.gravityY * tuning.world.timeScale * tuning.world.timeScale;

  return (
    <>
      <FixedCamera />

      <color attach="background" args={['#14191f']} />
      <fog attach="fog" args={['#14191f', 6, 14]} />

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
        {dice ? <DicePhysics {...dice} /> : <TableColliders />}
      </Physics>

      {/* Remote throw playback: plain meshes outside the physics world. The
          static held pose MAY coexist with the roller's idle sim (its dice
          are hidden inside the docked cup) — the previous turn's dice stay on
          the felt until the roller grabs the koozie. Room.tsx hides it once
          the roller is dragging, rolling, or has dice of their own. */}
      {!dice && remoteFeed && <RemoteDiceView feed={remoteFeed} straightCue={straightCue} />}
      {!remoteFeed && heldPose && <StaticDiceView frame={heldPose} />}
    </>
  );
}

interface Props {
  dice?: TableDiceProps;
  remoteFeed?: RemoteRollFeed;
  /** Straight celebration cue for the streamed-playback view. */
  straightCue?: StraightCue;
  heldPose?: PoseFrame | null;
}

/** WebGL canvas — table mesh + physics dice; labels are 2D overlays in Table.tsx. */
export default function TableCanvas({ dice, remoteFeed, straightCue, heldPose = null }: Props) {
  return (
    <Canvas
      className="table-canvas"
      shadows
      dpr={[1, 2]}
      camera={{
        position: [...SEAT_VIEW.position],
        fov: SEAT_VIEW.fov,
        near: 0.1,
        far: 30,
      }}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      onCreated={({ camera }) => {
        camera.lookAt(...SEAT_VIEW.target);
      }}
    >
      <Suspense fallback={null}>
        <SceneContent
          dice={dice}
          remoteFeed={remoteFeed}
          straightCue={straightCue}
          heldPose={heldPose}
        />
      </Suspense>
    </Canvas>
  );
}
