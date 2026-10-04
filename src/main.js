import './style.css';

const canvas = document.getElementById('viewport-canvas');
canvas.dataset.renderer = 'pending';

// Renderer, procedural body, and cloth solver are loaded after first paint so the UI
// remains useful while the GPU adapter is being requested.
import('./app.js').then(({ boot }) => boot(canvas)).catch((error) => {
  console.error(error);
  const status = document.getElementById('engine-status');
  status.classList.add('fallback');
  status.querySelector('.engine-label').textContent = 'VIEWPORT UNAVAILABLE';
  document.getElementById('hud-state').textContent = 'RENDERER ERROR';
});
