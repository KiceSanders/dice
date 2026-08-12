import type { BetALotStatePublic, PlayerPublic, RoomSnapshot } from '@dice/shared';
import DieFace from '../../components/Die';
import { useApp } from '../../state/context';
import {
  type OverlayRect,
  seatDisplayPlacement,
  seatOverlayPositionAtAngle,
} from '../../table3d/layout';

export function calledFaceLeftPct(seatLeftPct: number, displaySlot: number): number {
  const shifted = seatLeftPct + (displaySlot === 0 ? 12 : 8);
  // A full-size called die is roughly 9% of the narrowest desktop frame.
  return Math.min(91, Math.max(9, shifted));
}

export function shouldShowBetALotCalledFace(
  chooserId: string,
  currentPlayerId: string | null,
  koozieInPlay: boolean,
): boolean {
  return !koozieInPlay || currentPlayerId === chooserId;
}

/**
 * Chosen opening face parked beside the chooser's seat (off the main play
 * area) until the next roller picks up the koozie.
 */
export default function BetALotCalledFace({
  snapshot,
  myId,
  frame,
  viewport,
  koozieInPlay,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
  frame: OverlayRect;
  viewport: OverlayRect;
  koozieInPlay: boolean;
}) {
  const { state } = useApp();
  const display = state.betALotCallDisplay;
  const game = snapshot.game as BetALotStatePublic | null;
  if (
    !display ||
    !game ||
    !shouldShowBetALotCalledFace(display.playerId, game.currentPlayerId, koozieInPlay)
  ) {
    return null;
  }

  const chooser = snapshot.players.find((player) => player.id === display.playerId);
  if (!chooser || chooser.seat === null) return null;

  const occupied = snapshot.players
    .filter((player): player is PlayerPublic & { seat: number } => player.seat !== null)
    .map((player) => player.seat)
    .sort((a, b) => a - b);
  const mySeat = snapshot.players.find((player) => player.id === myId)?.seat ?? null;
  const placement = seatDisplayPlacement(occupied, mySeat, chooser.seat);
  if (!placement) return null;

  const pos = seatOverlayPositionAtAngle(placement.angle, frame, viewport);
  return (
    <div
      key={`${display.playerId}-${display.face}`}
      className="betalot-called-face"
      style={{
        left: `${calledFaceLeftPct(pos.leftPct, placement.displaySlot)}%`,
        top: `${pos.topPct}%`,
      }}
      role="img"
      aria-label={`Called face ${display.face}`}
    >
      <DieFace value={display.face} />
    </div>
  );
}
