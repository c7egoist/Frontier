// Builds the single-file editor: writes ../index.html with the CSS, clipper-lib and the bundled app
// inlined, so it opens from any static host (raw.githack included) without module scripts.
// Source of truth: src/ (ES modules) and dev/index.html (the page template). Run: npm run build
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('esbuild is not installed. Run `npm install` in RoadEditor/ first.');
  process.exit(1);
}

const threeModule = path.join(root, 'vendor/three/module/three.module.js');
const localThree = {
  name: 'local-three',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: threeModule }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/ui/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
  plugins: [localThree],
  logLevel: 'warning',
});
const app = esc(result.outputFiles[0].text);
const clipper = esc(read('vendor/clipper/clipper.js'));
const css = read('style.css');

let html = read('dev/index.html');
const swap = (re, text) => {
  if (!re.test(html)) throw new Error(`template is missing ${re}`);
  html = html.replace(re, () => text);
};
swap(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
swap(/<link rel="stylesheet" href="\.\.\/style\.css">/, `<style>\n${css}\n</style>`);
swap(/<script src="\.\.\/vendor\/clipper\/clipper\.js"><\/script>/, `<script>\n${clipper}\n</script>`);
swap(/<script type="module" src="\.\.\/src\/ui\/main\.js"><\/script>/, `<script>\n${app}\n</script>`);
html = html.replace('<title>Frontier Road Editor (dev, ES modules)</title>', '<title>Frontier Road Editor</title>');
html = html.replace('<!-- clipper-lib', '<!-- Single-file build made by scripts/build.mjs from dev/index.html and src/: edit the sources, then rebuild. clipper-lib');

writeFileSync(path.join(root, 'index.html'), html);
console.log(`wrote index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
