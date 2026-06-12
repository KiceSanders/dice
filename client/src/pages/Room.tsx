import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PlayerPublic, RoomSnapshot } from '@dice/shared';
import { useApp } from '../state/context';
import { loadIdentity, loadName, saveName } from '../state/persist';
import ConnectionBanner from '../components/ConnectionBanner';
import ConnectionStatus from '../components/ConnectionStatus';
import Table from '../components/Table';
import Toasts from '../components/Toasts';
import HostPanel from '../components/HostPanel';
import SettingsPanel from '../components/SettingsPanel';
import GameArea from '../components/GameArea';
import RoundEndModal from '../components/RoundEndModal';
import BonusBanner from '../components/BonusBanner';
import ChatPanel from '../components/ChatPanel';

export default function Room() {
  const { roomId = '' } = useParams();
  const { state, send, dispatch } = useApp();
  const [name, setName] = useState(loadName() ?? '');
  const [nameConfirmed, setNameConfirmed] = useState(() => Boolean(loadName()));
  const [copied, setCopied] = useState(false);

  const alreadyInRoom = state.roomId === roomId && state.me !== null;
  const joinSentRef = useRef(false);
  const connected = state.connection === 'open';

  useEffect(() => {
    document.title = roomId ? `Room ${roomId} — Dice` : 'Dice';
    return () => {
      document.title = 'Dice';
    };
  }, [roomId]);

  // Join once we're connected and have a display name (skip if already in,
  // e.g. we just created this room — reconnect rejoins are handled by WsClient).
  useEffect(() => {
    if (!roomId || alreadyInRoom || !nameConfirmed || state.connection !== 'open') return;
    if (joinSentRef.current) return;
    const playerName = name.trim() || 'Player';
    // Only reclaim a stored identity when the display name still matches — otherwise
    // a second tab with a different name would steal the first player's seat.
    const stored = loadIdentity(roomId);
    const rejoinToken =
      stored && stored.playerName === playerName ? stored.rejoinToken : undefined;
    const ok = send({
      type: 'room:join',
      roomId,
      playerName,
      rejoinToken,
    });
    if (ok) joinSentRef.current = true;
  }, [roomId, alreadyInRoom, nameConfirmed, state.connection, name, send]);

  if (state.joinError) {
    return (
      <main className="home">
        <h1>Room not found</h1>
        <p>
          <code>{roomId}</code> — {state.joinError.message}
        </p>
        <Link to="/">Back home</Link>
      </main>
    );
  }

  if (!nameConfirmed) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      saveName(name.trim());
      setNameConfirmed(true);
    };
    return (
      <main className="home">
        <h1>Joining {roomId}</h1>
        <form className="card" onSubmit={submit}>
          <label className="field">
            <span>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus />
          </label>
          <button type="submit" disabled={!name.trim()}>
            Join room
          </button>
        </form>
      </main>
    );
  }

  const snapshot = state.snapshot;
  if (!snapshot || !state.me) {
    return (
      <main className="home">
        <ConnectionBanner />
        <Toasts />
        <h1>Room {roomId}</h1>
        <ConnectionStatus status={state.connection} />
        <p className="muted">{state.connection === 'open' ? 'Joining…' : 'Waiting for connection…'}</p>
      </main>
    );
  }

  const myId = state.me.playerId;
  const me = snapshot.players.find((p) => p.id === myId) ?? null;
  const isHost = snapshot.hostId === myId;
  const seatedCount = snapshot.players.filter((p) => p.seat !== null).length;
  const spectators = snapshot.players.filter((p) => p.seat === null);
  const myRequest = snapshot.seatRequests.find((r) => r.playerId === myId) ?? null;
  const inviteUrl = `${window.location.origin}/room/${snapshot.roomId}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  const inGame = snapshot.phase !== 'lobby' && snapshot.game !== null;

  return (
    <main className="room">
      <ConnectionBanner />
      <Toasts />
      <ChatPanel />

      {state.bonus && (
        <BonusBanner
          bonus={state.bonus}
          players={snapshot.players}
          onDismiss={() => dispatch({ type: 'dismiss-bonus' })}
        />
      )}

      {state.roundEnd && (
        <RoundEndModal
          roundEnd={state.roundEnd}
          players={snapshot.players}
          onDismiss={() => dispatch({ type: 'dismiss-round-end' })}
        />
      )}

      <header className="room-header">
        <h1>
          Room <span className="room-code">{snapshot.roomId}</span>
        </h1>
        <div className="room-header-actions">
          <button type="button" className="secondary" onClick={copyInvite}>
            {copied ? 'Link copied!' : 'Copy invite link'}
          </button>
          <ConnectionStatus status={state.connection} />
        </div>
      </header>

      <Table
        snapshot={snapshot}
        myId={myId}
        onKick={(playerId) => send({ type: 'player:kick', playerId })}
        winnerId={state.roundEnd?.winnerId ?? null}
      />

      {inGame && <GameArea snapshot={snapshot} myId={myId} lastRoll={state.lastRoll} />}

      <section className="room-controls">
        {snapshot.phase === 'lobby' &&
          (isHost ? (
            <div className="start-area">
              <button
                type="button"
                className="start-button"
                disabled={seatedCount < 2 || !connected}
                onClick={() => send({ type: 'game:start' })}
              >
                Start game
              </button>
              {seatedCount < 2 && <small className="muted">Need at least 2 seated players to start.</small>}
            </div>
          ) : (
            <p className="muted">Waiting for the host to start the game…</p>
          ))}

        {me && me.seat === null && <SeatRequest snapshot={snapshot} me={me} pending={myRequest !== null} />}

        {isHost && <HostPanel snapshot={snapshot} />}

        {spectators.length > 0 && (
          <section className="card spectators">
            <h3>Spectators</h3>
            <ul className="spectator-list">
              {spectators.map((p) => (
                <li key={p.id}>
                  <span className={`conn-dot ${p.connected ? 'conn-on' : 'conn-off'}`} />
                  {p.name}
                  {p.id === myId && <span className="muted"> (you)</span>}
                  {p.isHost && <span className="badge badge-host">★</span>}
                  {p.banned && <span className="badge badge-banned">banned</span>}
                  {isHost && p.id !== myId && !p.banned && (
                    <button
                      type="button"
                      className="kick-button"
                      onClick={() => send({ type: 'player:kick', playerId: p.id })}
                    >
                      Kick
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <SettingsPanel snapshot={snapshot} isHost={isHost} />
      </section>

      <details className="snapshot-debug-wrap">
        <summary>Room snapshot (debug)</summary>
        <pre className="snapshot-debug">{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </main>
  );
}

/** Spectator-side seat flow: request with buy-in, pending and banned states. */
function SeatRequest({
  snapshot,
  me,
  pending,
}: {
  snapshot: RoomSnapshot;
  me: PlayerPublic;
  pending: boolean;
}) {
  const { send, state } = useApp();
  const { minBuyIn, maxBuyIn } = snapshot.settings;
  const [buyIn, setBuyIn] = useState(minBuyIn);
  const connected = state.connection === 'open';

  if (me.banned) {
    return (
      <section className="card seat-request">
        <p className="muted">You were kicked and cannot request a seat unless the host re-approves you.</p>
      </section>
    );
  }

  if (pending) {
    return (
      <section className="card seat-request">
        <p>
          Seat request sent (buy-in {snapshot.seatRequests.find((r) => r.playerId === me.id)?.buyIn}).
          Waiting for the host…
        </p>
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send({ type: 'seat:request', buyIn });
  };

  return (
    <form className="card seat-request" onSubmit={submit}>
      <h3>Take a seat</h3>
      <label className="field">
        <span>
          Buy-in ({minBuyIn}–{maxBuyIn} chips)
        </span>
        <input
          type="number"
          min={minBuyIn}
          max={maxBuyIn}
          value={buyIn}
          onChange={(e) => setBuyIn(Number(e.target.value))}
        />
      </label>
      <button
        type="submit"
        disabled={!connected || !Number.isInteger(buyIn) || buyIn < minBuyIn || buyIn > maxBuyIn}
      >
        Request seat
      </button>
    </form>
  );
}
