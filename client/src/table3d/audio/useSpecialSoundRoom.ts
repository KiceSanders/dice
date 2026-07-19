import type { ClientMessage, SpecialMomentKind } from '@dice/shared';
import { useEffect, useRef } from 'react';
import type { WsClient } from '../../ws/client';
import { tableEvents } from '../tableEvents';
import { audioEngine } from './audioEngine';
import {
  completeSpecialSoundPack,
  type SpecialSoundPack,
  useSpecialSoundPack,
} from './specialSoundStorage';
import { base64ToSpecialSoundBytes } from './specialSoundWav';

export function specialSoundKey(playerId: string, kind: SpecialMomentKind): string {
  return `${playerId}:${kind}`;
}

/**
 * Bridge device-local recordings to an ephemeral live-room profile and fold
 * authoritative hit messages onto the table event bus.
 */
export function useSpecialSoundRoom(
  ws: WsClient,
  roomId: string,
  playerId: string | null,
  connected: boolean,
  send: (message: ClientMessage) => boolean,
): void {
  const pack = useSpecialSoundPack();
  const publishedRef = useRef<{ session: string; pack: SpecialSoundPack } | null>(null);

  useEffect(() => {
    audioEngine.clearCustomSounds();
    const off = ws.onMessage((message) => {
      if (message.type === 'special-sound:updated') {
        const key = specialSoundKey(message.playerId, message.kind);
        if (message.wavBase64 === null) {
          audioEngine.unregisterCustomSound(key);
          return;
        }
        const bytes = base64ToSpecialSoundBytes(message.wavBase64);
        if (bytes) audioEngine.registerCustomSound(key, bytes);
        else audioEngine.unregisterCustomSound(key);
        return;
      }
      if (message.type === 'special-moment:hit') {
        tableEvents.emit(
          {
            type: 'special-moment',
            playerId: message.playerId,
            kind: message.kind,
          },
          Date.now(),
        );
      }
    });
    return () => {
      off();
      audioEngine.clearCustomSounds();
    };
  }, [roomId, ws]);

  useEffect(() => {
    // A reconnect only replays the server's currently live cache. Purge anything
    // this tab learned before the gap so absent/disconnected profiles cannot linger.
    if (!connected) audioEngine.clearCustomSounds();
  }, [connected]);

  useEffect(() => {
    const session = `${roomId}:${playerId ?? ''}`;
    if (!connected || !playerId) {
      publishedRef.current = null;
      return;
    }
    const previous = publishedRef.current?.session === session ? publishedRef.current.pack : null;
    const updates = completeSpecialSoundPack(pack).filter(
      ([kind, wavBase64]) => previous === null || (previous[kind] ?? null) !== wavBase64,
    );
    if (updates.length === 0) return;
    const sent = updates.every(([kind, wavBase64]) =>
      send({ type: 'special-sound:update', kind, wavBase64 }),
    );
    if (sent) publishedRef.current = { session, pack };
  }, [connected, pack, playerId, roomId, send]);
}
