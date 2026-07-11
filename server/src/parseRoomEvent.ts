import type { RoomEvent } from './events.js';

export type ParseRoomEventResult = { ok: true; event: RoomEvent } | { ok: false; error: string };

const bad = (error: string): ParseRoomEventResult => ({ ok: false, error });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const knownTypes: Record<RoomEvent['type'], true> = {
  created: true,
  snapshot: true,
  playerJoined: true,
  seated: true,
  seatForfeited: true,
  kicked: true,
  settingsUpdated: true,
  hostChanged: true,
  gameStarted: true,
  roundStarted: true,
  rolled: true,
  stood: true,
  forfeited: true,
  gameEnded: true,
  subRoundStarted: true,
  straightPaid: true,
  classicDonated: true,
  classicWon: true,
  roundEnded: true,
  chat: true,
};

/**
 * Structural check for a persistence log line. Mirrors client/server ingress
 * style: unknown types and non-objects fail closed so corrupt logs cannot
 * crash replay with opaque TypeErrors.
 */
export function parseRoomEvent(data: unknown): ParseRoomEventResult {
  if (!isRecord(data)) return bad('event must be a JSON object');
  if (typeof data.type !== 'string') return bad('missing event type');
  if (knownTypes[data.type as RoomEvent['type']] !== true) {
    return bad(`unknown event type: ${data.type}`);
  }
  return { ok: true, event: data as unknown as RoomEvent };
}

export function parseRoomEventLine(raw: string): ParseRoomEventResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad('invalid JSON');
  }
  return parseRoomEvent(data);
}
