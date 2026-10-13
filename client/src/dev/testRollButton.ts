import { type Camera, Vector3 } from 'three';

interface TestRollControl {
  canvas: HTMLCanvasElement;
  camera: Camera;
  height: number;
  canRoll: () => boolean;
  beginDrag: (x: number, y: number) => void;
  finishDrag: (event: Pick<PointerEvent, 'button' | 'clientX' | 'clientY'>) => void;
}

/** Local fixture UI only; uses the normal cup grab/release and physics settlement. */
export function mountTestRollButton(control: TestRollControl): (() => void) | undefined {
  if (
    !import.meta.env.DEV ||
    !['localhost', '127.0.0.1'].includes(location.hostname) ||
    sessionStorage.getItem('dice:visual-test:path') !== location.pathname
  ) {
    return;
  }
  const viewport = control.canvas.closest('.table-3d-viewport');
  if (!viewport) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Test roll';
  button.title = 'Local testing only: release the cup automatically';
  Object.assign(button.style, { position: 'absolute', top: '12px', left: '12px', zIndex: '10' });
  viewport.append(button);

  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number;
  const update = () => {
    button.disabled = releaseTimer !== undefined || !control.canRoll();
    frame = requestAnimationFrame(update);
  };
  update();
  button.onclick = () => {
    if (releaseTimer !== undefined || !control.canRoll()) return;
    // Project the center of the cup's carry plane, independent of viewport size.
    control.camera.updateMatrixWorld();
    const point = new Vector3(0, control.height, 0).project(control.camera);
    const rect = control.canvas.getBoundingClientRect();
    const clientX = rect.left + ((point.x + 1) / 2) * rect.width;
    const clientY = rect.top + ((1 - point.y) / 2) * rect.height;
    control.beginDrag(clientX, clientY);
    button.disabled = true;
    // Give React/physics time to mount the held cup before the ordinary release.
    // Its existing dead-drop nudge makes the dice tumble without synthetic results.
    releaseTimer = setTimeout(() => {
      releaseTimer = undefined;
      control.finishDrag({ button: 0, clientX, clientY });
    }, 250);
  };
  return () => {
    clearTimeout(releaseTimer);
    cancelAnimationFrame(frame);
    button.onclick = null;
    button.remove();
  };
}
