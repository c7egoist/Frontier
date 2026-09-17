// screenshot harness: static server + headless chrome (puppeteer), captures
// verification views of every roof form into shots/
import puppeteer from 'puppeteer-core';
import chromiumPkg from '@sparticuz/chromium';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  try {
    const data = fs.readFileSync(f);
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(4173, r));

const browser = await puppeteer.launch({
  headless: true,
  executablePath: await chromiumPkg.executablePath(),
  args: [...chromiumPkg.args, '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

const views = [
  { name: 'iso',    azim: 35, elev: 18, dist: 17, z: 2.8 },
  { name: 'front',  azim: 90, elev: 6,  dist: 19, z: 2.6 },
  { name: 'gable',  azim: 0,  elev: 8,  dist: 19, z: 3.2 },
  { name: 'eave',   azim: 55, elev: 10, dist: 8,  z: 3.6 },
  { name: 'ridge',  azim: 125, elev: 32, dist: 9, z: 4.6 },
];
const types = process.argv[2] ? process.argv[2].split(',') : ['kirizuma', 'yosemune', 'irimoya', 'hogyo'];

fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
for (const type of types) {
  for (const v of views) {
    const url = `http://localhost:4173/?shot=1&type=${type}&azim=${v.azim}&elev=${v.elev}&dist=${v.dist}&z=${v.z}`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForFunction('window.__ready === true', { timeout: 10000 }).catch(() => console.log('  (ready timeout)', type, v.name));
    await new Promise(r => setTimeout(r, 300));
    const out = path.join(root, 'shots', `${type}-${v.name}.png`);
    await page.screenshot({ path: out });
    console.log('shot', path.basename(out));
  }
}
await browser.close();
server.close();
process.exit(0);
