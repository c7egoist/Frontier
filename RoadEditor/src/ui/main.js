// Entry point. Loads the three.js scene and starts the editor. Errors are shown in the status bar
// so a failed WebGL start never leaves a blank page.
import { Scene3D } from '../render/scene3d.js';
import { init } from './app.js';

const status = document.getElementById('status');
try {
  if (!window.ClipperLib) throw new Error('clipper-lib did not load (vendor/clipper/clipper.js)');
  await init({ Scene3D });
} catch (err) {
  console.error(err);
  if (status) status.innerHTML = `<span class="err-count">Editor failed to start: ${String(err.message || err)}</span>`;
}
