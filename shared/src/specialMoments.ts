import type { RoomSettings } from './types.js';

/**
 * Player-authored sound slots for exceptional game moments. This registry is
 * the client UI's single source of truth: adding a definition automatically
 * adds its recorder everywhere SpecialSoundSettings is rendered.
 */
export const SPECIAL_MOMENT_DEFINITIONS = [
  {
    kind: 'straight',
    label: 'Straight',
    description: 'The first straight you roll during a turn.',
    setting: 'straightPayout',
  },
  {
    kind: 'classic',
    label: 'Classic',
    description: 'First-roll three 6s while no roll to beat is set.',
    setting: 'classicPot',
  },
  {
    kind: 'first-roll-yahtzee',
    label: 'First-roll Yahtzee',
    description: 'A Yahtzee completed on the first roll of a turn.',
    setting: 'firstRollYahtzeePayout',
  },
  {
    kind: 'yahtzee-bonus',
    label: 'Yahtzee bonus match',
    description: 'The sixth bonus die matches the Yahtzee face.',
    setting: 'yahtzeeBonus',
  },
  {
    kind: 'overtime-win',
    label: 'Overtime win',
    description: 'You win a round that entered a tie-breaker.',
    setting: null,
  },
] as const satisfies readonly {
  kind: string;
  label: string;
  description: string;
  setting: keyof RoomSettings | null;
}[];

export type SpecialMomentKind = (typeof SPECIAL_MOMENT_DEFINITIONS)[number]['kind'];

const SPECIAL_MOMENT_KINDS = new Set<string>(
  SPECIAL_MOMENT_DEFINITIONS.map((definition) => definition.kind),
);

export function isSpecialMomentKind(value: unknown): value is SpecialMomentKind {
  return typeof value === 'string' && SPECIAL_MOMENT_KINDS.has(value);
}

/** Resolve the optional room-setting toggle declared by the shared registry. */
export function isSpecialMomentEnabled(settings: RoomSettings, kind: SpecialMomentKind): boolean {
  const definition = SPECIAL_MOMENT_DEFINITIONS.find((entry) => entry.kind === kind);
  if (!definition || definition.setting === null) return definition !== undefined;
  const value = settings[definition.setting];
  return (
    typeof value === 'object' && value !== null && 'enabled' in value && value.enabled === true
  );
}

/** Recording/wire limits: three seconds of mono 22.05 kHz, 16-bit PCM WAV. */
export const SPECIAL_SOUND_MAX_DURATION_MS = 3_000;
export const SPECIAL_SOUND_SAMPLE_RATE = 22_050;
export const SPECIAL_SOUND_WAV_HEADER_BYTES = 44;
export const SPECIAL_SOUND_MAX_BYTES =
  SPECIAL_SOUND_WAV_HEADER_BYTES +
  Math.ceil((SPECIAL_SOUND_SAMPLE_RATE * SPECIAL_SOUND_MAX_DURATION_MS) / 1_000) * 2;
export const SPECIAL_SOUND_MAX_BASE64_LENGTH = Math.ceil(SPECIAL_SOUND_MAX_BYTES / 3) * 4;

/** Strictly validate the canonical PCM WAV shape accepted on the room wire. */
export function isValidSpecialSoundWav(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength <= SPECIAL_SOUND_WAV_HEADER_BYTES ||
    bytes.byteLength > SPECIAL_SOUND_MAX_BYTES
  ) {
    return false;
  }
  const ascii = (at: number, length: number) =>
    String.fromCharCode(...bytes.subarray(at, at + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return false;
  if (ascii(12, 4) !== 'fmt ' || ascii(36, 4) !== 'data') return false;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataBytes = view.getUint32(40, true);
  return (
    view.getUint32(4, true) === bytes.byteLength - 8 &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === SPECIAL_SOUND_SAMPLE_RATE &&
    view.getUint32(28, true) === SPECIAL_SOUND_SAMPLE_RATE * 2 &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    dataBytes === bytes.byteLength - SPECIAL_SOUND_WAV_HEADER_BYTES &&
    dataBytes % 2 === 0
  );
}
