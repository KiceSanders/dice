/**
 * Cup-phase state machine for DicePhysics (TABLE_UI.md). Transitions happen
 * in exactly one call site each inside the component; this module owns the
 * type and the allowed-edge table so new phases fail loudly at compile time.
 */

export type CupPhase = 'idle' | 'held' | 'pouring' | 'settling' | 'selecting' | 'hidden';

/** Allowed directed edges. Used by tests and as documentation for editors. */
export const CUP_PHASE_EDGES: ReadonlyArray<readonly [CupPhase, CupPhase]> = [
  ['hidden', 'idle'],
  ['idle', 'held'],
  ['idle', 'hidden'],
  ['held', 'pouring'],
  ['held', 'idle'],
  ['pouring', 'settling'],
  ['settling', 'selecting'],
  ['selecting', 'idle'],
  ['selecting', 'hidden'],
  ['held', 'hidden'],
  ['pouring', 'hidden'],
  ['settling', 'hidden'],
];

const EDGE_SET = new Set(CUP_PHASE_EDGES.map(([from, to]) => `${from}->${to}`));

export function isAllowedCupTransition(from: CupPhase, to: CupPhase): boolean {
  if (from === to) return true;
  return EDGE_SET.has(`${from}->${to}`);
}

/** Initial phase when the roller mounts (or remounts) with drag enabled. */
export function initialCupPhase(active: boolean, canDrag: boolean): CupPhase {
  return active && canDrag ? 'idle' : 'hidden';
}

/** Cup is streaming poses while carried or pouring. */
export function cupStreamingVisible(phase: CupPhase): boolean {
  return phase === 'held' || phase === 'pouring';
}

/** Pose sampling rate: fast while motion is live, slow while selecting. */
export function poseSampleIntervalMs(phase: CupPhase, fastMs: number, slowMs: number): number {
  return phase === 'selecting' ? slowMs : fastMs;
}
