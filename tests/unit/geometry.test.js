import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GLASS_PARAMETERS,
  computeMaterialOverlay,
  computeRefractionOffset,
  fitContain,
  fitCover,
  normalizeCornerRadii,
  roundedRectangleDistance,
  sanitizeGlassParameters,
  viewportPointToTextureUv,
} from '../../src/liquid-glass/geometry.js';

describe('cover geometry', () => {
  it('covers a landscape viewport without changing the source aspect ratio', () => {
    const result = fitCover(1079, 1259, 1440, 900);

    expect(result.width).toBeCloseTo(1440, 8);
    expect(result.height / result.width).toBeCloseTo(1259 / 1079, 10);
    expect(result.x).toBeCloseTo(0, 8);
    expect(result.y).toBeLessThan(0);
  });

  it('maps the viewport centre to the texture centre', () => {
    const cover = fitCover(1079, 1259, 390, 844);
    const uv = viewportPointToTextureUv(
      { x: 195, y: 422 },
      { x: cover.x, y: cover.y, width: cover.width, height: cover.height },
    );

    expect(uv.u).toBeCloseTo(0.5, 10);
    expect(uv.v).toBeCloseTo(0.5, 10);
  });

  it('rejects invalid dimensions', () => {
    expect(() => fitCover(0, 1259, 390, 844)).toThrow(RangeError);
  });

  it('contains the whole portrait source on a wide viewport', () => {
    const result = fitContain(1079, 1259, 1440, 900);

    expect(result.height).toBeCloseTo(900, 8);
    expect(result.width).toBeLessThan(1440);
    expect(result.height / result.width).toBeCloseTo(1259 / 1079, 10);
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeCloseTo(0, 8);
  });
});

describe('rounded rectangle geometry', () => {
  it('normalizes colliding corner radii while keeping their proportions', () => {
    const radii = normalizeCornerRadii(
      { topLeft: 40, topRight: 40, bottomRight: 20, bottomLeft: 20 },
      52,
      52,
    );

    expect(radii.topLeft + radii.topRight).toBeCloseTo(52, 8);
    expect(radii.bottomLeft).toBeCloseTo(13, 8);
  });

  it('returns a negative distance inside and a positive distance outside', () => {
    const halfSize = { x: 26, y: 26 };
    expect(roundedRectangleDistance({ x: 0, y: 0 }, halfSize, 16)).toBeCloseTo(-26, 8);
    expect(roundedRectangleDistance({ x: 30, y: 30 }, halfSize, 16)).toBeGreaterThan(0);
  });
});

describe('liquid glass optics', () => {
  it('keeps the documented physical defaults', () => {
    expect(DEFAULT_GLASS_PARAMETERS).toMatchObject({
      width: 84,
      height: 84,
      radius: 26,
      thickness: 11,
      refractiveIndex: 1.5,
      refractionIntensity: 0.75,
      blurRadius: 6,
      tintAlpha: 0.52,
    });
  });

  it('has no displacement at the flat centre and bends near the edge', () => {
    const centre = computeRefractionOffset({ x: 42, y: 42 });
    const edge = computeRefractionOffset({ x: 2, y: 42 });

    expect(centre.inside).toBe(true);
    expect(centre.x).toBeCloseTo(0, 8);
    expect(centre.y).toBeCloseTo(0, 8);
    expect(edge.inside).toBe(true);
    expect(Math.abs(edge.x)).toBeGreaterThan(1);
    expect(Number.isFinite(edge.x)).toBe(true);
  });

  it('locks the DOM material to the reference fragment-shader coefficients', () => {
    const centre = computeMaterialOverlay({ x: 42, y: 42 });
    const topEdge = computeMaterialOverlay({ x: 42, y: 2 });
    const bottomEdge = computeMaterialOverlay({ x: 42, y: 82 });

    expect(centre).toMatchObject({
      red: 0.112,
      green: 0.112,
      blue: 0.112,
      alpha: 0.52,
      distance: -42,
    });
    expect(topEdge.red).toBeCloseTo(0.12402754927014792, 12);
    expect(topEdge.alpha).toBeCloseTo(0.5330787868825512, 12);
    expect(bottomEdge.red).toBeCloseTo(0.1079676255782619, 12);
    expect(bottomEdge.alpha).toBeCloseTo(0.5431227672237363, 12);
    expect(topEdge.red).toBeGreaterThan(bottomEdge.red);
  });

  it('sanitizes unsafe optical parameters', () => {
    const parameters = sanitizeGlassParameters({
      thickness: -4,
      refractiveIndex: 0.4,
      refractionIntensity: 9,
      tint: [-1, 0.5, 5],
    });

    expect(parameters.thickness).toBeGreaterThan(0);
    expect(parameters.refractiveIndex).toBeGreaterThan(1);
    expect(parameters.refractionIntensity).toBe(2);
    expect(parameters.tint).toEqual([0, 0.5, 1]);
  });
});
