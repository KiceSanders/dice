import { mkdirSync } from 'node:fs';
import { appendFile, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Die, RoomId, RoomSettings } from '@dice/shared';
import { cryptoRng } from './engine.js';
import type { PersistedRoomState, RoomEvent } from './events.js';
import { Room } from './room.js';
import type { RoomManager } from './roomManager.js';

/**
 * Append-only JSON Lines event log per room (PLAN.md Phase 6). Writes are
 * funneled through an in-order promise queue per room so lines never
 * interleave; `compact` and `remove` ride the same queue.
 */
export class RoomLogStore {
  private readonly queues = new Map<RoomId, Promise<void>>();

  constructor(readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(roomId: RoomId): string {
    return path.join(this.dir, `${roomId}.log`);
  }

  private enqueue(roomId: RoomId, task: () => Promise<void>): void {
    const prev = this.queues.get(roomId) ?? Promise.resolve();
    const next = prev.then(task).catch((error) => {
      console.error(`[persistence] write failed for room ${roomId}:`, error);
    });
    this.queues.set(roomId, next);
  }

  append(roomId: RoomId, event: RoomEvent): void {
    this.enqueue(roomId, () =>
      appendFile(this.file(roomId), `${JSON.stringify(event)}\n`, 'utf8'),
    );
  }

  /** Rewrite the log as a single snapshot event (round-end compaction, 6.3). */
  compact(roomId: RoomId, state: PersistedRoomState): void {
    const line = `${JSON.stringify({ type: 'snapshot', state } satisfies RoomEvent)}\n`;
    this.enqueue(roomId, () => writeFile(this.file(roomId), line, 'utf8'));
  }

  /** Delete the log (room destroyed, 6.3). */
  remove(roomId: RoomId): void {
    this.enqueue(roomId, () => rm(this.file(roomId), { force: true }));
  }

  /** Wait for all queued writes to land (tests / graceful shutdown). */
  async flush(): Promise<void> {
    await Promise.all(this.queues.values());
  }

  /** Read every room log on disk. Unparseable lines (torn tail writes) are skipped. */
  async scan(): Promise<Map<RoomId, RoomEvent[]>> {
    const logs = new Map<RoomId, RoomEvent[]>();
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith('.log')) continue;
      const roomId = name.slice(0, -'.log'.length);
      const raw = await readFile(path.join(this.dir, name), 'utf8');
      const events: RoomEvent[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as RoomEvent);
        } catch {
          // Torn line from a crash mid-write; drop it.
        }
      }
      if (events.length > 0) logs.set(roomId, events);
    }
    return logs;
  }
}

/**
 * Rng that replays logged dice values, falling back to crypto randomness once
 * replay completes (so a recovered engine keeps working after resume).
 */
class ReplayRng {
  private readonly queue: Die[] = [];
  strict = true;

  prime(dice: Die[]): void {
    this.queue.push(...dice);
  }

  readonly rng = (): number => {
    const face = this.queue.shift();
    if (face !== undefined) return (face - 1) / 6;
    if (this.strict) throw new Error('replay rng exhausted: log/state desync');
    return cryptoRng();
  };
}

/**
 * Rebuild a room by replaying its event log through the same reducers the
 * live path uses. Returns null if the log is unusable. The recovered room
 * comes back paused with every player marked disconnected (6.2); play resumes
 * when someone rejoins with their rejoinToken.
 */
export function replayRoom(roomId: RoomId, events: RoomEvent[]): Room | null {
  const first = events[0];
  if (!first || (first.type !== 'created' && first.type !== 'snapshot')) return null;
  const settings: RoomSettings =
    first.type === 'created' ? first.settings : first.state.settings;

  const rng = new ReplayRng();
  const room = new Room(roomId, settings, undefined, { rng: rng.rng });

  try {
    for (const event of events) applyReplayEvent(room, rng, event);
  } catch (error) {
    // Best effort: keep the room at the last successfully applied event.
    console.error(`[persistence] replay of room ${roomId} stopped early:`, error);
  }

  rng.strict = false;
  room.engineOpts = {}; // future games (after recovery) roll with crypto rng
  for (const player of room.players.values()) player.connected = false;
  room.engine?.pause();
  room.emptySince = Date.now();
  return room;
}

function applyReplayEvent(room: Room, rng: ReplayRng, event: RoomEvent): void {
  switch (event.type) {
    case 'created':
      break; // consumed by replayRoom

    case 'rolled': {
      const engine = requireEngine(room, event.type);
      if (event.rollNumber === 1) {
        rng.prime(event.dice);
      } else {
        // The engine re-draws the non-kept positions in index order.
        const kept = new Set(event.kept);
        rng.prime(event.dice.filter((_, i) => !kept.has(i)));
      }
      const error = engine.roll(event.playerId, event.kept);
      if (error) throw new Error(`replay roll rejected: ${error.message}`);
      break;
    }

    case 'stood': {
      const engine = requireEngine(room, event.type);
      // Skip if the roll replay already auto-stood (cap reached / all dice kept).
      if (engine.currentTurnPlayerId !== event.playerId) break;
      const error = engine.stand(event.playerId);
      if (error) throw new Error(`replay stand rejected: ${error.message}`);
      break;
    }

    case 'roundStarted': {
      const engine = requireEngine(room, event.type);
      if (engine.roundNumber >= event.roundNumber) break;
      engine.advanceRound();
      break;
    }

    case 'gameEnded':
      room.endGame();
      break;

    // Audit-only: outcomes are recomputed deterministically from rolls/stands.
    case 'subRoundStarted':
    case 'bonusAwarded':
    case 'roundEnded':
      break;

    default:
      room.applyEvent(event);
  }
}

function requireEngine(room: Room, eventType: string) {
  if (!room.engine) throw new Error(`replay event '${eventType}' with no engine`);
  return room.engine;
}

/** Boot-time recovery (6.2): rebuild every room found in the log directory. */
export async function recoverRooms(store: RoomLogStore, manager: RoomManager): Promise<number> {
  const logs = await store.scan();
  let recovered = 0;
  for (const [roomId, events] of logs) {
    const room = replayRoom(roomId, events);
    if (room) {
      manager.adopt(room);
      recovered += 1;
    } else {
      store.remove(roomId);
    }
  }
  return recovered;
}
