import type { ServerMessage } from '@dice/shared';
import { getWsClient } from '../ws/singleton';

/** Local-only test links use per-tab identities, leaving normal saved players alone. */
export function prepareVisualTest(): void {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
  const raw = new URLSearchParams(location.hash.slice(1)).get('visualTest');
  if (!raw) return;
  const data = JSON.parse(raw) as {
    roomId: string;
    playerId: string;
    rejoinToken: string;
    playerName: string;
    rolls: number[][];
    kind?: 'betalot' | 'blackjack';
  };
  if (
    location.pathname !== `/room/${data.roomId}` ||
    ![data.roomId, data.playerId, data.rejoinToken, data.playerName].every(
      (value) => typeof value === 'string' && value.length > 0,
    ) ||
    !Array.isArray(data.rolls) ||
    (data.kind !== undefined && data.kind !== 'betalot' && data.kind !== 'blackjack') ||
    !data.rolls.every(
      (dice) =>
        Array.isArray(dice) &&
        dice.length >= 1 &&
        dice.length <= 6 &&
        (data.kind !== 'blackjack' || dice.length === 1) &&
        dice.every(
          (face) =>
            Number.isInteger(face) && face >= 1 && face <= (data.kind === 'blackjack' ? 12 : 6),
        ),
    )
  ) {
    throw new Error('Invalid local visual-test link');
  }
  sessionStorage.setItem('dice:visual-test:path', location.pathname);
  sessionStorage.setItem('dice:name', data.playerName);
  sessionStorage.setItem(`dice:room:${data.roomId}`, JSON.stringify(data));
  const progressKey = `dice:visual-test:roll:${data.roomId}:${data.playerId}`;
  let completed = Number(sessionStorage.getItem(progressKey) ?? 0);
  const apply = () => {
    const faces = data.rolls[completed];
    if (faces) window.__forceSettleFaces = faces;
    else delete window.__forceSettleFaces;
  };
  apply();
  const off = getWsClient().onMessage((message: ServerMessage) => {
    if (
      (message.type === 'betalot:rolled' ||
        message.type === 'betalot:extraRolled' ||
        message.type === 'blackjack:rolled') &&
      message.playerId === data.playerId
    ) {
      completed += 1;
      sessionStorage.setItem(progressKey, String(completed));
      apply();
    }
  });
  window.addEventListener('pagehide', off, { once: true });
}
