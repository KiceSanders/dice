import { useEffect, useRef, useState } from 'react';
import type { RoomSnapshot } from '@dice/shared';
import { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import type { WsClient } from '../ws/client';

export interface RemoteRoll {
  feed: RemoteRollFeed;
  /** True once the current remote turn has streamed at least one frame. */
  live: boolean;
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

  const turnPlayerId = snapshot?.game?.currentTurn?.playerId ?? null;
  const remote = turnPlayerId !== null && turnPlayerId !== myId;

  useEffect(() => {
    if (!remote || turnPlayerId === null) {
      feed.clear();
      setLive(false);
      return;
    }
    setLive(false);
    const off = ws.onMessage((msg) => {
      if (msg.type === 'dice:frames' && msg.playerId === turnPlayerId) {
        feed.push(msg.frames);
        setLive(true);
      }
    });
    return () => {
      off();
      feed.clear();
    };
  }, [ws, feed, remote, turnPlayerId]);

  return { feed, live: remote && live };
}
