// Bundles the editor (app.js + app.css) and the evaluation worker (worker.js) next to index.html.
import * as esbuild from "esbuild";

const common = { bundle: true, target: "es2020", logLevel: "info", sourcemap: false };
await esbuild.build({
  ...common,
  entryPoints: ["src/ui/main.jsx"],
  outfile: "app.js",
  format: "iife",
  jsx: "automatic",
  loader: { ".js": "jsx", ".jsx": "jsx", ".ttf": "external" },
  define: { "process.env.NODE_ENV": '"production"' },
});
await esbuild.build({
  ...common,
  entryPoints: ["src/worker.js"],
  outfile: "worker.js",
  format: "iife",
});
