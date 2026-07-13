import { describe, expect, it } from 'vitest';
import { borderPresets, defaults, version } from '../../src/liquid-glass/api.js';

describe('standalone library API', () => {
  it('exposes the default material as immutable defaults', () => {
    expect(defaults).toMatchObject({
      mode: 'dom',
      width: 84,
      height: 84,
      radius: 26,
      thickness: 11,
      refractiveIndex: 1.5,
      refractionIntensity: 0.75,
      blurRadius: 6,
      tint: [0.112, 0.112, 0.112],
      tintAlpha: 0.52,
      draggable: true,
      constrain: true,
      margin: 8,
      border: true,
      ignore: [],
    });
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(Object.isFrozen(defaults.tint)).toBe(true);
    expect(Object.isFrozen(defaults.ignore)).toBe(true);
  });

  it('publishes a semantic library version', () => {
    expect(version).toBe('0.0.1');
  });

  it('locks the exact default directional stroke preset', () => {
    expect(borderPresets.default).toEqual({
      topWidth: 1,
      bottomWidth: 2 / 3,
      topColor: [255, 255, 255, 0x28 / 0xFF],
      bottomColor: [255, 255, 255, 0x14 / 0xFF],
      shadowColor: [0, 0, 0, 0],
    });
    expect(Object.isFrozen(borderPresets)).toBe(true);
    expect(Object.isFrozen(borderPresets.default)).toBe(true);
  });
});
