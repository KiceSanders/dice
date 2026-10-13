import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountTestRollButton } from './testRollButton';

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal('location', { hostname: 'localhost', pathname: '/room/ABC123' });
  vi.stubGlobal('sessionStorage', { getItem: () => '/room/ABC123' });
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const button = {
    style: {},
    disabled: false,
    onclick: null as null | (() => void),
    remove: vi.fn(),
  };
  vi.stubGlobal('document', { createElement: vi.fn(() => button) });
  const append = vi.fn();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 6, 6);
  camera.lookAt(0, 0, 0);
  const control = {
    canvas: {
      closest: () => ({ append }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    } as unknown as HTMLCanvasElement,
    camera,
    height: 1,
    canRoll: vi.fn(() => true),
    beginDrag: vi.fn(),
    finishDrag: vi.fn(),
  };
  return { button, control, append };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fixture-only roll control', () => {
  it('stays absent on ordinary local pages and remote hosts', () => {
    const { control, append } = setup();
    location.pathname = '/room/OTHER';
    expect(mountTestRollButton(control)).toBeUndefined();
    location.pathname = '/room/ABC123';
    location.hostname = 'dice.example.com';
    expect(mountTestRollButton(control)).toBeUndefined();
    expect(append).not.toHaveBeenCalled();
  });

  it('honors the live turn barrier and ignores repeated clicks during cup pickup', () => {
    const { button, control } = setup();
    control.canRoll.mockReturnValue(false);
    const dispose = mountTestRollButton(control)!;
    expect(button.disabled).toBe(true);
    button.onclick?.();
    expect(control.beginDrag).not.toHaveBeenCalled();
    control.canRoll.mockReturnValue(true);
    button.onclick?.();
    button.onclick?.();
    expect(control.beginDrag).toHaveBeenCalledTimes(1);
    expect(control.finishDrag).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(control.finishDrag).toHaveBeenCalledExactlyOnceWith({
      button: 0,
      clientX: control.beginDrag.mock.calls[0]![0],
      clientY: control.beginDrag.mock.calls[0]![1],
    });
    dispose();
  });

  it('cancels a pending release when the roller unmounts', () => {
    const { button, control } = setup();
    const dispose = mountTestRollButton(control)!;
    button.onclick?.();
    dispose();
    vi.runAllTimers();
    expect(control.finishDrag).not.toHaveBeenCalled();
    expect(button.remove).toHaveBeenCalledOnce();
  });
});
