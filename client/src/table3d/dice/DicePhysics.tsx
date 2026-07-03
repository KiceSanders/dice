import { useCallback, useEffect, useRef, useState } from 'react';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { Die } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import * as THREE from 'three';
import DieBody, { type DieBodyHandle } from './DieBody';
import KoozieBody, { type KoozieBodyHandle } from './KoozieBody';
import TableColliders from './TableColliders';
import {
  DICE_COUNT,
  DICE_FELT_Y,
  DIE_HALF,
  FELT_BOUND_X,
  FELT_BOUND_Z,
  KOOZIE,
  dieSlotPosition,
} from './constants';
import { spawnDiceInCupLocal } from './koozieColliders';
import {
  createHeldStateFromPose,
  createHomePose,
  createPourState,
  isInsideCup,
  pouringPoseAt,
  stepHeldPose,
  type KoozieHeldState,
  type KooziePourState,
} from './koozieMotion';
import { canvasLayoutElement, hitCup, pointerOnPlane } from './pointerToFelt';
import { quaternionForFace, readTopFace } from './faceValue';
import {
  getDicePhysicsTuning,
  useDicePhysicsTuning,
  type DicePhysicsTuning,
} from './tuning';
import type { TableDiceProps, ThrowVelocity } from './types';

const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _vec = new THREE.Vector3();

type CupPhase = 'idle' | 'held' | 'pouring' | 'settling' | 'hidden';

type DieRuntime = {
  visible: boolean;
  locked: boolean;
  inCup: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
};

type Sample = { x: number; y: number; z: number; t: number };

function quatToEuler(q: THREE.Quaternion): [number, number, number] {
  _euler.setFromQuaternion(q);
  return [_euler.x, _euler.y, _euler.z];
}

function homePosition(tuning: DicePhysicsTuning): [number, number, number] {
  return [0, tuning.cup.floatCenterY, tuning.cup.homeZ];
}

function cupLocalToWorld(
  local: [number, number, number],
  cupPos: THREE.Vector3,
  cupQuat: THREE.Quaternion,
): [number, number, number] {
  _vec.set(local[0], local[1], local[2]).applyQuaternion(cupQuat).add(cupPos);
  return [_vec.x, _vec.y, _vec.z];
}

function randomRotation(): [number, number, number] {
  return [
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
  ];
}

function buildRuntime(
  dice: Die[],
  keepIndices: number[],
  cupMode: boolean,
  tuning: DicePhysicsTuning,
): DieRuntime[] {
  if (!cupMode) {
    return Array.from({ length: DICE_COUNT }, (_, i) => {
      const value = dice[i];
      if (value === undefined) {
        return {
          visible: false,
          locked: true,
          inCup: false,
          position: dieSlotPosition(i),
        };
      }
      return {
        visible: true,
        locked: true,
        inCup: false,
        position: dieSlotPosition(i),
        rotation: quatToEuler(quaternionForFace(value)),
      };
    });
  }

  const kept = new Set(keepIndices);
  const unkeptIndices = Array.from({ length: DICE_COUNT }, (_, i) => i).filter((i) => !kept.has(i));
  const home = createHomePose(tuning);

  return Array.from({ length: DICE_COUNT }, (_, i) => {
    if (kept.has(i)) {
      const value = dice[i];
      return {
        visible: true,
        locked: true,
        inCup: false,
        position: dieSlotPosition(i),
        rotation: value ? quatToEuler(quaternionForFace(value)) : undefined,
      };
    }

    const cupSlot = unkeptIndices.indexOf(i);
    const local = spawnDiceInCupLocal(cupSlot, unkeptIndices.length, tuning.cup);
    return {
      visible: true,
      locked: false,
      inCup: true,
      position: cupLocalToWorld(local.position, home.position, home.quaternion),
      rotation: local.rotation,
    };
  });
}

function clampBodyVelocity(body: NonNullable<DieBodyHandle['body']>, maxLin: number, maxAng: number) {
  const lv = body.linvel();
  const lvx = lv.x;
  const lvy = lv.y;
  const lvz = lv.z;
  const av = body.angvel();
  const avx = av.x;
  const avy = av.y;
  const avz = av.z;
  const speed = Math.hypot(lvx, lvy, lvz);
  if (speed > maxLin) {
    const s = maxLin / speed;
    body.setLinvel({ x: lvx * s, y: lvy * s, z: lvz * s }, true);
  }
  const spin = Math.hypot(avx, avy, avz);
  if (spin > maxAng) {
    const s = maxAng / spin;
    body.setAngvel({ x: avx * s, y: avy * s, z: avz * s }, true);
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

function blendReleaseVelocity(
  samples: Sample[],
  heldVelocity: THREE.Vector3 | undefined,
  tuning: DicePhysicsTuning,
): ThrowVelocity {
  const sampled = sampleVelocity(samples);
  const blend = tuning.release.velocityBlend;
  return {
    x: sampled.x + (heldVelocity?.x ?? 0) * blend,
    y: sampled.y + (heldVelocity?.y ?? 0) * blend,
    z: sampled.z + (heldVelocity?.z ?? 0) * blend,
  };
}

function cupCenterNow(cup: KoozieBodyHandle['body'], tuning: DicePhysicsTuning): readonly [number, number, number] {
  const body = liveBody(cup);
  if (!body) return homePosition(tuning);
  const t = body.translation();
  return [t.x, t.y, t.z];
}

function pointerTarget(canvas: HTMLCanvasElement): HTMLElement {
  return canvasLayoutElement(canvas);
}

function setCupPose(cup: NonNullable<KoozieBodyHandle['body']>, pose: { position: THREE.Vector3; quaternion: THREE.Quaternion }) {
  cup.setNextKinematicTranslation({ x: pose.position.x, y: pose.position.y, z: pose.position.z });
  cup.setNextKinematicRotation({
    x: pose.quaternion.x,
    y: pose.quaternion.y,
    z: pose.quaternion.z,
    w: pose.quaternion.w,
  });
}

function clampPivotToTable(point: THREE.Vector3, tuning: DicePhysicsTuning): THREE.Vector3 {
  const margin = tuning.cup.radius + 0.16;
  const a = Math.max(FELT_BOUND_X - margin, 0.1);
  const b = Math.max(FELT_BOUND_Z - margin, 0.1);
  const nx = point.x / a;
  const nz = point.z / b;
  const dist = Math.hypot(nx, nz);
  if (dist > 1) {
    point.x = (nx / dist) * a;
    point.z = (nz / dist) * b;
  }
  return point;
}

function outsideTable(point: { x: number; z: number }): boolean {
  const nx = point.x / (FELT_BOUND_X + 0.25);
  const nz = point.z / (FELT_BOUND_Z + 0.25);
  return Math.hypot(nx, nz) > 1.15;
}

function countUnkeptInside(
  refs: (DieBodyHandle | null)[],
  runtime: DieRuntime[],
  cupBody: NonNullable<KoozieBodyHandle['body']>,
  tuning: DicePhysicsTuning,
): number {
  const t = cupBody.translation();
  const cupPos = { x: t.x, y: t.y, z: t.z };
  const r = cupBody.rotation();
  const cupRot = { x: r.x, y: r.y, z: r.z, w: r.w };
  let inside = 0;
  for (let i = 0; i < DICE_COUNT; i++) {
    const rt = runtime[i];
    if (!rt?.visible || rt.locked) continue;
    const body = liveBody(refs[i]?.body);
    if (!body) continue;
    const p = body.translation();
    if (isInsideCup({ x: p.x, y: p.y, z: p.z }, cupPos, cupRot, tuning)) inside++;
  }
  return inside;
}

/**
 * Rapier bodies removed from the world keep their JS wrapper alive; calling
 * methods on them panics the WASM module and kills the whole physics world.
 * Refs can briefly point at removed bodies around remounts, so every
 * imperative access must go through this guard.
 */
function liveBody<T extends { isValid(): boolean }>(body: T | null | undefined): T | null {
  return body && body.isValid() ? body : null;
}

function respawnDieOnFelt(index: number, body: NonNullable<DieBodyHandle['body']>) {
  const [x, , z] = dieSlotPosition(index);
  body.setBodyType(RigidBodyType.Dynamic, true);
  body.setTranslation({ x, y: DICE_FELT_Y + 0.08, z }, true);
  body.setRotation(
    {
      x: Math.random() - 0.5,
      y: Math.random() - 0.5,
      z: Math.random() - 0.5,
      w: 1,
    },
    true,
  );
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.wakeUp();
}

export default function DicePhysics({
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
  const tuning = useDicePhysicsTuning();
  const dieRefs = useRef<(DieBodyHandle | null)[]>(Array(DICE_COUNT).fill(null));
  const koozieRef = useRef<KoozieBodyHandle | null>(null);
  const rollingRef = useRef(false);
  const settleCountRef = useRef(0);
  const keepRef = useRef(keepIndices);
  const onSettledRef = useRef(onSettled);
  const onRollingChangeRef = useRef(onRollingChange);
  const onReleaseRef = useRef(onRelease);
  const onDragChangeRef = useRef(onDragChange);
  const canDragRef = useRef(canDrag);
  const cupPhaseRef = useRef<CupPhase>('hidden');
  const heldStateRef = useRef<KoozieHeldState | null>(null);
  const pourStateRef = useRef<KooziePourState | null>(null);
  const diceRef = useRef(dice);
  const tuningRef = useRef(tuning);
  diceRef.current = dice;
  tuningRef.current = tuning;

  const clientXRef = useRef(0);
  const clientYRef = useRef(0);
  const draggingRef = useRef(false);
  const moveSamples = useRef<Sample[]>([]);
  const layoutGenRef = useRef(0);
  const rollElapsedMsRef = useRef(0);
  const finishPendingRef = useRef(false);
  const skipDiceLayoutRef = useRef(false);

  const [cupPhase, setCupPhase] = useState<CupPhase>(active && canDrag ? 'idle' : 'hidden');
  const [cupVisible, setCupVisible] = useState(active && canDrag);
  const [dragging, setDragging] = useState(false);
  const [simRolling, setSimRolling] = useState(false);
  const [layoutGen, setLayoutGen] = useState(0);
  const [runtime, setRuntime] = useState<DieRuntime[]>(() =>
    buildRuntime(dice, keepIndices, canDrag, tuning),
  );
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onSettledRef.current = onSettled;
  onRollingChangeRef.current = onRollingChange;
  onReleaseRef.current = onRelease;
  onDragChangeRef.current = onDragChange;
  canDragRef.current = canDrag;
  keepRef.current = keepIndices;
  draggingRef.current = dragging;
  cupPhaseRef.current = cupPhase;

  const resetToIdleInCup = useCallback((nextDice?: Die[]) => {
    const latestTuning = getDicePhysicsTuning();
    const cupMode = canDragRef.current;
    skipDiceLayoutRef.current = true;
    layoutGenRef.current += 1;
    setLayoutGen(layoutGenRef.current);
    setRuntime(buildRuntime(nextDice ?? diceRef.current, keepRef.current, cupMode, latestTuning));
    setCupPhase(cupMode ? 'idle' : 'hidden');
    setCupVisible(cupMode);
    rollingRef.current = false;
    rollElapsedMsRef.current = 0;
    setSimRolling(false);
    settleCountRef.current = 0;
    heldStateRef.current = null;
    pourStateRef.current = null;

    const cup = liveBody(koozieRef.current?.body);
    if (cup && cupMode) {
      const [x, y, z] = homePosition(latestTuning);
      cup.setBodyType(RigidBodyType.Fixed, true);
      cup.setTranslation({ x, y, z }, true);
      cup.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      cup.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cup.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, []);

  const wakeUnkeptDice = useCallback(() => {
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible || rt.locked) continue;
      const body = liveBody(dieRefs.current[i]?.body);
      if (!body) continue;
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.wakeUp();
    }
  }, []);

  const readCurrentDieValues = useCallback((fallbackDice?: Die[]): Die[] => {
    const values: Die[] = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      if (keepRef.current.includes(i) && diceRef.current[i]) {
        values.push(diceRef.current[i]!);
        continue;
      }
      const body = liveBody(dieRefs.current[i]?.body);
      if (!body) {
        values.push(fallbackDice?.[i] ?? diceRef.current[i] ?? 1);
        continue;
      }
      const rot = body.rotation();
      _quat.set(rot.x, rot.y, rot.z, rot.w);
      values.push(readTopFace(_quat));
    }
    return values;
  }, []);

  const finishWithCurrentFaces = useCallback(
    (fallbackDice?: Die[]) => {
      if (finishPendingRef.current) return;
      finishPendingRef.current = true;
      rollingRef.current = false;
      const values = readCurrentDieValues(fallbackDice);
      requestAnimationFrame(() => {
        finishPendingRef.current = false;
        settleCountRef.current = 0;
        setSimRolling(false);
        onRollingChangeRef.current?.(false);
        onSettledRef.current(values);
        resetToIdleInCup(values);
      });
    },
    [readCurrentDieValues, resetToIdleInCup],
  );

  const recordSample = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = gl.domElement;
      const center = pointerOnPlane(clientX, clientY, canvas, camera, tuningRef.current.cup.floatCenterY);
      clampPivotToTable(center, tuningRef.current);
      moveSamples.current.push({ x: center.x, y: center.y, z: center.z, t: performance.now() });
      if (moveSamples.current.length > 24) moveSamples.current.shift();
    },
    [camera, gl],
  );

  const finishDrag = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current || e.button !== 0) return;
      const latestTuning = tuningRef.current;
      recordSample(e.clientX, e.clientY);
      const heldState = heldStateRef.current;
      const pose = heldState?.pose;
      const velocity = blendReleaseVelocity(moveSamples.current, heldState?.pivotVel, latestTuning);
      const cup = liveBody(koozieRef.current?.body);

      if (cup && pose) {
        cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
        pourStateRef.current = createPourState(pose, velocity, heldState?.pivotVel, latestTuning);
        const { pose: pourPose } = pouringPoseAt(pourStateRef.current, 0, latestTuning);
        setCupPose(cup, pourPose);
      }

      wakeUnkeptDice();
      rollingRef.current = true;
      rollElapsedMsRef.current = 0;
      draggingRef.current = false;
      cupPhaseRef.current = 'pouring';
      setDragging(false);
      setCupPhase('pouring');
      setSimRolling(true);
      onDragChangeRef.current?.(false);
      onRollingChangeRef.current?.(true);
      onReleaseRef.current(velocity);
    },
    [recordSample, wakeUnkeptDice],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (rollingRef.current || draggingRef.current || !canDragRef.current) {
        return;
      }

      moveSamples.current = [];
      clientXRef.current = clientX;
      clientYRef.current = clientY;
      recordSample(clientX, clientY);

      const cup = liveBody(koozieRef.current?.body);
      if (cup) {
        cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
        cup.wakeUp();
        const t = cup.translation();
        const cupPos = new THREE.Vector3(t.x, t.y, t.z);
        const r = cup.rotation();
        _quat.set(r.x, r.y, r.z, r.w);
        heldStateRef.current = createHeldStateFromPose(
          {
            position: cupPos,
            quaternion: _quat.clone(),
          },
          tuningRef.current,
        );
      }

      wakeUnkeptDice();
      draggingRef.current = true;
      cupPhaseRef.current = 'held';
      setDragging(true);
      setCupPhase('held');
      onDragChangeRef.current?.(true);
    },
    [recordSample, wakeUnkeptDice],
  );

  const handleKoozieGrab = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      beginDrag(event.clientX, event.clientY);
    },
    [beginDrag],
  );

  const beginDragRef = useRef(beginDrag);
  beginDragRef.current = beginDrag;

  useEffect(() => {
    if (rollingRef.current || dragging) return;
    if (skipDiceLayoutRef.current) {
      skipDiceLayoutRef.current = false;
      return;
    }
    layoutGenRef.current += 1;
    setLayoutGen(layoutGenRef.current);
    setRuntime(buildRuntime(diceRef.current, keepIndices, canDrag, tuningRef.current));
  }, [dice, keepIndices, dragging, canDrag]);

  useEffect(() => {
    if (!active) {
      rollingRef.current = false;
      settleCountRef.current = 0;
      moveSamples.current = [];
      draggingRef.current = false;
      setDragging(false);
      setSimRolling(false);
      setCupPhase('hidden');
      setCupVisible(false);
      setRuntime(
        Array.from({ length: DICE_COUNT }, () => ({
          visible: false,
          locked: false,
          inCup: false,
          position: [0, DIE_HALF, 0] as [number, number, number],
        })),
      );
      return;
    }

    if (!rollingRef.current && !draggingRef.current) {
      resetToIdleInCup();
    }
  }, [active, resetToIdleInCup]);

  useEffect(() => {
    if (!active || rollingRef.current || draggingRef.current) return;
    resetToIdleInCup();
  }, [
    active,
    canDrag,
    tuning.cup.radius,
    tuning.cup.height,
    tuning.cup.wallThickness,
    tuning.cup.bottomThickness,
    tuning.cup.rimInset,
    tuning.cup.floatCenterY,
    tuning.cup.homeZ,
    resetToIdleInCup,
  ]);

  useEffect(() => {
    if (!active || !canDrag) return;
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || rollingRef.current || draggingRef.current || !canDragRef.current) return;
      if (camera instanceof THREE.PerspectiveCamera) {
        const el = canvasLayoutElement(canvas);
        const h = el.clientHeight;
        if (h > 0) {
          const aspect = el.clientWidth / h;
          if (Math.abs(camera.aspect - aspect) > 0.001) {
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
          }
        }
      }
      camera.updateMatrixWorld();
      const latestTuning = tuningRef.current;
      const center = cupCenterNow(koozieRef.current?.body ?? null, latestTuning);
      const rect = canvasLayoutElement(canvas).getBoundingClientRect();
      const inTable =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (
        !inTable ||
        !hitCup(
          e.clientX,
          e.clientY,
          canvas,
          camera,
          center,
          latestTuning.cup.hitScreenPx,
          latestTuning.cup.hitRadius,
        )
      ) {
        return;
      }
      beginDragRef.current(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      onPointerDown(e as unknown as PointerEvent);
    };

    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('mousedown', onMouseDown, { capture: true });
    };
  }, [active, camera, canDrag, gl]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || rollingRef.current) return;
      clientXRef.current = e.clientX;
      clientYRef.current = e.clientY;
      recordSample(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      finishDrag(e);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, finishDrag, recordSample]);

  useEffect(() => {
    const target = pointerTarget(gl.domElement);
    if (!active || !canDrag) {
      target.style.cursor = dragging ? 'grabbing' : '';
      return;
    }
    target.style.cursor = dragging ? 'grabbing' : simRolling ? '' : 'grab';
  }, [dragging, active, canDrag, simRolling, gl]);

  useFrame((_, delta) => {
    const latestTuning = tuningRef.current;
    const scaledDelta = delta * latestTuning.world.timeScale;

    if (draggingRef.current && cupPhaseRef.current === 'held') {
      const cup = liveBody(koozieRef.current?.body);
      const state = heldStateRef.current;
      if (cup && state) {
        const canvas = gl.domElement;
        const pivotTarget = pointerOnPlane(
          clientXRef.current,
          clientYRef.current,
          canvas,
          camera,
          latestTuning.cup.floatCenterY,
        );
        clampPivotToTable(pivotTarget, latestTuning);
        const pose = stepHeldPose(state, pivotTarget, scaledDelta, reducedMotion, latestTuning);
        setCupPose(cup, pose);
      }
      return;
    }

    if (!rollingRef.current || finishPendingRef.current) return;
    rollElapsedMsRef.current += scaledDelta * 1000;

    const cup = liveBody(koozieRef.current?.body);
    const pouring = pourStateRef.current;

    if (cup && cupPhaseRef.current === 'pouring' && pouring) {
      pouring.elapsedMs += scaledDelta * 1000;
      const { pose, progress } = pouringPoseAt(pouring, pouring.elapsedMs, latestTuning);
      setCupPose(cup, pose);

      const inside = countUnkeptInside(dieRefs.current, runtimeRef.current, cup, latestTuning);
      if (
        (inside === 0 && progress > 0.55) ||
        progress >= 1 ||
        pouring.elapsedMs > latestTuning.release.tipDurationMs + 900
      ) {
        pourStateRef.current = null;
        cup.setBodyType(RigidBodyType.Fixed, true);
        cup.setLinvel({ x: 0, y: 0, z: 0 }, true);
        cup.setAngvel({ x: 0, y: 0, z: 0 }, true);
        setCupVisible(false);
        setCupPhase('settling');
      }
    }

    if (rollElapsedMsRef.current > latestTuning.settle.timeoutMs) {
      finishWithCurrentFaces();
      return;
    }

    let settled = true;
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible || rt.locked) continue;
      const body = liveBody(dieRefs.current[i]?.body);
      if (!body) {
        settled = false;
        continue;
      }
      clampBodyVelocity(body, latestTuning.dice.maxLinVel, latestTuning.dice.maxAngVel);
      const p = body.translation();
      const px = p.x;
      const py = p.y;
      const pz = p.z;
      if (py < latestTuning.settle.fallThroughY || outsideTable({ x: px, z: pz })) {
        respawnDieOnFelt(i, body);
        settled = false;
        continue;
      }
      const lv = body.linvel();
      const lvx = lv.x;
      const lvy = lv.y;
      const lvz = lv.z;
      const av = body.angvel();
      const speed = Math.hypot(lvx, lvy, lvz);
      const spin = Math.hypot(av.x, av.y, av.z);
      if (speed > latestTuning.settle.linearVelocity || spin > latestTuning.settle.angularVelocity) {
        settled = false;
        break;
      }
    }

    if (settled) {
      settleCountRef.current += 1;
      if (settleCountRef.current >= latestTuning.settle.frames) {
        finishWithCurrentFaces();
      }
    } else {
      settleCountRef.current = 0;
    }
  });

  if (!active) return <TableColliders />;

  const cupBodyType: 'fixed' | 'kinematicPosition' =
    cupPhase === 'held' || cupPhase === 'pouring' ? 'kinematicPosition' : 'fixed';
  const cupLid = cupPhase === 'idle' || cupPhase === 'held';
  const cupGeometryKey = [
    tuning.cup.radius,
    tuning.cup.height,
    tuning.cup.wallThickness,
    tuning.cup.bottomThickness,
    tuning.cup.rimInset,
    tuning.cup.lidThickness,
  ].join(':');

  return (
    <>
      <TableColliders />
      <KoozieBody
        key={`cup-${cupGeometryKey}-${layoutGen}`}
        ref={koozieRef}
        bodyType={cupBodyType}
        position={homePosition(tuning)}
        visible={cupVisible}
        lid={cupLid}
        ccd={cupPhase === 'held' || cupPhase === 'pouring'}
        tuning={tuning}
        onGrabStart={cupPhase === 'idle' && canDrag ? handleKoozieGrab : undefined}
      />
      {runtime.map((rt, i) =>
        rt.visible ? (
          <DieBody
            key={rt.locked ? `die-${i}-locked-${layoutGen}` : `die-${i}-dynamic-${layoutGen}`}
            ref={(el) => {
              dieRefs.current[i] = el;
            }}
            locked={rt.locked}
            pickable={!(rt.inCup && (cupPhase === 'idle' || cupPhase === 'held'))}
            position={rt.position}
            rotation={rt.rotation ?? randomRotation()}
          />
        ) : null,
      )}
    </>
  );
}
