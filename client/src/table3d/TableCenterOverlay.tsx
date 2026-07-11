import type { RoomSnapshot } from '@dice/shared';
import { projectTableCenter } from './project';

interface Props {
  snapshot: RoomSnapshot;
  aspect: number;
}

/** Lobby room label at the center of the felt; active play keeps the felt text-free. */
export default function TableCenterOverlay({ snapshot, aspect }: Props) {
  if (snapshot.game) return null;
  const { leftPct, topPct } = projectTableCenter(aspect);

  return (
    <div
      className="table-center-overlay"
      style={{ left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="table-center table-center-3d">
        <span className="table-room-id">{snapshot.roomId}</span>
        <span className="table-phase">waiting to start</span>
      </div>
    </div>
  );
}
