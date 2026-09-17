import { D12_FACES } from '@dice/shared';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DEFAULT_TABLE_THEME } from '../theme';

/** One shared numbered dodecahedron for local physics, remote playback and static rails. */
export default function PolyhedralDie() {
  const faces = useMemo(
    () =>
      D12_FACES.map((face) => {
        const positions: number[] = [];
        const uv: number[] = [];
        for (let i = 0; i < face.vertices.length; i++) {
          for (const point of [
            face.center,
            face.vertices[i]!,
            face.vertices[(i + 1) % face.vertices.length]!,
          ]) {
            positions.push(...point);
            uv.push(
              0.5 + point.reduce((sum, value, axis) => sum + value * face.u[axis]!, 0) / 0.09,
              0.5 + point.reduce((sum, value, axis) => sum + value * face.v[axis]!, 0) / 0.09,
            );
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.computeVertexNormals();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = DEFAULT_TABLE_THEME.numberedDie.body;
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = DEFAULT_TABLE_THEME.numberedDie.ink;
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(face.value), 64, 64);
        if (face.value === 6 || face.value === 9) ctx.fillRect(51, 88, 26, 3);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return { value: face.value, geometry, texture };
      }),
    [],
  );
  useEffect(
    () => () => {
      for (const face of faces) {
        face.geometry.dispose();
        face.texture.dispose();
      }
    },
    [faces],
  );
  return (
    <group>
      {faces.map((face) => (
        <mesh key={face.value} geometry={face.geometry} castShadow receiveShadow>
          <meshStandardMaterial map={face.texture} roughness={0.55} metalness={0.05} />
        </mesh>
      ))}
    </group>
  );
}
