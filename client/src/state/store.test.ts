import type { Die, RoomSnapshot, ServerMessage } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppState, initialState, reducer } from './store';

function receive(message: ServerMessage, state: AppState = initialState) {
  return reducer(state, { type: 'server-message', message });
}

function player(
  id: string,
  opts: { name?: string; seat?: number | null; banned?: boolean; isHost?: boolean } = {},
) {
  return {
    id,
    name: opts.name ?? id,
    seat: opts.seat === undefined ? null : opts.seat,
    chips: 10,
    connected: true,
    banned: opts.banned ?? false,
    isHost: opts.isHost ?? false,
  };
}

function snapshot(
  partial: Partial<RoomSnapshot> & { players: RoomSnapshot['players'] },
): RoomSnapshot {
  return {
    roomId: 'ROOM1',
    hostId: partial.hostId ?? partial.players[0]?.id ?? 'host',
    phase: partial.phase ?? 'lobby',
    settings: partial.settings ?? {
      chipsPerRound: 1,
      betMultiplier: 1,
      autoIncrement: { enabled: true, everyRounds: 7 },
      maxRolls: 3,
      afterRollDelayMs: 2000,
      minBuyIn: 5,
      maxBuyIn: 50,
      straightPayout: { enabled: true, amountPerPlayer: 2 },
      classicPot: { enabled: true, donationAmount: 1 },
      yahtzeeBonus: { enabled: true, amountPerPlayer: 10 },
      firstRollYahtzeePayout: { enabled: true, amountPerPlayer: 10 },
    },
    players: partial.players,
    seatRequests: partial.seatRequests ?? [],
    game: partial.game ?? null,
  };
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
    const snap = snapshot({
      players: [player('p1', { seat: 0 })],
      game: { pot: 3 } as RoomSnapshot['game'],
    });
    const state = receive(
      {
        type: 'subround:started',
        tiedPlayerIds: ['p1', 'p2'],
        anteAmount: 2,
        depth: 1,
        antes: [
          { playerId: 'p1', amount: 2 },
          { playerId: 'p2', amount: 2 },
        ],
      },
      { ...initialState, snapshot: snap },
    );

    expect(state.lastAnte?.potBefore).toBe(3);
  });

  it('retains actual short-stack floor sub-round payments rather than only the nominal ante', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_345);
    const state = receive({
      type: 'subround:started',
      tiedPlayerIds: ['p1', 'p2'],
      anteAmount: 4,
      depth: 2,
      antes: [
        { playerId: 'p1', amount: 1 },
        { playerId: 'p2', amount: 1 },
      ],
    });

    expect(state.lastAnte).toMatchObject({
      kind: 'subround',
      depth: 2,
      contributions: [
        { playerId: 'p1', amount: 1 },
        { playerId: 'p2', amount: 1 },
      ],
      receivedAt: 2_345,
    });
  });
});

describe('active room directory', () => {
  it('stores the latest public room list', () => {
    const rooms = [
      {
        roomId: 'ABC234',
        phase: 'playing' as const,
        roundNumber: 2,
        playerNames: ['Alice', 'Bob'],
      },
    ];
    expect(receive({ type: 'rooms:list', rooms }).activeRooms).toEqual(rooms);
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

  it('retains yahtzee bonus payments as a player-to-player transfer', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_678);
    const state = receive({
      type: 'yahtzee:paid',
      playerId: 'roller',
      amountPerPlayer: 10,
      total: 14,
      payments: [
        { playerId: 'p2', amount: 10 },
        { playerId: 'p3', amount: 4 },
      ],
    });

    expect(state.lastTransfer).toEqual({
      toPlayerId: 'roller',
      payments: [
        { playerId: 'p2', amount: 10 },
        { playerId: 'p3', amount: 4 },
      ],
      receivedAt: 5_678,
    });
    expect(state.toasts).toHaveLength(1);
  });

  it('retains first-roll Yahtzee payments as a player-to-player transfer', () => {
    vi.spyOn(Date, 'now').mockReturnValue(6_789);
    const state = receive({
      type: 'yahtzee:first-roll-paid',
      playerId: 'roller',
      amountPerPlayer: 10,
      total: 14,
      payments: [
        { playerId: 'p2', amount: 10 },
        { playerId: 'p3', amount: 4 },
      ],
    });

    expect(state.lastTransfer).toEqual({
      toPlayerId: 'roller',
      payments: [
        { playerId: 'p2', amount: 10 },
        { playerId: 'p3', amount: 4 },
      ],
      receivedAt: 6_789,
    });
    expect(state.toasts).toHaveLength(1);
  });
});

describe('yahtzee bonus messages', () => {
  it('turn:bonusOffered announces the offer without touching lastRoll', () => {
    const state = receive({ type: 'turn:bonusOffered', playerId: 'p1', face: 5 });
    expect(state.lastRoll).toBeNull();
    expect(state.toasts).toHaveLength(1);
    expect(state.activityLog.at(-1)?.text).toContain('Yahtzee');
  });

  it('turn:bonusThrowStarted is state-neutral (socket-direct, like throwStarted)', () => {
    const state = receive({ type: 'turn:bonusThrowStarted', playerId: 'p1' });
    expect(state).toBe(initialState);
  });

  it('a missed bonus die gets an activity line and never sets lastRoll', () => {
    const state = receive({
      type: 'turn:bonusRolled',
      playerId: 'p1',
      die: 2,
      face: 6,
      matched: false,
    });
    expect(state.lastRoll).toBeNull();
    expect(state.activityLog.at(-1)?.text).toContain('no match');
  });

  it('a matched bonus die is silent — yahtzee:paid announces it', () => {
    const state = receive({
      type: 'turn:bonusRolled',
      playerId: 'p1',
      die: 6,
      face: 6,
      matched: true,
    });
    expect(state).toBe(initialState);
  });
});

describe('ephemeral special sounds', () => {
  it('leaves large profile and hit payloads outside React state', () => {
    const profile = receive({
      type: 'special-sound:updated',
      playerId: 'p1',
      kind: 'classic',
      wavBase64: 'encoded',
    });
    const hit = receive({ type: 'special-moment:hit', playerId: 'p1', kind: 'classic' });
    expect(profile).toBe(initialState);
    expect(hit).toBe(initialState);
  });
});

describe('classic pot messages', () => {
  it('retains a classic donation with pot-before for chip flight', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_567);
    const state = receive({
      type: 'classic:donated',
      playerId: 'roller',
      amount: 1,
      classicPot: 4,
    });

    expect(state.lastClassicDonate).toEqual({
      playerId: 'roller',
      amount: 1,
      classicPotBefore: 3,
      receivedAt: 4_567,
    });
    expect(state.toasts.some((t) => t.text.includes('Classic Pot'))).toBe(true);
  });

  it('retains a classic win', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_678);
    const state = receive({
      type: 'classic:won',
      playerId: 'roller',
      amount: 4,
    });

    expect(state.lastClassicWin).toEqual({
      playerId: 'roller',
      amount: 4,
      receivedAt: 5_678,
    });
    expect(state.activityLog.some((entry) => entry.text.includes('classic'))).toBe(true);
  });
});

describe('room:state diffs', () => {
  it('toasts when the local player is kicked', () => {
    const prev = snapshot({
      hostId: 'host',
      players: [player('host', { seat: 0, name: 'Host' }), player('me', { seat: 1, name: 'Me' })],
    });
    const next = snapshot({
      hostId: 'host',
      players: [
        player('host', { seat: 0, name: 'Host' }),
        player('me', { seat: null, name: 'Me', banned: true }),
      ],
    });
    const state = receive(
      { type: 'room:state', snapshot: next },
      { ...initialState, me: { playerId: 'me', rejoinToken: 't' }, snapshot: prev },
    );
    expect(state.toasts.some((t) => t.text.includes('kicked'))).toBe(true);
    expect(state.activityLog.some((entry) => entry.text.includes('was kicked'))).toBe(true);
    expect(state.chat).toHaveLength(0);
  });

  it('toasts on host transfer', () => {
    const prev = snapshot({
      hostId: 'old',
      players: [player('old', { seat: 0, name: 'Old' }), player('me', { seat: 1, name: 'Me' })],
    });
    const next = snapshot({
      hostId: 'me',
      players: [player('old', { seat: 0, name: 'Old' }), player('me', { seat: 1, name: 'Me' })],
    });
    const state = receive(
      { type: 'room:state', snapshot: next },
      { ...initialState, me: { playerId: 'me', rejoinToken: 't' }, snapshot: prev },
    );
    expect(state.toasts.some((t) => t.text === 'You are now the host')).toBe(true);
  });

  it('adds a system line when a player joins', () => {
    const prev = snapshot({ players: [player('host', { seat: 0, name: 'Host' })] });
    const next = snapshot({
      players: [player('host', { seat: 0, name: 'Host' }), player('new', { name: 'New' })],
    });
    const state = receive(
      { type: 'room:state', snapshot: next },
      { ...initialState, me: { playerId: 'host', rejoinToken: 't' }, snapshot: prev },
    );
    expect(state.activityLog.some((entry) => entry.text === 'New joined')).toBe(true);
    expect(state.chat).toHaveLength(0);
  });
});

describe('turn and round messages', () => {
  it('records turn:rolled into lastRoll', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9_999);
    const dice = [1, 2, 3, 4, 5] as Die[];
    const state = receive({
      type: 'turn:rolled',
      playerId: 'p1',
      dice,
      rollNumber: 2,
      kept: [0, 1],
      restPose: null,
    });
    expect(state.lastRoll).toEqual({
      playerId: 'p1',
      dice,
      rollNumber: 2,
      kept: [0, 1],
      restPose: null,
      receivedAt: 9_999,
    });
  });

  it('records the delayed roll-resolution marker separately from the settled roll', () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_321);
    const state = receive({
      type: 'turn:rollResolved',
      playerId: 'p1',
      dice: [1, 2, 3, 4, 5],
      rollNumber: 2,
    });
    expect(state.lastRoll).toBeNull();
    expect(state.lastRollResolution).toEqual({
      playerId: 'p1',
      dice: [1, 2, 3, 4, 5],
      rollNumber: 2,
      receivedAt: 4_321,
    });
  });

  it('clears cached round presentation on room join and new round boundaries', () => {
    const stale = {
      playerId: 'p1',
      dice: [1, 2, 3, 4, 5] as Die[],
      rollNumber: 1,
      kept: [],
      restPose: null,
      receivedAt: 1,
    };
    const withStalePresentation: AppState = {
      ...initialState,
      lastRoll: stale,
      roundEnd: { winnerId: 'p1', potWon: 2, scores: [], receivedAt: 2 },
    };

    expect(
      receive(
        {
          type: 'room:joined',
          playerId: 'p1',
          rejoinToken: 'token',
          snapshot: snapshot({ players: [player('p1')] }),
        },
        withStalePresentation,
      ).lastRoll,
    ).toBeNull();
    const nextRound = receive(
      { type: 'round:started', roundNumber: 2, antes: [] },
      withStalePresentation,
    );
    expect(nextRound.lastRoll).toBeNull();
    expect(nextRound.roundEnd).toBeNull();
    expect(
      receive(
        {
          type: 'subround:started',
          tiedPlayerIds: ['p1'],
          anteAmount: 2,
          depth: 1,
          antes: [],
        },
        withStalePresentation,
      ).lastRoll,
    ).toBeNull();
  });

  it('leaves state unchanged for streaming messages', () => {
    const before = { ...initialState, roomId: 'X' };
    expect(
      receive({ type: 'turn:throwStarted', playerId: 'p1', kept: [], rollNumber: 1 }, before),
    ).toBe(before);
    expect(receive({ type: 'dice:frames', playerId: 'p1', frames: [] }, before)).toBe(before);
  });

  it('records round:ended and an activity line without polluting chat', () => {
    const snap = snapshot({
      players: [player('winner', { seat: 0, name: 'Winner' })],
    });
    const state = receive(
      {
        type: 'round:ended',
        winnerId: 'winner',
        potWon: 4,
        scores: [],
      },
      { ...initialState, snapshot: snap },
    );
    expect(state.roundEnd?.winnerId).toBe('winner');
    expect(state.roundEnd?.potWon).toBe(4);
    expect(state.activityLog.some((entry) => entry.text.includes('wins the round'))).toBe(true);
    expect(state.chat).toHaveLength(0);
  });

  it('records a forfeit system line', () => {
    const snap = snapshot({ players: [player('p1', { name: 'Pat' })] });
    const state = receive(
      { type: 'turn:forfeited', playerId: 'p1' },
      { ...initialState, snapshot: snap },
    );
    expect(state.activityLog.some((entry) => entry.text.includes('forfeited'))).toBe(true);
    expect(state.chat).toHaveLength(0);
  });
});

describe('errors and chat', () => {
  it('sets joinError for ROOM_NOT_FOUND', () => {
    const state = receive({
      type: 'error',
      code: 'ROOM_NOT_FOUND',
      message: 'gone',
    });
    expect(state.joinError).toEqual({ code: 'ROOM_NOT_FOUND', message: 'gone' });
    expect(state.toasts).toHaveLength(0);
  });

  it('toasts other errors', () => {
    const state = receive({ type: 'error', code: 'BAD_REQUEST', message: 'bad' });
    expect(state.toasts.some((t) => t.kind === 'error' && t.text === 'bad')).toBe(true);
  });

  it('deduplicates chat messages on rejoin replay', () => {
    const msg: ServerMessage = {
      type: 'chat:message',
      playerId: 'p1',
      playerName: 'Pat',
      chipsAtSend: 12,
      text: 'hi',
      ts: 100,
    };
    const once = receive(msg);
    const twice = receive(msg, once);
    expect(twice.chat).toHaveLength(1);
    expect(twice.chat[0]?.chipsAtSend).toBe(12);
    expect(twice.activityLog).toHaveLength(0);
  });

  it('toasts seat request and denial', () => {
    const requested = receive({
      type: 'seat:requested',
      playerId: 'p2',
      playerName: 'Bob',
      buyIn: 10,
    });
    expect(requested.toasts.some((t) => t.text.includes('Bob'))).toBe(true);
    const denied = receive({ type: 'seat:denied' });
    expect(denied.toasts.some((t) => t.text.includes('denied'))).toBe(true);
  });
});

describe('local actions', () => {
  it('leave-room preserves connection status', () => {
    const state = reducer(
      {
        ...initialState,
        connection: 'open',
        roomId: 'R',
        me: { playerId: 'p', rejoinToken: 't' },
      },
      { type: 'leave-room' },
    );
    expect(state.roomId).toBeNull();
    expect(state.me).toBeNull();
    expect(state.connection).toBe('open');
  });

  it('sets room identity on room:created and room:joined', () => {
    const created = receive({
      type: 'room:created',
      roomId: 'ABC',
      playerId: 'p1',
      rejoinToken: 'tok',
    });
    expect(created.roomId).toBe('ABC');
    expect(created.me).toEqual({ playerId: 'p1', rejoinToken: 'tok' });

    const snap = snapshot({ players: [player('p1', { seat: 0 })] });
    const joined = receive({
      type: 'room:joined',
      playerId: 'p1',
      rejoinToken: 'tok',
      snapshot: snap,
    });
    expect(joined.snapshot).toBe(snap);
    expect(joined.lastAnte).toBeNull();
  });
});
