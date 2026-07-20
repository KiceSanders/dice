import { DEFAULT_SETTINGS, type RoomSettings } from '@dice/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConnectionStatus from '../components/ConnectionStatus';
import SettingsFields, { fillEmptySettings } from '../components/SettingsFields';
import Toasts from '../components/Toasts';
import { useApp } from '../state/context';
import { loadName, saveName } from '../state/persist';

const ROOM_LIST_REFRESH_MS = 5_000;

/** Home: create a room (with full settings) or join an active room. */
export default function Home() {
  const { state, send, ws } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(loadName() ?? '');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = 'Dice — create or join a room';
  }, []);

  useEffect(() => {
    if (state.connection !== 'open') return;
    ws.send({ type: 'room:list' });
    const refresh = setInterval(() => ws.send({ type: 'room:list' }), ROOM_LIST_REFRESH_MS);
    return () => clearInterval(refresh);
  }, [state.connection, ws]);

  const created = creating && state.roomId !== null;
  const inviteUrl = state.roomId ? `${window.location.origin}/room/${state.roomId}` : '';

  function createRoom(e: FormEvent) {
    e.preventDefault();
    const playerName = name.trim();
    if (!playerName) return;
    saveName(playerName);
    const next = fillEmptySettings(settings);
    setSettings(next);
    if (send({ type: 'room:create', playerName, settings: next })) setCreating(true);
  }

  function joinRoom(roomId: string) {
    const playerName = name.trim();
    if (!playerName) return;
    saveName(playerName);
    navigate(`/room/${roomId}`);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URL is selectable in the input.
    }
  }

  if (created) {
    return (
      <main className="home">
        <Toasts />
        <h1>Room created</h1>
        <section className="card invite-card">
          <p>
            Your room code is <strong className="room-code">{state.roomId}</strong>. Share this link
            with your players:
          </p>
          <div className="invite-row">
            <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <Link className="button-link" to={`/room/${state.roomId}`}>
            Enter room →
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <Toasts />
      <h1>Multiplayer Dice</h1>
      <ConnectionStatus status={state.connection} />

      <label className="field name-field">
        <span>Your name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="display name"
        />
      </label>

      <div className="home-forms">
        <form className="card" onSubmit={createRoom}>
          <h2>Create a room</h2>
          <button type="button" className="link-button" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Hide settings' : 'Customize settings'}
          </button>
          {showSettings && <SettingsFields value={settings} onChange={setSettings} />}
          <button type="submit" disabled={!name.trim() || state.connection !== 'open' || creating}>
            {creating ? 'Creating…' : 'Create room'}
          </button>
        </form>

        <section className="card active-rooms-card">
          <h2>Join a room</h2>
          <p className="muted active-rooms-help">Enter your name, then choose a live game.</p>
          {state.activeRooms === null ? (
            <p className="muted">Loading active rooms…</p>
          ) : state.activeRooms.length === 0 ? (
            <p className="muted">No active rooms yet. Create one to get started.</p>
          ) : (
            <ul className="active-room-list">
              {state.activeRooms.map((room) => (
                <li key={room.roomId}>
                  <button
                    type="button"
                    className="active-room"
                    disabled={!name.trim() || state.connection !== 'open'}
                    onClick={() => joinRoom(room.roomId)}
                  >
                    <span className="active-room-heading">
                      <strong className="room-code">{room.roomId}</strong>
                      <span>{roomLabel(room.phase, room.roundNumber)}</span>
                    </span>
                    <span className="active-room-players">{room.playerNames.join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function roomLabel(phase: 'lobby' | 'playing' | 'roundEnd', roundNumber: number | null): string {
  if (phase === 'lobby' || roundNumber === null) return 'Lobby';
  if (phase === 'roundEnd') return `Round ${roundNumber} complete`;
  return `Round ${roundNumber}`;
}
