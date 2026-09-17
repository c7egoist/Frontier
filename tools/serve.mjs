/**
 * Zero-dependency static file server for the roof viewer.
 *
 * usage: node tools/serve.mjs [--port 5173] [--root .]
 * binds 0.0.0.0 so the sandbox preview can reach it.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const val = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const port = Number(val('port', 5173));
const root = resolve(val('root', '.'));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') { res.writeHead(302, { location: '/viewer/' }); res.end(); return; }
    if (path.endsWith('/')) path += 'index.html';
    const full = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    const info = await stat(full).catch(() => null);
    if (!info || info.isDirectory()) { res.writeHead(404).end('not found'); return; }
    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': TYPES[extname(full)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`roof viewer  http://0.0.0.0:${port}/viewer/`);
});
