import { describe, expect, it } from 'vitest';
import { parseRoomEvent, parseRoomEventLine } from './parseRoomEvent';

describe('parseRoomEvent', () => {
  it('accepts a known membership event', () => {
    const result = parseRoomEvent({
      type: 'hostChanged',
      hostId: 'p1',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(parseRoomEvent({ type: 'future' })).toEqual({
      ok: false,
      error: 'unknown event type: future',
    });
  });

  it('rejects invalid JSON lines', () => {
    expect(parseRoomEventLine('{').ok).toBe(false);
  });
});
