import type { BodyPose, Die, PoseFrame } from '@dice/shared';
import { HAND_SIZE } from '@dice/shared';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useTableEvent } from '../tableEvents';
import {
  BONUS_DICE_COUNT,
  DICE_COUNT,
  DICE_FELT_Y,
  DIE_HALF,
  dieSlotPosition,
  FELT_BOUND_X,
  FELT_BOUND_Z,
} from './constants';
import {
  type CupPhase,
  cupStreamingVisible,
  initialCupPhase,
  isAllowedCupTransition,
  poseSampleIntervalMs,
} from './cupPhaseMachine';
import DieBody, { type DieBodyHandle } from './DieBody';
import { poseFrameFromRuntime } from './diceDisplayPose';
import {
  keepSlotForIndex,
  keptDieRailPosition,
  koozieRestPosition,
  resolveUnkeepPose,
} from './diceLayout';
import {
  blendReleaseVelocity,
  canvasLayoutElement,
  clampPivotToTable,
  hitCup,
  type MoveSample,
  pointerBelowNearDockGuard,
  pointerOnPlane,
  pointerTarget,
  recordPivotSample,
} from './dicePointer';
import {
  buildRuntime,
  cupLocalToWorld,
  type DieRuntime,
  eulerToQuat,
  quatToEuler,
} from './diceRuntime';
import { buildSelectingRuntime, type DiePose } from './diceSettleHandoff';
import { quaternionForFace, readTopFace } from './faceValue';
import KoozieBody, { type KoozieBodyHandle } from './KoozieBody';
import { spawnDiceInCupLocal } from './koozieColliders';
import {
  createHeldStateFromPose,
  createPourState,
  isInsideCup,
  type KoozieHeldState,
  type KooziePourState,
  pouringPoseAt,
  stepHeldPose,
} from './koozieMotion';
import { STRAIGHT_GLOW } from './straightGlow';
import TableColliders from './TableColliders';
import { type DicePhysicsTuning, getDicePhysicsTuning, useDicePhysicsTuning } from './tuning';
import type { TableDiceProps } from './types';
import { useStraightGlow } from './useStraightGlow';

declare global {
  interface Window {
    /**
     * Dev-only settle override: with 5 faces set, the next settle reports them
     * instead of the physics read (kept dice keep their committed values so
     * the server's kept-unchanged check still passes). The only way to force a
     * straight through the physics path — e.g. in the console:
     * `window.__forceSettleFaces = [1, 2, 3, 4, 5]` (delete to stop).
     */
    __forceSettleFaces?: number[];
  }
}

const _quat = new THREE.Quaternion();

type Sample = MoveSample;

function homePosition(tuning: DicePhysicsTuning): [number, number, number] {
  return koozieRestPosition(tuning.cup);
}

function isOutsidePlayBounds(point: { x: number; z: number }, tuning: DicePhysicsTuning): boolean {
  const margin = tuning.cup.radius + 0.16;
  const a = Math.max(FELT_BOUND_X - margin, 0.1);
  const b = Math.max(FELT_BOUND_Z - margin, 0.1);
  const nx = point.x / a;
  const nz = point.z / b;
  return Math.hypot(nx, nz) > 1;
}

/**
 * Fallback orientation for runtime entries without one. Must be a stable
 * constant: rotation is a reactive RigidBody prop, so a value computed per
 * render (the old `randomRotation()`) re-oriented dice on every unrelated
 * re-render — hover state changes made dice visibly jitter under the mouse.
 */
const ZERO_ROTATION: [number, number, number] = [0, 0, 0];

/** Pose-stream sampling intervals (ADR 004). */
const POSE_SAMPLE_FAST_MS = 50; // held / pouring / settling
const POSE_SAMPLE_SLOW_MS = 250; // selecting (kept-rail moves only)

const roundMm = (v: number) => Math.round(v * 1000) / 1000;

function readBodyPose(body: {
  translation(): { x: number; y: number; z: number };
  rotation(): { x: number; y: number; z: number; w: number };
}): BodyPose {
  const t = body.translation();
  const r = body.rotation();
  return [
    roundMm(t.x),
    roundMm(t.y),
    roundMm(t.z),
    roundMm(r.x),
    roundMm(r.y),
    roundMm(r.z),
    roundMm(r.w),
  ];
}

function clampBodyVelocity(
  body: NonNullable<DieBodyHandle['body']>,
  maxLin: number,
  maxAng: number,
) {
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

function cupCenterNow(
  cup: KoozieBodyHandle['body'],
  tuning: DicePhysicsTuning,
): readonly [number, number, number] {
  const body = liveBody(cup);
  if (!body) return homePosition(tuning);
  const t = body.translation();
  return [t.x, t.y, t.z];
}

function setCupPose(
  cup: NonNullable<KoozieBodyHandle['body']>,
  pose: { position: THREE.Vector3; quaternion: THREE.Quaternion },
) {
  cup.setNextKinematicTranslation({ x: pose.position.x, y: pose.position.y, z: pose.position.z });
  cup.setNextKinematicRotation({
    x: pose.quaternion.x,
    y: pose.quaternion.y,
    z: pose.quaternion.z,
    w: pose.quaternion.w,
  });
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
  for (let i = 0; i < runtime.length; i++) {
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
  return body?.isValid() ? body : null;
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
  bonusMode = false,
  keepIndices,
  dice,
  active,
  onSettled,
  onRollingChange,
  onRelease,
  onDragChange,
  canDrag = true,
  onKeepToggle,
  onPoseFrame,
}: TableDiceProps) {
  const { camera, gl } = useThree();
  const tuning = useDicePhysicsTuning();
  const runtimeDiceCount = bonusMode ? BONUS_DICE_COUNT : DICE_COUNT;
  const dieRefs = useRef<(DieBodyHandle | null)[]>(Array(runtimeDiceCount).fill(null));
  const koozieRef = useRef<KoozieBodyHandle | null>(null);
  const rollingRef = useRef(false);
  const settleCountRef = useRef(0);
  const keepRef = useRef(keepIndices);
  const onKeepToggleRef = useRef(onKeepToggle);
  const feltPoseRef = useRef<(DiePose | null)[]>(Array(runtimeDiceCount).fill(null));
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

  // Pose streaming (ADR 004). Last-known poses cover bodies that are briefly
  // gone from the world (the cup rigid body unmounts while hidden).
  const onPoseFrameRef = useRef(onPoseFrame);
  const streamStartRef = useRef<number | null>(null);
  const lastPoseSampleRef = useRef(0);
  const lastCupPoseRef = useRef<BodyPose>(
    (() => {
      const [x, y, z] = homePosition(tuning);
      return [x, y, z, 0, 0, 0, 1] as BodyPose;
    })(),
  );
  const lastDiePosesRef = useRef<BodyPose[]>(
    Array.from({ length: runtimeDiceCount }, (_, i) => {
      const [x, y, z] = dieSlotPosition(i);
      return [x, y, z, 0, 0, 0, 1];
    }),
  );

  const [cupPhase, setCupPhase] = useState<CupPhase>(() => initialCupPhase(active, canDrag));
  const [cupPosition, setCupPosition] = useState<[number, number, number]>(() =>
    homePosition(tuning),
  );
  const [cupVisible, setCupVisible] = useState(active && canDrag);
  const [dragging, setDragging] = useState(false);
  const [simRolling, setSimRolling] = useState(false);
  const [hoveringKoozie, setHoveringKoozie] = useState(false);
  const [hoveringDie, setHoveringDie] = useState(false);
  const dieHoverCountRef = useRef(0);
  const [layoutGen, setLayoutGen] = useState(0);
  const [runtime, setRuntime] = useState<DieRuntime[]>(() =>
    buildRuntime(dice, keepIndices, canDrag, tuning, bonusMode),
  );
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const {
    glow: straightGlow,
    start: startStraightGlow,
    clear: clearStraightGlow,
  } = useStraightGlow();

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const transitionCupPhase = useCallback((next: CupPhase) => {
    const from = cupPhaseRef.current;
    if (import.meta.env.DEV && !isAllowedCupTransition(from, next)) {
      console.warn(`[dice] unexpected cup phase transition: ${from} -> ${next}`);
    }
    cupPhaseRef.current = next;
    setCupPhase(next);
  }, []);

  onSettledRef.current = onSettled;
  onRollingChangeRef.current = onRollingChange;
  onReleaseRef.current = onRelease;
  onDragChangeRef.current = onDragChange;
  onPoseFrameRef.current = onPoseFrame;
  canDragRef.current = canDrag;
  keepRef.current = keepIndices;
  onKeepToggleRef.current = onKeepToggle;
  draggingRef.current = dragging;
  cupPhaseRef.current = cupPhase;

  const resetToIdleInCup = useCallback(
    (nextDice?: Die[]) => {
      const latestTuning = getDicePhysicsTuning();
      const cupMode = canDragRef.current;
      clearStraightGlow();
      // The layoutGen bump remounts the cup and dice at their declarative
      // positions — never mix in imperative teleports (rapier skips mesh sync
      // for fixed bodies, and the old bodies unmount anyway).
      skipDiceLayoutRef.current = true;
      layoutGenRef.current += 1;
      setLayoutGen(layoutGenRef.current);
      setRuntime(
        buildRuntime(
          nextDice ?? diceRef.current,
          keepRef.current,
          cupMode,
          latestTuning,
          bonusMode,
        ),
      );
      setCupPosition(homePosition(latestTuning));
      transitionCupPhase(cupMode ? 'idle' : 'hidden');
      setCupVisible(cupMode);
      rollingRef.current = false;
      rollElapsedMsRef.current = 0;
      setSimRolling(false);
      settleCountRef.current = 0;
      heldStateRef.current = null;
      pourStateRef.current = null;
      feltPoseRef.current = Array(runtimeDiceCount).fill(null);
    },
    [bonusMode, clearStraightGlow, runtimeDiceCount, transitionCupPhase],
  );

  const enterSelectingPhase = useCallback(
    (values: Die[], keepKoozieHidden = false) => {
      const latestTuning = getDicePhysicsTuning();
      const kept = keepRef.current;

      const livePoses: (DiePose | null)[] = Array.from({ length: DICE_COUNT }, (_, i) => {
        if (kept.includes(i)) return null;
        const body = liveBody(dieRefs.current[i]?.body);
        if (!body) return null;
        const t = body.translation();
        const r = body.rotation();
        _quat.set(r.x, r.y, r.z, r.w);
        return {
          position: [t.x, t.y, t.z],
          rotation: quatToEuler(_quat),
        };
      });

      const { runtime: nextRuntime, feltPoses } = buildSelectingRuntime(
        values,
        kept,
        livePoses,
        diceRef.current,
        feltPoseRef.current,
      );
      feltPoseRef.current = feltPoses;

      setRuntime(nextRuntime);
      setCupPosition(homePosition(latestTuning));
      transitionCupPhase('selecting');
      setCupVisible(canDragRef.current && !keepKoozieHidden);
      rollingRef.current = false;
      rollElapsedMsRef.current = 0;
      setSimRolling(false);
      settleCountRef.current = 0;
      heldStateRef.current = null;
      pourStateRef.current = null;
    },
    [transitionCupPhase],
  );

  const applyKeepLayout = useCallback((kept: number[]) => {
    const phase = cupPhaseRef.current;
    if (phase !== 'selecting') return;
    const keptSorted = [...kept].sort((a, b) => a - b);

    // Declarative-only: DieBody position/rotation props move both the mesh and
    // (via rapier's prop effect) the fixed body.
    const next = [...runtimeRef.current];
    for (let i = 0; i < DICE_COUNT; i++) {
      const rt = next[i];
      if (!rt?.visible) continue;

      if (kept.includes(i)) {
        const slot = keepSlotForIndex(i, keptSorted);
        const value = diceRef.current[i];
        const rotation = value ? quatToEuler(quaternionForFace(value)) : rt.rotation;
        next[i] = {
          ...rt,
          locked: true,
          inCup: false,
          position: keptDieRailPosition(slot, keptSorted.length),
          rotation,
        };
      } else {
        const felt = feltPoseRef.current[i] ?? null;
        const pose = resolveUnkeepPose(i, felt);
        if (!felt) feltPoseRef.current[i] = pose;
        next[i] = {
          ...rt,
          locked: true,
          inCup: false,
          position: pose.position,
          rotation: pose.rotation,
        };
      }
    }
    runtimeRef.current = next;
    setRuntime(next);
    const now = performance.now();
    const frame = poseFrameFromRuntime(
      next,
      lastCupPoseRef.current,
      Math.round(now - (streamStartRef.current ?? now)),
      cupStreamingVisible(phase),
    );
    if (frame) {
      lastDiePosesRef.current = frame.bodies.slice(1) as BodyPose[];
      onPoseFrameRef.current?.(frame);
    }
  }, []);

  const wakeUnkeptDice = useCallback(() => {
    for (let i = 0; i < runtimeRef.current.length; i++) {
      const rt = runtimeRef.current[i];
      if (!rt?.visible || rt.locked || !rt.inCup) continue;
      const body = liveBody(dieRefs.current[i]?.body);
      if (!body) continue;
      body.setBodyType(RigidBodyType.Dynamic, true);
      body.wakeUp();
    }
  }, []);

  const pullUnkeptDiceIntoCup = useCallback((opts?: { includeCupDice?: boolean }) => {
    const latestTuning = tuningRef.current;
    const cup = liveBody(koozieRef.current?.body);
    if (!cup) return;

    const t = cup.translation();
    const cupPos = new THREE.Vector3(t.x, t.y, t.z);
    const r = cup.rotation();
    const cupQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);

    const kept = new Set(keepRef.current);
    const unkeptIndices = Array.from({ length: runtimeRef.current.length }, (_, i) => i).filter(
      (i) => {
        const rt = runtimeRef.current[i];
        if (kept.has(i) || !rt?.visible) return false;
        // Dice already sitting in the cup normally stay put; when the cup just
        // teleported off its dock they must come along or they'd be stranded
        // outside the containment wall.
        return opts?.includeCupDice || !rt.inCup || rt.meshVisible === false;
      },
    );
    if (unkeptIndices.length === 0) return;

    const nextRuntime = [...runtimeRef.current];
    for (const i of unkeptIndices) {
      const cupSlot = unkeptIndices.indexOf(i);
      const local = spawnDiceInCupLocal(cupSlot, unkeptIndices.length, latestTuning.cup);
      const worldPos = cupLocalToWorld(local.position, cupPos, cupQuat);
      nextRuntime[i] = {
        visible: true,
        meshVisible: true,
        locked: false,
        inCup: true,
        position: worldPos,
        rotation: local.rotation,
      };
      const body = liveBody(dieRefs.current[i]?.body);
      if (body) {
        const rot = local.rotation ?? [0, 0, 0];
        const q = eulerToQuat(rot);
        body.setBodyType(RigidBodyType.Dynamic, true);
        body.setTranslation({ x: worldPos[0], y: worldPos[1], z: worldPos[2] }, true);
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.wakeUp();
      }
    }
    runtimeRef.current = nextRuntime;
    setRuntime(nextRuntime);
  }, []);

  const readCurrentDieValues = useCallback(
    (fallbackDice?: Die[]): Die[] => {
      // Dev-only settle override (see the Window declaration above): substitutes
      // unkept faces only, so the server's kept-unchanged check still passes.
      const forcedRaw = import.meta.env.DEV ? window.__forceSettleFaces : undefined;
      const forced =
        forcedRaw?.length === HAND_SIZE &&
        forcedRaw.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)
          ? (forcedRaw as Die[])
          : null;

      const values: Die[] = [];
      for (let i = 0; i < runtimeDiceCount; i++) {
        if (keepRef.current.includes(i) && diceRef.current[i]) {
          values.push(diceRef.current[i]!);
          continue;
        }
        if (forced && i < HAND_SIZE) {
          values.push(forced[i]!);
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
    },
    [runtimeDiceCount],
  );

  const samplePoseFrame = useCallback(
    (now: number): PoseFrame => {
      const phase = cupPhaseRef.current;
      const cup = liveBody(koozieRef.current?.body);
      if (cup) lastCupPoseRef.current = readBodyPose(cup);
      const bodies: BodyPose[] = [lastCupPoseRef.current];
      for (let i = 0; i < runtimeDiceCount; i++) {
        const body = liveBody(dieRefs.current[i]?.body);
        if (body) lastDiePosesRef.current[i] = readBodyPose(body);
        bodies.push(lastDiePosesRef.current[i]!);
      }
      return {
        t: Math.round(now - (streamStartRef.current ?? now)),
        bodies,
        // Parked/hidden cup is roller-only UX; spectators see it while carried.
        cupVisible: cupStreamingVisible(phase),
      };
    },
    [runtimeDiceCount],
  );

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
        const settleFrame = samplePoseFrame(performance.now());
        onPoseFrameRef.current?.(settleFrame);
        onRollingChangeRef.current?.(false);
        const keepKoozieHidden = onSettledRef.current(values, settleFrame) === true;
        if (bonusMode) {
          // Leave the settled sixth die visible during the server-owned
          // after-roll quiet window; the component unmounts when the delayed
          // bonus result advances the turn. Only the cup hides immediately.
          transitionCupPhase('hidden');
          setCupVisible(false);
          return;
        }
        enterSelectingPhase(values, keepKoozieHidden);
      });
    },
    [bonusMode, readCurrentDieValues, enterSelectingPhase, samplePoseFrame, transitionCupPhase],
  );

  const recordSample = useCallback(
    (clientX: number, clientY: number) => {
      recordPivotSample(
        moveSamples.current,
        clientX,
        clientY,
        gl.domElement,
        camera,
        tuningRef.current,
      );
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
        pullUnkeptDiceIntoCup();
        pourStateRef.current = createPourState(pose, velocity, heldState?.pivotVel, latestTuning);
        const { pose: pourPose } = pouringPoseAt(pourStateRef.current, 0, latestTuning);
        setCupPose(cup, pourPose);
      }

      wakeUnkeptDice();
      rollingRef.current = true;
      rollElapsedMsRef.current = 0;
      draggingRef.current = false;
      setDragging(false);
      transitionCupPhase('pouring');
      setSimRolling(true);
      onDragChangeRef.current?.(false);
      onRollingChangeRef.current?.(true);
      onReleaseRef.current(velocity);
    },
    [recordSample, wakeUnkeptDice, pullUnkeptDiceIntoCup, transitionCupPhase],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (rollingRef.current || draggingRef.current || !canDragRef.current) {
        return;
      }

      // Picking the cup back up ends the celebration early.
      clearStraightGlow();

      moveSamples.current = [];
      clientXRef.current = clientX;
      clientYRef.current = clientY;
      recordSample(clientX, clientY);

      const latestTuning = tuningRef.current;
      const phase = cupPhaseRef.current;
      const fromRest = phase === 'idle' || phase === 'selecting';
      const cup = liveBody(koozieRef.current?.body);

      const teleportCupToPlayBounds = () => {
        if (!cup) return;
        const canvas = gl.domElement;
        const pivot = pointerOnPlane(
          clientX,
          clientY,
          canvas,
          camera,
          latestTuning.cup.floatCenterY,
        );
        clampPivotToTable(pivot, latestTuning);
        const cupPose: [number, number, number] = [pivot.x, latestTuning.cup.floatCenterY, pivot.z];
        setCupPosition(cupPose);
        cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
        cup.setTranslation({ x: cupPose[0], y: cupPose[1], z: cupPose[2] }, true);
        cup.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      };

      // The resting/parked cup lives outside the play bounds and cannot be
      // dragged from there: grabbing it teleports it onto the felt under the
      // pointer, then the drag continues normally.
      if (fromRest && cup) {
        const t = cup.translation();
        if (phase === 'selecting' || isOutsidePlayBounds({ x: t.x, z: t.z }, latestTuning)) {
          teleportCupToPlayBounds();
          pullUnkeptDiceIntoCup({ includeCupDice: true });
        }
      }

      if (cup) {
        if (!fromRest) {
          cup.setBodyType(RigidBodyType.KinematicPositionBased, true);
          cup.wakeUp();
        }
        const t = cup.translation();
        const cupPos = new THREE.Vector3(t.x, t.y, t.z);
        const r = cup.rotation();
        _quat.set(r.x, r.y, r.z, r.w);
        heldStateRef.current = createHeldStateFromPose(
          {
            position: cupPos,
            quaternion: _quat.clone(),
          },
          latestTuning,
        );
      }

      if (!fromRest) pullUnkeptDiceIntoCup();
      if (!fromRest) wakeUnkeptDice();
      draggingRef.current = true;
      setDragging(true);
      transitionCupPhase('held');
      setHoveringKoozie(false);
      onDragChangeRef.current?.(true);
    },
    [recordSample, wakeUnkeptDice, pullUnkeptDiceIntoCup, gl, camera, transitionCupPhase],
  );

  const handleDieClick = useCallback(
    (index: number) => {
      const phase = cupPhaseRef.current;
      if (phase !== 'selecting' || !canDragRef.current) return;
      const next = onKeepToggleRef.current?.(index);
      if (next) {
        keepRef.current = next;
        applyKeepLayout(next);
      }
    },
    [applyKeepLayout],
  );

  const handleDiePointerEnter = useCallback(() => {
    dieHoverCountRef.current += 1;
    setHoveringDie(true);
  }, []);

  const handleDiePointerLeave = useCallback(() => {
    dieHoverCountRef.current = Math.max(0, dieHoverCountRef.current - 1);
    setHoveringDie(dieHoverCountRef.current > 0);
  }, []);

  const handleKoozieGrab = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0) return;
      // The docked cup's pick mesh can overlap the kept-rail die zone; only the
      // rim band below the kept-die tops may start a grab.
      if (!pointerBelowNearDockGuard(event.clientY, gl.domElement, camera)) return;
      beginDrag(event.clientX, event.clientY);
    },
    [beginDrag, camera, gl],
  );

  // Hover mirrors the grab guard exactly: the `grab` cursor shows only where a
  // click would actually pick the cup up, not on the kept-rail die zone.
  const handleKoozieHover = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      setHoveringKoozie(pointerBelowNearDockGuard(event.clientY, gl.domElement, camera));
    },
    [camera, gl],
  );

  const beginDragRef = useRef(beginDrag);
  beginDragRef.current = beginDrag;

  useEffect(() => {
    if (rollingRef.current || dragging) return;
    if (cupPhaseRef.current === 'selecting' || (bonusMode && cupPhaseRef.current === 'hidden')) {
      return;
    }
    if (skipDiceLayoutRef.current) {
      skipDiceLayoutRef.current = false;
      return;
    }
    layoutGenRef.current += 1;
    setLayoutGen(layoutGenRef.current);
    setRuntime(buildRuntime(diceRef.current, keepIndices, canDrag, tuningRef.current, bonusMode));
  }, [dice, keepIndices, dragging, canDrag, bonusMode]);

  useEffect(() => {
    if (cupPhaseRef.current !== 'selecting' && cupPhaseRef.current !== 'held') return;
    applyKeepLayout(keepIndices);
  }, [keepIndices, applyKeepLayout]);

  // Self-heal from the authoritative roll snapshot too. The synchronous settle
  // prediction can differ only if settings changed in flight; the incoming dice
  // then restore the server's canDrag decision without an early cup flash.
  useEffect(() => {
    if (cupPhaseRef.current === 'selecting') setCupVisible(canDrag);
  }, [canDrag, dice]);

  // Every renderer, including the roller, starts the straight celebration from
  // the same delayed table event. Replay covers a view that mounts just after
  // the quiet window elapsed.
  useTableEvent(
    'straight',
    (event) => {
      startStraightGlow(event.dice);
    },
    { replayLastMs: STRAIGHT_GLOW.cueMaxAgeMs },
  );

  useEffect(() => {
    if (!active) {
      rollingRef.current = false;
      settleCountRef.current = 0;
      moveSamples.current = [];
      draggingRef.current = false;
      setDragging(false);
      setSimRolling(false);
      transitionCupPhase('hidden');
      setCupVisible(false);
      clearStraightGlow();
      setRuntime(
        Array.from({ length: runtimeDiceCount }, () => ({
          visible: false,
          locked: false,
          inCup: false,
          position: [0, DIE_HALF, 0] as [number, number, number],
        })),
      );
      return;
    }

    if (!rollingRef.current && !draggingRef.current) {
      if (diceRef.current.length === 0) {
        resetToIdleInCup();
      }
    }
  }, [active, resetToIdleInCup, clearStraightGlow, runtimeDiceCount, transitionCupPhase]);

  useEffect(() => {
    if (
      !active ||
      rollingRef.current ||
      draggingRef.current ||
      cupPhaseRef.current === 'selecting'
    ) {
      return;
    }
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
    resetToIdleInCup,
  ]);

  useEffect(() => {
    if (!active || !canDrag) return;
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || rollingRef.current || draggingRef.current || !canDragRef.current)
        return;
      if (cupPhaseRef.current !== 'idle' && cupPhaseRef.current !== 'selecting') return;
      // The projection is owned by FixedCamera (pinned 16:9 aspect + top-band
      // view offset) — never resync aspect from the canvas element here; the
      // canvas is intentionally taller than the virtual frame.
      camera.updateMatrixWorld();
      const latestTuning = tuningRef.current;
      const center = cupCenterNow(koozieRef.current?.body ?? null, latestTuning);
      const rect = canvasLayoutElement(canvas).getBoundingClientRect();
      const inTable =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      // Guard rejections must fall through untouched (no preventDefault /
      // stopPropagation) so the r3f die handlers still receive the click.
      if (
        !inTable ||
        !pointerBelowNearDockGuard(e.clientY, canvas, camera) ||
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
    if (!active || !canDrag) return;

    // The canvas must remain vertically scrollable until the koozie is
    // actually grabbed. Once a cup drag starts, cancel touch movement at the
    // window boundary so the same gesture moves the cup instead of the page.
    // This must be non-passive: passive touch listeners cannot prevent scroll.
    const lockScrollDuringKoozieDrag = (event: TouchEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
    };

    window.addEventListener('touchmove', lockScrollDuringKoozieDrag, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener('touchmove', lockScrollDuringKoozieDrag, { capture: true });
    };
  }, [active, canDrag]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || rollingRef.current) return;
      if (e.cancelable) e.preventDefault();
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
    const canGrabKoozie =
      canDrag && (cupPhase === 'idle' || cupPhase === 'selecting') && !simRolling;
    if (!active || !canDrag) {
      target.style.cursor = dragging ? 'grabbing' : '';
      return;
    }
    target.style.cursor = dragging
      ? 'grabbing'
      : simRolling
        ? ''
        : hoveringDie
          ? 'pointer'
          : hoveringKoozie && canGrabKoozie
            ? 'grab'
            : '';
  }, [dragging, active, canDrag, simRolling, hoveringKoozie, hoveringDie, cupPhase, gl]);

  useFrame((_, delta) => {
    const latestTuning = tuningRef.current;
    const scaledDelta = delta * latestTuning.world.timeScale;

    // Pose streaming runs before the phase logic — 'held' returns early below.
    if (onPoseFrameRef.current) {
      const phase = cupPhaseRef.current;
      const fast = phase === 'held' || phase === 'pouring' || phase === 'settling';
      const slow = phase === 'selecting';
      if (fast || slow) {
        const now = performance.now();
        if (streamStartRef.current === null) {
          streamStartRef.current = now;
          lastPoseSampleRef.current = 0;
        }
        if (
          now - lastPoseSampleRef.current >=
          poseSampleIntervalMs(phase, POSE_SAMPLE_FAST_MS, POSE_SAMPLE_SLOW_MS)
        ) {
          lastPoseSampleRef.current = now;
          onPoseFrameRef.current(samplePoseFrame(now));
        }
      } else {
        streamStartRef.current = null;
      }
    }

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
        // Cap in-cup energy while the kinematic trimesh moves — settle clamps
        // alone left drag free to explode on laggy frames (ADR 002).
        for (let i = 0; i < runtimeRef.current.length; i++) {
          const rt = runtimeRef.current[i];
          if (!rt?.visible || rt.locked) continue;
          const body = liveBody(dieRefs.current[i]?.body);
          if (!body) continue;
          clampBodyVelocity(body, latestTuning.dice.heldMaxLinVel, latestTuning.dice.heldMaxAngVel);
        }
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
        transitionCupPhase('settling');
      }
    }

    if (rollElapsedMsRef.current > latestTuning.settle.timeoutMs) {
      finishWithCurrentFaces();
      return;
    }

    let settled = true;
    for (let i = 0; i < runtimeRef.current.length; i++) {
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
      if (
        speed > latestTuning.settle.linearVelocity ||
        spin > latestTuning.settle.angularVelocity
      ) {
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
  const canGrabKoozie = canDrag && (cupPhase === 'idle' || cupPhase === 'selecting') && !simRolling;
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
        position={cupPosition}
        visible={cupVisible}
        lid={cupLid}
        tuning={tuning}
        onGrabStart={canGrabKoozie ? handleKoozieGrab : undefined}
        onPointerEnter={canGrabKoozie ? handleKoozieHover : undefined}
        onPointerMove={canGrabKoozie ? handleKoozieHover : undefined}
        onPointerLeave={canGrabKoozie ? () => setHoveringKoozie(false) : undefined}
      />
      {runtime.map((rt, i) => {
        if (!rt.visible) return null;
        const canToggleKeep = cupPhase === 'selecting' && canDrag && !rt.inCup;
        return (
          <DieBody
            key={rt.locked ? `die-${i}-locked-${layoutGen}` : `die-${i}-dynamic-${layoutGen}`}
            ref={(el) => {
              dieRefs.current[i] = el;
            }}
            locked={rt.locked}
            pickable={canToggleKeep}
            onPointerDown={
              canToggleKeep
                ? (e) => {
                    e.stopPropagation();
                    handleDieClick(i);
                  }
                : undefined
            }
            onPointerEnter={canToggleKeep ? handleDiePointerEnter : undefined}
            onPointerLeave={canToggleKeep ? handleDiePointerLeave : undefined}
            position={rt.position}
            rotation={rt.rotation ?? ZERO_ROTATION}
            meshVisible={rt.meshVisible ?? true}
            glow={straightGlow[i]}
          />
        );
      })}
    </>
  );
}
