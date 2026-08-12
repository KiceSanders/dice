import { GAME_DEFINITIONS, type GameKind } from '@dice/shared';

/**
 * UI-facing game metadata. Screens use this rather than branching on labels,
 * so adding a room game does not require another URL or landing page.
 */
export const CLIENT_GAMES: Record<GameKind, (typeof GAME_DEFINITIONS)[GameKind]> = GAME_DEFINITIONS;
