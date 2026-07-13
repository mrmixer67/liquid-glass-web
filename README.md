# Liquid Glass Web

[![Test and publish library](https://github.com/mrmixer67/liquid-glass-web/actions/workflows/pages.yml/badge.svg)](https://github.com/mrmixer67/liquid-glass-web/actions/workflows/pages.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A dependency-free browser library that applies a configurable liquid-glass effect to any HTML element. It supports a live DOM backdrop, a pixel-stable WebGL texture mode, refraction, blur, tint, directional highlights, automatic glass borders, dragging and distortion exclusions.

The distributable is a single file with no runtime dependencies.

## Install from a CDN

Pinned release, recommended for production:

```html
<script src="https://cdn.jsdelivr.net/gh/mrmixer67/liquid-glass-web@v0.0.1/public/liquid-glass.js"></script>
```

Latest successfully tested `main` build:

```html
<script src="https://mrmixer67.github.io/liquid-glass-web/liquid-glass.js"></script>
```

## Quick start

```html
<button id="glass-button">Glass content</button>

<script src="https://cdn.jsdelivr.net/gh/mrmixer67/liquid-glass-web@v0.0.1/public/liquid-glass.js"></script>
<script>
  LiquidGlass.attach('#glass-button', {
    width: 180,
    height: 72,
    radius: 24,
    tintAlpha: 0.3,
    draggable: false
  });
</script>
```

`attach()` preserves the target's child content. By default the library uses live DOM mode, so text, images, animations, canvas and video painted below the glass update under it in real time.

## API

```js
const glass = await LiquidGlass.attach('#target', options);

glass.update({ tintAlpha: 0.24, radius: 30 });
glass.moveTo(120, 240);
glass.getDebugState();
glass.destroy();

LiquidGlass.get('#target');
LiquidGlass.detach('#target');
await LiquidGlass.attachAll('.glass');
```

### Options

| Option | Default | Description |
|---|---:|---|
| `mode` | `dom` | `dom` for a live page backdrop or `texture` for an image source |
| `width`, `height` | `84`, `84` | Applied size in CSS pixels |
| `radius` | `26` | Corner radius in CSS pixels |
| `thickness` | `11` | Optical lens thickness |
| `refractiveIndex` | `1.5` | Refraction index |
| `refractionIntensity` | `0.75` | Background displacement strength |
| `blurRadius` | `6` | Glass blur radius |
| `tint` | `[0.112, 0.112, 0.112]` | RGB tint channels from 0 to 1 |
| `tintAlpha` | `0.52` | Tint opacity from 0 to 1 |
| `draggable` | `true` | Pointer, touch and keyboard dragging |
| `constrain` | `true` | Keep the glass inside its bounds |
| `bounds`, `margin` | viewport, `8` | Drag constraint and its inner margin |
| `applySize` | `true` | Set `width` and `height` on the target |
| `replaceBackground` | `true` | Replace the target's opaque background |
| `shadow` | `true` | Default shadow, `false`, or a custom `box-shadow` |
| `border` | `true` | Automatic directional border, `false`, or custom `box-shadow` |
| `ignore` | `[]` | Selectors or DOM elements excluded from distortion |
| `onMove(rect, instance)` | — | Callback after movement |

Pointer and touch press do not change the rendered material. Hover and keyboard-visible focus remain available without a pressed or indented state.

## Excluding elements from distortion

```js
await LiquidGlass.attach('#panel', {
  ignore: ['#fixed-avatar', '.keep-sharp']
});
```

Ignored elements are mirrored into a clipped, pointer-transparent overlay. Their text, attributes and positions stay synchronized, and the overlay is removed by `detach()`.

## WebGL texture mode

Use texture mode when the background is an image and identical optical sampling across browsers is more important than capturing arbitrary DOM:

```js
await LiquidGlass.attach('#panel', {
  mode: 'texture',
  source: '#background-image',
  sourceBounds: '#background-image',
  fit: 'cover'
});
```

`source` accepts an `HTMLImageElement`, an image selector or an image URL. The sampled area follows the current target position rather than using a pre-cropped texture.

## Build and test

Requires Node.js 18 or newer.

```bash
npm ci
npm test
```

Build only the standalone library:

```bash
npm run build
```

The output is written to [`public/liquid-glass.js`](public/liquid-glass.js). Tests include geometry/unit coverage and Playwright integration checks for live DOM updates, texture rendering, press invariance, exclusions and fallback behavior. Files in `tests/fixtures/` are isolated test harnesses, not a shipped application.

## Publishing

Every push to `main` runs all checks and publishes only `public/liquid-glass.js` to GitHub Pages. A tag matching `v*.*.*` runs the same checks and creates a GitHub Release with the library and its SHA-256 checksum.

```bash
npm version patch
git push --follow-tags
```

## Browser notes

- Modern Chrome, Edge and Firefox support the live DOM displacement pipeline.
- Safari keeps live blur, tint and highlights but may omit URL-based backdrop displacement; use texture mode when exact image refraction is required there.
- CSS properties that create a new backdrop root can intentionally limit which lower layers are visible to the glass.
- GPU antialiasing and color compositing can vary slightly across browser engines.

## License

MIT. See [LICENSE](LICENSE). Research and third-party attribution details are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); no third-party source files or assets are included.
