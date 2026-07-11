import type { PlayerId } from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  animationProgress,
  CHIP_ANTE_STAGGER_MS,
  CHIP_ANTE_TRAVEL_MS,
  CHIP_AWARD_TRAVEL_MS,
  CHIP_EVENT_REPLAY_MS,
  CHIP_TRANSFER_TRAVEL_MS,
  chipAnimationsEnabled,
  chipFlightPoint,
  lerpPoint,
  type Point2,
  staggerDelay,
} from './chipFlow';
import { layoutPotChips, MAX_COIN_RADIUS, type PotChipPoint } from './potChipLayout';
import { useTableEvent } from './tableEvents';

interface ChipColors {
  face: string;
  highlight: string;
  edge: string;
  rim: string;
}

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  context?.clearRect(0, 0, width, height);
  return context;
}

function drawCoin(context: CanvasRenderingContext2D, point: PotChipPoint, colors: ChipColors) {
  const thickness = Math.max(0.7, point.radius * 0.26);

  context.beginPath();
  context.arc(point.x, point.y + thickness, point.radius, 0, Math.PI * 2);
  context.fillStyle = colors.edge;
  context.fill();

  context.beginPath();
  context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
  const face = context.createRadialGradient(
    point.x - point.radius * 0.35,
    point.y - point.radius * 0.35,
    0,
    point.x,
    point.y,
    point.radius,
  );
  face.addColorStop(0, colors.highlight);
  face.addColorStop(1, colors.face);
  context.fillStyle = face;
  context.fill();

  if (point.radius >= 2) {
    context.beginPath();
    context.arc(point.x, point.y, point.radius * 0.72, 0, Math.PI * 2);
    context.strokeStyle = colors.rim;
    context.lineWidth = Math.max(0.6, point.radius * 0.1);
    context.setLineDash([point.radius * 0.32, point.radius * 0.2]);
    context.stroke();
    context.setLineDash([]);
  }
}

function readColors(canvas: HTMLCanvasElement): ChipColors {
  const styles = getComputedStyle(canvas);
  return {
    face: styles.getPropertyValue('--pot-chip-face').trim(),
    highlight: styles.getPropertyValue('--pot-chip-highlight').trim(),
    edge: styles.getPropertyValue('--pot-chip-edge').trim(),
    rim: styles.getPropertyValue('--pot-chip-rim').trim(),
  };
}

function drawPot(canvas: HTMLCanvasElement, count: number) {
  const rect = canvas.getBoundingClientRect();
  const context = prepareCanvas(canvas, rect.width, rect.height);
  if (!context) return;

  const colors = readColors(canvas);
  const layout = layoutPotChips(count, rect.width, rect.height - 2);
  for (const point of layout.points) drawCoin(context, point, colors);
}

function playerTarget(playerId: PlayerId): Point2 | null {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-chip-player]')).find(
    (element) => element.dataset.chipPlayer === playerId,
  );
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Independent coins in flight (antes into the pot, player-to-player transfers). */
interface CoinFlight {
  kind: 'coins';
  startedAt: number;
  travelMs: number;
  doneAt: number;
  /** Antes reveal the grown pyramid when they land; transfers leave the pot alone. */
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

interface Props {
  pot: number;
}

/** Exact, text-free chip pyramid in the reserved top-band pot lane. */
export default function PotChipOverlay({ pot }: Props) {
  const potCanvasRef = useRef<HTMLCanvasElement>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement>(null);
  const flightsRef = useRef<ActiveFlight[]>([]);
  const potRef = useRef(pot);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<(now: number) => void>(() => {});
  const [displayPot, setDisplayPot] = useState(pot);

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
    const colors = readColors(potCanvas);

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
    'chips-to-pot',
    (event, at) => {
      if (!animationsEnabled()) return;
      const canvas = potCanvasRef.current;
      if (!canvas) return;
      const total = event.contributions.reduce((sum, entry) => sum + entry.amount, 0);
      if (total <= 0) return;

      const rect = canvas.getBoundingClientRect();
      const finalPot = event.potBefore + total;
      const finalLayout = layoutPotChips(finalPot, rect.width, rect.height - 2);
      const incoming = finalLayout.points.slice(event.potBefore);
      const fallback = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const coins: CoinFlight['coins'] = [];
      let index = 0;
      for (const contribution of event.contributions) {
        const from = playerTarget(contribution.playerId) ?? fallback;
        for (let chip = 0; chip < contribution.amount; chip += 1) {
          const target = incoming[index] ?? finalLayout.points.at(-1);
          if (target) {
            coins.push({
              from,
              to: { x: rect.left + target.x, y: rect.top + target.y },
              radius: target.radius,
              delay: staggerDelay(index, total),
            });
          }
          index += 1;
        }
      }
      setDisplayPot(event.potBefore);
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
    'chips-between-players',
    (event, at) => {
      if (!animationsEnabled()) return;
      const to = playerTarget(event.toPlayerId);
      if (!to) return;
      const total = event.payments.reduce((sum, entry) => sum + entry.amount, 0);
      if (total <= 0) return;

      const coins: CoinFlight['coins'] = [];
      let index = 0;
      for (const payment of event.payments) {
        const from = playerTarget(payment.playerId);
        if (!from) {
          index += payment.amount;
          continue;
        }
        for (let chip = 0; chip < payment.amount; chip += 1) {
          coins.push({ from, to, radius: MAX_COIN_RADIUS, delay: staggerDelay(index, total) });
          index += 1;
        }
      }
      if (coins.length === 0) return;
      flightsRef.current = [
        ...flightsRef.current,
        {
          kind: 'coins',
          startedAt: at,
          travelMs: CHIP_TRANSFER_TRAVEL_MS,
          doneAt: at + CHIP_TRANSFER_TRAVEL_MS + CHIP_ANTE_STAGGER_MS,
          commitsPot: false,
          coins,
        },
      ];
      startLoop();
    },
    { replayLastMs: CHIP_EVENT_REPLAY_MS },
  );

  useTableEvent(
    'pot-to-winner',
    (event, at) => {
      if (!animationsEnabled()) return;
      const canvas = potCanvasRef.current;
      const target = playerTarget(event.winnerId);
      if (!canvas || !target || event.amount <= 0) return;
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
    potRef.current = pot;
    const potInFlight = flightsRef.current.some(
      (flight) => flight.kind === 'award' || (flight.kind === 'coins' && flight.commitsPot),
    );
    if (!potInFlight) setDisplayPot(pot);
  }, [pot]);

  useEffect(() => {
    const canvas = potCanvasRef.current;
    if (!canvas) return;
    const draw = () => drawPot(canvas, displayPot);
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

  return (
    <>
      <canvas
        ref={potCanvasRef}
        className="pot-chip-overlay"
        role="img"
        aria-label={`Pot: ${pot} chip${pot === 1 ? '' : 's'}`}
      />
      {/* Flight canvas draws in viewport coordinates; the top band's transform would
          re-root position:fixed onto the band, so it must portal out to <body>. */}
      {createPortal(
        <canvas ref={flowCanvasRef} className="chip-flow-overlay" aria-hidden />,
        document.body,
      )}
    </>
  );
}
