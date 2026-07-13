export const DEFAULT_GLASS_PARAMETERS = Object.freeze({
  width: 84,
  height: 84,
  radius: 26,
  thickness: 11,
  refractiveIndex: 1.5,
  refractionIntensity: 0.75,
  blurRadius: 6,
  tint: Object.freeze([0.112, 0.112, 0.112]),
  tintAlpha: 0.52,
});

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
const smoothstep = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

export function sanitizeGlassParameters(parameters = {}) {
  const merged = { ...DEFAULT_GLASS_PARAMETERS, ...parameters };

  return {
    width: Math.max(1, Number(merged.width) || DEFAULT_GLASS_PARAMETERS.width),
    height: Math.max(1, Number(merged.height) || DEFAULT_GLASS_PARAMETERS.height),
    radius: Math.max(0, Number(merged.radius) || 0),
    thickness: Math.max(0.001, Number(merged.thickness) || DEFAULT_GLASS_PARAMETERS.thickness),
    refractiveIndex: Math.max(1.0001, Number(merged.refractiveIndex) || DEFAULT_GLASS_PARAMETERS.refractiveIndex),
    refractionIntensity: clamp(Number(merged.refractionIntensity) || 0, 0, 2),
    blurRadius: clamp(Number(merged.blurRadius) || 0, 0, 12),
    tint: Array.isArray(merged.tint) && merged.tint.length === 3
      ? merged.tint.map((channel) => clamp(Number(channel) || 0, 0, 1))
      : [...DEFAULT_GLASS_PARAMETERS.tint],
    tintAlpha: clamp(Number(merged.tintAlpha) || 0, 0, 1),
  };
}

export function fitCover(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Cover dimensions must be finite positive numbers.');
  }

  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    scale,
    width,
    height,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

export function fitContain(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Contain dimensions must be finite positive numbers.');
  }

  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    scale,
    width,
    height,
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
  };
}

export function viewportPointToTextureUv(point, imageRect) {
  if (!imageRect || imageRect.width <= 0 || imageRect.height <= 0) {
    throw new RangeError('Image rectangle must have positive dimensions.');
  }

  return {
    u: (point.x - imageRect.x) / imageRect.width,
    v: 1 - (point.y - imageRect.y) / imageRect.height,
  };
}

export function normalizeCornerRadii(radii, width, height) {
  const safe = {
    topLeft: Math.max(0, radii.topLeft || 0),
    topRight: Math.max(0, radii.topRight || 0),
    bottomRight: Math.max(0, radii.bottomRight || 0),
    bottomLeft: Math.max(0, radii.bottomLeft || 0),
  };

  const ratios = [
    width / Math.max(safe.topLeft + safe.topRight, Number.EPSILON),
    width / Math.max(safe.bottomLeft + safe.bottomRight, Number.EPSILON),
    height / Math.max(safe.topLeft + safe.bottomLeft, Number.EPSILON),
    height / Math.max(safe.topRight + safe.bottomRight, Number.EPSILON),
  ];
  const scale = Math.min(1, ...ratios);

  return Object.fromEntries(Object.entries(safe).map(([key, value]) => [key, value * scale]));
}

export function roundedRectangleDistance(point, halfSize, radius) {
  const safeRadius = Math.min(Math.max(radius, 0), halfSize.x, halfSize.y);
  const qx = Math.abs(point.x) - halfSize.x + safeRadius;
  const qy = Math.abs(point.y) - halfSize.y + safeRadius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);

  return outside + inside - safeRadius;
}

function normalize3(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function refract(incident, normal, eta) {
  const dot = incident.x * normal.x + incident.y * normal.y + incident.z * normal.z;
  const discriminant = 1 - eta * eta * (1 - dot * dot);
  if (discriminant < 0) {
    return { x: 0, y: 0, z: 0 };
  }

  const factor = eta * dot + Math.sqrt(discriminant);
  return {
    x: eta * incident.x - factor * normal.x,
    y: eta * incident.y - factor * normal.y,
    z: eta * incident.z - factor * normal.z,
  };
}

export function computeRefractionOffset(localPoint, parameters = DEFAULT_GLASS_PARAMETERS) {
  const config = sanitizeGlassParameters(parameters);
  const halfSize = { x: config.width / 2, y: config.height / 2 };
  const centered = {
    x: localPoint.x - halfSize.x,
    y: localPoint.y - halfSize.y,
  };
  const distance = roundedRectangleDistance(centered, halfSize, config.radius);

  if (distance >= 0) {
    return { x: 0, y: 0, distance, inside: false };
  }

  const dx = roundedRectangleDistance({ x: centered.x + 1, y: centered.y }, halfSize, config.radius) - distance;
  const dy = roundedRectangleDistance({ x: centered.x, y: centered.y + 1 }, halfSize, config.radius) - distance;
  const tangent = clamp((config.thickness + distance) / config.thickness, 0, 1);
  const normal = normalize3({
    x: dx * tangent,
    y: dy * tangent,
    z: Math.sqrt(Math.max(0, 1 - tangent * tangent)),
  });
  const ray = refract({ x: 0, y: 0, z: -1 }, normal, 1 / config.refractiveIndex);
  const capDepth = distance < -config.thickness
    ? config.thickness
    : Math.sqrt(Math.max(0, distance * (-2 * config.thickness - distance)));
  const travel = (capDepth + 8 * config.thickness) / Math.max(-ray.z, 0.0001);

  return {
    x: ray.x * travel * config.refractionIntensity,
    y: ray.y * travel * config.refractionIntensity,
    distance,
    inside: true,
  };
}

/**
 * Converts the non-backdrop part of the reference fragment shader into one
 * source-over pixel. The returned RGBA represents exactly the affine material
 * operation `output = backdrop * (1 - alpha) + rgb * alpha` used by DOM mode.
 */
export function computeMaterialOverlay(
  localPoint,
  parameters = DEFAULT_GLASS_PARAMETERS,
  interaction = 0,
  selected = false,
  pointer = { x: 0.28, y: 0.2 },
) {
  const config = sanitizeGlassParameters(parameters);
  const halfSize = { x: config.width / 2, y: config.height / 2 };
  const centered = {
    x: localPoint.x - halfSize.x,
    y: localPoint.y - halfSize.y,
  };
  const distance = roundedRectangleDistance(centered, halfSize, config.radius);

  if (distance >= 0.72) {
    return { red: 0, green: 0, blue: 0, alpha: 0, distance };
  }

  const dx = roundedRectangleDistance({ x: centered.x + 1, y: centered.y }, halfSize, config.radius) - distance;
  const dy = roundedRectangleDistance({ x: centered.x, y: centered.y + 1 }, halfSize, config.radius) - distance;
  const tangent = clamp((config.thickness + distance) / config.thickness, 0, 1);
  const normal = normalize3({
    x: dx * tangent,
    y: dy * tangent,
    z: Math.sqrt(Math.max(0, 1 - tangent * tangent)),
  });
  const edgeBand = smoothstep(-2.2, -0.08, distance);
  const gradientLength = Math.hypot(dx, dy);
  const edgeX = gradientLength > 0.001 ? dx / gradientLength : 0;
  const edgeY = gradientLength > 0.001 ? dy / gradientLength : 0;
  const topLightLength = Math.hypot(-0.42, -0.91);
  const lowerLightLength = Math.hypot(0.35, 0.94);
  const topReflection = Math.max((edgeX * -0.42 + edgeY * -0.91) / topLightLength, 0);
  const lowerShadow = Math.max((edgeX * 0.35 + edgeY * 0.94) / lowerLightLength, 0);
  const fresnel = (1 - clamp(normal.z, 0, 1)) ** 2.25;
  const pointerX = pointer.x * config.width;
  const pointerY = pointer.y * config.height;
  const pointerDistanceSquared = (localPoint.x - pointerX) ** 2 + (localPoint.y - pointerY) ** 2;
  const pointerGlow = Math.exp(-pointerDistanceSquared / 180) * interaction;
  const reflection = edgeBand * (0.12 + 0.28 * topReflection + 0.1 * fresnel + 0.1 * pointerGlow);
  const lowerMultiplier = 1 - edgeBand * lowerShadow * 0.12;
  const innerShade = smoothstep(-6, -0.25, distance) * (0.035 + 0.025 * lowerShadow);
  const shadeMultiplier = lowerMultiplier * (1 - innerShade);
  const tintAlpha = clamp(config.tintAlpha + (selected ? 0.055 : 0), 0, 1);
  const backdropMultiplier = (1 - tintAlpha) * shadeMultiplier;
  const alpha = clamp(1 - backdropMultiplier, 0, 1);
  const constant = config.tint.map((channel) => (channel * tintAlpha + reflection) * shadeMultiplier);

  return {
    red: alpha > 0 ? clamp(constant[0] / alpha, 0, 1) : 0,
    green: alpha > 0 ? clamp(constant[1] / alpha, 0, 1) : 0,
    blue: alpha > 0 ? clamp(constant[2] / alpha, 0, 1) : 0,
    alpha,
    distance,
  };
}
