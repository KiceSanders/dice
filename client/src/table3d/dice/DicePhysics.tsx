import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import type { Die } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import * as THREE from 'three';
import DieBody, { type DieBodyHandle } from './DieBody';
import KoozieBody, { type KoozieBodyHandle } from './KoozieBody';
import TableColliders from './TableColliders';
import { DICE_COUNT, DICE_FELT_Y, DIE_HALF, KOOZIE, dieSlotPosition, PHYSICS } from './constants';
import { spawnDiceInCupLocal } from './koozieColliders';
import {
  computeReleaseTiltTarget,
  createDragStateFromPose,
  createHomePose,
  isInsideCup,
  pourDirectionFromRelease,
  stepDragPose,
  tippingPoseAt,
  type KoozieDragState,
  type TippingState,
} from './kooziePose';
import { canvasLayoutElement, hitCup, pointerOnPlane } from './pointerToFelt';
import { quaternionForFace, readTopFace } from './faceValue';
import type { TableDiceProps, ThrowVelocity } from './types';

const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _vec = new THREE.Vector3();
const _home = createHomePose();

type CupPhase = 'idle' | 'dragging' | 'tipping' | 'rolling' | 'hidden';

type DieRuntime = {
  visible: boolean;
  locked: boolean;
  inCup: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
};

type Sample = { x: number; y: number; z: number; t: number };

type CarriedDie = {
  localPos: THREE.Vector3;
  localQuat: THREE.Quaternion;
};


function quatToEuler(q: THREE.Quaternion): [number, number, number] {
  _euler.setFromQuaternion(q);
  return [_euler.x, _euler.y, _euler.z];
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

function buildRuntime(dice: Die[], keepIndices: number[], cupMode: boolean): DieRuntime[] {
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

  return Array.from({ length: DICE_COUNT }, (_, i) => {
    if (kept.has(i)) {
      const value = dice[i];
      const rot = value ? quatToEuler(quaternionForFace(value)) : undefined;
      return {
        visible: true,
        locked: true,
        inCup: false,
        position: dieSlotPosition(i),
        rotation: rot,
      };
    }

    const cupSlot = unkeptIndices.indexOf(i);
    const local = spawnDiceInCupLocal(cupSlot, unkeptIndices.length);
    const pos = cupLocalToWorld(local.position, _home.position, _home.quaternion);
    const value = dice[i];
    return {
      visible: true,
      locked: false,
      inCup: true,
      position: pos,
      rotation: value ? quatToEuler(quaternionForFace(value)) : local.rotation,
    };
  });
}

function clampBodyVelocity(body: NonNullable<DieBodyHandle['body']>, maxLin: number, maxAng: number) {
  const lv = body.linvel();
  const av = body.angvel();
  const speed = Math.hypot(lv.x, lv.y, lv.z);
  if (speed > maxLin) {
    const s = maxLin / speed;
    body.setLinvel({ x: lv.x * s, y: lv.y * s, z: lv.z * s }, true);
  }
  const spin = Math.hypot(av.x, av.y, av.z);
  if (spin > maxAng) {
    const s = maxAng / spin;
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

function blendReleaseVelocity(samples: Sample[], gripVel: THREE.Vector3 | undefined): ThrowVelocity {
  const sampled = sampleVelocity(samples);
  const blend = KOOZIE.gripVelReleaseBlend;
  return {
    x: sampled.x + (gripVel?.x ?? 0) * blend,
    y: sampled.y + (gripVel?.y ?? 0) * blend,
    z: sampled.z + (gripVel?.z ?? 0) * blend,
  };
}

function snapshotCarriedDice(
  carried: Map<number, CarriedDie>,
  runtime: DieRuntime[],
  keepIndices: number[],
) {
  carried.clear();
  const unkeptInCup = Array.from({ length: DICE_COUNT }, (_, i) => i).filter((i) => {
    const rt = runtime[i];
    return rt?.visible && rt.inCup && !keepIndices.includes(i);
  });

  for (const i of unkeptInCup) {
    const rt = runtime[i]!;
    const cupSlot = unkeptInCup.indexOf(i);
    const local = spawnDiceInCupLocal(cupSlot, unkeptInCup.length);
    const localPos = new THREE.Vector3(...local.position);
    const rot = rt.rotation ?? local.rotation;
    _euler.set(rot[0], rot[1], rot[2]);
    const localQuat = new THREE.Quaternion().setFromEuler(_euler);
    carried.set(i, { localPos, localQuat });
  }
}

function syncCarriedDice(
  carried: Map<number, CarriedDie>,
  pose: { position: THREE.Vector3; quaternion: THREE.Quaternion },
  refs: (DieBodyHandle | null)[],
) {
  for (const [i, { localPos, localQuat }] of carried) {
    const body = refs[i]?.body;
    if (!body) continue;
    _vec.copy(localPos).applyQuaternion(pose.quaternion).add(pose.position);
    _quat.copy(pose.quaternion).multiply(localQuat);
    body.setNextKinematicTranslation({ x: _vec.x, y: _vec.y, z: _vec.z });
    body.setNextKinematicRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w });
  }
}

function cupCenterNow(cup: KoozieBodyHandle['body']): readonly [number, number, number] {
  if (!cup) return KOOZIE.home;
  const t = cup.translation();
  return [t.x, t.y, t.z];
}

function pointerTarget(canvas: HTMLCanvasElement): HTMLElement {
  return canvasLayoutElement(canvas);
}

function nudgeDiceOutOfCup(
  refs: (DieBodyHandle | null)[],
  runtime: DieRuntime[],
  pour: THREE.Vector3,
) {
  for (let i = 0; i < DICE_COUNT; i++) {
    const rt = runtime[i];
    if (!rt?.visible || rt.locked) continue;
    const body = refs[i]?.body;
    if (!body) continue;
    body.applyImpulse(
      { x: pour.x * 0.055, y: pour.y * 0.035, z: pour.z * 0.055 },
      true,
    );
  }
}

function countUnkeptInside(refs: (DieBodyHandle | null)[], runtime: DieRuntime[], cupBody: NonNullable<KoozieBodyHandle['body']>): number {
  const t = cupBody.translation();
  const r = cupBody.rotation();
  let inside = 0;
  for (let i = 0; i < DICE_COUNT; i++) {
    const rt = runtime[i];
    if (!rt?.visible || rt.locked) continue;
    const body = refs[i]?.body;
    if (!body) continue;
    const p = body.translation();
    if (isInsideCup(p, t, r)) inside++;
  }
  return inside;
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
  const rollStartRef = useRef(0);
  const releaseTimeRef = useRef(0);
  const cupPhaseRef = useRef<CupPhase>('hidden');
  const dragStateRef = useRef<KoozieDragState | null>(null);
  const tippingRef = useRef<TippingState | null>(null);
  const diceRef = useRef(dice);
  diceRef.current = dice;

  const clientXRef = useRef(0);
  const clientYRef = useRef(0);
  const draggingRef = useRef(false);
  const moveSamples = useRef<Sample[]>([]);
  const spillNudgeMsRef = useRef(0);
  const layoutGenRef = useRef(0);
  const carriedDiceRef = useRef<Map<number, CarriedDie>>(new Map());

  const [cupPhase, setCupPhase] = useState<CupPhase>(active && canDrag ? 'idle' : 'hidden');
  const [cupVisible, setCupVisible] = useState(active && canDrag);
  const [dragging, setDragging] = useState(false);
  const [simRolling, setSimRolling] = useState(false);
  const [layoutGen, setLayoutGen] = useState(0);
  const [runtime, setRuntime] = useState<DieRuntime[]>(() => buildRuntime(dice, keepIndices, canDrag));
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

  const resetToIdleInCup = () => {
    const cupMode = canDragRef.current;
    layoutGenRef.current += 1;
    setLayoutGen(layoutGenRef.current);
    setRuntime(buildRuntime(diceRef.current, keepRef.current, cupMode));
    setCupPhase(cupMode ? 'idle' : 'hidden');
    setCupVisible(cupMode);
    rollingRef.current = false;
    setSimRolling(false);
    settleCountRef.current = 0;
    dragStateRef.current = null;
    tippingRef.current = null;
    spillNudgeMsRef.current = 0;
    carriedDiceRef.current.clear();

    const cup = koozieRef.current?.body;
    if (cup && cupMode) {
      cup.setBodyType(RigidBodyType.Fixed, true);
      cup.setTranslation({ x: KOOZIE.home[0], y: KOOZIE.home[1], z: KOOZIE.home[2] }, true);
      cup.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      cup.setLinvel({ x: 0, y: 0, z: 0 }, true);
      cup.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  };

  useEffect(() => {
    if (rollingRef.current || dragging) return;
    layoutGenRef.current += 1;
    setLayoutGen(layoutGenRef.current);
    setRuntime(buildRuntime(diceRef.current, keepIndices, canDrag));
  }, [keepIndices, dragging, canDrag]);

  const wakeUnkeptDice = useCallback(() => {
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible || rt.locked) continue;
      const body = dieRefs.current[i]?.body;
      if (!body) continue;
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.wakeUp();
    }
  }, []);

  const recordSample = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = gl.domElement;
      const center = pointerOnPlane(clientX, clientY, canvas, camera, KOOZIE.dragPlaneY);
      moveSamples.current.push({ x: center.x, y: center.y, z: center.z, t: performance.now() });
      if (moveSamples.current.length > 24) moveSamples.current.shift();
    },
    [camera, gl],
  );

  const finishDrag = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current || e.button !== 0) return;
      recordSample(e.clientX, e.clientY);
      const dragState = dragStateRef.current;
      const pose = dragState?.pose;
      const velocity = blendReleaseVelocity(moveSamples.current, dragState?.gripVel);
      const releaseSpeed = Math.hypot(velocity.x, velocity.z);
      const cup = koozieRef.current?.body;

      let pourDir = new THREE.Vector3(0, -1, 0);
      if (pose) {
        pourDir = pourDirectionFromRelease(pose, velocity, dragState?.gripVel);
      }

      if (cup && pose) {
        cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
        tippingRef.current = {
          origin: pose.position.clone(),
          from: pose.quaternion.clone(),
          to: computeReleaseTiltTarget(pose, pourDir),
          pourDir,
          releaseSpeed,
          startMs: performance.now(),
        };
        const tipPose = tippingPoseAt(tippingRef.current, performance.now()).pose;
        cup.setNextKinematicTranslation({ x: tipPose.position.x, y: tipPose.position.y, z: tipPose.position.z });
        cup.setNextKinematicRotation({
          x: tipPose.quaternion.x,
          y: tipPose.quaternion.y,
          z: tipPose.quaternion.z,
          w: tipPose.quaternion.w,
        });
      }

      if (pose && carriedDiceRef.current.size > 0) {
        syncCarriedDice(carriedDiceRef.current, pose, dieRefs.current);
      }
      carriedDiceRef.current.clear();
      wakeUnkeptDice();
      nudgeDiceOutOfCup(dieRefs.current, runtimeRef.current, pourDir);

      rollingRef.current = true;
      rollStartRef.current = performance.now();
      releaseTimeRef.current = performance.now();
      draggingRef.current = false;
      cupPhaseRef.current = 'tipping';
      setDragging(false);
      setCupPhase('tipping');
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

      const cup = koozieRef.current?.body;
      if (cup) {
        cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
        cup.wakeUp();
        const t = cup.translation();
        const r = cup.rotation();
        _quat.set(r.x, r.y, r.z, r.w);
        dragStateRef.current = createDragStateFromPose({
          position: new THREE.Vector3(t.x, t.y, t.z),
          quaternion: _quat.clone(),
        });
        snapshotCarriedDice(carriedDiceRef.current, runtimeRef.current, keepRef.current);
      }

      draggingRef.current = true;
      cupPhaseRef.current = 'dragging';
      setDragging(true);
      setCupPhase('dragging');
      onDragChangeRef.current?.(true);
    },
    [recordSample],
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
      const center = cupCenterNow(koozieRef.current?.body ?? null);
      const rect = canvasLayoutElement(canvas).getBoundingClientRect();
      const inTable =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (
        !inTable ||
        !hitCup(e.clientX, e.clientY, canvas, camera, center, KOOZIE.hitScreenPx, KOOZIE.hitRadius)
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

  useLayoutEffect(() => {
    if (cupPhase !== 'dragging') return;
    const pose = dragStateRef.current?.pose;
    if (!pose || carriedDiceRef.current.size === 0) return;
    syncCarriedDice(carriedDiceRef.current, pose, dieRefs.current);
  }, [cupPhase]);

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
  }, [active]);

  useEffect(() => {
    if (!active || rollingRef.current || draggingRef.current) return;
    resetToIdleInCup();
  }, [canDrag, active]);

  useEffect(() => {
    if (!active || rollingRef.current) return;
    const id = requestAnimationFrame(() => {
      const home = createHomePose();
      const unkept = runtimeRef.current
        .map((rt, i) => ({ rt, i }))
        .filter(({ rt, i }) => rt.visible && !rt.locked && !keepRef.current.includes(i));

      for (const { rt, i } of unkept) {
        const body = dieRefs.current[i]?.body;
        if (!body) continue;
        body.setBodyType(rt.inCup ? RigidBodyType.Fixed : RigidBodyType.Dynamic, true);
        body.setTranslation({ x: rt.position[0], y: rt.position[1], z: rt.position[2] }, true);
        if (rt.rotation) {
          _euler.set(rt.rotation[0], rt.rotation[1], rt.rotation[2]);
          _quat.setFromEuler(_euler);
          body.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
        }
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.sleep();
      }

      const cup = koozieRef.current?.body;
      if (cup && cupPhaseRef.current === 'idle') {
        cup.setTranslation({ x: home.position.x, y: home.position.y, z: home.position.z }, true);
        cup.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [layoutGen, active]);

  useEffect(() => {
    const target = pointerTarget(gl.domElement);
    if (!active || !canDrag) {
      target.style.cursor = dragging ? 'grabbing' : '';
      return;
    }
    target.style.cursor = dragging ? 'grabbing' : simRolling ? '' : 'grab';
  }, [dragging, active, canDrag, simRolling, gl]);

  useFrame((_, delta) => {
    if (draggingRef.current && cupPhaseRef.current === 'dragging') {
      const cup = koozieRef.current?.body;
      const state = dragStateRef.current;
      if (cup && state) {
        const canvas = gl.domElement;
        const gripTarget = pointerOnPlane(
          clientXRef.current,
          clientYRef.current,
          canvas,
          camera,
          KOOZIE.dragPlaneY,
        );
        const pose = stepDragPose(state, gripTarget, delta, reducedMotion);
        cup.setNextKinematicTranslation({ x: pose.position.x, y: pose.position.y, z: pose.position.z });
        cup.setNextKinematicRotation({
          x: pose.quaternion.x,
          y: pose.quaternion.y,
          z: pose.quaternion.z,
          w: pose.quaternion.w,
        });
        syncCarriedDice(carriedDiceRef.current, pose, dieRefs.current);
      }
      return;
    }

    if (!rollingRef.current) return;

    const cup = koozieRef.current?.body;
    const tipping = tippingRef.current;

    if (cup && cupPhaseRef.current === 'tipping' && tipping) {
      const { pose, progress } = tippingPoseAt(tipping, performance.now());
      cup.setNextKinematicTranslation({ x: pose.position.x, y: pose.position.y, z: pose.position.z });
      cup.setNextKinematicRotation({
        x: pose.quaternion.x,
        y: pose.quaternion.y,
        z: pose.quaternion.z,
        w: pose.quaternion.w,
      });

      const inside = countUnkeptInside(dieRefs.current, runtimeRef.current, cup);
      const elapsed = performance.now() - releaseTimeRef.current;
      const now = performance.now();
      if (progress > 0.45 && inside > 0 && now - spillNudgeMsRef.current > 140) {
        spillNudgeMsRef.current = now;
        nudgeDiceOutOfCup(dieRefs.current, runtimeRef.current, tipping.pourDir);
      }
      if ((inside === 0 && progress > 0.55) || (progress > 0.92 && elapsed > 1200) || elapsed > 2800) {
        tippingRef.current = null;
        cup.setBodyType(RigidBodyType.Fixed, true);
        cup.setLinvel({ x: 0, y: 0, z: 0 }, true);
        cup.setAngvel({ x: 0, y: 0, z: 0 }, true);
        setCupVisible(false);
        setCupPhase('rolling');
      }
    }

    if (performance.now() - rollStartRef.current > 10000) {
      rollingRef.current = false;
      onRollingChangeRef.current?.(false);
      const values: Die[] = [];
      for (let i = 0; i < HAND_SIZE; i++) {
        const body = dieRefs.current[i]?.body;
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
      resetToIdleInCup();
      return;
    }

    let settled = true;
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible || rt.locked) continue;
      const body = dieRefs.current[i]?.body;
      if (!body) {
        settled = false;
        continue;
      }
      clampBodyVelocity(body, PHYSICS.maxLinVel, PHYSICS.maxAngVel);
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
          const body = dieRefs.current[i]?.body;
          if (!body) {
            values.push(diceRef.current[i] ?? 1);
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
        resetToIdleInCup();
      }
    } else {
      settleCountRef.current = 0;

      const elapsed = performance.now() - releaseTimeRef.current;
      if (elapsed > 3000 && cup && cupVisible) {
        for (let i = 0; i < DICE_COUNT; i++) {
          const rt = runtimeRef.current[i];
          if (!rt?.visible || rt.locked) continue;
          const body = dieRefs.current[i]?.body;
          if (!body || !cup) continue;
          const p = body.translation();
          const t = cup.translation();
          const r = cup.rotation();
          if (isInsideCup(p, t, r)) {
            body.applyImpulse({ x: 0, y: 0.08, z: 0 }, true);
          }
        }
      }
    }
  });

  if (!active) return <TableColliders />;

  const cupBodyType: 'fixed' | 'kinematicPosition' =
    cupPhase === 'dragging' || cupPhase === 'tipping' ? 'kinematicPosition' : 'fixed';

  return (
    <>
      <TableColliders />
      <KoozieBody
        ref={koozieRef}
        bodyType={cupBodyType}
        position={[...KOOZIE.home]}
        visible={cupVisible}
        ccd={cupPhase === 'dragging' || cupPhase === 'tipping'}
        onGrabStart={cupPhase === 'idle' && canDrag ? handleKoozieGrab : undefined}
      />
      {runtime.map((rt, i) =>
        rt.visible ? (
          <DieBody
            key={
              rt.locked
                ? `die-${i}-locked-${layoutGen}`
                : `die-${i}-cup-${layoutGen}`
            }
            ref={(el) => {
              dieRefs.current[i] = el;
            }}
            locked={rt.locked || (rt.inCup && cupPhase === 'idle')}
            driven={rt.inCup && cupPhase === 'dragging' && !rt.locked}
            pickable={!(rt.inCup && (cupPhase === 'idle' || cupPhase === 'dragging'))}
            position={rt.position}
            rotation={rt.rotation ?? randomRotation()}
          />
        ) : null,
      )}
    </>
  );
}
