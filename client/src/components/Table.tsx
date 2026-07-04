import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseFrame, RoomSnapshot } from '@dice/shared';
import TableCanvas from '../table3d/TableCanvas';
import SeatOverlay from '../table3d/SeatOverlay';
import TableCenterOverlay from '../table3d/TableCenterOverlay';
import type { OverlayRect } from '../table3d/layout';

import type { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import type { TableDiceProps } from '../table3d/dice/types';

interface Props {
  snapshot: RoomSnapshot;
  myId: string | null;
  onKick: (playerId: string) => void;
  winnerId?: string | null;
  dice?: TableDiceProps;
  /** Streamed pose feed of another player's throw (ADR 004). */
  remoteFeed?: RemoteRollFeed;
  /** Frozen last hand pose shown until the next throw starts. */
  heldPose?: PoseFrame | null;
  /** Crosshair cursor while aiming a throw on the felt. */
  diceAiming?: boolean;
  /** Pointer entered or left the playing area (viewport). */
  onTablePointer?: (inside: boolean, clientX?: number, clientY?: number) => void;
}

function toOverlayRect(el: HTMLElement): OverlayRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function useLayoutRects(
  frameRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
) {
  const [layout, setLayout] = useState<{ frame: OverlayRect; viewport: OverlayRect } | null>(null);
  const [viewportAspect, setViewportAspect] = useState(16 / 9);

  useEffect(() => {
    const frameEl = frameRef.current;
    const viewportEl = viewportRef.current;
    if (!frameEl || !viewportEl) return;

    const update = () => {
      setLayout({ frame: toOverlayRect(frameEl), viewport: toOverlayRect(viewportEl) });
      const vr = viewportEl.getBoundingClientRect();
      if (vr.height > 0) setViewportAspect(vr.width / vr.height);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(frameEl);
    ro.observe(viewportEl);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
    };
  }, [frameRef, viewportRef]);

  return { layout, viewportAspect };
}

/** 3D poker table with 2D player overlays that stay off the felt. */
export default function Table({
  snapshot,
  myId,
  onKick,
  winnerId = null,
  dice,
  remoteFeed,
  heldPose = null,
  diceAiming = false,
  onTablePointer,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { layout, viewportAspect } = useLayoutRects(frameRef, viewportRef);

  const mySeat = snapshot.players.find((p) => p.id === myId)?.seat ?? 0;

  return (
    <div ref={frameRef} className="table table-3d">
      <div
        ref={viewportRef}
        className={`table-3d-viewport${diceAiming ? ' table-3d-viewport--aiming' : ''}`}
        onPointerEnter={(e) => onTablePointer?.(true, e.clientX, e.clientY)}
        onPointerLeave={() => onTablePointer?.(false)}
      >
        <TableCanvas
          dice={dice}
          remoteFeed={remoteFeed}
          heldPose={heldPose}
          mySeat={mySeat}
        />
        {layout && <TableCenterOverlay snapshot={snapshot} aspect={viewportAspect} />}
      </div>
      {layout && (
        <SeatOverlay
          snapshot={snapshot}
          myId={myId}
          onKick={onKick}
          winnerId={winnerId}
          frame={layout.frame}
          viewport={layout.viewport}
        />
      )}
    </div>
  );
}
