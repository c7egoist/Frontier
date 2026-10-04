import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'demo',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
