import { useApp } from '../state/context';

/**
 * Fixed full-width banner shown whenever the socket isn't open (Phase 11.1).
 * The WsClient retries automatically with backoff and rejoins with the stored
 * token, so the banner only needs to communicate status.
 */
export default function ConnectionBanner() {
  const { state } = useApp();
  if (state.connection === 'open') return null;

  const text =
    state.connection === 'connecting'
      ? 'Connecting to the server…'
      : 'Connection lost — reconnecting automatically…';

  return (
    <div className="conn-banner" role="status" data-connection={state.connection}>
      <span className="conn-banner-spinner" aria-hidden="true" />
      {text}
    </div>
  );
}
