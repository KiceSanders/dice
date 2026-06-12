import type { ClientMessage, ServerMessage } from '@dice/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/** Resolve the WebSocket endpoint: env override, else same-origin `/ws`
 * (proxied to the server by Vite in dev, served directly in prod). */
export function defaultWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

/**
 * Typed WebSocket client with auto-reconnect (exponential backoff 1s → 30s).
 * If a rejoin message is registered, it is re-sent automatically after every
 * reconnect so the server restores the player's identity via their token.
 */
export class WsClient {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'closed';
  private backoffMs = BACKOFF_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private everConnected = false;
  private stopped = false;
  private rejoinMessage: Extract<ClientMessage, { type: 'room:join' }> | null = null;

  private messageListeners = new Set<(msg: ServerMessage) => void>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  constructor(private readonly url: string = defaultWsUrl()) {}

  getStatus(): ConnectionStatus {
    return this.status;
  }

  onMessage(listener: (msg: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Register (or clear) the room:join message re-sent after reconnects. */
  setRejoin(msg: Extract<ClientMessage, { type: 'room:join' }> | null): void {
    this.rejoinMessage = msg;
  }

  connect(): void {
    this.stopped = false;
    if (this.socket) return;
    this.setStatus(this.everConnected ? 'reconnecting' : 'connecting');
    this.open();
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setStatus('closed');
  }

  /** Send a protocol message. Returns false (dropped) when not connected. */
  send(msg: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      const reconnected = this.everConnected;
      this.everConnected = true;
      this.backoffMs = BACKOFF_MIN_MS;
      this.setStatus('open');
      if (reconnected && this.rejoinMessage) this.send(this.rejoinMessage);
    };

    socket.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        console.warn('[ws] dropping unparseable message', event.data);
        return;
      }
      for (const listener of this.messageListeners) listener(msg);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose follows and drives the reconnect; nothing to do here.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
