import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Die, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { GameEngine, type EngineEvent, type EnginePlayer } from './engine.js';

function rngFor(faces: Die[]) {
  let i = 0;
  return () => {
    const face = faces[i++];
    if (face === undefined) throw new Error(`rng exhausted after ${i - 1} dice`);
    return (face - 1) / 6;
  };
}

function makePlayers(chips = [100, 100, 100]): EnginePlayer[] {
  return chips.map((c, i) => ({ id: `p${i}`, chips: c, seat: i, connected: true }));
}

function makeEngine(players: EnginePlayer[], faces: Die[], settings: RoomSettings = DEFAULT_SETTINGS) {
  const events: EngineEvent[] = [];
  const engine = new GameEngine(() => players, settings, (e) => events.push(e), {
    rng: rngFor(faces),
  });
  return { engine, events };
}

const ofType = <T extends EngineEvent['type']>(events: EngineEvent[], type: T) =>
  events.filter((e) => e.type === type) as Extract<EngineEvent, { type: T }>[];

/** Roll once and stand. The roll may auto-stand (cap 1) or even end the round, so a
 * redundant stand may get NOT_YOUR_TURN or BAD_REQUEST — both are fine. */
function turn(engine: GameEngine, id: string) {
  expect(engine.roll(id, [])).toBeNull();
  const maybe = engine.stand(id);
  if (maybe) expect(['NOT_YOUR_TURN', 'BAD_REQUEST']).toContain(maybe.code);
}

// Both players roll 3,3,5,2,1 → (2,3) in 1 roll → tie.
const TIE_PAIR: Die[] = [3, 3, 5, 2, 1, 3, 3, 5, 2, 1];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sub-rounds: ties', () => {
  it('2-way tie starts a sub-round with doubled ante into the same pot', () => {
    const players = makePlayers([100, 100]);
    const settings = { ...DEFAULT_SETTINGS, chipsPerRound: 3 };
    const { engine, events } = makeEngine(
      players,
      [
        ...TIE_PAIR, // round: both (2,3) → tie
        6, 6, 6, 1, 2, // sub-round p0
        5, 5, 1, 2, 3, // sub-round p1
      ],
      settings,
    );
    engine.start();
    turn(engine, 'p0');
    turn(engine, 'p1');

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
    turn(engine, 'p0');
    turn(engine, 'p1');
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p0');
    expect(end.potWon).toBe(18);
    expect(players[0]!.chips).toBe(109);
    expect(players[1]!.chips).toBe(91);
  });

  it('sub-round excludes non-tied players and resets the roll cap', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(players, [
      3, 3, 5, 2, 1, // p0 (2,3) — stands after 1 roll → cap 1 for the round
      3, 3, 5, 2, 1, // p1 ties
      2, 2, 4, 1, 5, // p2 (2,2) loses
      // sub-round: only p0 and p1
      6, 6, 1, 2, 3, // p0
      5, 5, 1, 2, 3, // p1
    ]);
    engine.start();
    turn(engine, 'p0');
    turn(engine, 'p1');
    turn(engine, 'p2');

    const sub = ofType(events, 'subRoundStarted')[0]!;
    expect(sub.tiedPlayerIds).toEqual(['p0', 'p1']);
    expect(engine.currentTurnPlayerId).toBe('p0');
    // Roll cap reset: full maxRolls available again despite round cap of 1.
    expect(engine.publicState().currentTurn?.rollCap).toBe(DEFAULT_SETTINGS.maxRolls);
    expect(engine.publicState().subRound).toMatchObject({ depth: 1 });

    turn(engine, 'p0');
    expect(engine.currentTurnPlayerId).toBe('p1'); // p2 never re-enters
    turn(engine, 'p1');
    expect(ofType(events, 'roundEnded')[0]!.winnerId).toBe('p0');
  });

  it('nested tie doubles the ante again (depth 2 → 4x)', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(players, [
      ...TIE_PAIR, // round tie
      ...TIE_PAIR, // sub-round 1 tie
      6, 6, 6, 1, 2, // sub-round 2: p0 wins
      5, 5, 1, 2, 3,
    ]);
    engine.start();
    for (let i = 0; i < 3; i++) {
      turn(engine, 'p0');
      turn(engine, 'p1');
    }

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
    const settings = { ...DEFAULT_SETTINGS, chipsPerRound: 3 };
    const { engine, events } = makeEngine(
      players,
      [
        ...TIE_PAIR, // tie
        2, 2, 1, 3, 4, // sub: p0 (2,2)
        6, 6, 6, 6, 1, // sub: p1 four 6s — wins
      ],
      settings,
    );
    engine.start();
    turn(engine, 'p0');
    turn(engine, 'p1');

    // p1 had 1 chip left after the round ante; goes all-in for 1 (not 6).
    expect(players[1]!.chips).toBe(0);
    // Pot: 3+3 antes + 6 (p0 sub) + 1 (p1 all-in) = 13.
    expect(engine.pot).toBe(13);

    turn(engine, 'p0');
    turn(engine, 'p1');
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p1');
    expect(players[1]!.chips).toBe(13); // takes the whole pot, no side pots
  });

  it('beyond depth 10 antes stop and sudden-death single rolls decide it', () => {
    const players = makePlayers([10_000, 10_000]);
    // 10 tied rounds (initial + 9 sub-rounds at depths 1-9)... build faces:
    // initial round tie + 10 sub-round ties (depths 1..10) + sudden death (depth 11).
    const faces: Die[] = [];
    for (let i = 0; i < 11; i++) faces.push(...TIE_PAIR);
    faces.push(6, 6, 6, 1, 2); // depth 11 sudden death: p0 wins
    faces.push(5, 5, 1, 2, 3);
    const { engine, events } = makeEngine(players, faces);
    engine.start();

    for (let i = 0; i < 12; i++) {
      turn(engine, 'p0');
      turn(engine, 'p1');
    }

    const subs = ofType(events, 'subRoundStarted');
    expect(subs.at(-1)).toMatchObject({ depth: 11, anteAmount: 0 }); // no ante in sudden death
    // Sudden death is a single forced roll.
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p0');
    // Total chips conserved.
    expect(players[0]!.chips + players[1]!.chips).toBe(20_000);
  });
});

describe('straight bonuses', () => {
  const LITTLE: Die[] = [1, 2, 3, 4, 5];
  const BIG: Die[] = [2, 3, 4, 5, 6];
  const JUNK: Die[] = [2, 2, 5, 3, 1];
  const JUNK2: Die[] = [4, 4, 1, 2, 6];

  function bonusSettings(over: Partial<RoomSettings['straightBonus']>): RoomSettings {
    return {
      ...DEFAULT_SETTINGS,
      straightBonus: { ...DEFAULT_SETTINGS.straightBonus, ...over },
    };
  }

  it("type 'pot' adds the bonus to the pot before resolution", () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(
      players,
      [...LITTLE, ...JUNK],
      bonusSettings({ type: 'pot', baseAmount: 5 }),
    );
    engine.start();
    turn(engine, 'p0'); // little straight → +5 to pot
    expect(engine.pot).toBe(2 + 5);
    turn(engine, 'p1');

    const bonus = ofType(events, 'bonusAwarded')[0]!;
    expect(bonus).toMatchObject({ playerId: 'p0', amount: 5, kind: 'little', target: 'pot', streak: 1 });
    // p0 wins (straight beats junk) and takes the boosted pot.
    expect(players[0]!.chips).toBe(99 + 7);
  });

  it("type 'direct' pays the player immediately (mints chips)", () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(
      players,
      [...BIG, ...JUNK],
      bonusSettings({ type: 'direct', baseAmount: 5, multiplier: 2 }),
    );
    engine.start();
    turn(engine, 'p0'); // big straight → 5*2=10 direct
    expect(players[0]!.chips).toBe(99 + 10);
    expect(engine.pot).toBe(2); // pot untouched
    expect(ofType(events, 'bonusAwarded')[0]).toMatchObject({ amount: 10, kind: 'big', target: 'direct' });
  });

  it('incremental streak scales across players and resets on a non-straight', () => {
    const players = makePlayers([100, 100, 100]);
    const { engine, events } = makeEngine(
      players,
      [
        ...LITTLE, // p0: streak 1 → 5
        ...LITTLE, // p1: streak 2 → 10
        ...JUNK, // p2: resets streak
        // round 2 (rotated; winner of round 1 is p0 or p1 — straights tie!)...
      ],
      bonusSettings({ type: 'direct', incremental: true, baseAmount: 5, multiplier: 2 }),
    );
    engine.start();
    turn(engine, 'p0');
    turn(engine, 'p1');
    turn(engine, 'p2');

    const bonuses = ofType(events, 'bonusAwarded');
    expect(bonuses.map((b) => [b.streak, b.amount])).toEqual([
      [1, 5],
      [2, 10],
    ]);
    expect(engine.publicState().straightStreak).toBe(0); // p2's junk reset it
  });

  it('caps the payout at maxBonus', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(
      players,
      [...BIG, ...JUNK],
      bonusSettings({ type: 'direct', baseAmount: 40, multiplier: 2, maxBonus: 50 }),
    );
    engine.start();
    turn(engine, 'p0'); // would be 80 → capped at 50
    expect(ofType(events, 'bonusAwarded')[0]!.amount).toBe(50);
  });

  it('pays nothing when disabled but still tracks the streak', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(
      players,
      [...LITTLE, ...JUNK2],
      bonusSettings({ enabled: false }),
    );
    engine.start();
    turn(engine, 'p0');
    expect(ofType(events, 'bonusAwarded')).toHaveLength(0);
    expect(engine.publicState().straightStreak).toBe(1);
    expect(engine.pot).toBe(2);
  });

  it('two tied straights go to a sub-round, each earning a bonus', () => {
    const players = makePlayers([100, 100]);
    const { engine, events } = makeEngine(
      players,
      [
        ...BIG, ...BIG, // both big straights in 1 roll → tie, streak 2
        ...JUNK, ...JUNK2, // sub-round: junk hands decide it
      ],
      bonusSettings({ type: 'pot', baseAmount: 5, multiplier: 2 }),
    );
    engine.start();
    turn(engine, 'p0');
    turn(engine, 'p1');

    expect(ofType(events, 'bonusAwarded')).toHaveLength(2);
    expect(ofType(events, 'subRoundStarted')).toHaveLength(1);
    // Pot: 2 antes + 10 + 10 bonuses + 2+2 sub-antes = 26.
    expect(engine.pot).toBe(26);

    turn(engine, 'p0'); // (2,2)... JUNK = 2,2,5,3,1 → (2,2)
    turn(engine, 'p1'); // JUNK2 = 4,4,1,2,6 → (2,4) wins
    const end = ofType(events, 'roundEnded')[0]!;
    expect(end.winnerId).toBe('p1');
    expect(end.potWon).toBe(26);
  });
});
