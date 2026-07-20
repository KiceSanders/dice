import { describe, expect, it } from 'vitest';
import { isWebSocketOriginAllowed, parseAllowedOrigins } from './httpSecurity.js';

describe('WebSocket origin policy', () => {
  it('allows same-host browser connections and origin-less tools', () => {
    const allowed = new Set<string>();
    expect(isWebSocketOriginAllowed(undefined, 'example.com', allowed)).toBe(true);
    expect(isWebSocketOriginAllowed('https://example.com', 'example.com', allowed)).toBe(true);
    expect(isWebSocketOriginAllowed('https://example.com:8443', 'example.com:8443', allowed)).toBe(
      true,
    );
  });

  it('rejects cross-site, non-http, and malformed origins', () => {
    const allowed = new Set<string>();
    expect(isWebSocketOriginAllowed('https://evil.example', 'example.com', allowed)).toBe(false);
    expect(isWebSocketOriginAllowed('file:///tmp/app.html', 'example.com', allowed)).toBe(false);
    expect(isWebSocketOriginAllowed('not a url', 'example.com', allowed)).toBe(false);
  });

  it('allows explicitly trusted origins for split deployments', () => {
    const allowed = parseAllowedOrigins(' https://app.example.com, http://localhost:5173 ');
    expect(allowed).toEqual(new Set(['https://app.example.com', 'http://localhost:5173']));
    expect(isWebSocketOriginAllowed('https://app.example.com', 'api.example.com', allowed)).toBe(
      true,
    );
  });

  it('fails fast on an invalid configured origin', () => {
    expect(() => parseAllowedOrigins('https://example.com/path')).toThrow('ALLOWED_ORIGINS');
    expect(() => parseAllowedOrigins('wss://example.com')).toThrow('ALLOWED_ORIGINS');
  });
});
