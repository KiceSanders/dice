import type { Die } from '@dice/shared';

/** World-space throw velocity sampled from pointer movement (units/sec). */
export interface ThrowVelocity {
  x: number;
  y: number;
  z: number;
}

/** Props for 3D dice rolling on the table canvas. */
export interface TableDiceProps {
  /** Which dice indices are locked (kept) this turn. */
  keepIndices: number[];
  /** Current logical dice (empty before first roll). */
  dice: Die[];
  /** Whether a turn is active on the table. */
  active: boolean;
  /** Increment when dice are released — apply `releaseVelocity`. */
  releaseSignal: number;
  /** Pointer velocity at release. */
  releaseVelocity: ThrowVelocity;
  /** Called when dice settle after a throw. */
  onSettled: (dice: Die[]) => void;
  /** Called when rolling state changes. */
  onRollingChange?: (rolling: boolean) => void;
  /** Called on mouseup after a drag with sampled throw velocity. */
  onRelease: (velocity: ThrowVelocity) => void;
  /** Called when the player presses/releases the mouse to drag dice. */
  onDragChange?: (dragging: boolean) => void;
  /** False while dice are rolling — disables pick-up. */
  canDrag?: boolean;
}
