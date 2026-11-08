import { defineConfig } from 'vite';
export default defineConfig({server:{host:'0.0.0.0',allowedHosts:true},build:{chunkSizeWarningLimit:650,rollupOptions:{output:{manualChunks:{'vendor-three':['three']}}}}});
