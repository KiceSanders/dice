import type { Die } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEngine } from './engine.js';
import { makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

/** Roll the given faces once and stand. The roll may auto-stand (cap 1) or even end
 * the round, so a redundant stand may get NOT_YOUR_TURN or BAD_REQUEST — both are fine. */
function turn(engine: GameEngine, id: string, dice: Die[]) {
  expect(roll(engine, id, dice)).toBeNull();
  const maybe = engine.stand(id);
  if (maybe) expect(['NOT_YOUR_TURN', 'BAD_REQUEST']).toContain(maybe.code);
}

// Both players roll 3,3,5,2,1 → identical hands → tie. (Not a straight.)
const TIE: Die[] = [3, 3, 5, 2, 1];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sub-rounds: ties', () => {
  it('2-way tie starts a sub-round with doubled ante into the same pot', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, {
      settings: { ...DEFAULT_SETTINGS, chipsPerRound: 3 },
    });
    engine.start();
    turn(engine, 'p0', TIE);
    turn(engine, 'p1', TIE);

    const sub = ofType(events, 'subRoundStarted');
    expect(sub).toHaveLength(1);
    expect(sub[0]).toMatchObject({
      tiedPlayerIds: ['p0', 'p1'],
      depth: 1,
      anteAmount: 6, // chipsPerRound 3 * 2^1
    });
    // Pot: 2 antes of 3 + 2 sub-antes of 6 = 18.
    expect(engine.pot).toBe(18);
    expect(players.map((p) => p.chips)).toEqual([91, 91]);

    // Sub-round plays out; p0 (three 6s) beats p1 (two 5s) and takes everything.
    turn(engine, 'p0', [6, 6, 6, 1, 2]);
    turn(engine, 'p1', [5, 5, 1, 2, 3]);
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p0');
    expect(end.potWon).toBe(18);
    expect(players[0]!.chips).toBe(109);
    expect(players[1]!.chips).toBe(91);
  });

  it('sub-round excludes non-tied players and resets the roll cap', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(players);
    engine.start();
    turn(engine, 'p0', TIE); // stands after 1 roll → cap 1 for the round
    turn(engine, 'p1', TIE); // ties
    turn(engine, 'p2', [2, 2, 4, 1, 5]); // loses

    const sub = ofType(events, 'subRoundStarted')[0]!;
    expect(sub.tiedPlayerIds).toEqual(['p0', 'p1']);
    expect(engine.currentTurnPlayerId).toBe('p0');
    // Roll cap reset: full maxRolls available again despite round cap of 1.
    expect(engine.publicState().currentTurn?.rollCap).toBe(DEFAULT_SETTINGS.maxRolls);
    expect(engine.publicState().subRound).toMatchObject({ depth: 1 });

    turn(engine, 'p0', [6, 6, 1, 2, 3]);
    expect(engine.currentTurnPlayerId).toBe('p1'); // p2 never re-enters
    turn(engine, 'p1', [5, 5, 1, 2, 3]);
    expect(ofType(events, 'roundEnded')[0]!.winnerId).toBe('p0');
  });

  it('nested tie doubles the ante again (depth 2 → 4x)', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players);
    engine.start();
    turn(engine, 'p0', TIE); // round tie
    turn(engine, 'p1', TIE);
    turn(engine, 'p0', TIE); // sub-round 1 tie
    turn(engine, 'p1', TIE);
    turn(engine, 'p0', [6, 6, 6, 1, 2]); // sub-round 2: p0 wins
    turn(engine, 'p1', [5, 5, 1, 2, 3]);

    const subs = ofType(events, 'subRoundStarted');
    expect(subs.map((s) => s.depth)).toEqual([1, 2]);
    expect(subs.map((s) => s.anteAmount)).toEqual([2, 4]); // chipsPerRound 1: 2^1, 2^2
    // Pot: 1+1 antes, 2+2 sub1, 4+4 sub2 = 14.
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.potWon).toBe(14);
    expect(players[0]!.chips).toBe(107);
    expect(players[1]!.chips).toBe(93);
  });

  it('a short stack goes all-in on the doubled ante and can win the whole pot', () => {
    const players = makePlayers([100, 4]); // p1 can ante round (3) but not sub-round (6)
    const { engine, events } = makeEngine(players, {
      settings: { ...DEFAULT_SETTINGS, chipsPerRound: 3 },
    });
    engine.start();
    turn(engine, 'p0', TIE);
    turn(engine, 'p1', TIE);

    // p1 had 1 chip left after the round ante; goes all-in for 1 (not 6).
    expect(players[1]!.chips).toBe(0);
    // Pot: 3+3 antes + 6 (p0 sub) + 1 (p1 all-in) = 13.
    expect(engine.pot).toBe(13);

    turn(engine, 'p0', [2, 2, 1, 3, 4]);
    turn(engine, 'p1', [6, 6, 6, 6, 1]); // four 6s — wins
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p1');
    expect(players[1]!.chips).toBe(13); // takes the whole pot, no side pots
  });

  it('beyond depth 10 antes stop and sudden-death single rolls decide it', () => {
    const players = makePlayers([10_000, 10_000]);
    const { engine, events } = makeEngine(players);
    engine.start();

    // Initial round + sub-rounds at depths 1–10 all tie; depth 11 is sudden death.
    for (let i = 0; i < 11; i++) {
      turn(engine, 'p0', TIE);
      turn(engine, 'p1', TIE);
    }
    turn(engine, 'p0', [6, 6, 6, 1, 2]); // depth 11 sudden death: p0 wins
    turn(engine, 'p1', [5, 5, 1, 2, 3]);

    const subs = ofType(events, 'subRoundStarted');
    expect(subs.at(-1)).toMatchObject({ depth: 11, anteAmount: 0 }); // no ante in sudden death
    // Sudden death is a single forced roll.
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p0');
    // Total chips conserved.
    expect(players[0]!.chips + players[1]!.chips).toBe(20_000);
  });
});
