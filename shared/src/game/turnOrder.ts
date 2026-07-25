/**
 * Round / sub-round turn order (docs/GAME_RULES.md).
 *
 * Seats increase clockwise. Within a round players act clockwise from the first
 * roller. The caller supplies the opener from which to rotate: the previous normal
 * round's opener for a normal round, or the prior opener in a tie sequence for a
 * sub-round.
 */

export interface SeatHolder {
  seat: number | null;
}

/**
 * Order `players` clockwise starting at the seat counter-clockwise from
 * `previousFirstRollerSeat`. When `previousFirstRollerSeat` is null (first round of a
 * game), start at the lowest seat.
 *
 * If the previous first roller is absent from `players` (sat out, or not in a
 * tie), walk counter-clockwise around the seat ring until a participant is hit.
 */
export function orderPlayersFromFirstRollerSeat<T extends SeatHolder>(
  players: T[],
  previousFirstRollerSeat: number | null,
): T[] {
  const ordered = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  if (ordered.length === 0 || previousFirstRollerSeat == null) return ordered;

  // Ascending seats = clockwise. Counter-clockwise of `last` is the greatest
  // participant seat strictly below it, or the highest seat on wrap.
  let startIdx = ordered.length - 1;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if ((ordered[i]!.seat ?? 0) < previousFirstRollerSeat) {
      startIdx = i;
      break;
    }
  }
  return [...ordered.slice(startIdx), ...ordered.slice(0, startIdx)];
}
