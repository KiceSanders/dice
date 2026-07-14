import type { Die, GameStatePublic, PlayerPublic, RoomSnapshot, TurnState } from '@dice/shared';
import { DEFAULT_SETTINGS } from '@dice/shared';

/** Stable player ids for the UI playground. */
export const DEV_YOU = 'dev-you';
export const DEV_BOB = 'dev-bob';
export const DEV_CAROL = 'dev-carol';

export type PlaygroundSceneId =
  | 'myTurnFirstRoll'
  | 'myTurnMidTurn'
  | 'myTurnLastRoll'
  | 'spectatorTurn'
  | 'rollToBeat'
  | 'rollToBeatYahtzee'
  | 'subRound'
  | 'waitingForTurn';

export interface PlaygroundScene {
  id: PlaygroundSceneId;
  label: string;
  /** Who the client treats as "me" for controls and highlighting. */
  defaultMyId: string;
  snapshot: RoomSnapshot;
}

function player(
  id: string,
  name: string,
  seat: number,
  opts: Partial<Pick<PlayerPublic, 'chips' | 'isHost' | 'connected'>> = {},
): PlayerPublic {
  return {
    id,
    name,
    seat,
    chips: opts.chips ?? 100,
    connected: opts.connected ?? true,
    isHost: opts.isHost ?? false,
    banned: false,
  };
}

const BASE_PLAYERS: PlayerPublic[] = [
  player(DEV_YOU, 'You', 0, { isHost: true, chips: 142 }),
  player(DEV_BOB, 'Bob', 1, { chips: 98 }),
  player(DEV_CAROL, 'Carol', 2, { chips: 115 }),
];

function baseSnapshot(
  game: GameStatePublic | null,
  phase: RoomSnapshot['phase'] = 'playing',
): RoomSnapshot {
  return {
    roomId: 'DEVPLAY',
    settings: DEFAULT_SETTINGS,
    phase,
    players: BASE_PLAYERS.map((p) => ({ ...p })),
    hostId: DEV_YOU,
    game,
    seatRequests: [],
  };
}

function turn(
  playerId: string,
  opts: {
    dice?: Die[];
    keptIndices?: number[];
    rollsUsed?: number;
    rollCap?: number;
  } = {},
): TurnState {
  return {
    playerId,
    dice: opts.dice ?? [],
    keptIndices: opts.keptIndices ?? [],
    rollsUsed: opts.rollsUsed ?? 0,
    rollCap: opts.rollCap ?? DEFAULT_SETTINGS.maxRolls,
    throwing: false,
    bonusPending: null,
    restPose: null,
  };
}

function baseGame(overrides: Partial<GameStatePublic> = {}): GameStatePublic {
  return {
    roundNumber: 3,
    pot: 12,
    classicPot: 0,
    turnQueue: [DEV_BOB, DEV_CAROL],
    currentTurn: turn(DEV_YOU),
    rollToBeat: null,
    subRound: null,
    ...overrides,
  };
}

export const PLAYGROUND_SCENES: PlaygroundScene[] = [
  {
    id: 'myTurnFirstRoll',
    label: 'My turn — first roll',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(baseGame()),
  },
  {
    id: 'myTurnMidTurn',
    label: 'My turn — mid turn (2 kept)',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        currentTurn: turn(DEV_YOU, {
          dice: [4, 4, 2, 6, 1],
          keptIndices: [0, 1],
          rollsUsed: 1,
        }),
      }),
    ),
  },
  {
    id: 'myTurnLastRoll',
    label: 'My turn — last roll',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        currentTurn: turn(DEV_YOU, {
          dice: [6, 6, 6, 2, 3],
          keptIndices: [0, 1, 2],
          rollsUsed: 2,
          rollCap: 3,
        }),
      }),
    ),
  },
  {
    id: 'spectatorTurn',
    label: "Spectator — Bob's turn",
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        turnQueue: [DEV_CAROL, DEV_YOU],
        currentTurn: turn(DEV_BOB, {
          dice: [3, 3, 5, 5, 1],
          keptIndices: [0, 1],
          rollsUsed: 1,
        }),
      }),
    ),
  },
  {
    id: 'rollToBeat',
    label: 'Roll to beat set',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        pot: 24,
        rollToBeat: {
          playerIds: [DEV_BOB],
          score: { count: 3, face: 5, rollsUsed: 2, straight: 'none' },
          dice: [5, 5, 5, 2, 1],
          restPose: null,
        },
        currentTurn: turn(DEV_YOU, {
          dice: [2, 2, 4, 6, 1],
          keptIndices: [0, 1],
          rollsUsed: 1,
        }),
      }),
    ),
  },
  {
    id: 'rollToBeatYahtzee',
    label: 'Roll to beat Yahtzee',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        pot: 24,
        rollToBeat: {
          playerIds: [DEV_BOB],
          score: { count: 5, face: 2, rollsUsed: 2, straight: 'none' },
          dice: [2, 2, 2, 2, 1],
          restPose: null,
        },
        currentTurn: turn(DEV_YOU, {
          dice: [5, 5, 5, 3, 1],
          keptIndices: [0, 1, 2],
          rollsUsed: 1,
        }),
      }),
    ),
  },
  {
    id: 'subRound',
    label: 'Sub-round tie-breaker',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        pot: 48,
        subRound: { depth: 1, participantIds: [DEV_YOU, DEV_BOB], anteAmount: 2 },
        turnQueue: [DEV_BOB],
        currentTurn: turn(DEV_YOU, {
          dice: [1, 2, 3, 4, 5],
          keptIndices: [],
          rollsUsed: 1,
        }),
      }),
    ),
  },
  {
    id: 'waitingForTurn',
    label: 'Between turns',
    defaultMyId: DEV_YOU,
    snapshot: baseSnapshot(
      baseGame({
        currentTurn: null,
        turnQueue: [DEV_BOB, DEV_CAROL, DEV_YOU],
      }),
    ),
  },
];

export function sceneById(id: string): PlaygroundScene {
  return PLAYGROUND_SCENES.find((s) => s.id === id) ?? PLAYGROUND_SCENES[0]!;
}

/** Deep-clone a scene snapshot so local sim can mutate it freely. */
export function cloneScene(scene: PlaygroundScene): PlaygroundScene {
  return {
    ...scene,
    snapshot: structuredClone(scene.snapshot),
  };
}
