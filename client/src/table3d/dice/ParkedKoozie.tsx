import { koozieRestPosition } from './diceLayout';
import KoozieMesh from './KoozieMesh';
import { useDicePhysicsTuning } from './tuning';

/**
 * Non-interactive parked cup for spectators (and anyone not mounting
 * DicePhysics). Positioned at the active player's display seat so every
 * viewer sees whose turn it is. The roller’s interactive cup lives in
 * DicePhysics instead — do not mount both.
 */
export default function ParkedKoozie({ displaySeat }: { displaySeat: number }) {
  const tuning = useDicePhysicsTuning();
  const position = koozieRestPosition(tuning.cup, displaySeat);
  return (
    <group position={position}>
      <KoozieMesh cup={tuning.cup} />
    </group>
  );
}
