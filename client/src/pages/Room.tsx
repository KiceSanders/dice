// biome-ignore-all lint/a11y/noAutofocus: the join form's name field is this page's single purpose
import { detectStraight, type PlayerPublic, type RoomSnapshot } from '@dice/shared';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ChatPanel from '../components/ChatPanel';
import ConnectionBanner from '../components/ConnectionBanner';
import ConnectionStatus from '../components/ConnectionStatus';
import GameArea from '../components/GameArea';
import HostPanel from '../components/HostPanel';
import RoundEndModal from '../components/RoundEndModal';
import SettingsPanel from '../components/SettingsPanel';
import Table from '../components/Table';
import Toasts from '../components/Toasts';
import { useRemoteRoll } from '../game/useRemoteRoll';
import { useTableRoll } from '../game/useTableRoll';
import { useApp } from '../state/context';
import { loadIdentity, loadName, saveName } from '../state/persist';
import { pickHeldRollInput, resolveTableRestPose } from '../table3d/dice/staticPose';
import { tableEvents } from '../table3d/tableEvents';

const ROUND_END_REVEAL_DELAY_MS = 3_000;

export default function Room() {
  const { roomId = '' } = useParams();
  const { state, send, dispatch, ws } = useApp();
  const [name, setName] = useState(loadName() ?? '');
  const [nameConfirmed, setNameConfirmed] = useState(() => Boolean(loadName()));
  const [copied, setCopied] = useState(false);
  const [revealedRoundEndAt, setRevealedRoundEndAt] = useState<number | null>(null);
  const emittedAnteAtRef = useRef<number | null>(null);
  const emittedAwardAtRef = useRef<number | null>(null);

  const alreadyInRoom = state.roomId === roomId && state.me !== null;
  const joinSentRef = useRef(false);
  const connected = state.connection === 'open';
  const snapshot = state.snapshot;

  // 3D physics roll for the active roller; streamed playback of everyone
  // else's throws, with StaticDiceView for the last settled roll (ADR 004).
  const roll3d = useTableRoll(state.snapshot, state.me?.playerId ?? null, send, connected);
  const remoteRoll = useRemoteRoll(ws, state.snapshot, state.me?.playerId ?? null);
  // Settled dice on the felt: one resolver for every viewer (ADR 005) — the
  // server-validated rest pose from turn:rolled or the snapshot (rejoins),
  // with the values-only slot layout as the observable last resort.
  const mySeatForPose = snapshot?.players.find((p) => p.id === state.me?.playerId)?.seat ?? 0;
  const heldPose = useMemo(() => {
    const input = pickHeldRollInput(state.lastRoll, snapshot?.game ?? null);
    return input ? resolveTableRestPose(input, mySeatForPose).frame : null;
  }, [state.lastRoll, snapshot?.game, mySeatForPose]);
  // Straight celebration for spectator views (the roller's own glow fires
  // locally at settle): announced on the table event bus, stamped with the
  // wire receive time so late-mounting views can judge freshness.
  useEffect(() => {
    const roll = state.lastRoll;
    if (!roll || detectStraight(roll.dice) === 'none') return;
    tableEvents.emit({ type: 'straight', dice: roll.dice }, roll.receivedAt);
  }, [state.lastRoll]);

  useEffect(() => {
    const ante = state.lastAnte;
    if (!ante || emittedAnteAtRef.current === ante.receivedAt) return;
    emittedAnteAtRef.current = ante.receivedAt;
    const contributions = ante.contributions.filter((entry) => entry.amount > 0);
    if (contributions.length === 0) return;
    tableEvents.emit(
      {
        type: 'chips-to-pot',
        contributions,
        potBefore: ante.potBefore,
      },
      ante.receivedAt,
    );
  }, [state.lastAnte]);

  useEffect(() => {
    const roundEnd = state.roundEnd;
    if (
      !roundEnd?.winnerId ||
      roundEnd.potWon <= 0 ||
      emittedAwardAtRef.current === roundEnd.receivedAt
    ) {
      return;
    }
    emittedAwardAtRef.current = roundEnd.receivedAt;
    tableEvents.emit(
      {
        type: 'pot-to-winner',
        winnerId: roundEnd.winnerId,
        amount: roundEnd.potWon,
      },
      roundEnd.receivedAt,
    );
  }, [state.roundEnd]);

  useEffect(() => {
    const receivedAt = state.roundEnd?.receivedAt ?? null;
    if (receivedAt === null) {
      setRevealedRoundEndAt(null);
      return;
    }
    setRevealedRoundEndAt(null);
    const timer = window.setTimeout(() => {
      setRevealedRoundEndAt(receivedAt);
    }, ROUND_END_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state.roundEnd?.receivedAt]);

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
    const rejoinToken = stored && stored.playerName === playerName ? stored.rejoinToken : undefined;
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </label>
          <button type="submit" disabled={!name.trim()}>
            Join room
          </button>
        </form>
      </main>
    );
  }

  if (!snapshot || !state.me) {
    return (
      <main className="home">
        <ConnectionBanner />
        <Toasts />
        <h1>Room {roomId}</h1>
        <ConnectionStatus status={state.connection} />
        <p className="muted">
          {state.connection === 'open' ? 'Joining…' : 'Waiting for connection…'}
        </p>
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
  const turn = snapshot.game?.currentTurn ?? null;
  const inGame = snapshot.phase !== 'lobby' && snapshot.game !== null;
  const isMyTurn = turn !== null && turn.playerId === myId;
  // Local DicePhysics already renders the active roller's settled dice — hide
  // the static last-roll layer so dice are not doubled on the felt.
  const localSimShowsLastRoll =
    roll3d.tableDice !== undefined &&
    isMyTurn &&
    turn !== null &&
    turn.rollsUsed > 0 &&
    state.lastRoll?.playerId === myId &&
    state.lastRoll.rollNumber === turn.rollsUsed;
  const showHeldPose =
    inGame &&
    heldPose !== null &&
    !remoteRoll.live &&
    !turn?.throwing &&
    !roll3d.dragging &&
    !roll3d.rolling &&
    !localSimShowsLastRoll;

  // Stand button on the table frame: only for the active 3D roller after their
  // first roll, hidden while aiming so it never fights the drag.
  const standControl =
    roll3d.turnActions && turn && turn.rollsUsed > 0 && !roll3d.dragging
      ? {
          onStand: roll3d.turnActions.onStand,
          canStand: roll3d.turnActions.canStand ?? true,
          hint: roll3d.turnActions.standHint,
          disabled: roll3d.turnActions.disabled,
        }
      : undefined;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main className="room">
      <ConnectionBanner />
      <Toasts />
      <ChatPanel />

      {state.roundEnd && revealedRoundEndAt === state.roundEnd.receivedAt && (
        <RoundEndModal
          roundEnd={state.roundEnd}
          players={snapshot.players}
          onDismiss={() => dispatch({ type: 'dismiss-round-end' })}
        />
      )}

      <Table
        connection={state.connection}
        snapshot={snapshot}
        myId={myId}
        onKick={(playerId) => send({ type: 'player:kick', playerId })}
        winnerId={state.roundEnd?.winnerId ?? null}
        dice={roll3d.tableDice}
        remoteFeed={remoteRoll.live ? remoteRoll.feed : undefined}
        heldPose={showHeldPose ? heldPose : null}
        // Hide the spectator dock as soon as the roller grabs (cupInPlay from
        // streamed cupVisible:true) or the server marks throwing. Selecting-
        // phase frames keep remoteRoll.live true with cupVisible:false — those
        // must leave the parked dock up.
        parkedKoozieDisplaySeat={
          turn?.throwing || remoteRoll.cupInPlay ? null : roll3d.parkedKoozieDisplaySeat
        }
        diceAiming={roll3d.diceAiming}
        onTablePointer={roll3d.onTablePointer}
        stand={standControl}
      />

      {inGame && (
        <GameArea
          snapshot={snapshot}
          myId={myId}
          lastRoll={state.lastRoll}
          hide2DDice
          mouseThrow={roll3d.active}
          pendingKeep={roll3d.pendingKeep}
          onPendingKeepChange={roll3d.setPendingKeep}
          turnActions={roll3d.turnActions}
        />
      )}

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
              {seatedCount < 2 && (
                <small className="muted">Need at least 2 seated players to start.</small>
              )}
            </div>
          ) : (
            <p className="muted">Waiting for the host to start the game…</p>
          ))}

        {me && me.seat === null && (
          <SeatRequest snapshot={snapshot} me={me} pending={myRequest !== null} />
        )}

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

        <section className="card room-info">
          <h3>
            Room <span className="room-code">{snapshot.roomId}</span>
          </h3>
          <div className="room-info-actions">
            <button type="button" className="secondary" onClick={copyInvite}>
              {copied ? 'Link copied!' : 'Copy invite link'}
            </button>
            <ConnectionStatus status={state.connection} />
          </div>
        </section>

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
        <p className="muted">
          You were kicked and cannot request a seat unless the host re-approves you.
        </p>
      </section>
    );
  }

  if (pending) {
    return (
      <section className="card seat-request">
        <p>
          Seat request sent (buy-in {snapshot.seatRequests.find((r) => r.playerId === me.id)?.buyIn}
          ). Waiting for the host…
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
