import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('html[data-fixture-ready="true"]').waitFor();
});

async function waitForInteraction(page) {
  await page.waitForFunction(() => {
    const instance = window.LiquidGlass.get('#glass');
    return instance && instance.currentInteraction === instance.targetInteraction;
  });
}

test('standalone bundle exposes the 0.0.1 API', async ({ page }) => {
  expect(await page.evaluate(() => ({
    version: window.LiquidGlass.version,
    functions: ['attach', 'attachAll', 'detach', 'get']
      .filter((name) => typeof window.LiquidGlass[name] === 'function'),
    preset: window.LiquidGlass.borderPresets.default,
  }))).toEqual({
    version: '0.0.1',
    functions: ['attach', 'attachAll', 'detach', 'get'],
    preset: {
      topWidth: 1,
      bottomWidth: 2 / 3,
      topColor: [255, 255, 255, 40 / 255],
      bottomColor: [255, 255, 255, 20 / 255],
      shadowColor: [0, 0, 0, 0],
    },
  });
});

test('attaches configurable live-DOM glass and restores the host on detach', async ({ page }) => {
  const initial = await page.evaluate(async () => {
    const target = document.querySelector('#glass');
    const instance = await window.LiquidGlass.attach(target, {
      width: 200,
      height: 84,
      radius: 28,
      tintAlpha: 0.18,
      draggable: false,
      shadow: false,
    });
    const border = target.querySelector('[data-liquid-glass-border]');
    const top = border.querySelector('[data-liquid-glass-border-top]');
    const bottom = border.querySelector('[data-liquid-glass-border-bottom]');
    return {
      renderer: target.dataset.renderer,
      size: [getComputedStyle(target).width, getComputedStyle(target).height],
      radius: getComputedStyle(target).borderRadius,
      text: target.textContent,
      canvasCount: target.querySelectorAll('canvas').length,
      backdropFilter: target.style.backdropFilter,
      border: {
        preset: border.dataset.liquidGlassBorder,
        topWidth: Number(top.dataset.strokeWidth),
        bottomWidth: Number(bottom.dataset.strokeWidth),
      },
      debug: instance.getDebugState(),
    };
  });

  expect(initial).toMatchObject({
    renderer: 'dom',
    size: ['200px', '84px'],
    radius: '28px',
    text: 'CONTENT',
    canvasCount: 0,
    border: { preset: 'default-directional', topWidth: 1, bottomWidth: 2 / 3 },
    debug: {
      mode: 'dom',
      border: true,
      borderPreset: { name: 'default-directional' },
      geometry: { source: null, image: null },
    },
  });
  expect(initial.backdropFilter).toContain('url(');

  const detached = await page.evaluate(() => {
    const target = document.querySelector('#glass');
    const result = window.LiquidGlass.detach(target);
    return {
      result,
      attached: target.hasAttribute('data-liquid-glass-attached'),
      borderCount: target.querySelectorAll('[data-liquid-glass-border]').length,
      text: target.textContent,
    };
  });
  expect(detached).toEqual({ result: true, attached: false, borderCount: 0, text: 'CONTENT' });
});

test('live lower-layer movement is reflected without an image capture', async ({ page }) => {
  await page.evaluate(async () => {
    await window.LiquidGlass.attach('#glass', {
      width: 220,
      height: 100,
      radius: 30,
      tintAlpha: 0.12,
      blurRadius: 2,
      draggable: false,
      shadow: false,
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const glass = page.locator('#glass');
  const before = await glass.screenshot({ animations: 'disabled' });
  await page.evaluate(() => {
    document.querySelector('#moving-layer').style.transform = 'translateX(150px)';
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await glass.screenshot({ animations: 'disabled' });

  expect(before.equals(after)).toBe(false);
  expect(await page.evaluate(() => {
    const instance = window.LiquidGlass.get('#glass');
    return {
      source: instance.source,
      primitives: [...instance.domFilter.children].map((node) => node.localName),
      displacementMap: instance.domMapImage.getAttribute('href').startsWith('data:image/png;base64,'),
      materialMap: instance.domMaterialMapImage.getAttribute('href').startsWith('data:image/png;base64,'),
    };
  })).toEqual({
    source: undefined,
    primitives: ['feImage', 'feDisplacementMap', 'feGaussianBlur', 'feColorMatrix', 'feImage', 'feComposite'],
    displacementMap: true,
    materialMap: true,
  });
});

test('pointer and touch press leave the rendered glass pixel-identical', async ({ browser, page }) => {
  await page.evaluate(() => window.LiquidGlass.attach('#glass', {
    width: 200,
    height: 84,
    radius: 28,
    draggable: false,
    shadow: false,
  }));
  const mouseGlass = page.locator('#glass');
  await mouseGlass.hover();
  await waitForInteraction(page);
  const mouseBefore = await mouseGlass.screenshot({ animations: 'disabled' });
  await page.mouse.down();
  await page.waitForTimeout(220);
  const mouseHeld = await mouseGlass.screenshot({ animations: 'disabled' });
  expect(mouseHeld.equals(mouseBefore)).toBe(true);
  await page.mouse.up();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await context.newPage();
  await touchPage.goto('/');
  await touchPage.locator('html[data-fixture-ready="true"]').waitFor();
  await touchPage.evaluate(() => window.LiquidGlass.attach('#glass', {
    width: 200,
    height: 84,
    radius: 28,
    draggable: false,
    shadow: false,
  }));
  const touchGlass = touchPage.locator('#glass');
  const touchBefore = await touchGlass.screenshot({ animations: 'disabled' });
  const box = await touchGlass.boundingBox();
  const cdp = await context.newCDPSession(touchPage);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await touchPage.waitForTimeout(220);
  const touchHeld = await touchGlass.screenshot({ animations: 'disabled' });
  expect(touchHeld.equals(touchBefore)).toBe(true);
  expect(await touchPage.evaluate(() => {
    const instance = window.LiquidGlass.get('#glass');
    return [instance.currentInteraction, instance.targetInteraction];
  })).toEqual([0, 0]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await context.close();
});

test('ignore selectors stay sharp, live and disposable', async ({ page }) => {
  const initial = await page.evaluate(async () => {
    const instance = await window.LiquidGlass.attach('#glass', {
      width: 250,
      height: 100,
      radius: 30,
      draggable: false,
      shadow: false,
      ignore: ['#ignored', '.no-distort'],
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      count: instance.ignoredClones.length,
      text: instance.ignoredClones[0].clone.textContent,
      overlays: document.querySelectorAll('[data-liquid-glass-ignore-overlay]').length,
      debugCount: instance.getDebugState().ignoredElements,
    };
  });
  expect(initial).toEqual({ count: 1, text: 'SHARP', overlays: 1, debugCount: 1 });

  expect(await page.evaluate(async () => {
    document.querySelector('#ignored').textContent = 'UPDATED';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return window.LiquidGlass.get('#glass').ignoredClones[0].clone.textContent;
  })).toBe('UPDATED');

  expect(await page.evaluate(() => ({
    detached: window.LiquidGlass.detach('#glass'),
    overlays: document.querySelectorAll('[data-liquid-glass-ignore-overlay]').length,
  }))).toEqual({ detached: true, overlays: 0 });
});

test('texture mode renders a live source image and falls back without WebGL', async ({ browser, page }) => {
  const textureState = await page.evaluate(async () => {
    const source = new Image();
    source.id = 'texture';
    source.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0';
    source.src = `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="240">
        <defs><linearGradient id="g"><stop stop-color="#ff3158"/><stop offset="1" stop-color="#245dff"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#g)"/><circle cx="210" cy="120" r="64" fill="#fff"/>
      </svg>
    `)}`;
    document.querySelector('#stage').prepend(source);
    await source.decode();
    const instance = await window.LiquidGlass.attach('#glass', {
      mode: 'texture',
      source,
      sourceBounds: source,
      fit: 'cover',
      width: 180,
      height: 84,
      radius: 28,
      draggable: false,
      shadow: false,
    });
    return {
      renderer: instance.element.dataset.renderer,
      canvasCount: instance.element.querySelectorAll('canvas').length,
      source: instance.getDebugState().geometry.source,
      centerPixel: instance.getDebugState().centerPixel,
    };
  });
  expect(textureState).toMatchObject({
    renderer: 'webgl',
    canvasCount: 1,
    source: { width: 400, height: 240 },
  });
  expect(textureState.centerPixel[3]).toBe(255);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fallbackPage = await context.newPage();
  await fallbackPage.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      return type === 'webgl' ? null : original.call(this, type, ...args);
    };
  });
  await fallbackPage.goto('/');
  await fallbackPage.locator('html[data-fixture-ready="true"]').waitFor();
  await fallbackPage.evaluate(async () => {
    const source = new Image();
    source.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>';
    document.body.append(source);
    await source.decode();
    await window.LiquidGlass.attach('#glass', { mode: 'texture', source, sourceBounds: source });
  });
  await expect(fallbackPage.locator('#glass')).toHaveAttribute('data-renderer', 'fallback');
  await context.close();
});
