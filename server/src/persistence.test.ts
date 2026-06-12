import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Die, ServerMessage } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { recoverRooms, RoomLogStore } from './persistence.js';
import type { ClientLink, Room } from './room.js';
import { RoomManager } from './roomManager.js';

class FakeLink implements ClientLink {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.messages.push(msg);
  }
}

/** Rng stub yielding the given die faces in order (same as engine tests). */
function rngFor(faces: Die[]) {
  let i = 0;
  return () => {
    const face = faces[i++];
    if (face === undefined) throw new Error(`rng exhausted after ${i - 1} dice`);
    return (face - 1) / 6;
  };
}

function seatPlayer(room: Room, name: string, buyIn: number) {
  const link = new FakeLink();
  const player = room.addPlayer(name, link);
  expect(room.requestSeat(player.id, buyIn)).toBeNull();
  expect(room.approveSeat(player.id)).toBeNull();
  return player;
}

describe('persistence & crash recovery (Phase 6)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'dice-logs-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('recovers a half-played round after a simulated restart (6.4)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull(); // host auto-approves
    const p1 = seatPlayer(room, 'P1', 50);

    // Host: 3,3,4,5,6 → keep the 3s → reroll to 3,3,3,2,1, stand (2 rolls).
    // P1: 2,2,6,6,5 first roll — crash happens mid-turn here.
    room.engineOpts = { rng: rngFor([3, 3, 4, 5, 6, 3, 2, 1, 2, 2, 6, 6, 5]) };
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    expect(engine.currentTurnPlayerId).toBe(host.id);
    expect(engine.roll(host.id, [])).toBeNull();
    expect(engine.roll(host.id, [0, 1])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.currentTurnPlayerId).toBe(p1.id);
    expect(engine.roll(p1.id, [])).toBeNull();

    const before = engine.publicState();
    await store.flush();

    // -- simulated restart: fresh store + manager rebuilt from the log dir ----
    const store2 = new RoomLogStore(dir);
    const manager2 = new RoomManager(undefined, undefined, store2);
    expect(await recoverRooms(store2, manager2)).toBe(1);

    const room2 = manager2.get(room.id)!;
    expect(room2).toBeDefined();
    expect(room2.settings).toEqual(room.settings);
    expect(room2.hostId).toBe(host.id);

    // Players survived with identity, seats, chips, and tokens — disconnected.
    for (const original of room.players.values()) {
      const recovered = room2.players.get(original.id)!;
      expect(recovered).toBeDefined();
      expect(recovered.name).toBe(original.name);
      expect(recovered.rejoinToken).toBe(original.rejoinToken);
      expect(recovered.seat).toBe(original.seat);
      expect(recovered.chips).toBe(original.chips);
      expect(recovered.banned).toBe(original.banned);
      expect(recovered.connected).toBe(false);
    }

    // Game state survived: pot, round, streak, roll-to-beat, mid-turn dice.
    const engine2 = room2.engine!;
    expect(engine2.pot).toBe(2);
    expect(engine2.roundNumber).toBe(before.roundNumber);
    const after = engine2.publicState();
    expect(after.straightStreak).toBe(before.straightStreak);
    expect(after.rollToBeat?.playerId).toBe(host.id);
    expect(after.rollToBeat?.score).toEqual(before.rollToBeat?.score);
    expect(after.currentTurn?.playerId).toBe(p1.id);
    expect(after.currentTurn?.dice).toEqual([2, 2, 6, 6, 5]);
    expect(after.currentTurn?.rollsUsed).toBe(1);
    expect(after.currentTurn?.rollCap).toBe(2); // host's 2 rolls capped the round

    // Rejoining with the old token reclaims the identity and resumes play.
    const rejoined = room2.rejoin(p1.rejoinToken, new FakeLink());
    expect(rejoined?.id).toBe(p1.id);
    expect(rejoined?.connected).toBe(true);
    expect(room2.engine!.publicState().currentTurn!.deadline).toBeGreaterThan(Date.now());

    // Play continues: P1 stands, host's three 3s beat the pair of 6s.
    expect(engine2.stand(p1.id)).toBeNull();
    expect(engine2.phase).toBe('roundEnd');
    expect(room2.players.get(host.id)!.chips).toBe(101); // 100 - 1 ante + 2 pot
    expect(room2.players.get(p1.id)!.chips).toBe(49);

    manager.stop();
    manager2.stop();
    await store.flush();
    await store2.flush();
  });

  it('compacts the log to a single snapshot at round end and recovers from it (6.3)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const p1 = seatPlayer(room, 'P1', 100);

    room.engineOpts = { rng: rngFor([6, 6, 6, 6, 1, 1, 1, 2, 3, 5]) };
    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(engine.roll(host.id, [])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    // Host stood after 1 roll → p1 is capped at 1 roll and auto-stands.
    expect(engine.roll(p1.id, [])).toBeNull();
    expect(engine.phase).toBe('roundEnd');

    await store.flush();
    const raw = await readFile(path.join(dir, `${room.id}.log`), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]!) as { type: string }).type).toBe('snapshot');

    const store2 = new RoomLogStore(dir);
    const manager2 = new RoomManager(undefined, undefined, store2);
    expect(await recoverRooms(store2, manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;
    expect(room2.phase).toBe('roundEnd');
    expect(room2.engine!.roundNumber).toBe(1);
    expect(room2.players.get(host.id)!.chips).toBe(101); // four 6s won the pot
    expect(room2.players.get(p1.id)!.chips).toBe(99);

    manager.stop();
    manager2.stop();
    await store.flush();
    await store2.flush();
  });

  it('survives kicks and settings changes (replayed through the same reducers)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    const p1 = seatPlayer(room, 'P1', 100);
    expect(room.kick(p1.id)).toBeNull();
    expect(room.updateSettings({ ...DEFAULT_SETTINGS, chipsPerRound: 5 })).toBeNull();
    await store.flush();

    const manager2 = new RoomManager(undefined, undefined, new RoomLogStore(dir));
    expect(await recoverRooms(new RoomLogStore(dir), manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;
    expect(room2.hostId).toBe(host.id);
    expect(room2.settings.chipsPerRound).toBe(5);
    const kicked = room2.players.get(p1.id)!;
    expect(kicked.seat).toBeNull();
    expect(kicked.banned).toBe(true);
  });

  it('deletes the log when a room is destroyed (6.3)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    room.addPlayer('Host', new FakeLink(), { host: true });
    await store.flush();
    expect(existsSync(path.join(dir, `${room.id}.log`))).toBe(true);

    manager.destroy(room.id);
    await store.flush();
    expect(existsSync(path.join(dir, `${room.id}.log`))).toBe(false);
  });
});
