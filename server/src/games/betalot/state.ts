import type {
  BetALotLadderRoll,
  BetALotRoundResult,
  BetALotSettings,
  BetALotStatePublic,
  BodyPose,
  Die,
  PlayerId,
} from '@dice/shared';
import type { BetALotPayments } from './payments.js';

export type BetALotPhase = 'playing' | 'roundEnd' | 'ended';

export interface BetALotExtraRollState {
  playerId: PlayerId;
  face: Die;
  sourceDiceCount: number;
  settledDie: Die | null;
  basePayout: number;
}

export interface BetALotPersistedState {
  publicState: BetALotStatePublic;
  phase: BetALotPhase;
  rung: number;
  extraRoll: BetALotExtraRollState | null;
  pendingSettings: BetALotSettings | null;
}

export function clonePose(restPose?: BodyPose[]): BodyPose[] | null {
  return restPose?.map((pose) => [...pose] as BodyPose) ?? null;
}

export function cloneLadder(ladder: BetALotLadderRoll[]): BetALotLadderRoll[] {
  return ladder.map((roll) => ({
    ...roll,
    dice: [...roll.dice],
    restPose: clonePose(roll.restPose ?? undefined),
  }));
}

export function buildPublicState(input: {
  roundNumber: number;
  payments: BetALotPayments;
  openerId: string;
  currentPlayerId: string | null;
  rung: number;
  pendingCall: BetALotStatePublic['pendingCall'];
  throwing: boolean;
  resolving: boolean;
  extraRoll: BetALotExtraRollState | null;
  ladder: BetALotLadderRoll[];
  roundHistory: BetALotRoundResult[];
}): BetALotStatePublic {
  return {
    kind: 'betalot',
    roundNumber: input.roundNumber,
    sevensPot: input.payments.sevensPot,
    openerId: input.openerId,
    currentPlayerId: input.currentPlayerId,
    currentDiceCount: input.extraRoll ? 1 : input.rung,
    awaitingCall: input.rung === 1 && input.ladder.length === 0 && input.pendingCall === null,
    pendingCall: input.pendingCall,
    throwing: input.throwing,
    resolving: input.resolving,
    extraRoll: input.extraRoll
      ? {
          playerId: input.extraRoll.playerId,
          face: input.extraRoll.face,
          sourceDiceCount: input.extraRoll.sourceDiceCount,
        }
      : null,
    ladder: cloneLadder(input.ladder),
    roundHistory: input.roundHistory.map((round) => ({ ...round })),
    fire: input.payments.fireState(),
  };
}

function withRoundHistory(publicState: BetALotStatePublic): BetALotStatePublic {
  return {
    ...publicState,
    // Recovery compatibility for snapshots written before round history was
    // promoted from transient client state into the authoritative game state.
    roundHistory: publicState.roundHistory?.map((round) => ({ ...round })) ?? [],
  };
}

export function readPersistedState(
  state: BetALotPersistedState | BetALotStatePublic,
  fallbackSettings: BetALotSettings,
): {
  publicState: BetALotStatePublic;
  phase: BetALotPhase;
  rung: number;
  extraRoll: BetALotExtraRollState | null;
  pendingSettings: BetALotSettings | null;
} {
  if ('publicState' in state) {
    return { ...state, publicState: withRoundHistory(state.publicState) };
  }
  return {
    publicState: withRoundHistory(state),
    phase: state.currentPlayerId === null ? 'roundEnd' : 'playing',
    rung: state.extraRoll ? state.extraRoll.sourceDiceCount : state.currentDiceCount,
    extraRoll: state.extraRoll
      ? {
          ...state.extraRoll,
          settledDie: null,
          basePayout: 0,
        }
      : null,
    pendingSettings: state.resolving ? fallbackSettings : null,
  };
}
