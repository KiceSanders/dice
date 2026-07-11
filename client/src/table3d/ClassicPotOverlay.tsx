import type { PlayerId } from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  animationProgress,
  CHIP_ANTE_STAGGER_MS,
  CHIP_ANTE_TRAVEL_MS,
  CHIP_AWARD_TRAVEL_MS,
  CHIP_EVENT_REPLAY_MS,
  chipAnimationsEnabled,
  chipFlightPoint,
  lerpPoint,
  type Point2,
  staggerDelay,
} from './chipFlow';
import { drawCoin, drawPotPyramid, prepareCanvas, readChipColors } from './potChipDraw';
import { layoutPotChips, type PotChipPoint } from './potChipLayout';
import { useTableEvent } from './tableEvents';

interface Props {
  classicPot: number;
  /** When false and pot is empty, hide the lane entirely. */
  enabled: boolean;
}

function playerTarget(playerId: PlayerId): Point2 | null {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-chip-player]')).find(
    (element) => element.dataset.chipPlayer === playerId,
  );
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

interface CoinFlight {
  kind: 'coins';
  startedAt: number;
  travelMs: number;
  doneAt: number;
  commitsPot: boolean;
  coins: { from: Point2; to: Point2; radius: number; delay: number }[];
}

interface AwardFlight {
  kind: 'award';
  startedAt: number;
  from: PotChipPoint[];
  offset: Point2;
}

type ActiveFlight = CoinFlight | AwardFlight;

/**
 * Classic Pot in the top-band right lane: same gold-coin pyramid as the ante pot,
 * with a "Classic Pot" label underneath.
 */
export default function ClassicPotOverlay({ classicPot, enabled }: Props) {
  const potCanvasRef = useRef<HTMLCanvasElement>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement>(null);
  const flightsRef = useRef<ActiveFlight[]>([]);
  const potRef = useRef(classicPot);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<(now: number) => void>(() => {});
  const [displayPot, setDisplayPot] = useState(classicPot);

  const animationsEnabled = () =>
    chipAnimationsEnabled(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const clearFlowCanvas = () => {
    const canvas = flowCanvasRef.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas, window.innerWidth, window.innerHeight);
    context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };

  const startLoop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frameRef.current);
  };

  frameRef.current = () => {
    const now = Date.now();
    const flowCanvas = flowCanvasRef.current;
    const potCanvas = potCanvasRef.current;
    if (flightsRef.current.length === 0 || !flowCanvas || !potCanvas) return;
    const context = prepareCanvas(flowCanvas, window.innerWidth, window.innerHeight);
    if (!context) return;
    const colors = readChipColors(potCanvas);

    const remaining: ActiveFlight[] = [];
    for (const flight of flightsRef.current) {
      if (flight.kind === 'coins') {
        for (const coin of flight.coins) {
          const progress = animationProgress(now, flight.startedAt, flight.travelMs, coin.delay);
          const point = chipFlightPoint(coin.from, coin.to, progress);
          drawCoin(context, { ...point, radius: coin.radius }, colors);
        }
        if (now >= flight.doneAt) {
          if (flight.commitsPot) setDisplayPot(potRef.current);
          continue;
        }
      } else {
        const progress = animationProgress(now, flight.startedAt, CHIP_AWARD_TRAVEL_MS);
        const offset = lerpPoint({ x: 0, y: 0 }, flight.offset, progress);
        context.globalAlpha = progress > 0.75 ? 1 - (progress - 0.75) / 0.25 : 1;
        for (const point of flight.from) {
          drawCoin(
            context,
            { x: point.x + offset.x, y: point.y + offset.y, radius: point.radius },
            colors,
          );
        }
        context.globalAlpha = 1;
        if (progress >= 1) {
          setDisplayPot(potRef.current);
          continue;
        }
      }
      remaining.push(flight);
    }
    flightsRef.current = remaining;
    if (remaining.length === 0) {
      clearFlowCanvas();
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(frameRef.current);
  };

  useTableEvent(
    'chips-to-classic-pot',
    (event, at) => {
      if (!animationsEnabled()) {
        setDisplayPot(potRef.current);
        return;
      }
      const canvas = potCanvasRef.current;
      if (!canvas || event.amount <= 0) {
        setDisplayPot(potRef.current);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const finalPot = event.classicPotBefore + event.amount;
      const finalLayout = layoutPotChips(finalPot, rect.width, rect.height - 2);
      const incoming = finalLayout.points.slice(event.classicPotBefore);
      const from = playerTarget(event.playerId) ?? {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const coins: CoinFlight['coins'] = [];
      for (let i = 0; i < event.amount; i += 1) {
        const target = incoming[i] ?? finalLayout.points.at(-1);
        if (!target) continue;
        coins.push({
          from,
          to: { x: rect.left + target.x, y: rect.top + target.y },
          radius: target.radius,
          delay: staggerDelay(i, event.amount),
        });
      }
      setDisplayPot(event.classicPotBefore);
      flightsRef.current = [
        ...flightsRef.current,
        {
          kind: 'coins',
          startedAt: at,
          travelMs: CHIP_ANTE_TRAVEL_MS,
          doneAt: at + CHIP_ANTE_TRAVEL_MS + CHIP_ANTE_STAGGER_MS,
          commitsPot: true,
          coins,
        },
      ];
      startLoop();
    },
    { replayLastMs: CHIP_EVENT_REPLAY_MS },
  );

  useTableEvent(
    'classic-pot-to-winner',
    (event, at) => {
      if (!animationsEnabled()) {
        setDisplayPot(potRef.current);
        return;
      }
      const canvas = potCanvasRef.current;
      const target = playerTarget(event.winnerId);
      if (!canvas || !target || event.amount <= 0) {
        setDisplayPot(potRef.current);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const layout = layoutPotChips(event.amount, rect.width, rect.height - 2);
      const from = layout.points.map((point) => ({
        x: rect.left + point.x,
        y: rect.top + point.y,
        radius: point.radius,
      }));
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setDisplayPot(0);
      flightsRef.current = [
        ...flightsRef.current,
        {
          kind: 'award',
          startedAt: at,
          from,
          offset: { x: target.x - center.x, y: target.y - center.y },
        },
      ];
      startLoop();
    },
    { replayLastMs: CHIP_EVENT_REPLAY_MS },
  );

  useEffect(() => {
    potRef.current = classicPot;
    const potInFlight = flightsRef.current.some(
      (flight) => flight.kind === 'award' || (flight.kind === 'coins' && flight.commitsPot),
    );
    if (!potInFlight) setDisplayPot(classicPot);
  }, [classicPot]);

  useEffect(() => {
    const canvas = potCanvasRef.current;
    if (!canvas) return;
    const draw = () => drawPotPyramid(canvas, displayPot);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [displayPot]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  if (!enabled && classicPot === 0) return null;

  return (
    <>
      <div className="classic-pot-overlay" data-classic-pot>
        <canvas
          ref={potCanvasRef}
          className="pot-chip-overlay classic-pot-chips"
          role="img"
          aria-label={`Classic Pot: ${classicPot} chip${classicPot === 1 ? '' : 's'}`}
        />
        <div className="classic-pot-label">Classic Pot</div>
      </div>
      {createPortal(
        <canvas ref={flowCanvasRef} className="chip-flow-overlay" aria-hidden />,
        document.body,
      )}
    </>
  );
}
