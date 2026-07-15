import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import { type CSSProperties, Fragment } from 'react';
import Seat from '../components/Seat';
import {
  type OverlayRect,
  seatAnchorOffset,
  seatDisplayOrder,
  seatOverlayPosition,
  seatStripOrder,
  visibleSeatIndices,
} from './layout';

/** Anchor the inner edge of the card toward the table center. */
function seatAnchorStyle(angle: number): CSSProperties {
  const { tx, ty } = seatAnchorOffset(angle);
  const x = tx === 0 ? '0' : tx === -1 ? '-100%' : '-50%';
  const y = ty === 0 ? '0' : ty === -1 ? '-100%' : '-50%';
  return { transform: `translate(${x}, ${y})` };
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
  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? null;
  const visibleSeats = visibleSeatIndices(snapshot.phase, [...bySeat.keys()]);
  const displaySeats = seatDisplayOrder(visibleSeats, mySeat);
  return { isHost, activeId, bySeat, mySeat, visibleSeats, displaySeats };
}

function seatCard(
  seatIndex: number,
  { myId, onKick, winnerId }: SeatsProps,
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
      {derived.displaySeats.map((seatIndex, displaySlot) => {
        const { leftPct, topPct, angle } = seatOverlayPosition(
          displaySlot,
          derived.displaySeats.length,
          frame,
          viewport,
        );
        return (
          <div
            key={seatIndex}
            className="seat-overlay-anchor"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              ...seatAnchorStyle(angle),
            }}
          >
            {seatCard(seatIndex, props, derived)}
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
      {seatStripOrder(derived.visibleSeats, derived.mySeat).map((i) => (
        <Fragment key={i}>{seatCard(i, props, derived)}</Fragment>
      ))}
    </div>
  );
}
