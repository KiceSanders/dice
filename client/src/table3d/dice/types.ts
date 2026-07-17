import type { Die, PoseFrame } from '@dice/shared';

/** World-space throw velocity sampled from pointer movement (units/sec). */
export interface ThrowVelocity {
  x: number;
  y: number;
  z: number;
}

/** Props for 3D dice rolling on the table canvas. */
export interface TableDiceProps {
  /**
   * Yahtzee bonus mode: all five quint dice are force-kept on the rail and a
   * temporary sixth die rides in the cup (keepIndices carries the forced keep
   * set; keep toggling is disabled). TableCanvas remounts DicePhysics when
   * this flips so the runtime rebuilds.
   */
  bonusMode?: boolean;
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
  /**
   * Called when dice settle after a throw. `settleFrame` is the view-local
   * pose sampled at that instant (kept dice already railed, cup hidden) — the
   * source of the authoritative rest pose sent to the server (ADR 005).
   */
  /** Return true to keep the koozie hidden while the server delays a terminal/special result. */
  onSettled: (dice: Die[], settleFrame: PoseFrame) => boolean | undefined;
  /** Called when rolling state changes. */
  onRollingChange?: (rolling: boolean) => void;
  /** Called on mouseup after a drag with sampled throw velocity. */
  onRelease: (velocity: ThrowVelocity) => void;
  /** Called when the player presses/releases the mouse to drag dice. */
  onDragChange?: (dragging: boolean) => void;
  /** False while dice are rolling — disables pick-up. */
  canDrag?: boolean;
  /** Click a die on the felt or side tray to toggle keep. */
  // biome-ignore lint/suspicious/noConfusingVoidType: handlers may return the updated keep set or nothing
  onKeepToggle?: (index: number) => number[] | void;
  /**
   * Sampled cup+dice poses for spectator streaming (ADR 004): ~20 Hz while
   * held/pouring/settling, ~4 Hz during selecting. Omit to disable sampling.
   */
  onPoseFrame?: (frame: PoseFrame) => void;
}
