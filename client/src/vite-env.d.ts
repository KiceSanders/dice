/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the WebSocket endpoint (defaults to same-origin /ws). */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
