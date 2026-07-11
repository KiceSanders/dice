import type { BodyPose, PoseFrame } from '@dice/shared';
import { DICE_COUNT } from './constants';
import { type DieRuntime, eulerToQuat } from './diceRuntime';

const roundMm = (v: number) => Math.round(v * 1000) / 1000;

function poseFromRuntimeDie(rt: DieRuntime): BodyPose {
  const q = eulerToQuat(rt.rotation ?? [0, 0, 0]);
  return [
    roundMm(rt.position[0]),
    roundMm(rt.position[1]),
    roundMm(rt.position[2]),
    roundMm(q.x),
    roundMm(q.y),
    roundMm(q.z),
    roundMm(q.w),
  ];
}

/**
 * Build a pose frame from the declarative dice runtime. Used after selecting
 * changes, where React state is the source of the visual layout and Rapier
 * body props may not have committed yet.
 */
export function poseFrameFromRuntime(
  runtime: DieRuntime[],
  cupPose: BodyPose,
  t = 0,
  cupVisible = false,
): PoseFrame | null {
  const bodies: BodyPose[] = [cupPose];
  for (let i = 0; i < DICE_COUNT; i++) {
    const rt = runtime[i];
    if (!rt?.visible) return null;
    bodies.push(poseFromRuntimeDie(rt));
  }
  return { t, bodies, cupVisible };
}
