import type { Die, RoomSettings } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import type { GameEngine } from './engine.js';
import { bonusRoll, makeEngine, makePlayers, ofType, roll } from './engine.testkit.js';

const zeroBetSettings: RoomSettings = {
  ...DEFAULT_SETTINGS,
  straightPayout: { enabled: true, amountPerPlayer: 0 },
  classicPot: { enabled: true, donationAmount: 0 },
  firstRollYahtzeePayout: { enabled: true, amountPerPlayer: 0 },
  yahtzeeBonus: { enabled: true, amountPerPlayer: 0 },
};

function standAfter(engine: GameEngine, playerId: string, dice: Die[]): void {
  expect(roll(engine, playerId, dice)).toBeNull();
  const result = engine.stand(playerId);
  if (result) expect(['NOT_YOUR_TURN', 'BAD_REQUEST']).toContain(result.code);
}

describe('authoritative special moment events', () => {
  it('emits roll moments after qualification even when no chips move', () => {
    const straight = makeEngine(makePlayers([100, 100]), { settings: zeroBetSettings });
    straight.engine.start();
    expect(roll(straight.engine, 'p0', [1, 2, 3, 4, 5])).toBeNull();
    expect(ofType(straight.events, 'specialMomentHit')).toContainEqual({
      type: 'specialMomentHit',
      playerId: 'p0',
      kind: 'straight',
    });
    expect(ofType(straight.events, 'straightPaid')).toHaveLength(0);

    const classic = makeEngine(makePlayers([100, 100]), { settings: zeroBetSettings });
    classic.engine.start();
    expect(roll(classic.engine, 'p0', [6, 6, 6, 2, 3])).toBeNull();
    expect(ofType(classic.events, 'specialMomentHit')).toContainEqual({
      type: 'specialMomentHit',
      playerId: 'p0',
      kind: 'classic',
    });
    expect(ofType(classic.events, 'classicWon')).toHaveLength(0);

    const yahtzee = makeEngine(makePlayers([100, 100]), { settings: zeroBetSettings });
    yahtzee.engine.start();
    expect(roll(yahtzee.engine, 'p0', [5, 5, 5, 5, 5])).toBeNull();
    expect(ofType(yahtzee.events, 'specialMomentHit')).toContainEqual({
      type: 'specialMomentHit',
      playerId: 'p0',
      kind: 'first-roll-yahtzee',
    });
    expect(bonusRoll(yahtzee.engine, 'p0', 5)).toBeNull();
    expect(ofType(yahtzee.events, 'specialMomentHit')).toContainEqual({
      type: 'specialMomentHit',
      playerId: 'p0',
      kind: 'yahtzee-bonus',
    });
  });

  it('emits one overtime win for the winner of a nested-capable tie-breaker path', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      straightPayout: { enabled: false, amountPerPlayer: 0 },
      classicPot: { enabled: false, donationAmount: 0 },
      firstRollYahtzeePayout: { enabled: false, amountPerPlayer: 0 },
      yahtzeeBonus: { enabled: false, amountPerPlayer: 0 },
    };
    const { engine, events } = makeEngine(makePlayers([100, 100]), { settings });
    engine.start();
    standAfter(engine, 'p0', [3, 3, 5, 2, 4]);
    standAfter(engine, 'p1', [3, 3, 5, 2, 4]);
    standAfter(engine, 'p1', [4, 4, 6, 2, 3]);
    standAfter(engine, 'p0', [3, 3, 6, 2, 4]);

    expect(ofType(events, 'specialMomentHit')).toEqual([
      { type: 'specialMomentHit', playerId: 'p1', kind: 'overtime-win' },
    ]);
  });

  it('does not classify an ordinary round winner as overtime', () => {
    const { engine, events } = makeEngine(makePlayers([100, 100]), {
      settings: { ...zeroBetSettings, yahtzeeBonus: { enabled: false, amountPerPlayer: 0 } },
    });
    engine.start();
    standAfter(engine, 'p0', [4, 4, 6, 2, 3]);
    standAfter(engine, 'p1', [3, 3, 6, 2, 4]);
    expect(ofType(events, 'specialMomentHit').some((event) => event.kind === 'overtime-win')).toBe(
      false,
    );
  });
});
