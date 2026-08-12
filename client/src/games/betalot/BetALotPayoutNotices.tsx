import { useEffect, useRef } from 'react';
import { useApp } from '../../state/context';
import { tableEvents } from '../../table3d/tableEvents';
import { formatBetALotPayoutNotice } from './payoutLabels';

export const BETALOT_PAYOUT_NOTICE_GAP_MS = 1_000;

/**
 * Plays Bet-a-lot payouts one at a time: top-center notice + chip flight, with
 * a fixed gap so stacked side bets and the round loss read sequentially.
 */
export default function BetALotPayoutNotices({ myId }: { myId: string | null }) {
  const { state, dispatch } = useApp();
  const queue = state.betALotPayoutQueue;
  const active = queue[0] ?? null;
  const playingId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      playingId.current = null;
      return;
    }
    if (playingId.current !== active.id) {
      playingId.current = active.id;
      // The wire events arrive together, but this component intentionally
      // presents them one per second. Chip animation clocks must start when the
      // queued item becomes active, not at its now-stale receive timestamp.
      const presentationStartedAt = Date.now();

      if (active.reason === 'sevenPot' && active.toPlayerId === null) {
        tableEvents.emit(
          {
            type: 'chips-to-pot',
            contributions: [{ playerId: active.fromPlayerId, amount: active.amount }],
            potBefore: Math.max(0, active.sevensPot - active.amount),
          },
          presentationStartedAt,
        );
      } else if (active.reason === 'sevensPotWon' && active.toPlayerId !== null) {
        tableEvents.emit(
          {
            type: 'pot-to-winner',
            winnerId: active.toPlayerId,
            amount: active.amount,
          },
          presentationStartedAt,
        );
      } else if (active.toPlayerId !== null) {
        tableEvents.emit(
          {
            type: 'chips-between-players',
            toPlayerId: active.toPlayerId,
            payments: [{ playerId: active.fromPlayerId, amount: active.amount }],
          },
          presentationStartedAt,
        );
      }
    }

    // Schedule even when StrictMode re-runs this effect for the same item: the
    // first setup's cleanup cancels its timer before the second setup.
    const timer = window.setTimeout(() => {
      dispatch({ type: 'betalot-payout-advance' });
    }, BETALOT_PAYOUT_NOTICE_GAP_MS);
    return () => window.clearTimeout(timer);
  }, [active, dispatch]);

  if (!active) return null;

  const text = formatBetALotPayoutNotice(
    active.reason,
    active.amount,
    active.fromPlayerId,
    active.toPlayerId,
    myId,
  );

  return (
    <div className="betalot-payout-notice" role="status" aria-live="polite">
      {text}
    </div>
  );
}
