// GPU smoke test: runs the real app headless (WebGPU via SwiftShader) for a
// while on the HIGH tier (cascades + AMR + spray + minimap) and reports any
// WGSL compile errors, WebGPU validation errors, or page errors.
//
// Note: CPU readback (mapAsync) and canvas screenshot compositing are broken
// in headless SwiftShader builds, so this validates shader compilation,
// pipeline creation, and command submission — which is where real bugs live.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const file = url === '/' ? '/index.html' : url;
  try {
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(8127, '127.0.0.1', r));

const seconds = Number(process.argv[2] ?? 15);
const urlQ = process.argv[3] ?? '/';
const browser = await puppeteer.launch({
  headless: true,
  executablePath: await chromium.executablePath(),
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader',
    '--use-angle=swiftshader', '--enable-features=Vulkan'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 500 });
const errors = [];
const noise = (t) => t.includes('Problem loading') || t.includes('ERR_CERT') || t.includes('Preload');
page.on('console', (m) => { const t = m.text(); if (!noise(t)) errors.push(`[console.${m.type()}] ${t.slice(0, 300)}`); });
page.on('pageerror', (e) => { const t = e.message; if (!noise(t)) errors.push(`[pageerror] ${t.slice(0, 300)}`); });
await page.goto('http://127.0.0.1:8127' + urlQ, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, seconds * 1000));
const stats = await page.evaluate(() => document.getElementById('stats')?.textContent ?? '(no stats)')
  .catch(() => '(eval failed)');

console.log('=== STATS ===\n' + stats);
if (errors.length) {
  console.log(`\n=== ERRORS (${errors.length}) ===\n` + errors.slice(0, 20).join('\n'));
  process.exit(1);
} else {
  console.log('\n=== GPU VALIDATION CLEAN ===');
  await browser.close(); server.close();
  process.exit(0);
}
