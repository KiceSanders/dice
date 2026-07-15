import { describe, expect, it } from 'vitest';
import { TABLE_VIEWPORT_RESERVE_PX, tableFrameHeight, tableFrameMaxWidth } from './viewportFit';

describe('desktop table visual-viewport fit', () => {
  it.each([
    600, 650, 768, 900,
  ])('keeps the complete frame inside a %ipx-tall browser viewport', (viewportHeight) => {
    const width = tableFrameMaxWidth(viewportHeight);
    expect(tableFrameHeight(width)).toBeLessThanOrEqual(
      viewportHeight - TABLE_VIEWPORT_RESERVE_PX + 1e-6,
    );
    expect(tableFrameHeight(width + 0.1)).toBeGreaterThan(
      viewportHeight - TABLE_VIEWPORT_RESERVE_PX,
    );
  });

  it('shrinks a short Chromebook viewport without changing the canvas ratio', () => {
    const width = tableFrameMaxWidth(650);
    expect(width).toBeGreaterThan(1070);
    expect(width).toBeLessThan(1085);
  });
});
