import type { ServerMessage } from '@dice/shared';

export type BetALotPaidReason = Extract<ServerMessage, { type: 'betalot:paid' }>['reason'];

/** Readable bet-type labels for per-viewer payout notifications. */
export const BETALOT_PAYOUT_LABELS: Record<BetALotPaidReason, string> = {
  call: 'Opening call',
  openingOne: 'Opening face one',
  loss: 'Round',
  straight: 'Straight',
  allSame: 'All-same',
  allSameExtra: 'Extra roll',
  fullHouse: 'Full house',
  sevenOpponent: 'Sevens',
  sevenPot: 'Sevens pot',
  overTwentyFive: 'Over 25',
  sevensPotWon: 'Sevens pot claim',
};

/** `{BetType} {win|loss}: payout {amount}` from the local viewer's perspective. */
export function formatBetALotPayoutNotice(
  reason: BetALotPaidReason,
  amount: number,
  fromPlayerId: string,
  toPlayerId: string | null,
  myId: string | null,
): string {
  const label = BETALOT_PAYOUT_LABELS[reason];
  let outcome: 'win' | 'loss';
  if (toPlayerId === null) {
    outcome = fromPlayerId === myId ? 'loss' : 'win';
  } else if (toPlayerId === myId) {
    outcome = 'win';
  } else if (fromPlayerId === myId) {
    outcome = 'loss';
  } else {
    // Spectator: treat money arriving at the named recipient as a win line.
    outcome = 'win';
  }
  return `${label} ${outcome}: payout ${amount}`;
}
