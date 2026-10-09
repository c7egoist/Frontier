// ---------------------------------------------------------------------------
// main.js — boot: UI shell -> viewport -> editor, wire state -> panels.
// ---------------------------------------------------------------------------
import { createViewport } from './viewport.js';
import { createEditor } from './editor.js';
import { mountUI } from './ui.js';

const ui = mountUI(document.getElementById('root'));
const viewport = createViewport(ui.viewportHost, {
  onCursor: (c) => { document.body.style.cursor = c || 'auto'; },
});
const editor = createEditor(viewport, {
  onState: (ev) => ui.refresh(editor.getState(), ev),
});
ui.bind(editor, viewport);
ui.refresh(editor.getState(), { rerenderPanels: true });

// keep the canvas sized to its cell (ResizeObserver beats window resize for
// layout shifts; fall back to window resize).
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => viewport.resize());
  ro.observe(ui.viewportHost);
} else {
  window.addEventListener('resize', () => viewport.resize());
}
window.addEventListener('resize', () => viewport.resize());

// global error surface: keep the user informed instead of a dead canvas
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
});
