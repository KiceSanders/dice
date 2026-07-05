import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import type { CSSProperties } from 'react';
import Seat from '../components/Seat';
import {
  displaySeatIndex,
  type OverlayRect,
  seatOverlayPosition,
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

interface Props {
  snapshot: RoomSnapshot;
  myId: string | null;
  onKick: (playerId: string) => void;
  winnerId: string | null;
  frame: OverlayRect;
  viewport: OverlayRect;
}

/** 2D seat cards in the frame gutter — never overlap the felt. */
export default function SeatOverlay({ snapshot, myId, onKick, winnerId, frame, viewport }: Props) {
  const isHost = myId !== null && snapshot.hostId === myId;
  const activeId = snapshot.game?.currentTurn?.playerId ?? null;
  const bySeat = new Map<number, PlayerPublic>();
  for (const p of snapshot.players) {
    if (p.seat !== null) bySeat.set(p.seat, p);
  }

  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? 0;

  return (
    <div className="seat-overlay">
      {Array.from({ length: TABLE_SEAT_COUNT }, (_, i) => {
        const { leftPct, topPct, angle } = seatOverlayPosition(
          displaySeatIndex(i, mySeat),
          TABLE_SEAT_COUNT,
          frame,
          viewport,
        );
        const player = bySeat.get(i) ?? null;
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
            <Seat
              seatIndex={i}
              player={player}
              isMe={player !== null && player.id === myId}
              isActive={player !== null && player.id === activeId}
              isWinner={player !== null && player.id === winnerId}
              canKick={isHost && player !== null && player.id !== myId}
              onKick={onKick}
            />
          </div>
        );
      })}
    </div>
  );
}
