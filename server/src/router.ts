import type { ClientMessage } from '@dice/shared';
import type { Connection } from './connection.js';
import { parseClientMessage } from './protocol.js';

export type Handler<T extends ClientMessage['type'] = ClientMessage['type']> = (
  conn: Connection,
  msg: Extract<ClientMessage, { type: T }>,
) => void;

export type HandlerMap = { [T in ClientMessage['type']]?: Handler<T> };

/**
 * Dispatches validated client messages to per-type handlers.
 * Handler errors are caught and reported to the offending client only —
 * the process must never crash from a message handler.
 */
export class Router {
  constructor(private readonly handlers: HandlerMap) {}

  dispatch(conn: Connection, raw: string): void {
    const result = parseClientMessage(raw);
    if (!result.ok) {
      conn.sendError('BAD_REQUEST', result.error);
      return;
    }

    const handler = this.handlers[result.message.type] as Handler | undefined;
    if (!handler) {
      conn.sendError('BAD_REQUEST', `no handler for ${result.message.type}`);
      return;
    }

    try {
      handler(conn, result.message);
    } catch (err) {
      console.error(`[router] handler error for ${result.message.type}:`, err);
      conn.sendError('INTERNAL', 'internal server error');
    }
  }
}
