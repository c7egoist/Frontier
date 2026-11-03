import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    allowedHosts: true,
    hmr: { protocol: 'wss', clientPort: 443 },
  },
  build: { target: 'esnext', assetsInlineLimit: 0 },
  assetsInclude: ['**/*.wgsl'],
});
