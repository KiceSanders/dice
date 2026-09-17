import { type BodyPose, DEFAULT_BLACKJACK_SETTINGS, polyhedralFaceUp } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlackjackEngine, type BlackjackEvent } from './engine.js';

const engines: BlackjackEngine[] = [];
function make(delay = 0, chips = 100) {
  const players = [
    { id: 'a', seat: 0, connected: true, chips },
    { id: 'b', seat: 1, connected: true, chips },
  ];
  const events: BlackjackEvent[] = [];
  const engine = new BlackjackEngine(
    () => players,
    { ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: delay },
    (e) => events.push(e),
  );
  engines.push(engine);
  engine.start();
  return { engine, players, events };
}
function roll(engine: BlackjackEngine, die: number, decision?: 'stand' | 'continue') {
  const id = engine.currentTurnPlayerId!;
  expect(engine.beginThrow(id)).toBeNull();
  expect(engine.commitThrow(id, die)).toBeNull();
  if (decision) expect(engine.decide(id, decision)).toBeNull();
}
function tie(engine: BlackjackEngine) {
  roll(engine, 5, 'stand');
  roll(engine, 5, 'stand');
}

afterEach(() => {
  engines.splice(0).forEach((e) => {
    e.stop();
  });
  vi.useRealTimers();
});
describe('BlackjackEngine', () => {
  it('alternates one die at a time and banks the latest die only after a decision', () => {
    const { engine } = make();
    roll(engine, 4);
    expect(engine.publicState()).toMatchObject({
      currentPlayerId: 'a',
      awaitingDecision: true,
      tableDie: { die: 4 },
    });
    expect(engine.beginThrow('a')).not.toBeNull();
    expect(engine.decide('a', 'continue')).toBeNull();
    expect(engine.publicState()).toMatchObject({ currentPlayerId: 'b', tableDie: null });
    roll(engine, 3, 'continue');
    roll(engine, 6);
    expect(engine.publicState().hands[0]).toMatchObject({ dice: [4, 6], total: 10 });
  });
  it('lets the remaining player keep rolling after the opponent stands, then wins immediately on a beat', () => {
    const { engine, players } = make();
    roll(engine, 6, 'stand');
    roll(engine, 2, 'continue');
    const turn = engine.publicState().turnNumber;
    expect(engine.currentTurnPlayerId).toBe('b');
    roll(engine, 2, 'continue');
    expect(engine.publicState().turnNumber).toBe(turn + 1);
    roll(engine, 3);
    expect(engine.publicState().result).toMatchObject({
      winnerId: 'b',
      amount: 10,
      reason: 'higher',
    });
    expect(players.map((p) => p.chips)).toEqual([90, 110]);
  });
  it('automatically awards the other player when a hand busts', () => {
    const { engine, players } = make();
    for (let i = 0; i < 3; i++) {
      roll(engine, 6, 'continue');
      roll(engine, 1, 'continue');
    }
    roll(engine, 4);
    expect(engine.publicState().result).toMatchObject({
      winnerId: 'b',
      reason: 'bust',
      amount: 10,
    });
    expect(players.reduce((sum, p) => sum + p.chips, 0)).toBe(200);
  });
  it('allows standing below the opponent, resolving a loss', () => {
    const { engine } = make();
    roll(engine, 6, 'stand');
    roll(engine, 3, 'stand');
    expect(engine.publicState().result?.winnerId).toBe('a');
  });
  it('resets scores, alternates the opener and doubles again on repeated ties', () => {
    const { engine, players } = make();
    tie(engine);
    expect(engine.publicState()).toMatchObject({
      overtime: 1,
      payout: 20,
      dieSides: 12,
      currentPlayerId: 'b',
      tableDie: null,
    });
    expect(
      engine.publicState().hands.every((h) => h.total === 0 && h.dice.length === 0 && !h.stood),
    ).toBe(true);
    tie(engine);
    expect(engine.publicState()).toMatchObject({ overtime: 2, payout: 40, currentPlayerId: 'a' });
    roll(engine, 12, 'stand');
    roll(engine, 11, 'stand');
    expect(players.map((p) => p.chips)).toEqual([140, 60]);
    expect(engine.publicState().result?.amount).toBe(40);
    engine.continueRound();
    expect(engine.publicState()).toMatchObject({
      roundNumber: 2,
      overtime: 0,
      dieSides: 6,
      payout: 10,
      currentPlayerId: 'b',
    });
  });
  it('auto-stands 21, allows the opponent to match it, and starts overtime', () => {
    const { engine } = make();
    for (let i = 0; i < 3; i++) {
      roll(engine, 6, 'continue');
      roll(engine, 6, 'continue');
    }
    roll(engine, 3);
    expect(engine.publicState().hands[0]?.stood).toBe(true);
    expect(engine.currentTurnPlayerId).toBe('b');
    roll(engine, 3);
    expect(engine.publicState().overtime).toBe(1);
  });
  it('rejects out-of-turn, pre-roll decisions, duplicate results and d12 faces in regulation', () => {
    const { engine } = make();
    expect(engine.beginThrow('spectator')?.code).toBe('NOT_YOUR_TURN');
    expect(engine.decide('a', 'stand')).not.toBeNull();
    expect(engine.commitThrow('a', 2)).not.toBeNull();
    expect(engine.beginThrow('a')).toBeNull();
    for (const die of [7, 12, 0, NaN, 1.2]) expect(engine.commitThrow('a', die)).not.toBeNull();
    expect(engine.commitThrow('a', 4)).toBeNull();
    expect(engine.commitThrow('a', 4)).not.toBeNull();
    expect(engine.publicState().hands[0]?.total).toBe(4);
  });
  it('shows the score immediately but holds choices, payouts and ownership behind the captured delay', () => {
    vi.useFakeTimers();
    const { engine, players } = make(2_000);
    roll(engine, 6);
    expect(engine.publicState()).toMatchObject({
      resolving: true,
      awaitingDecision: false,
      currentPlayerId: 'a',
    });
    expect(engine.publicState().hands[0]?.total).toBe(6);
    expect(engine.decide('a', 'stand')).not.toBeNull();
    engine.updateSettings({ ...DEFAULT_BLACKJACK_SETTINGS, afterRollDelayMs: 0 });
    vi.advanceTimersByTime(1_999);
    expect(engine.publicState().resolving).toBe(true);
    vi.advanceTimersByTime(1);
    expect(engine.decide('a', 'stand')).toBeNull();
    roll(engine, 6, 'continue');
    roll(engine, 1);
    expect(players.map((p) => p.chips)).toEqual([90, 110]);
  });
  it('persists the exact d12 rest pose and drops a mismatched pose without rejecting the face', () => {
    const { engine } = make();
    tie(engine);
    const pose: BodyPose[] = [[0.2, 0.07, 0, ...polyhedralFaceUp(12, 12)]];
    expect(engine.beginThrow('b')).toBeNull();
    expect(engine.commitThrow('b', 12, pose)).toBeNull();
    expect(engine.publicState().tableDie?.restPose).toEqual(pose);
    expect(engine.decide('b', 'continue')).toBeNull();
    expect(engine.beginThrow('a')).toBeNull();
    expect(engine.commitThrow('a', 11, pose)).toBeNull();
    expect(engine.publicState().tableDie?.restPose).toBeNull();
  });
  it('caps a payout at the losing stack and pays exactly once', () => {
    const { engine, players } = make(0, 25);
    tie(engine);
    tie(engine);
    roll(engine, 12, 'stand');
    roll(engine, 1, 'stand');
    engine.forceStand('b');
    expect(players.map((p) => p.chips)).toEqual([50, 0]);
    expect(engine.publicState().result?.amount).toBe(25);
    engine.continueRound();
    expect(engine.phase).toBe('ended');
  });
  it('defers a disconnected player forfeit until a settled roll reveals, and cancels abandoned throws', () => {
    vi.useFakeTimers();
    const { engine, players } = make(1_000);
    roll(engine, 4);
    engine.forceStand('a');
    expect(players[0]?.chips).toBe(100);
    vi.advanceTimersByTime(1_000);
    expect(engine.publicState().result?.reason).toBe('forfeit');
    expect(players.map((p) => p.chips)).toEqual([90, 110]);
    engine.continueRound();
    expect(engine.beginThrow('b')).toBeNull();
    engine.forceStand('b');
    expect(engine.commitThrow('b', 6)).not.toBeNull();
    expect(players.map((p) => p.chips)).toEqual([100, 100]);
  });
  it('restores a pending reveal exactly once and retries an uncommitted throw after recovery', () => {
    const { engine } = make(1_000);
    roll(engine, 4);
    const saved = engine.persistedState();
    const recovered = make().engine;
    recovered.restore(saved);
    expect(recovered.publicState()).toMatchObject({ resolving: false, awaitingDecision: true });
    expect(recovered.publicState().hands[0]?.dice).toEqual([4]);
    recovered.decide('a', 'continue');
    recovered.beginThrow('b');
    const thrown = recovered.persistedState();
    recovered.restore(thrown);
    expect(recovered.publicState().throwing).toBe(false);
    expect(recovered.beginThrow('b')).toBeNull();
  });
});
