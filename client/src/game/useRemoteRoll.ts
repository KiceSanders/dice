import type { PoseFrame, RoomSnapshot } from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import { type CapturedRollPose, poseFrameMatchesDice } from '../table3d/dice/staticPose';
import { poseFrameFromCanonical } from '../table3d/seatTransform';
import type { WsClient } from '../ws/client';

export interface RemoteRoll {
  feed: RemoteRollFeed;
  /** True while a remote throw is actively streaming dice:frames. */
  live: boolean;
  /** Last settled remote roll pose, tagged with turn:rolled identity. */
  heldRollPose: CapturedRollPose | null;
}

/**
 * Spectator side of pose streaming (ADR 004): subscribes to dice:frames
 * straight off the socket — they arrive at stream rate and must never churn
 * the reducer — and buffers the current roller's frames for RemoteDiceView.
 * `live` is true only during an in-flight throw; after turn:rolled the feed
 * clears and a tagged held pose preserves the settled layout for StaticDiceView.
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
  const [held, setHeld] = useState<CapturedRollPose | null>(null);

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
        setHeld(null);
      }
      if (msg.type === 'turn:rolled' && msg.playerId === turnPlayerId) {
        setLive(false);
        const sample = feed.sample(performance.now(), 0);
        if (sample && !sample.cupVisible) {
          const frame: PoseFrame = {
            t: 0,
            bodies: sample.bodies,
            cupVisible: sample.cupVisible,
          };
          if (poseFrameMatchesDice(frame, msg.dice)) {
            setHeld({
              frame,
              at: performance.now(),
              rollId: { playerId: msg.playerId, rollNumber: msg.rollNumber },
            });
          }
        }
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
    heldRollPose: held,
  };
}
