import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(here, 'Capture');
const baseUrl = process.env.FRONTIER_URL || 'http://127.0.0.1:5173/';
const appUrl = new URL(baseUrl);
appUrl.searchParams.set('quality', process.env.FRONTIER_QUALITY || 'low');
appUrl.searchParams.set('fps', process.env.FRONTIER_FPS || '5');

let chromium;
let puppeteer;
let inflate;
let setupLambdaEnvironment;
try {
  const chromiumPackage = await import('@sparticuz/chromium');
  chromium = chromiumPackage.default;
  inflate = chromiumPackage.inflate;
  setupLambdaEnvironment = chromiumPackage.setupLambdaEnvironment;
  puppeteer = (await import('puppeteer-core')).default;
} catch {
  console.error('Visual validation requires: npm install --no-save @sparticuz/chromium puppeteer-core');
  process.exit(2);
}

await mkdir(captureDir, { recursive: true });
// The AL2023 shared libraries are auto-extracted only on Lambda. Extract them
// explicitly for a generic Linux/headless-shell validation sandbox.
await inflate(path.resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
setupLambdaEnvironment('/tmp/al2023/lib');
const executablePath = await chromium.executablePath();

const browser = await puppeteer.launch({
  executablePath,
  headless: 'shell',
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
  defaultViewport: { width: 1400, height: 860, deviceScaleFactor: 1 },
});
const browserProcess = browser.process();
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
    console.error('[browser console]', message.text());
  }
});
page.on('pageerror', (error) => {
  pageErrors.push(error.message);
  console.error('[browser pageerror]', error.message);
});

let client;
async function capture(name) {
  const started = Date.now();
  const shot = await Promise.race([
    client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    }),
    wait(40000).then(() => null),
  ]);
  if (!shot) throw new Error(`Timed out capturing ${name}`);
  await writeFile(path.join(captureDir, name), Buffer.from(shot.data, 'base64'));
  console.log(`captured ${name} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function measureGlyphMotion() {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'motion-hide-ui';
    style.textContent = '#viewport > *:not(#gl-canvas) { visibility: hidden !important; }';
    document.head.appendChild(style);
  });
  const rect = await page.evaluate(() => {
    const bounds = document.querySelector('#viewport').getBoundingClientRect();
    return {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  });
  const clip = { ...rect, scale: 1 };
  const clippedFrame = async () => {
    const shot = await Promise.race([
      client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
        clip,
      }),
      wait(40000).then(() => null),
    ]);
    if (!shot) throw new Error('Timed out capturing a glyph-motion frame');
    return shot.data;
  };
  const frameDifference = (first, second) => page.evaluate(async ({ first, second }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const width = 360;
      const height = 220;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const a = await decode(first);
    const b = await decode(second);
    let changed = 0;
    let sum = 0;
    let total = 0;
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      sum += delta;
      if (delta > 45) changed += 1;
      total += 1;
    }
    return {
      changedFraction: Number((changed / total).toFixed(5)),
      meanAbs: Number((sum / (total * 3)).toFixed(3)),
    };
  }, { first, second });

  const animatedA = await clippedFrame();
  await wait(1400);
  const animatedB = await clippedFrame();
  await writeFile(path.join(captureDir, '06-arrow-motion-a.png'), Buffer.from(animatedA, 'base64'));
  await writeFile(path.join(captureDir, '07-arrow-motion-b.png'), Buffer.from(animatedB, 'base64'));
  const animatedDiff = await frameDifference(animatedA, animatedB);

  await page.evaluate(() => document.querySelector('#layer-animated-glyphs').click());
  await wait(700);
  const staticA = await clippedFrame();
  await wait(1400);
  const staticB = await clippedFrame();
  const staticDiff = await frameDifference(staticA, staticB);

  await page.evaluate(() => {
    document.querySelector('#layer-animated-glyphs').click();
    document.querySelector('#motion-hide-ui')?.remove();
  });
  await wait(500);
  const animated = await page.evaluate(() => Boolean(window.__fieldStudio?.state.layers.animatedGlyphs));
  return {
    animated,
    viewport: rect,
    sampleWidth: 360,
    sampleHeight: 220,
    threshold: 45,
    animatedChangedFraction: animatedDiff.changedFraction,
    animatedMeanAbs: animatedDiff.meanAbs,
    staticChangedFraction: staticDiff.changedFraction,
    staticMeanAbs: staticDiff.meanAbs,
    evidence: ['06-arrow-motion-a.png', '07-arrow-motion-b.png'],
  };
}

try {
  await page.goto(appUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#loading-overlay.hidden', { timeout: 45000 });
  client = await page.createCDPSession();
  await wait(1800);
  const glyphMotion = await measureGlyphMotion();
  console.log('glyph motion', JSON.stringify(glyphMotion));

  const environment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return {
      title: document.title,
      webgl2: Boolean(gl),
      renderer: gl ? gl.getParameter(gl.RENDERER) : null,
      floatFramebuffer: gl ? Boolean(gl.getExtension('EXT_color_buffer_float')) : null,
      backend: document.querySelector('#status-backend')?.textContent,
      counts: document.querySelector('#status-counts')?.textContent,
      fps: document.querySelector('#status-fps')?.textContent,
      legend: document.querySelector('#legend-label')?.textContent,
    };
  });

  await capture('01-wind-workspace.png');

  await page.click('[data-mode="terrain"]');
  await page.click('#filmstrip .film-card[data-slot="3"]');
  await wait(1600);
  await capture('02-terrain-flow.png');

  await page.click('[data-mode="force"]');
  await page.click('#filmstrip .film-card[data-slot="1"]');
  await wait(1500);
  await capture('03-force-field.png');

  await page.click('#sample-btn');
  await page.waitForFunction(() => document.querySelector('#custom-preset')?.disabled === false, { timeout: 25000 });
  await page.click('#filmstrip .film-card[data-slot="1"]');
  await wait(1600);
  await capture('04-imported-data.png');

  const viewportBox = await page.$eval('#gl-canvas', (canvas) => {
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  await page.mouse.click(
    viewportBox.x + viewportBox.width * 0.48,
    viewportBox.y + viewportBox.height * 0.42,
  );
  await wait(1000);
  await page.$eval('.right-panel', (panel) => { panel.scrollTop = panel.scrollHeight; });
  await wait(500);
  const probe = await page.evaluate(() => ({
    visible: !document.querySelector('#probe-details')?.hidden,
    position: document.querySelector('#probe-position')?.textContent,
    vector: [
      document.querySelector('#probe-u')?.textContent,
      document.querySelector('#probe-v')?.textContent,
      document.querySelector('#probe-w')?.textContent,
    ],
    scalar: document.querySelector('#probe-scalar')?.textContent,
  }));
  await capture('05-probe.png');

  const report = {
    url: appUrl.toString(),
    capturedAt: new Date().toISOString(),
    viewport: '1400x860, deviceScaleFactor 1, headless Chromium / SwiftShader',
    validationProfile: `quality=${appUrl.searchParams.get('quality')}, fps cap=${appUrl.searchParams.get('fps')}`,
    environment,
    glyphMotion,
    interactions: [
      'animated vs. fixed-arrow frame difference',
      'wind → terrain → force presets',
      'scalar-channel filmstrip selection',
      'sample CSV import',
      '3D terrain probe click',
    ],
    probe,
    consoleErrors,
    pageErrors,
    captures: [
      '01-wind-workspace.png',
      '02-terrain-flow.png',
      '03-force-field.png',
    '04-imported-data.png',
    '05-probe.png',
    '06-arrow-motion-a.png',
    '07-arrow-motion-b.png',
  ],
    verdict: consoleErrors.length === 0 && pageErrors.length === 0
      && probe.visible && environment.webgl2 && environment.floatFramebuffer
      && glyphMotion.animated
      && glyphMotion.animatedChangedFraction > 0.01
      && glyphMotion.animatedChangedFraction > glyphMotion.staticChangedFraction * 1.4 + 0.005
      ? 'PASS'
      : 'REVIEW',
  };
  await writeFile(path.join(captureDir, 'validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 1;
} catch (error) {
  const failure = {
    url: appUrl.toString(),
    capturedAt: new Date().toISOString(),
    error: error.message,
    consoleErrors,
    pageErrors,
    verdict: 'FAIL',
  };
  await writeFile(path.join(captureDir, 'validation-report.json'), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
} finally {
  try {
    await Promise.race([browser.close(), wait(5000)]);
  } catch {
    // Force-kill chrome-headless-shell if software WebGL readback wedges shutdown.
  }
  browserProcess?.kill('SIGKILL');
}
