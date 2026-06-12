import type { ConnectionStatus as Status } from '../ws/client';

/** Visible connection indicator used by the Room page and browser verification. */
export default function ConnectionStatus({ status }: { status: Status }) {
  return (
    <p className="conn-status" data-connection={status}>
      Connection: {status}
    </p>
  );
}
