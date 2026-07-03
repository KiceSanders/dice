/** Toggle a die in/out of the pending keep list (pre-roll selection only). */
export function togglePendingKeep(
  index: number,
  pendingKeep: number[],
  lockedKeep: number[],
  hasRolled: boolean,
): number[] | null {
  if (!hasRolled) return null;
  if (lockedKeep.includes(index)) return null;
  const next = pendingKeep.includes(index)
    ? pendingKeep.filter((x) => x !== index)
    : [...pendingKeep, index];
  return [...next].sort((a, b) => a - b);
}
