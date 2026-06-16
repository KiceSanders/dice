import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Die } from '@dice/shared';
import GameArea from '../components/GameArea';
import Table from '../components/Table';
import {
  DEV_BOB,
  DEV_CAROL,
  DEV_YOU,
  PLAYGROUND_SCENES,
  sceneById,
  type PlaygroundSceneId,
} from './fixtures';
import { usePlaygroundTurn } from './usePlaygroundTurn';

const VIEW_IDS = [
  { id: DEV_YOU, label: 'You (seated)' },
  { id: DEV_CAROL, label: 'Carol (spectator seat)' },
  { id: DEV_BOB, label: 'Bob (other player)' },
] as const;

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
    keepAllStand,
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

  const tableDice =
    turn && isMyTurn
      ? {
          releaseSignal,
          releaseVelocity,
          keepIndices: pendingKeep,
          dice: turn.dice,
          canDrag: true,
          active: true,
          onSettled: commitRoll,
          onRelease: releaseThrow,
          onDragChange: setDragging,
          onRollingChange: setRolling,
        }
      : turn
        ? {
            releaseSignal: 0,
            releaseVelocity: { x: 0, y: 0, z: 0 },
            keepIndices: turn.keptIndices,
            dice: turn.dice,
            canDrag: false,
            active: true,
            onSettled: () => {},
            onRelease: () => {},
          }
        : undefined;

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
            <select value={sceneId} onChange={(e) => onSceneChange(e.target.value as PlaygroundSceneId)}>
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

          <button type="button" className="secondary" onClick={replayAnimation} disabled={!lastRoll}>
            Replay koozie
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => loadScene(sceneById(sceneId))}
            title="Reset scene to fixture defaults"
          >
            Reset scene
          </button>
        </div>
      </header>

      <p className="playground-hint muted">
        {dragging
          ? 'Drag the koozie to aim — release to spill the dice.'
          : isMyTurn
            ? 'Click the koozie on the table, drag it around, then release to roll.'
            : 'No server required. Keep / stand update local state only. Share this URL to reopen the same scene.'}
      </p>

      <Table
        snapshot={snapshot}
        myId={myId}
        onKick={() => {}}
        dice={tableDice}
        diceAiming={dragging || (pointerOnTable && isMyTurn && !rolling)}
        onTablePointer={onTablePointer}
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
          onKeepAllStand: keepAllStand,
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
                <select
                  value={value}
                  onChange={(e) => setDie(i, Number(e.target.value) as Die)}
                >
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
