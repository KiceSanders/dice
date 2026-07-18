import { DEFAULT_SETTINGS } from '@dice/shared';
import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.js';

const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));

describe('parseClientMessage', () => {
  it('rejects malformed JSON without throwing', () => {
    expect(parseClientMessage('{nope')).toEqual({ ok: false, error: 'invalid JSON' });
    expect(parseClientMessage('')).toMatchObject({ ok: false });
  });

  it('rejects non-object payloads', () => {
    expect(parse(42)).toMatchObject({ ok: false });
    expect(parse([1, 2])).toMatchObject({ ok: false });
    expect(parse(null)).toMatchObject({ ok: false });
  });

  it('rejects missing or unknown types', () => {
    expect(parse({ playerName: 'a' })).toMatchObject({ ok: false, error: 'missing message type' });
    expect(parse({ type: 'hack:everything' })).toMatchObject({
      ok: false,
      error: 'unknown message type: hack:everything',
    });
  });

  it('accepts a valid room:create', () => {
    const result = parse({ type: 'room:create', playerName: 'Kice', settings: DEFAULT_SETTINGS });
    expect(result).toMatchObject({ ok: true, message: { type: 'room:create' } });
  });

  it('does not require a player-cap setting and tolerates the legacy field', () => {
    expect(
      parse({ type: 'room:create', playerName: 'Kice', settings: DEFAULT_SETTINGS }),
    ).toMatchObject({ ok: true });
    expect(
      parse({
        type: 'room:create',
        playerName: 'Kice',
        settings: { ...DEFAULT_SETTINGS, maxPlayers: 2 },
      }),
    ).toMatchObject({ ok: true });
  });

  it('rejects room:create with missing fields', () => {
    expect(parse({ type: 'room:create', playerName: 'Kice' })).toMatchObject({ ok: false });
    expect(parse({ type: 'room:create', settings: DEFAULT_SETTINGS })).toMatchObject({ ok: false });
    expect(
      parse({ type: 'room:create', playerName: '', settings: DEFAULT_SETTINGS }),
    ).toMatchObject({ ok: false });
  });

  it('rejects malformed settings (bad straightPayout)', () => {
    const settings = { ...DEFAULT_SETTINGS, straightPayout: { enabled: 'yes' } };
    expect(parse({ type: 'room:create', playerName: 'a', settings })).toMatchObject({ ok: false });
  });

  it('requires a finite after-roll delay', () => {
    const { afterRollDelayMs: _omitted, ...missing } = DEFAULT_SETTINGS;
    expect(parse({ type: 'room:create', playerName: 'a', settings: missing })).toMatchObject({
      ok: false,
    });
    const bad = { ...DEFAULT_SETTINGS, afterRollDelayMs: 'soon' };
    expect(parse({ type: 'settings:update', settings: bad })).toMatchObject({ ok: false });
  });

  it('rejects malformed settings (bad or missing yahtzeeBonus)', () => {
    const bad = { ...DEFAULT_SETTINGS, yahtzeeBonus: { enabled: true } };
    expect(parse({ type: 'room:create', playerName: 'a', settings: bad })).toMatchObject({
      ok: false,
    });
    const { yahtzeeBonus: _omitted, ...missing } = DEFAULT_SETTINGS;
    expect(parse({ type: 'room:create', playerName: 'a', settings: missing })).toMatchObject({
      ok: false,
    });
  });

  it('rejects malformed or missing firstRollYahtzeePayout settings', () => {
    const bad = { ...DEFAULT_SETTINGS, firstRollYahtzeePayout: { enabled: true } };
    expect(parse({ type: 'room:create', playerName: 'a', settings: bad })).toMatchObject({
      ok: false,
    });
    const { firstRollYahtzeePayout: _omitted, ...missing } = DEFAULT_SETTINGS;
    expect(parse({ type: 'room:create', playerName: 'a', settings: missing })).toMatchObject({
      ok: false,
    });
  });

  it('validates room:join with optional rejoinToken', () => {
    expect(parse({ type: 'room:join', roomId: 'ABC234', playerName: 'p' })).toMatchObject({
      ok: true,
    });
    expect(
      parse({ type: 'room:join', roomId: 'ABC234', playerName: 'p', rejoinToken: 't' }),
    ).toMatchObject({ ok: true });
    expect(
      parse({ type: 'room:join', roomId: 'ABC234', playerName: 'p', rejoinToken: '' }),
    ).toMatchObject({ ok: false });
    expect(parse({ type: 'room:join', playerName: 'p' })).toMatchObject({ ok: false });
  });

  it('validates the Yahtzee bonus throw messages', () => {
    expect(parse({ type: 'turn:bonusThrowStart' })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:bonusThrowResult', die: 6 })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:bonusThrowResult', die: 0 })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:bonusThrowResult', die: 7 })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:bonusThrowResult', die: 3.5 })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:bonusThrowResult' })).toMatchObject({ ok: false });
  });

  it('rejects the removed turn:roll message (physics throws replaced it, ADR 004)', () => {
    expect(parse({ type: 'turn:roll', keepIndices: [] })).toMatchObject({
      ok: false,
      error: 'unknown message type: turn:roll',
    });
  });

  it('validates turn:throwStart keepIndices', () => {
    expect(parse({ type: 'turn:throwStart', keepIndices: [] })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:throwStart', keepIndices: [0, 3] })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:throwStart', keepIndices: [0.5] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwStart', keepIndices: [0, 1, 2, 3, 4, 5] })).toMatchObject({
      ok: false,
    });
    expect(parse({ type: 'turn:throwStart' })).toMatchObject({ ok: false });
  });

  it('rejects out-of-range, negative, and duplicate keepIndices (11.2)', () => {
    expect(parse({ type: 'turn:throwStart', keepIndices: [5] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwStart', keepIndices: [-1] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwStart', keepIndices: [1, 1] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwStart', keepIndices: [0, 1, 2, 3, 4] })).toMatchObject({
      ok: true,
    });
  });

  it('validates turn:throwResult dice', () => {
    expect(parse({ type: 'turn:throwResult', dice: [1, 2, 3, 4, 5] })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:throwResult', dice: [1, 2, 3, 4] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwResult', dice: [0, 2, 3, 4, 5] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwResult', dice: [1, 2, 3, 4, 7] })).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwResult', dice: [1, 2, 3, 4, 5.5] })).toMatchObject({
      ok: false,
    });
    expect(parse({ type: 'turn:throwResult' })).toMatchObject({ ok: false });
  });

  it('validates turn:throwResult restPose shape (ADR 005)', () => {
    const dice = [1, 2, 3, 4, 5];
    const pose = [0, 0.06, 0, 0, 0, 0, 1];
    const restPose = [pose, pose, pose, pose, pose];
    // Optional: absent is fine (covered above); present must be 5 body poses.
    expect(parse({ type: 'turn:throwResult', dice, restPose })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:throwResult', dice, restPose: restPose.slice(0, 4) })).toMatchObject(
      { ok: false },
    );
    expect(
      parse({ type: 'turn:throwResult', dice, restPose: [pose, pose, pose, pose, [0, 0, 0]] }),
    ).toMatchObject({ ok: false });
    expect(
      parse({
        type: 'turn:throwResult',
        dice,
        restPose: [pose, pose, pose, pose, [0, Number.NaN, 0, 0, 0, 0, 1]],
      }),
    ).toMatchObject({ ok: false });
    expect(parse({ type: 'turn:throwResult', dice, restPose: 'nope' })).toMatchObject({
      ok: false,
    });
  });

  it('validates dice:frames pose batches', () => {
    const pose = [0, 0.1, 0, 0, 0, 0, 1];
    const frame = { t: 16, bodies: [pose, pose, pose, pose, pose, pose] };
    expect(parse({ type: 'dice:frames', frames: [frame] })).toMatchObject({ ok: true });
    expect(parse({ type: 'dice:frames', frames: [] })).toMatchObject({ ok: false });
    expect(parse({ type: 'dice:frames', frames: Array(11).fill(frame) })).toMatchObject({
      ok: false,
    });
    expect(parse({ type: 'dice:frames', frames: [{ t: 0, bodies: [[1, 2, 3]] }] })).toMatchObject({
      ok: false,
    });
    expect(
      parse({ type: 'dice:frames', frames: [{ t: 0, bodies: Array(9).fill(pose) }] }),
    ).toMatchObject({ ok: false });
    expect(parse({ type: 'dice:frames', frames: [{ t: 'now', bodies: [pose] }] })).toMatchObject({
      ok: false,
    });
  });

  it('validates payload-less messages', () => {
    expect(parse({ type: 'game:start' })).toMatchObject({ ok: true });
    expect(parse({ type: 'round:continue' })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:stand' })).toMatchObject({ ok: true });
  });

  it('validates optional turn:stand restPose shape (ADR 005)', () => {
    const pose = [0, 0.06, 0, 0, 0, 0, 1];
    const restPose = [pose, pose, pose, pose, pose];
    expect(parse({ type: 'turn:stand', restPose })).toMatchObject({ ok: true });
    expect(parse({ type: 'turn:stand', restPose: restPose.slice(0, 4) })).toMatchObject({
      ok: false,
    });
    expect(parse({ type: 'turn:stand', restPose: 'nope' })).toMatchObject({ ok: false });
  });

  it('validates chat:send length bounds', () => {
    expect(parse({ type: 'chat:send', text: 'hi' })).toMatchObject({ ok: true });
    expect(parse({ type: 'chat:send', text: '' })).toMatchObject({ ok: false });
    expect(parse({ type: 'chat:send', text: '   ' })).toMatchObject({ ok: false });
    expect(parse({ type: 'chat:send', text: 'x'.repeat(501) })).toMatchObject({ ok: false });
  });

  it('validates seat:request buy-in', () => {
    expect(parse({ type: 'seat:request', buyIn: 100 })).toMatchObject({ ok: true });
    expect(parse({ type: 'seat:request', buyIn: -5 })).toMatchObject({ ok: false });
    expect(parse({ type: 'seat:request', buyIn: 'lots' })).toMatchObject({ ok: false });
  });

  it('rejects non-integer and non-finite buy-ins (11.2)', () => {
    expect(parse({ type: 'seat:request', buyIn: 10.5 })).toMatchObject({ ok: false });
    expect(parse({ type: 'seat:request', buyIn: 0 })).toMatchObject({ ok: false });
    expect(parse({ type: 'seat:request', buyIn: Infinity })).toMatchObject({ ok: false });
    expect(parse({ type: 'seat:request', buyIn: NaN })).toMatchObject({ ok: false });
  });

  it('rejects over-long and control-char-only names', () => {
    expect(
      parse({ type: 'room:join', roomId: 'ABCDEF', playerName: 'x'.repeat(25) }),
    ).toMatchObject({ ok: false });
    expect(parse({ type: 'room:join', roomId: 'x'.repeat(13), playerName: 'p' })).toMatchObject({
      ok: false,
    });
  });
});
