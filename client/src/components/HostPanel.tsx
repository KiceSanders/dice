import type { RoomSnapshot } from '@dice/shared';
import { useApp } from '../state/context';

/** Host-only: pending seat requests and seated-player management (kick). */
export default function HostPanel({ snapshot }: { snapshot: RoomSnapshot }) {
  const { send, state } = useApp();
  const connected = state.connection === 'open';
  const nameOf = (id: string) => snapshot.players.find((p) => p.id === id)?.name ?? id;
  const seated = snapshot.players.filter((p) => p.seat !== null && p.id !== snapshot.hostId);
  if (snapshot.seatRequests.length === 0 && seated.length === 0) return null;

  return (
    <section className="card host-panel">
      {snapshot.seatRequests.length > 0 && (
        <>
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
        </>
      )}
      {seated.length > 0 && (
        <>
          <h3>Players</h3>
          <ul className="request-list">
            {seated.map((p) => (
              <li key={p.id}>
                <span>
                  <span className={`conn-dot ${p.connected ? 'conn-on' : 'conn-off'}`} />{' '}
                  <strong>{p.name}</strong> · {p.chips} chips
                </span>
                <button
                  type="button"
                  className="kick-button"
                  disabled={!connected}
                  onClick={() => send({ type: 'player:kick', playerId: p.id })}
                >
                  Kick
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
