import type { Die, PlayerId } from '@dice/shared';
import { useEffect, useRef } from 'react';

/**
 * Table event vocabulary — one-shot things that happened on the table which
 * visuals may react to. Adding an effect (animation, celebration, chip move)
 * means adding a member here, emitting it where the game state changes, and
 * subscribing with useTableEvent in ONE effect component — never wiring a new
 * prop through Table/TableCanvas into the three dice renderers. See
 * docs/TABLE_UI.md.
 */
export type TableEvent =
  | { type: 'straight'; dice: Die[] }
  | {
      type: 'chips-to-pot';
      contributions: { playerId: PlayerId; amount: number }[];
      /** Pot count before these contributions, captured before the next snapshot. */
      potBefore: number;
    }
  | { type: 'pot-to-winner'; winnerId: PlayerId; amount: number };

type TableEventType = TableEvent['type'];
type EventOf<T extends TableEventType> = Extract<TableEvent, { type: T }>;

type Listener = (event: TableEvent, at: number) => void;

/**
 * Sticky pub/sub: the last event of each type is retained so late-mounting
 * subscribers (spectator views appear only when a stream goes live, the
 * passive dice view only on mid-turn joins) can replay a recent event instead
 * of missing it. Timestamps are wall-clock (Date.now) to match the wire's
 * receivedAt stamps.
 */
class TableEventBus {
  private listeners = new Set<Listener>();
  private last = new Map<TableEventType, { event: TableEvent; at: number }>();

  emit(event: TableEvent, at: number = Date.now()): void {
    this.last.set(event.type, { event, at });
    for (const listener of this.listeners) listener(event, at);
  }

  /**
   * Subscribe to one event type; returns the unsubscribe function. With
   * `replayLastMs`, a retained event no older than that is delivered
   * immediately (the late-mount case).
   */
  on<T extends TableEventType>(
    type: T,
    handler: (event: EventOf<T>, at: number) => void,
    opts?: { replayLastMs?: number; now?: number },
  ): () => void {
    const listener: Listener = (event, at) => {
      if (event.type === type) handler(event as EventOf<T>, at);
    };
    this.listeners.add(listener);
    if (opts?.replayLastMs !== undefined) {
      const retained = this.last.get(type);
      const now = opts.now ?? Date.now();
      if (retained && now - retained.at <= opts.replayLastMs) {
        handler(retained.event as EventOf<T>, retained.at);
      }
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test hook: drop retained events and listeners. */
  reset(): void {
    this.listeners.clear();
    this.last.clear();
  }
}

/** One table per page — module singleton. */
export const tableEvents = new TableEventBus();

/** React subscription to one table event type; handler identity may change freely. */
export function useTableEvent<T extends TableEventType>(
  type: T,
  handler: (event: EventOf<T>, at: number) => void,
  opts?: { replayLastMs?: number },
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const replayLastMs = opts?.replayLastMs;
  useEffect(
    () => tableEvents.on(type, (event, at) => handlerRef.current(event, at), { replayLastMs }),
    [type, replayLastMs],
  );
}
