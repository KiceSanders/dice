import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { SEAT_VIEW } from './layout';
import { FRAME_ASPECT, frameViewOffset } from './project';

/**
 * Locks the camera to the front-seat view; no orbit or zoom. The projection is
 * owned here (the Canvas camera is `manual`): aspect is pinned to the 16:9
 * virtual frame and, when the canvas bleeds above the viewport (the top-band
 * strip — see docs/TABLE_UI.md § Reserved arcs), a view offset extends the
 * frustum upward so that strip shows real scene space while the bottom 16:9
 * region keeps the exact SEAT_VIEW framing every test and overlay assumes.
 */
export default function FixedCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    camera.position.set(...SEAT_VIEW.position);
    camera.lookAt(...SEAT_VIEW.target);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = SEAT_VIEW.fov;
      camera.aspect = FRAME_ASPECT;
      const view = frameViewOffset(size.width, size.height);
      if (view) {
        camera.setViewOffset(
          view.fullWidth,
          view.fullHeight,
          view.x,
          view.y,
          size.width,
          size.height,
        );
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
    }
  }, [camera, size]);

  return null;
}
