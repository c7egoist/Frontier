import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// The dev server is reached through the sandbox preview host, so the .e2b.app origin must be allowed.
export default defineConfig({
  root,
  base: './',
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  worker: { format: 'es' },
});
