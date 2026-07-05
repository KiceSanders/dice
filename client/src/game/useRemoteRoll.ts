import type { PoseFrame, RoomSnapshot } from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import { poseFrameFromCanonical } from '../table3d/seatTransform';
import type { WsClient } from '../ws/client';

export interface RemoteRoll {
  feed: RemoteRollFeed;
  /** True once the current remote turn has streamed at least one frame. */
  live: boolean;
  /** Last sampled remote table pose, preserved after a turn switch. */
  heldPose: PoseFrame | null;
}

/**
 * Spectator side of pose streaming (ADR 004): subscribes to dice:frames
 * straight off the socket — they arrive at stream rate and must never churn
 * the reducer — and buffers the current roller's frames for RemoteDiceView.
 * `live` distinguishes "watching a streamed throw" from "no stream this turn"
 * (mid-turn join, stream loss), where the caller falls back to passive dice.
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
  const [heldPose, setHeldPose] = useState<PoseFrame | null>(null);

  const turnPlayerId = snapshot?.game?.currentTurn?.playerId ?? null;
  const remote = turnPlayerId !== null && turnPlayerId !== myId;
  const mySeat = snapshot?.players.find((p) => p.id === myId)?.seat ?? 0;

  useEffect(() => {
    if (!remote || turnPlayerId === null) {
      feed.clear();
      setLive(false);
      return;
    }
    setLive(false);
    const off = ws.onMessage((msg) => {
      if (msg.type === 'dice:frames' && msg.playerId === turnPlayerId) {
        // Wire frames are canonical table space; the feed (and everything
        // rendered from it) lives in this viewer's view space.
        feed.push(msg.frames.map((f) => poseFrameFromCanonical(f, mySeat)));
        setLive(true);
        setHeldPose(null);
      }
    });
    return () => {
      off();
      const sample = feed.sample(performance.now(), 0);
      if (sample && !sample.cupVisible) {
        setHeldPose({ t: 0, bodies: sample.bodies, cupVisible: sample.cupVisible });
      }
      feed.clear();
    };
  }, [ws, feed, remote, turnPlayerId, mySeat]);

  return { feed, live: remote && live, heldPose };
}
