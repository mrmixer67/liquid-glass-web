var LiquidGlassBundle = (function() {
  "use strict";/*! LiquidGlass Web v0.0.1 | MIT License | live DOM backdrop + WebGL texture mode */

  const DEFAULT_GLASS_PARAMETERS = Object.freeze({
    width: 84,
    height: 84,
    radius: 26,
    thickness: 11,
    refractiveIndex: 1.5,
    refractionIntensity: 0.75,
    blurRadius: 6,
    tint: Object.freeze([0.112, 0.112, 0.112]),
    tintAlpha: 0.52
  });
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const smoothstep = (minimum, maximum, value) => {
    const t = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function sanitizeGlassParameters(parameters = {}) {
    const merged = { ...DEFAULT_GLASS_PARAMETERS, ...parameters };
    return {
      width: Math.max(1, Number(merged.width) || DEFAULT_GLASS_PARAMETERS.width),
      height: Math.max(1, Number(merged.height) || DEFAULT_GLASS_PARAMETERS.height),
      radius: Math.max(0, Number(merged.radius) || 0),
      thickness: Math.max(1e-3, Number(merged.thickness) || DEFAULT_GLASS_PARAMETERS.thickness),
      refractiveIndex: Math.max(1.0001, Number(merged.refractiveIndex) || DEFAULT_GLASS_PARAMETERS.refractiveIndex),
      refractionIntensity: clamp(Number(merged.refractionIntensity) || 0, 0, 2),
      blurRadius: clamp(Number(merged.blurRadius) || 0, 0, 12),
      tint: Array.isArray(merged.tint) && merged.tint.length === 3 ? merged.tint.map((channel) => clamp(Number(channel) || 0, 0, 1)) : [...DEFAULT_GLASS_PARAMETERS.tint],
      tintAlpha: clamp(Number(merged.tintAlpha) || 0, 0, 1)
    };
  }
  function fitCover(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new RangeError("Cover dimensions must be finite positive numbers.");
    }
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      scale,
      width,
      height,
      x: (targetWidth - width) / 2,
      y: (targetHeight - height) / 2
    };
  }
  function fitContain(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if ([sourceWidth, sourceHeight, targetWidth, targetHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new RangeError("Contain dimensions must be finite positive numbers.");
    }
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      scale,
      width,
      height,
      x: (targetWidth - width) / 2,
      y: (targetHeight - height) / 2
    };
  }
  function roundedRectangleDistance(point, halfSize, radius) {
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
      z: eta * incident.z - factor * normal.z
    };
  }
  function computeRefractionOffset(localPoint, parameters = DEFAULT_GLASS_PARAMETERS) {
    const config = sanitizeGlassParameters(parameters);
    const halfSize = { x: config.width / 2, y: config.height / 2 };
    const centered = {
      x: localPoint.x - halfSize.x,
      y: localPoint.y - halfSize.y
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
      z: Math.sqrt(Math.max(0, 1 - tangent * tangent))
    });
    const ray = refract({ x: 0, y: 0, z: -1 }, normal, 1 / config.refractiveIndex);
    const capDepth = distance < -config.thickness ? config.thickness : Math.sqrt(Math.max(0, distance * (-2 * config.thickness - distance)));
    const travel = (capDepth + 8 * config.thickness) / Math.max(-ray.z, 1e-4);
    return {
      x: ray.x * travel * config.refractionIntensity,
      y: ray.y * travel * config.refractionIntensity,
      distance,
      inside: true
    };
  }
  function computeMaterialOverlay(localPoint, parameters = DEFAULT_GLASS_PARAMETERS, interaction = 0, selected = false, pointer = { x: 0.28, y: 0.2 }) {
    const config = sanitizeGlassParameters(parameters);
    const halfSize = { x: config.width / 2, y: config.height / 2 };
    const centered = {
      x: localPoint.x - halfSize.x,
      y: localPoint.y - halfSize.y
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
      z: Math.sqrt(Math.max(0, 1 - tangent * tangent))
    });
    const edgeBand = smoothstep(-2.2, -0.08, distance);
    const gradientLength = Math.hypot(dx, dy);
    const edgeX = gradientLength > 1e-3 ? dx / gradientLength : 0;
    const edgeY = gradientLength > 1e-3 ? dy / gradientLength : 0;
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
      distance
    };
  }
  const vertexShaderSource = `
  attribute vec2 aPosition;

  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;
  const fragmentShaderSource = `
  precision highp float;

  uniform sampler2D uBackdrop;
  uniform vec2 uPanelSize;
  uniform vec2 uElementOrigin;
  uniform vec2 uImageOffset;
  uniform vec2 uImageDrawSize;
  uniform vec2 uPointer;
  uniform vec3 uTint;
  uniform float uPixelRatio;
  uniform float uRadius;
  uniform float uThickness;
  uniform float uRefractiveIndex;
  uniform float uRefractionIntensity;
  uniform float uBlurRadius;
  uniform float uTintAlpha;
  uniform float uInteraction;
  uniform float uSelected;

  float roundedBoxDistance(vec2 point, vec2 halfExtent, float radius) {
    float safeRadius = min(radius, min(halfExtent.x, halfExtent.y));
    vec2 q = abs(point) - halfExtent + safeRadius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - safeRadius;
  }

  vec2 backdropUv(vec2 viewportPoint) {
    vec2 imagePoint = (viewportPoint - uImageOffset) / uImageDrawSize;
    return vec2(imagePoint.x, 1.0 - imagePoint.y);
  }

  vec3 backdropSample(vec2 viewportPoint, float blurAmount) {
    float sigma = max(blurAmount * 0.5, 0.001);
    float stepSize = blurAmount * 0.5;
    vec3 accumulator = vec3(0.0);
    float weightSum = 0.0;

    for (int x = -2; x <= 2; x++) {
      for (int y = -2; y <= 2; y++) {
        vec2 offset = vec2(float(x), float(y)) * stepSize;
        float weight = exp(-dot(offset, offset) / (2.0 * sigma * sigma));
        accumulator += texture2D(uBackdrop, backdropUv(viewportPoint + offset)).rgb * weight;
        weightSum += weight;
      }
    }

    return accumulator / max(weightSum, 0.001);
  }

  vec3 adjustSaturation(vec3 color, float saturation) {
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luminance), color, saturation);
  }

  void main() {
    vec2 local = vec2(
      gl_FragCoord.x / uPixelRatio,
      uPanelSize.y - gl_FragCoord.y / uPixelRatio
    );
    vec2 halfExtent = uPanelSize * 0.5;
    vec2 centered = local - halfExtent;
    float distanceToEdge = roundedBoxDistance(centered, halfExtent, uRadius);
    float coverage = 1.0 - smoothstep(-0.72, 0.72, distanceToEdge);

    if (coverage <= 0.001) {
      discard;
    }

    float distanceX = roundedBoxDistance(centered + vec2(1.0, 0.0), halfExtent, uRadius);
    float distanceY = roundedBoxDistance(centered + vec2(0.0, 1.0), halfExtent, uRadius);
    vec2 fieldGradient = vec2(distanceX - distanceToEdge, distanceY - distanceToEdge);
    float tangentAmount = clamp((uThickness + distanceToEdge) / uThickness, 0.0, 1.0);
    float normalZ = sqrt(max(0.0, 1.0 - tangentAmount * tangentAmount));
    vec3 surfaceNormal = normalize(vec3(fieldGradient * tangentAmount, normalZ));

    vec3 incident = vec3(0.0, 0.0, -1.0);
    vec3 bentRay = refract(incident, surfaceNormal, 1.0 / uRefractiveIndex);
    float capDepth = distanceToEdge < -uThickness
      ? uThickness
      : sqrt(max(0.0, distanceToEdge * (-2.0 * uThickness - distanceToEdge)));
    float rayTravel = (capDepth + 8.0 * uThickness) / max(-bentRay.z, 0.05);
    float liveIntensity = uRefractionIntensity * (1.0 + 0.1 * uInteraction + 0.05 * uSelected);
    vec2 refractedPoint = uElementOrigin + local + bentRay.xy * rayTravel * liveIntensity;

    vec3 color = backdropSample(refractedPoint, uBlurRadius + uInteraction * 0.18);
    color = adjustSaturation(color, 3.0);
    color = mix(color, uTint, uTintAlpha + uSelected * 0.055);

    float edgeBand = smoothstep(-2.2, -0.08, distanceToEdge);
    vec2 edgeDirection = length(fieldGradient) > 0.001 ? normalize(fieldGradient) : vec2(0.0);
    float topReflection = max(dot(edgeDirection, normalize(vec2(-0.42, -0.91))), 0.0);
    float lowerShadow = max(dot(edgeDirection, normalize(vec2(0.35, 0.94))), 0.0);
    float fresnel = pow(1.0 - clamp(surfaceNormal.z, 0.0, 1.0), 2.25);

    vec2 pointerPx = uPointer * uPanelSize;
    float pointerGlow = exp(-dot(local - pointerPx, local - pointerPx) / 180.0) * uInteraction;
    float reflection = edgeBand * (0.12 + 0.28 * topReflection + 0.1 * fresnel + 0.1 * pointerGlow);
    color += vec3(reflection);
    color *= 1.0 - edgeBand * lowerShadow * 0.12;

    float innerShade = smoothstep(-6.0, -0.25, distanceToEdge) * (0.035 + 0.025 * lowerShadow);
    color *= 1.0 - innerShade;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * coverage, coverage);
  }
`;
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Unknown WebGL shader compilation error.";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }
  function createProgram(gl) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown WebGL program link error.";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }
  function uniformLocations(gl, program) {
    const names = [
      "uBackdrop",
      "uPanelSize",
      "uElementOrigin",
      "uImageOffset",
      "uImageDrawSize",
      "uPointer",
      "uTint",
      "uPixelRatio",
      "uRadius",
      "uThickness",
      "uRefractiveIndex",
      "uRefractionIntensity",
      "uBlurRadius",
      "uTintAlpha",
      "uInteraction",
      "uSelected"
    ];
    return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]));
  }
  const DEFAULT_SHADOW = "0 0.67px 3.67px rgb(0 0 0 / 30%), 0 4px 14px rgb(0 0 0 / 16%)";
  const DEFAULT_GLASS_BORDER = Object.freeze({
    topWidth: 1,
    bottomWidth: 2 / 3,
    topColor: Object.freeze([255, 255, 255, 40 / 255]),
    bottomColor: Object.freeze([255, 255, 255, 20 / 255]),
    shadowColor: Object.freeze([0, 0, 0, 0])
  });
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  let filterSequence = 0;
  function topBorderPath(width, radius, strokeWidth) {
    const innerRadius = radius - strokeWidth;
    return [
      `M ${radius} 0 H ${width - radius}`,
      `A ${radius} ${radius} 0 0 1 ${width} ${radius}`,
      `H 0 A ${radius} ${radius} 0 0 1 ${radius} 0 Z`,
      `M ${innerRadius} ${strokeWidth} H ${width - innerRadius}`,
      `A ${innerRadius} ${innerRadius} 0 0 1 ${width} ${radius}`,
      `H 0 A ${innerRadius} ${innerRadius} 0 0 1 ${innerRadius} ${strokeWidth} Z`
    ].join(" ");
  }
  function bottomBorderPath(width, height, radius, strokeWidth) {
    const innerRadius = radius - strokeWidth;
    return [
      `M 0 ${height - radius} H ${width}`,
      `A ${radius} ${radius} 0 0 1 ${width - radius} ${height}`,
      `H ${radius} A ${radius} ${radius} 0 0 1 0 ${height - radius} Z`,
      `M 0 ${height - radius} H ${width}`,
      `A ${innerRadius} ${innerRadius} 0 0 1 ${width - innerRadius} ${height - strokeWidth}`,
      `H ${innerRadius} A ${innerRadius} ${innerRadius} 0 0 1 0 ${height - radius} Z`
    ].join(" ");
  }
  function computeDefaultGlassBorderPaths(width, height, requestedRadius) {
    const safeWidth = Math.max(0, Number(width) || 0);
    const safeHeight = Math.max(0, Number(height) || 0);
    const radius = Math.min(
      Math.max(0, Number(requestedRadius) || 0),
      safeWidth / 2,
      safeHeight / 2
    );
    if (safeWidth <= 0 || safeHeight <= 0 || radius <= DEFAULT_GLASS_BORDER.topWidth) {
      return { radius, top: "", bottom: "" };
    }
    return {
      radius,
      top: topBorderPath(safeWidth, radius, DEFAULT_GLASS_BORDER.topWidth),
      bottom: bottomBorderPath(
        safeWidth,
        safeHeight,
        radius,
        DEFAULT_GLASS_BORDER.bottomWidth
      )
    };
  }
  const MANAGED_STYLE_PROPERTIES = [
    "position",
    "width",
    "height",
    "borderRadius",
    "overflow",
    "isolation",
    "boxSizing",
    "background",
    "touchAction",
    "cursor",
    "boxShadow",
    "transition",
    "translate",
    "webkitTapHighlightColor",
    "webkitBackdropFilter",
    "backdropFilter"
  ];
  function snapshotInlineStyles(element) {
    return Object.fromEntries(MANAGED_STYLE_PROPERTIES.map((property) => [property, element.style[property]]));
  }
  function buildDisplacementMap(parameters, width, height) {
    const qualityScale = Math.min(1, 192 / Math.max(width, height));
    const mapWidth = Math.max(2, Math.round(width * qualityScale));
    const mapHeight = Math.max(2, Math.round(height * qualityScale));
    const offsets = new Float32Array(mapWidth * mapHeight * 2);
    const optics = { ...parameters, width, height };
    let maximumOffset = 0;
    for (let y = 0; y < mapHeight; y += 1) {
      for (let x = 0; x < mapWidth; x += 1) {
        const point = {
          x: (x + 0.5) / mapWidth * width,
          y: (y + 0.5) / mapHeight * height
        };
        const offset = computeRefractionOffset(point, optics);
        const index = (y * mapWidth + x) * 2;
        offsets[index] = offset.x;
        offsets[index + 1] = offset.y;
        maximumOffset = Math.max(maximumOffset, Math.abs(offset.x), Math.abs(offset.y));
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d");
    const image = context.createImageData(mapWidth, mapHeight);
    const displacementScale = Math.max(1e-3, maximumOffset * 2);
    for (let index = 0; index < mapWidth * mapHeight; index += 1) {
      const offsetIndex = index * 2;
      const pixelIndex = index * 4;
      image.data[pixelIndex] = Math.round(255 * (0.5 + offsets[offsetIndex] / displacementScale));
      image.data[pixelIndex + 1] = Math.round(255 * (0.5 + offsets[offsetIndex + 1] / displacementScale));
      image.data[pixelIndex + 2] = 128;
      image.data[pixelIndex + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      scale: displacementScale
    };
  }
  function buildMaterialMap(parameters, width, height, interaction, selected, pointer) {
    const qualityScale = Math.min(1, 192 / Math.max(width, height));
    const mapWidth = Math.max(2, Math.round(width * qualityScale));
    const mapHeight = Math.max(2, Math.round(height * qualityScale));
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d");
    const image = context.createImageData(mapWidth, mapHeight);
    const optics = { ...parameters, width, height };
    for (let y = 0; y < mapHeight; y += 1) {
      for (let x = 0; x < mapWidth; x += 1) {
        const material = computeMaterialOverlay({
          x: (x + 0.5) / mapWidth * width,
          y: (y + 0.5) / mapHeight * height
        }, optics, interaction, selected, pointer);
        const index = (y * mapWidth + x) * 4;
        image.data[index] = Math.round(material.red * 255);
        image.data[index + 1] = Math.round(material.green * 255);
        image.data[index + 2] = Math.round(material.blue * 255);
        image.data[index + 3] = Math.round(material.alpha * 255);
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }
  function isWebKitWithoutBackdropUrl() {
    const userAgent = navigator.userAgent;
    return /AppleWebKit/i.test(userAgent) && !/(Chrome|Chromium|Edg|OPR)/i.test(userAgent);
  }
  function normalizeIgnoreEntries(value) {
    if (value == null) {
      return [];
    }
    if (typeof value === "string" || value instanceof Element) {
      return [value];
    }
    if (typeof value[Symbol.iterator] !== "function") {
      throw new TypeError("LiquidGlass ignore must be a selector, Element, or iterable of them.");
    }
    const entries = [...value];
    if (entries.some((entry) => typeof entry !== "string" && !(entry instanceof Element))) {
      throw new TypeError("LiquidGlass ignore entries must be CSS selectors or Elements.");
    }
    return entries;
  }
  class LiquidGlass {
    constructor(element, {
      mode = "texture",
      source,
      sourceBounds = source,
      fit,
      parameters = {},
      draggable = true,
      constrain = true,
      bounds,
      margin = 8,
      applyStyles = true,
      applySize = true,
      replaceBackground = true,
      shadow = true,
      border = true,
      ignore = [],
      onMove
    } = {}) {
      if (!(element instanceof HTMLElement)) {
        throw new TypeError("LiquidGlass requires a host HTMLElement.");
      }
      if (!["dom", "texture"].includes(mode)) {
        throw new TypeError('LiquidGlass mode must be "dom" or "texture".');
      }
      if (mode === "texture" && !(source instanceof HTMLImageElement)) {
        throw new TypeError("LiquidGlass requires a source HTMLImageElement.");
      }
      if (mode === "texture" && !(sourceBounds instanceof Element)) {
        throw new TypeError("LiquidGlass sourceBounds must be an Element.");
      }
      this.element = element;
      this.mode = mode;
      this.source = source;
      this.sourceBounds = sourceBounds;
      this.fit = fit;
      this.parameters = sanitizeGlassParameters({ ...DEFAULT_GLASS_PARAMETERS, ...parameters });
      this.draggable = Boolean(draggable);
      this.shouldConstrain = Boolean(constrain);
      this.bounds = bounds instanceof Element ? bounds : null;
      this.margin = Math.max(0, Number(margin) || 0);
      this.applyStyles = Boolean(applyStyles);
      this.applySize = Boolean(applySize);
      this.replaceBackground = Boolean(replaceBackground);
      this.shadow = shadow;
      this.border = border;
      this.ignoreEntries = normalizeIgnoreEntries(ignore);
      this.ignoredClones = [];
      this.onMove = typeof onMove === "function" ? onMove : null;
      this.originalInlineStyles = snapshotInlineStyles(this.element);
      this.hadTabIndex = this.element.hasAttribute("tabindex");
      this.originalTabIndex = this.element.getAttribute("tabindex");
      this.translation = { x: 0, y: 0 };
      this.domFilterId = `tg-liquid-glass-filter-${++filterSequence}`;
      this.domFilterSize = { width: 0, height: 0 };
      this.applyHostPresentation();
      if (this.mode === "texture") {
        this.canvas = document.createElement("canvas");
        this.canvas.className = "liquid-glass__canvas tg-liquid-glass__canvas";
        this.canvas.setAttribute("aria-hidden", "true");
        Object.assign(this.canvas.style, {
          position: "absolute",
          inset: "0",
          zIndex: "-1",
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: "inherit",
          pointerEvents: "none"
        });
        this.element.prepend(this.canvas);
      }
      this.pointer = { x: 0.28, y: 0.2 };
      this.currentInteraction = 0;
      this.targetInteraction = 0;
      this.hovered = false;
      this.focused = false;
      this.selected = false;
      this.dragState = null;
      this.hasCustomPosition = false;
      this.frameRequest = 0;
      this.destroyed = false;
      this.eventsBound = false;
      this.geometry = null;
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.boundResize = () => this.resize();
      this.boundPointerEnter = (event) => this.onPointerEnter(event);
      this.boundPointerMove = (event) => this.onPointerMove(event);
      this.boundPointerLeave = () => this.onPointerLeave();
      this.boundPointerDown = (event) => this.onPointerDown(event);
      this.boundPointerUp = (event) => this.onPointerUp(event);
      this.boundFocus = () => this.onFocus();
      this.boundBlur = () => this.onBlur();
      this.boundKeyDown = (event) => this.onKeyDown(event);
      try {
        if (this.mode === "dom") {
          this.setupDomBackdrop();
        } else {
          this.setupWebGl();
        }
        this.setupIgnoredElements();
        this.bindEvents();
        this.resize();
        this.element.dataset.renderer = this.mode === "dom" ? "dom" : "webgl";
        this.element.dataset.ready = "true";
      } catch (error) {
        this.fallback(error);
      }
    }
    applyHostPresentation() {
      this.element.classList.add("tg-liquid-glass");
      this.element.dataset.liquidGlassAttached = "true";
      if (!this.hadTabIndex) {
        if (this.draggable) {
          this.element.tabIndex = 0;
        } else {
          this.element.removeAttribute("tabindex");
        }
      }
      if (!this.applyStyles) {
        return;
      }
      const computed = getComputedStyle(this.element);
      if (computed.position === "static") {
        this.element.style.position = "relative";
      }
      if (this.applySize) {
        this.element.style.width = `${this.parameters.width}px`;
        this.element.style.height = `${this.parameters.height}px`;
      } else {
        this.element.style.width = this.originalInlineStyles.width;
        this.element.style.height = this.originalInlineStyles.height;
      }
      this.element.style.borderRadius = `${this.parameters.radius}px`;
      this.element.style.overflow = "hidden";
      this.element.style.isolation = "isolate";
      this.element.style.boxSizing = "border-box";
      this.element.style.touchAction = this.draggable ? "none" : "manipulation";
      this.element.style.cursor = this.draggable ? "grab" : "default";
      this.element.style.translate = `${this.translation.x}px ${this.translation.y}px`;
      this.element.style.webkitTapHighlightColor = "transparent";
      if (this.replaceBackground) {
        this.element.style.background = "transparent";
      } else {
        this.element.style.background = this.originalInlineStyles.background;
      }
      this.applyGlassShadow();
      this.element.style.transition = "box-shadow 160ms ease";
    }
    applyGlassShadow() {
      const layers = [];
      if (this.shadow === true) {
        layers.push(DEFAULT_SHADOW);
      } else if (typeof this.shadow === "string" && this.shadow.trim()) {
        layers.push(this.shadow);
      }
      if (typeof this.border === "string" && this.border.trim()) {
        layers.push(this.border);
      }
      this.element.style.boxShadow = layers.length > 0 ? layers.join(", ") : "none";
      this.applyBorderTexture();
    }
    applyBorderTexture() {
      if (!this.applyStyles || this.border !== true) {
        this.borderOverlay?.remove();
        this.borderOverlay = null;
        return;
      }
      if (!this.borderOverlay) {
        this.borderOverlay = document.createElement("span");
        this.borderOverlay.className = "tg-liquid-glass__border";
        this.borderOverlay.dataset.liquidGlassBorder = "default-directional";
        this.borderOverlay.setAttribute("aria-hidden", "true");
        Object.assign(this.borderOverlay.style, {
          position: "absolute",
          inset: "0",
          zIndex: "2147483646",
          display: "block",
          overflow: "hidden",
          borderRadius: "inherit",
          pointerEvents: "none"
        });
        this.borderSvg = document.createElementNS(SVG_NAMESPACE, "svg");
        this.borderSvg.setAttribute("width", "100%");
        this.borderSvg.setAttribute("height", "100%");
        this.borderSvg.setAttribute("preserveAspectRatio", "none");
        this.borderSvg.setAttribute("shape-rendering", "geometricPrecision");
        Object.assign(this.borderSvg.style, { display: "block", overflow: "hidden" });
        this.borderTopPath = document.createElementNS(SVG_NAMESPACE, "path");
        this.borderTopPath.dataset.liquidGlassBorderTop = "true";
        this.borderTopPath.dataset.strokeWidth = String(DEFAULT_GLASS_BORDER.topWidth);
        this.borderTopPath.setAttribute("fill-rule", "evenodd");
        this.borderTopPath.setAttribute("fill", `rgb(255 255 255 / ${DEFAULT_GLASS_BORDER.topColor[3]})`);
        this.borderBottomPath = document.createElementNS(SVG_NAMESPACE, "path");
        this.borderBottomPath.dataset.liquidGlassBorderBottom = "true";
        this.borderBottomPath.dataset.strokeWidth = String(DEFAULT_GLASS_BORDER.bottomWidth);
        this.borderBottomPath.setAttribute("fill-rule", "evenodd");
        this.borderBottomPath.setAttribute("fill", `rgb(255 255 255 / ${DEFAULT_GLASS_BORDER.bottomColor[3]})`);
        this.borderSvg.append(this.borderTopPath, this.borderBottomPath);
        this.borderOverlay.append(this.borderSvg);
        this.element.append(this.borderOverlay);
      }
      this.updateBorderTexture(this.parameters.width, this.parameters.height);
    }
    updateBorderTexture(width, height) {
      if (!this.borderOverlay || !this.borderSvg || width <= 0 || height <= 0) {
        return;
      }
      const paths = computeDefaultGlassBorderPaths(width, height, this.parameters.radius);
      this.borderSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      this.borderTopPath.setAttribute("d", paths.top);
      this.borderBottomPath.setAttribute("d", paths.bottom);
    }
    resolveIgnoredElements() {
      const matches = /* @__PURE__ */ new Set();
      for (const entry of this.ignoreEntries) {
        if (entry instanceof Element) {
          if (entry.isConnected) {
            matches.add(entry);
          }
          continue;
        }
        let selected;
        try {
          selected = document.querySelectorAll(entry);
        } catch (error) {
          throw new TypeError(`LiquidGlass ignore contains an invalid selector: ${entry}`, { cause: error });
        }
        for (const element of selected) {
          matches.add(element);
        }
      }
      return [...matches].filter((element) => element !== this.element && !this.element.contains(element) && element !== this.ignoreOverlay && !this.ignoreOverlay?.contains(element));
    }
    setupIgnoredElements() {
      if (this.ignoreEntries.length === 0) {
        this.teardownIgnoredElements();
        return;
      }
      if (!this.ignoreOverlay) {
        this.ignoreOverlay = document.createElement("div");
        this.ignoreOverlay.className = "tg-liquid-glass__ignore-overlay";
        this.ignoreOverlay.dataset.liquidGlassIgnoreOverlay = "true";
        this.ignoreOverlay.setAttribute("aria-hidden", "true");
        Object.assign(this.ignoreOverlay.style, {
          position: "fixed",
          zIndex: "2147483647",
          overflow: "hidden",
          pointerEvents: "none",
          margin: "0",
          padding: "0",
          border: "0",
          background: "transparent",
          contain: "layout paint style"
        });
        (document.body || document.documentElement).append(this.ignoreOverlay);
      }
      this.rebuildIgnoredClones();
      if (!this.ignoreObserver) {
        this.ignoreObserver = new MutationObserver((records) => {
          if (this.destroyed || records.every(({ target }) => target === this.ignoreOverlay || this.ignoreOverlay?.contains(target) || target === this.element || this.element.contains(target))) {
            return;
          }
          if (!this.ignoreRefreshRequest) {
            this.ignoreRefreshRequest = requestAnimationFrame(() => {
              this.ignoreRefreshRequest = 0;
              this.rebuildIgnoredClones();
            });
          }
        });
        this.ignoreObserver.observe(document.documentElement, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true
        });
      }
      if (!this.ignoreFrameRequest) {
        const sync = () => {
          this.ignoreFrameRequest = 0;
          if (this.destroyed || this.ignoreEntries.length === 0) {
            return;
          }
          this.syncIgnoredOverlay();
          this.ignoreFrameRequest = requestAnimationFrame(sync);
        };
        this.ignoreFrameRequest = requestAnimationFrame(sync);
      }
    }
    rebuildIgnoredClones() {
      if (!this.ignoreOverlay || this.destroyed) {
        return;
      }
      this.ignoredClones = this.resolveIgnoredElements().map((source) => {
        const clone = source.cloneNode(true);
        clone.removeAttribute("id");
        for (const descendant of clone.querySelectorAll("[id]")) {
          descendant.removeAttribute("id");
        }
        clone.dataset.liquidGlassIgnoreClone = "true";
        clone.setAttribute("aria-hidden", "true");
        for (const [property, value] of Object.entries({
          position: "absolute",
          inset: "auto",
          margin: "0",
          transform: "none",
          translate: "none",
          pointerEvents: "none",
          zIndex: "0"
        })) {
          clone.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, "important");
        }
        return { source, clone };
      });
      this.ignoreOverlay.replaceChildren(...this.ignoredClones.map(({ clone }) => clone));
      this.syncIgnoredOverlay();
    }
    syncIgnoredOverlay() {
      if (!this.ignoreOverlay) {
        return;
      }
      const panel = this.element.getBoundingClientRect();
      const visible = panel.width > 0 && panel.height > 0;
      Object.assign(this.ignoreOverlay.style, {
        display: visible ? "block" : "none",
        left: `${panel.left}px`,
        top: `${panel.top}px`,
        width: `${panel.width}px`,
        height: `${panel.height}px`,
        borderRadius: `${Math.min(this.parameters.radius, panel.width / 2, panel.height / 2)}px`
      });
      for (const { source, clone } of this.ignoredClones) {
        const rect = source.getBoundingClientRect();
        clone.style.setProperty("display", rect.width > 0 && rect.height > 0 ? getComputedStyle(source).display : "none", "important");
        clone.style.setProperty("left", `${rect.left - panel.left}px`, "important");
        clone.style.setProperty("top", `${rect.top - panel.top}px`, "important");
        clone.style.setProperty("width", `${rect.width}px`, "important");
        clone.style.setProperty("height", `${rect.height}px`, "important");
      }
    }
    teardownIgnoredElements() {
      cancelAnimationFrame(this.ignoreFrameRequest);
      cancelAnimationFrame(this.ignoreRefreshRequest);
      this.ignoreFrameRequest = 0;
      this.ignoreRefreshRequest = 0;
      this.ignoreObserver?.disconnect();
      this.ignoreObserver = null;
      this.ignoreOverlay?.remove();
      this.ignoreOverlay = null;
      this.ignoredClones = [];
    }
    setupDomBackdrop() {
      const supportsBackdrop = CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)");
      if (!supportsBackdrop) {
        throw new Error("Native backdrop-filter is unavailable.");
      }
      this.domSupportsDisplacement = !isWebKitWithoutBackdropUrl() && CSS.supports("backdrop-filter", 'url("#tg-liquid-glass-probe")');
      this.domFilterDirty = true;
      if (this.domSupportsDisplacement) {
        this.domSvg = document.createElementNS(SVG_NAMESPACE, "svg");
        this.domSvg.setAttribute("width", "0");
        this.domSvg.setAttribute("height", "0");
        this.domSvg.setAttribute("aria-hidden", "true");
        Object.assign(this.domSvg.style, {
          position: "fixed",
          width: "0",
          height: "0",
          overflow: "hidden",
          pointerEvents: "none"
        });
        const definitions = document.createElementNS(SVG_NAMESPACE, "defs");
        this.domFilter = document.createElementNS(SVG_NAMESPACE, "filter");
        this.domFilter.id = this.domFilterId;
        this.domFilter.setAttribute("filterUnits", "objectBoundingBox");
        this.domFilter.setAttribute("primitiveUnits", "userSpaceOnUse");
        this.domFilter.setAttribute("x", "-50%");
        this.domFilter.setAttribute("y", "-50%");
        this.domFilter.setAttribute("width", "200%");
        this.domFilter.setAttribute("height", "200%");
        this.domFilter.setAttribute("color-interpolation-filters", "sRGB");
        this.domMapImage = document.createElementNS(SVG_NAMESPACE, "feImage");
        this.domMapImage.setAttribute("x", "0");
        this.domMapImage.setAttribute("y", "0");
        this.domMapImage.setAttribute("preserveAspectRatio", "none");
        this.domMapImage.setAttribute("result", "displacement-map");
        this.domDisplacement = document.createElementNS(SVG_NAMESPACE, "feDisplacementMap");
        this.domDisplacement.setAttribute("in", "SourceGraphic");
        this.domDisplacement.setAttribute("in2", "displacement-map");
        this.domDisplacement.setAttribute("xChannelSelector", "R");
        this.domDisplacement.setAttribute("yChannelSelector", "G");
        this.domBlur = document.createElementNS(SVG_NAMESPACE, "feGaussianBlur");
        this.domBlur.setAttribute("in", "refracted-backdrop");
        this.domBlur.setAttribute("edgeMode", "duplicate");
        this.domBlur.setAttribute("result", "blurred-backdrop");
        this.domSaturation = document.createElementNS(SVG_NAMESPACE, "feColorMatrix");
        this.domSaturation.setAttribute("in", "blurred-backdrop");
        this.domSaturation.setAttribute("type", "saturate");
        this.domSaturation.setAttribute("values", "3");
        this.domSaturation.setAttribute("result", "saturated-backdrop");
        this.domMaterialMapImage = document.createElementNS(SVG_NAMESPACE, "feImage");
        this.domMaterialMapImage.setAttribute("x", "0");
        this.domMaterialMapImage.setAttribute("y", "0");
        this.domMaterialMapImage.setAttribute("preserveAspectRatio", "none");
        this.domMaterialMapImage.setAttribute("result", "material-map");
        this.domMaterialComposite = document.createElementNS(SVG_NAMESPACE, "feComposite");
        this.domMaterialComposite.setAttribute("in", "material-map");
        this.domMaterialComposite.setAttribute("in2", "saturated-backdrop");
        this.domMaterialComposite.setAttribute("operator", "over");
        this.domDisplacement.setAttribute("result", "refracted-backdrop");
        this.domFilter.append(
          this.domMapImage,
          this.domDisplacement,
          this.domBlur,
          this.domSaturation,
          this.domMaterialMapImage,
          this.domMaterialComposite
        );
        definitions.append(this.domFilter);
        this.domSvg.append(definitions);
        (document.body || document.documentElement).append(this.domSvg);
      }
      this.applyDomMaterial();
    }
    applyDomMaterial() {
      const { tint, tintAlpha, blurRadius } = this.parameters;
      const channels = tint.map((channel) => Math.round(channel * 255));
      const filterValue = this.domSupportsDisplacement ? `url("#${this.domFilterId}")` : `blur(${blurRadius}px) saturate(3)`;
      this.element.style.background = this.domSupportsDisplacement ? "transparent" : `rgb(${channels.join(" ")} / ${tintAlpha})`;
      this.element.style.backdropFilter = filterValue;
      this.element.style.webkitBackdropFilter = filterValue;
      this.applyGlassShadow();
    }
    updateDomFilter(width, height) {
      if (!this.domSupportsDisplacement || !this.domMapImage || width <= 0 || height <= 0) {
        return;
      }
      const roundedWidth = Math.max(1, Math.round(width));
      const roundedHeight = Math.max(1, Math.round(height));
      if (!this.domFilterDirty && this.domFilterSize.width === roundedWidth && this.domFilterSize.height === roundedHeight) {
        return;
      }
      const refractionParameters = {
        ...this.parameters,
        refractionIntensity: this.parameters.refractionIntensity * (1 + 0.1 * this.currentInteraction + (this.selected ? 0.05 : 0))
      };
      const map = buildDisplacementMap(refractionParameters, roundedWidth, roundedHeight);
      const materialMap = buildMaterialMap(
        this.parameters,
        roundedWidth,
        roundedHeight,
        this.currentInteraction,
        this.selected,
        this.pointer
      );
      this.domMapImage.setAttribute("width", String(roundedWidth));
      this.domMapImage.setAttribute("height", String(roundedHeight));
      this.domMapImage.setAttribute("href", map.dataUrl);
      this.domDisplacement.setAttribute("scale", String(map.scale));
      this.domBlur.setAttribute("stdDeviation", String(this.parameters.blurRadius * 0.5));
      this.domMaterialMapImage.setAttribute("width", String(roundedWidth));
      this.domMaterialMapImage.setAttribute("height", String(roundedHeight));
      this.domMaterialMapImage.setAttribute("href", materialMap);
      this.domFilterSize = { width: roundedWidth, height: roundedHeight };
      this.domFilterDirty = false;
    }
    setupWebGl() {
      const gl = this.canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      if (!gl) {
        throw new Error("WebGL is unavailable.");
      }
      this.gl = gl;
      this.program = createProgram(gl);
      this.uniforms = uniformLocations(gl, this.program);
      gl.useProgram(this.program);
      const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
      gl.uniform1i(this.uniforms.uBackdrop, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    bindEvents() {
      if (this.eventsBound) {
        return;
      }
      this.eventsBound = true;
      this.element.addEventListener("pointerenter", this.boundPointerEnter);
      this.element.addEventListener("pointermove", this.boundPointerMove);
      this.element.addEventListener("pointerleave", this.boundPointerLeave);
      this.element.addEventListener("pointerdown", this.boundPointerDown);
      this.element.addEventListener("pointerup", this.boundPointerUp);
      this.element.addEventListener("pointercancel", this.boundPointerUp);
      this.element.addEventListener("focus", this.boundFocus);
      this.element.addEventListener("blur", this.boundBlur);
      this.element.addEventListener("keydown", this.boundKeyDown);
      window.addEventListener("resize", this.boundResize, { passive: true });
      window.visualViewport?.addEventListener("resize", this.boundResize, { passive: true });
      this.resizeObserver = new ResizeObserver(this.boundResize);
      this.resizeObserver.observe(this.element);
      if (this.mode === "texture") {
        this.resizeObserver.observe(this.source);
        if (this.sourceBounds !== this.source) {
          this.resizeObserver.observe(this.sourceBounds);
        }
      }
      if (this.bounds) {
        this.resizeObserver.observe(this.bounds);
      }
    }
    updatePointer(event) {
      const rect = this.element.getBoundingClientRect();
      this.pointer.x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
      this.pointer.y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
    }
    onPointerEnter(event) {
      this.hovered = event.pointerType !== "touch";
      this.updatePointer(event);
      this.updateInteractionTarget();
    }
    onPointerMove(event) {
      this.updatePointer(event);
      if (this.dragState && this.dragState.pointerId === event.pointerId) {
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        if (!this.dragState.moved && Math.hypot(deltaX, deltaY) >= 3) {
          this.dragState.moved = true;
          this.element.dataset.dragging = "true";
        }
        if (this.dragState.moved) {
          event.preventDefault();
          this.moveToViewportPosition(
            this.dragState.startLeft + deltaX,
            this.dragState.startTop + deltaY
          );
          return;
        }
      }
      this.requestRender();
    }
    onPointerLeave() {
      this.hovered = false;
      this.updateInteractionTarget();
    }
    onPointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      this.updatePointer(event);
      if (this.draggable) {
        const rect = this.element.getBoundingClientRect();
        this.dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          moved: false
        };
        try {
          this.element.setPointerCapture?.(event.pointerId);
        } catch {
        }
      }
      this.updateInteractionTarget();
    }
    onPointerUp(event) {
      try {
        if (this.element.hasPointerCapture?.(event.pointerId)) {
          this.element.releasePointerCapture(event.pointerId);
        }
      } catch {
      }
      this.dragState = null;
      delete this.element.dataset.dragging;
      this.updateInteractionTarget();
    }
    onFocus() {
      this.focused = this.element.matches(":focus-visible");
      this.updateInteractionTarget();
    }
    onBlur() {
      this.focused = false;
      this.updateInteractionTarget();
    }
    onKeyDown(event) {
      if (!this.draggable) {
        return;
      }
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      }[event.key];
      if (!direction) {
        return;
      }
      event.preventDefault();
      const step = event.shiftKey ? 16 : 4;
      const rect = this.element.getBoundingClientRect();
      this.moveToViewportPosition(
        rect.left + direction[0] * step,
        rect.top + direction[1] * step
      );
    }
    moveToViewportPosition(left, top) {
      const elementRect = this.element.getBoundingClientRect();
      const constraint = this.getConstraintRect();
      let clampedLeft = left;
      let clampedTop = top;
      if (this.shouldConstrain) {
        const minimumLeft = constraint.left + this.margin;
        const minimumTop = constraint.top + this.margin;
        const maximumLeft = Math.max(minimumLeft, constraint.right - elementRect.width - this.margin);
        const maximumTop = Math.max(minimumTop, constraint.bottom - elementRect.height - this.margin);
        clampedLeft = Math.min(Math.max(left, minimumLeft), maximumLeft);
        clampedTop = Math.min(Math.max(top, minimumTop), maximumTop);
      }
      this.translation.x += clampedLeft - elementRect.left;
      this.translation.y += clampedTop - elementRect.top;
      this.element.style.translate = `${this.translation.x}px ${this.translation.y}px`;
      this.hasCustomPosition = true;
      this.resize();
      this.onMove?.(this.element.getBoundingClientRect(), this);
    }
    getConstraintRect() {
      if (this.bounds) {
        return this.bounds.getBoundingClientRect();
      }
      return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight
      };
    }
    constrainPosition() {
      if (!this.hasCustomPosition || !this.shouldConstrain) {
        return;
      }
      const rect = this.element.getBoundingClientRect();
      const constraint = this.getConstraintRect();
      const left = Math.min(
        Math.max(rect.left, constraint.left + this.margin),
        Math.max(constraint.left + this.margin, constraint.right - rect.width - this.margin)
      );
      const top = Math.min(
        Math.max(rect.top, constraint.top + this.margin),
        Math.max(constraint.top + this.margin, constraint.bottom - rect.height - this.margin)
      );
      if (left !== rect.left || top !== rect.top) {
        this.translation.x += left - rect.left;
        this.translation.y += top - rect.top;
        this.element.style.translate = `${this.translation.x}px ${this.translation.y}px`;
      }
    }
    updateInteractionTarget() {
      this.targetInteraction = this.hovered ? 0.9 : this.focused ? 0.65 : 0;
      this.requestRender(true);
    }
    resize() {
      if (this.destroyed) {
        return;
      }
      this.constrainPosition();
      const panelRect = this.element.getBoundingClientRect();
      this.updateBorderTexture(panelRect.width, panelRect.height);
      if (this.mode === "dom") {
        this.geometry = {
          panel: {
            x: panelRect.left,
            y: panelRect.top,
            width: panelRect.width,
            height: panelRect.height
          },
          image: null,
          source: null,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 3)
        };
        this.updateDomFilter(panelRect.width, panelRect.height);
        return;
      }
      if (!this.gl || !this.source.naturalWidth || !this.source.naturalHeight) {
        return;
      }
      const sourceRect = this.sourceBounds.getBoundingClientRect();
      const objectFit = this.fit || (this.sourceBounds === this.source ? getComputedStyle(this.source).objectFit : "cover");
      const fit = objectFit === "contain" ? fitContain : fitCover;
      const imageFit = fit(
        this.source.naturalWidth,
        this.source.naturalHeight,
        sourceRect.width,
        sourceRect.height
      );
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      const bufferWidth = Math.max(1, Math.round(panelRect.width * pixelRatio));
      const bufferHeight = Math.max(1, Math.round(panelRect.height * pixelRatio));
      if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
        this.canvas.width = bufferWidth;
        this.canvas.height = bufferHeight;
      }
      this.geometry = {
        panel: {
          x: panelRect.left,
          y: panelRect.top,
          width: panelRect.width,
          height: panelRect.height
        },
        image: {
          x: sourceRect.left + imageFit.x,
          y: sourceRect.top + imageFit.y,
          width: imageFit.width,
          height: imageFit.height,
          scale: imageFit.scale,
          objectFit
        },
        source: {
          width: this.source.naturalWidth,
          height: this.source.naturalHeight
        },
        pixelRatio
      };
      this.render();
    }
    requestRender(animate = false) {
      if (!this.gl && this.mode !== "dom" || this.destroyed) {
        return;
      }
      if (!animate || this.reducedMotion.matches) {
        this.currentInteraction = this.targetInteraction;
        this.renderActiveMode();
        return;
      }
      if (this.frameRequest) {
        return;
      }
      const step = () => {
        this.frameRequest = 0;
        const difference = this.targetInteraction - this.currentInteraction;
        this.currentInteraction += difference * 0.24;
        if (Math.abs(difference) < 2e-3) {
          this.currentInteraction = this.targetInteraction;
        }
        this.renderActiveMode();
        if (this.currentInteraction !== this.targetInteraction) {
          this.frameRequest = requestAnimationFrame(step);
        }
      };
      this.frameRequest = requestAnimationFrame(step);
    }
    renderActiveMode() {
      if (this.mode === "dom") {
        const rect = this.element.getBoundingClientRect();
        this.domFilterDirty = true;
        this.updateDomFilter(rect.width, rect.height);
        return;
      }
      this.render();
    }
    render() {
      if (!this.gl || !this.geometry) {
        return;
      }
      const { gl, uniforms, geometry, parameters } = this;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform2f(uniforms.uPanelSize, geometry.panel.width, geometry.panel.height);
      gl.uniform2f(uniforms.uElementOrigin, geometry.panel.x, geometry.panel.y);
      gl.uniform2f(uniforms.uImageOffset, geometry.image.x, geometry.image.y);
      gl.uniform2f(uniforms.uImageDrawSize, geometry.image.width, geometry.image.height);
      gl.uniform2f(uniforms.uPointer, this.pointer.x, this.pointer.y);
      gl.uniform3f(uniforms.uTint, parameters.tint[0], parameters.tint[1], parameters.tint[2]);
      gl.uniform1f(uniforms.uPixelRatio, geometry.pixelRatio);
      gl.uniform1f(uniforms.uRadius, parameters.radius);
      gl.uniform1f(uniforms.uThickness, parameters.thickness);
      gl.uniform1f(uniforms.uRefractiveIndex, parameters.refractiveIndex);
      gl.uniform1f(uniforms.uRefractionIntensity, parameters.refractionIntensity);
      gl.uniform1f(uniforms.uBlurRadius, parameters.blurRadius);
      gl.uniform1f(uniforms.uTintAlpha, parameters.tintAlpha);
      gl.uniform1f(uniforms.uInteraction, this.currentInteraction);
      gl.uniform1f(uniforms.uSelected, this.selected ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    readCenterPixel() {
      if (!this.gl) {
        return null;
      }
      const pixel = new Uint8Array(4);
      this.gl.readPixels(
        Math.floor(this.canvas.width / 2),
        Math.floor(this.canvas.height / 2),
        1,
        1,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        pixel
      );
      return [...pixel];
    }
    update(options = {}) {
      if (this.destroyed) {
        throw new Error("Cannot update a destroyed LiquidGlass instance.");
      }
      const parameterOptions = options.parameters ? { ...options, ...options.parameters } : options;
      this.parameters = sanitizeGlassParameters({ ...this.parameters, ...parameterOptions });
      if ("draggable" in options) {
        this.draggable = Boolean(options.draggable);
      }
      if ("constrain" in options) {
        this.shouldConstrain = Boolean(options.constrain);
      }
      if ("margin" in options) {
        this.margin = Math.max(0, Number(options.margin) || 0);
      }
      if ("fit" in options) {
        this.fit = options.fit;
      }
      if ("applySize" in options) {
        this.applySize = Boolean(options.applySize);
      }
      if ("replaceBackground" in options) {
        this.replaceBackground = Boolean(options.replaceBackground);
      }
      if ("shadow" in options) {
        this.shadow = options.shadow;
      }
      if ("border" in options) {
        this.border = options.border;
      }
      if ("ignore" in options) {
        this.ignoreEntries = normalizeIgnoreEntries(options.ignore);
      }
      if ("onMove" in options) {
        this.onMove = typeof options.onMove === "function" ? options.onMove : null;
      }
      if ("bounds" in options) {
        this.bounds = options.bounds instanceof Element ? options.bounds : null;
      }
      this.applyHostPresentation();
      if (this.mode === "dom") {
        this.domFilterDirty = true;
        this.applyDomMaterial();
      }
      this.setupIgnoredElements();
      this.resize();
      return this;
    }
    moveTo(left, top) {
      this.moveToViewportPosition(left, top);
      return this;
    }
    getDebugState() {
      return {
        renderer: this.element.dataset.renderer,
        mode: this.mode,
        domSupportsDisplacement: this.mode === "dom" ? this.domSupportsDisplacement : null,
        backdropFilter: this.mode === "dom" ? this.element.style.backdropFilter : null,
        geometry: this.geometry ? structuredClone(this.geometry) : null,
        parameters: structuredClone(this.parameters),
        centerPixel: this.readCenterPixel(),
        selected: this.selected,
        border: this.border,
        borderPreset: this.border === true ? {
          name: "default-directional",
          topWidth: DEFAULT_GLASS_BORDER.topWidth,
          bottomWidth: DEFAULT_GLASS_BORDER.bottomWidth,
          topAlpha: DEFAULT_GLASS_BORDER.topColor[3],
          bottomAlpha: DEFAULT_GLASS_BORDER.bottomColor[3]
        } : null,
        ignoredElements: this.ignoredClones.length
      };
    }
    fallback(error) {
      this.gl = null;
      if (this.canvas) {
        this.canvas.style.display = "none";
      }
      this.element.dataset.renderer = "fallback";
      this.element.dataset.ready = "true";
      this.element.dataset.fallbackReason = error instanceof Error ? error.message : String(error);
      if (this.applyStyles) {
        this.element.style.background = "rgb(29 29 29 / 42%)";
        this.element.style.webkitBackdropFilter = "blur(7px) saturate(1.08)";
        this.element.style.backdropFilter = "blur(7px) saturate(1.08)";
      }
      this.bindEvents();
    }
    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.frameRequest);
      this.teardownIgnoredElements();
      this.resizeObserver?.disconnect();
      window.removeEventListener("resize", this.boundResize);
      window.visualViewport?.removeEventListener("resize", this.boundResize);
      this.element.removeEventListener("pointerenter", this.boundPointerEnter);
      this.element.removeEventListener("pointermove", this.boundPointerMove);
      this.element.removeEventListener("pointerleave", this.boundPointerLeave);
      this.element.removeEventListener("pointerdown", this.boundPointerDown);
      this.element.removeEventListener("pointerup", this.boundPointerUp);
      this.element.removeEventListener("pointercancel", this.boundPointerUp);
      this.element.removeEventListener("focus", this.boundFocus);
      this.element.removeEventListener("blur", this.boundBlur);
      this.element.removeEventListener("keydown", this.boundKeyDown);
      if (this.gl) {
        this.gl.deleteTexture(this.texture);
        this.gl.deleteBuffer(this.vertexBuffer);
        this.gl.deleteProgram(this.program);
      }
      this.canvas?.remove();
      this.borderOverlay?.remove();
      this.domSvg?.remove();
      this.element.classList.remove("tg-liquid-glass");
      delete this.element.dataset.liquidGlassAttached;
      delete this.element.dataset.renderer;
      delete this.element.dataset.ready;
      delete this.element.dataset.fallbackReason;
      delete this.element.dataset.dragging;
      for (const [property, value] of Object.entries(this.originalInlineStyles)) {
        this.element.style[property] = value;
      }
      if (this.hadTabIndex) {
        this.element.setAttribute("tabindex", this.originalTabIndex);
      } else {
        this.element.removeAttribute("tabindex");
      }
    }
  }
  const instances = /* @__PURE__ */ new WeakMap();
  const defaults = Object.freeze({
    ...DEFAULT_GLASS_PARAMETERS,
    tint: Object.freeze([...DEFAULT_GLASS_PARAMETERS.tint]),
    mode: "dom",
    draggable: true,
    constrain: true,
    margin: 8,
    fit: void 0,
    applyStyles: true,
    applySize: true,
    replaceBackground: true,
    shadow: true,
    border: true,
    ignore: Object.freeze([])
  });
  const borderPresets = Object.freeze({
    default: DEFAULT_GLASS_BORDER
  });
  const version = "0.0.1";
  function resolveElement(value, label) {
    if (value instanceof Element) {
      return value;
    }
    if (typeof value === "string") {
      const element = document.querySelector(value);
      if (element) {
        return element;
      }
    }
    throw new TypeError(`LiquidGlass ${label} must be an Element or a valid selector.`);
  }
  function querySelectorSafely(value) {
    if (typeof value !== "string") {
      return null;
    }
    try {
      return document.querySelector(value);
    } catch {
      return null;
    }
  }
  async function ensureImageReady(image) {
    if (!(image instanceof HTMLImageElement)) {
      throw new TypeError("LiquidGlass source must resolve to an HTMLImageElement or image URL.");
    }
    if (!image.complete) {
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error(`LiquidGlass could not load ${image.currentSrc || image.src}.`)), { once: true });
      });
    }
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("LiquidGlass source image has no readable dimensions.");
    }
    if (typeof image.decode === "function") {
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
        throw new TypeError("LiquidGlass source selector must point to an <img>.");
      }
      return { image: await ensureImageReady(selected), detached: false };
    }
    if (typeof source !== "string" || source.trim() === "") {
      throw new TypeError("LiquidGlass requires source: an <img>, selector, or image URL.");
    }
    const image = new Image();
    const url = new URL(source, window.location.href);
    if (crossOrigin !== null && (crossOrigin || url.origin !== window.location.origin)) {
      image.crossOrigin = crossOrigin || "anonymous";
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
  async function attach(target, options = {}) {
    const element = resolveElement(target, "target");
    const existing = instances.get(element);
    if (existing && !existing.destroyed) {
      const bounds2 = resolveOptionalElement(options.bounds, "bounds");
      existing.update({ ...options, ...bounds2 ? { bounds: bounds2 } : {} });
      return existing;
    }
    const dataSource = element.dataset.liquidGlassSource;
    const mode = options.mode || (options.source || dataSource ? "texture" : defaults.mode);
    let image;
    let sourceBounds;
    if (mode === "texture") {
      const sourceValue = options.source || dataSource || "#scene-background";
      const resolved = await resolveSource(sourceValue, options.crossOrigin);
      image = resolved.image;
      sourceBounds = resolveOptionalElement(options.sourceBounds, "sourceBounds") || (resolved.detached ? document.documentElement : image);
    }
    const bounds = resolveOptionalElement(options.bounds, "bounds");
    const instance = new LiquidGlass(element, {
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
      onMove: options.onMove
    });
    instances.set(element, instance);
    return instance;
  }
  async function attachAll(targets = "[data-liquid-glass]", options = {}) {
    const elements = typeof targets === "string" ? [...document.querySelectorAll(targets)] : [...targets];
    return Promise.all(elements.map((element) => attach(element, options)));
  }
  function get(target) {
    const element = resolveElement(target, "target");
    const instance = instances.get(element);
    return instance && !instance.destroyed ? instance : null;
  }
  function detach(target) {
    const element = resolveElement(target, "target");
    const instance = instances.get(element);
    if (!instance) {
      return false;
    }
    instance.destroy();
    instances.delete(element);
    return true;
  }
  /*! LiquidGlass Web v0.0.1 | MIT License | live DOM backdrop + WebGL texture mode */
  const api = Object.freeze({
    attach,
    attachAll,
    borderPresets,
    defaults,
    detach,
    get,
    Instance: LiquidGlass,
    version
  });
  globalThis.LiquidGlass = api;
  return api;
})();
