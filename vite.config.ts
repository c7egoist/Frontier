import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  build: {
    target: "es2022",
    assetsInlineLimit: 10000000,
    chunkSizeWarningLimit: 1600,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
