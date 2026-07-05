import type { Die, RoomSnapshot } from '@dice/shared';
import { useCallback, useRef, useState } from 'react';
import type { LastRoll } from '../state/store';
import type { ThrowVelocity } from '../table3d/dice/types';
import { cloneScene, type PlaygroundScene } from './fixtures';

export function usePlaygroundTurn(initialScene: PlaygroundScene) {
  const [scene, setSceneState] = useState(() => cloneScene(initialScene));
  const [lastRoll, setLastRoll] = useState<LastRoll | null>(null);
  const [releaseSignal, setReleaseSignal] = useState(0);
  const [releaseVelocity, setReleaseVelocity] = useState<ThrowVelocity>({ x: 0, y: 0, z: 0 });
  const [rolling, setRolling] = useState(false);
  const pendingKeepRef = useRef<number[]>([]);

  const loadScene = useCallback((next: PlaygroundScene) => {
    setSceneState(cloneScene(next));
    setLastRoll(null);
    setRolling(false);
    setReleaseSignal(0);
    pendingKeepRef.current = [];
  }, []);

  const setPendingKeep = useCallback((keepIndices: number[]) => {
    pendingKeepRef.current = [...keepIndices].sort((a, b) => a - b);
  }, []);

  const keepAllStand = useCallback(() => {
    setLastRoll(null);
    setRolling(false);
    pendingKeepRef.current = [];
    setSceneState((prev) => standSnapshot(prev));
  }, []);

  const releaseThrow = useCallback((velocity: ThrowVelocity) => {
    setReleaseVelocity(velocity);
    setRolling(true);
    setReleaseSignal((s) => s + 1);
  }, []);

  const commitRoll = useCallback((dice: Die[]) => {
    setRolling(false);
    setSceneState((prev) => {
      const game = prev.snapshot.game;
      const turn = game?.currentTurn;
      if (!game || !turn) return prev;

      const keptIndices = pendingKeepRef.current;
      const rollsUsed = turn.rollsUsed + 1;

      setLastRoll({
        playerId: turn.playerId,
        dice,
        rollNumber: rollsUsed,
        kept: keptIndices,
        receivedAt: Date.now(),
      });

      return {
        ...prev,
        snapshot: {
          ...prev.snapshot,
          game: {
            ...game,
            currentTurn: {
              ...turn,
              dice,
              keptIndices,
              rollsUsed,
              deadline: Date.now() + 90_000,
            },
          },
        },
      };
    });
  }, []);

  const stand = useCallback(() => {
    setSceneState((prev) => standSnapshot(prev));
    setLastRoll(null);
    setRolling(false);
    pendingKeepRef.current = [];
  }, []);

  const replayAnimation = useCallback(() => {
    setLastRoll((prev) => (prev ? { ...prev, receivedAt: Date.now() } : null));
  }, []);

  const setSnapshot = useCallback((snapshot: RoomSnapshot) => {
    setSceneState((prev) => ({ ...prev, snapshot }));
  }, []);

  const turn = scene.snapshot.game?.currentTurn ?? null;

  return {
    snapshot: scene.snapshot,
    lastRoll,
    releaseSignal,
    releaseVelocity,
    rolling,
    setRolling,
    loadScene,
    setPendingKeep,
    keepAllStand,
    releaseThrow,
    commitRoll,
    stand,
    replayAnimation,
    setSnapshot,
    turn,
  };
}

function standSnapshot(scene: PlaygroundScene): PlaygroundScene {
  const game = scene.snapshot.game;
  const turn = game?.currentTurn;
  if (!game || !turn) return scene;

  const [nextId, ...rest] = game.turnQueue;

  return {
    ...scene,
    snapshot: {
      ...scene.snapshot,
      game: {
        ...game,
        turnQueue: rest,
        currentTurn: nextId
          ? {
              playerId: nextId,
              dice: [],
              keptIndices: [],
              rollsUsed: 0,
              rollCap: turn.rollCap,
              deadline: Date.now() + 90_000,
              throwing: false,
            }
          : null,
      },
    },
  };
}
