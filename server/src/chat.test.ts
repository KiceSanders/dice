import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ServerMessage } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roll } from './engine.testkit.js';
import { RoomLogStore, recoverRooms } from './persistence.js';
import {
  CHAT_HISTORY_SIZE,
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  type ClientLink,
  Room,
} from './room.js';
import { RoomManager } from './roomManager.js';

const TEST_SETTINGS = { ...DEFAULT_SETTINGS, afterRollDelayMs: 0 };

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
  const room = new Room('CHAT22', TEST_SETTINGS);
  const hostLink = new FakeLink();
  const host = room.addPlayer('Host', hostLink, { host: true });
  const guestLink = new FakeLink();
  const guest = room.addPlayer('Ann', guestLink);
  return { room, host, hostLink, guest, guestLink };
}

describe('room chat (Phase 10.1)', () => {
  it('broadcasts chat:message to everyone and records history', () => {
    const { room, host, hostLink, guestLink } = makeRoom();
    host.chips = 37;
    expect(room.sendChat(host.id, '  hello table  ')).toBeNull();

    for (const link of [hostLink, guestLink]) {
      const msgs = link.ofType('chat:message');
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        playerId: host.id,
        playerName: 'Host',
        chipsAtSend: 37,
        text: 'hello table',
      });
      expect(msgs[0]!.ts).toBeTypeOf('number');
    }
    expect(room.chatHistory).toHaveLength(1);
    expect(room.chatHistory[0]?.chipsAtSend).toBe(37);

    host.chips = 5;
    expect(room.chatHistory[0]?.chipsAtSend).toBe(37);
  });

  it('rejects empty / control-char-only / unknown-sender messages', () => {
    const { room, host } = makeRoom();
    expect(room.sendChat(host.id, '   ')?.code).toBe('BAD_REQUEST');
    expect(room.sendChat(host.id, '\u0000\u001f')?.code).toBe('BAD_REQUEST');
    expect(room.sendChat('nobody', 'hi')?.code).toBe('BAD_REQUEST');
    expect(room.chatHistory).toHaveLength(0);
  });

  it('replays pre-chip-snapshot chat history with a null count', () => {
    const { room, host, hostLink } = makeRoom();
    room.applyEvent({
      type: 'chat',
      playerId: host.id,
      playerName: host.name,
      text: 'from an old log',
      ts: 123,
    });

    room.sendChatHistory(host.id);
    expect(hostLink.ofType('chat:message').at(-1)?.chipsAtSend).toBeNull();
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
    expect(replayed[replayed.length - 1]!.chipsAtSend).toBe(0);
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
    const room = manager.create(TEST_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.sendChat(host.id, 'survives restarts')).toBeNull();
    await store.flush();

    const manager2 = new RoomManager(undefined, undefined, new RoomLogStore(dir));
    expect(await recoverRooms(new RoomLogStore(dir), manager2)).toBe(1);
    const room2 = manager2.get(room.id)!;
    expect(room2.chatHistory).toHaveLength(1);
    expect(room2.chatHistory[0]).toMatchObject({
      playerId: host.id,
      chipsAtSend: 0,
      text: 'survives restarts',
    });

    manager.stop();
    manager2.stop();
  });

  it('survives round-end log compaction (chat is part of the snapshot)', async () => {
    const store = new RoomLogStore(dir);
    const manager = new RoomManager(undefined, undefined, store);
    const room = manager.create(TEST_SETTINGS);
    const host = room.addPlayer('Host', new FakeLink(), { host: true });
    expect(room.requestSeat(host.id, 100)).toBeNull();
    const link = new FakeLink();
    const p1 = room.addPlayer('P1', link);
    expect(room.requestSeat(p1.id, 100)).toBeNull();
    expect(room.approveSeat(p1.id)).toBeNull();

    expect(room.sendChat(host.id, 'before the round')).toBeNull();

    // Play a 1-roll round to trigger compaction at round end.
    expect(room.startGame(host.id)).toBeNull();
    const engine = room.engine!;
    expect(roll(engine, host.id, [6, 6, 6, 6, 1])).toBeNull();
    expect(engine.stand(host.id)).toBeNull();
    expect(roll(engine, p1.id, [1, 1, 2, 3, 5])).toBeNull(); // capped at 1 roll → auto-stand
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
