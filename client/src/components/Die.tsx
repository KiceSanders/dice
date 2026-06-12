import type { Die as DieValue } from '@dice/shared';

/** Pip centers (percent of the die face) for each value. */
const PIP_LAYOUTS: Record<DieValue, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [30, 30],
    [70, 70],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [30, 30],
    [70, 30],
    [30, 70],
    [70, 70],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [30, 26],
    [70, 26],
    [30, 50],
    [70, 50],
    [30, 74],
    [70, 74],
  ],
};

interface Props {
  /** null renders a face-down (blank) die. */
  value: DieValue | null;
  /** Locked by the server — cannot be released this turn. */
  kept?: boolean;
  /** Marked to be kept on the next roll (not yet locked). */
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/** A single SVG-pip die. Renders as a button when clickable. */
export default function Die({ value, kept = false, selected = false, small = false, onClick }: Props) {
  const classes = [
    'die',
    small ? 'die-small' : '',
    kept ? 'die-locked' : '',
    !kept && selected ? 'die-selected' : '',
    value === null ? 'die-facedown' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const face = (
    <svg viewBox="0 0 100 100" aria-hidden focusable="false">
      <rect x="3" y="3" width="94" height="94" rx="18" className="die-face" />
      {value !== null &&
        PIP_LAYOUTS[value].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" className="die-pip" />)}
    </svg>
  );

  const label =
    value === null ? 'face-down die' : `die showing ${value}${kept ? ', kept' : selected ? ', will keep' : ''}`;

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-label={label} aria-pressed={kept || selected}>
        {face}
      </button>
    );
  }
  return (
    <span className={classes} role="img" aria-label={label}>
      {face}
    </span>
  );
}
