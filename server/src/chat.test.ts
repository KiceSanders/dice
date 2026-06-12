import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { recoverRooms, RoomLogStore } from './persistence.js';
import {
  CHAT_HISTORY_SIZE,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  Room,
  type ClientLink,
} from './room.js';
import { RoomManager } from './roomManager.js';

class FakeLink implements ClientLink {
  messages: ServerMessage[] = [];
  send(msg: ServerMessage) {
    this.messages.push(msg);
  }
  ofType<T extends ServerMessage['type']>(type: T) {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
}

function makeRoom() {
  const room = new Room('CHAT22', DEFAULT_SETTINGS);
  const hostLink = new FakeLink();
  const host = room.addPlayer('Host', hostLink, { host: true });
  const guestLink = new FakeLink();
  const guest = room.addPlayer('Ann', guestLink);
  return { room, host, hostLink, guest, guestLink };
}

describe('room chat (Phase 10.1)', () => {
  it('broadcasts chat:message to everyone and records history', () => {
    const { room, host, hostLink, guestLink } = makeRoom();
    expect(room.sendChat(host.id, '  hello table  ')).toBeNull();

    for (const link of [hostLink, guestLink]) {
      const msgs = link.ofType('chat:message');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ playerId: host.id, playerName: 'Host', text: 'hello table' });
      expect(msgs[0]!.ts).toBeTypeOf('number');
    }
    expect(room.chatHistory).toHaveLength(1);
  });

  it('rejects empty / control-char-only / unknown-sender messages', () => {
    const { room, host } = makeRoom();
    expect(room.sendChat(host.id, '   ')?.code).toBe('BAD_REQUEST');
    expect(room.sendChat(host.id, '\u0000\u001f')?.code).toBe('BAD_REQUEST');
    expect(room.sendChat('nobody', 'hi')?.code).toBe('BAD_REQUEST');
    expect(room.chatHistory).toHaveLength(0);
  });

  it('rate-limits to 5 messages per 5 seconds per player, then recovers', () => {
    vi.useFakeTimers();
    try {
      const { room, host, guest } = makeRoom();
      for (let i = 0; i < CHAT_RATE_LIMIT; i++) {
        expect(room.sendChat(host.id, `msg ${i}`)).toBeNull();
      }
      expect(room.sendChat(host.id, 'one too many')?.code).toBe('RATE_LIMITED');
      // The limit is per player: another player can still chat.
      expect(room.sendChat(guest.id, 'still fine')).toBeNull();

      vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS + 1);
      expect(room.sendChat(host.id, 'window passed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps the history ring buffer and replays it to a joining player', () => {
    const { room, host } = makeRoom();
    vi.useFakeTimers();
    try {
      for (let i = 0; i < CHAT_HISTORY_SIZE + 10; i++) {
        expect(room.sendChat(host.id, `msg ${i}`)).toBeNull();
        vi.advanceTimersByTime(CHAT_RATE_WINDOW_MS);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(room.chatHistory).toHaveLength(CHAT_HISTORY_SIZE);
    expect(room.chatHistory[0]!.text).toBe('msg 10');

    const lateLink = new FakeLink();
    const late = room.addPlayer('Late', lateLink);
    room.sendChatHistory(late.id);
    const replayed = lateLink.ofType('chat:message');
    expect(replayed).toHaveLength(CHAT_HISTORY_SIZE);
    expect(replayed[replayed.length - 1]!.text).toBe(`msg ${CHAT_HISTORY_SIZE + 9}`);
  });
});

describe('chat persistence across restarts', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'dice-chat-logs-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('replays chat from the event log after a simulated restart', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.sendChat(host.id, 'survives restarts')).toBeNull();
    await store.flush();

    const manager2 = new RoomManager(undefined, undefined, new RoomLogStore(dir));
    expect(await recoverRooms(new RoomLogStore(dir), manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;
    expect(room2.chatHistory).toHaveLength(1);
    expect(room2.chatHistory[0]).toMatchObject({ playerId: host.id, text: 'survives restarts' });

    manager.stop();
    manager2.stop();
  });

  it('survives round-end log compaction (chat is part of the snapshot)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(DEFAULT_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const link = new FakeLink();
    const p1 = room.addPlayer('P1', link);
    expect(room.requestSeat(p1.id, 100)).toBeNull();
    expect(room.approveSeat(p1.id)).toBeNull();

    expect(room.sendChat(host.id, 'before the round')).toBeNull();

    // Play a 1-roll round to trigger compaction at round end.
    const faces = [6, 6, 6, 6, 1, 1, 1, 2, 3, 5];
    let i = 0;
    room.engineOpts = { rng: () => (faces[i++]! - 1) / 6 };
    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(engine.roll(host.id, [])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(engine.roll(p1.id, [])).toBeNull(); // capped at 1 roll → auto-stand
    expect(engine.phase).toBe('roundEnd');

    expect(room.sendChat(p1.id, 'after compaction')).toBeNull();
    await store.flush();

    const manager2 = new RoomManager(undefined, undefined, new RoomLogStore(dir));
    expect(await recoverRooms(new RoomLogStore(dir), manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;
    expect(room2.chatHistory.map((c) => c.text)).toEqual(['before the round', 'after compaction']);

    manager.stop();
    manager2.stop();
  });
});
