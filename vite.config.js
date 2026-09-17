import { defineConfig } from 'vite';

// The preview environment proxies the dev server through a dynamic *.e2b.app host,
// so host checking is disabled for both dev and preview.
export default defineConfig({
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
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
