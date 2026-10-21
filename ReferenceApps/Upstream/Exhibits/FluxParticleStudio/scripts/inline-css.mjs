// Post-build: inline dist CSS into dist/index.html so the page is styled even
// when the host serves .css unusable (observed on githack).
import fs from 'node:fs';
const htmlPath = new URL('../dist/index.html', import.meta.url);
let html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!m) {
  console.log('inline-css: no stylesheet link found');
  process.exit(0);
}
const cssPath = new URL(`../dist/${m[1].replace(/^\.\//, '')}`, import.meta.url);
const css = fs.readFileSync(cssPath, 'utf8');
if (css.includes('</style')) throw new Error('inline-css: unsafe CSS content');
html = html.replace(m[0], `<style>\n${css}\n</style>`);
fs.writeFileSync(htmlPath, html);
console.log(`inline-css: inlined ${m[1]} (${css.length} chars)`);
