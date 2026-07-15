import type { PlayerPublic } from '@dice/shared';

/** In-hand color signal shown as the card's background tint (null = waiting to act). */
export type SeatStatus = 'toBeat' | 'rolling' | 'out';

const STATUS_CLASSES: Record<SeatStatus, string> = {
  toBeat: 'seat--to-beat',
  rolling: 'seat--rolling',
  out: 'seat--out',
};

const STATUS_TITLES: Record<SeatStatus, string> = {
  toBeat: 'holds the roll to beat',
  rolling: 'rolling now',
  out: 'out of this hand',
};

interface Props {
  seatIndex: number;
  player: PlayerPublic | null;
  isMe: boolean;
  /** This player just won the round (round-end highlight). */
  isWinner?: boolean;
  /** Background tint signal during play. */
  status?: SeatStatus | null;
}

/** Server caps names at 24 chars (room.ts); tiers keep the full name on one line. */
function nameSizeClass(name: string): string {
  if (name.length <= 11) return '';
  if (name.length <= 16) return ' seat-name--sm';
  if (name.length <= 21) return ' seat-name--xs';
  return ' seat-name--xxs';
}

const CHIP_TICK_ANGLES = [0, 60, 120, 180, 240, 300];

/** Tiny poker chip matching the gold pot chips on the table. */
function ChipIcon() {
  return (
    <svg className="seat-chip-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" fill="var(--accent)" />
      <g fill="rgba(255, 255, 255, 0.9)">
        {CHIP_TICK_ANGLES.map((deg) => (
          <rect
            key={deg}
            x="8.9"
            y="1"
            width="2.2"
            height="3"
            rx="1"
            transform={`rotate(${deg} 10 10)`}
          />
        ))}
      </g>
      <circle
        cx="10"
        cy="10"
        r="5"
        fill="none"
        stroke="var(--surface)"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * A logical table seat: a player card or, in the lobby, an empty slot.
 * One row — name · chips — with the in-hand status as the background tint;
 * host actions (kick) live in HostPanel below the table, not on the card.
 */
export default function Seat({ seatIndex, player, isMe, isWinner = false, status = null }: Props) {
  if (!player) {
    return (
      <div className="seat seat-empty">
        <span className="seat-number">Seat {seatIndex + 1}</span>
        <span className="seat-empty-label">empty</span>
      </div>
    );
  }

  const classes = [
    'seat',
    status ? STATUS_CLASSES[status] : '',
    isMe ? 'seat--me' : '',
    isWinner ? 'seat--winner' : '',
    player.connected ? '' : 'seat--offline',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} title={status ? STATUS_TITLES[status] : undefined}>
      <span className={`seat-name${nameSizeClass(player.name)}`} data-chip-player={player.id}>
        {player.name}
      </span>
      <div className="seat-chips">
        <span>{player.chips}</span>
        <ChipIcon />
      </div>
    </div>
  );
}
