import type { ServerMessage } from '@dice/shared';

export type ParseServerResult = { ok: true; message: ServerMessage } | { ok: false; error: string };

const bad = (error: string): ParseServerResult => ({ ok: false, error });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

type Validator = (m: Record<string, unknown>) => string | null;

const validators: Record<ServerMessage['type'], Validator> = {
  'room:created': (m) =>
    isNonEmptyString(m.roomId) && isNonEmptyString(m.playerId) && isNonEmptyString(m.rejoinToken)
      ? null
      : 'room:created missing roomId/playerId/rejoinToken',
  'room:joined': (m) =>
    isNonEmptyString(m.playerId) && isNonEmptyString(m.rejoinToken) && isRecord(m.snapshot)
      ? null
      : 'room:joined missing playerId/rejoinToken/snapshot',
  'room:state': (m) => (isRecord(m.snapshot) ? null : 'room:state missing snapshot'),
  'seat:requested': (m) =>
    isNonEmptyString(m.playerId) && isNonEmptyString(m.playerName) && isFiniteNumber(m.buyIn)
      ? null
      : 'seat:requested missing fields',
  'seat:denied': () => null,
  'turn:rolled': (m) =>
    isNonEmptyString(m.playerId) &&
    Array.isArray(m.dice) &&
    isFiniteNumber(m.rollNumber) &&
    Array.isArray(m.kept) &&
    (m.restPose === null || Array.isArray(m.restPose))
      ? null
      : 'turn:rolled missing fields',
  'turn:throwStarted': (m) =>
    isNonEmptyString(m.playerId) && Array.isArray(m.kept) && isFiniteNumber(m.rollNumber)
      ? null
      : 'turn:throwStarted missing fields',
  'dice:frames': (m) =>
    isNonEmptyString(m.playerId) && Array.isArray(m.frames) ? null : 'dice:frames missing fields',
  'turn:forfeited': (m) =>
    isNonEmptyString(m.playerId) ? null : 'turn:forfeited missing playerId',
  'round:started': (m) =>
    isFiniteNumber(m.roundNumber) && Array.isArray(m.antes) ? null : 'round:started missing fields',
  'round:ended': (m) =>
    isFiniteNumber(m.potWon) && Array.isArray(m.scores) ? null : 'round:ended missing fields',
  'subround:started': (m) =>
    Array.isArray(m.tiedPlayerIds) &&
    isFiniteNumber(m.anteAmount) &&
    isFiniteNumber(m.depth) &&
    Array.isArray(m.antes)
      ? null
      : 'subround:started missing fields',
  'straight:paid': (m) =>
    isNonEmptyString(m.playerId) &&
    isNonEmptyString(m.kind) &&
    isFiniteNumber(m.amountPerPlayer) &&
    isFiniteNumber(m.total) &&
    Array.isArray(m.payments)
      ? null
      : 'straight:paid missing fields',
  'classic:donated': (m) =>
    isNonEmptyString(m.playerId) && isFiniteNumber(m.amount) && isFiniteNumber(m.classicPot)
      ? null
      : 'classic:donated missing fields',
  'classic:won': (m) =>
    isNonEmptyString(m.playerId) && isFiniteNumber(m.amount) ? null : 'classic:won missing fields',
  'chat:message': (m) =>
    isNonEmptyString(m.playerId) &&
    isNonEmptyString(m.playerName) &&
    typeof m.text === 'string' &&
    isFiniteNumber(m.ts)
      ? null
      : 'chat:message missing fields',
  error: (m) =>
    isNonEmptyString(m.code) && isNonEmptyString(m.message) ? null : 'error missing fields',
};

/**
 * Parse and lightly validate a raw server frame. Never throws: malformed JSON,
 * unknown types, and missing required fields return a structured error so the
 * client can drop the message instead of corrupting app state.
 */
export function parseServerMessage(raw: string): ParseServerResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad('invalid JSON');
  }

  if (!isRecord(data)) return bad('message must be a JSON object');
  if (typeof data.type !== 'string') return bad('missing message type');

  const validate = validators[data.type as ServerMessage['type']];
  if (!validate) return bad(`unknown message type: ${data.type}`);

  const error = validate(data);
  if (error) return bad(error);

  return { ok: true, message: data as unknown as ServerMessage };
}
