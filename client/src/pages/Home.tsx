import { DEFAULT_SETTINGS, type RoomSettings } from '@dice/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConnectionStatus from '../components/ConnectionStatus';
import SettingsFields, { fillEmptySettings } from '../components/SettingsFields';
import Toasts from '../components/Toasts';
import { useApp } from '../state/context';
import { loadName, saveName } from '../state/persist';

/** Home: create a room (with full settings) or join one by code. */
export default function Home() {
  const { state, send } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(loadName() ?? '');
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = 'Dice — create or join a room';
  }, []);

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

  function joinRoom(e: FormEvent) {
    e.preventDefault();
    const playerName = name.trim();
    const roomId = code.trim().toUpperCase();
    if (!playerName || !roomId) return;
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

        <form className="card" onSubmit={joinRoom}>
          <h2>Join a room</h2>
          <label className="field">
            <span>Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              placeholder="e.g. A7K2QF"
            />
          </label>
          <button type="submit" disabled={!name.trim() || !code.trim()}>
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
