// Third-person world view: camera above an ocean looking at a continent, using the real SDF field
// for terrain and the real spectrum for water. This is the view the editor starts in, rendered on
// the CPU so it can be inspected without a GPU.
import { WorldField, DEFAULT_WORLD, bakeHeightmap, sampleBake, type HeightBake } from '../src/core/terrain.ts';
import { MERIDIAN, VESPER, THULE, AUSTRAL, ARCHIPELAGO, GULFS, CITIES } from '../src/world/presets.ts';
import { makeCascades, evaluateCascadeCPU, DEFAULT_OCEAN } from '../src/core/oceanSpectrum.ts';
import { newImage, put, rect, text, textWidth, writePng, type Image } from './png.ts';

const OUT = process.argv[2] ?? 'Exhibits';
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
const aces = (x: number) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1);
const gamma = (v: number) => Math.pow(aces(v), 1 / 2.2);
const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);

type View = {
  eyeX: number; eyeY: number; eyeZ: number;
  targetX: number; targetY: number; targetZ: number;
  label: string;
};

function renderWorld(w: number, h: number, opts: View): Image {
  const field = new WorldField({ ...DEFAULT_WORLD, gridSize: 1024 }, [MERIDIAN, VESPER, THULE, AUSTRAL], [...ARCHIPELAGO, ...GULFS]);
  const bake = bakeHeightmap(field, 1024);
  const cascades = makeCascades([512, 64, 8], 128, 424242, DEFAULT_OCEAN);
  const layers = cascades.map(c => evaluateCascadeCPU(c, 8.3, DEFAULT_OCEAN.choppiness));
  const tiles = [512, 64, 8];

  const img = newImage(w, h, [10, 14, 22]);
  // camera basis
  const eye = [opts.eyeX, opts.eyeY, opts.eyeZ];
  // Plain look-at: the exhibit wants an oblique blockout view of whole continents, which a
  // near-horizontal camera 30 km up can never show (it only sees flat interior to the horizon).
  const fwd = normalize([opts.targetX - eye[0], opts.targetY - eye[1], opts.targetZ - eye[2]]);
  const focusDist = Math.hypot(opts.targetX - eye[0], opts.targetZ - eye[2]);
  // Haze coefficient tuned so roughly a third of the colour survives at the focus distance:
  // a continental view is not erased, a coastal view stays crisp.
  const hazeK = 0.55 / Math.max(focusDist, 1);
  const hazeCap = 0.20;
  const fov = 50 * Math.PI / 180;
  const tanHalf = Math.tan(fov / 2);
  const sunDir = normalize([0.55, 0.52, 0.66]);

  const heights = bake.heights;
  const size = bake.size;
  const half = bake.worldSize / 2;
  const cell = bake.cell;

  const terrainAt = (x: number, z: number) => {
    const fx = (x + half) / cell - 0.5, fz = (z + half) / cell - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const cx = (v: number) => clamp(v, 0, size - 1);
    const a = heights[cx(z0) * size + cx(x0)], b = heights[cx(z0) * size + cx(x0 + 1)];
    const c = heights[cx(z0 + 1) * size + cx(x0)], d = heights[cx(z0 + 1) * size + cx(x0 + 1)];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  const RELIEF_GAIN = 5;
  const normalAt = (x: number, z: number, e = cell * 2): [number, number, number] => {
    const hx = (terrainAt(x + e, z) - terrainAt(x - e, z)) * RELIEF_GAIN;
    const hz = (terrainAt(x, z + e) - terrainAt(x, z - e)) * RELIEF_GAIN;
    return normalize([-hx / (2 * e), 1, -hz / (2 * e)]);
  };
  const waterAt = (x: number, z: number, footprint: number): { h: number; nx: number; nz: number; foam: number } => {
    let hh = 0, nx = 0, nz = 0, foam = 0;
    for (let c = 0; c < 3; c++) {
      const L = layers[c];
      const texel = tiles[c] / L.size;
      const ext = tiles[c] * 0.5;
      const inExtent = smooth(ext, ext * 0.75, Math.max(Math.abs(x - eye[0]), Math.abs(z - eye[2])));
      const fade = smooth(1, 3, texel / Math.max(footprint, 1e-4)) * inExtent;
      if (fade <= 0.002) continue;
      const u = ((x / tiles[c]) % 1 + 1) % 1 * L.size;
      const v = ((z / tiles[c]) % 1 + 1) % 1 * L.size;
      const x0 = Math.floor(u) % L.size, z0 = Math.floor(v) % L.size;
      const tx = u - Math.floor(u), tz = v - Math.floor(v);
      const x1 = (x0 + 1) % L.size, z1 = (z0 + 1) % L.size;
      const S = (arr: Float32Array) => lerp(lerp(arr[z0 * L.size + x0], arr[z0 * L.size + x1], tx),
        lerp(arr[z1 * L.size + x0], arr[z1 * L.size + x1], tx), tz);
      hh += S(L.height) * fade;
      nx += S(L.slopeX) * fade;
      nz += S(L.slopeZ) * fade;
      foam = Math.max(foam, smooth(0.62, 0.05, S(L.jacobian)) * fade);
    }
    return { h: hh, nx, nz, foam };
  };

  // sky gradient background
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ndcY = 1 - (y + 0.5) / h * 2;
      const dirY = fwd[1] + ndcY * tanHalf;
      const up = Math.pow(clamp(dirY, 0, 1), 0.6);
      put(img, x, y, [byte(gamma(lerp(0.30, 0.030, up))), byte(gamma(lerp(0.42, 0.080, up))), byte(gamma(lerp(0.60, 0.230, up)))]);
    }
  }

  // per-pixel ray march
  const depth = new Float32Array(w * h).fill(Infinity);
  const right = normalize(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  for (let py = 0; py < h; py++) {
    const ndcY = 1 - (py + 0.5) / h * 2;
    for (let px = 0; px < w; px++) {
      const ndcX = (px + 0.5) / w * 2 - 1;
      const dir = normalize([
        fwd[0] + right[0] * ndcX * tanHalf * (w / h) + up[0] * ndcY * tanHalf,
        fwd[1] + right[1] * ndcX * tanHalf * (w / h) + up[1] * ndcY * tanHalf,
        fwd[2] + right[2] * ndcX * tanHalf * (w / h) + up[2] * ndcY * tanHalf,
      ]);
      let t = 5;
      let hitKind: 'none' | 'terrain' | 'water' = 'none';
      let hitT = 0;
      // March range has to cover the camera's own altitude: an oblique view from 1 800 km up
      // reaches the ground ~2 500 km away, far past the old 400 km cut-off (which silently
      // turned every frame into "no hit").
      const marchLimit = Math.max(600_000, Math.hypot(tanHalf * 2 * Math.hypot(eye[0], eye[1], eye[2]), 1) * 3);
      for (let step = 0; step < 512; step++) {
        const x = eye[0] + dir[0] * t;
        const z = eye[2] + dir[2] * t;
        const y = eye[1] + dir[1] * t;
        const inRegion = Math.abs(x) <= half && Math.abs(z) <= half;
        const foot = (t * 2 * tanHalf) / h;
        const th = inRegion ? terrainAt(x, z) : -4200;
        const wh = waterAt(x, z, foot).h;
        const surf = Math.max(th, wh);
        if (y <= surf) {
          hitKind = th > wh + 0.2 ? 'terrain' : 'water';
          hitT = t;
          break;
        }
        t += Math.max(foot * 1.2, (y - surf) * 0.28, t * 0.002, 2);
        if (t > marchLimit) break;
        if (!inRegion && y < -6000) break;
      }
      if (hitKind === 'none') {
        // Below the horizon but nothing hit: this is far ocean beyond the simulation rings, so
        // shade it as flat water rather than leaving the sky colour.
        if (dir[1] < 0) {
          const hz = Math.min(hazeCap, 1 - Math.exp(-8_000_000 * hazeK));
          const far = [lerp(0.035, 0.46, hz), lerp(0.075, 0.56, hz), lerp(0.105, 0.70, hz)];
          put(img, px, py, [byte(gamma(far[0])), byte(gamma(far[1])), byte(gamma(far[2]))]);
        }
        continue;
      }
      depth[py * w + px] = hitT;
      const x = eye[0] + dir[0] * hitT;
      const z = eye[2] + dir[2] * hitT;
      const view = normalize([-dir[0], -dir[1], -dir[2]]);
      let col: [number, number, number];
      if (hitKind === 'terrain') {
        const th = terrainAt(x, z);
        const n = normalAt(x, z);
        const ndl = Math.max(n[0] * sunDir[0] + n[1] * sunDir[1] + n[2] * sunDir[2], 0);
        const slope = 1 - n[1];
        let albedo: number[];
        if (th < 0) {
          albedo = th < -1800 ? [0.06, 0.08, 0.10] : th < -150 ? [0.20, 0.22, 0.24] : [0.52, 0.47, 0.36];
        } else {
          albedo = [0.50, 0.44, 0.28];                                            // coastal sand
          albedo = albedo.map((v, i) => lerp(v, [0.115, 0.205, 0.075][i], smooth(4, 45, th)));
          albedo = albedo.map((v, i) => lerp(v, [0.185, 0.190, 0.090][i], smooth(700, 1400, th)));
          albedo = albedo.map((v, i) => lerp(v, [0.175, 0.150, 0.130][i], smooth(1900, 2900, th + slope * 1100)));
          albedo = albedo.map((v, i) => lerp(v, [0.880, 0.905, 0.945][i], smooth(3800, 4300, th - slope * 900)));
          albedo = albedo.map((v, i) => lerp(v, [0.135, 0.120, 0.110][i], smooth(0.25, 0.6, slope)));
        }
        const amb = lerp(0.14, 0.34, n[1]);
        const sun = 1.45;
        col = [albedo[0] * (ndl * sun + amb), albedo[1] * (ndl * sun * 0.97 + amb), albedo[2] * (ndl * sun * 0.92 + amb)];
        if (th < 0) {
          const absorb = Math.exp(-(-th) * 0.006);
          col = col.map((v, i) => v * lerp([0.2, 0.32, 0.38][i], 1, absorb));
        }
      } else {
        const wtr = waterAt(x, z, (hitT * 2 * tanHalf) / h);
        const n = normalize([-wtr.nx * 2.6, 1, -wtr.nz * 2.6]);
        const ndv = clamp(-(view[0] * n[0] + view[1] * n[1] + view[2] * n[2]), 0, 1);
        const fres = Math.min(0.02 + 0.98 * Math.pow(1 - ndv, 5), 0.88);
        const d2 = -(view[0] * n[0] + view[1] * n[1] + view[2] * n[2]) * 2;
        const refl = normalize([view[0] + d2 * n[0], view[1] + d2 * n[1], view[2] + d2 * n[2]]);
        const upR = Math.pow(clamp(refl[1], 0, 1), 0.6);
        const dim = lerp(0.62, 0.95, smooth(0, 0.35, ndv));
        const reflCol = [lerp(0.30, 0.030, upR) * dim, lerp(0.42, 0.080, upR) * dim, lerp(0.60, 0.230, upR) * dim];
        const seabed = Math.max(terrainAt(x, z), -4200);
        const depth = -seabed;
        const shallow = smooth(180, 0, depth);
        const body = [lerp(0.006, 0.10, shallow), lerp(0.055, 0.34, shallow), lerp(0.080, 0.33, shallow)];
        const align = clamp(refl[0] * sunDir[0] + refl[1] * sunDir[1] + refl[2] * sunDir[2], 0, 1);
        const glint = Math.pow(align, 480) * 7;
        col = [
          lerp(body[0], reflCol[0], fres) + glint,
          lerp(body[1], reflCol[1], fres) + glint * 0.97,
          lerp(body[2], reflCol[2], fres) + glint * 0.92,
        ];
        if (wtr.foam > 0.05) {
          const f = wtr.foam * 0.8;
          col = [lerp(col[0], 0.84, f), lerp(col[1], 0.88, f), lerp(col[2], 0.92, f)];
        }
      }
      // Aerial perspective: exponential, but scaled for continental distances. At 100 km about a
      // third of the colour is haze; the far ridge is not erased.
      // Aerial perspective that saturates slowly: ~20% at 60 km, ~40% at 300 km, 55% max.
      const haze = Math.min(hazeCap, 1 - Math.exp(-hitT * hazeK));
      const hazeCol = [0.26, 0.36, 0.50];
      col = [lerp(col[0], hazeCol[0], haze), lerp(col[1], hazeCol[1], haze), lerp(col[2], hazeCol[2], haze)];
      put(img, px, py, [byte(gamma(col[0])), byte(gamma(col[1])), byte(gamma(col[2]))]);
    }
  }

  // city plots as small markers
  for (const c of CITIES) {
    const hh = Math.max(terrainAt(c.x, c.z), 0);
    // Project the actual 3D point. The old code used only the horizontal component of the
    // view vector, which is meaningless from a high oblique camera.
    const rel = [c.x - eye[0], hh - eye[1], c.z - eye[2]];
    const t = rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2];
    if (t <= 1000) continue;
    const sx = w / 2 + ((rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2]) / (t * tanHalf * (w / h))) * (w / 2);
    const sy = h / 2 - ((rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2]) / (t * tanHalf)) * (h / 2);
    if (sx < 2 || sy < 2 || sx > w - 3 || sy > h - 3) continue;
    // Occlusion: the label must sit in front of whatever the terrain ray hit there.
    const behind = depth[Math.round(sy) * w + Math.round(sx)];
    if (Number.isFinite(behind) && behind < t * 0.985) continue;
    const col: [number, number, number] = c.kind === 'capital' ? [255, 214, 110] : [255, 150, 110];
    for (let dy = -1; dy <= 1; dy++) for (let dx2 = -1; dx2 <= 1; dx2++) put(img, Math.round(sx) + dx2, Math.round(sy) + dy, col);
    text(img, Math.round(sx) + 4, Math.round(sy) - 3, c.name.split(' ')[0], [246, 242, 226]);
  }

  const title = 'WORLD BLOCKOUT - SDF TERRAIN + SPECTRAL OCEAN';
  const sub = `${opts.label}  -  RELIEF x5  -  CPU REFERENCE, NOT A GPU CAPTURE`;
  rect(img, 8, 8, 16 + Math.max(textWidth(title), textWidth(sub)), 40, [8, 12, 18], 0.82);
  text(img, 12, 11, title, [226, 238, 250]);
  text(img, 12, 24, sub, [140, 168, 196]);
  return img;
}

function normalize(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

// Half-res draft for iterating: WV_SCALE=0.5 node --experimental-strip-types tools/worldview.ts /tmp
const SCALE = process.env.WV_SCALE ? Number(process.env.WV_SCALE) : 1;
const W = Math.round(1280 * SCALE), H = Math.round(720 * SCALE);

const t0 = Date.now();
console.log('rendering continental view…');
writePng(`${OUT}/world-view.png`, renderWorld(W, H, {
  eyeX: -2_620_000, eyeY: 1_780_000, eyeZ: -2_380_000,
  targetX: 0, targetY: 0, targetZ: 0,
  label: 'CONTINENTAL VIEW - 20 000 KM REGION',
}));
console.log('rendering gulf view…');
writePng(`${OUT}/world-coast.png`, renderWorld(W, H, {
  eyeX: -1_980_000, eyeY: 470_000, eyeZ: -1_020_000,
  targetX: -1_400_000, targetY: 0, targetZ: 240_000,
  label: 'GULF OF KESH - COASTLINE AND SHELF',
}));
console.log(`done in ${Date.now() - t0} ms`);
