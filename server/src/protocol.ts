import type {
  ClassicPotConfig,
  ClientMessage,
  RoomSettings,
  StraightPayoutConfig,
} from '@dice/shared';

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

const bad = (error: string): ParseResult => ({ ok: false, error });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isNonEmptyString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isStraightPayoutConfig(v: unknown): v is StraightPayoutConfig {
  return isRecord(v) && typeof v.enabled === 'boolean' && isFiniteNumber(v.amountPerPlayer);
}

function isClassicPotConfig(v: unknown): v is ClassicPotConfig {
  return isRecord(v) && typeof v.enabled === 'boolean' && isFiniteNumber(v.donationAmount);
}

/** Structural check only; range clamping happens in the room layer (Phase 3.2). */
function isRoomSettings(v: unknown): v is RoomSettings {
  return (
    isRecord(v) &&
    isFiniteNumber(v.chipsPerRound) &&
    isFiniteNumber(v.maxRolls) &&
    isFiniteNumber(v.maxPlayers) &&
    isFiniteNumber(v.minBuyIn) &&
    isFiniteNumber(v.maxBuyIn) &&
    isStraightPayoutConfig(v.straightPayout) &&
    isClassicPotConfig(v.classicPot)
  );
}

/** Die-keep indices: ≤5 unique integers in [0, 4]. */
function isIndexArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length <= 5 &&
    v.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) <= 4) &&
    new Set(v).size === v.length
  );
}

/** Reported physics faces: exactly 5 integers in [1, 6]. */
function isDiceArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === 5 &&
    v.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 6)
  );
}

const MAX_FRAMES_PER_MESSAGE = 10;
/** Koozie + 5 dice today; small headroom so a new prop isn't a protocol break. */
const MAX_BODIES_PER_FRAME = 8;

/** [x, y, z, qx, qy, qz, qw] */
function isBodyPose(v: unknown): boolean {
  return Array.isArray(v) && v.length === 7 && v.every(isFiniteNumber);
}

function isPoseFrame(v: unknown): boolean {
  return (
    isRecord(v) &&
    isFiniteNumber(v.t) &&
    Array.isArray(v.bodies) &&
    v.bodies.length <= MAX_BODIES_PER_FRAME &&
    v.bodies.every(isBodyPose)
  );
}

type Validator = (m: Record<string, unknown>) => string | null;

/** Per-type payload validators. Return an error string or null if valid. */
const validators: Record<ClientMessage['type'], Validator> = {
  'room:create': (m) => {
    if (!isNonEmptyString(m.playerName, 24)) return 'playerName must be a 1-24 char string';
    if (!isRoomSettings(m.settings)) return 'settings is missing or malformed';
    return null;
  },
  'room:join': (m) => {
    if (!isNonEmptyString(m.roomId, 12)) return 'roomId must be a non-empty string';
    if (!isNonEmptyString(m.playerName, 24)) return 'playerName must be a 1-24 char string';
    if (m.rejoinToken !== undefined && !isNonEmptyString(m.rejoinToken, 128)) {
      return 'rejoinToken must be a non-empty string when present';
    }
    return null;
  },
  'seat:request': (m) =>
    Number.isInteger(m.buyIn) && (m.buyIn as number) > 0
      ? null
      : 'buyIn must be a positive integer',
  'seat:approve': (m) =>
    isNonEmptyString(m.playerId, 64) ? null : 'playerId must be a non-empty string',
  'seat:deny': (m) =>
    isNonEmptyString(m.playerId, 64) ? null : 'playerId must be a non-empty string',
  'player:kick': (m) =>
    isNonEmptyString(m.playerId, 64) ? null : 'playerId must be a non-empty string',
  'settings:update': (m) =>
    isRoomSettings(m.settings) ? null : 'settings is missing or malformed',
  'game:start': () => null,
  'turn:throwStart': (m) =>
    isIndexArray(m.keepIndices)
      ? null
      : 'keepIndices must be an array of ≤5 unique integers in [0, 4]',
  'turn:throwResult': (m) => {
    if (!isDiceArray(m.dice)) return 'dice must be exactly 5 integers in [1, 6]';
    // Shape only — semantic checks (bounds, faces) are the engine's soft gate
    // (ADR 005). A malformed array is a client bug, so hard-reject it.
    if (m.restPose !== undefined) {
      if (!Array.isArray(m.restPose) || m.restPose.length !== 5 || !m.restPose.every(isBodyPose)) {
        return 'restPose must be exactly 5 body poses when present';
      }
    }
    return null;
  },
  'dice:frames': (m) =>
    Array.isArray(m.frames) &&
    m.frames.length >= 1 &&
    m.frames.length <= MAX_FRAMES_PER_MESSAGE &&
    m.frames.every(isPoseFrame)
      ? null
      : `frames must be 1-${MAX_FRAMES_PER_MESSAGE} pose frames`,
  'turn:stand': (m) => {
    if (m.restPose !== undefined) {
      if (!Array.isArray(m.restPose) || m.restPose.length !== 5 || !m.restPose.every(isBodyPose)) {
        return 'restPose must be exactly 5 body poses when present';
      }
    }
    return null;
  },
  'chat:send': (m) => (isNonEmptyString(m.text, 500) ? null : 'text must be a 1-500 char string'),
};

/**
 * Parse and validate a raw client frame. Never throws: malformed JSON,
 * unknown types, and missing fields all return a structured error.
 */
export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return bad('invalid JSON');
  }

  if (!isRecord(data)) return bad('message must be a JSON object');
  if (typeof data.type !== 'string') return bad('missing message type');

  const validate = validators[data.type as ClientMessage['type']];
  if (!validate) return bad(`unknown message type: ${data.type}`);

  const error = validate(data);
  if (error) return bad(`${data.type}: ${error}`);

  return { ok: true, message: data as unknown as ClientMessage };
}
