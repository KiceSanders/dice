import type { ConnectionStatus as Status } from '../ws/client';

/** Visible connection indicator used by the Room page and browser verification. */
export default function ConnectionStatus({ status }: { status: Status }) {
  return (
    <p className="conn-status" data-connection={status}>
      Connection: {status}
    </p>
  );
}

/** Minimal red/green dot pinned to the page corner — full text lives in the room info card. */
export function ConnectionDot({ status }: { status: Status }) {
  return (
    <span
      className="conn-corner"
      role="status"
      aria-label={`Connection: ${status}`}
      title={`Connection: ${status}`}
    >
      <span className={`conn-dot ${status === 'open' ? 'conn-on' : 'conn-off'}`} />
    </span>
  );
}
