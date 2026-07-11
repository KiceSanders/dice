import type { Die as DieValue } from '@dice/shared';
import type { CSSProperties } from 'react';
import Die from './Die';

interface Props {
  dice: DieValue[];
  /** Indices currently marked kept (visual state from last committed keep set). */
  kept?: number[];
  /** Indices the player intends to keep on the next roll. */
  selected?: number[];
  /** When provided, any die toggles keep on click. */
  onToggle?: (index: number) => void;
  small?: boolean;
}

/**
 * A row of 5 dice. Each die wrapper carries `--die-i` and kept/unkept classes
 * so the koozie animation can hide and stagger-reveal only re-rolled dice.
 */
export default function DiceRow({
  dice,
  kept = [],
  selected = [],
  onToggle,
  small = false,
}: Props) {
  return (
    <div className={`dice-row${small ? ' dice-row-small' : ''}`}>
      {dice.map((value, i) => {
        const isKept = kept.includes(i);
        return (
          <span
            key={i}
            className={`die-wrap ${isKept ? 'die-kept-wrap' : 'die-unkept-wrap'}`}
            style={{ '--die-i': i } as CSSProperties}
          >
            <Die
              value={value}
              kept={isKept}
              selected={selected.includes(i)}
              small={small}
              onClick={onToggle ? () => onToggle(i) : undefined}
            />
          </span>
        );
      })}
    </div>
  );
}
