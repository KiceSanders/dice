import type { BetALotFireState, BodyPose, Die, PlayerId } from '@dice/shared';
import type { BetALotPaidEvent } from './payments.js';

export type BetALotEvent =
  | { type: 'throwStarted'; playerId: PlayerId; diceCount: number; rung: number; extra: boolean }
  | {
      type: 'rolled';
      playerId: PlayerId;
      dice: Die[];
      score: number;
      rung: number;
      restPose: BodyPose[] | null;
    }
  | {
      type: 'extraRolled';
      playerId: PlayerId;
      die: Die;
      target: Die;
      matched: boolean;
      sourceDiceCount: number;
      restPose: BodyPose[] | null;
    }
  | BetALotPaidEvent
  | { type: 'roundEnded'; winnerId: PlayerId; loserId: PlayerId; amount: number }
  | { type: 'fireChanged'; fire: BetALotFireState[] }
  | { type: 'stateChanged' }
  | { type: 'gameEnded'; reason: string };
