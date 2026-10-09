import { clamp } from "./field.js";
import { paletteLut } from "./satmap.js";

// Viewport renderers. Pure functions over an evaluation result, so the browser and the
// proof script draw exactly the same pixels.

export const VIEW_MODES = [
  ["shaded", "Shaded satmap"],
  ["satmap", "Satmap only"],
  ["height", "Height (greyscale)"],
  ["slope", "Slope"],
  ["rivers", "Rivers"],
  ["sediment", "Sedimentation"],
  ["exposure", "Sun exposure"],
  ["mask", "Selected layer mask"],
];

// Hillshade from the height field, using the same sun the satmaps use for exposure.
export function hillshade(result, sun, exaggeration = 1.6) {
  const { N, altitude, cell } = result;
  const out = new Float32Array(N * N);
  const az = (sun.azimuth * Math.PI) / 180;
  const el = (sun.elevation * Math.PI) / 180;
  const Lx = Math.cos(el) * Math.cos(az);
  const Ly = Math.cos(el) * Math.sin(az);
  const Lz = Math.sin(el);
  const k = (1 / (2 * cell)) * exaggeration;
  for (let y = 0; y < N; y++) {
    const ym = Math.max(0, y - 1) * N;
    const yp = Math.min(N - 1, y + 1) * N;
    for (let x = 0; x < N; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(N - 1, x + 1);
      const gx = (altitude[y * N + xp] - altitude[y * N + xm]) * k;
      const gy = (altitude[yp + x] - altitude[ym + x]) * k;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const l = clamp(-gx * inv * Lx - gy * inv * Ly + inv * Lz, 0, 1);
      out[y * N + x] = l;
    }
  }
  return out;
}

function grey(v) {
  const g = Math.round(clamp(v, 0, 1) * 255);
  return [g, g, g];
}

function ramp(id, v) {
  const lut = paletteLut(id);
  const k = Math.round(clamp(v, 0, 1) * 255) * 3;
  return [Math.round(lut[k] * 255), Math.round(lut[k + 1] * 255), Math.round(lut[k + 2] * 255)];
}

// Render a view to RGBA (N*N*4). `mode` is one of VIEW_MODES.
export function renderView(result, mode, sun, opts = {}) {
  const { N } = result;
  const out = new Uint8ClampedArray(N * N * 4);
  const exag = opts.exaggeration ?? 1.6;
  let shade = null;
  if (mode === "shaded" || mode === "satmap") {
    shade = hillshade(result, sun, exag);
  }
  for (let i = 0; i < N * N; i++) {
    let rgb;
    switch (mode) {
      case "shaded": {
        const s = 0.5 + 0.5 * shade[i];
        const j = i * 4;
        out[j] = result.rgba[j] * s;
        out[j + 1] = result.rgba[j + 1] * s;
        out[j + 2] = result.rgba[j + 2] * s;
        out[j + 3] = 255;
        continue;
      }
      case "satmap":
        rgb = [result.rgba[i * 4], result.rgba[i * 4 + 1], result.rgba[i * 4 + 2]];
        break;
      case "height":
        rgb = grey(result.height[i]);
        break;
      case "slope":
        rgb = ramp("volcanic", result.slope[i] / 60);
        break;
      case "rivers":
        rgb = ramp("ice", result.rivers[i]);
        break;
      case "sediment":
        rgb = ramp("desert", result.sediment[i]);
        break;
      case "exposure":
        rgb = grey(result.exposure[i]);
        break;
      case "mask": {
        const m = result.mask ? result.mask[i] : 1;
        rgb = [Math.round(m * 255), Math.round(m * 200), Math.round((1 - m) * 60)];
        break;
      }
      default:
        rgb = grey(result.height[i]);
    }
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Perspective "voxel" view: each screen column is a ray marched across the heightfield, painting
// the nearest visible surface and skipping anything hidden behind it. Orbit by changing `cam.angle`.
export function renderVoxel(result, sun, cam, w, h) {
  const { N, cell } = result;
  const out = new Uint8ClampedArray(w * h * 4);
  const shade = hillshade(result, sun, 1.6);
  const hfov = (cam.fov * Math.PI) / 180;
  const focal = w / (2 * Math.tan(hfov / 2));
  const horizon = h * cam.horizon;
  const worldW = N * cell;
  const zNear = cell * 1.5;
  const zFar = worldW * 1.5;
  // Sky: gradient from horizon colour to zenith.
  for (let y = 0; y < h; y++) {
    const t = clamp(y / Math.max(1, horizon), 0, 1);
    const r = 20 + 60 * t;
    const g = 28 + 70 * t;
    const b = 40 + 90 * t;
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      out[j] = r;
      out[j + 1] = g;
      out[j + 2] = b;
      out[j + 3] = 255;
    }
  }
  const cx = cam.x * worldW;
  const cy = cam.y * worldW;
  const cz = result.altitude[((Math.min(N - 1, Math.max(0, Math.floor(cam.y * N))) * N) + Math.min(N - 1, Math.max(0, Math.floor(cam.x * N))))] + cam.height;
  const fogCol = [150, 170, 185];
  for (let col = 0; col < w; col++) {
    const screenDx = (col - w / 2) / focal;
    const ang = cam.angle + Math.atan(screenDx);
    const dx = Math.sin(ang);
    const dy = Math.cos(ang);
    let ybot = h;
    let z = zNear;
    let dz = cell * 0.5;
    while (z < zFar && ybot > 0) {
      const px = cx + dx * z;
      const py = cy + dy * z;
      const ix = Math.floor(px / cell);
      const iy = Math.floor(py / cell);
      if (ix >= 0 && iy >= 0 && ix < N && iy < N) {
        const idx = iy * N + ix;
        const hz = result.altitude[idx];
        const sy = horizon + ((cz - hz) * focal) / z;
        if (sy < ybot) {
          const top = Math.max(0, Math.floor(sy));
          const bottom = Math.min(h, Math.floor(ybot));
          const sh = shade[idx] * 0.85 + 0.15;
          const fog = clamp((z - zFar * 0.45) / (zFar * 0.55), 0, 1);
          for (let y = top; y < bottom; y++) {
            const j = (y * w + col) * 4;
            const r = result.rgba[idx * 4] * sh;
            const g = result.rgba[idx * 4 + 1] * sh;
            const b = result.rgba[idx * 4 + 2] * sh;
            out[j] = r + (fogCol[0] - r) * fog;
            out[j + 1] = g + (fogCol[1] - g) * fog;
            out[j + 2] = b + (fogCol[2] - b) * fog;
          }
          ybot = top;
        }
      }
      z += dz;
      dz = Math.max(cell * 0.5, z * 0.004);
    }
  }
  return out;
}
