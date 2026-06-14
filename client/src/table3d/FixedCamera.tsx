import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEAT_VIEW } from './layout';

/** Locks the camera to the front-seat view; no orbit or zoom. */
export default function FixedCamera() {
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    camera.position.set(...SEAT_VIEW.position);
    camera.lookAt(...SEAT_VIEW.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = SEAT_VIEW.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return null;
}
