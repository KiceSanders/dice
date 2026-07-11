import { layoutPotChips, type PotChipPoint } from './potChipLayout';

export interface ChipColors {
  face: string;
  highlight: string;
  edge: string;
  rim: string;
}

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
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

export function drawCoin(
  context: CanvasRenderingContext2D,
  point: PotChipPoint,
  colors: ChipColors,
) {
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

export function readChipColors(canvas: HTMLCanvasElement): ChipColors {
  const styles = getComputedStyle(canvas);
  return {
    face: styles.getPropertyValue('--pot-chip-face').trim(),
    highlight: styles.getPropertyValue('--pot-chip-highlight').trim(),
    edge: styles.getPropertyValue('--pot-chip-edge').trim(),
    rim: styles.getPropertyValue('--pot-chip-rim').trim(),
  };
}

export function drawPotPyramid(canvas: HTMLCanvasElement, count: number) {
  const rect = canvas.getBoundingClientRect();
  const context = prepareCanvas(canvas, rect.width, rect.height);
  if (!context) return;

  const colors = readChipColors(canvas);
  const layout = layoutPotChips(count, rect.width, rect.height - 2);
  for (const point of layout.points) drawCoin(context, point, colors);
}
