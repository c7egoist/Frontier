/**
 * Landscape SDF field evaluator.
 *
 * Produces the implicit field
 *
 *     F(x, y, z) = (y - seaLevel) - (elevation(x, z) - seaLevel)   →   y - elevation(x, z)
 *
 * Negative inside rock/soil, positive in air, zero at the surface. `elevation`
 * is a *signed* field in metres: land above sea level, bathymetry below it.
 * Nothing here is a heightmap texture — the field is a pure function of the
 * document and absolute world coordinates, sampled wherever a tile or a brush
 * needs it.
 *
 * Why this is the right shape for a huge, disk-bound world:
 *   - One sample costs a handful of gradient-noise octaves. The octave budget is
 *     derived from the sample spacing, so a tile asking for 32 m cells evaluates
 *     ~5 octaves, and the same tile at 0.5 m cells evaluates ~9. Distant LODs are
 *     therefore *cheap by construction*, not by decimation.
 *   - Nothing is cached per-world. The only durable state is the (kilobyte)
 *     document, so there is no paging, no streaming, no seek storm on an HDD.
 *   - Because the field is analytic, adjacent chunks agree exactly — no skirts,
 *     no cracks, no stitched heightmap mips.
 */

import {
  TAU,
  billow2,
  spectral2,
  spectralRidged2,
  clamp,
  continentalProfile,
  domeField,
  fbm2,
  hash2,
  lerp,
  perlin2,
  ridged2,
  saturate,
  smoothstep,
  smax,
  smin,
} from './landscape-math.js';

/** Samples per feature below which an octave is no longer representable. */
export const SAMPLES_PER_FEATURE = 4;

/**
 * Octave budget for one noise term.
 *
 * A term whose base wavelength is `wavelengthMeters` may only add octave `i`
 * while `wavelength / 2^i >= SAMPLES_PER_FEATURE * cell`. This is the entire
 * level-of-detail mechanism for the landscape: distant tiles drop octaves
 * instead of dropping triangles, and because the octave set depends only on the
 * cell size (never on a tile's position), neighbouring tiles that share a cell
 * size agree exactly.
 *
 * A minimum of one octave keeps the large-scale shape even when a feature is
 * badly undersampled, which matters for silhouette rather than detail.
 */
export function octaveBudget(wavelengthMeters, cellMeters, maxOctaves = 8) {
  if (!(cellMeters > 0)) return maxOctaves;
  const ratio = wavelengthMeters / (SAMPLES_PER_FEATURE * cellMeters);
  if (ratio <= 1) return Math.min(1, maxOctaves);
  return clamp(Math.floor(Math.log2(ratio)) + 1, 1, maxOctaves);
}

/** Backwards-compatible helper: the octave budget at a reference wavelength. */
export function octavesForCell(cellMeters, finestWavelength = 34_000, maxOctaves = 12) {
  return octaveBudget(finestWavelength, cellMeters, maxOctaves);
}

// ---------------------------------------------------------------------------
// Planetary base field
// ---------------------------------------------------------------------------

/**
 * Planetary base elevation.
 *
 * Continents are the crests of a domain-warped, band-limited fractal
 * "craton potential". Sea level is the zero contour of that potential, which is
 * exactly why coastlines come out as torn, bay-and-headland shapes instead of
 * circles: a noise contour is fractal all the way down, a stamped disc is not.
 *
 * Cost discipline: the whole base is 6-10 gradient-noise octaves, and the octave
 * count is capped by the *sample spacing* the caller asked for. A 32 m preview
 * tile and a 3 km distant tile therefore cost different amounts, and the
 * distant one is cheap by construction (that is what replaces geometry
 * streaming here).
 */
function baseElevation(base, x, z, cellMeters) {
  const cell = base.continentCellMeters;
  const seed = base.seed;
  const warpStrength = cell * (0.10 + base.coastRoughness * 0.55);

  // Two-scale domain warp: the coarse term moves whole continents around, the
  // fine term tears the coastline into bays, sounds and peninsulas.
  const wx = x
    + perlin2(x / (cell * 0.47), z / (cell * 0.47), seed + 71) * warpStrength
    + perlin2(x / (cell * 0.13), z / (cell * 0.13), seed + 73) * warpStrength * 0.22;
  const wz = z
    + perlin2(x / (cell * 0.47) + 41.7, z / (cell * 0.47) - 13.3, seed + 79) * warpStrength
    + perlin2(x / (cell * 0.13) + 17.9, z / (cell * 0.13) + 27.1, seed + 83) * warpStrength * 0.22;

  let potential = fbm2(wx / cell, wz / cell, seed + 101, octaveBudget(cell, cellMeters, 5), 2.03, 0.52) * 1.9;
  // A second, much larger-scale term decides where ocean basins sit at all.
  potential += fbm2(wx / (cell * 5.2), wz / (cell * 5.2), seed + 107, octaveBudget(cell * 5.2, cellMeters, 3), 2.01, 0.55) * 1.15;

  // Coverage threshold: `landCoverage` moves sea level through the potential, so
  // the same seed at 30% coverage is an archipelago and at 75% a supercontinent.
  const threshold = 0.86 - base.landCoverage * 1.72;
  const signed = potential - threshold;

  const height = base.continentHeightMeters;
  // Land side: rise with distance above the contour, with a soft shelf region
  // right at the coast so beaches are not cliffs.
  let elevation = signed > 0
    ? height * Math.pow(signed, 1.15) * 1.35
    : -height * Math.pow(-signed, 0.9) * 0.55;

  const landMask = smoothstep(-0.05, 0.34, signed);

  // Relief is only allowed to act on land that is already meaningfully above
  // sea level, otherwise it shreds the coastline into noise islands.
  const reliefMask = landMask * smoothstep(0, height * 0.22, signed * height);

  // Macro relief: broad cratonic undulation (hundreds of km wavelength).
  if (base.macroRelief > 0.001) {
    const macroWavelength = cell * 0.34;
    elevation += spectral2(
      x, z, seed + 211, macroWavelength,
      height * 0.55 * base.macroRelief,
      octaveBudget(macroWavelength, cellMeters, 4)
    ) * reliefMask;
  }

  // Orogeny: mountain belts where a separate low-frequency field is high, with
  // ridged noise providing the crest lines inside those belts. Ridged spectral
  // noise keeps a crest sharp at 200 km and at 200 m.
  if (base.orogeny > 0.001) {
    const beltScale = base.orogenyCellMeters;
    const belt = fbm2(x / beltScale + 3.7, z / beltScale - 8.1, seed + 307, octaveBudget(beltScale, cellMeters, 3), 2.11, 0.5);
    const beltMask = smoothstep(-0.02, 0.30, belt) * base.orogeny * reliefMask;
    if (beltMask > 0.002) {
      const ridgeWavelength = beltScale * 0.075;
      const ridges = spectralRidged2(
        x, z, seed + 311, ridgeWavelength,
        height * (0.55 + 0.85 * base.orogeny),
        octaveBudget(ridgeWavelength, cellMeters, 9)
      );
      elevation += ridges * beltMask;
    }
  }

  // Detail relief: the band that gives every scale something to look at. The
  // octave budget trims it to what this sample spacing can represent, which is
  // the whole LOD story for the landscape.
  // Hills: the 1020 km band that carries local slope. Expressed as a target
  // slope rather than a raw amplitude, so "hill country" means the same thing
  // whether the world is 50 km or 4,000 km across.
  if (base.hillsRelief > 0.001) {
    const hillWavelength = base.detailScaleMeters * 0.42;
    elevation += spectral2(
      x, z, seed + 409, hillWavelength,
      hillWavelength * 0.045 * base.hillsRelief,
      octaveBudget(hillWavelength, cellMeters, 10)
    ) * reliefMask;
  }

  if (base.detailRelief > 0.001) {
    elevation += spectral2(
      x, z, seed + 401, base.detailScaleMeters,
      base.detailScaleMeters * 0.075 * base.detailRelief,
      octaveBudget(base.detailScaleMeters, cellMeters, 12)
    ) * reliefMask;

    // Spurs and gullies. Ridged noise is biased so it *cuts* more than it
    // builds, which is what gives hill country its branching ridge-and-valley
    // texture instead of smooth dunes. This is shaping only; the real erosion
    // simulations replace it later.
    const spurWavelength = base.detailScaleMeters * 0.09;
    const spurs = spectralRidged2(
      x, z, seed + 421, spurWavelength,
      spurWavelength * 0.16 * base.detailRelief,
      octaveBudget(spurWavelength, cellMeters, 8)
    );
    elevation += (spurs - spurWavelength * 0.09 * base.detailRelief) * reliefMask;
  }

  // Inland basins and lake hollows.
  if (base.basinCarving > 0.001) {
    const basinScale = base.detailScaleMeters * 6.5;
    const basin = billow2(x / basinScale, z / basinScale, seed + 503, octaveBudget(basinScale, cellMeters, 4), 2.05, 0.55);
    elevation -= Math.pow(saturate(basin), 2.4) * base.basinCarving * 260 * landMask;
  }

  // Sea floor: replace the raw potential below the coast with a real
  // shelf -> slope -> abyssal-plain profile, so the ocean has bathymetry the
  // water solver and shader can actually read.
  if (elevation < 0) {
    const raw = elevation;
    const shelf = continentalProfile(raw, base.shelfWidthMeters, base.shelfSlopeDepthMeters, base.abyssalDepthMeters);
    const mixT = smoothstep(0.0, base.shelfWidthMeters * 1.6, -raw);
    elevation = lerp(raw, shelf, mixT);
    const seaFloorScale = base.detailScaleMeters * 3.1;
    elevation += spectral2(x, z, seed + 601, seaFloorScale, 60 + 140 * base.detailRelief, octaveBudget(seaFloorScale, cellMeters, 6));
  }

  return elevation;
}

// ---------------------------------------------------------------------------
// Landform stamps
// ---------------------------------------------------------------------------

const _stampLocal = { lx: 0, lz: 0, t: 0, angle: 0 };

/**
 * Coverage written by the most recent `stampElevation` call: 1 inside the
 * stamp's own footprint, 0 outside it.
 *
 * Why this exists: soft unions (smax/smin) cannot themselves reach zero
 * contribution — a smooth blend with softness k lifts the surface by up to ~k
 * even where the stamp value is 0. Without a coverage window that shows up as a
 * wide low apron around every island and a matching moat around every basin.
 * The blend is therefore computed and then *faded in* by coverage, which keeps
 * the soft shoulder inside the landform where it belongs.
 */
export const stampCoverage = { value: 1 };

function stampLocal(op, x, z) {
  const dx = x - op.x;
  const dz = z - op.z;
  const ca = op.cosAngle ?? (op.cosAngle = Math.cos(op.angle));
  const sa = op.sinAngle ?? (op.sinAngle = Math.sin(op.angle));
  const lx = (dx * ca + dz * sa) / Math.max(1e-6, op.stretch);
  const lz = -dx * sa + dz * ca;
  _stampLocal.lx = lx;
  _stampLocal.lz = lz;
  return _stampLocal;
}

/** Local radius-normalised coordinate (0 centre, 1 rim) with noise-driven lobes. */
function stampRadial(op, lx, lz, seed) {
  const r = Math.hypot(lx, lz) / Math.max(1, op.radius);
  if (r > 3.2) return r;
  const theta = Math.atan2(lz, lx);
  // Lobes: three sinusoids at different rates keep the outline irregular
  // without the "crinkled disc" look of pure noise on the radius.
  const lobeA = Math.sin(theta * 3 + hash2(op.seed, 3, 13) * TAU) * 0.13;
  const lobeB = Math.sin(theta * 5.3 - hash2(op.seed, 5, 17) * TAU) * 0.075;
  const lobeC = Math.sin(theta * 9.7 + hash2(op.seed, 7, 19) * TAU) * 0.04;
  const wobble = perlin2(Math.cos(theta) * 1.7, Math.sin(theta) * 1.7, seed) * 0.16 * (0.4 + op.roughness);
  return Math.max(0, r + (lobeA + lobeB + lobeC + wobble) * (0.35 + op.roughness));
}

function stampInteriorRelief(op, lx, lz, height, cellMeters) {
  if (op.roughness <= 0.001) return 0;
  const scale = Math.max(80, op.radius * 0.28);
  const amplitude = height * 0.2 * op.roughness;
  const relief = spectral2(lx, lz, op.seed + 47, scale, amplitude, octaveBudget(scale, cellMeters, 10));
  const ridges = spectralRidged2(lx, lz, op.seed + 53, scale * 2.9, amplitude * 0.42, octaveBudget(scale * 2.9, cellMeters, 8));
  return relief * 0.62 + ridges * 0.42 - amplitude * 0.16;
}

/**
 * Elevation contribution of one stamp, in metres above sea level.
 * Positive stamps return a land surface; negative stamps return a carve depth
 * as a negative elevation that the caller applies with smin.
 */
export function stampElevation(op, x, z, cellMeters = 32) {
  if (!op.bounds) {
    stampCoverage.value = 0;
    return 0;
  }
  if (x < op.bounds.minX || x > op.bounds.maxX || z < op.bounds.minZ || z > op.bounds.maxZ) {
    stampCoverage.value = 0;
    return 0;
  }
  const local = stampLocal(op, x, z);
  const t = stampRadial(op, local.lx, local.lz, op.seed + 1013);
  if (t > 2.6) {
    stampCoverage.value = 0;
    return 0;
  }

  const height = op.height;
  const sharp = clamp(op.sharpness, 0, 1);
  let elevation = 0;

  switch (op.kind) {
    case 'continent': {
      // Broad shield with a long shelf-like flank and gentle interior plateau.
      const body = Math.pow(clamp(1 - t * t, 0, 1), 1.25);
      const plateau = smoothstep(0.0, 0.82, body);
      elevation = height * (body * 0.72 + plateau * 0.28);
      break;
    }
    case 'island': {
      const body = Math.pow(clamp(1 - t * t, 0, 1), 1.55);
      // Volcanic spine in the middle of larger islands.
      const spine = Math.exp(-Math.pow(t / 0.28, 2)) * 0.24;
      elevation = height * (body + spine);
      break;
    }
    case 'plateau': {
      const body = smoothstep(1.0, 0.42 - sharp * 0.2, t);
      elevation = height * body;
      break;
    }
    case 'mesa': {
      const steps = 3 + Math.round(sharp * 3);
      const body = smoothstep(1.0, 0.55, t);
      const terraced = Math.round(body * steps) / steps;
      elevation = height * lerp(body, terraced, 0.55 + sharp * 0.4);
      break;
    }
    case 'ridge': {
      // Long axis along local x; crest is clamped by `sharpness`.
      const across = local.lz / Math.max(1, op.radius * 0.18);
      const along = local.lx / Math.max(1, op.radius);
      const crest = Math.exp(-across * across * (1.1 + sharp * 1.6));
      const taper = Math.pow(clamp(1 - along * along, 0, 1), 0.65);
      elevation = height * crest * taper;
      break;
    }
    case 'canyon': {
      // Negative winding trench, meandered by noise along its length. The
      // meander is measured relative to the stamp origin so the trench always
      // passes through the point the author clicked.
      const meanderScale = Math.max(1, op.radius * 0.5);
      const atOrigin = perlin2(0, 0, op.seed + 71);
      const meander = (perlin2(local.lx / meanderScale, 0, op.seed + 71) - atOrigin) * op.radius * 0.42;
      const across = (local.lz - meander) / Math.max(1, op.radius * 0.16);
      const along = local.lx / Math.max(1, op.radius);
      const trench = Math.exp(-across * across * (1.6 + sharp * 2.2)) * Math.pow(clamp(1 - along * along, 0, 1), 0.5);
      elevation = -height * trench;
      break;
    }
    case 'crater': {
      // Impact profile: a depression inside the rim, a raised rim ring, and a
      // thin ejecta blanket outside it. The whole footprint is treated as a
      // carve so the bowl is genuinely excavated out of whatever was there
      // instead of being unioned over it (which would leave a mesa in a hole).
      const bowl = clamp(1 - t * t, 0, 1);
      const rim = Math.exp(-Math.pow((t - 0.86) / 0.14, 2));
      const ejecta = Math.exp(-Math.pow((t - 0.86) / 0.55, 2)) * 0.18;
      elevation = height * (rim * 0.85 + ejecta - bowl * 1.5);
      break;
    }
    case 'basin': {
      const bowl = Math.pow(clamp(1 - t * t, 0, 1), 1.1);
      elevation = -height * bowl;
      break;
    }
    case 'strait': {
      const across = local.lz / Math.max(1, op.radius * 0.22);
      const along = local.lx / Math.max(1, op.radius);
      const channel = Math.exp(-across * across * 1.6) * Math.pow(clamp(1 - along * along, 0, 1), 0.35);
      elevation = -height * channel;
      break;
    }
    case 'delta': {
      const fans = 0.5 + 0.5 * Math.sin(Math.atan2(local.lz, local.lx) * 4 + op.seed);
      const spread = clamp(1 - t, 0, 1);
      elevation = height * spread * spread * (0.55 + fans * 0.55);
      break;
    }
    default:
      elevation = height * Math.pow(clamp(1 - t * t, 0, 1), 1.5);
  }

  // Every stamp must reach exactly zero at its bounds, or the bounds cull in
  // `stampElevation` would slice a visible rectangle into the landscape. The
  // interior relief fades earlier than the body so island relief does not
  // detach from the coast either.
  const interiorFade = 1 - smoothstep(0.72, 1.55, t);
  if (!op.negative && interiorFade > 0) {
    elevation += stampInteriorRelief(op, local.lx, local.lz, height, cellMeters) * interiorFade;
  }
  const window = 1 - smoothstep(2.05, 2.55, t);
  // Footprint coverage: fades before the outer window so the soft blend has
  // died away before the hard bounds cull.
  stampCoverage.value = 1 - smoothstep(0.62, 1.35, t);
  return window > 0 ? elevation * window : 0;
}

// ---------------------------------------------------------------------------
// Sculpt strokes
// ---------------------------------------------------------------------------

/**
 * Distance from (x, z) to the stroke's point chain, and the chain progress at
 * the closest point. Used for the brush falloff.
 */
function strokeDistance(stroke, x, z) {
  const points = stroke.points;
  if (points.length === 0) return { dist: Infinity, progress: 0, pressure: 0 };
  if (points.length === 1) {
    const d = Math.hypot(x - points[0].x, z - points[0].z);
    return { dist: d, progress: 0, pressure: points[0].p };
  }
  let best = Infinity;
  let bestProgress = 0;
  let bestPressure = points[0].p;
  const reach = stroke.radius * 2.4;
  let travelled = 0;
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) totalLength += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const segLen = Math.hypot(abx, abz);
    // Cheap rejection before the projection.
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    if (Math.hypot(x - midX, z - midZ) - segLen * 0.5 > reach) {
      travelled += segLen;
      continue;
    }
    const denom = abx * abx + abz * abz;
    let s = denom > 1e-9 ? ((x - a.x) * abx + (z - a.z) * abz) / denom : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const px = a.x + abx * s;
    const pz = a.z + abz * s;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      const along = travelled + segLen * s;
      bestProgress = totalLength > 1e-9 ? along / totalLength : 0;
      bestPressure = lerp(a.p, b.p, s);
    }
    travelled += segLen;
  }
  return { dist: best, progress: bestProgress, pressure: bestPressure };
}

function strokeFalloff(t) {
  const x = saturate(t);
  return x * x * (3 - 2 * x);
}

// ---------------------------------------------------------------------------
// Field object
// ---------------------------------------------------------------------------

/**
 * Build an evaluator for one document. The returned object is reusable across
 * thousands of samples; it caches nothing per-position, so it is safe to call
 * from any order and from multiple tiles.
 */
export function createLandscapeField(doc) {
  const baseLayer = doc.layers.find((layer) => layer.kind === 'base');
  const base = baseLayer ? baseLayer.params : doc.layers[0]?.params;
  const seaLevel = Number(base?.seaLevel) || 0;

  // Flatten visible landform/sculpt layers into op lists. `order` matters:
  // layers are applied bottom (index 0) to top, exactly like the outliner.
  const stacks = [];
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0.001) continue;
    if (layer.kind === 'landform') {
      const stamps = layer.ops.filter((op) => op.type === 'stamp');
      if (stamps.length) stacks.push({ layer, kind: 'stamps', stamps });
    } else if (layer.kind === 'sculpt') {
      const strokes = layer.ops.filter((op) => op.type === 'stroke');
      if (strokes.length) stacks.push({ layer, kind: 'strokes', strokes });
    }
  }

  const baseParams = {
    ...base,
    seaLevel,
  };

  /** Elevation without sculpt strokes above `maxStack`, in metres. */
  function elevationUnder(x, z, cellMeters, maxStack = stacks.length) {
    let h = baseElevation(baseParams, x, z, cellMeters);
    for (let i = 0; i < maxStack; i++) {
      const stack = stacks[i];
      const opacity = stack.layer.opacity;
      if (stack.kind === 'stamps') {
        for (let s = 0; s < stack.stamps.length; s++) {
          const op = stack.stamps[s];
          const value = stampElevation(op, x, z, cellMeters);
          if (value === 0) continue;
          const scaled = value * opacity;
          // Softness is deliberately a small fraction of the landform's own
          // scale: enough to look eroded into the terrain, never enough to
          // paint a skirt around it. `stampCoverage` then confines the blend.
          const softness = op.negative
            ? Math.max(12, op.blend * op.height * 0.16)
            : Math.max(12, op.blend * op.height * 0.12);
          const blended = op.negative ? smin(h, scaled, softness) : smax(h, scaled, softness);
          const feather = stampCoverage.value;
          if (feather >= 0.999) h = blended;
          else h += (blended - h) * feather;
        }
      } else {
        for (let s = 0; s < stack.strokes.length; s++) {
          h = applyStrokeEval(stack.strokes[s], x, z, h, opacity, cellMeters, i);
        }
      }
    }
    return h;
  }

  /**
   * Stroke application. Smooth/sharpen need the *pre-stroke* field in a small
   * neighbourhood, so they re-enter `elevationUnder` with the stack limit set to
   * the current stack — which excludes this stroke and therefore cannot recurse
   * into itself. That also makes the result independent of stroke order inside
   * the layer, so a stroke can be re-evaluated any number of times.
   */
  function applyStrokeEval(stroke, x, z, current, opacity, cellMeters, stackIndex) {
    if (!stroke.bounds) return current;
    const reach = stroke.radius * 2.3;
    if (x < stroke.bounds.minX || x > stroke.bounds.maxX || z < stroke.bounds.minZ || z > stroke.bounds.maxZ) return current;
    const sample = strokeDistance(stroke, x, z);
    if (!Number.isFinite(sample.dist) || sample.dist > reach) return current;
    const t = 1 - sample.dist / reach;
    const falloff = strokeFalloff(t) * sample.pressure * opacity * stroke.strength;
    if (falloff <= 1e-5) return current;

    switch (stroke.tool) {
      case 'raise':
        return current + falloff * stroke.radius * 0.55;
      case 'lower':
        return current - falloff * stroke.radius * 0.55;
      case 'flatten': {
        const target = Number.isFinite(stroke.target) ? stroke.target : current;
        return lerp(current, target, saturate(falloff * 0.9));
      }
      case 'smooth': {
        const r = stroke.radius * 0.35;
        const a = elevationUnder(x + r, z, cellMeters, stackIndex);
        const b = elevationUnder(x - r, z, cellMeters, stackIndex);
        const c = elevationUnder(x, z + r, cellMeters, stackIndex);
        const d = elevationUnder(x, z - r, cellMeters, stackIndex);
        const mean = (a + b + c + d + current * 2) / 6;
        return lerp(current, mean, saturate(falloff * 0.75));
      }
      case 'terrace': {
        const step = Math.max(2, stroke.radius * 0.09);
        const terraced = Math.round(current / step) * step;
        return lerp(current, terraced, saturate(falloff * 1.1));
      }
      case 'sharpen': {
        const r = Math.max(4, stroke.radius * 0.18);
        const a = elevationUnder(x + r, z, cellMeters, stackIndex);
        const b = elevationUnder(x - r, z, cellMeters, stackIndex);
        const c = elevationUnder(x, z + r, cellMeters, stackIndex);
        const d = elevationUnder(x, z - r, cellMeters, stackIndex);
        const curvature = (a + b + c + d) * 0.25 - current;
        return current - curvature * saturate(falloff * 1.6);
      }
      case 'noise': {
        const scale = Math.max(6, stroke.radius * 0.12);
        const n = fbm2(x / scale, z / scale, stroke.seed + 977, octaveBudget(scale, cellMeters, 8), 2.03, 0.5);
        return current + n * falloff * stroke.radius * 0.22;
      }
      default:
        return current;
    }
  }

  /** Signed elevation in metres. This is the authored surface, land and sea floor. */
  function elevationAt(x, z, cellMeters = 32) {
    const cell = Math.max(0.05, Number(cellMeters) || 32);
    return elevationUnder(x, z, cell, stacks.length);
  }

  /** Implicit field value: negative inside the volume, positive in air. */
  function sdfAt(x, y, z, cellMeters = 32) {
    return y - elevationAt(x, z, cellMeters);
  }

  /** Surface normal of the implicit field, from central differences. */
  function normalAt(x, z, cellMeters = 32, out = [0, 0, 0]) {
    const e = Math.max(1, cellMeters * 0.75);
    const hx = elevationAt(x + e, z, cellMeters) - elevationAt(x - e, z, cellMeters);
    const hz = elevationAt(x, z + e, cellMeters) - elevationAt(x, z - e, cellMeters);
    let nx = -hx / (2 * e);
    let ny = 1;
    let nz = -hz / (2 * e);
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len;
    out[1] = ny / len;
    out[2] = nz / len;
    return out;
  }

  function slopeAt(x, z, cellMeters = 32) {
    const n = normalAt(x, z, cellMeters, [0, 0, 0]);
    return Math.acos(clamp(n[1], -1, 1));
  }

  return {
    doc,
    baseParams,
    seaLevel,
    stacks,
    elevationAt,
    elevationUnder,
    sdfAt,
    normalAt,
    slopeAt,
    octaveBudget: (wavelengthMeters, cellMeters, maxOctaves) => octaveBudget(wavelengthMeters, cellMeters, maxOctaves),
  };
}

// ---------------------------------------------------------------------------
// Tile sampling + meshing
// ---------------------------------------------------------------------------

export const TERRAIN_LOD_LEVELS = Object.freeze([
  { level: 0, label: 'L0', cellMeters: 8, maxSpanMeters: 4_000 },
  { level: 1, label: 'L1', cellMeters: 16, maxSpanMeters: 8_000 },
  { level: 2, label: 'L2', cellMeters: 32, maxSpanMeters: 20_000 },
  { level: 3, label: 'L3', cellMeters: 64, maxSpanMeters: 48_000 },
  { level: 4, label: 'L4', cellMeters: 192, maxSpanMeters: 160_000 },
  { level: 5, label: 'L5', cellMeters: 640, maxSpanMeters: 720_000 },
  { level: 6, label: 'L6', cellMeters: 3_200, maxSpanMeters: 4_200_000 },
]);

/** Picks the LOD whose cell size keeps a chunk within budget at that distance. */
export function lodForDistance(distanceMeters, cameraHeight = 2) {
  const d = Math.max(0, distanceMeters);
  for (const entry of TERRAIN_LOD_LEVELS) {
    if (d < entry.maxSpanMeters) return entry;
  }
  return TERRAIN_LOD_LEVELS[TERRAIN_LOD_LEVELS.length - 1];
}

/**
 * Samples a regular grid of the landscape. Returns heights, normals, wetness
 * and a bathymetry flag — everything the renderer, the ocean bed texture and
 * the exporters need, with zero per-sample allocation.
 */
export function sampleRegion(field, { originX, originZ, cellMeters, width, depth }, out = {}) {
  const nx = width + 1;
  const nz = depth + 1;
  const count = nx * nz;
  const heights = out.heights && out.heights.length === count ? out.heights : new Float32Array(count);
  const minX = originX;
  const minZ = originZ;
  for (let iz = 0; iz < nz; iz++) {
    const z = minZ + iz * cellMeters;
    const row = iz * nx;
    for (let ix = 0; ix < nx; ix++) {
      heights[row + ix] = field.elevationAt(minX + ix * cellMeters, z, cellMeters);
    }
  }
  out.heights = heights;
  out.nx = nx;
  out.nz = nz;
  out.originX = originX;
  out.originZ = originZ;
  out.cellMeters = cellMeters;
  return out;
}

/**
 * Dual-contour meshing compatibility shim.
 *
 * Existing Frontier tools (core/sparse-sdf.js, core/dual-contour.js, the cave
 * mesher, the exporters) consume the brick-sparse grid contract. The landscape
 * is an implicit function, so a *chunk* of it can be handed to that exact
 * pipeline: we present a bounded lattice of the analytic field and let the
 * existing DC/QEF extractor do the contouring. That is how the whole authored
 * landscape turns into a watertight mesh for the game runtime — using the
 * engine's own mesher, not a second one.
 */
export function buildChunkSdfLattice(field, { tx, tz, chunkMeters, voxelMeters, baseCellMeters }) {
  const h = Math.max(0.05, voxelMeters);
  const cellsX = Math.max(2, Math.ceil(chunkMeters / h));
  const cell = chunkMeters / cellsX;
  const minX = tx * chunkMeters;
  const minZ = tz * chunkMeters;

  // Vertical extent: sample the terrain's own relief inside this chunk so the
  // lattice is tight (a 4 km chunk does not pay for a 9 km tall box).
  let minH = Infinity;
  let maxH = -Infinity;
  const probeStep = Math.max(cell, chunkMeters / 12);
  for (let z = minZ; z <= minZ + chunkMeters + 1e-6; z += probeStep) {
    for (let x = minX; x <= minX + chunkMeters + 1e-6; x += probeStep) {
      const e = field.elevationAt(x, z, Math.max(baseCellMeters, probeStep));
      if (e < minH) minH = e;
      if (e > maxH) maxH = e;
    }
  }
  if (!Number.isFinite(minH)) {
    minH = -100;
    maxH = 100;
  }
  const pad = Math.max(4 * cell, Math.max(2, (maxH - minH) * 0.12));
  const y0 = Math.floor((minH - pad) / cell) * cell;
  const y1 = Math.ceil((maxH + pad) / cell) * cell;
  const cellsY = Math.max(4, Math.ceil((y1 - y0) / cell));

  const nx = cellsX;
  const ny = cellsY;
  const nz = cellsX;
  const gx = nx + 1;
  const gy = ny + 1;
  const gz = nz + 1;
  const strideY = gx;
  const strideZ = gx * gy;
  const values = new Float32Array(gx * gy * gz);

  const originX = minX;
  const originY = y0;
  const originZ = minZ;
  const voxel = cell;
  const sampleCell = Math.max(baseCellMeters, cell);

  const ensureSample = (ix, iy, iz) => {
    const idx = ix + iy * strideY + iz * strideZ;
    let v = values[idx];
    if (!Number.isNaN(v)) return v;
    v = field.sdfAt(originX + ix * voxel, originY + iy * voxel, originZ + iz * voxel, sampleCell);
    values[idx] = v;
    return v;
  };

  // Evaluate column by column: the expensive part is elevationAt(x, z), and it
  // is constant down a column of the vertical distance field.
  for (let iz = 0; iz < gz; iz++) {
    const z = originZ + iz * voxel;
    for (let ix = 0; ix < gx; ix++) {
      const x = originX + ix * voxel;
      const elevation = field.elevationAt(x, z, sampleCell);
      const column = ix + iz * strideZ;
      for (let iy = 0; iy < gy; iy++) {
        values[column + iy * strideY] = originY + iy * voxel - elevation;
      }
    }
  }

  // Brick bookkeeping for dual-contour's active-brick scan. Every brick is
  // active here; the extractor early-outs on sign-consistent cells, and the
  // narrow-band saving already happened in `elevationAt`'s octave budget.
  const nbx = Math.max(1, Math.ceil(nx / 4));
  const nby = Math.max(1, Math.ceil(ny / 4));
  const nbz = Math.max(1, Math.ceil(nz / 4));
  const activeBrickCoords = [];
  for (let bz = 0; bz < nbz; bz++) {
    for (let by = 0; by < nby; by++) {
      for (let bx = 0; bx < nbx; bx++) {
        activeBrickCoords.push(bx, by, bz, bx + nbx * (by + nby * bz));
      }
    }
  }

  return {
    nx,
    ny,
    nz,
    gx,
    gy,
    gz,
    strideY,
    strideZ,
    originX,
    originY,
    originZ,
    voxelSize: voxel,
    values,
    activeBrickCoords,
    nbx,
    nby,
    nbz,
    sampleWorld: (wx, wy, wz) => field.sdfAt(wx, wy, wz, sampleCell),
    ensureSample,
    field,
    chunkMeters,
  };
}

/**
 * Regular-grid surface mesh for preview and for the streaming runtime. Watertight
 * inside the tile by construction (shared edges are evaluated from absolute
 * coordinates), so neighbouring chunks meet exactly.
 */
export function buildRegionMesh(field, { tx, tz, chunkMeters, cellMeters, lod }) {
  const cells = Math.max(2, Math.round(chunkMeters / Math.max(0.05, cellMeters)));
  const step = chunkMeters / cells;
  const nx = cells + 1;
  const minX = tx * chunkMeters;
  const minZ = tz * chunkMeters;

  const positions = new Float32Array(nx * nx * 3);
  const normals = new Float32Array(nx * nx * 3);
  const uvs = new Float32Array(nx * nx * 2);
  const heights = new Float32Array(nx * nx);

  for (let iz = 0; iz < nx; iz++) {
    const z = minZ + iz * step;
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ix * step;
      const index = iz * nx + ix;
      heights[index] = field.elevationAt(x, z, step);
      positions[index * 3] = x;
      positions[index * 3 + 1] = heights[index];
      positions[index * 3 + 2] = z;
      uvs[index * 2] = x;
      uvs[index * 2 + 1] = z;
    }
  }

  // Normals from grid differences (much cheaper than per-vertex resampling and
  // exactly consistent across chunk seams for the same LOD).
  for (let iz = 0; iz < nx; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const index = iz * nx + ix;
      const hL = heights[iz * nx + Math.max(0, ix - 1)];
      const hR = heights[iz * nx + Math.min(nx - 1, ix + 1)];
      const hD = heights[Math.max(0, iz - 1) * nx + ix];
      const hU = heights[Math.min(nx - 1, iz + 1) * nx + ix];
      const ex = (Math.min(nx - 1, ix + 1) - Math.max(0, ix - 1)) * step;
      const ez = (Math.min(nx - 1, iz + 1) - Math.max(0, iz - 1)) * step;
      let nxv = -(hR - hL) / Math.max(1e-6, ex);
      let nzv = -(hU - hD) / Math.max(1e-6, ez);
      const len = Math.hypot(nxv, 1, nzv) || 1;
      normals[index * 3] = nxv / len;
      normals[index * 3 + 1] = 1 / len;
      normals[index * 3 + 2] = nzv / len;
    }
  }

  const indices = new Uint32Array(cells * cells * 6);
  let q = 0;
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Alternate the split direction for a less regular triangle pattern.
      if (((ix + iz) & 1) === 0) {
        indices[q++] = a; indices[q++] = c; indices[q++] = b;
        indices[q++] = b; indices[q++] = c; indices[q++] = d;
      } else {
        indices[q++] = a; indices[q++] = c; indices[q++] = d;
        indices[q++] = a; indices[q++] = d; indices[q++] = b;
      }
    }
  }

  return { positions, normals, uvs, heights, indices, nx, step, minX, minZ, lod, chunkMeters };
}

/**
 * Ocean connectivity at a coarse resolution: a flood fill from the region
 * border over cells below sea level. The GPU shallow-water solver uses this so
 * its reservoir/wave-maker cannot fill an enclosed inland basin, while real
 * basins can still flood dynamically by overtopping a sill.
 */
export function computeOceanConnectivity(field, { originX, originZ, spanMeters, spacingMeters = 2_000, seaLevel = 0 }) {
  const n = Math.max(8, Math.min(1_024, Math.round(spanMeters / spacingMeters)));
  const spacing = spanMeters / n;
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz++) {
    const z = originZ + iz * spacing;
    for (let ix = 0; ix <= n; ix++) {
      heights[iz * (n + 1) + ix] = field.elevationAt(originX + ix * spacing, z, spacing);
    }
  }
  const stride = n + 1;
  const mask = new Uint8Array(stride * stride);
  const stack = new Int32Array(stride * stride);
  let top = 0;
  const push = (ix, iz) => {
    if (ix < 0 || iz < 0 || ix > n || iz > n) return;
    const idx = iz * stride + ix;
    if (mask[idx]) return;
    if (heights[idx] >= seaLevel) return;
    mask[idx] = 1;
    stack[top++] = idx;
  };
  for (let i = 0; i <= n; i++) {
    push(i, 0);
    push(i, n);
    push(0, i);
    push(n, i);
  }
  while (top > 0) {
    const idx = stack[--top];
    const ix = idx % stride;
    const iz = (idx / stride) | 0;
    push(ix - 1, iz);
    push(ix + 1, iz);
    push(ix, iz - 1);
    push(ix, iz + 1);
  }
  return { heights, mask, nx: stride, originX, originZ, spacing, seaLevel, resolution: n };
}

/**
 * Estimate surface area coverage of land, used by the header readout and by the
 * "is this a continent or an ocean world?" sanity checks.
 */
export function estimateLandFraction(field, samples = 64) {
  let land = 0;
  let total = 0;
  const span = field.doc.world.spanMeters;
  const step = span / samples;
  const originX = -span / 2;
  const originZ = -span / 2;
  for (let iz = 0; iz < samples; iz++) {
    for (let ix = 0; ix < samples; ix++) {
      const e = field.elevationAt(originX + ix * step, originZ + iz * step, step);
      total += 1;
      if (e > field.seaLevel) land += 1;
    }
  }
  return total ? land / total : 0;
}
