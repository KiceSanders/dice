import type { ContactForcePayload } from '@react-three/rapier';
import { audioBus } from './audioBus';
import { AUDIO_TUNING } from './audioTuning';
import { classifyPair, createImpactGate } from './impactRules';
import { rattleFeedAmount, tableRattle } from './rattle';

/**
 * Roller-side impact capture: attached as `onContactForce` on each die's
 * collider in DieBody (dice take part in every impact we care about, so no
 * other collider needs events). The surface met is read from the collider
 * `name` props set in DieBody/TableColliders/KoozieBody. Imported directly
 * by DieBody — module singleton, zero props through DicePhysics, mirroring
 * how tableEvents reaches its subscribers.
 *
 * Rapier fires one event per touching pair per physics step, so everything
 * here is allocation-light and the pure gate (impactRules) turns the stream
 * into discrete plays. Cup contacts feed the rattle level instead and only
 * spike above `tickThreshold` as a discrete clack.
 *
 * Calibrating force thresholds: `localStorage.setItem('dice:audio-debug', '1')`
 * logs observed magnitudes per pair; tune AUDIO_TUNING.impact from those.
 */

const gate = createImpactGate(AUDIO_TUNING.impact);

function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('dice:audio-debug') === '1';
  } catch {
    return false;
  }
}

export function handleDieContactForce(payload: ContactForcePayload): void {
  const pair = classifyPair(payload.other.colliderObject?.name);
  if (pair === null) return;
  const force = payload.totalForceMagnitude;
  const now = performance.now();

  if (debugEnabled()) console.debug(`[audio] ${pair} force=${force.toFixed(3)}`);

  if (pair === 'die-cup' || pair === 'die-lid') {
    tableRattle.feed(rattleFeedAmount(force, AUDIO_TUNING.rattle), now);
    if (force < AUDIO_TUNING.rattle.tickThreshold) return;
  }

  // Sorted handles so both dice of a die-die contact share one gate slot.
  const a = payload.target.collider.handle;
  const b = payload.other.collider.handle;
  const pairKey = a < b ? `${a}:${b}` : `${b}:${a}`;
  const decision = gate.evaluate(pairKey, pair, force, now);
  if (!decision.play) return;

  const translation = payload.target.rigidBody?.translation();
  audioBus.emit({
    kind: 'impact',
    pair,
    intensity: decision.intensity,
    worldX: translation?.x ?? 0,
  });
}
