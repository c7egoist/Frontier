import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainJs = readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/app/landscape.css', import.meta.url), 'utf8');

function idsInHtml() {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

test('every element the landscape workspace looks up exists in the document', () => {
  const ids = idsInHtml();
  const block = mainJs.slice(mainJs.indexOf('function ensureLandscapeWorkspace'), mainJs.indexOf('const LANDSCAPE_PANEL_IDS'));
  const looked = [...block.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(looked.length > 20, 'the workspace binds a full set of refs');
  for (const id of looked) assert.ok(ids.has(id), `main.js looks up #${id} but index.html has no such element`);
  // Each element must also be handed to the controller under a ref name, or the
  // control is wired to nothing and silently does nothing in the browser.
  const refKeys = [...block.matchAll(/^\s{8}(\w+): document\.getElementById/gm)].map((match) => match[1]);
  assert.ok(refKeys.length > 20, `only ${refKeys.length} refs are passed to the workspace`);
  const studio = readFileSync(new URL('../src/app/landscape-studio.js', import.meta.url), 'utf8');
  for (const key of refKeys) {
    assert.match(studio, new RegExp(`refs\\.${key}\\b`), `ref "${key}" is collected in main.js but never used`);
  }
});

test('the workspace switcher can actually reach the Landscape Studio', () => {
  assert.match(html, /id="mode-btn-landscape"/);
  assert.match(mainJs, /getElementById\('mode-btn-landscape'\)\.addEventListener/);
  assert.match(mainJs, /setStudioMode\('landscape'\)/);
  // Hash routing so a reload lands back in the planet editor.
  assert.match(mainJs, /#landscape/);
  assert.match(mainJs, /history\.replaceState\(null, '', '#landscape'\)/);
});

test('landscape panels are hidden in the other two studios', () => {
  const block = mainJs.slice(mainJs.indexOf('const LANDSCAPE_PANEL_IDS'), mainJs.indexOf('function setStudioMode'));
  const listed = [...block.matchAll(/'([a-z-]+)',\n/g)].map((match) => match[1]);
  const ids = idsInHtml();
  for (const id of listed) assert.ok(ids.has(id), `LANDSCAPE_PANEL_IDS lists #${id}, missing from index.html`);
  assert.ok(listed.includes('landscape-viewport'));
  assert.ok(listed.includes('left-landscape-panels'));
  assert.ok(listed.includes('right-landscape-panels'));
  // The chrome is hidden by mode class too, so a missed toggle cannot leave a
  // floating HUD on top of the Terrain Studio.
  assert.match(css, /body:not\(\.lm-mode\)/);
});

test('the landscape viewport fills the stage it is dropped into', () => {
  // A zero-height parent collapses the canvas; the dock must be positioned and
  // the viewport must fill it.
  assert.match(css, /\.tp-viewport-dock\s*\{[^}]*position:\s*relative/);
  assert.match(css, /\.lm-viewport\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  // The tool rail is an overlay, not a sibling that would shrink the canvas.
  assert.match(css, /\.lm-toolrail\s*\{[^}]*position:\s*absolute/s);
});

test('the landscape stylesheet is loaded and owns its own tokens fallbacks', () => {
  assert.match(html, /landscape\.css/);
  // Every --tp-* token used must exist in the stylesheet theme or have a
  // fallback, otherwise the panel renders transparent/black.
  const used = new Set([...css.matchAll(/var\((--tp-[a-z0-9-]+)\)/g)].map((match) => match[1]));
  const theme = readFileSync(new URL('../src/app/style.css', import.meta.url), 'utf8');
  for (const token of used) {
    assert.ok(theme.includes(`${token}:`), `landscape.css uses ${token}, which the theme never defines`);
  }
});
