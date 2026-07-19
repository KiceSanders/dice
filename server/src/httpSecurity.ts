import type { RequestHandler } from 'express';

export const WEBSOCKET_PATH = '/ws';
/** Allows one canonical three-second WAV encoded as base64 plus JSON overhead. */
export const WEBSOCKET_MAX_PAYLOAD_BYTES = 192 * 1024;

/** Parse explicitly trusted browser origins from a comma-separated env value. */
export function parseAllowedOrigins(value: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const entry of value?.split(',') ?? []) {
    const candidate = entry.trim();
    if (!candidate) continue;
    const url = new URL(candidate);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/') {
      throw new Error(`invalid ALLOWED_ORIGINS entry: ${candidate}`);
    }
    origins.add(url.origin);
  }
  return origins;
}

/**
 * Browsers must connect from the same public host (or an explicitly trusted
 * origin). Origin-less non-browser clients remain available for smoke tests.
 */
export function isWebSocketOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return true;

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (allowedOrigins.has(url.origin)) return true;
    return Boolean(host && url.host.toLowerCase() === host.toLowerCase());
  } catch {
    return false;
  }
}

/** Low-risk browser hardening headers that do not constrain WebGL/WASM. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
};
