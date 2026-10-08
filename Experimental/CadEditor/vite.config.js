import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// replicad's OpenCascade WASM is loaded by the kernel worker as an ES module worker.
export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  // three.js + replicad make a large single bundle; the WASM is a separate asset anyway.
  build: { chunkSizeWarningLimit: 1500 },
  optimizeDeps: {
    exclude: ["replicad-opencascadejs"],
  },
  server: {
    host: "0.0.0.0",
    port: 5180,
    strictPort: true,
    allowedHosts: true,
  },
});
