import type { BodyPose, ClientMessage, Die, PoseFrame } from '@dice/shared';
import { validateRestPose } from '@dice/shared';

/** Batch pose frames so a 20 Hz sample rate costs ~10 messages/s on the wire. */
export const FRAMES_PER_MESSAGE = 2;
export const FRAME_FLUSH_MS = 200;

export function isValidPoseFrame(frame: PoseFrame): boolean {
  return frame.bodies.every((b) => b.every((n) => Number.isFinite(n)));
}

/**
 * Decide whether to flush the frame buffer immediately after pushing a frame.
 * Flush when the cup is gone (end of pour) or the batch is full.
 */
export function shouldFlushFrameBatch(
  bufferLength: number,
  cupVisible: boolean | undefined,
  maxFrames: number = FRAMES_PER_MESSAGE,
): boolean {
  return cupVisible !== true || bufferLength >= maxFrames;
}

/**
 * Build the dice-only rest pose from a settle frame (bodies are cup-first).
 * Returns null when the pose would fail the shared server check — omit it
 * from turn:throwResult rather than blocking the throw (ADR 005).
 */
export function restPoseForThrowResult(settleBodies: BodyPose[], dice: Die[]): BodyPose[] | null {
  const restPose = settleBodies.slice(1);
  if (restPose.length !== dice.length) return null;
  if (validateRestPose(restPose, dice) !== null) return null;
  return restPose;
}

export function throwStartMessage(keepIndices: number[]): ClientMessage {
  return { type: 'turn:throwStart', keepIndices: [...keepIndices] };
}

export function throwResultMessage(dice: Die[], restPose: BodyPose[] | null): ClientMessage {
  return {
    type: 'turn:throwResult',
    dice,
    ...(restPose ? { restPose } : {}),
  };
}

export function standMessage(restPose: BodyPose[] | null): ClientMessage {
  return {
    type: 'turn:stand',
    ...(restPose ? { restPose } : {}),
  };
}

export function framesMessage(frames: PoseFrame[]): ClientMessage {
  return { type: 'dice:frames', frames };
}

/** Mutable frame batch used by the live roll hook. */
export class FrameBatch {
  frames: PoseFrame[] = [];
  flushTimer: number | null = null;

  clearTimer(clearTimeoutFn: (id: number) => void = clearTimeout) {
    if (this.flushTimer !== null) {
      clearTimeoutFn(this.flushTimer);
      this.flushTimer = null;
    }
  }

  take(): PoseFrame[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }

  push(frame: PoseFrame): number {
    this.frames.push(frame);
    return this.frames.length;
  }

  scheduleFlush(
    flush: () => void,
    delayMs: number = FRAME_FLUSH_MS,
    setTimeoutFn: (handler: () => void, timeout: number) => number = window.setTimeout.bind(window),
  ): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeoutFn(flush, delayMs);
  }
}
