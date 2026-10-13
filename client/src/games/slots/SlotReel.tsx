import type { Die as DieValue } from '@dice/shared';
import type { CSSProperties } from 'react';
import Die from '../../components/Die';
import { buildSlotReel, SLOT_REEL_BASE_MS, SLOT_REEL_STAGGER_MS } from './machine';

interface Props {
  index: number;
  value: DieValue | null;
  next: DieValue | null;
  locked: boolean;
  spinning: boolean;
  canLock: boolean;
  onToggle: () => void;
}

export default function SlotReel({
  index,
  value,
  next,
  locked,
  spinning,
  canLock,
  onToggle,
}: Props) {
  const moving = spinning && !locked && next !== null;
  const reel = moving ? buildSlotReel(value ?? 1, next) : null;
  const faces = reel?.faces ?? [
    value === 1 ? 6 : (((value ?? 2) - 1) as DieValue),
    value,
    value === 6 ? 1 : (((value ?? 1) + 1) as DieValue),
  ];
  const style = {
    '--slot-stop': `${0.4 - (reel?.stopIndex ?? 1)}`,
    '--slot-duration': `${SLOT_REEL_BASE_MS + index * SLOT_REEL_STAGGER_MS}ms`,
  } as CSSProperties;

  return (
    <div className={`slot-reel${locked ? ' is-locked' : ''}`}>
      <div
        className={`slot-window${moving ? ' is-spinning' : ''}`}
        role="img"
        aria-label={`Die ${index + 1}: ${moving ? 'spinning' : (value ?? 'not spun')}${locked ? ', locked' : ''}`}
        style={style}
      >
        <div className="slot-strip" aria-hidden="true">
          {faces.map((face, faceIndex) => (
            <div className="slot-symbol" key={faceIndex}>
              <Die value={face} />
            </div>
          ))}
        </div>
        <span className="slot-window-shade" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="slot-lock"
        aria-label={`${locked ? 'Unlock' : 'Lock'} die ${index + 1}${value === null ? '' : ` showing ${value}`}`}
        aria-pressed={locked}
        disabled={!canLock}
        onClick={onToggle}
      >
        {locked ? 'Locked' : 'Lock'}
      </button>
    </div>
  );
}
