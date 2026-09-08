import { defineConfig } from 'vite';

export default defineConfig({
  /* relative asset URLs so the build works from any path — including
     https://<user>.github.io/<repo>/ where the site is not at the domain root */
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,          // the sandbox serves the preview under an *.e2b.app host
    cors: true,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2022', outDir: 'dist' },
});
