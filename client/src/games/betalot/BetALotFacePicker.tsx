import type { BetALotStatePublic, Die, PlayerPublic, RoomSnapshot } from '@dice/shared';
import DieFace from '../../components/Die';
import { useApp } from '../../state/context';
import {
  type OverlayRect,
  seatDisplayPlacement,
  tableInsetPositionAtAngle,
} from '../../table3d/layout';

const FACES: Die[] = [1, 2, 3, 4, 5, 6];

/**
 * Six selectable faces on the felt in front of the opener. Interactive only for
 * the choosing player; spectators see the same lineup (non-clickable).
 */
export default function BetALotFacePicker({
  snapshot,
  myId,
  frame,
  viewport,
}: {
  snapshot: RoomSnapshot;
  myId: string | null;
  frame: OverlayRect;
  viewport: OverlayRect;
}) {
  const { send, state } = useApp();
  const game = snapshot.game as BetALotStatePublic | null;
  if (!game?.awaitingCall || !game.currentPlayerId) return null;

  const chooser = snapshot.players.find((player) => player.id === game.currentPlayerId);
  if (!chooser || chooser.seat === null) return null;

  const occupied = snapshot.players
    .filter((player): player is PlayerPublic & { seat: number } => player.seat !== null)
    .map((player) => player.seat)
    .sort((a, b) => a - b);
  const mySeat = snapshot.players.find((player) => player.id === myId)?.seat ?? null;
  const placement = seatDisplayPlacement(occupied, mySeat, chooser.seat);
  if (!placement) return null;

  const pos = tableInsetPositionAtAngle(placement.angle, frame, viewport);
  const isChooser = game.currentPlayerId === myId;

  return (
    <fieldset
      className="betalot-face-picker"
      style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%` }}
      aria-label="Call opening face"
    >
      {FACES.map((face) =>
        isChooser ? (
          <DieFace
            key={face}
            value={face}
            small
            onClick={() => {
              if (state.connection !== 'open') return;
              send({ type: 'betalot:call', face });
            }}
          />
        ) : (
          <DieFace key={face} value={face} small />
        ),
      )}
    </fieldset>
  );
}
