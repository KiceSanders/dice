import { afterEach, describe, expect, it, vi } from 'vitest';
import { type TableEvent, tableEvents } from './tableEvents';

afterEach(() => {
  tableEvents.reset();
});

describe('tableEvents', () => {
  it('delivers events to type-matched subscribers with the emit timestamp', () => {
    const handler = vi.fn();
    tableEvents.on('straight', handler);
    const event: TableEvent = { type: 'straight', dice: [1, 2, 3, 4, 5] };
    tableEvents.emit(event, 1_000);
    expect(handler).toHaveBeenCalledExactlyOnceWith(event, 1_000);
  });

  it('unsubscribe stops delivery', () => {
    const handler = vi.fn();
    const off = tableEvents.on('straight', handler);
    off();
    tableEvents.emit({ type: 'straight', dice: [1, 2, 3, 4, 5] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('replays a retained event to a late subscriber within the age window', () => {
    const event: TableEvent = { type: 'straight', dice: [2, 3, 4, 5, 6] };
    tableEvents.emit(event, 1_000);
    const handler = vi.fn();
    tableEvents.on('straight', handler, { replayLastMs: 500, now: 1_400 });
    expect(handler).toHaveBeenCalledExactlyOnceWith(event, 1_000);
  });

  it('does not replay a retained event past the age window', () => {
    tableEvents.emit({ type: 'straight', dice: [2, 3, 4, 5, 6] }, 1_000);
    const handler = vi.fn();
    tableEvents.on('straight', handler, { replayLastMs: 500, now: 1_600 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not replay without opting in', () => {
    tableEvents.emit({ type: 'straight', dice: [2, 3, 4, 5, 6] });
    const handler = vi.fn();
    tableEvents.on('straight', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps ante and award replay slots independent', () => {
    const ante: TableEvent = {
      type: 'chips-to-pot',
      potBefore: 2,
      contributions: [{ playerId: 'p1', amount: 1 }],
    };
    const award: TableEvent = { type: 'pot-to-winner', winnerId: 'p1', amount: 3 };
    tableEvents.emit(ante, 1_000);
    tableEvents.emit(award, 1_100);

    const anteHandler = vi.fn();
    const awardHandler = vi.fn();
    tableEvents.on('chips-to-pot', anteHandler, { replayLastMs: 500, now: 1_200 });
    tableEvents.on('pot-to-winner', awardHandler, { replayLastMs: 500, now: 1_200 });

    expect(anteHandler).toHaveBeenCalledExactlyOnceWith(ante, 1_000);
    expect(awardHandler).toHaveBeenCalledExactlyOnceWith(award, 1_100);
  });
});
