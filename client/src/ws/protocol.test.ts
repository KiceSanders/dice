import { describe, expect, it } from 'vitest';
import { parseServerMessage } from './protocol';

describe('parseServerMessage', () => {
  it('accepts a well-formed error message', () => {
    const result = parseServerMessage(
      JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'nope' }),
    );
    expect(result).toEqual({
      ok: true,
      message: { type: 'error', code: 'BAD_REQUEST', message: 'nope' },
    });
  });

  it('rejects invalid JSON', () => {
    expect(parseServerMessage('{')).toEqual({ ok: false, error: 'invalid JSON' });
  });

  it('rejects non-objects', () => {
    expect(parseServerMessage('[]')).toEqual({
      ok: false,
      error: 'message must be a JSON object',
    });
  });

  it('rejects missing type', () => {
    expect(parseServerMessage('{"code":"x"}')).toEqual({
      ok: false,
      error: 'missing message type',
    });
  });

  it('rejects unknown types', () => {
    expect(parseServerMessage('{"type":"future:thing"}')).toEqual({
      ok: false,
      error: 'unknown message type: future:thing',
    });
  });

  it('rejects partial turn:rolled payloads', () => {
    const result = parseServerMessage(JSON.stringify({ type: 'turn:rolled', playerId: 'p1' }));
    expect(result.ok).toBe(false);
  });

  it('requires turn:rolled restPose to be explicit', () => {
    const result = parseServerMessage(
      JSON.stringify({
        type: 'turn:rolled',
        playerId: 'p1',
        dice: [1, 2, 3, 4, 5],
        rollNumber: 1,
        kept: [],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts streaming no-op messages with required fields', () => {
    const result = parseServerMessage(
      JSON.stringify({
        type: 'turn:throwStarted',
        playerId: 'p1',
        kept: [0],
        rollNumber: 1,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts turn:rolled with explicit null restPose', () => {
    const result = parseServerMessage(
      JSON.stringify({
        type: 'turn:rolled',
        playerId: 'p1',
        dice: [1, 2, 3, 4, 5],
        rollNumber: 1,
        kept: [],
        restPose: null,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('validates the delayed roll-resolution marker', () => {
    expect(
      parseServerMessage(
        JSON.stringify({
          type: 'turn:rollResolved',
          playerId: 'p1',
          dice: [1, 2, 3, 4, 5],
          rollNumber: 1,
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseServerMessage(JSON.stringify({ type: 'turn:rollResolved', playerId: 'p1' })).ok,
    ).toBe(false);
  });

  it('accepts room:state with a snapshot object', () => {
    const result = parseServerMessage(
      JSON.stringify({ type: 'room:state', snapshot: { roomId: 'ABC' } }),
    );
    expect(result.ok).toBe(true);
  });

  it('validates active room directory entries', () => {
    const valid = {
      type: 'rooms:list',
      rooms: [
        {
          roomId: 'ABC234',
          phase: 'playing',
          roundNumber: 3,
          playerNames: ['Alice', 'Bob'],
        },
      ],
    };
    expect(parseServerMessage(JSON.stringify(valid)).ok).toBe(true);
    expect(
      parseServerMessage(
        JSON.stringify({ ...valid, rooms: [{ ...valid.rooms[0], roundNumber: 0 }] }),
      ).ok,
    ).toBe(false);
    expect(
      parseServerMessage(
        JSON.stringify({ ...valid, rooms: [{ ...valid.rooms[0], playerNames: 'Alice' }] }),
      ).ok,
    ).toBe(false);
  });

  it('requires a chat chip snapshot and accepts null for legacy history', () => {
    const base = {
      type: 'chat:message',
      playerId: 'p1',
      playerName: 'Pat',
      text: 'hello',
      ts: 123,
    };
    expect(parseServerMessage(JSON.stringify({ ...base, chipsAtSend: 17 })).ok).toBe(true);
    expect(parseServerMessage(JSON.stringify({ ...base, chipsAtSend: null })).ok).toBe(true);
    expect(parseServerMessage(JSON.stringify(base)).ok).toBe(false);
  });
});
