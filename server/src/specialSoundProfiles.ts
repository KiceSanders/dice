import {
  type PlayerId,
  type ServerMessage,
  SPECIAL_MOMENT_DEFINITIONS,
  SPECIAL_SOUND_MAX_BASE64_LENGTH,
  type SpecialMomentKind,
} from '@dice/shared';

type SoundUpdate = Extract<ServerMessage, { type: 'special-sound:updated' }>;

/** Enough room for a complete five-sound pack for all eight seated players. */
export const MAX_ROOM_SPECIAL_SOUND_BASE64_BYTES =
  8 * SPECIAL_MOMENT_DEFINITIONS.length * SPECIAL_SOUND_MAX_BASE64_LENGTH;

/**
 * Ephemeral room cache for device-authored recordings. Audio is deliberately
 * absent from snapshots and persistence logs; reconnecting clients republish
 * their local pack, while late joiners receive the current live-room cache.
 */
export class SpecialSoundProfiles {
  private readonly byPlayer = new Map<PlayerId, Map<SpecialMomentKind, string>>();
  private totalBase64Bytes = 0;

  update(playerId: PlayerId, kind: SpecialMomentKind, wavBase64: string | null): boolean {
    const profile = this.byPlayer.get(playerId);
    const previous = profile?.get(kind);
    const nextTotal = this.totalBase64Bytes - (previous?.length ?? 0) + (wavBase64?.length ?? 0);
    if (nextTotal > MAX_ROOM_SPECIAL_SOUND_BASE64_BYTES) return false;

    if (wavBase64 === null) {
      profile?.delete(kind);
      if (profile?.size === 0) this.byPlayer.delete(playerId);
    } else {
      const target = profile ?? new Map<SpecialMomentKind, string>();
      target.set(kind, wavBase64);
      this.byPlayer.set(playerId, target);
    }
    this.totalBase64Bytes = nextTotal;
    return true;
  }

  /** Drop a disconnected player's live copies and describe the clears for listeners. */
  clearPlayer(playerId: PlayerId): SoundUpdate[] {
    const profile = this.byPlayer.get(playerId);
    if (!profile) return [];

    this.byPlayer.delete(playerId);
    const updates: SoundUpdate[] = [];
    for (const definition of SPECIAL_MOMENT_DEFINITIONS) {
      const wavBase64 = profile.get(definition.kind);
      if (wavBase64 === undefined) continue;
      this.totalBase64Bytes -= wavBase64.length;
      updates.push({
        type: 'special-sound:updated',
        playerId,
        kind: definition.kind,
        wavBase64: null,
      });
    }
    return updates;
  }

  messages(): SoundUpdate[] {
    const messages: SoundUpdate[] = [];
    for (const [playerId, profile] of this.byPlayer) {
      for (const definition of SPECIAL_MOMENT_DEFINITIONS) {
        const wavBase64 = profile.get(definition.kind);
        if (wavBase64 !== undefined) {
          messages.push({
            type: 'special-sound:updated',
            playerId,
            kind: definition.kind,
            wavBase64,
          });
        }
      }
    }
    return messages;
  }
}
