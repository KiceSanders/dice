/** localStorage persistence: rejoin identity keyed by room, plus the display name. */

export interface StoredIdentity {
  playerId: string;
  rejoinToken: string;
  /** Display name when this identity was saved — used to avoid cross-tab identity theft. */
  playerName: string;
}

const NAME_KEY = 'dice:name';
const roomKey = (roomId: string) => `dice:room:${roomId}`;

export function loadIdentity(roomId: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(roomKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
    if (typeof parsed.playerId !== 'string' || typeof parsed.rejoinToken !== 'string') return null;
    return {
      playerId: parsed.playerId,
      rejoinToken: parsed.rejoinToken,
      playerName: typeof parsed.playerName === 'string' ? parsed.playerName : '',
    };
  } catch {
    return null;
  }
}

export function saveIdentity(roomId: string, identity: StoredIdentity): void {
  try {
    localStorage.setItem(roomKey(roomId), JSON.stringify(identity));
  } catch {
    // Storage unavailable (private mode etc.) — rejoin just won't survive a reload.
  }
}

export function clearIdentity(roomId: string): void {
  try {
    localStorage.removeItem(roomKey(roomId));
  } catch {
    /* ignore */
  }
}

export function loadName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
