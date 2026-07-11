import type { PoseFrame, RoomSnapshot } from '@dice/shared';
import { type RefObject, useEffect, useRef, useState } from 'react';
import ClassicPotOverlay from '../table3d/ClassicPotOverlay';
import type { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import type { TableDiceProps } from '../table3d/dice/types';
import type { OverlayRect } from '../table3d/layout';
import PotChipOverlay from '../table3d/PotChipOverlay';
import RollToBeatOverlay from '../table3d/RollToBeatOverlay';
import SeatOverlay, { SeatStrip } from '../table3d/SeatOverlay';
import TableCanvas from '../table3d/TableCanvas';
import TableCenterOverlay from '../table3d/TableCenterOverlay';
import { SEAT_STACK_QUERY, useMediaQuery } from '../table3d/useMediaQuery';
import type { ConnectionStatus } from '../ws/client';
import { ConnectionDot } from './ConnectionStatus';

/** Voluntary-stand affordance anchored to the table frame, outside the play area. */
export interface StandControl {
  onStand: () => void;
  /** False while the current hand loses to the roll-to-beat. */
  canStand: boolean;
  /** Why standing is blocked (shown under the disabled button). */
  hint?: string;
  /** Transient lockout (rolling, disconnected). */
  disabled?: boolean;
}

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
  /**
   * Active turn's display seat for the spectator parked koozie. Null hides it
   * (roller / remote throw own the cup instead).
   */
  parkedKoozieDisplaySeat?: number | null;
  /** Crosshair cursor while aiming a throw on the felt. */
  diceAiming?: boolean;
  /** Pointer entered or left the playing area (viewport). */
  onTablePointer?: (inside: boolean, clientX?: number, clientY?: number) => void;
  /** Stand button rendered in the frame gutter; omit to hide. */
  stand?: StandControl;
  /** Renders the red/green dot in the frame's top-right corner; omit to hide. */
  connection?: ConnectionStatus;
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

function StandControlView({ stand }: { stand: StandControl }) {
  return (
    <div className="table-stand">
      <button
        type="button"
        className="table-stand-button"
        disabled={!stand.canStand || stand.disabled}
        onClick={stand.onStand}
      >
        Stand
      </button>
      {!stand.canStand && stand.hint && <small className="table-stand-hint">{stand.hint}</small>}
    </div>
  );
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
  parkedKoozieDisplaySeat = null,
  diceAiming = false,
  onTablePointer,
  stand,
  connection,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { layout, viewportAspect } = useLayoutRects(frameRef, viewportRef);
  const stacked = useMediaQuery(SEAT_STACK_QUERY);

  return (
    <div ref={frameRef} className={`table table-3d${stacked ? ' table-3d--stacked' : ''}`}>
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
          parkedKoozieDisplaySeat={parkedKoozieDisplaySeat}
        />
        {layout && <TableCenterOverlay snapshot={snapshot} aspect={viewportAspect} />}
      </div>
      {/* Game-state band on the reserved 10→2 o'clock arc — widgets are normal
          flow, so they can never overlap each other or the seat arc below. */}
      <div className="table-top-band">
        <div className="table-top-band-slot table-top-band-slot--pot">
          {snapshot.game && <PotChipOverlay pot={snapshot.game.pot} />}
        </div>
        <div className="table-top-band-slot table-top-band-slot--roll">
          {snapshot.game && <RollToBeatOverlay game={snapshot.game} players={snapshot.players} />}
        </div>
        <div className="table-top-band-slot table-top-band-slot--classic">
          {snapshot.game && (
            <ClassicPotOverlay
              classicPot={snapshot.game.classicPot}
              enabled={snapshot.settings.classicPot.enabled}
            />
          )}
        </div>
      </div>
      {connection && <ConnectionDot status={connection} />}
      {stand && <StandControlView stand={stand} />}
      {stacked ? (
        <SeatStrip snapshot={snapshot} myId={myId} onKick={onKick} winnerId={winnerId} />
      ) : (
        layout && (
          <SeatOverlay
            snapshot={snapshot}
            myId={myId}
            onKick={onKick}
            winnerId={winnerId}
            frame={layout.frame}
            viewport={layout.viewport}
          />
        )
      )}
    </div>
  );
}
