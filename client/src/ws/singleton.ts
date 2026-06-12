import { WsClient } from './client';

/** One socket for the whole app — survives React StrictMode remounts in dev. */
let client: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!client) {
    client = new WsClient();
    client.connect();
  }
  return client;
}
