// Entry point: boots the editor once the document is ready.
import { App } from './app.js';

function boot() {
  const root = document.getElementById('app');
  try {
    const app = new App(root);
    app.init();
    window.frontierRoadEditor = app;
  } catch (err) {
    console.error(err);
    const pane = document.querySelector('.statusbar #status-text');
    if (pane) pane.textContent = `Failed to start: ${err.message}`;
    document.getElementById('status-dot')?.classList.add('warn');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
