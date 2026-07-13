import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    target: ['es2020', 'safari14'],
    outDir: 'public',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: 'src/liquid-glass/browser.js',
      name: 'LiquidGlassBundle',
      formats: ['iife'],
      fileName: () => 'liquid-glass.js',
    },
    rollupOptions: {
      output: {
      banner: '/*! LiquidGlass Web v0.0.1 | MIT License | live DOM backdrop + WebGL texture mode */',
      },
    },
  },
});
