import type { Connection } from './connection.js';
import type { Room, RoomError } from './room.js';
import type { RoomManager } from './roomManager.js';
import type { HandlerMap } from './router.js';

/**
 * Wires the room lifecycle (Phase 3) into the message router.
 * Game-phase handlers (game:start, turn:*) arrive in Phase 4; chat in Phase 10.
 */
export function createHandlers(rooms: RoomManager): HandlerMap {
  /** Resolve the sender's room + identity, or reply with an error. */
  function ctx(conn: Connection): { room: Room; playerId: string } | null {
    const room = conn.roomId ? rooms.get(conn.roomId) : undefined;
    if (!room || !conn.playerId || !room.players.has(conn.playerId)) {
      conn.sendError('BAD_REQUEST', 'join a room first');
      return null;
    }
    return { room, playerId: conn.playerId };
  }

  function hostCtx(conn: Connection): { room: Room; playerId: string } | null {
    const c = ctx(conn);
    if (!c) return null;
    if (c.playerId !== c.room.hostId) {
      conn.sendError('NOT_HOST', 'only the host can do that');
      return null;
    }
    return c;
  }

  /** Forward a room-layer error to the client. Returns true if there was one. */
  function failed(conn: Connection, error: RoomError | null): boolean {
    if (error) conn.sendError(error.code, error.message);
    return error !== null;
  }

  /**
   * dice:frames budget: a healthy roller sends ~10 msgs/s (20 Hz poses,
   * batched); anything past this is dropped without relaying.
   */
  const FRAME_MSGS_PER_SECOND = 40;
  const frameBudgets = new WeakMap<Connection, { windowStart: number; count: number }>();

  function withinFrameBudget(conn: Connection): boolean {
    const now = Date.now();
    const budget = frameBudgets.get(conn);
    if (!budget || now - budget.windowStart >= 1_000) {
      frameBudgets.set(conn, { windowStart: now, count: 1 });
      return true;
    }
    budget.count += 1;
    return budget.count <= FRAME_MSGS_PER_SECOND;
  }

  return {
    'room:create': (conn, msg) => {
      if (conn.roomId) {
        conn.sendError('BAD_REQUEST', 'already in a room');
        return;
      }
      const room = rooms.create(msg.settings);
      const host = room.addPlayer(msg.playerName, conn, { host: true });
      conn.roomId = room.id;
      conn.playerId = host.id;
      conn.send({
        type: 'room:created',
        roomId: room.id,
        playerId: host.id,
        rejoinToken: host.rejoinToken,
      });
      room.broadcastState();
    },

    'room:join': (conn, msg) => {
      if (conn.roomId) {
        conn.sendError('BAD_REQUEST', 'already in a room');
        return;
      }
      const room = rooms.get(msg.roomId);
      if (!room) {
        conn.sendError('ROOM_NOT_FOUND', `no room ${msg.roomId}`);
        return;
      }

      const player =
        (msg.rejoinToken ? room.rejoin(msg.rejoinToken, conn) : null) ??
        room.addPlayer(msg.playerName, conn);

      conn.roomId = room.id;
      conn.playerId = player.id;
      conn.send({
        type: 'room:joined',
        playerId: player.id,
        rejoinToken: player.rejoinToken,
        snapshot: room.buildSnapshot(player.id),
      });
      room.sendChatHistory(player.id); // restart/rejoin survivors see prior chat
      room.broadcastState();
    },

    'seat:request': (conn, msg) => {
      const c = ctx(conn);
      if (!c) return;
      if (!failed(conn, c.room.requestSeat(c.playerId, msg.buyIn))) c.room.broadcastState();
    },

    'seat:approve': (conn, msg) => {
      const c = hostCtx(conn);
      if (!c) return;
      if (!failed(conn, c.room.approveSeat(msg.playerId))) c.room.broadcastState();
    },

    'seat:deny': (conn, msg) => {
      const c = hostCtx(conn);
      if (!c) return;
      if (!failed(conn, c.room.denySeat(msg.playerId))) c.room.broadcastState();
    },

    'player:kick': (conn, msg) => {
      const c = hostCtx(conn);
      if (!c) return;
      if (!failed(conn, c.room.kick(msg.playerId))) c.room.broadcastState();
    },

    'settings:update': (conn, msg) => {
      const c = hostCtx(conn);
      if (!c) return;
      if (!failed(conn, c.room.updateSettings(msg.settings))) c.room.broadcastState();
    },

    'game:start': (conn) => {
      const c = ctx(conn);
      if (!c) return;
      failed(conn, c.room.startGame(c.playerId));
      // Engine events handle the broadcasts.
    },

    'turn:throwStart': (conn, msg) => {
      const c = ctx(conn);
      if (!c) return;
      if (!c.room.engine) {
        conn.sendError('BAD_REQUEST', 'no game in progress');
        return;
      }
      const error = c.room.engine.beginThrow(c.playerId, msg.keepIndices);
      if (error) conn.sendError(error.code, error.message);
    },

    'turn:throwResult': (conn, msg) => {
      const c = ctx(conn);
      if (!c) return;
      if (!c.room.engine) {
        conn.sendError('BAD_REQUEST', 'no game in progress');
        return;
      }
      const error = c.room.engine.commitThrow(c.playerId, msg.dice);
      if (error) conn.sendError(error.code, error.message);
    },

    'dice:frames': (conn, msg) => {
      // Ephemeral pose relay (ADR 004). Invalid senders are dropped silently:
      // frames straddle turn boundaries, and erroring at stream rate would flood.
      const room = conn.roomId ? rooms.get(conn.roomId) : undefined;
      if (!room || !conn.playerId || !room.engine) return;
      if (room.engine.currentTurnPlayerId !== conn.playerId) return;
      if (!withinFrameBudget(conn)) return;
      room.broadcastExcept(conn.playerId, {
        type: 'dice:frames',
        playerId: conn.playerId,
        frames: msg.frames,
      });
    },

    'turn:stand': (conn) => {
      const c = ctx(conn);
      if (!c) return;
      if (!c.room.engine) {
        conn.sendError('BAD_REQUEST', 'no game in progress');
        return;
      }
      const error = c.room.engine.standVoluntarily(c.playerId);
      if (error) conn.sendError(error.code, error.message);
    },

    'chat:send': (conn, msg) => {
      const c = ctx(conn);
      if (!c) return;
      failed(conn, c.room.sendChat(c.playerId, msg.text));
      // sendChat broadcasts chat:message itself; no snapshot change.
    },
  };
}

/** Socket-close hook: detach the player from their room and broadcast. */
export function handleDisconnect(rooms: RoomManager, conn: Connection): void {
  const room = conn.roomId ? rooms.get(conn.roomId) : undefined;
  if (!room || !conn.playerId) return;
  room.handleDisconnect(conn.playerId);
  room.broadcastState();
}
