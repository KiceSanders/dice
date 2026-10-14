import { isBetALotState, type RoomSnapshot } from '@dice/shared';

/** Present the nested bonus through the existing roller, spectator and static table views. */
export function blackjackTableSnapshot(snapshot: RoomSnapshot): RoomSnapshot | null {
  if (snapshot.settings.kind === 'blackjack') return snapshot;
  const game = isBetALotState(snapshot.game) ? snapshot.game.blackjack : null;
  if (!game) return null;
  return {
    ...snapshot,
    settings: { ...snapshot.settings, kind: 'blackjack' },
    phase: game.result ? 'roundEnd' : 'playing',
    game,
  };
}
