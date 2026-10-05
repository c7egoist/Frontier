import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
<<<<<<< HEAD
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    cors: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  }
=======
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
  },
>>>>>>> ac820a6 (Road & Bridge Studio: spline road/junction/bridge generator in Slate editor theme)
});
