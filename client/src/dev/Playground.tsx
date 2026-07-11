import { type Die, detectStraight } from '@dice/shared';
import { button, folder, Leva, useControls } from 'leva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import GameArea from '../components/GameArea';
import Table from '../components/Table';
import { togglePendingKeep } from '../game/keepSelection';
import { resolveTableRestPose } from '../table3d/dice/staticPose';
import {
  clearLiveTuning,
  DEFAULT_DICE_PHYSICS_TUNING,
  type DicePhysicsTuning,
  getDicePhysicsTuning,
  persistLiveTuning,
  readTuningPreset,
  resetDicePhysicsTuning,
  restoreLiveTuning,
  saveTuningPreset,
  setDicePhysicsTuning,
  subscribeDicePhysicsTuning,
  updateDicePhysicsTuning,
} from '../table3d/dice/tuning';
import { displaySeatIndex } from '../table3d/layout';
import { tableEvents } from '../table3d/tableEvents';
import {
  DEV_BOB,
  DEV_CAROL,
  DEV_YOU,
  PLAYGROUND_SCENES,
  type PlaygroundSceneId,
  sceneById,
} from './fixtures';
import { usePlaygroundTurn } from './usePlaygroundTurn';

const VIEW_IDS = [
  { id: DEV_YOU, label: 'You (seated)' },
  { id: DEV_CAROL, label: 'Carol (spectator seat)' },
  { id: DEV_BOB, label: 'Bob (other player)' },
] as const;

type ControlSetter = (values: Record<string, number | boolean | string>) => void;

function tuningToControls(tuning: DicePhysicsTuning): Record<string, number | boolean | string> {
  return {
    gravityY: tuning.world.gravityY,
    timeStepHz: Math.round(1 / tuning.world.timeStep),
    timeScale: tuning.world.timeScale,
    debug: tuning.world.debug,
    dieFriction: tuning.dice.friction,
    dieRestitution: tuning.dice.restitution,
    dieDensity: tuning.dice.density,
    linearDamping: tuning.dice.linearDamping,
    angularDamping: tuning.dice.angularDamping,
    heldMaxLinVel: tuning.dice.heldMaxLinVel,
    heldMaxAngVel: tuning.dice.heldMaxAngVel,
    pendulumFollow: tuning.pendulum.follow,
    pendulumLength: tuning.pendulum.length,
    pendulumDamping: tuning.pendulum.dampingRatio,
    maxTilt: tuning.pendulum.maxTilt,
    maxPivotSpeed: tuning.pendulum.maxPivotSpeed,
    tipDurationMs: tuning.release.tipDurationMs,
    tipAngle: tuning.release.tipAngle,
    pourCenterY: tuning.release.pourCenterY,
    glideVelocityScale: tuning.release.glideVelocityScale,
    glideMaxDistance: tuning.release.glideMaxDistance,
    cupRadius: tuning.cup.radius,
    cupHeight: tuning.cup.height,
    cupFloatY: tuning.cup.floatCenterY,
    wallThickness: tuning.cup.wallThickness,
    settleLinear: tuning.settle.linearVelocity,
    settleAngular: tuning.settle.angularVelocity,
    settleFrames: tuning.settle.frames,
  };
}

function copyTuningJson() {
  const json = JSON.stringify(getDicePhysicsTuning(), null, 2);
  void navigator.clipboard?.writeText(json);
}

function PhysicsTuningControls({ rerack }: { rerack: () => void }) {
  const [presetName, setPresetName] = useState('favorite');
  const [lastAction, setLastAction] = useState('');
  const setControlsRef = useRef<ControlSetter | null>(null);
  const defaults = DEFAULT_DICE_PHYSICS_TUNING;

  const [, setControls] = useControls(
    'Dice physics',
    () => ({
      World: folder({
        gravityY: {
          value: defaults.world.gravityY,
          min: -95,
          max: -8,
          step: 1,
          onChange: (gravityY: number) => updateDicePhysicsTuning({ world: { gravityY } }),
        },
        timeStepHz: {
          value: Math.round(1 / defaults.world.timeStep),
          min: 30,
          max: 120,
          step: 30,
          label: 'timeStep Hz',
          onChange: (hz: number) =>
            updateDicePhysicsTuning({ world: { timeStep: 1 / Math.max(hz, 1) } }),
        },
        timeScale: {
          value: defaults.world.timeScale,
          min: 0.15,
          max: 1.25,
          step: 0.05,
          onChange: (timeScale: number) => updateDicePhysicsTuning({ world: { timeScale } }),
        },
        debug: {
          value: defaults.world.debug,
          onChange: (debug: boolean) => updateDicePhysicsTuning({ world: { debug } }),
        },
      }),
      Dice: folder({
        dieFriction: {
          value: defaults.dice.friction,
          min: 0,
          max: 1.4,
          step: 0.01,
          onChange: (friction: number) => updateDicePhysicsTuning({ dice: { friction } }),
        },
        dieRestitution: {
          value: defaults.dice.restitution,
          min: 0,
          max: 0.8,
          step: 0.01,
          onChange: (restitution: number) => updateDicePhysicsTuning({ dice: { restitution } }),
        },
        dieDensity: {
          value: defaults.dice.density,
          min: 0.4,
          max: 7,
          step: 0.1,
          onChange: (density: number) => updateDicePhysicsTuning({ dice: { density } }),
        },
        linearDamping: {
          value: defaults.dice.linearDamping,
          min: 0,
          max: 1.2,
          step: 0.01,
          onChange: (linearDamping: number) => updateDicePhysicsTuning({ dice: { linearDamping } }),
        },
        angularDamping: {
          value: defaults.dice.angularDamping,
          min: 0,
          max: 1.2,
          step: 0.01,
          onChange: (angularDamping: number) =>
            updateDicePhysicsTuning({ dice: { angularDamping } }),
        },
        heldMaxLinVel: {
          value: defaults.dice.heldMaxLinVel,
          min: 1,
          max: 12,
          step: 0.1,
          onChange: (heldMaxLinVel: number) => updateDicePhysicsTuning({ dice: { heldMaxLinVel } }),
        },
        heldMaxAngVel: {
          value: defaults.dice.heldMaxAngVel,
          min: 4,
          max: 40,
          step: 1,
          onChange: (heldMaxAngVel: number) => updateDicePhysicsTuning({ dice: { heldMaxAngVel } }),
        },
      }),
      Pendulum: folder({
        pendulumFollow: {
          value: defaults.pendulum.follow,
          min: 4,
          max: 60,
          step: 1,
          onChange: (follow: number) => updateDicePhysicsTuning({ pendulum: { follow } }),
        },
        pendulumLength: {
          value: defaults.pendulum.length,
          min: 0.18,
          max: 0.8,
          step: 0.01,
          onChange: (length: number) => updateDicePhysicsTuning({ pendulum: { length } }),
        },
        pendulumDamping: {
          value: defaults.pendulum.dampingRatio,
          min: 0.05,
          max: 1.5,
          step: 0.01,
          onChange: (dampingRatio: number) =>
            updateDicePhysicsTuning({ pendulum: { dampingRatio } }),
        },
        maxTilt: {
          value: defaults.pendulum.maxTilt,
          min: 0.1,
          max: 1,
          step: 0.01,
          onChange: (maxTilt: number) => updateDicePhysicsTuning({ pendulum: { maxTilt } }),
        },
        maxPivotSpeed: {
          value: defaults.pendulum.maxPivotSpeed,
          min: 0.5,
          max: 8,
          step: 0.1,
          onChange: (maxPivotSpeed: number) =>
            updateDicePhysicsTuning({ pendulum: { maxPivotSpeed } }),
        },
      }),
      Release: folder({
        tipDurationMs: {
          value: defaults.release.tipDurationMs,
          min: 180,
          max: 1500,
          step: 10,
          onChange: (tipDurationMs: number) =>
            updateDicePhysicsTuning({ release: { tipDurationMs } }),
        },
        tipAngle: {
          value: defaults.release.tipAngle,
          min: 1.2,
          max: 3.05,
          step: 0.01,
          onChange: (tipAngle: number) => updateDicePhysicsTuning({ release: { tipAngle } }),
        },
        pourCenterY: {
          value: defaults.release.pourCenterY,
          min: 0.16,
          max: 0.85,
          step: 0.01,
          onChange: (pourCenterY: number) => updateDicePhysicsTuning({ release: { pourCenterY } }),
        },
        glideVelocityScale: {
          value: defaults.release.glideVelocityScale,
          min: 0,
          max: 0.8,
          step: 0.01,
          onChange: (glideVelocityScale: number) =>
            updateDicePhysicsTuning({ release: { glideVelocityScale } }),
        },
        glideMaxDistance: {
          value: defaults.release.glideMaxDistance,
          min: 0,
          max: 1.2,
          step: 0.01,
          onChange: (glideMaxDistance: number) =>
            updateDicePhysicsTuning({ release: { glideMaxDistance } }),
        },
      }),
      Cup: folder({
        cupRadius: {
          value: defaults.cup.radius,
          min: 0.18,
          max: 0.42,
          step: 0.01,
          onChange: (radius: number) => updateDicePhysicsTuning({ cup: { radius } }),
        },
        cupHeight: {
          value: defaults.cup.height,
          min: 0.26,
          max: 0.7,
          step: 0.01,
          onChange: (height: number) => updateDicePhysicsTuning({ cup: { height } }),
        },
        cupFloatY: {
          value: defaults.cup.floatCenterY,
          min: 0.38,
          max: 1.2,
          step: 0.01,
          onChange: (floatCenterY: number) => updateDicePhysicsTuning({ cup: { floatCenterY } }),
        },
        wallThickness: {
          value: defaults.cup.wallThickness,
          min: 0.02,
          max: 0.12,
          step: 0.005,
          onChange: (wallThickness: number) => updateDicePhysicsTuning({ cup: { wallThickness } }),
        },
      }),
      Settling: folder({
        settleLinear: {
          value: defaults.settle.linearVelocity,
          min: 0.01,
          max: 0.4,
          step: 0.01,
          onChange: (linearVelocity: number) =>
            updateDicePhysicsTuning({ settle: { linearVelocity } }),
        },
        settleAngular: {
          value: defaults.settle.angularVelocity,
          min: 0.05,
          max: 2,
          step: 0.05,
          onChange: (angularVelocity: number) =>
            updateDicePhysicsTuning({ settle: { angularVelocity } }),
        },
        settleFrames: {
          value: defaults.settle.frames,
          min: 4,
          max: 60,
          step: 1,
          onChange: (frames: number) => updateDicePhysicsTuning({ settle: { frames } }),
        },
      }),
      Presets: folder({
        presetName: {
          value: 'favorite',
          onChange: (name: string) => setPresetName(name),
        },
        savePreset: button(() => {
          saveTuningPreset(presetName);
          setLastAction(`Saved "${presetName.trim() || 'untitled'}"`);
        }),
        loadPreset: button(() => {
          const preset = readTuningPreset(presetName);
          if (!preset) {
            setLastAction(`No preset named "${presetName}"`);
            return;
          }
          setDicePhysicsTuning(preset);
          setControlsRef.current?.(tuningToControls(preset));
          setLastAction(`Loaded "${presetName}"`);
          rerack();
        }),
        resetDefaults: button(() => {
          resetDicePhysicsTuning();
          clearLiveTuning();
          setControlsRef.current?.(tuningToControls(DEFAULT_DICE_PHYSICS_TUNING));
          setLastAction('Reset defaults');
          rerack();
        }),
        copyJson: button(() => {
          copyTuningJson();
          setLastAction('Copied tuning JSON');
        }),
        rerack: button(rerack),
      }),
    }),
    [presetName, rerack],
  );

  useEffect(() => {
    setControlsRef.current = setControls as ControlSetter;
  }, [setControls]);

  // Survive page refreshes: restore the last live tuning once, then keep
  // localStorage in sync with every store change.
  useEffect(() => {
    const restored = restoreLiveTuning();
    if (restored) setControlsRef.current?.(tuningToControls(restored));
    return subscribeDicePhysicsTuning(persistLiveTuning);
  }, []);

  return (
    <>
      <Leva collapsed={false} />
      <p className="playground-hint muted">
        Physics tuning is live. {lastAction ? `${lastAction}. ` : ''}Use debug + slow motion to
        inspect colliders and paste copied JSON back into constants once a tune feels right.
      </p>
    </>
  );
}

/**
 * Dev-only UI sandbox: in-game table + turn controls without WebSocket or server.
 * Open `/dev/play` while `npm run dev` is running (client only).
 */
export default function Playground() {
  const [params, setParams] = useSearchParams();
  const sceneId = (params.get('scene') as PlaygroundSceneId | null) ?? 'myTurnMidTurn';
  const initialScene = useMemo(() => sceneById(sceneId), []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    snapshot,
    lastRoll,
    releaseSignal,
    releaseVelocity,
    rolling,
    loadScene,
    setPendingKeep,
    releaseThrow,
    commitRoll,
    stand,
    replayAnimation,
    setSnapshot,
    setRolling,
  } = usePlaygroundTurn(initialScene);

  const [myId, setMyId] = useState(() => params.get('view') ?? initialScene.defaultMyId);
  const [pointerOnTable, setPointerOnTable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingKeep, setPendingKeepState] = useState<number[]>([]);

  const turn = snapshot.game?.currentTurn ?? null;
  const isMyTurn = turn !== null && turn.playerId === myId;
  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? 0;
  const activeSeat =
    turn !== null ? (snapshot.players.find((p) => p.id === turn.playerId)?.seat ?? null) : null;
  const parkedKoozieDisplaySeat =
    snapshot.phase === 'playing' && activeSeat !== null && !isMyTurn
      ? displaySeatIndex(activeSeat, mySeat)
      : null;

  useEffect(() => {
    setPendingKeepState(turn ? [...turn.keptIndices] : []);
  }, [turn?.playerId, turn?.rollsUsed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDragging(false);
    setPointerOnTable(false);
  }, [turn?.playerId, turn?.rollsUsed]);

  useEffect(() => {
    setPendingKeep(pendingKeep);
  }, [pendingKeep, setPendingKeep]);

  useEffect(() => {
    document.title = 'UI Playground — Dice';
    return () => {
      document.title = 'Dice';
    };
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('scene', sceneId);
    next.set('view', myId);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [sceneId, myId, params, setParams]);

  const onSceneChange = (id: PlaygroundSceneId) => {
    const scene = sceneById(id);
    loadScene(scene);
    setMyId(scene.defaultMyId);
    setPointerOnTable(false);
    setDragging(false);
    setParams({ scene: id, view: scene.defaultMyId }, { replace: true });
  };

  const onTablePointer = (inside: boolean) => {
    setPointerOnTable(inside);
  };

  const onKeepToggle = useCallback(
    (index: number) => {
      if (!turn || !isMyTurn) return;
      const next = togglePendingKeep(index, pendingKeep, turn.keptIndices, turn.rollsUsed > 0);
      if (!next) return;
      setPendingKeepState(next);
      return next;
    },
    [turn, isMyTurn, pendingKeep],
  );

  // Straight celebration for the spectator static view (the roller's own
  // view triggers locally at settle) — mirrors Room.tsx's event wiring.
  useEffect(() => {
    if (!lastRoll || detectStraight(lastRoll.dice) === 'none') return;
    tableEvents.emit({ type: 'straight', dice: lastRoll.dice }, lastRoll.receivedAt);
  }, [lastRoll]);

  const replayAnte = () => {
    const game = snapshot.game;
    if (!game) return;
    const contributions = snapshot.players
      .filter((player) => player.seat !== null)
      .map((player) => ({ playerId: player.id, amount: 1 }));
    tableEvents.emit({
      type: 'chips-to-pot',
      contributions,
      potBefore: Math.max(0, game.pot - contributions.length),
    });
  };

  const replayPotAward = () => {
    const game = snapshot.game;
    const winner = snapshot.players.find((player) => player.seat !== null);
    if (!game || !winner) return;
    tableEvents.emit({ type: 'pot-to-winner', winnerId: winner.id, amount: game.pot });
  };

  const tableDice =
    turn && isMyTurn
      ? {
          releaseSignal,
          releaseVelocity,
          keepIndices: pendingKeep,
          lockedKeepIndices: turn.keptIndices,
          dice: turn.dice,
          canDrag: true,
          active: true,
          onSettled: commitRoll,
          onRelease: releaseThrow,
          onDragChange: setDragging,
          onRollingChange: setRolling,
          onKeepToggle,
        }
      : undefined;

  // Same resolver as production (ADR 005): real rest pose when the sim
  // provided one (single-seat, so seat 0), slot layout otherwise.
  const heldPose = useMemo(
    () => (lastRoll ? resolveTableRestPose(lastRoll, 0).frame : null),
    [lastRoll],
  );
  const localSimShowsLastRoll =
    isMyTurn &&
    turn !== null &&
    turn.rollsUsed > 0 &&
    lastRoll?.playerId === myId &&
    lastRoll.rollNumber === turn.rollsUsed;
  const showHeldPose = heldPose !== null && !localSimShowsLastRoll && !rolling && !dragging;

  const setDie = (index: number, value: Die) => {
    if (!turn) return;
    const dice = [...turn.dice];
    dice[index] = value;
    setSnapshot({
      ...snapshot,
      game: snapshot.game
        ? {
            ...snapshot.game,
            currentTurn: { ...turn, dice },
          }
        : null,
    });
  };

  const rerackDice = useCallback(() => {
    loadScene(sceneById(sceneId));
  }, [loadScene, sceneId]);

  return (
    <main className="playground">
      <header className="playground-bar">
        <div className="playground-bar-primary">
          <h1 className="playground-title">UI playground</h1>
          <span className="playground-badge">dev only</span>
          <Link to="/" className="playground-home">
            ← App
          </Link>
        </div>

        <div className="playground-controls">
          <label className="playground-field">
            <span>Scene</span>
            <select
              value={sceneId}
              onChange={(e) => onSceneChange(e.target.value as PlaygroundSceneId)}
            >
              {PLAYGROUND_SCENES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="playground-field">
            <span>View as</span>
            <select value={myId} onChange={(e) => setMyId(e.target.value)}>
              {VIEW_IDS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="secondary"
            onClick={replayAnimation}
            disabled={!lastRoll}
          >
            Replay koozie
          </button>

          <button type="button" className="secondary" onClick={replayAnte}>
            Replay ante
          </button>

          <button type="button" className="secondary" onClick={replayPotAward}>
            Replay pot award
          </button>

          <button
            type="button"
            className="secondary"
            onClick={rerackDice}
            title="Reset scene to fixture defaults"
          >
            Reset scene
          </button>
        </div>
      </header>

      <p className="playground-hint muted">
        {dragging
          ? 'Drag the koozie to aim — release to spill the dice.'
          : rolling
            ? 'Rolling…'
            : isMyTurn && turn && turn.rollsUsed > 0 && turn.dice.length > 0
              ? 'Click dice on the table to keep them. Click the koozie in front of you to roll again.'
              : isMyTurn
                ? 'Grab the koozie in front of you, drag it around, then release to roll.'
                : 'No server required. Keep / stand update local state only. Share this URL to reopen the same scene.'}
      </p>

      <PhysicsTuningControls rerack={rerackDice} />

      <Table
        snapshot={snapshot}
        myId={myId}
        onKick={() => {}}
        dice={tableDice}
        heldPose={showHeldPose ? heldPose : null}
        parkedKoozieDisplaySeat={parkedKoozieDisplaySeat}
        diceAiming={dragging || (pointerOnTable && isMyTurn && !rolling)}
        onTablePointer={onTablePointer}
        stand={
          isMyTurn && turn && turn.rollsUsed > 0 && !dragging
            ? { onStand: stand, canStand: true, disabled: rolling }
            : undefined
        }
      />

      <GameArea
        snapshot={snapshot}
        myId={myId}
        lastRoll={lastRoll}
        hide2DDice
        mouseThrow
        pendingKeep={pendingKeep}
        onPendingKeepChange={setPendingKeepState}
        turnActions={{
          onStand: stand,
          disabled: rolling,
          aiming: dragging,
        }}
      />

      {turn && turn.dice.length > 0 && (
        <details className="playground-panel card">
          <summary>Tweak dice (dev)</summary>
          <div className="playground-dice-edit">
            {turn.dice.map((value, i) => (
              <label key={i} className="playground-field playground-die-field">
                <span>#{i + 1}</span>
                <select value={value} onChange={(e) => setDie(i, Number(e.target.value) as Die)}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}

      <details className="playground-panel snapshot-debug-wrap">
        <summary>Snapshot (debug)</summary>
        <pre className="snapshot-debug">{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </main>
  );
}
