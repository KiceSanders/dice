import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import Seat, { type SeatStatus } from '../components/Seat';
import {
  clampCardLeftPx,
  type OverlayRect,
  seatAnchorOffset,
  seatDisplayPlacements,
  seatOverlayPositionAtAngle,
  seatStripOrder,
  visibleSeatIndices,
} from './layout';

/**
 * Positions a seat card with its inner edge anchored toward the table center,
 * then clamps it horizontally inside the frame: side-gutter cards grow outward,
 * so a wide card (long name) would otherwise leave the frame and clip at the
 * window edge. Measured live like the rest of the seat layout — the card
 * slides inward over the canvas edge only as far as it must.
 */
function ClampedSeatAnchor({
  leftPct,
  topPct,
  angle,
  frameWidth,
  children,
}: {
  leftPct: number;
  topPct: number;
  angle: number;
  frameWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shiftPx, setShiftPx] = useState(0);

  // No dep array on purpose: re-measure after every render (name/chip/status
  // changes resize the card); the state update bails out when unchanged.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || frameWidth <= 0) return;
    const { tx } = seatAnchorOffset(angle);
    const width = el.offsetWidth; // unaffected by the translate transform
    const cardLeft = (leftPct / 100) * frameWidth + tx * width;
    setShiftPx(clampCardLeftPx(cardLeft, width, frameWidth) - cardLeft);
  });

  const { tx, ty } = seatAnchorOffset(angle);
  const x = tx === 0 ? '0px' : tx === -1 ? '-100%' : '-50%';
  const y = ty === 0 ? '0' : ty === -1 ? '-100%' : '-50%';
  return (
    <div
      ref={ref}
      className="seat-overlay-anchor"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(calc(${x} + ${shiftPx}px), ${y})`,
      }}
    >
      {children}
    </div>
  );
}

interface SeatsProps {
  snapshot: RoomSnapshot;
  myId: string | null;
  winnerId: string | null;
}

interface Props extends SeatsProps {
  frame: OverlayRect;
  viewport: OverlayRect;
}

/** Color signal for a seated player during play (null = waiting to act / no game). */
function seatStatus(snapshot: RoomSnapshot, playerId: string): SeatStatus | null {
  const game = snapshot.game;
  if (!game || snapshot.phase !== 'playing') return null;
  if (game.currentTurn?.playerId === playerId) return 'rolling';
  if (game.rollToBeat?.playerIds.includes(playerId)) return 'toBeat';
  if (game.turnQueue.includes(playerId)) return null;
  return 'out';
}

function deriveSeats(snapshot: RoomSnapshot, myId: string | null) {
  const bySeat = new Map<number, PlayerPublic>();
  for (const p of snapshot.players) {
    if (p.seat !== null) bySeat.set(p.seat, p);
  }
  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? null;
  const visibleSeats = visibleSeatIndices(snapshot.phase, [...bySeat.keys()]);
  const placements = seatDisplayPlacements(visibleSeats, mySeat);
  return { bySeat, mySeat, visibleSeats, placements };
}

function seatCard(
  seatIndex: number,
  { snapshot, myId, winnerId }: SeatsProps,
  derived: ReturnType<typeof deriveSeats>,
) {
  const player = derived.bySeat.get(seatIndex) ?? null;
  return (
    <Seat
      seatIndex={seatIndex}
      player={player}
      isMe={player !== null && player.id === myId}
      isWinner={player !== null && player.id === winnerId}
      status={player === null ? null : seatStatus(snapshot, player.id)}
    />
  );
}

/** 2D seat cards in the frame gutter — never overlap the felt. */
export default function SeatOverlay(props: Props) {
  const { snapshot, myId, frame, viewport } = props;
  const derived = deriveSeats(snapshot, myId);

  return (
    <div className="seat-overlay">
      {derived.placements.map((placement) => {
        const { leftPct, topPct, angle } = seatOverlayPositionAtAngle(
          placement.angle,
          frame,
          viewport,
        );
        return (
          <ClampedSeatAnchor
            key={placement.seatIndex}
            leftPct={leftPct}
            topPct={topPct}
            angle={angle}
            frameWidth={frame.width}
          >
            {seatCard(placement.seatIndex, props, derived)}
          </ClampedSeatAnchor>
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
