import {
  DEFAULT_GLASS_BORDER,
  LiquidGlass as LiquidGlassInstance,
} from './LiquidGlass.js';
import { DEFAULT_GLASS_PARAMETERS } from './geometry.js';

const instances = new WeakMap();

export const defaults = Object.freeze({
  ...DEFAULT_GLASS_PARAMETERS,
  tint: Object.freeze([...DEFAULT_GLASS_PARAMETERS.tint]),
  mode: 'dom',
  draggable: true,
  constrain: true,
  margin: 8,
  fit: undefined,
  applyStyles: true,
  applySize: true,
  replaceBackground: true,
  shadow: true,
  border: true,
  ignore: Object.freeze([]),
});

export const borderPresets = Object.freeze({
  default: DEFAULT_GLASS_BORDER,
});

export const version = '0.0.1';

function resolveElement(value, label) {
  if (value instanceof Element) {
    return value;
  }
  if (typeof value === 'string') {
    const element = document.querySelector(value);
    if (element) {
      return element;
    }
  }
  throw new TypeError(`LiquidGlass ${label} must be an Element or a valid selector.`);
}

function querySelectorSafely(value) {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return document.querySelector(value);
  } catch {
    return null;
  }
}

export async function ensureImageReady(image) {
  if (!(image instanceof HTMLImageElement)) {
    throw new TypeError('LiquidGlass source must resolve to an HTMLImageElement or image URL.');
  }
  if (!image.complete) {
    await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', () => reject(new Error(`LiquidGlass could not load ${image.currentSrc || image.src}.`)), { once: true });
    });
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('LiquidGlass source image has no readable dimensions.');
  }
  if (typeof image.decode === 'function') {
    await image.decode();
  }
  return image;
}

async function resolveSource(source, crossOrigin) {
  if (source instanceof HTMLImageElement) {
    return { image: await ensureImageReady(source), detached: false };
  }

  const selected = querySelectorSafely(source);
  if (selected) {
    if (!(selected instanceof HTMLImageElement)) {
      throw new TypeError('LiquidGlass source selector must point to an <img>.');
    }
    return { image: await ensureImageReady(selected), detached: false };
  }

  if (typeof source !== 'string' || source.trim() === '') {
    throw new TypeError('LiquidGlass requires source: an <img>, selector, or image URL.');
  }

  const image = new Image();
  const url = new URL(source, window.location.href);
  if (crossOrigin !== null && (crossOrigin || url.origin !== window.location.origin)) {
    image.crossOrigin = crossOrigin || 'anonymous';
  }
  image.src = url.href;
  return { image: await ensureImageReady(image), detached: true };
}

function resolveOptionalElement(value, label) {
  if (value == null) {
    return null;
  }
  return resolveElement(value, label);
}

function parametersFrom(options) {
  const values = { ...options.parameters };
  for (const key of Object.keys(DEFAULT_GLASS_PARAMETERS)) {
    if (key in options) {
      values[key] = options[key];
    }
  }
  return values;
}

export async function attach(target, options = {}) {
  const element = resolveElement(target, 'target');
  const existing = instances.get(element);
  if (existing && !existing.destroyed) {
    const bounds = resolveOptionalElement(options.bounds, 'bounds');
    existing.update({ ...options, ...(bounds ? { bounds } : {}) });
    return existing;
  }

  const dataSource = element.dataset.liquidGlassSource;
  const mode = options.mode || (options.source || dataSource ? 'texture' : defaults.mode);
  let image;
  let sourceBounds;
  if (mode === 'texture') {
    const sourceValue = options.source || dataSource || '#scene-background';
    const resolved = await resolveSource(sourceValue, options.crossOrigin);
    image = resolved.image;
    sourceBounds = resolveOptionalElement(options.sourceBounds, 'sourceBounds')
      || (resolved.detached ? document.documentElement : image);
  }
  const bounds = resolveOptionalElement(options.bounds, 'bounds');
  const instance = new LiquidGlassInstance(element, {
    mode,
    source: image,
    sourceBounds,
    fit: options.fit,
    parameters: parametersFrom(options),
    draggable: options.draggable ?? defaults.draggable,
    constrain: options.constrain ?? defaults.constrain,
    bounds,
    margin: options.margin ?? defaults.margin,
    applyStyles: options.applyStyles ?? defaults.applyStyles,
    applySize: options.applySize ?? defaults.applySize,
    replaceBackground: options.replaceBackground ?? defaults.replaceBackground,
    shadow: options.shadow ?? defaults.shadow,
    border: options.border ?? defaults.border,
    ignore: options.ignore ?? defaults.ignore,
    onMove: options.onMove,
  });
  instances.set(element, instance);
  return instance;
}

export async function attachAll(targets = '[data-liquid-glass]', options = {}) {
  const elements = typeof targets === 'string' ? [...document.querySelectorAll(targets)] : [...targets];
  return Promise.all(elements.map((element) => attach(element, options)));
}

export function get(target) {
  const element = resolveElement(target, 'target');
  const instance = instances.get(element);
  return instance && !instance.destroyed ? instance : null;
}

export function detach(target) {
  const element = resolveElement(target, 'target');
  const instance = instances.get(element);
  if (!instance) {
    return false;
  }
  instance.destroy();
  instances.delete(element);
  return true;
}

export { DEFAULT_GLASS_BORDER, LiquidGlassInstance };
