// Headless verification: serve dist/, load the app in Chrome with WebGPU
// SwiftShader, collect console/page errors, dump adapter info + screenshot.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('./dist', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const file = url === '/' ? '/index.html' : url;
  try {
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise((r) => server.listen(8123, '127.0.0.1', r));

const shot = process.argv[2] ?? '../shots/test.png';
const urlQ = process.argv[3] ?? '/?fast';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: await chromium.executablePath(),
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-webgpu',
    '--use-webgpu-adapter=swiftshader',
    '--use-angle=swiftshader',
    '--enable-features=Vulkan',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

try {
  await page.goto('http://127.0.0.1:8123' + urlQ, { waitUntil: 'load', timeout: 60000 });
} catch (e) {
  logs.push('[goto] ' + e.message);
}

// probe WebGPU availability inside the page
try {
  const probe = await page.evaluate(async () => {
    if (!('gpu' in navigator)) return 'no navigator.gpu';
    const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!ad) return 'no adapter';
    const info = ad.info ?? {};
    return `adapter ok: ${JSON.stringify(info)}`;
  });
  logs.push('[probe] ' + probe);
} catch (e) {
  logs.push('[probe-threw] ' + e.message);
}

await new Promise((r) => setTimeout(r, 15000));

const state = await page.evaluate(() => {
  const canvas = document.getElementById('gfx');
  const stats = document.getElementById('stats')?.textContent ?? '';
  const err = document.getElementById('err');
  return {
    canvasW: canvas?.width, canvasH: canvas?.height,
    stats,
    errVisible: err ? getComputedStyle(err).display !== 'none' : false,
    errText: err?.textContent ?? '',
  };
}).catch((e) => ({ evalError: e.message }));

await page.screenshot({ path: shot }).catch((e) => logs.push('[shot] ' + e.message));

console.log('=== LOGS ===\n' + logs.join('\n'));
console.log('=== STATE ===\n' + JSON.stringify(state, null, 2));
await browser.close();
server.close();
process.exit(0);
