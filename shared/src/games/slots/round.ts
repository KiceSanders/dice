import { assertNever } from '../../assert.js';
import type { Die } from '../../types.js';
import { highestSlotTarget, type SlotTarget } from './targets.js';

export const SLOT_SPIN_LIMIT = 5;
export const SLOT_DICE_COUNT = 5;
export const SLOT_REEL_BASE_MS = 850;
export const SLOT_REEL_STAGGER_MS = 170;
export const SLOT_REVEAL_MS = SLOT_REEL_BASE_MS + SLOT_REEL_STAGGER_MS * (SLOT_DICE_COUNT - 1);

export interface LiveSlotBonus {
  id: string;
  playerId: string;
  revision: number;
  round: SlotRound;
  fireMultiplier: number;
  payoutLimit: number;
  settlesAt: number | null;
  expiresAt: number;
}

export interface BetALotSlotsState {
  /** One owner entry per unspent ticket, carried between rounds in this game. */
  tickets: string[];
  active: LiveSlotBonus | null;
}

export interface SlotRound {
  targets: readonly SlotTarget[];
  dice: readonly Die[];
  locked: readonly boolean[];
  spinsUsed: number;
  phase: 'ready' | 'spinning' | 'choosing' | 'complete';
  pendingDice: readonly Die[] | null;
  payout: number;
}

export type SlotAction =
  | { type: 'spin'; dice: readonly Die[] }
  | { type: 'settle' }
  | { type: 'toggle-lock'; index: number }
  | { type: 'collect' }
  | { type: 'new-round'; targets: readonly SlotTarget[] };

export function createSlotRound(targets: readonly SlotTarget[]): SlotRound {
  return {
    targets,
    dice: [],
    locked: Array<boolean>(SLOT_DICE_COUNT).fill(false),
    spinsUsed: 0,
    phase: 'ready',
    pendingDice: null,
    payout: 0,
  };
}

export function canSpinSlots(round: SlotRound): boolean {
  return (
    (round.phase === 'ready' || round.phase === 'choosing') &&
    round.spinsUsed < SLOT_SPIN_LIMIT &&
    !round.locked.every(Boolean)
  );
}

/** Animation only delays reveal. It never changes a sampled result or consumes another spin. */
export function slotRoundReducer(round: SlotRound, action: SlotAction): SlotRound {
  switch (action.type) {
    case 'spin': {
      if (!canSpinSlots(round)) return round;
      if (
        action.dice.length !== SLOT_DICE_COUNT ||
        action.dice.some((face) => !Number.isInteger(face) || face < 1 || face > 6)
      ) {
        return round;
      }
      return {
        ...round,
        phase: 'spinning',
        spinsUsed: round.spinsUsed + 1,
        pendingDice: action.dice.map((face, index) =>
          round.locked[index] ? round.dice[index]! : face,
        ),
      };
    }
    case 'settle': {
      if (round.phase !== 'spinning' || !round.pendingDice) return round;
      const complete = round.spinsUsed === SLOT_SPIN_LIMIT;
      return {
        ...round,
        dice: round.pendingDice,
        pendingDice: null,
        phase: complete ? 'complete' : 'choosing',
        payout: complete ? (highestSlotTarget(round.targets, round.pendingDice)?.payout ?? 0) : 0,
      };
    }
    case 'toggle-lock':
      if (
        round.phase !== 'choosing' ||
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= SLOT_DICE_COUNT
      ) {
        return round;
      }
      return {
        ...round,
        locked: round.locked.map((locked, index) => (index === action.index ? !locked : locked)),
      };
    case 'collect':
      return round.phase === 'choosing'
        ? {
            ...round,
            phase: 'complete',
            payout: highestSlotTarget(round.targets, round.dice)?.payout ?? 0,
          }
        : round;
    case 'new-round':
      return round.phase === 'complete' ? createSlotRound(action.targets) : round;
    default:
      return assertNever(action, 'slot action');
  }
}
