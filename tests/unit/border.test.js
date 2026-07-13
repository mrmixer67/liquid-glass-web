import { describe, expect, it } from 'vitest';
import {
  computeDefaultGlassBorderPaths,
  DEFAULT_GLASS_BORDER,
} from '../../src/liquid-glass/LiquidGlass.js';

describe('default directional border geometry', () => {
  it('builds two inward filled bands for a 286x70 pill', () => {
    const paths = computeDefaultGlassBorderPaths(286, 70, 35);

    expect(paths).toEqual({
      radius: 35,
      top: 'M 35 0 H 251 A 35 35 0 0 1 286 35 H 0 A 35 35 0 0 1 35 0 Z M 34 1 H 252 A 34 34 0 0 1 286 35 H 0 A 34 34 0 0 1 34 1 Z',
      bottom: 'M 0 35 H 286 A 35 35 0 0 1 251 70 H 35 A 35 35 0 0 1 0 35 Z M 0 35 H 286 A 34.333333333333336 34.333333333333336 0 0 1 251.66666666666666 69.33333333333333 H 34.333333333333336 A 34.333333333333336 34.333333333333336 0 0 1 0 35 Z',
    });
  });

  it('clamps the radius like Android and keeps the exact source widths and alpha bytes', () => {
    expect(computeDefaultGlassBorderPaths(52, 40, 100).radius).toBe(20);
    expect(DEFAULT_GLASS_BORDER).toMatchObject({
      topWidth: 1,
      bottomWidth: 2 / 3,
      topColor: [255, 255, 255, 40 / 255],
      bottomColor: [255, 255, 255, 20 / 255],
      shadowColor: [0, 0, 0, 0],
    });
  });
});
