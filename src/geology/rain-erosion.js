/**
 * Particle Rain Erosion on a 3D SDF Grid (Rock & Cliff Studio).
 *
 * The same droplet model as Terrain Studio's hydraulic particles -- rain falls
 * on the formation, runs downhill, picks up sediment up to a slope/speed/water
 * capacity, carves where it has spare capacity and deposits where it slows --
 * but locked onto a true 3D surface instead of a heightfield:
 *
 *   - Droplets sphere-trace vertically from the sky onto the SDF surface.
 *   - Runoff follows projected gravity on the local tangent plane
 *     (dir = normalize(g - n (g . n))), re-projected onto the surface each
 *     step via the SDF itself (p -= grad(phi)/|grad phi| * phi).
 *   - Erosion INCREASES phi (carves), deposition DECREASES phi, through a
 *     sub-voxel brush (~1.6 voxel radius) splatted into the grid values that
 *     Dual Contouring then contours directly.
 *
 * Why this does NOT turn into "melted chocolate" (the failure of naive SDF
 * erosion):
 *   1. The brush is tiny (<= 1.6 voxels) and per-step depth is a small
 *      fraction of a voxel, so droplets incise rills/flutes instead of
 *      scooping blobs. There is NO smoothing/Laplacian pass anywhere.
 *   2. Erosion per step is capped by the actual downhill drop of that step
 *      (classic droplet rule), so droplets cannot drill pits into flats.
 *   3. Sharp convex edges (positive mean curvature, from the SDF Laplacian)
 *      are protected: water sheets over arrises without rounding them,
 *      while concave channels deepen preferentially.
 *   4. Thin walls are protected: if the solid behind the surface point is
 *      only a few voxels thick (arch lintels!), erosion is throttled so
 *      rain never perforates the formation.
 *   5. Hardness-aware: hard caprock blocks resist, soft beds and talus
 *      rill first (evaluator.evalHardness).
 *
 * Designed to run on the high/ultra SDF before QEM decimation bakes the
 * result down to a game-ready low-poly mesh.
 */

import { clamp } from '../core/vec3.js';

const BRUSH_R = 1.6; // voxels

/**
 * Erodes `sdf.values` in place with rain droplets.
 *
 * @param {object} sdf Sparse SDF from evaluateSparseSdf (or compatible stub:
 *   { nx, ny, nz, gx, gy, gz, strideY, strideZ, originX/Y/Z, voxelSize,
 *     values: Float32Array (NaN = unevaluated), ensureSample(ix,iy,iz) })
 * @param {object} options
 *   dropletCount   number of raindrops (default 8000)
 *   amount         0..1 overall erosion strength (default 0.5)
 *   edgeProtection 0..1 convex-edge protection (default 0.7)
 *   hardnessAt     (x,y,z) => 0..1 | null (default null = uniform 0.6)
 *   groundY        stop/deposit at or below this world Y (default -Infinity)
 *   rng            createRng-compatible (float/range) for determinism
 *   onProgress     (fraction01) => void
 * @returns {{droplets:number, steps:number, erodedVolume:number, depositedVolume:number, elapsedMs:number}}
 *   volumes are approximate world-unit^3 (sum of SDF delta * voxel face area).
 */
export function erodeSdfWithRain(sdf, options = {}) {
  const t0 = performance.now();
  const dropletCount = Math.max(0, Math.floor(options.dropletCount ?? 8000));
  const amount = clamp(options.amount ?? 0.5, 0, 1);
  const edgeProtection = clamp(options.edgeProtection ?? 0.7, 0, 1);
  const hardnessAt = options.hardnessAt || null;
  const groundY = options.groundY ?? -Infinity;
  const rng = options.rng;
  const onProgress = options.onProgress || null;
  const rand = () => (rng ? rng.float() : Math.random());

  const stats = { droplets: 0, steps: 0, erodedVolume: 0, depositedVolume: 0, elapsedMs: 0 };
  if (!sdf || dropletCount <= 0 || amount <= 0) {
    stats.elapsedMs = Math.round(performance.now() - t0);
    return stats;
  }

  const { nx, ny, nz, gx, gy, gz, strideY, strideZ } = sdf;
  const h = sdf.voxelSize;
  const ox = sdf.originX, oy = sdf.originY, oz = sdf.originZ;
  const values = sdf.values;
  const totalNodes = gx * gy * gz;

  // ---------------------------------------------------------------------------
  // 0. Materialize a 2-node halo around the evaluated narrow band, so droplet
  //    brushes near brick boundaries never read NaN / analytic mismatches.
  // ---------------------------------------------------------------------------
  const ensureNode = (ix, iy, iz) => {
    const idx = ix + iy * strideY + iz * strideZ;
    let v = values[idx];
    if (Number.isNaN(v)) {
      v = sdf.ensureSample ? sdf.ensureSample(ix, iy, iz) : h * 4;
      values[idx] = v;
    }
    return v;
  };
  for (let pass = 0; pass < 2; pass++) {
    const toFill = [];
    for (let iz = 1; iz < gz - 1; iz++) {
      const zOff = iz * strideZ;
      for (let iy = 1; iy < gy - 1; iy++) {
        let idx = zOff + iy * strideY + 1;
        for (let ix = 1; ix < gx - 1; ix++, idx++) {
          if (!Number.isNaN(values[idx])) continue;
          if (
            !Number.isNaN(values[idx - 1]) || !Number.isNaN(values[idx + 1]) ||
            !Number.isNaN(values[idx - strideY]) || !Number.isNaN(values[idx + strideY]) ||
            !Number.isNaN(values[idx - strideZ]) || !Number.isNaN(values[idx + strideZ])
          ) {
            toFill.push(ix, iy, iz);
          }
        }
      }
    }
    for (let i = 0; i < toFill.length; i += 3) {
      ensureNode(toFill[i], toFill[i + 1], toFill[i + 2]);
    }
    if (toFill.length === 0) break;
  }

  // ---------------------------------------------------------------------------
  // Trilinear SDF sample + analytic trilinear gradient in one 8-node fetch.
  // Out-of-band NaNs (deep air/interior) report as +-4h by sign of the
  // nearest valid corner fallback in ensureNode.
  // ---------------------------------------------------------------------------
  const _sg = new Float64Array(4); // phi, dphi/dx, dphi/dy, dphi/dz (world units)
  function sampleGrad(wx, wy, wz) {
    let fx = (wx - ox) / h, fy = (wy - oy) / h, fz = (wz - oz) / h;
    fx = clamp(fx, 0, nx - 1.001); fy = clamp(fy, 0, ny - 1.001); fz = clamp(fz, 0, nz - 1.001);
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const tx = fx - ix, ty = fy - iy, tz = fz - iz;

    const c000 = ensureNode(ix, iy, iz);
    const c100 = ensureNode(ix + 1, iy, iz);
    const c010 = ensureNode(ix, iy + 1, iz);
    const c110 = ensureNode(ix + 1, iy + 1, iz);
    const c001 = ensureNode(ix, iy, iz + 1);
    const c101 = ensureNode(ix + 1, iy, iz + 1);
    const c011 = ensureNode(ix, iy + 1, iz + 1);
    const c111 = ensureNode(ix + 1, iy + 1, iz + 1);

    const x00 = c000 + (c100 - c000) * tx;
    const x10 = c010 + (c110 - c010) * tx;
    const x01 = c001 + (c101 - c001) * tx;
    const x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty;
    const y1 = x01 + (x11 - x01) * ty;
    _sg[0] = y0 + (y1 - y0) * tz;

    // d/dx: bilinear in (y,z) of x-differences
    const dx00 = c100 - c000, dx10 = c110 - c010, dx01 = c101 - c001, dx11 = c111 - c011;
    _sg[1] = ((dx00 + (dx10 - dx00) * ty) * (1 - tz) + (dx01 + (dx11 - dx01) * ty) * tz) / h;
    const dy00 = c010 - c000, dy10 = c110 - c100, dy01 = c011 - c001, dy11 = c111 - c101;
    _sg[2] = ((dy00 + (dy10 - dy00) * tx) * (1 - tz) + (dy01 + (dy11 - dy01) * tx) * tz) / h;
    const dz00 = c001 - c000, dz10 = c101 - c100, dz01 = c011 - c010, dz11 = c111 - c110;
    _sg[3] = ((dz00 + (dz01 - dz00) * ty) * (1 - tx) + (dz10 + (dz11 - dz10) * ty) * tx) / h;
    return _sg;
  }

  function sampleOnly(wx, wy, wz) {
    sampleGrad(wx, wy, wz);
    return _sg[0];
  }

  /** Mean-curvature proxy at the nearest grid node (Laplacian of phi). */
  function laplacianAt(wx, wy, wz) {
    const ix = clamp(Math.round((wx - ox) / h), 1, nx - 1);
    const iy = clamp(Math.round((wy - oy) / h), 1, ny - 1);
    const iz = clamp(Math.round((wz - oz) / h), 1, nz - 1);
    const c = ensureNode(ix, iy, iz);
    const sum =
      ensureNode(ix - 1, iy, iz) + ensureNode(ix + 1, iy, iz) +
      ensureNode(ix, iy - 1, iz) + ensureNode(ix, iy + 1, iz) +
      ensureNode(ix, iy, iz - 1) + ensureNode(ix, iy, iz + 1);
    return (sum - 6 * c) / (h * h);
  }

  // ---------------------------------------------------------------------------
  // Brush splat: add signed delta (world distance units) around a point.
  // Weights are normalized so total applied delta ~= requested amount.
  // ---------------------------------------------------------------------------
  const brushNodes = []; // [idx, weight] scratch
  function buildBrush(wx, wy, wz) {
    brushNodes.length = 0;
    const cx = Math.round((wx - ox) / h);
    const cy = Math.round((wy - oy) / h);
    const cz = Math.round((wz - oz) / h);
    const R = Math.ceil(BRUSH_R);
    let wSum = 0;
    for (let jz = cz - R; jz <= cz + R; jz++) {
      if (jz < 1 || jz > nz - 1) continue;
      for (let jy = cy - R; jy <= cy + R; jy++) {
        if (jy < 1 || jy > ny - 1) continue;
        for (let jx = cx - R; jx <= cx + R; jx++) {
          if (jx < 1 || jx > nx - 1) continue;
          const dx = ox + jx * h - wx, dy = oy + jy * h - wy, dz = oz + jz * h - wz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) / h;
          if (dist > BRUSH_R) continue;
          const w = 1 - dist / BRUSH_R;
          brushNodes.push(jx + jy * strideY + jz * strideZ, w);
          wSum += w;
        }
      }
    }
    return wSum;
  }

  // Per-node cumulative carve cap: rain rills are shallow features. Without a
  // cap, thousands of droplets converging in one channel would keep deepening
  // it without limit (the other half of the "melted" failure mode).
  const maxCarveDepth = h * (2.0 + 9.0 * amount);
  const carveTotals = new Map();

  function applyBrush(delta) {
    // brushNodes/wSum prepared by buildBrush; delta>0 carves, delta<0 deposits
    let applied = 0;
    const band = 3.0 * h;
    for (let i = 0; i < brushNodes.length; i += 2) {
      const idx = brushNodes[i];
      const w = brushNodes[i + 1] / _brushWSum;
      const old = values[idx];
      if (Number.isNaN(old)) continue;
      // Only ever touch the narrow band; deep interior/air stays untouched
      if (old < -band || old > band) continue;
      let step = delta * w;
      if (step > 0) {
        const used = carveTotals.get(idx) || 0;
        const room = maxCarveDepth - used;
        if (room <= 0) continue;
        step = Math.min(step, room);
        carveTotals.set(idx, used + step);
      }
      let nv = old + step;
      nv = clamp(nv, -band * 1.35, band * 1.35);
      values[idx] = nv;
      applied += (nv - old);
    }
    return applied; // sum of distance deltas (x h^2 ~= volume)
  }
  let _brushWSum = 1;

  // ---------------------------------------------------------------------------
  // Droplet parameters (scaled by `amount`)
  // ---------------------------------------------------------------------------
  const stepLen = 0.8 * h;
  const maxSteps = Math.round(clamp(Math.max(nx, ny, nz) * 2.2, 220, 900));
  const inertia = 0.22;
  const capacityK = 5.5;                       // sediment capacity per unit water*speed*slope
  const erodeRate = 0.30 * amount;             // fraction of spare capacity carved per step
  const depositRate = 0.30;
  const evapRate = 0.006;
  const maxCarvePerStep = 0.16 * h * (0.35 + amount); // hard cap: sub-voxel incision only
  const minSlopeCapacity = 0.012;
  const topY = oy + ny * h;
  const minX = ox + 1.5 * h, maxX = ox + (nx - 1.5) * h;
  const minZ = oz + 1.5 * h, maxZ = oz + (nz - 1.5) * h;
  const minY = oy + 1.5 * h;

  const reportEvery = Math.max(1, Math.floor(dropletCount / 12));

  for (let d = 0; d < dropletCount; d++) {
    if (onProgress && d % reportEvery === 0) onProgress(d / dropletCount);

    // --- Spawn in the sky, sphere-trace straight down onto the surface
    let px = minX + rand() * (maxX - minX);
    let pz = minZ + rand() * (maxZ - minZ);
    let py = topY - h;
    let hit = false;
    for (let t = 0; t < 260; t++) {
      const phi = sampleOnly(px, py, pz);
      if (phi <= 0.30 * h) { hit = true; break; }
      py -= Math.max(0.6 * h, phi * 0.85);
      if (py <= minY) break;
    }
    if (!hit) continue;

    // Project precisely onto the surface (2 Newton steps along the gradient)
    for (let t = 0; t < 2; t++) {
      sampleGrad(px, py, pz);
      const gl = Math.hypot(_sg[1], _sg[2], _sg[3]) || 1;
      px -= (_sg[1] / gl) * _sg[0];
      py -= (_sg[2] / gl) * _sg[0];
      pz -= (_sg[3] / gl) * _sg[0];
    }
    sampleGrad(px, py, pz);
    {
      const gl = Math.hypot(_sg[1], _sg[2], _sg[3]) || 1;
      // First hit from above must face generally upward/sideways; reject
      // undersides (should not occur, but guards thin-feature tunneling)
      if (_sg[2] / gl < -0.35) continue;
    }

    stats.droplets++;
    let dirX = 0, dirY = 0, dirZ = 0;
    let speed = 0.35;
    let water = 1.0;
    let sediment = 0.0;

    for (let step = 0; step < maxSteps; step++) {
      stats.steps++;
      sampleGrad(px, py, pz);
      const phi = _sg[0];
      let gx = _sg[1], gy = _sg[2], gz = _sg[3];
      const gl = Math.hypot(gx, gy, gz);
      if (gl < 1e-7) break;
      const nnx = gx / gl, nny = gy / gl, nnz = gz / gl;

      // Projected gravity on the tangent plane: g_t = g - n (g . n), g=(0,-1,0)
      const gDotN = -nny;
      let sx = -nnx * gDotN, sy = -1 - nny * gDotN, sz = -nnz * gDotN;
      const sinSlope = Math.hypot(sx, sy, sz);

      if (sinSlope < 0.015) {
        // Flat pool: deposit everything carried and infiltrate
        if (sediment > 1e-6) {
          _brushWSum = buildBrush(px, py, pz) || 1;
          stats.depositedVolume -= applyBrush(-sediment) * h * h;
        }
        break;
      }
      sx /= sinSlope; sy /= sinSlope; sz /= sinSlope;

      // Steering with a little inertia, kept on the tangent plane
      let mx = sx * (1 - inertia) + dirX * inertia;
      let my = sy * (1 - inertia) + dirY * inertia;
      let mz = sz * (1 - inertia) + dirZ * inertia;
      const mdn = mx * nnx + my * nny + mz * nnz;
      mx -= nnx * mdn; my -= nny * mdn; mz -= nnz * mdn;
      const ml = Math.hypot(mx, my, mz);
      if (ml < 1e-7) { mx = sx; my = sy; mz = sz; } else { mx /= ml; my /= ml; mz /= ml; }
      dirX = mx; dirY = my; dirZ = mz;

      const oldY = py;
      let qx = px + mx * stepLen;
      let qy = py + my * stepLen;
      let qz = pz + mz * stepLen;
      if (qx < minX || qx > maxX || qz < minZ || qz > maxZ || qy < minY) break;
      if (qy <= groundY + 0.5 * h) {
        if (sediment > 1e-6) {
          _brushWSum = buildBrush(px, py, pz) || 1;
          stats.depositedVolume -= applyBrush(-sediment) * h * h;
        }
        break;
      }

      // Stick to the surface at the new position
      sampleGrad(qx, qy, qz);
      const gl2 = Math.hypot(_sg[1], _sg[2], _sg[3]) || 1;
      qx -= (_sg[1] / gl2) * _sg[0];
      qy -= (_sg[2] / gl2) * _sg[0];
      qz -= (_sg[3] / gl2) * _sg[0];

      const dh = oldY - qy; // > 0: descended
      speed = clamp(Math.sqrt(Math.max(0.0025, speed * speed + Math.max(dh, -0.5 * h) * 3.2)), 0.05, 7.0);
      water *= (1 - evapRate);

      const slopeTan = Math.max(dh, 0) / stepLen;
      let capacity = Math.max(slopeTan * speed * water * capacityK, minSlopeCapacity * speed * water);
      if (dh < 0) capacity = 0;

      if (sediment > capacity || dh < 0) {
        // --- Deposit (only where the slope can hold sediment: below repose)
        let dep = dh < 0 ? Math.min(sediment, -dh) : (sediment - capacity) * depositRate;
        if (sinSlope > 0.72) dep *= 0.15; // too steep: keep carrying
        dep = Math.min(dep, sediment);
        if (dep > 1e-7) {
          _brushWSum = buildBrush(px, py, pz) || 1;
          const applied = applyBrush(-dep);
          stats.depositedVolume -= applied * h * h;
          sediment -= dep;
        }
      } else {
        // --- Erode up to spare capacity, capped by this step's drop
        let erodeAmt = Math.min((capacity - sediment) * erodeRate, Math.max(dh, 0) * 0.9);
        erodeAmt = Math.min(erodeAmt, maxCarvePerStep);
        if (erodeAmt > 1e-7) {
          // Hardness of the dominating geological block
          let hardness = 0.6;
          if (hardnessAt) {
            const hv = hardnessAt(px, py, pz);
            if (Number.isFinite(hv)) hardness = clamp(hv, 0, 1);
          }
          erodeAmt /= (0.35 + 2.6 * hardness * hardness);

          // Edge protection: convex (laplacian > 0) => throttle; concave => deepen
          const lap = laplacianAt(px, py, pz) * h; // ~ h / curvature radius
          if (lap > 0) {
            const k = clamp(lap * 0.55, 0, 1);
            erodeAmt *= 1 - edgeProtection * 0.88 * k;
          } else {
            erodeAmt *= 1 + 0.30 * clamp(-lap * 0.45, 0, 1);
          }

          // Thin-wall protection: little solid behind the surface => throttle
          const behind = sampleOnly(px - nnx * 3 * h, py - nny * 3 * h, pz - nnz * 3 * h);
          if (behind > -1.6 * h) erodeAmt *= 0.22;

          if (erodeAmt > 1e-7) {
            _brushWSum = buildBrush(px, py, pz) || 1;
            const applied = applyBrush(erodeAmt);
            stats.erodedVolume += applied * h * h;
            sediment += applied; // mass actually removed joins the load
          }
        }
      }

      px = qx; py = qy; pz = qz;
      if (water < 0.02) break;
      // phi from the first sample this step is stale after moving; loop resamples
      void phi;
    }
  }

  if (onProgress) onProgress(1);
  stats.erodedVolume = Math.max(0, stats.erodedVolume);
  stats.depositedVolume = Math.max(0, stats.depositedVolume);
  stats.elapsedMs = Math.round(performance.now() - t0);
  void totalNodes;
  return stats;
}
