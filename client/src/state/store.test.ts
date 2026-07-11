import type { ServerMessage } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reducer } from './store';

function receive(message: ServerMessage) {
  return reducer(initialState, { type: 'server-message', message });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ante announcements', () => {
  it('retains exact normal-round contributions with receive time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234);
    const state = receive({
      type: 'round:started',
      roundNumber: 3,
      antes: [
        { playerId: 'p1', amount: 2 },
        { playerId: 'p2', amount: 2 },
      ],
    });

    expect(state.lastAnte).toEqual({
      kind: 'round',
      roundNumber: 3,
      contributions: [
        { playerId: 'p1', amount: 2 },
        { playerId: 'p2', amount: 2 },
      ],
      potBefore: 0,
      receivedAt: 1_234,
    });
  });

  it('captures the pre-ante pot at message time, before the post-ante snapshot lands', () => {
    const snapshot = { game: { pot: 3 } } as unknown as NonNullable<
      (typeof initialState)['snapshot']
    >;
    const state = reducer(
      { ...initialState, snapshot },
      {
        type: 'server-message',
        message: {
          type: 'subround:started',
          tiedPlayerIds: ['p1', 'p2'],
          anteAmount: 2,
          depth: 1,
          antes: [
            { playerId: 'p1', amount: 2 },
            { playerId: 'p2', amount: 2 },
          ],
        },
      },
    );

    expect(state.lastAnte?.potBefore).toBe(3);
  });

  it('retains actual all-in sub-round payments rather than only the nominal ante', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_345);
    const state = receive({
      type: 'subround:started',
      tiedPlayerIds: ['p1', 'p2'],
      anteAmount: 4,
      depth: 2,
      antes: [
        { playerId: 'p1', amount: 4 },
        { playerId: 'p2', amount: 1 },
      ],
    });

    expect(state.lastAnte).toMatchObject({
      kind: 'subround',
      depth: 2,
      contributions: [
        { playerId: 'p1', amount: 4 },
        { playerId: 'p2', amount: 1 },
      ],
      receivedAt: 2_345,
    });
  });
});

describe('instant transfers', () => {
  it('retains straight payments as a player-to-player transfer', () => {
    vi.spyOn(Date, 'now').mockReturnValue(3_456);
    const state = receive({
      type: 'straight:paid',
      playerId: 'roller',
      kind: 'straight',
      amountPerPlayer: 2,
      total: 3,
      payments: [
        { playerId: 'p2', amount: 2 },
        { playerId: 'p3', amount: 1 },
      ],
    });

    expect(state.lastTransfer).toEqual({
      toPlayerId: 'roller',
      payments: [
        { playerId: 'p2', amount: 2 },
        { playerId: 'p3', amount: 1 },
      ],
      receivedAt: 3_456,
    });
  });
});
