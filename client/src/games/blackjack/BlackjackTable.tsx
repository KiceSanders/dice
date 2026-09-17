import { isBlackjackState, type RoomSnapshot } from '@dice/shared';
import Table from '../../components/Table';
import type { RemoteRoll } from '../../game/useRemoteRoll';
import { useApp } from '../../state/context';
import { useBlackjackTableRoll } from './useBlackjackTableRoll';

export default function BlackjackTable({
  snapshot,
  myId,
  remoteRoll,
}: {
  snapshot: RoomSnapshot;
  myId: string;
  remoteRoll: RemoteRoll;
}) {
  const { state, send } = useApp();
  const roll = useBlackjackTableRoll(snapshot, myId, send, state.connection === 'open');
  const game = isBlackjackState(snapshot.game) ? snapshot.game : null;
  return (
    <Table
      snapshot={snapshot}
      myId={myId}
      connection={state.connection}
      winnerId={game?.result?.winnerId}
      dice={roll.tableDice}
      diceCount={1}
      remoteFeed={remoteRoll.live && !game?.tableDie ? remoteRoll.feed : undefined}
      heldPose={roll.heldPose}
      parkedKoozieAngle={remoteRoll.cupInPlay ? null : roll.parkedKoozieAngle}
      diceAiming={roll.dragging}
    />
  );
}
