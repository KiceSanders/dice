import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../../protocol.js';

const base = { type: 'betalot:slotsAction', bonusId: 'bonus-1', revision: 0 };
const parse = (fields: object) => parseClientMessage(JSON.stringify({ ...base, ...fields }));

describe('slot command validation', () => {
  it.each(['spin', 'collect', 'continue'])('accepts a versioned %s command', (action) => {
    expect(parse({ action }).ok).toBe(true);
  });
  it('accepts an explicit lock or unlock of a valid die', () => {
    expect(parse({ action: 'lock', index: 4, locked: true }).ok).toBe(true);
    expect(parse({ action: 'lock', index: 0, locked: false }).ok).toBe(true);
  });
  it.each([
    { bonusId: '' },
    { revision: -1 },
    { revision: 0.5 },
    { revision: '1' },
    { action: 'win' },
    { action: 'lock', index: 5, locked: true },
    { action: 'lock', index: -1, locked: true },
    { action: 'lock', index: 1.5, locked: true },
    { action: 'lock', index: 0, locked: 'true' },
    { action: 'lock', index: 0 },
  ])('rejects malformed action %j', (fields) => {
    expect(parse({ action: 'spin', ...fields }).ok).toBe(false);
  });
});
