// Frontier Landscape Studio — app shell wiring:
// 2D Mask Editor <-> Landscape workspace, Outliner (left), Inspector (right).
import { Store } from './state.js';
import { Editor2D } from './editor2d.js';
import { LayerStackUI } from './layerstack.js';
import { InspectorUI } from './inspector.js';
import { Viewport3D } from './viewport3d.js';

const store = new Store();
store.load();

const hud = { cursor: null, zoom: 0.5, fps: 60 };
const maskCanvas = document.getElementById('mask-canvas');
const glCanvas = document.getElementById('gl-canvas');
const editor = new Editor2D(maskCanvas, store, hud);
const stackUI = new LayerStackUI(store);
const inspector = new InspectorUI(store);
let viewport = null;

const hudMode = document.getElementById('hud-mode');
const hudCursor = document.getElementById('hud-cursor');
const hudZoom = document.getElementById('hud-zoom');
const hudFps = document.getElementById('hud-fps');
const toast = document.getElementById('status-toast');

function showToast(msg, ms = 1200) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), ms);
}

function setMode(mode) {
  store.setMode(mode);
}

document.getElementById('mode-btn-mask').addEventListener('click', () => setMode('mask'));
document.getElementById('mode-btn-landscape').addEventListener('click', () => setMode('landscape'));

document.getElementById('btn-add-region').addEventListener('click', () => editor.addSelectionToActiveLayer());
document.getElementById('btn-clear-selection').addEventListener('click', () => {
  store.selection = null;
  editor.emitSelection();
  editor.draw();
});
document.getElementById('btn-rebuild').addEventListener('click', () => {
  showToast('Landscape rebuilt from mask layers');
});
document.getElementById('btn-wasd').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.classList.toggle('active', on);
  if (viewport) viewport.setWasd(on);
});
document.getElementById('tp-grid-res').addEventListener('change', () => showToast('Grid resolution applies on rebuild'));
document.getElementById('btn-undo').addEventListener('click', () => store.undo());
document.getElementById('btn-redo').addEventListener('click', () => store.redo());
document.getElementById('btn-save').addEventListener('click', () => { store.save(); showToast('Saved locally'); });
document.getElementById('btn-export').addEventListener('click', () => store.exportJSON());
document.getElementById('btn-toggle-panels').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  document.querySelectorAll('.tp-dock').forEach((d) => d.classList.toggle('hidden-panel', on));
  requestAnimationFrame(() => { editor.resize(); if (viewport) viewport.resize(); });
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    store.save();
    showToast('Saved locally');
  }
});

window.addEventListener('resize', () => {
  editor.resize();
  if (viewport) viewport.resize();
});

function renderAll(what) {
  stackUI.render();
  inspector.render();
  if (what !== 'mode') editor.draw();
}

store.onChange((what) => {
  if (what === 'mode') {
    const isMask = store.mode === 'mask';
    document.getElementById('mode-btn-mask').classList.toggle('active', isMask);
    document.getElementById('mode-btn-landscape').classList.toggle('active', !isMask);
    maskCanvas.classList.toggle('hidden-panel', !isMask);
    glCanvas.classList.toggle('hidden-panel', isMask);
    document.getElementById('toolbar-2d').classList.toggle('hidden-panel', !isMask);
    document.getElementById('toolbar-3d').classList.toggle('hidden-panel', isMask);
    hudMode.textContent = isMask ? 'MASK 2D' : 'LANDSCAPE 3D';
    if (!isMask && !viewport) {
      try {
        viewport = new Viewport3D(glCanvas, store, hud);
        const wasdBtn = document.getElementById('btn-wasd');
        viewport.setWasd(wasdBtn.getAttribute('aria-pressed') === 'true');
      } catch (err) {
        showToast('WebGL2 unavailable: ' + err.message, 3000);
        setMode('mask');
        return;
      }
    }
    if (!isMask && viewport) { viewport.resize(); }
    if (isMask) editor.resize();
  }
  renderAll(what);
});

// HUD ticker
setInterval(() => {
  if (hud.cursor) hudCursor.textContent = `X ${hud.cursor.x.toFixed(1)}  Z ${hud.cursor.z.toFixed(1)}`;
  hudZoom.textContent = `ZOOM ${Math.round(hud.zoom * 100)}%`;
  if (viewport) hudFps.textContent = `${hud.fps} FPS`;
}, 150);

renderAll('init');
