import type { RoomSettings, ServerMessage } from '@dice/shared';
import { DEFAULT_SETTINGS, MAX_SEATED_PLAYERS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restPoseFor } from './engine.testkit.js';
import { type ClientLink, clampSettings, Room, sanitizeName } from './room.js';
import { RoomManager } from './roomManager.js';

class FakeLink implements ClientLink {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.messages.push(msg);
  }
  last(): ServerMessage | undefined {
    return this.messages[this.messages.length - 1];
  }
  ofType<T extends ServerMessage['type']>(type: T) {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
}

function makeRoom(seatForfeitMs?: number, settings: RoomSettings = DEFAULT_SETTINGS) {
  const room = new Room('TEST22', settings, seatForfeitMs, { afterRollDelayMs: 0 });
  const hostLink = new FakeLink();
  const host = room.addPlayer('Host', hostLink, { host: true });
  return { room, host, hostLink };
}

function seatPlayer(room: Room, name: string, buyIn = 100) {
  const link = new FakeLink();
  const player = room.addPlayer(name, link);
  expect(room.requestSeat(player.id, buyIn)).toBeNull();
  expect(room.approveSeat(player.id)).toBeNull();
  return { player, link };
}

describe('clampSettings / sanitizeName', () => {
  it('clamps out-of-range settings', () => {
    const clamped = clampSettings({
      ...DEFAULT_SETTINGS,
      chipsPerRound: -5,
      maxRolls: 99,
      afterRollDelayMs: 99_999,
      minBuyIn: 50,
      maxBuyIn: 10, // below min → raised to min
      betMultiplier: 0,
      autoIncrement: { enabled: true, everyRounds: 0 },
    });
    expect(clamped.chipsPerRound).toBe(1);
    expect(clamped.maxRolls).toBe(10);
    expect(clamped.afterRollDelayMs).toBe(10_000);
    expect(clamped.maxBuyIn).toBe(50);
    expect(clamped.betMultiplier).toBe(1);
    expect(clamped.autoIncrement).toEqual({ enabled: true, everyRounds: 1 });
  });

  it('defaults missing stakes settings for older persisted settings', () => {
    const { betMultiplier: _m, autoIncrement: _ai, ...withoutStakes } = DEFAULT_SETTINGS;
    const defaulted = clampSettings(withoutStakes as RoomSettings);
    expect(defaulted.betMultiplier).toBe(DEFAULT_SETTINGS.betMultiplier);
    expect(defaulted.autoIncrement).toEqual(DEFAULT_SETTINGS.autoIncrement);
  });

  it('defaults a missing after-roll delay for older persisted settings', () => {
    const { afterRollDelayMs: _omitted, ...withoutDelay } = DEFAULT_SETTINGS;
    expect(clampSettings(withoutDelay as RoomSettings).afterRollDelayMs).toBe(2_000);
  });

  it('defaults a missing yahtzeeBonus and clamps a negative amount', () => {
    const { yahtzeeBonus: _omitted, ...withoutBonus } = DEFAULT_SETTINGS;
    const defaulted = clampSettings(withoutBonus as typeof DEFAULT_SETTINGS);
    expect(defaulted.yahtzeeBonus).toEqual(DEFAULT_SETTINGS.yahtzeeBonus);

    const clamped = clampSettings({
      ...DEFAULT_SETTINGS,
      yahtzeeBonus: { enabled: false, amountPerPlayer: -3 },
    });
    expect(clamped.yahtzeeBonus).toEqual({ enabled: false, amountPerPlayer: 0 });
  });

  it('strips control characters and length-limits names', () => {
    expect(sanitizeName('  Kice\u0000\u001f  ')).toBe('Kice');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(24);
  });
});

describe('Room membership & seats', () => {
  it('first player becomes host', () => {
    const { room, host } = makeRoom();
    expect(room.hostId).toBe(host.id);
    expect(room.buildSnapshot(host.id).players[0]?.isHost).toBe(true);
  });

  it('seat request notifies the host; approval seats with buy-in chips', () => {
    const { room, hostLink } = makeRoom();
    const link = new FakeLink();
    const p = room.addPlayer('Ann', link);

    expect(room.requestSeat(p.id, 100)).toBeNull();
    expect(hostLink.ofType('seat:requested')).toHaveLength(1);

    expect(room.approveSeat(p.id)).toBeNull();
    expect(p.seat).toBe(0);
    expect(p.chips).toBe(100);
    expect(room.seatRequests.size).toBe(0);
  });

  it("host's own seat request auto-approves", () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 50)).toBeNull();
    expect(host.seat).toBe(0);
    expect(host.chips).toBe(50);
  });

  it('denies a seat request with a notification', () => {
    const { room } = makeRoom();
    const link = new FakeLink();
    const p = room.addPlayer('Bob', link);
    room.requestSeat(p.id, 100);

    expect(room.denySeat(p.id)).toBeNull();
    expect(link.ofType('seat:denied')).toHaveLength(1);
    expect(p.seat).toBeNull();
  });

  it('rejects out-of-bounds buy-ins', () => {
    const { room } = makeRoom();
    const p = room.addPlayer('Cheap', new FakeLink());
    expect(room.requestSeat(p.id, DEFAULT_SETTINGS.minBuyIn - 1)).toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(room.requestSeat(p.id, DEFAULT_SETTINGS.maxBuyIn + 1)).toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('uses a fixed eight-player capacity and rejects a ninth seat request', () => {
    const { room } = makeRoom();
    for (let i = 0; i < MAX_SEATED_PLAYERS; i++) seatPlayer(room, `P${i}`);
    const p = room.addPlayer('Late', new FakeLink());
    expect(room.requestSeat(p.id, 100)).toMatchObject({ code: 'ROOM_FULL' });
  });

  it('allows a player to request and receive a seat while a game is playing', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    seatPlayer(room, 'Second');
    expect(room.startGame(host.id)).toBeNull();

    const late = room.addPlayer('Late', new FakeLink());
    expect(room.requestSeat(late.id, 100)).toBeNull();
    expect(room.approveSeat(late.id)).toBeNull();
    expect(room.phase).toBe('playing');
    expect(late.seat).toBe(2);
  });

  it('assigns the first free seat index', () => {
    const { room } = makeRoom();
    const a = seatPlayer(room, 'A').player;
    const b = seatPlayer(room, 'B').player;
    expect([a.seat, b.seat]).toEqual([0, 1]);

    room.kick(a.id);
    const c = seatPlayer(room, 'C').player;
    expect(c.seat).toBe(0); // reuses the freed seat
    expect(b.seat).toBe(1);
  });
});

describe('Room kick & ban', () => {
  it('kicked player becomes a banned spectator and cannot re-request', () => {
    const { room } = makeRoom();
    const { player } = seatPlayer(room, 'Troll');

    expect(room.kick(player.id)).toBeNull();
    expect(player.seat).toBeNull();
    expect(player.banned).toBe(true);
    expect(room.requestSeat(player.id, 100)).toMatchObject({ code: 'BANNED' });
  });

  it('host cannot kick themself', () => {
    const { room, host } = makeRoom();
    expect(room.kick(host.id)).toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('Room disconnects, host transfer, forfeit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('transfers host to the longest-seated connected player', () => {
    const { room, host } = makeRoom();
    const first = seatPlayer(room, 'First').player;
    vi.advanceTimersByTime(10);
    seatPlayer(room, 'Second');

    room.handleDisconnect(host.id);
    expect(room.hostId).toBe(first.id);
  });

  it('falls back to the longest-connected spectator when nobody is seated', () => {
    const { room, host } = makeRoom();
    const spec1 = room.addPlayer('S1', new FakeLink());
    vi.advanceTimersByTime(10);
    room.addPlayer('S2', new FakeLink());

    room.handleDisconnect(host.id);
    expect(room.hostId).toBe(spec1.id);
  });

  it('forfeits the seat 2 minutes after disconnect, but not on rejoin', () => {
    const { room } = makeRoom(120_000);
    const { player } = seatPlayer(room, 'Flaky');
    const token = player.rejoinToken;

    room.handleDisconnect(player.id);
    vi.advanceTimersByTime(119_000);
    expect(player.seat).toBe(0);

    // Rejoin just in time cancels the forfeit.
    expect(room.rejoin(token, new FakeLink())).toBe(player);
    vi.advanceTimersByTime(60_000);
    expect(player.seat).toBe(0);
    expect(player.connected).toBe(true);
  });

  it('removes the seat when the forfeit timer lapses', () => {
    const { room } = makeRoom(120_000);
    const { player } = seatPlayer(room, 'Gone');
    room.handleDisconnect(player.id);
    vi.advanceTimersByTime(120_000);
    expect(player.seat).toBeNull();
  });

  it('tracks emptySince for the reaper', () => {
    const { room, host } = makeRoom();
    expect(room.emptySince).toBeNull(); // host is connected
    room.handleDisconnect(host.id);
    expect(room.emptySince).not.toBeNull();
  });
});

describe('Room snapshots', () => {
  it('host sees all seat requests; others see only their own', () => {
    const { room, host } = makeRoom();
    const a = room.addPlayer('A', new FakeLink());
    const b = room.addPlayer('B', new FakeLink());
    room.requestSeat(a.id, 100);
    room.requestSeat(b.id, 200);

    expect(room.buildSnapshot(host.id).seatRequests).toHaveLength(2);
    expect(room.buildSnapshot(a.id).seatRequests).toEqual([{ playerId: a.id, buyIn: 100 }]);
  });

  it('never exposes rejoin tokens', () => {
    const { room, host } = makeRoom();
    const json = JSON.stringify(room.buildSnapshot(host.id));
    expect(json).not.toContain(host.rejoinToken);
  });

  it('broadcastState sends each connection its own snapshot', () => {
    const { room, hostLink } = makeRoom();
    const link = new FakeLink();
    const p = room.addPlayer('Ann', link);
    room.requestSeat(p.id, 100);
    room.broadcastState();

    const hostSnap = hostLink.ofType('room:state').at(-1)!.snapshot;
    const annSnap = link.ofType('room:state').at(-1)!.snapshot;
    expect(hostSnap.seatRequests).toHaveLength(1);
    expect(annSnap.seatRequests).toHaveLength(1); // her own
    expect(annSnap.players.map((pl) => pl.name).sort()).toEqual(['Ann', 'Host']);
  });
});

describe('Room roll broadcasts (ADR 005)', () => {
  it('turn:rolled carries the validated rest pose to every client', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { link } = seatPlayer(room, 'P1');
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    const dice = [4, 4, 4, 2, 1] as const;
    const pose = restPoseFor([...dice]);
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [...dice], pose)).toBeNull();

    const rolled = link.ofType('turn:rolled');
    expect(rolled).toHaveLength(1);
    expect(rolled[0]).toMatchObject({ playerId: host.id, dice: [...dice], restPose: pose });
    expect(link.ofType('turn:rollResolved')).toEqual([
      { type: 'turn:rollResolved', playerId: host.id, dice: [...dice], rollNumber: 1 },
    ]);
    // The follow-up snapshot exposes it too (rejoin path).
    expect(link.ofType('room:state').at(-1)?.snapshot.game?.currentTurn?.restPose).toEqual(pose);
  });

  it('turn:rolled carries restPose null when the roller sent none', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { link } = seatPlayer(room, 'P1');
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [4, 4, 4, 2, 1])).toBeNull();
    expect(link.ofType('turn:rolled')[0]?.restPose).toBeNull();
  });
});

describe('Room ante broadcasts', () => {
  it('broadcasts exact normal-round contributions', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { player, link } = seatPlayer(room, 'P1', 100);

    expect(room.startGame(host.id)).toBeNull();

    expect(link.ofType('round:started')).toEqual([
      {
        type: 'round:started',
        roundNumber: 1,
        antes: [
          { playerId: host.id, amount: 1 },
          { playerId: player.id, amount: 1 },
        ],
      },
    ]);
  });

  it('broadcasts equal short-stack floor payments when a tie starts a sub-round', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { player, link } = seatPlayer(room, 'Short stack', 10);
    player.chips = 2;
    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;

    for (const [index, playerId] of [host.id, player.id].entries()) {
      expect(engine.beginThrow(playerId, [])).toBeNull();
      expect(engine.commitThrow(playerId, [5, 5, 4, 3, 2])).toBeNull();
      // The second player auto-stands at the first player's one-roll cap.
      if (index === 0) expect(engine.stand(playerId)).toBeNull();
    }

    expect(link.ofType('subround:started')).toEqual([
      {
        type: 'subround:started',
        tiedPlayerIds: [host.id, player.id],
        anteAmount: 2,
        depth: 1,
        antes: [
          { playerId: host.id, amount: 1 },
          { playerId: player.id, amount: 1 },
        ],
      },
    ]);
  });
});

describe('Room mid-game settings', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('allows host to update settings while a round is in progress', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    seatPlayer(room, 'P1', 100);
    expect(room.startGame(host.id)).toBeNull();
    expect(room.phase).toBe('playing');

    expect(room.updateSettings({ ...DEFAULT_SETTINGS, chipsPerRound: 4 })).toBeNull();
    expect(room.settings.chipsPerRound).toBe(4);
    expect(room.engine).not.toBeNull();
  });

  it('applies a mid-round ante change on the next round only', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { player, link } = seatPlayer(room, 'P1', 100);
    expect(room.startGame(host.id)).toBeNull();

    const chipsBefore = host.chips + player.chips + room.engine!.pot;
    expect(link.ofType('round:started')[0]?.antes).toEqual([
      { playerId: host.id, amount: 1 },
      { playerId: player.id, amount: 1 },
    ]);

    // Bump ante mid-round — current pot / stacks must not change yet.
    expect(room.updateSettings({ ...DEFAULT_SETTINGS, chipsPerRound: 5 })).toBeNull();
    expect(host.chips + player.chips + room.engine!.pot).toBe(chipsBefore);

    const engine = room.engine!;
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [6, 6, 6, 6, 6])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.beginThrow(player.id, [])).toBeNull();
    expect(engine.commitThrow(player.id, [1, 1, 2, 3, 4])).toBeNull();
    // Second player auto-stands at the one-roll cap.

    expect(room.phase).toBe('roundEnd');
    expect(room.continueRound(player.id)).toBeNull();
    expect(room.phase).toBe('playing');

    const round2 = link.ofType('round:started').at(-1)!;
    expect(round2.roundNumber).toBe(2);
    expect(round2.antes).toEqual([
      { playerId: host.id, amount: 5 },
      { playerId: player.id, amount: 5 },
    ]);
    expect(host.chips + player.chips + room.engine!.pot).toBe(chipsBefore);
  });

  it('mirrors engine auto-raises into room.settings so hosts can edit them', () => {
    const { room, host } = makeRoom(undefined, {
      ...DEFAULT_SETTINGS,
      betMultiplier: 2,
      autoIncrement: { enabled: true, everyRounds: 1 },
    });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { player, link } = seatPlayer(room, 'P1', 100);
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [6, 6, 6, 6, 2])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.beginThrow(player.id, [])).toBeNull();
    expect(engine.commitThrow(player.id, [2, 3, 4, 6, 6])).toBeNull();
    // Second player auto-stands at the one-roll cap; round ends.
    expect(room.phase).toBe('roundEnd');
    expect(room.continueRound(player.id)).toBeNull();

    // Round 2 crossed the every-1-round boundary: stored amounts doubled and
    // are visible on the room (settings panel / snapshots).
    expect(room.settings.chipsPerRound).toBe(2);
    expect(room.settings.straightPayout.amountPerPlayer).toBe(
      DEFAULT_SETTINGS.straightPayout.amountPerPlayer * 2,
    );
    const round2 = link.ofType('round:started').at(-1)!;
    expect(round2.antes).toEqual([
      { playerId: host.id, amount: 2 },
      { playerId: player.id, amount: 2 },
    ]);
  });

  it('allows only seated players to dismiss the recap and tolerates duplicate dismissals', () => {
    const { room, host } = makeRoom();
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const { player } = seatPlayer(room, 'P1', 100);
    const spectator = room.addPlayer('Watcher', new FakeLink());
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [4, 4, 3, 2, 6])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.beginThrow(player.id, [])).toBeNull();
    expect(engine.commitThrow(player.id, [3, 3, 2, 4, 6])).toBeNull();
    expect(room.phase).toBe('roundEnd');

    expect(room.continueRound(spectator.id)).toMatchObject({ code: 'NOT_SEATED' });
    expect(room.continueRound(player.id)).toBeNull();
    expect(room.phase).toBe('playing');
    expect(engine.roundNumber).toBe(2);
    expect(room.continueRound(host.id)).toBeNull();
    expect(engine.roundNumber).toBe(2);
  });
});

describe('RoomManager', () => {
  it('generates 6-char unambiguous ids', () => {
    const mgr = new RoomManager();
    const room = mgr.create(DEFAULT_SETTINGS);
    expect(room.id).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(mgr.get(room.id)).toBe(room);
    mgr.stop();
  });

  it('reaps rooms empty for longer than the TTL', () => {
    const mgr = new RoomManager(30 * 60 * 1000);
    const room = mgr.create(DEFAULT_SETTINGS);
    room.emptySince = Date.now() - 31 * 60 * 1000;

    mgr.reapEmptyRooms();
    expect(mgr.get(room.id)).toBeUndefined();
    mgr.stop();
  });

  it('does not reap occupied rooms', () => {
    const mgr = new RoomManager();
    const room = mgr.create(DEFAULT_SETTINGS);
    room.addPlayer('Host', new FakeLink(), { host: true }); // connected → emptySince null
    mgr.reapEmptyRooms(Date.now() + 60 * 60 * 1000);
    expect(mgr.get(room.id)).toBe(room);
    mgr.stop();
  });

  it('lists only rooms with connected players and includes live round details', () => {
    const mgr = new RoomManager();
    const abandoned = mgr.create(DEFAULT_SETTINGS);
    const room = mgr.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    const guest = room.addPlayer('Guest', new FakeLink());

    expect(mgr.listActiveRooms()).toEqual([
      {
        roomId: room.id,
        phase: 'lobby',
        roundNumber: null,
        playerNames: ['Host', 'Guest'],
      },
    ]);

    expect(room.requestSeat(host.id, 100)).toBeNull();
    expect(room.requestSeat(guest.id, 100)).toBeNull();
    expect(room.approveSeat(guest.id)).toBeNull();
    expect(room.startGame(host.id)).toBeNull();
    room.handleDisconnect(guest.id);

    expect(mgr.listActiveRooms()).toEqual([
      {
        roomId: room.id,
        phase: 'playing',
        roundNumber: 1,
        playerNames: ['Host'],
      },
    ]);
    expect(abandoned.emptySince).not.toBeNull();
    mgr.stop();
  });
});
