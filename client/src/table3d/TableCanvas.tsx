import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import FixedCamera from './FixedCamera';
import PokerTableMesh from './PokerTableMesh';
import DicePhysics from './dice/DicePhysics';
import TableColliders from './dice/TableColliders';
import { useDicePhysicsTuning } from './dice/tuning';
import type { TableDiceProps } from './dice/types';
import { FELT_HALF_EXTENT, SEAT_VIEW } from './layout';

function SceneContent({ dice }: { dice?: TableDiceProps }) {
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
    </>
  );
}

interface Props {
  dice?: TableDiceProps;
}

/** WebGL canvas — table mesh + physics dice; labels are 2D overlays in Table.tsx. */
export default function TableCanvas({ dice }: Props) {
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
        <SceneContent dice={dice} />
      </Suspense>
    </Canvas>
  );
}
