import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import type { Die } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import * as THREE from 'three';
import DieBody, { type DieBodyHandle } from './DieBody';
import TableColliders from './TableColliders';
import { DICE_COUNT, DIE_HALF, DICE_HOVER_Y, dieSlotPosition, PHYSICS } from './constants';
import { pointerCenterPosition, pointerDiePosition } from './pointerToFelt';
import { quaternionForFace, readTopFace } from './faceValue';
import type { TableDiceProps, ThrowVelocity } from './types';

const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

type DieRuntime = {
  visible: boolean;
  locked: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
};

type Sample = { x: number; y: number; z: number; t: number };

function quatToEuler(q: THREE.Quaternion): [number, number, number] {
  _euler.setFromQuaternion(q);
  return [_euler.x, _euler.y, _euler.z];
}

function buildRuntime(dice: Die[], keepIndices: number[]): DieRuntime[] {
  return Array.from({ length: DICE_COUNT }, (_, i) => {
    const value = dice[i];
    const visible = value !== undefined;
    const locked = keepIndices.includes(i);
    const pos = dieSlotPosition(i);
    const rot = value ? quatToEuler(quaternionForFace(value)) : undefined;
    return { visible, locked, position: pos, rotation: rot };
  });
}

function clampBodyVelocity(body: NonNullable<DieBodyHandle['body']>) {
  const lv = body.linvel();
  const av = body.angvel();
  const speed = Math.hypot(lv.x, lv.y, lv.z);
  if (speed > PHYSICS.maxLinVel) {
    const s = PHYSICS.maxLinVel / speed;
    body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
  }
  const spin = Math.hypot(av.x, av.y, av.z);
  if (spin > PHYSICS.maxAngVel) {
    const s = PHYSICS.maxAngVel / spin;
    body.setAngvel({ x: av.x * s, y: av.y * s, z: av.z * s }, true);
  }
}

function sampleVelocity(samples: Sample[]): ThrowVelocity {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };
  const now = samples[samples.length - 1]!;
  const windowMs = 120;
  let oldest = samples[0]!;
  for (const s of samples) {
    if (now.t - s.t <= windowMs) {
      oldest = s;
      break;
    }
  }
  const dt = Math.max((now.t - oldest.t) / 1000, 0.016);
  return {
    x: (now.x - oldest.x) / dt,
    y: (now.y - oldest.y) / dt,
    z: (now.z - oldest.z) / dt,
  };
}

function snapshotThrowRuntime(
  refs: (DieBodyHandle | null)[],
  runtime: DieRuntime[],
): DieRuntime[] {
  return runtime.map((rt, i) => {
    if (!rt.visible || rt.locked) return rt;
    const body = refs[i]?.body;
    if (!body) return rt;
    const t = body.translation();
    return {
      ...rt,
      position: [t.x, t.y, t.z] as [number, number, number],
    };
  });
}

function applyThrowVelocity(
  refs: (DieBodyHandle | null)[],
  next: DieRuntime[],
  velocity: ThrowVelocity,
) {
  const horizSpeed = Math.hypot(velocity.x, velocity.z);
  const scale =
    horizSpeed > 0.05
      ? THREE.MathUtils.clamp(horizSpeed * 0.85, 0.15, PHYSICS.maxLinVel)
      : 0;
  const dirX = horizSpeed > 0.01 ? velocity.x / horizSpeed : 0;
  const dirZ = horizSpeed > 0.01 ? velocity.z / horizSpeed : 0;
  const spin = THREE.MathUtils.clamp(Math.max(horizSpeed, 0.3) * 1.2, 1, PHYSICS.maxAngVel);
  const yVel = THREE.MathUtils.clamp(velocity.y, -1.5, 0.2);

  for (let i = 0; i < DICE_COUNT; i++) {
    const body = refs[i]?.body;
    const rt = next[i];
    if (!body || !rt?.visible || rt.locked) continue;

    body.setBodyType(RigidBodyType.Dynamic, true);
    body.setTranslation({ x: rt.position[0], y: rt.position[1], z: rt.position[2] }, true);
    body.wakeUp();
    body.setLinvel(
      {
        x: dirX * scale + (Math.random() - 0.5) * 0.2,
        y: yVel + (Math.random() - 0.5) * 0.05,
        z: dirZ * scale + (Math.random() - 0.5) * 0.2,
      },
      true,
    );
    body.setAngvel(
      {
        x: (Math.random() - 0.5) * spin,
        y: (Math.random() - 0.5) * spin,
        z: (Math.random() - 0.5) * spin,
      },
      true,
    );
    clampBodyVelocity(body);
  }
}

function applyThrowWhenReady(
  refs: (DieBodyHandle | null)[],
  next: DieRuntime[],
  velocity: ThrowVelocity,
  attempt = 0,
): boolean {
  const needBodies = next.some((rt, i) => rt.visible && !rt.locked && !refs[i]?.body);
  if (needBodies && attempt < 90) {
    requestAnimationFrame(() => applyThrowWhenReady(refs, next, velocity, attempt + 1));
    return false;
  }
  applyThrowVelocity(refs, next, velocity);
  return true;
}

function randomRotation(): [number, number, number] {
  return [
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  ];
}

function pickupRuntimeFromScreen(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  keepIndices: number[],
): DieRuntime[] {
  const kept = new Set(keepIndices);
  return Array.from({ length: DICE_COUNT }, (_, i) => {
    if (kept.has(i)) {
      const pos = dieSlotPosition(i);
      return { visible: true, locked: true, position: pos };
    }
    const hit = pointerDiePosition(clientX, clientY, i, canvas, camera, DICE_HOVER_Y);
    return {
      visible: true,
      locked: false,
      position: [hit.x, hit.y, hit.z] as [number, number, number],
      rotation: randomRotation(),
    };
  });
}

export default function DicePhysics({
  releaseSignal,
  releaseVelocity,
  keepIndices,
  dice,
  active,
  onSettled,
  onRollingChange,
  onRelease,
  onDragChange,
  canDrag = true,
}: TableDiceProps) {
  const { camera, gl } = useThree();
  const refs = useRef<(DieBodyHandle | null)[]>(Array(DICE_COUNT).fill(null));
  const rollingRef = useRef(false);
  const settleCountRef = useRef(0);
  const lastReleaseSignal = useRef(releaseSignal);
  const wasDragging = useRef(false);
  const keepRef = useRef(keepIndices);
  const onSettledRef = useRef(onSettled);
  const onRollingChangeRef = useRef(onRollingChange);
  const onReleaseRef = useRef(onRelease);
  const onDragChangeRef = useRef(onDragChange);
  const canDragRef = useRef(canDrag);
  const pendingThrowRef = useRef<{ next: DieRuntime[]; velocity: ThrowVelocity } | null>(null);
  const rollStartRef = useRef(0);
  const [throwGen, setThrowGen] = useState(0);
  const [simRolling, setSimRolling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const diceRef = useRef(dice);
  diceRef.current = dice;

  const clientXRef = useRef(0);
  const clientYRef = useRef(0);
  const draggingRef = useRef(false);
  const moveSamples = useRef<Sample[]>([]);

  const [runtime, setRuntime] = useState<DieRuntime[]>(() => buildRuntime(dice, keepIndices));
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  onSettledRef.current = onSettled;
  onRollingChangeRef.current = onRollingChange;
  onReleaseRef.current = onRelease;
  onDragChangeRef.current = onDragChange;
  canDragRef.current = canDrag;
  keepRef.current = keepIndices;
  draggingRef.current = dragging;

  const seedPointer = (clientX: number, clientY: number) => {
    clientXRef.current = clientX;
    clientYRef.current = clientY;
  };

  useEffect(() => {
    if (rollingRef.current) return;
    if (dragging) {
      setRuntime(
        pickupRuntimeFromScreen(
          clientXRef.current,
          clientYRef.current,
          gl.domElement,
          camera,
          keepIndices,
        ),
      );
    } else if (!wasDragging.current) {
      setRuntime((prev) => prev.map((d, i) => ({ ...d, locked: keepIndices.includes(i) })));
    }
  }, [keepIndices, dragging, camera, gl]);

  useEffect(() => {
    if (rollingRef.current || dragging || releaseSignal !== lastReleaseSignal.current) return;
    if (dice.length === 0) return;
    setRuntime(buildRuntime(dice, keepIndices));
  }, [dice, keepIndices, dragging, releaseSignal]);

  useEffect(() => {
    if (!active) {
      rollingRef.current = false;
      settleCountRef.current = 0;
      pendingThrowRef.current = null;
      moveSamples.current = [];
      draggingRef.current = false;
      setDragging(false);
      setSimRolling(false);
      setRuntime(
        Array.from({ length: DICE_COUNT }, () => ({
          visible: false,
          locked: false,
          position: [0, DIE_HALF, 0] as [number, number, number],
        })),
      );
    }
  }, [active]);

  useEffect(() => {
    wasDragging.current = dragging;
  }, [dragging]);

  useEffect(() => {
    if (releaseSignal === lastReleaseSignal.current) return;
    lastReleaseSignal.current = releaseSignal;
    if (!active) return;

    rollingRef.current = true;
    settleCountRef.current = 0;
    rollStartRef.current = performance.now();
    setSimRolling(true);
    onRollingChangeRef.current?.(true);

    setRuntime((prev) => {
      const snap = snapshotThrowRuntime(refs.current, prev);
      pendingThrowRef.current = { next: snap, velocity: releaseVelocity };
      return snap;
    });
    setThrowGen((g) => g + 1);
  }, [releaseSignal, releaseVelocity, active]);

  useEffect(() => {
    const pending = pendingThrowRef.current;
    if (!pending) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const done = applyThrowWhenReady(refs.current, pending.next, pending.velocity);
      if (done) {
        pendingThrowRef.current = null;
        setSimRolling(true);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [throwGen]);

  // Mousedown to pick up; mouseup to throw.
  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;

    const recordSample = (clientX: number, clientY: number) => {
      const center = pointerCenterPosition(clientX, clientY, canvas, camera, DICE_HOVER_Y);
      const now = performance.now();
      moveSamples.current.push({ x: center.x, y: center.y, z: center.z, t: now });
      if (moveSamples.current.length > 24) moveSamples.current.shift();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || rollingRef.current || draggingRef.current || !canDragRef.current) return;
      moveSamples.current = [];
      seedPointer(e.clientX, e.clientY);
      recordSample(e.clientX, e.clientY);
      setRuntime(
        pickupRuntimeFromScreen(e.clientX, e.clientY, canvas, camera, keepRef.current),
      );
      draggingRef.current = true;
      setDragging(true);
      onDragChangeRef.current?.(true);
      canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || rollingRef.current) return;
      seedPointer(e.clientX, e.clientY);
      recordSample(e.clientX, e.clientY);
    };

    const finishDrag = (e: PointerEvent) => {
      if (!draggingRef.current || e.button !== 0) return;
      recordSample(e.clientX, e.clientY);
      const snap = snapshotThrowRuntime(refs.current, runtimeRef.current);
      const velocity = sampleVelocity(moveSamples.current);
      runtimeRef.current = snap;
      pendingThrowRef.current = { next: snap, velocity };
      rollingRef.current = true;
      draggingRef.current = false;
      setDragging(false);
      onDragChangeRef.current?.(false);
      setRuntime(snap);
      onReleaseRef.current(velocity);
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', finishDrag);
      canvas.removeEventListener('pointercancel', finishDrag);
    };
  }, [active, camera, gl, canDrag]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!active || !canDrag) {
      canvas.style.cursor = dragging ? 'grabbing' : '';
      return;
    }
    canvas.style.cursor = dragging ? 'grabbing' : simRolling ? '' : 'grab';
  }, [dragging, active, canDrag, simRolling, gl]);

  // Update kinematic dice while dragging.
  useFrame(() => {
    if (dragging && !rollingRef.current) {
      const canvas = gl.domElement;
      for (let i = 0; i < DICE_COUNT; i++) {
        const rt = runtimeRef.current[i];
        if (!rt?.visible || rt.locked) continue;
        const body = refs.current[i]?.body;
        const hit = pointerDiePosition(clientXRef.current, clientYRef.current, i, canvas, camera, DICE_HOVER_Y);
        if (body) {
          body.setTranslation({ x: hit.x, y: hit.y, z: hit.z }, true);
        }
      }
      return;
    }

    if (!rollingRef.current) return;

    if (performance.now() - rollStartRef.current > 8000) {
      rollingRef.current = false;
      onRollingChangeRef.current?.(false);
      const values: Die[] = [];
      for (let i = 0; i < HAND_SIZE; i++) {
        const body = refs.current[i]?.body;
        if (!body) {
          values.push(diceRef.current[i] ?? 1);
          continue;
        }
        const rot = body.rotation();
        _quat.set(rot.x, rot.y, rot.z, rot.w);
        values.push(readTopFace(_quat));
      }
      setSimRolling(false);
      onSettledRef.current(values);
      return;
    }

    let settled = true;
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible) continue;
      const body = refs.current[i]?.body;
      if (!body) {
        settled = false;
        continue;
      }
      clampBodyVelocity(body);
      const lv = body.linvel();
      const av = body.angvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      const spin = Math.hypot(av.x, av.y, av.z);
      const y = body.translation().y;
      if (y < -0.5 || speed > PHYSICS.settleLinVel || spin > PHYSICS.settleAngVel) {
        settled = false;
        break;
      }
    }

    if (settled) {
      settleCountRef.current += 1;
      if (settleCountRef.current >= PHYSICS.settleFrames) {
        rollingRef.current = false;
        settleCountRef.current = 0;
        setSimRolling(false);
        onRollingChangeRef.current?.(false);

        const values: Die[] = [];
        for (let i = 0; i < HAND_SIZE; i++) {
          const body = refs.current[i]?.body;
          if (!body) {
            values.push(1);
            continue;
          }
          const rot = body.rotation();
          _quat.set(rot.x, rot.y, rot.z, rot.w);
          values.push(readTopFace(_quat));
          if (keepRef.current.includes(i)) {
            body.setBodyType(RigidBodyType.Fixed, true);
          }
        }
        onSettledRef.current(values);
      }
    } else {
      settleCountRef.current = 0;
    }
  });

  if (!active) return <TableColliders />;

  return (
    <>
      <TableColliders />
      {runtime.map((rt, i) =>
        rt.visible ? (
          <DieBody
            key={rt.locked ? `die-${i}-locked` : `die-${i}-throw-${releaseSignal}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            locked={rt.locked || dragging || pendingThrowRef.current !== null}
            position={rt.position}
            rotation={rt.rotation}
          />
        ) : null,
      )}
    </>
  );
}
