import { useEffect, useState } from 'react';

const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  /** Epoch ms when the turn auto-stands. */
  deadline: number;
  totalMs?: number;
}

/** Countdown ring for the 60s turn timer (PLAN.md 9.3). */
export default function TimerRing({ deadline, totalMs = 60_000 }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

  const remaining = Math.max(0, deadline - now);
  const fraction = Math.min(1, remaining / totalMs);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <svg
      className="timer-ring"
      viewBox="0 0 36 36"
      data-low={remaining < 10_000 || undefined}
      role="timer"
      aria-label={`${seconds} seconds left in turn`}
    >
      <circle className="timer-ring-bg" cx="18" cy="18" r={RADIUS} />
      <circle
        className="timer-ring-fg"
        cx="18"
        cy="18"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        transform="rotate(-90 18 18)"
      />
      <text className="timer-ring-text" x="18" y="22.5" textAnchor="middle">
        {seconds}
      </text>
    </svg>
  );
}
