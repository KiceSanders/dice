import { koozieRestPositionAtAngle } from './diceLayout';
import KoozieMesh from './KoozieMesh';
import { useDicePhysicsTuning } from './tuning';

/**
 * Non-interactive parked cup for spectators (and anyone not mounting
 * DicePhysics). Its angle comes from the same occupied-card arrangement as
 * SeatOverlay, pinning it directly in front of the active player's card. The
 * roller’s interactive cup lives in DicePhysics instead — do not mount both.
 */
export default function ParkedKoozie({ displayAngle }: { displayAngle: number }) {
  const tuning = useDicePhysicsTuning();
  const position = koozieRestPositionAtAngle(tuning.cup, displayAngle);
  return (
    <group position={position}>
      <KoozieMesh cup={tuning.cup} />
    </group>
  );
}
