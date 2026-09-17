import {
  type BlackjackStatePublic,
  type BodyPose,
  type PoseFrame,
  polyhedralFaceUp,
  type RoomSnapshot,
} from '@dice/shared';
import { DICE_FELT_Y, DIE_SIZE } from '../../table3d/dice/constants';
import { KEPT_DIE_SPACING, keptDieRailPosition } from '../../table3d/dice/diceLayout';
import { seatDisplayPlacement } from '../../table3d/layout';
import { poseFrameForSeatDisplay, poseFrameToCanonical } from '../../table3d/seatTransform';

/** Use the existing kept-dice rail; long hands wrap into adjacent rows. */
export function blackjackRailPosition(index: number, count: number): [number, number, number] {
  if (count <= 6) return keptDieRailPosition(index, count);
  const perRow = 7;
  const row = Math.floor(index / perRow);
  const rowCount = Math.min(perRow, count - row * perRow);
  const position = keptDieRailPosition(index % perRow, rowCount);
  // Extra rows sit immediately inside the rail so all 21 possible dice remain visible.
  position[2] -= row * KEPT_DIE_SPACING;
  if (row > 1) {
    position[1] = DICE_FELT_Y;
    position[2] -= DIE_SIZE;
  }
  return position;
}

export function blackjackRailFrames(
  game: BlackjackStatePublic,
  snapshot: RoomSnapshot,
  myId: string | null,
): PoseFrame[] {
  const viewerSeat = snapshot.players.find((p) => p.id === myId)?.seat ?? null;
  const occupied = snapshot.players.flatMap((p) => (p.seat === null ? [] : [p.seat]));
  return game.hands.flatMap((hand) => {
    const seat = snapshot.players.find((p) => p.id === hand.playerId)?.seat;
    if (seat == null) return [];
    const placement = seatDisplayPlacement(occupied, viewerSeat, seat);
    if (!placement) return [];
    const dice = game.tableDie?.playerId === hand.playerId ? hand.dice.slice(0, -1) : hand.dice;
    const bodies: BodyPose[] = dice.map((die, index) => [
      ...blackjackRailPosition(index, dice.length),
      ...polyhedralFaceUp(die, game.dieSides),
    ]);
    const frame: PoseFrame = {
      t: 0,
      cupVisible: false,
      bodies: [[0, 0, 0, 0, 0, 0, 1], ...bodies],
    };
    return [poseFrameForSeatDisplay(poseFrameToCanonical(frame, seat), placement)];
  });
}

export function blackjackHandStatus(game: BlackjackStatePublic, playerId: string): string {
  const hand = game.hands.find((entry) => entry.playerId === playerId);
  if (!hand) return 'Waiting';
  if (game.resolving && game.tableDie?.playerId === playerId) return 'Rolled';
  if (hand.total > 21) return 'Bust';
  if (game.result?.winnerId === playerId) return 'Winner';
  if (hand.stood) return 'Standing';
  if (game.currentPlayerId === playerId)
    return game.awaitingDecision ? 'Stand or continue' : 'Rolling';
  return 'In play';
}

export const BLACKJACK_DIE_EXTENT = DIE_SIZE * 0.7;
