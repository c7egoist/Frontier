// The ControlVehicle sample shared by the Component Viewer and the Level Designer: the three FCT1 source meshes
// (Body, Tyre, Rim in this folder, authored Z-up) and a procedural rear wing, compiled headlessly through the Geometry
// Compile steps with the Vehicle Lab palette.
import { createAsset, compileAll } from '../GeometryCompile/CompileSteps.js';
import { readFacet } from '../GeometryCompile/Engine/ImportFormats.js';
import { fetchModel } from '../GeometryCompile/CompileSources.js';
import { VEHICLE_PALETTE } from '../Studio/Render.js';

export const VEHICLE_PARTS = [
  { key: 'body', file: 'ControlVehicleBody.facet', name: 'ControlVehicle Body', tags: 'vehicle, body, fct1', collision: 'box', normals: 'angle' },
  { key: 'tyre', file: 'ControlVehicleTyre.facet', name: 'ControlVehicle Tyre', tags: 'vehicle, wheel, fct1', collision: 'box', normals: 'smooth' },
  { key: 'rim', file: 'ControlVehicleRim.facet', name: 'ControlVehicle Rim', tags: 'vehicle, wheel, fct1', collision: 'none', normals: 'angle' },
  { key: 'wing', build: buildWing, name: 'Rear Wing', tags: 'vehicle, wing, aero', collision: 'box', normals: 'angle' },
];

// A rear wing built from boxes (Y-up, metres, origin at the mounting point; +X is the car's forward direction): carbon
// main plane with a gurney flap, body-colour endplates and blue pylons, using the Vehicle Lab material families.
//   Angle: 8° angle of attack for downforce — the leading edge (front, +X) sits LOW and the trailing edge (rear, −X)
//   HIGH, and the gurney flap stands up off the trailing edge.  (It was tilted the other way, which is a lift wing.)
//   Span: endplate outer faces line up with the body's sides (ControlVehicleBody is 2.4996 m wide, ±1.2498 m).
const WING = { aoa: 8, bodyHalfWidth: 1.2498, chordHalf: 0.17, planeHalfThick: 0.016, plateHalfThick: 0.008, planeY: 0.25 };
export function buildWing() {
  const pos = [], idx = [], fam = [];
  const box = (c, h, family, tilt = 0) => {
    const base = pos.length / 3, cs = Math.cos(tilt), sn = Math.sin(tilt);
    for (let i = 0; i < 8; i++) {
      const x = (i & 1 ? 1 : -1) * h[0], y = (i & 2 ? 1 : -1) * h[1], z = (i & 4 ? 1 : -1) * h[2];
      pos.push(c[0] + x * cs - y * sn, c[1] + x * sn + y * cs, c[2] + z);
    }
    const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    for (const [a, b, c2, d] of quads) { idx.push(base + a, base + b, base + c2, base + a, base + c2, base + d); fam.push(family, family); }
  };
  const { aoa, bodyHalfWidth, chordHalf, planeHalfThick, plateHalfThick, planeY } = WING;
  const tilt = -aoa * Math.PI / 180;                       // negative about Z: front edge down, rear edge up
  const plateZ = bodyHalfWidth - plateHalfThick;            // endplate centres, outer faces flush with the body sides
  const span = plateZ - plateHalfThick;                     // main plane meets the endplates' inner faces
  box([0, planeY, 0], [chordHalf, planeHalfThick, span], 8, tilt);
  // Gurney flap: a 44 mm lip standing on the trailing edge's top surface, square to the plane.
  const te = [-chordHalf * Math.cos(tilt) - planeHalfThick * Math.sin(tilt), planeY - chordHalf * Math.sin(tilt) + planeHalfThick * Math.cos(tilt)];
  box([te[0] + 0.008 * Math.cos(tilt) - 0.022 * Math.sin(tilt), te[1] + 0.008 * Math.sin(tilt) + 0.022 * Math.cos(tilt), 0], [0.008, 0.022, span], 6, tilt);
  for (const z of [-plateZ, plateZ]) box([-0.01, 0.23, z], [0.2, 0.1, plateHalfThick], 6);
  // Pylons spread with the wider span (about 45 % out from the centre line), so the plane is not cantilevered too far.
  for (const z of [-0.56, 0.56]) box([0.02, 0.11, z], [0.05, 0.11, 0.01], 10);
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx), families: new Uint32Array(fam), format: 'Procedural', notes: ['Rear wing built in Shared/Models/ControlVehicle.js for the Dock socket demo'] };
}

// Reads (or builds) every part and compiles it headlessly with the given compile context. Each compiled asset is also
// stored in `assets` (a Map keyed by asset id) when one is passed. Returns { body, tyre, rim, wing }.
export async function loadVehicleParts({ ctx, assets = null, report = () => {} }) {
  const parts = {};
  let i = 0;
  for (const part of VEHICLE_PARTS) {
    report(`Reading ${part.file}`, i / VEHICLE_PARTS.length);
    const bytes = part.build ? null : await fetchModel(part.file);
    const raw = part.build ? part.build() : readFacet(bytes);
    const asset = createAsset({
      name: part.name, fileName: part.file || `${part.key}.procedural`, fileSize: bytes ? bytes.byteLength : 0, raw, origin: 'sample', palette: VEHICLE_PALETTE,
      settings: {
        source: { up: part.build ? 'y' : 'z' }, geometry: { centre: 'none', normals: part.normals }, collision: { type: part.collision },
        sdf: { resolution: 40 }, icon: { yaw: part.key === 'body' ? 40 : 60, pitch: 18 },
        meta: { name: part.name, category: 'Vehicle part', tags: part.tags, notes: part.build ? 'Procedural rear wing for the Dock socket demo.' : 'Vehicle Lab ControlVehicle source mesh (Frontier-OLD · VehicleProvingGrounds/Archive).' },
      },
    });
    if (assets) assets.set(asset.id, asset);
    await compileAll(asset, ctx, (step, f) => report(`Compiling ${part.name} · ${step}`, (i + f * 0.9) / VEHICLE_PARTS.length));
    asset.compiledAt = Date.now();
    parts[part.key] = asset;
    i++;
  }
  return parts;
}
