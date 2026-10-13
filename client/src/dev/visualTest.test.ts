import type { ServerMessage } from '@dice/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadIdentity, loadName, saveName } from '../state/persist';
import { prepareVisualTest } from './visualTest';

const socket = vi.hoisted(() => ({ listener: (_message: ServerMessage) => {} }));
vi.mock('../ws/singleton', () => ({
  getWsClient: () => ({
    onMessage: (listener: typeof socket.listener) => {
      socket.listener = listener;
      return () => {};
    },
  }),
}));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function setup() {
  const local = storage();
  local.setItem('dice:name', 'Real player');
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  const data = {
    roomId: 'ABC123',
    playerId: 'alice',
    rejoinToken: 'test-only',
    playerName: 'Test Alice',
    rolls: [[4, 4, 4], [2]],
  };
  vi.stubGlobal('location', {
    hostname: 'localhost',
    pathname: '/room/ABC123',
    hash: `#${new URLSearchParams({ visualTest: JSON.stringify(data) })}`,
  });
  return local;
}

afterEach(() => vi.unstubAllGlobals());

describe('local visual-test bootstrap', () => {
  it('isolates test identities from the normal player and ordinary pages', () => {
    const local = setup();
    prepareVisualTest();
    expect(loadName()).toBe('Test Alice');
    expect(loadIdentity('ABC123')?.playerId).toBe('alice');
    saveName('Test Bob');
    expect(local.getItem('dice:name')).toBe('Real player');
    expect(local.getItem('dice:room:ABC123')).toBeNull();
    location.pathname = '/';
    expect(loadName()).toBe('Real player');
  });

  it('advances forced faces only for the actor and preserves progress on refresh', () => {
    setup();
    prepareVisualTest();
    expect(window.__forceSettleFaces).toEqual([4, 4, 4]);
    socket.listener({ type: 'betalot:rolled', playerId: 'bob' } as ServerMessage);
    expect(window.__forceSettleFaces).toEqual([4, 4, 4]);
    socket.listener({ type: 'betalot:rolled', playerId: 'alice' } as ServerMessage);
    expect(window.__forceSettleFaces).toEqual([2]);
    prepareVisualTest();
    expect(window.__forceSettleFaces).toEqual([2]);
    socket.listener({ type: 'betalot:extraRolled', playerId: 'alice' } as ServerMessage);
    expect(window.__forceSettleFaces).toBeUndefined();
  });

  it('ignores remote hosts and ordinary local links', () => {
    setup();
    location.hostname = 'dice.example.com';
    prepareVisualTest();
    expect(window.__forceSettleFaces).toBeUndefined();
    location.hostname = 'localhost';
    location.hash = '';
    prepareVisualTest();
    expect(sessionStorage.getItem('dice:visual-test:path')).toBeNull();
  });

  it('supports queued d12 Blackjack faces and clears them after the actor rolls', () => {
    setup();
    const params = new URLSearchParams(location.hash.slice(1));
    const data = JSON.parse(params.get('visualTest')!);
    data.kind = 'blackjack';
    data.rolls = [[12], [9]];
    location.hash = `#${new URLSearchParams({ visualTest: JSON.stringify(data) })}`;
    prepareVisualTest();
    expect(window.__forceSettleFaces).toEqual([12]);
    socket.listener({ type: 'blackjack:rolled', playerId: 'alice' } as ServerMessage);
    expect(window.__forceSettleFaces).toEqual([9]);
    socket.listener({ type: 'blackjack:rolled', playerId: 'alice' } as ServerMessage);
    expect(window.__forceSettleFaces).toBeUndefined();
  });

  it('does not allow d12 overrides in Bet-a-lot links', () => {
    setup();
    const data = JSON.parse(new URLSearchParams(location.hash.slice(1)).get('visualTest')!);
    data.rolls = [[12]];
    location.hash = `#${new URLSearchParams({ visualTest: JSON.stringify(data) })}`;
    expect(prepareVisualTest).toThrow('Invalid local visual-test link');
  });
});
