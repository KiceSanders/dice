export const SLOT_TICKET_COST = 2;

/** One entry per earned ticket. Players never combine their balances. */
export function redeemSlotTickets(
  tickets: readonly string[],
): { playerId: string; tickets: string[] } | null {
  const counts = new Map<string, number>();
  for (const playerId of tickets) {
    const count = (counts.get(playerId) ?? 0) + 1;
    counts.set(playerId, count);
    if (count < SLOT_TICKET_COST) continue;
    let remaining = SLOT_TICKET_COST;
    return {
      playerId,
      tickets: tickets.filter((owner) => {
        if (owner !== playerId || remaining === 0) return true;
        remaining -= 1;
        return false;
      }),
    };
  }
  return null;
}
