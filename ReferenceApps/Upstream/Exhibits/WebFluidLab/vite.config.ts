import { defineConfig } from "vite";

// Realtime Fluid Lab — Vite configuration.
// Shaders (.wgsl / .glsl) are imported as raw text via the `?raw` suffix at
// call sites, so no special plugin is required. The dev server is bound to
// 0.0.0.0 so it is reachable from the sandbox's live-preview proxy, and we
// allow any host since the preview is served from a dynamically generated
// subdomain.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
  },
});
