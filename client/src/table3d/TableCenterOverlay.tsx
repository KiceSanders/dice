import type { RoomSnapshot } from '@dice/shared';
import { projectTableCenter } from './project';

interface Props {
  snapshot: RoomSnapshot;
  aspect: number;
}

/** Pot / round label at the center of the felt (2D overlay). */
export default function TableCenterOverlay({ snapshot, aspect }: Props) {
  const game = snapshot.game;
  const { leftPct, topPct } = projectTableCenter(aspect);

  return (
    <div
      className="table-center-overlay"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="table-center table-center-3d">
        {game ? (
          <>
            <span className="table-pot">Pot {game.pot}</span>
            <span className="table-phase">round {game.roundNumber}</span>
          </>
        ) : (
          <>
            <span className="table-room-id">{snapshot.roomId}</span>
            <span className="table-phase">waiting to start</span>
          </>
        )}
      </div>
    </div>
  );
}
