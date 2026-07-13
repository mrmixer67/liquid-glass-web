export const vertexShaderSource = `
  attribute vec2 aPosition;

  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

export const fragmentShaderSource = `
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
