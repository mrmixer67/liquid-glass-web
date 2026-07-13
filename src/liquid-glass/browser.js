/*! LiquidGlass Web v0.0.1 | MIT License | live DOM backdrop + WebGL texture mode */
import {
  LiquidGlassInstance,
  attach,
  attachAll,
  borderPresets,
  defaults,
  detach,
  get,
  version,
} from './api.js';

const api = Object.freeze({
  attach,
  attachAll,
  borderPresets,
  defaults,
  detach,
  get,
  Instance: LiquidGlassInstance,
  version,
});

globalThis.LiquidGlass = api;

export default api;
