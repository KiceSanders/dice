import { randomInt } from 'node:crypto';
import type { ActiveRoomSummary, RoomId, RoomSettings } from '@dice/shared';
import type { RoomLogStore } from './persistence.js';
import { Room } from './room.js';

/** Unambiguous alphanumerics: no 0/O, 1/l/I. */
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_LENGTH = 6;

export const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const REAPER_INTERVAL_MS = 60 * 1000;

export class RoomManager {
  private readonly rooms = new Map<RoomId, Room>();
  private reaper: NodeJS.Timeout | null = null;

  constructor(
    private readonly emptyTtlMs = EMPTY_ROOM_TTL_MS,
    private readonly onDestroy: (room: Room) => void = () => {},
    private readonly store: RoomLogStore | null = null,
  ) {}

  create(settings: RoomSettings): Room {
    const room = new Room(this.generateId(), settings);
    this.register(room);
    this.store?.append(room.id, { type: 'created', roomId: room.id, settings: room.settings });
    return room;
  }

  /** Register a room recovered from its event log (persistence Phase 6). */
  adopt(room: Room): void {
    this.register(room);
  }

  private register(room: Room): void {
    this.rooms.set(room.id, room);
    const store = this.store;
    if (store) {
      room.recorder = {
        append: (event) => store.append(room.id, event),
        compact: (state) => store.compact(room.id, state),
      };
    }
  }

  get(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  /** Public directory entries for rooms that have at least one live connection. */
  listActiveRooms(): ActiveRoomSummary[] {
    const active: ActiveRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.connectedCount() === 0) continue;
      active.push({
        roomId: room.id,
        phase: room.phase,
        roundNumber: room.engine?.roundNumber ?? null,
        playerNames: [...room.players.values()]
          .filter((player) => player.connected)
          .map((player) => player.name),
      });
    }
    return active;
  }

  destroy(roomId: RoomId): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.destroy();
    this.rooms.delete(roomId);
    this.store?.remove(roomId);
    this.onDestroy(room);
  }

  get size(): number {
    return this.rooms.size;
  }

  startReaper(intervalMs = REAPER_INTERVAL_MS): void {
    this.reaper = setInterval(() => this.reapEmptyRooms(), intervalMs);
    this.reaper.unref();
  }

  reapEmptyRooms(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && now - room.emptySince >= this.emptyTtlMs) {
        this.destroy(room.id);
      }
    }
  }

  /** Shutdown: stop timers without deleting logs so rooms survive a restart. */
  stop(): void {
    if (this.reaper) clearInterval(this.reaper);
    for (const room of this.rooms.values()) room.destroy();
    this.rooms.clear();
  }

  private generateId(): RoomId {
    for (;;) {
      let id = '';
      for (let i = 0; i < ID_LENGTH; i++) {
        id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
      }
      if (!this.rooms.has(id)) return id;
    }
  }
}
