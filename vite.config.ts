import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The app is 100% client side (WebGPU). Vite serves it as a static SPA.
// `host: true` + `allowedHosts: true` keeps it working behind the Arena preview proxy.
export default defineConfig({
  root: 'web',
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./web/src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  // Vitest runs from the repository root (the app's root is `web`, which has no tests in it).
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  build: {
    target: 'es2022',
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
