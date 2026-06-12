import { useEffect, useRef, useState, type ReactNode } from 'react';

const SHAKE_MS = 900;
const REVEAL_MS = 800;

type Phase = 'idle' | 'shaking' | 'revealing';

interface Props {
  /**
   * Changes on every `turn:rolled` (the client receive timestamp); each change
   * triggers a shake → slam → reveal cycle. null = nothing to animate.
   */
  rollId: number | null;
  children: ReactNode;
}

/**
 * The dice cup: on a roll it shakes over the dice (~900ms), slams down, then
 * lifts to reveal the re-rolled dice with a slight stagger (PLAN.md 9.2).
 * Pure CSS keyframes; skipped entirely for prefers-reduced-motion.
 */
export default function Koozie({ rollId, children }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const lastRollId = useRef<number | null>(null);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (rollId === null || rollId === lastRollId.current) return;
    lastRollId.current = rollId;
    if (reducedMotion) return; // instant reveal

    setPhase('shaking');
    const reveal = setTimeout(() => setPhase('revealing'), SHAKE_MS);
    const done = setTimeout(() => setPhase('idle'), SHAKE_MS + REVEAL_MS);
    return () => {
      clearTimeout(reveal);
      clearTimeout(done);
    };
  }, [rollId, reducedMotion]);

  return (
    <div className={`koozie-stage koozie-${phase}`}>
      <div className="koozie-dice">{children}</div>
      <div className="koozie-cup" aria-hidden>
        <div className="koozie-cup-body" />
        <div className="koozie-cup-rim" />
      </div>
    </div>
  );
}
