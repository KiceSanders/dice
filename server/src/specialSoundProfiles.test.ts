import { describe, expect, it } from 'vitest';
import { SpecialSoundProfiles } from './specialSoundProfiles.js';

describe('SpecialSoundProfiles', () => {
  it('stores, replaces, clears, and enumerates ephemeral clips', () => {
    const profiles = new SpecialSoundProfiles();
    expect(profiles.update('p1', 'straight', 'old')).toBe(true);
    expect(profiles.update('p1', 'straight', 'new')).toBe(true);
    expect(profiles.update('p2', 'overtime-win', 'win')).toBe(true);
    expect(profiles.messages()).toEqual([
      {
        type: 'special-sound:updated',
        playerId: 'p1',
        kind: 'straight',
        wavBase64: 'new',
      },
      {
        type: 'special-sound:updated',
        playerId: 'p2',
        kind: 'overtime-win',
        wavBase64: 'win',
      },
    ]);
    expect(profiles.update('p1', 'straight', null)).toBe(true);
    expect(profiles.messages()).toHaveLength(1);

    expect(profiles.update('p2', 'classic', 'six-six-six')).toBe(true);
    expect(profiles.clearPlayer('p2')).toEqual([
      {
        type: 'special-sound:updated',
        playerId: 'p2',
        kind: 'classic',
        wavBase64: null,
      },
      {
        type: 'special-sound:updated',
        playerId: 'p2',
        kind: 'overtime-win',
        wavBase64: null,
      },
    ]);
    expect(profiles.clearPlayer('unknown')).toEqual([]);
    expect(profiles.messages()).toEqual([]);
  });
});
