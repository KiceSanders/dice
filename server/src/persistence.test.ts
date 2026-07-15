import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ServerMessage } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restPoseFor, roll } from './engine.testkit.js';
import { RoomLogStore, recoverRooms } from './persistence.js';
import type { ClientLink, Room } from './room.js';
import { RoomManager } from './roomManager.js';

class FakeLink implements ClientLink {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.messages.push(msg);
  }
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
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    expect(engine.currentTurnPlayerId).toBe(host.id);
    expect(roll(engine, host.id, [3, 3, 4, 5, 6])).toBeNull();
    expect(roll(engine, host.id, [3, 3, 3, 2, 1], [0, 1])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.currentTurnPlayerId).toBe(p1.id);
    expect(roll(engine, p1.id, [2, 2, 6, 6, 5])).toBeNull();

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

    // Game state survived: pot, round, roll-to-beat, mid-turn dice.
    const engine2 = room2.engine!;
    expect(engine2.pot).toBe(2);
    expect(engine2.roundNumber).toBe(before.roundNumber);
    const after = engine2.publicState();
    expect(after.pot).toBe(before.pot);
    expect(after.rollToBeat?.playerIds).toEqual([host.id]);
    expect(after.rollToBeat?.score).toEqual(before.rollToBeat?.score);
    expect(after.currentTurn?.playerId).toBe(p1.id);
    expect(after.currentTurn?.dice).toEqual([2, 2, 6, 6, 5]);
    expect(after.currentTurn?.rollsUsed).toBe(1);
    expect(after.currentTurn?.rollCap).toBe(2); // host's 2 rolls capped the round

    // Rejoining with the old token reclaims the identity and resumes play.
    const rejoined = room2.rejoin(p1.rejoinToken, new FakeLink());
    expect(rejoined?.id).toBe(p1.id);
    expect(rejoined?.connected).toBe(true);
    expect(room2.engine!.publicState().currentTurn?.playerId).toBe(p1.id);

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

  it('replays physics-thrown rolls exactly (ADR 004)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const p1 = seatPlayer(room, 'P1', 50);

    // Every roll below is client-reported physics (ADR 004: no server rng exists).
    expect(room.startGame(host.id)).toBeNull();

    const engine = room.engine!;
    const settlePose = restPoseFor([3, 3, 2, 2, 1]);
    const standPose = settlePose.map((p, i): typeof p => [
      p[0]!,
      p[1]!,
      p[2]! + 0.02 * (i + 1),
      p[3]!,
      p[4]!,
      p[5]!,
      p[6]!,
    ]);
    expect(engine.beginThrow(host.id, [])).toBeNull();
    expect(engine.commitThrow(host.id, [3, 3, 4, 5, 6])).toBeNull();
    expect(engine.beginThrow(host.id, [0, 1])).toBeNull();
    expect(engine.commitThrow(host.id, [3, 3, 2, 2, 1], settlePose)).toBeNull();
    expect(engine.stand(host.id, standPose)).toBeNull();

    // p1's roll reports no pose (e.g. pre-ADR-005 client) — must replay as null.
    expect(engine.beginThrow(p1.id, [])).toBeNull();
    expect(engine.commitThrow(p1.id, [2, 2, 6, 6, 5])).toBeNull();
    expect(engine.beginThrow(p1.id, [2, 3])).toBeNull(); // in flight at "crash"

    await store.flush();

    const store2 = new RoomLogStore(dir);
    const manager2 = new RoomManager(undefined, undefined, store2);
    expect(await recoverRooms(store2, manager2)).toBe(1);
    const after = manager2.get(room.id)!.engine!.publicState();

    // Committed physics dice re-applied exactly via replayRolled.
    expect(after.rollToBeat?.playerIds).toEqual([host.id]);
    expect(after.rollToBeat?.dice).toEqual([3, 3, 2, 2, 1]);
    // The rest pose survives the crash with the hand it belongs to (ADR 005).
    expect(after.rollToBeat?.restPose).toEqual(standPose);
    expect(after.currentTurn?.playerId).toBe(p1.id);
    expect(after.currentTurn?.dice).toEqual([2, 2, 6, 6, 5]);
    expect(after.currentTurn?.rollsUsed).toBe(1);
    expect(after.currentTurn?.restPose).toBeNull();
    // The un-committed throw is not in the log: p1 just re-throws after rejoin.
    expect(after.currentTurn?.throwing).toBe(false);

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

    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(roll(engine, host.id, [6, 6, 6, 6, 1])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    // Host stood after 1 roll → p1 is capped at 1 roll and auto-stands.
    expect(roll(engine, p1.id, [1, 1, 2, 3, 5])).toBeNull();
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
    expect(room2.players.get(host.id)!.chips).toBe(111); // first-roll Yahtzee payout + pot
    expect(room2.players.get(p1.id)!.chips).toBe(89);

    manager.stop();
    manager2.stop();
    await store.flush();
    await store2.flush();
  });

  it('straight payouts survive replay with identical chip movements', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const p1 = seatPlayer(room, 'P1', 50);

    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    // Straight mid-round: p1 pays 5 on the spot (default payout config).
    expect(roll(engine, host.id, [1, 2, 3, 4, 5])).toBeNull();
    expect(room.players.get(host.id)!.chips).toBe(104); // 100 - 1 ante + 5
    expect(room.players.get(p1.id)!.chips).toBe(44); // 50 - 1 ante - 5

    await store.flush();
    const store2 = new RoomLogStore(dir);
    const manager2 = new RoomManager(undefined, undefined, store2);
    expect(await recoverRooms(store2, manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;

    // Replaying the rolled event re-fires applyStraightPayout identically.
    expect(room2.players.get(host.id)!.chips).toBe(104);
    expect(room2.players.get(p1.id)!.chips).toBe(44);

    manager.stop();
    manager2.stop();
    await store2.flush();
  });

  it('a crash between quint and bonus die recovers with the bonus still pending', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const p1 = seatPlayer(room, 'P1', 50);

    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(roll(engine, host.id, [6, 6, 6, 6, 6])).toBeNull();
    expect(engine.publicState().currentTurn?.bonusPending).toEqual({ face: 6 });

    await store.flush();
    const store2 = new RoomLogStore(dir);
    const manager2 = new RoomManager(undefined, undefined, store2);
    expect(await recoverRooms(store2, manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;

    // Replaying the quint re-applies the first-roll payout and re-offers the bonus.
    const turn = room2.engine!.publicState().currentTurn;
    expect(turn?.playerId).toBe(host.id);
    expect(turn?.bonusPending).toEqual({ face: 6 });
    expect(turn?.throwing).toBe(false);
    expect(room2.players.get(host.id)!.chips).toBe(109);
    expect(room2.players.get(p1.id)!.chips).toBe(39);

    // The rejoining roller can complete the bonus throw.
    room2.rejoin(host.rejoinToken, new FakeLink());
    room2.rejoin(p1.rejoinToken, new FakeLink());
    expect(room2.engine!.beginBonusThrow(host.id)).toBeNull();
    expect(room2.engine!.commitBonusThrow(host.id, 6)).toBeNull();
    expect(room2.players.get(host.id)!.chips).toBe(119);
    expect(room2.players.get(p1.id)!.chips).toBe(29);
    expect(room2.engine!.currentTurnPlayerId).toBe(p1.id);

    manager.stop();
    manager2.stop();
    await store2.flush();
  });

  it('yahtzee bonus payouts survive replay with identical chip movements', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const p1 = seatPlayer(room, 'P1', 50);

    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(roll(engine, host.id, [6, 6, 6, 6, 6])).toBeNull();
    expect(engine.beginBonusThrow(host.id)).toBeNull();
    expect(engine.commitBonusThrow(host.id, 6)).toBeNull();
    expect(room.players.get(host.id)!.chips).toBe(119); // first-roll + bonus payouts
    expect(room.players.get(p1.id)!.chips).toBe(29);

    await store.flush();
    const manager2 = new RoomManager(undefined, undefined, new RoomLogStore(dir));
    expect(await recoverRooms(new RoomLogStore(dir), manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;

    // Replaying rolled + bonusRolled re-fires the payout identically.
    expect(room2.players.get(host.id)!.chips).toBe(119);
    expect(room2.players.get(p1.id)!.chips).toBe(29);
    expect(room2.engine!.publicState().currentTurn?.bonusPending).toBeNull();

    manager.stop();
    manager2.stop();
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
