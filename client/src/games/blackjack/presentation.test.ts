import {
  type BlackjackStatePublic,
  DEFAULT_BLACKJACK_SETTINGS,
  REST_POSE_BOUNDS,
  type RoomSnapshot,
  readPolyhedralTopFace,
} from '@dice/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Seat from '../../components/Seat';
import { keptDieRailPosition } from '../../table3d/dice/diceLayout';
import { projectToNdc } from '../../table3d/project';
import { BlackjackRoundStatus } from './BlackjackHud';
import {
  BLACKJACK_DIE_EXTENT,
  blackjackHandStatus,
  blackjackRailFrames,
  blackjackRailPosition,
} from './presentation';

const game: BlackjackStatePublic = {
  kind: 'blackjack',
  roundNumber: 1,
  overtime: 1,
  payout: 20,
  dieSides: 12,
  openerId: 'a',
  currentPlayerId: 'b',
  turnNumber: 4,
  throwing: false,
  resolving: false,
  awaitingDecision: true,
  hands: [
    { playerId: 'a', dice: [12, 6], total: 18, stood: true },
    { playerId: 'b', dice: [11, 5], total: 16, stood: false },
  ],
  tableDie: { playerId: 'b', die: 5, restPose: null },
  result: null,
};
function snapshot(state = game): RoomSnapshot {
  return {
    roomId: 'ROOM',
    settings: DEFAULT_BLACKJACK_SETTINGS,
    phase: 'playing',
    hostId: 'a',
    game: state,
    seatRequests: [],
    players: ['a', 'b'].map((id, seat) => ({
      id,
      seat,
      name: id.toUpperCase(),
      chips: 100,
      connected: true,
      isHost: seat === 0,
      banned: false,
    })),
  };
}

describe('blackjack table presentation', () => {
  it('uses the existing kept-die positions for ordinary hands', () => {
    for (let count = 1; count <= 6; count++)
      for (let i = 0; i < count; i++) {
        expect(blackjackRailPosition(i, count)).toEqual(keptDieRailPosition(i, count));
      }
  });
  it('keeps every die visible, in bounds, and on its owning side for both players and a spectator', () => {
    for (let count = 1; count <= 21; count++) {
      const state = {
        ...game,
        hands: game.hands.map((hand) => ({ ...hand, dice: Array(count).fill(1), total: count })),
        tableDie: null,
      };
      for (const viewer of ['a', 'b', null]) {
        const frames = blackjackRailFrames(state, snapshot(state), viewer);
        expect(frames).toHaveLength(2);
        for (const frame of frames) {
          expect(frame.bodies).toHaveLength(count + 1);
          for (const pose of frame.bodies.slice(1)) {
            expect(Math.hypot(pose[0], pose[2])).toBeLessThan(REST_POSE_BOUNDS.maxRadius);
            for (const dx of [-BLACKJACK_DIE_EXTENT, BLACKJACK_DIE_EXTENT]) {
              for (const dy of [-BLACKJACK_DIE_EXTENT, BLACKJACK_DIE_EXTENT]) {
                for (const dz of [-BLACKJACK_DIE_EXTENT, BLACKJACK_DIE_EXTENT]) {
                  const ndc = projectToNdc([pose[0] + dx, pose[1] + dy, pose[2] + dz]);
                  expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
                  expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
                }
              }
            }
            expect(readPolyhedralTopFace([pose[3], pose[4], pose[5], pose[6]], 12)).toBe(1);
          }
        }
      }
    }
  });
  it('never duplicates the latest die on the rail while it is still on the felt', () => {
    const frames = blackjackRailFrames(game, snapshot(), 'a');
    expect(frames.map((frame) => frame.bodies.length - 1)).toEqual([2, 1]);
    expect(
      blackjackRailFrames({ ...game, tableDie: null }, snapshot(), 'a').map(
        (f) => f.bodies.length - 1,
      ),
    ).toEqual([2, 2]);
  });
  it('shows persistent scores, standing and overtime in the shared seat and round UI', () => {
    const html = renderToStaticMarkup(
      createElement(Seat, {
        seatIndex: 0,
        player: snapshot().players[0]!,
        isMe: true,
        score: { total: 18, status: blackjackHandStatus(game, 'a') },
      }),
    );
    expect(html).toContain('18');
    expect(html).toContain('Standing');
    expect(html).toContain('/ 21');
    const status = renderToStaticMarkup(
      createElement(BlackjackRoundStatus, { snapshot: snapshot() }),
    );
    expect(status).toContain('Overtime 1');
    expect(status).toContain('20 chips');
    expect(status).toContain('12');
  });
});
