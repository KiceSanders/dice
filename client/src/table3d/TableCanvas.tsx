import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import FixedCamera from './FixedCamera';
import PokerTableMesh from './PokerTableMesh';
import DicePhysics from './dice/DicePhysics';
import TableColliders from './dice/TableColliders';
import { PHYSICS } from './dice/constants';
import type { TableDiceProps } from './dice/types';
import { SEAT_VIEW } from './layout';

function SceneContent({ dice }: { dice?: TableDiceProps }) {
  return (
    <>
      <FixedCamera />

      <color attach="background" args={['#14191f']} />
      <fog attach="fog" args={['#14191f', 5, 11]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#c8d4e0', '#1a1208', 0.35]} />
      <directionalLight
        position={[2.5, 4.5, 1.8]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={12}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <directionalLight position={[-2, 2.5, -2]} intensity={0.3} />
      <pointLight position={[0.4, 1.6, 1.2]} intensity={0.12} color="#f2b441" />

      <PokerTableMesh />

      <Physics gravity={PHYSICS.gravity} timeStep="vary" interpolate>
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
