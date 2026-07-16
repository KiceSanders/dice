import type { RoomSnapshot } from '@dice/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRemotePoseAudioTap } from '../table3d/audio/remotePoseAudio';
import { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import { seatDisplayPlacement } from '../table3d/layout';
import { poseFrameForSeatDisplay } from '../table3d/seatTransform';
import type { WsClient } from '../ws/client';

export interface RemoteRoll {
  feed: RemoteRollFeed;
  /** True while a remote throw is actively streaming dice:frames. */
  live: boolean;
  /**
   * True while the remote roller's streamed cup is in play (held/pouring).
   * Selecting-phase frames keep `live` true with cupVisible:false — use this
   * (not `live`) to hide the spectator parked dock as soon as they grab.
   */
  cupInPlay: boolean;
}

/**
 * Spectator side of pose streaming (ADR 004): subscribes to dice:frames
 * straight off the socket — they arrive at stream rate and must never churn
 * the reducer — and buffers the current roller's frames for RemoteDiceView.
 * `live` is true only during an in-flight throw; after turn:rolled the feed
 * clears and the settled layout comes from the authoritative rest pose on
 * `turn:rolled` / the snapshot (resolveTableRestPose, ADR 005).
 */
export function useRemoteRoll(
  ws: WsClient,
  snapshot: RoomSnapshot | null,
  myId: string | null,
): RemoteRoll {
  const feedRef = useRef<RemoteRollFeed | null>(null);
  if (feedRef.current === null) feedRef.current = new RemoteRollFeed();
  const feed = feedRef.current;
  // Audio side-channel of the same frames: derives impact/rattle cues
  // (spectators have no physics bodies to collide — three-renderer rule).
  const audioTapRef = useRef<ReturnType<typeof createRemotePoseAudioTap> | null>(null);
  if (audioTapRef.current === null) audioTapRef.current = createRemotePoseAudioTap();
  const audioTap = audioTapRef.current;
  const [live, setLive] = useState(false);
  const [cupInPlay, setCupInPlay] = useState(false);

  const turnPlayerId = snapshot?.game?.currentTurn?.playerId ?? null;
  const viewerSeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? null;
  const turnPlayerSeat = snapshot?.players.find((p) => p.id === turnPlayerId)?.seat ?? null;
  const occupiedSeats = snapshot?.players.flatMap((player) =>
    player.seat === null ? [] : [player.seat],
  );
  const occupiedSeatKey = occupiedSeats?.join(',') ?? '';
  const placement = useMemo(() => {
    if (turnPlayerSeat === null) return null;
    const seats = occupiedSeatKey === '' ? [] : occupiedSeatKey.split(',').map(Number);
    return seatDisplayPlacement(seats, viewerSeat, turnPlayerSeat);
  }, [occupiedSeatKey, viewerSeat, turnPlayerSeat]);
  const remote = turnPlayerId !== null && turnPlayerId !== myId && placement !== null;

  useEffect(() => {
    if (!remote || turnPlayerId === null || placement === null) {
      feed.clear();
      audioTap.clear();
      setLive(false);
      setCupInPlay(false);
      return;
    }
    setLive(false);
    setCupInPlay(false);
    const off = ws.onMessage((msg) => {
      if (msg.type === 'dice:frames' && msg.playerId === turnPlayerId) {
        // Wire frames stay on the fixed canonical ring. Presentation rotates
        // the complete throw to the same occupied-card placement used by the
        // seat overlay and spectator parked koozie.
        const viewFrames = msg.frames.map((frame) => poseFrameForSeatDisplay(frame, placement));
        feed.push(viewFrames);
        audioTap.push(viewFrames);
        setLive(true);
        // Batches are phase-consistent: held/pour flush with cupVisible true;
        // selecting flushes immediately with cupVisible false.
        setCupInPlay(msg.frames.some((f) => f.cupVisible === true));
      }
      if (
        (msg.type === 'turn:rolled' || msg.type === 'turn:bonusRolled') &&
        msg.playerId === turnPlayerId
      ) {
        setLive(false);
        setCupInPlay(false);
        feed.clear();
        audioTap.clear();
      }
    });
    return () => {
      off();
      feed.clear();
      audioTap.clear();
    };
  }, [ws, feed, audioTap, remote, turnPlayerId, placement]);

  return {
    feed,
    live: remote && live,
    cupInPlay: remote && cupInPlay,
  };
}
