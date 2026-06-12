import type { RoomSnapshot } from '@dice/shared';
import { useApp } from '../state/context';

/** Host-only: pending seat requests with approve/deny controls. */
export default function HostPanel({ snapshot }: { snapshot: RoomSnapshot }) {
  const { send, state } = useApp();
  const connected = state.connection === 'open';
  if (snapshot.seatRequests.length === 0) return null;

  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? id;

  return (
    <section className="card host-panel">
      <h3>Seat requests</h3>
      <ul className="request-list">
        {snapshot.seatRequests.map((req) => (
          <li key={req.playerId}>
            <span>
              <strong>{nameOf(req.playerId)}</strong> · buy-in {req.buyIn}
            </span>
            <span className="request-actions">
              <button
                type="button"
                disabled={!connected}
                onClick={() => send({ type: 'seat:approve', playerId: req.playerId })}
              >
                Approve
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!connected}
                onClick={() => send({ type: 'seat:deny', playerId: req.playerId })}
              >
                Deny
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
