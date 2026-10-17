import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      build: {
        target: 'es2020',
        sourcemap: true,
        minify: 'esbuild',
        lib: {
          entry: resolve(root, 'src/index.ts'),
          name: 'FrontierAudio',
          formats: ['es', 'umd'],
          fileName: (format) =>
            format === 'es' ? 'frontier-audio.js' : 'frontier-audio.umd.cjs',
        },
      },
    };
  }

  return {
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      // The hosted preview proxies through a generated *.e2b.app hostname.
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
    build: {
      target: 'es2020',
      outDir: 'demo-dist',
    },
  };
});
