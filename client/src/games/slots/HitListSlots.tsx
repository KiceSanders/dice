import { createSlotRound, SLOT_TICKET_COST, slotRoundReducer } from '@dice/shared';
import { useEffect, useReducer } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../table3d/useMediaQuery';
import { drawSlotDice, drawSlotTargets, SLOT_REVEAL_MS } from './machine';
import SlotMachine from './SlotMachine';
import './slots.css';

export default function HitListSlots() {
  const [round, dispatch] = useReducer(slotRoundReducer, undefined, () =>
    createSlotRound(drawSlotTargets()),
  );
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const spinning = round.phase === 'spinning';

  useEffect(() => {
    document.title = 'Hit List Slots — Bet-a-lot';
    return () => {
      document.title = 'Dice';
    };
  }, []);

  useEffect(() => {
    if (!spinning) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'settle' }),
      reducedMotion ? 0 : SLOT_REVEAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [spinning, reducedMotion]);

  return (
    <main className="slots-page">
      <nav className="slots-nav" aria-label="Slots navigation">
        <Link to="/">← Back to games</Link>
        <span className="slots-practice">Practice · no live chips</span>
      </nav>
      <SlotMachine
        round={round}
        practice
        footer={`Practice rounds are free. In Bet-a-lot, each matched opening call earns one ticket. Save ${SLOT_TICKET_COST} tickets for a five-spin session with live chip prizes.`}
        onSpin={() => dispatch({ type: 'spin', dice: drawSlotDice() })}
        onLock={(index) => dispatch({ type: 'toggle-lock', index })}
        onCollect={() => dispatch({ type: 'collect' })}
        onNext={() => dispatch({ type: 'new-round', targets: drawSlotTargets(round.targets) })}
      />
    </main>
  );
}
