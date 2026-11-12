import { FluidWaterApp } from './UI.js';

const root = document.getElementById('root');
if (root) {
  window.__fluidWaterApp = new FluidWaterApp(root);
}
