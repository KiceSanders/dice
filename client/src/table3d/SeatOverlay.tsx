import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import { type CSSProperties, Fragment } from 'react';
import Seat from '../components/Seat';
import {
  displaySeatIndex,
  type OverlayRect,
  seatOverlayPosition,
  seatStripOrder,
  TABLE_SEAT_COUNT,
} from './layout';

/** Anchor the inner edge of the card toward the table center. */
function seatAnchorStyle(angle: number): CSSProperties {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (s > 0.55) return { transform: 'translate(-50%, 0)' };
  if (s < -0.55) return { transform: 'translate(-50%, -100%)' };
  if (c > 0.55) return { transform: 'translate(0, -50%)' };
  if (c < -0.55) return { transform: 'translate(-100%, -50%)' };
  return { transform: 'translate(-50%, -50%)' };
}

interface SeatsProps {
  snapshot: RoomSnapshot;
  myId: string | null;
  onKick: (playerId: string) => void;
  winnerId: string | null;
}

interface Props extends SeatsProps {
  frame: OverlayRect;
  viewport: OverlayRect;
}

function deriveSeats(snapshot: RoomSnapshot, myId: string | null) {
  const isHost = myId !== null && snapshot.hostId === myId;
  const activeId = snapshot.game?.currentTurn?.playerId ?? null;
  const bySeat = new Map<number, PlayerPublic>();
  for (const p of snapshot.players) {
    if (p.seat !== null) bySeat.set(p.seat, p);
  }
  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? 0;
  return { isHost, activeId, bySeat, mySeat };
}

function seatCard(
  seatIndex: number,
  { snapshot, myId, onKick, winnerId }: SeatsProps,
  derived: ReturnType<typeof deriveSeats>,
) {
  const player = derived.bySeat.get(seatIndex) ?? null;
  return (
    <Seat
      seatIndex={seatIndex}
      player={player}
      isMe={player !== null && player.id === myId}
      isActive={player !== null && player.id === derived.activeId}
      isWinner={player !== null && player.id === winnerId}
      canKick={derived.isHost && player !== null && player.id !== myId}
      onKick={onKick}
    />
  );
}

/** 2D seat cards in the frame gutter — never overlap the felt. */
export default function SeatOverlay(props: Props) {
  const { snapshot, myId, frame, viewport } = props;
  const derived = deriveSeats(snapshot, myId);

  return (
    <div className="seat-overlay">
      {Array.from({ length: TABLE_SEAT_COUNT }, (_, i) => {
        const { leftPct, topPct, angle } = seatOverlayPosition(
          displaySeatIndex(i, derived.mySeat),
          TABLE_SEAT_COUNT,
          frame,
          viewport,
        );
        return (
          <div
            key={i}
            className="seat-overlay-anchor"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              ...seatAnchorStyle(angle),
            }}
          >
            {seatCard(i, props, derived)}
          </div>
        );
      })}
    </div>
  );
}

/** Stacked seat list below the canvas on small screens — same cards, normal flow. */
export function SeatStrip(props: SeatsProps) {
  const derived = deriveSeats(props.snapshot, props.myId);
  return (
    <div className="seat-strip">
      {seatStripOrder(derived.mySeat).map((i) => (
        <Fragment key={i}>{seatCard(i, props, derived)}</Fragment>
      ))}
    </div>
  );
}
