import type { Die, PlayerId, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import {
  type EngineError,
  type EngineEvent,
  type EngineOptions,
  type EnginePlayer,
  GameEngine,
} from './engine.js';

/**
 * Shared helpers for engine tests. Dice values come exclusively from the
 * roller's client (ADR 004), so tests script every roll as explicit faces —
 * there is no rng to stub.
 */

export function makePlayers(chips: number[] = [100, 100, 100]): EnginePlayer[] {
  return chips.map((c, i) => ({ id: `p${i}`, chips: c, seat: i, connected: true }));
}

export function makeEngine(
  players: EnginePlayer[],
  opts: EngineOptions & { settings?: RoomSettings } = {},
) {
  const { settings = DEFAULT_SETTINGS, ...engineOpts } = opts;
  const events: EngineEvent[] = [];
  const engine = new GameEngine(
    () => players,
    settings,
    (e) => events.push(e),
    {
      turnTimeoutMs: 60_000,
      roundEndDelayMs: 5_000,
      ...engineOpts,
    },
  );
  return { engine, events };
}

/**
 * Complete one physics throw: beginThrow with the keep set, then commit the
 * given faces (kept positions must repeat their previous value). Equivalent to
 * the pre-ADR-004 `engine.roll(id, keep)` with a scripted rng.
 */
export function roll(
  engine: GameEngine,
  id: PlayerId,
  dice: Die[],
  keep: number[] = [],
): EngineError | null {
  const begun = engine.beginThrow(id, keep);
  if (begun) return begun;
  return engine.commitThrow(id, dice);
}

export function ofType<T extends EngineEvent['type']>(
  events: EngineEvent[],
  type: T,
): Extract<EngineEvent, { type: T }>[] {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}
