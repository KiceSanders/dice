import type { RoomSnapshot } from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import { poseFrameFromCanonical } from '../table3d/seatTransform';
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
  const [live, setLive] = useState(false);
  const [cupInPlay, setCupInPlay] = useState(false);

  const turnPlayerId = snapshot?.game?.currentTurn?.playerId ?? null;
  const remote = turnPlayerId !== null && turnPlayerId !== myId;
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;

  useEffect(() => {
    if (!remote || turnPlayerId === null) {
      feed.clear();
      setLive(false);
      setCupInPlay(false);
      return;
    }
    setLive(false);
    setCupInPlay(false);
    const off = ws.onMessage((msg) => {
      if (msg.type === 'dice:frames' && msg.playerId === turnPlayerId) {
        // Wire frames are canonical table space; the feed (and everything
        // rendered from it) lives in this viewer's view space.
        feed.push(msg.frames.map((f) => poseFrameFromCanonical(f, mySeat)));
        setLive(true);
        // Batches are phase-consistent: held/pour flush with cupVisible true;
        // selecting flushes immediately with cupVisible false.
        setCupInPlay(msg.frames.some((f) => f.cupVisible === true));
      }
      if (msg.type === 'turn:rolled' && msg.playerId === turnPlayerId) {
        setLive(false);
        setCupInPlay(false);
        feed.clear();
      }
    });
    return () => {
      off();
      feed.clear();
    };
  }, [ws, feed, remote, turnPlayerId, mySeat]);

  return {
    feed,
    live: remote && live,
    cupInPlay: remote && cupInPlay,
  };
}
