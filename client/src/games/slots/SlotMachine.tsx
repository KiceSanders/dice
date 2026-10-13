import {
  canSpinSlots,
  highestSlotTarget,
  SLOT_DICE_COUNT,
  SLOT_SPIN_LIMIT,
  type SlotRound,
  slotTargetMatches,
} from '@dice/shared';
import type { ReactNode } from 'react';
import SlotReel from './SlotReel';
import './slots.css';

interface Props {
  round: SlotRound;
  practice: boolean;
  disabled?: boolean;
  footer: ReactNode;
  onSpin: () => void;
  onLock: (index: number) => void;
  onCollect: () => void;
  onNext: () => void;
}

export default function SlotMachine({
  round,
  practice,
  disabled = false,
  footer,
  onSpin,
  onLock,
  onCollect,
  onNext,
}: Props) {
  const spinning = round.phase === 'spinning';
  const complete = round.phase === 'complete';
  const best = highestSlotTarget(round.targets, round.dice);
  const remaining = SLOT_SPIN_LIMIT - round.spinsUsed;
  const allLocked = round.locked.every(Boolean);
  const status = spinning
    ? 'Reels spinning…'
    : complete
      ? best
        ? `${best.label}. Collected ${round.payout} ${practice ? 'practice ' : ''}chips.`
        : 'No target hit. Try a fresh hit list.'
      : round.phase === 'ready'
        ? 'Your hit list is ready. Give it a spin.'
        : allLocked
          ? 'All five dice locked. Collect, or unlock a die to spin.'
          : best
            ? `${best.label} matched. Collect now or keep chasing.`
            : 'Lock the dice you want to keep, then spin again.';

  return (
    <section className="slots-cabinet" aria-labelledby="slots-title">
      <header className="slots-marquee">
        <span className="slots-eyebrow">Bet-a-lot bonus arcade</span>
        <h1 id="slots-title">HIT LIST</h1>
        <p>Five dice. Five spins. One big hit.</p>
      </header>

      <div className="slots-body">
        <div className="slots-section-label">
          <h2>{practice ? 'Your hit list' : 'Ticket hit list'}</h2>
          <span>Highest matching target pays</span>
        </div>
        <div className="slots-targets">
          {round.targets.map((target) => {
            const matched = !spinning && slotTargetMatches(target, round.dice);
            const paid = complete && best?.id === target.id;
            return (
              <article
                key={target.id}
                className={`slots-target slots-target--${target.difficulty}${matched ? ' is-hit' : ''}${paid ? ' is-paid' : ''}`}
              >
                <div className="slots-target-top">
                  <span>{target.difficulty}</span>
                  <span>{paid ? '✓ Paid' : matched ? '✓ Matched' : 'Target'}</span>
                </div>
                <strong className="slots-prize">
                  {target.payout}
                  <small> chips</small>
                </strong>
                <h3>{target.label}</h3>
                <p>{target.description}</p>
              </article>
            );
          })}
        </div>

        <section className="slots-machine" aria-label="Five dice slot machine" aria-busy={spinning}>
          <div className="slots-spin-meter">
            <span>
              {spinning
                ? `Spin ${round.spinsUsed} of ${SLOT_SPIN_LIMIT}`
                : `${remaining} ${remaining === 1 ? 'spin' : 'spins'} left`}
            </span>
            <div className="slots-spin-lights" aria-hidden="true">
              {Array.from({ length: SLOT_SPIN_LIMIT }, (_, index) => (
                <span className={index < remaining ? 'is-lit' : ''} key={index} />
              ))}
            </div>
            <span>Faces 1–6 · no wilds</span>
          </div>
          <div className="slots-reels">
            {Array.from({ length: SLOT_DICE_COUNT }, (_, index) => (
              <SlotReel
                key={`${round.spinsUsed}-${spinning}-${index}`}
                index={index}
                value={round.dice[index] ?? null}
                next={round.pendingDice?.[index] ?? null}
                locked={round.locked[index]!}
                spinning={spinning}
                canLock={!disabled && round.phase === 'choosing'}
                onToggle={() => onLock(index)}
              />
            ))}
          </div>
        </section>

        <div
          className={`slots-result${complete && round.payout > 0 ? ' is-win' : ''}`}
          role="status"
        >
          <span>
            {complete
              ? practice
                ? 'Practice payout'
                : 'Paid to ticket owner'
              : 'Current hand pays'}
          </span>
          <strong>
            {spinning ? '—' : complete ? round.payout : (best?.payout ?? 0)}
            <small> chips</small>
          </strong>
          <p>{status}</p>
        </div>

        <div className="slots-actions">
          {complete ? (
            <button
              type="button"
              className="slots-spin-button"
              onClick={onNext}
              disabled={disabled}
            >
              {practice ? 'New practice round' : 'Back to Bet-a-lot'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="slots-spin-button"
                disabled={disabled || !canSpinSlots(round)}
                onClick={onSpin}
              >
                {spinning ? 'Spinning…' : round.phase === 'ready' ? 'Spin the dice' : 'Spin again'}
              </button>
              <button
                type="button"
                className="slots-collect"
                disabled={disabled || round.phase !== 'choosing'}
                onClick={onCollect}
              >
                Collect {best?.payout ?? 0} chips
              </button>
            </>
          )}
        </div>
        <p className="slots-rule">
          Lock any dice between spins. Collect early, or your fifth spin pays automatically. Only
          your final hand counts; prizes don’t add together.
        </p>
      </div>
      <footer className="slots-footer">{footer}</footer>
    </section>
  );
}
