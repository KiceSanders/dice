import type { BodyPose, Die, PlayerId, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS, quaternionFaceUp } from '@dice/shared';
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
      roundEndDelayMs: 5_000,
      // Most rule tests are about outcomes rather than wall-clock timing.
      afterRollDelayMs: 0,
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
  restPose?: BodyPose[],
): EngineError | null {
  const begun = engine.beginThrow(id, keep);
  if (begun) return begun;
  return engine.commitThrow(id, dice, restPose);
}

/** Complete one Yahtzee bonus throw: beginBonusThrow, then commit the given face. */
export function bonusRoll(engine: GameEngine, id: PlayerId, die: Die): EngineError | null {
  const begun = engine.beginBonusThrow(id);
  if (begun) return begun;
  return engine.commitBonusThrow(id, die);
}

/** A valid on-table rest pose matching `dice` (passes validateRestPose). */
export function restPoseFor(dice: Die[]): BodyPose[] {
  return dice.map((value, i) => {
    const [qx, qy, qz, qw] = quaternionFaceUp(value);
    return [0.3 * i - 0.6, 0.063, 0.4 - 0.25 * i, qx, qy, qz, qw];
  });
}

export function ofType<T extends EngineEvent['type']>(
  events: EngineEvent[],
  type: T,
): Extract<EngineEvent, { type: T }>[] {
  return events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type);
}
