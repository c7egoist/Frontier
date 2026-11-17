// Boot: the authored Lobby level (Levels/Lobby.level.json, falling back to the built-in defaults), the Level Designer,
// then the ControlVehicle parts compiled headlessly (Shared/Models/ControlVehicle.js) and handed to the Lobby.
import { $, toast } from '../Shared/Studio/Ui.js';
import { hydrateIcons } from '../Shared/Studio/Icons.js';
import { compileAll, fmt } from '../Shared/GeometryCompile/CompileSteps.js';
import { createCompileContext } from '../Shared/GeometryCompile/CompileContext.js';
import { assetFromFile } from '../Shared/GeometryCompile/CompileSources.js';
import { loadVehicleParts } from '../Shared/Models/ControlVehicle.js';
import { createLobbyLevel, importLevel } from './LevelDocument.js';
import { createLevelDesigner } from './LevelDesigner.js';

const assets = new Map();
const { ctx } = createCompileContext();

// Premium imports compile with the Geometry Compile defaults, headlessly (no compiler workspace in the Lobby).
async function compileImport(file) {
  const asset = await assetFromFile(file);
  await compileAll(asset, ctx);
  asset.compiledAt = Date.now();
  return asset;
}

async function readLobby() {
  try {
    const response = await fetch(new URL('./Levels/Lobby.level.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return importLevel(await response.text());
  } catch (error) {
    console.warn('Lobby.level.json unavailable, using the built-in Lobby', error);
    return createLobbyLevel();
  }
}

const ready = (async () => {
  const boot = $('Boot');
  const report = (text, f) => { $('BootText').textContent = text; $('BootBar').style.width = `${Math.round(f * 100)}%`; };
  report('Reading Lobby.level.json', 0.02);
  const designer = createLevelDesigner({ level: await readLobby(), assets, compileImport });
  window.FrontierLevelDesigner = designer;
  hydrateIcons(document);
  try {
    const parts = await loadVehicleParts({ ctx, assets, report: (t, f) => report(t, 0.05 + f * 0.95) });
    designer.attachVehicle(parts);
    const tris = Object.values(parts).reduce((n, a) => n + a.out.geometry.indices.length / 3, 0);
    toast(`Lobby ready · ControlVehicle ${fmt(tris)} tris · ${designer.level.hotspots.length} hotspots`);
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 400);
  } catch (error) {
    console.error(error);
    $('BootText').textContent = `Could not compile the ControlVehicle: ${error.message}. The Lobby opens without the car.`;
    boot.classList.add('failed');
    setTimeout(() => boot.remove(), 2500);
  }
  return designer;
})();

export { assets, ready };
