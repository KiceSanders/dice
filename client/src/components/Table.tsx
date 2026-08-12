import type {
  BetALotStatePublic,
  GameStatePublic,
  PoseFrame,
  RoomSettings,
  RoomSnapshot,
} from '@dice/shared';
import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react';
import BetALotCalledFace from '../games/betalot/BetALotCalledFace';
import BetALotFacePicker from '../games/betalot/BetALotFacePicker';
import BetALotPayoutNotices from '../games/betalot/BetALotPayoutNotices';
import BetALotRoundHistory from '../games/betalot/BetALotRoundHistory';
import BetALotScoreOverlay from '../games/betalot/BetALotScoreOverlay';
import ClassicPotOverlay from '../table3d/ClassicPotOverlay';
import type { DiceCount } from '../table3d/dice/constants';
import type { RemoteRollFeed } from '../table3d/dice/remoteFeed';
import type { TableDiceProps } from '../table3d/dice/types';
import type { OverlayRect } from '../table3d/layout';
import PotChipOverlay from '../table3d/PotChipOverlay';
import RollToBeatOverlay from '../table3d/RollToBeatOverlay';
import SeatOverlay, { SeatStrip } from '../table3d/SeatOverlay';
import TableCanvas from '../table3d/TableCanvas';
import TableCenterOverlay from '../table3d/TableCenterOverlay';
import { SEAT_STACK_QUERY, useMediaQuery } from '../table3d/useMediaQuery';
import { tableFrameMaxWidth } from '../table3d/viewportFit';
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
  winnerId?: string | null;
  dice?: TableDiceProps;
  /** Count for static and streamed remote views when a game uses variable dice. */
  diceCount?: DiceCount;
  /** Streamed pose feed of another player's throw (ADR 004). */
  remoteFeed?: RemoteRollFeed;
  /** Frozen last hand pose shown until the next throw starts. */
  heldPose?: PoseFrame | null;
  /**
   * Active turn card's reflowed angle for the spectator parked koozie. Null
   * hides it (roller / remote throw own the cup instead).
   */
  parkedKoozieAngle?: number | null;
  /** Crosshair cursor while aiming a throw on the felt. */
  diceAiming?: boolean;
  /** Live koozie interaction, used to retire Bet-a-lot's prior face call. */
  koozieInPlay?: boolean;
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

function visualViewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Recomputes when browser chrome, display scaling, zoom, or window size changes. */
function useTableViewportFit(stacked: boolean): CSSProperties | undefined {
  const [height, setHeight] = useState(visualViewportHeight);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setHeight(visualViewportHeight());
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
    };
  }, []);

  if (stacked) return undefined;
  const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const heightLimitedWidth = tableFrameMaxWidth(height, remPx);
  return { maxWidth: `min(var(--layout-max), ${heightLimitedWidth}px)` };
}

/** 3D poker table with 2D player overlays that stay off the felt. */
export default function Table({
  snapshot,
  myId,
  winnerId = null,
  dice,
  diceCount,
  remoteFeed,
  heldPose = null,
  parkedKoozieAngle = null,
  diceAiming = false,
  koozieInPlay = false,
  onTablePointer,
  stand,
  connection,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { layout, viewportAspect } = useLayoutRects(frameRef, viewportRef);
  const stacked = useMediaQuery(SEAT_STACK_QUERY);
  const viewportFitStyle = useTableViewportFit(stacked);
  const isBetALot = snapshot.settings.kind === 'betalot';
  const betALotGame = isBetALot ? (snapshot.game as BetALotStatePublic | null) : null;
  const dice5Game = isBetALot ? null : (snapshot.game as GameStatePublic | null);
  const dice5Settings = isBetALot ? null : (snapshot.settings as RoomSettings);
  const betALotOnFire = Boolean(betALotGame?.fire.some((entry) => entry.onFire));

  return (
    <div
      ref={frameRef}
      className={`table table-3d${stacked ? ' table-3d--stacked' : ''}`}
      style={viewportFitStyle}
    >
      <div
        ref={viewportRef}
        className={`table-3d-viewport${diceAiming ? ' table-3d-viewport--aiming' : ''}`}
        onPointerEnter={(e) => onTablePointer?.(true, e.clientX, e.clientY)}
        onPointerLeave={() => onTablePointer?.(false)}
      >
        {/* Flame ring is snapshot state (Dice5 sub-round or Bet-a-lot on-fire),
            so every viewer — roller, spectator, mid-turn joiner — gets them. */}
        <TableCanvas
          dice={dice}
          remoteFeed={remoteFeed}
          heldPose={heldPose}
          parkedKoozieAngle={parkedKoozieAngle}
          tieBreaker={Boolean(dice5Game?.subRound) || betALotOnFire}
          diceCount={diceCount}
          remoteBonusMode={!isBetALot}
        />
        {layout && <TableCenterOverlay snapshot={snapshot} aspect={viewportAspect} />}
      </div>
      {/* Game-state band on the reserved 10→2 o'clock arc — widgets are normal
          flow, so they can never overlap each other or the seat arc below. */}
      <div className="table-top-band">
        <div className="table-top-band-slot table-top-band-slot--pot">
          {betALotGame ? (
            <div className="classic-pot-overlay betalot-pot-overlay">
              <PotChipOverlay pot={betALotGame.sevensPot} label="Sevens Pot" />
              <div className="classic-pot-label">Sevens Pot</div>
            </div>
          ) : (
            dice5Game && <PotChipOverlay pot={dice5Game.pot} />
          )}
        </div>
        <div className="table-top-band-slot table-top-band-slot--roll">
          {betALotGame ? (
            <BetALotScoreOverlay game={betALotGame} players={snapshot.players} />
          ) : (
            dice5Game && <RollToBeatOverlay game={dice5Game} players={snapshot.players} />
          )}
        </div>
        <div className="table-top-band-slot table-top-band-slot--classic">
          {dice5Game && dice5Settings && (
            <ClassicPotOverlay
              classicPot={dice5Game.classicPot}
              enabled={dice5Settings.classicPot.enabled}
            />
          )}
        </div>
      </div>
      {isBetALot && <BetALotPayoutNotices myId={myId} />}
      {isBetALot && <BetALotRoundHistory snapshot={snapshot} />}
      {isBetALot && layout && (
        <>
          <BetALotFacePicker
            snapshot={snapshot}
            myId={myId}
            frame={layout.frame}
            viewport={layout.viewport}
          />
          <BetALotCalledFace
            snapshot={snapshot}
            myId={myId}
            frame={layout.frame}
            viewport={layout.viewport}
            koozieInPlay={koozieInPlay}
          />
        </>
      )}
      {connection && <ConnectionDot status={connection} />}
      {stand && <StandControlView stand={stand} />}
      {stacked ? (
        <SeatStrip snapshot={snapshot} myId={myId} winnerId={winnerId} />
      ) : (
        layout && (
          <SeatOverlay
            snapshot={snapshot}
            myId={myId}
            winnerId={winnerId}
            frame={layout.frame}
            viewport={layout.viewport}
          />
        )
      )}
    </div>
  );
}
