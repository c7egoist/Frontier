/**
 * 3D Bedrock Outcrops & Rigid-Body Cliff-Calved Boulders for the GPU Erosion Landscape.
 *
 * Geometry: authentic flat-faceted polyhedral rocks (`sculptGeologicalParentPoly`)
 * packed into one instanced draw.
 *
 * Physics (rewritten): every loose boulder is a true rigid body with world-space
 * position, linear + angular velocity and quaternion orientation, integrated with
 * semi-implicit Euler substeps under real gravity (9.81 m/s^2). Terrain contact
 * uses the heightfield plane (height + normal) with an ellipsoid support function,
 * Coulomb static/kinetic friction, restitution, rolling resistance, water
 * buoyancy/drag and impulse-based rock-rock collision. NOTHING snaps a rock to
 * the terrain per frame: a sleeping rock only wakes when erosion actually
 * removes its support, then gravity -- not a heightfield lookup -- moves it.
 * The vertex shader receives the true body centre (see ROCK_INSTANCE_VERT).
 */

import { createRng } from '../core/prng.js';
import { DEG2RAD, buildStrikeDipFrame, vnorm, clamp } from '../core/vec3.js';
import { clipPolyByHalfSpace, sculptGeologicalParentPoly } from '../geology/polyhedron.js';

const MAX_INSTANCES = 320;
const FLOATS_PER_INSTANCE = 16; // 4 x vec4: col0+seed, col1+wear, col2+radiusY, pos(xyz)+isOutcrop

const GRAVITY = 9.81;           // m/s^2, real Earth gravity at true metre scale
const SUBSTEP_H = 1 / 120;      // physics substep (s)
const EMBED = 0.96;             // rocks rest very slightly embedded (natural seating)

// ---------------------------------------------------------------------------
// Quaternion helpers (x, y, z, w), column-basis convention matching the
// instance matrix columns packed for ROCK_INSTANCE_VERT.
// ---------------------------------------------------------------------------

function quatFromBasis(rx, ry, rz, ux, uy, uz, fx, fy, fz) {
  // Rotation matrix columns are (right, up, fwd); rows for trace method:
  const m00 = rx, m01 = ux, m02 = fx;
  const m10 = ry, m11 = uy, m12 = fy;
  const m20 = rz, m21 = uz, m22 = fz;
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}

function quatFromUpYaw(upX, upY, upZ, yaw) {
  let ux = upX, uy = upY, uz = upZ;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  let tx = Math.cos(yaw), ty = 0, tz = Math.sin(yaw);
  const d = tx * ux + ty * uy + tz * uz;
  tx -= ux * d; ty -= uy * d; tz -= uz * d;
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-5) { tx = 1; ty = 0; tz = 0; tl = 1; }
  tx /= tl; ty /= tl; tz /= tl;
  // b = t x u keeps the basis right-handed (det +1)
  const bx = ty * uz - tz * uy;
  const by = tz * ux - tx * uz;
  const bz = tx * uy - ty * ux;
  return quatFromBasis(tx, ty, tz, ux, uy, uz, bx, by, bz);
}

/** Writes the 3 basis columns of quaternion q into out[0..8] (right, up, fwd). */
function quatBasis(qx, qy, qz, qw, out) {
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  out[0] = 1 - (yy + zz); out[1] = xy + wz;     out[2] = xz - wy;
  out[3] = xy - wz;       out[4] = 1 - (xx + zz); out[5] = yz + wx;
  out[6] = xz + wy;       out[7] = yz - wx;     out[8] = 1 - (xx + yy);
}

const _basis = new Float64Array(9);

/**
 * Builds 6 distinct flat-faceted polyhedral rock archetypes packed into a single shared mesh
 * buffer so all outcrops and fallen boulders draw in ONE instanced WebGL2 call (`< 0.12 ms`).
 */
export function buildRockArchetypeAtlas(seed = 7331) {
  const rng = createRng(seed);
  const positions = [];
  const normals = [];
  const masks = []; // (aoApprox, cavity, edge, localY)
  const indices = [];
  const submeshes = []; // { firstIndex, indexCount }
  const halfExtents = []; // per-submesh local AABB half extents [hx, hy, hz]

  const specs = [
    // 0..1: Resistant tilted cliff-rim / ridge outcrops (broad rooted base, craggy nose)
    { rx: 1.35, ry: 0.92, rz: 1.05, disp: 0.16, blunt: 0.78, cuts: 8, flatBase: true },
    { rx: 1.15, ry: 1.18, rz: 0.95, disp: 0.20, blunt: 0.74, cuts: 9, flatBase: true },
    // 2..3: Angular blocky cliff-calved megaboulders
    { rx: 1.05, ry: 0.82, rz: 0.92, disp: 0.22, blunt: 0.72, cuts: 7, flatBase: false },
    { rx: 0.96, ry: 0.88, rz: 0.86, disp: 0.24, blunt: 0.70, cuts: 8, flatBase: false },
    // 4..5: Tabular jointed spall slabs (settle flat on talus cones & riverbanks)
    { rx: 1.28, ry: 0.52, rz: 1.02, disp: 0.14, blunt: 0.80, cuts: 6, flatBase: false },
    { rx: 1.18, ry: 0.60, rz: 0.88, disp: 0.18, blunt: 0.76, cuts: 7, flatBase: false },
  ];

  for (let s = 0; s < specs.length; s++) {
    const sp = specs[s];
    const frame = buildStrikeDipFrame(s * 0.65, (14 + s * 6) * DEG2RAD);
    let poly = sculptGeologicalParentPoly(
      [0, 0, 0],
      [sp.rx, sp.ry, sp.rz],
      frame,
      rng,
      {
        jointDispersion: sp.disp,
        cornerBlunt: sp.blunt,
        flatBaseY: sp.flatBase ? -sp.ry * 0.75 : null,
        extraBevelCuts: sp.cuts,
      }
    );
    if (sp.flatBase && poly) {
      poly = clipPolyByHalfSpace(poly, [0, -1, 0], sp.ry * 0.75, 'root') || poly;
    }

    const firstIndex = indices.length;
    const vertStart = positions.length;
    if (poly && poly.faces) {
      // Compute polyhedron interior centroid so every face normal is guaranteed to point OUTWARD!
      let pcx = 0, pcy = 0, pcz = 0, pCount = 0;
      for (let f = 0; f < poly.faces.length; f++) {
        const fv = poly.faces[f].verts;
        if (!fv) continue;
        for (let k = 0; k < fv.length; k++) {
          pcx += fv[k][0]; pcy += fv[k][1]; pcz += fv[k][2];
          pCount++;
        }
      }
      if (pCount > 0) { pcx /= pCount; pcy /= pCount; pcz /= pCount; }

      for (let f = 0; f < poly.faces.length; f++) {
        const face = poly.faces[f];
        const fv = face.verts;
        if (!fv || fv.length < 3) continue;
        let fn = vnorm(face.normal);

        // Compute face centroid to accentuate crisp rock arris edges (`edgeMask`)
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < fv.length; k++) {
          cx += fv[k][0]; cy += fv[k][1]; cz += fv[k][2];
        }
        cx /= fv.length; cy /= fv.length; cz /= fv.length;

        // Enforce strictly OUTWARD face normal relative to polyhedron interior centroid!
        if ((cx - pcx) * fn[0] + (cy - pcy) * fn[1] + (cz - pcz) * fn[2] < 0) {
          fn = [-fn[0], -fn[1], -fn[2]];
        }

        const baseVertex = positions.length / 3;
        // Center vertex + perimeter vertices so edge distance is exact on every facet!
        positions.push(cx, cy, cz);
        normals.push(fn[0], fn[1], fn[2]);
        const centerAo = clamp(0.62 + 0.34 * ((cy / sp.ry) * 0.5 + 0.5), 0.32, 0.98);
        masks.push(centerAo, 0.18, 0.0, clamp(cy / sp.ry, -1, 1));

        for (let k = 0; k < fv.length; k++) {
          const v = fv[k];
          positions.push(v[0], v[1], v[2]);
          normals.push(fn[0], fn[1], fn[2]);
          const vAo = clamp(0.56 + 0.38 * ((v[1] / sp.ry) * 0.5 + 0.5), 0.28, 0.98);
          masks.push(vAo, 0.06, 0.92, clamp(v[1] / sp.ry, -1, 1));
        }

        for (let k = 0; k < fv.length; k++) {
          const kNext = (k + 1) % fv.length;
          const v0 = fv[k];
          const v1 = fv[kNext];
          // Guarantee outward CCW winding `(v0 - c) x (v1 - c) . fn > 0` for gl.cullFace(gl.BACK)!
          const e0x = v0[0] - cx, e0y = v0[1] - cy, e0z = v0[2] - cz;
          const e1x = v1[0] - cx, e1y = v1[1] - cy, e1z = v1[2] - cz;
          const nx = e0y * e1z - e0z * e1y;
          const ny = e0z * e1x - e0x * e1z;
          const nz = e0x * e1y - e0y * e1x;
          if (nx * fn[0] + ny * fn[1] + nz * fn[2] >= 0) {
            indices.push(baseVertex, baseVertex + 1 + k, baseVertex + 1 + kNext);
          } else {
            indices.push(baseVertex, baseVertex + 1 + kNext, baseVertex + 1 + k);
          }
        }
      }
    }
    // Local AABB half extents of this archetype (for the physics ellipsoid)
    let hx = 0.35, hy = 0.35, hz = 0.35;
    for (let vi = vertStart; vi < positions.length; vi += 3) {
      hx = Math.max(hx, Math.abs(positions[vi]));
      hy = Math.max(hy, Math.abs(positions[vi + 1]));
      hz = Math.max(hz, Math.abs(positions[vi + 2]));
    }
    halfExtents.push([hx, hy, hz]);
    submeshes.push({ firstIndex, indexCount: indices.length - firstIndex });
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    masks: new Float32Array(masks),
    indices: new Uint16Array(indices),
    submeshes,
    halfExtents,
  };
}

/**
 * Manages 3D cliff outcrops (static, rooted bedrock) and dynamically simulated
 * fallen boulders (rigid bodies) on the GPU terrain.
 */
export class RockCalvingSystem {
  constructor() {
    this.atlas = buildRockArchetypeAtlas(7331);
    this.gridRes = 64;
    this.heightGrid = new Float32Array(64 * 64 * 4); // (bedrock, coarse, fine, water)
    this.hasHeightSnapshot = false;
    this.worldSpan = 512.0;

    this.rocks = [];
    // Separate per-submesh instance staging arrays for 6-archetype instanced draw
    this.bucketData = this.atlas.submeshes.map(() => new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE));
    this.bucketCounts = new Int32Array(this.atlas.submeshes.length);
  }

  /**
   * Ensures a rock record carries full rigid-body state (quaternion, angular
   * velocity, ellipsoid radii, mass). Older/externally-constructed records
   * with only yaw+up are upgraded in place.
   */
  _ensureBody(r) {
    if (r.qw !== undefined && r.rx !== undefined) return r;
    const he = this.atlas.halfExtents[r.submesh] || [1, 0.85, 0.95];
    r.sx = r.sx ?? 2; r.sy = r.sy ?? 1.8; r.sz = r.sz ?? 2;
    r.rx = he[0] * r.sx;
    r.ry = he[1] * r.sy;
    r.rz = he[2] * r.sz;
    r.boundR = Math.max(r.rx, r.ry, r.rz) * 0.92;
    r.mass = Math.max(40, (4 / 3) * Math.PI * r.rx * r.ry * r.rz * 2700); // kg, rock 2.7 t/m^3
    r.invMass = 1 / r.mass;
    r.muS = r.isSlab ? 0.78 : 0.62;   // static friction (talus repose ~32-38 deg)
    if (r.qw === undefined) {
      const q = quatFromUpYaw(r.upX ?? 0, r.upY ?? 1, r.upZ ?? 0, r.yaw ?? 0);
      r.qx = q[0]; r.qy = q[1]; r.qz = q[2]; r.qw = q[3];
    }
    r.ox = r.ox ?? 0; r.oy = r.oy ?? 0; r.oz = r.oz ?? 0;
    r.sleepTimer = r.sleepTimer ?? 0;
    r.grounded = r.grounded ?? false;
    r.radiusY = r.ry;
    return r;
  }

  /** Ellipsoid support distance from body centre along unit direction d. */
  _support(r, dx, dy, dz) {
    quatBasis(r.qx, r.qy, r.qz, r.qw, _basis);
    const lx = dx * _basis[0] + dy * _basis[1] + dz * _basis[2];
    const ly = dx * _basis[3] + dy * _basis[4] + dz * _basis[5];
    const lz = dx * _basis[6] + dy * _basis[7] + dz * _basis[8];
    const ax = r.rx * lx, ay = r.ry * ly, az = r.rz * lz;
    return Math.sqrt(ax * ax + ay * ay + az * az) * EMBED;
  }

  _makeRock(spec) {
    const r = {
      vx: 0, vy: 0, vz: 0,
      ox: 0, oy: 0, oz: 0,
      settled: true,
      grounded: true,
      sleepTimer: 0,
      wakeTimer: 0,
      ...spec,
    };
    if (spec.quat) {
      r.qx = spec.quat[0]; r.qy = spec.quat[1]; r.qz = spec.quat[2]; r.qw = spec.quat[3];
    }
    return this._ensureBody(r);
  }

  /**
   * Updates the terrain snapshot `(bedrock, coarse, fine, water)` read from GPU.
   * Rocks are NEVER repositioned by a snapshot: sleeping boulders only WAKE
   * when erosion removed their support or steepened their seat beyond static
   * friction -- gravity does all subsequent motion.
   */
  updateTerrainSnapshot(rgba64, gridRes = 64, worldSpan = 512.0) {
    this.gridRes = gridRes;
    this.worldSpan = worldSpan;
    if (this.heightGrid.length !== rgba64.length) {
      this.heightGrid = new Float32Array(rgba64.length);
    }
    this.heightGrid.set(rgba64);
    this.hasHeightSnapshot = true;

    for (let i = 0; i < this.rocks.length; i++) {
      const r = this._ensureBody(this.rocks[i]);
      if (r.isOutcrop) {
        const s = this.sampleTerrain(r.x, r.z);
        if (s.slope > 0.44 || s.water > 0.35) {
          // Erosion undercut this rim outcrop: it becomes a free rigid body
          // at its CURRENT world position and topples under gravity.
          r.isOutcrop = false;
          r.settled = false;
          r.sleepTimer = 0;
          const dl = Math.hypot(s.dhdx, s.dhdz) || 1;
          r.vx = (-s.dhdx / dl) * 0.8;
          r.vz = (-s.dhdz / dl) * 0.8;
          r.vy = 0;
        }
      } else if (r.settled) {
        const s = this.sampleTerrain(r.x, r.z);
        const gap = (r.y - this._support(r, 0, 1, 0)) - s.totalH;
        if (gap > 0.12 || s.slope > (r.muS ?? 0.62) + 0.03) {
          r.settled = false;
          r.sleepTimer = 0;
        }
      }
    }
  }

  sampleTerrain(wx, wz) {
    const N = this.gridRes;
    const span = this.worldSpan;
    const u = clamp(wx / span + 0.5, 0.001, 0.999) * (N - 1);
    const v = clamp(wz / span + 0.5, 0.001, 0.999) * (N - 1);
    const ix = Math.min(N - 2, Math.max(0, Math.floor(u)));
    const iz = Math.min(N - 2, Math.max(0, Math.floor(v)));
    const fx = u - ix;
    const fz = v - iz;

    const g = this.heightGrid;
    const i00 = (iz * N + ix) * 4;
    const i10 = i00 + 4;
    const i01 = i00 + N * 4;
    const i11 = i01 + 4;

    const bilerp = (ch) => {
      const a = g[i00 + ch] * (1 - fx) + g[i10 + ch] * fx;
      const b = g[i01 + ch] * (1 - fx) + g[i11 + ch] * fx;
      return a * (1 - fz) + b * fz;
    };

    const bedrock = bilerp(0);
    const coarse = bilerp(1);
    const fine = bilerp(2);
    const water = bilerp(3);
    const totalH = bedrock + coarse + fine;

    const cellM = span / (N - 1);
    const h00 = g[i00] + g[i00 + 1] + g[i00 + 2];
    const h10 = g[i10] + g[i10 + 1] + g[i10 + 2];
    const h01 = g[i01] + g[i01 + 1] + g[i01 + 2];
    const h11 = g[i11] + g[i11 + 1] + g[i11 + 2];
    const dhdx = ((h10 - h00) * (1 - fz) + (h11 - h01) * fz) / cellM;
    const dhdz = ((h01 - h00) * (1 - fx) + (h11 - h10) * fx) / cellM;
    const slope = Math.hypot(dhdx, dhdz);
    const invN = 1 / Math.hypot(dhdx, 1, dhdz);

    return {
      bedrock,
      coarse,
      fine,
      water,
      totalH,
      dhdx,
      dhdz,
      slope,
      nx: -dhdx * invN,
      ny: invN,
      nz: -dhdz * invN,
    };
  }

  /**
   * Seeds rooted cliff outcrops on gentle convex rims, settled talus boulders
   * on aprons (placed at exact ellipsoid support height, asleep), then calves
   * boulders from steep faces and pre-rolls the REAL physics until at rest.
   */
  seedForLandscape(params) {
    this.rocks.length = 0;
    const density = clamp(params.boulderDensity ?? 0.65, 0, 1);
    if (!this.hasHeightSnapshot || density <= 0.02) {
      this._rebuildInstanceBuckets();
      return;
    }

    const rng = createRng((params.seed || 4029) + 9187);
    const span = params.worldSpan || 512.0;
    const half = span * 0.455;
    const strikeRad = ((params.strataStrike ?? 0) * Math.PI) / 180;
    const dipRad = ((params.strataDip ?? 8) * Math.PI) / 180;

    const rimCells = [];
    const apronCells = [];
    const N = this.gridRes;
    const cellStep = span / N;
    for (let iz = 3; iz < N - 3; iz++) {
      for (let ix = 3; ix < N - 3; ix++) {
        const wx = ((ix + 0.5) / N - 0.5) * span;
        const wz = ((iz + 0.5) / N - 0.5) * span;
        if (Math.abs(wx) > half || Math.abs(wz) > half) continue;
        const s = this.sampleTerrain(wx, wz);
        if (s.water > 0.06 || s.fine > 1.35) continue;

        const sE = this.sampleTerrain(wx + cellStep, wz);
        const sW = this.sampleTerrain(wx - cellStep, wz);
        const sN = this.sampleTerrain(wx, wz + cellStep);
        const sS = this.sampleTerrain(wx, wz - cellStep);
        const meanNb = 0.25 * (sE.totalH + sW.totalH + sN.totalH + sS.totalH);
        const convexity = s.totalH - meanNb;
        const maxNbSlope = Math.max(sE.slope, sW.slope, sN.slope, sS.slope);

        if (s.slope >= 0.04 && s.slope <= 0.36 && s.bedrock > 12.0 && s.fine < 0.75 && convexity > -0.35) {
          rimCells.push({ wx, wz, s, convexity });
        }
        if (s.slope <= 0.34 && s.bedrock > 4.0 && (maxNbSlope > 0.45 || s.coarse > 0.08)) {
          apronCells.push({ wx, wz, s });
        }
      }
    }

    rimCells.sort((a, b) => b.convexity - a.convexity);
    const crownPool = rimCells.slice(0, Math.max(24, Math.floor(rimCells.length * 0.65)));

    const targetOutcrops = Math.min(68, Math.round(density * 72));
    if (crownPool.length > 0) {
      for (let i = 0; i < targetOutcrops * 5 && this.rocks.length < targetOutcrops; i++) {
        const pick = crownPool[rng.int(0, crownPool.length - 1)];
        const jx = pick.wx + rng.signed() * 3.0;
        const jz = pick.wz + rng.signed() * 3.0;
        if (this._tooClose(jx, jz, 8.5)) continue;

        const st = this.sampleTerrain(jx, jz);
        if (st.water > 0.06 || st.slope > 0.38 || st.fine > 0.85) continue;
        const scale = rng.range(2.4, 5.4);
        const sx = scale * rng.range(0.95, 1.32);
        const sy = scale * rng.range(0.70, 1.06);
        const sz = scale * rng.range(0.86, 1.20);
        const yaw = strikeRad + rng.signed() * 0.28;
        const gentleDip = Math.min(0.18, Math.abs(dipRad)) * Math.sign(dipRad || 1);
        const up = [
          Math.sin(strikeRad) * Math.sin(gentleDip),
          Math.cos(gentleDip),
          Math.cos(strikeRad) * Math.sin(gentleDip),
        ];

        const rk = this._makeRock({
          submesh: rng.int(0, 1),
          isOutcrop: true,
          x: jx, y: 0, z: jz,
          sx, sy, sz,
          quat: quatFromUpYaw(up[0], up[1], up[2], yaw),
          seedHash: rng.float(),
          wear: rng.range(0.15, 0.55),
        });
        // Rooted bedrock: seated 20% into the ground, static forever (until undercut)
        rk.y = st.totalH + this._support(rk, 0, 1, 0) * 0.80;
        this.rocks.push(rk);
      }
    }

    const targetBoulders = Math.min(185, Math.round(density * 195));
    const directApronTarget = Math.round(targetBoulders * 0.58);
    if (apronCells.length > 0) {
      let placed = 0;
      for (let tries = 0; tries < directApronTarget * 5 && placed < directApronTarget; tries++) {
        const anchor = apronCells[rng.int(0, apronCells.length - 1)];
        const clusterCount = rng.int(1, 3);
        for (let k = 0; k < clusterCount && placed < directApronTarget; k++) {
          const bx = clamp(anchor.wx + rng.signed() * 5.2, -half, half);
          const bz = clamp(anchor.wz + rng.signed() * 5.2, -half, half);
          if (this._tooClose(bx, bz, 2.6)) continue;
          const st = this.sampleTerrain(bx, bz);
          if (st.water > 0.06 || st.slope > 0.34 || st.fine > 1.45) continue;

          const isSlab = rng.chance(0.40);
          const submesh = isSlab ? rng.int(4, 5) : rng.int(2, 3);
          const baseR = (k === 0 ? 1.55 : 0.95) + Math.pow(rng.float(), 2.1) * (k === 0 ? 2.75 : 1.65);
          const sx = baseR * rng.range(0.90, 1.30);
          const sy = baseR * (isSlab ? rng.range(0.54, 0.74) : rng.range(0.78, 1.08));
          const sz = baseR * rng.range(0.86, 1.22);

          // Resting pose: mostly upright, partially conformed to the apron normal
          let ux = st.nx * 0.55, uy = 1.0, uz = st.nz * 0.55;
          const ul = Math.hypot(ux, uy, uz) || 1;
          const rk = this._makeRock({
            submesh,
            isOutcrop: false,
            x: bx, y: 0, z: bz,
            sx, sy, sz,
            quat: quatFromUpYaw(ux / ul, uy / ul, uz / ul, rng.float() * Math.PI * 2),
            isSlab,
            seedHash: rng.float(),
            wear: rng.range(0.25, 0.78),
          });
          rk.y = st.totalH + this._support(rk, 0, 1, 0) * 0.97;
          this.rocks.push(rk);
          placed++;
        }
      }
    }

    const calveCount = Math.max(24, targetBoulders - (this.rocks.length - targetOutcrops));
    this.calveCliffBoulders(calveCount, rng, true);

    // Pre-roll with the real integrator until everything sleeps (max ~18 s sim)
    for (let t = 0; t < 18; t += 0.05) {
      if (!this.stepPhysics(0.05, true)) break;
    }
    // A small live rockfall batch so the user sees motion on load
    this.calveCliffBoulders(Math.round(density * 18), rng, false);
    this._rebuildInstanceBuckets();
  }

  /**
   * Detaches `count` fresh rock chunks from steep cliff scarps. They spawn just
   * off the face with a small toppling velocity; gravity does the rest.
   */
  calveCliffBoulders(count = 24, customRng = null, allowAllPool = false) {
    if (!this.hasHeightSnapshot || count <= 0) return 0;
    const rng = customRng || createRng(Math.floor(performance.now()) + this.rocks.length * 37);
    const span = this.worldSpan;
    const half = span * 0.42;
    const N = this.gridRes;

    const cliffs = [];
    for (let iz = 4; iz < N - 4; iz++) {
      for (let ix = 4; ix < N - 4; ix++) {
        const wx = ((ix + 0.5) / N - 0.5) * span;
        const wz = ((iz + 0.5) / N - 0.5) * span;
        if (Math.abs(wx) > half || Math.abs(wz) > half) continue;
        const s = this.sampleTerrain(wx, wz);
        if (s.slope > (allowAllPool ? 0.52 : 0.68) && s.water < 0.08 && s.fine < 1.35) {
          cliffs.push({ wx, wz, s });
        }
      }
    }
    if (cliffs.length === 0) return 0;

    let spawned = 0;
    for (let tries = 0; tries < count * 4 && spawned < count; tries++) {
      if (this.rocks.length >= MAX_INSTANCES) {
        const idx = this.rocks.findIndex((b) => !b.isOutcrop && b.settled);
        if (idx >= 0) this.rocks.splice(idx, 1);
        else break;
      }

      const c = cliffs[rng.int(0, cliffs.length - 1)];
      const downLen = Math.hypot(c.s.dhdx, c.s.dhdz) || 1;
      const dxn = -c.s.dhdx / downLen;
      const dzn = -c.s.dhdz / downLen;

      const isSlab = rng.chance(0.42);
      const submesh = isSlab ? rng.int(4, 5) : rng.int(2, 3);
      const baseR = 1.05 + Math.pow(rng.float(), 2.2) * 3.35;
      const sx = baseR * rng.range(0.90, 1.32);
      const sy = baseR * (isSlab ? rng.range(0.48, 0.68) : rng.range(0.75, 1.06));
      const sz = baseR * rng.range(0.86, 1.22);

      const rk = this._makeRock({
        submesh,
        isOutcrop: false,
        settled: false,
        grounded: false,
        x: c.wx + rng.signed() * 3.0,
        y: 0,
        z: c.wz + rng.signed() * 3.0,
        sx, sy, sz,
        quat: quatFromUpYaw(rng.signed() * 0.3, 1, rng.signed() * 0.3, rng.float() * Math.PI * 2),
        isSlab,
        seedHash: rng.float(),
        wear: rng.range(0.25, 0.78),
      });
      // Spawn just off the face (downslope by ~one body radius), resting height there
      rk.x += dxn * rk.boundR * 1.1;
      rk.z += dzn * rk.boundR * 1.1;
      const st = this.sampleTerrain(rk.x, rk.z);
      rk.y = st.totalH + this._support(rk, 0, 1, 0) + 0.12;
      const topple = rng.range(0.6, 2.2);
      rk.vx = dxn * topple + rng.signed() * 0.4;
      rk.vz = dzn * topple + rng.signed() * 0.4;
      rk.vy = 0;
      // Initial rolling spin consistent with the topple velocity
      const sup = Math.max(0.35, this._support(rk, st.nx, st.ny, st.nz));
      rk.ox = (st.ny * rk.vz - st.nz * 0) / sup;
      rk.oy = 0;
      rk.oz = (0 - st.ny * rk.vx) / sup;

      this.rocks.push(rk);
      spawned++;
    }
    return spawned;
  }

  _tooClose(x, z, minDist) {
    const d2 = minDist * minDist;
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i];
      const dx = r.x - x;
      const dz = r.z - z;
      if (dx * dx + dz * dz < d2) return true;
    }
    return false;
  }

  /**
   * Advances all awake boulders by dt seconds of true rigid-body physics.
   * Returns true while any boulder is still awake/moving.
   */
  stepPhysics(dt = 0.033, duringPrewarm = false) {
    if (!this.hasHeightSnapshot || this.rocks.length === 0) return false;
    const sub = clamp(Math.ceil(dt / SUBSTEP_H), 1, 16);
    const h = dt / sub;
    const half = this.worldSpan * 0.468;
    let anyAwake = false;

    for (let s = 0; s < sub; s++) {
      let awakeThisSub = false;

      for (let i = 0; i < this.rocks.length; i++) {
        const r = this._ensureBody(this.rocks[i]);
        if (r.isOutcrop) continue;

        if (r.settled) {
          // Cheap support audit: wake only if the ground fell away or steepened
          const stc = this.sampleTerrain(r.x, r.z);
          const gap = (r.y - this._support(r, 0, 1, 0)) - stc.totalH;
          if (gap > 0.12 || stc.slope > r.muS + 0.03) {
            r.settled = false;
            r.sleepTimer = 0;
          } else {
            continue;
          }
        }

        awakeThisSub = true;
        r.wakeTimer = Math.max(0, (r.wakeTimer || 0) - h);

        // --- Buoyancy/drag estimate from standing water depth
        const stPre = this.sampleTerrain(r.x, r.z);
        let submerged = 0;
        if (stPre.water > 0.02) {
          const waterSurf = stPre.totalH + stPre.water;
          submerged = clamp((waterSurf - (r.y - r.ry)) / (2 * r.ry), 0, 1);
        }
        const gEff = GRAVITY * (1 - 0.38 * submerged); // rock density 2.7x water

        // --- Forces: gravity + quadratic water drag + faint air drag
        r.vy -= gEff * h;
        const speed = Math.hypot(r.vx, r.vy, r.vz);
        if (speed > 1e-6) {
          const dragK = 0.002 + 0.55 * submerged;
          const dragDecel = Math.min(speed, dragK * speed * speed * h);
          const inv = (speed - dragDecel) / speed;
          r.vx *= inv; r.vy *= inv; r.vz *= inv;
        }

        // --- Integrate position & orientation
        r.x += r.vx * h;
        r.y += r.vy * h;
        r.z += r.vz * h;
        {
          // dq/dt = 0.5 * Omega_world (x) q
          const qx = r.qx, qy = r.qy, qz = r.qz, qw = r.qw;
          const ox = r.ox, oy = r.oy, oz = r.oz;
          const dx = 0.5 * (qw * ox + oy * qz - oz * qy);
          const dy = 0.5 * (qw * oy + oz * qx - ox * qz);
          const dz = 0.5 * (qw * oz + ox * qy - oy * qx);
          const dw = 0.5 * (-(ox * qx + oy * qy + oz * qz));
          let nx = qx + dx * h, ny = qy + dy * h, nz = qz + dz * h, nw = qw + dw * h;
          const ql = Math.hypot(nx, ny, nz, nw) || 1;
          r.qx = nx / ql; r.qy = ny / ql; r.qz = nz / ql; r.qw = nw / ql;
        }

        // --- Domain bounds: soft wall bounce
        if (Math.abs(r.x) > half) { r.x = clamp(r.x, -half, half); r.vx *= -0.25; }
        if (Math.abs(r.z) > half) { r.z = clamp(r.z, -half, half); r.vz *= -0.25; }

        // --- Terrain contact (heightfield plane at body centre)
        const st = this.sampleTerrain(r.x, r.z);
        const nx = st.nx, ny = st.ny, nz = st.nz;
        const supN = this._support(r, nx, ny, nz);
        const planeDist = (r.y - st.totalH) * ny - supN;

        if (planeDist < 0) {
          // Positional depenetration along the terrain normal
          const push = -planeDist;
          r.x += nx * push;
          r.y += ny * push;
          r.z += nz * push;
          r.grounded = true;

          // Normal impulse with restitution (dead on sediment/water, lively on bedrock)
          const vn = r.vx * nx + r.vy * ny + r.vz * nz;
          let impact = 0;
          if (vn < 0) {
            impact = -vn;
            const soft = (st.coarse + st.fine) > 0.4 || st.water > 0.10;
            const e = soft ? 0.05 : 0.22;
            const j = -(1 + e) * vn;
            r.vx += j * nx; r.vy += j * ny; r.vz += j * nz;
            if (impact > 7) {
              // Hard landing dissipates tangential energy (crush/plough)
              r.vx *= 0.82; r.vz *= 0.82;
            }
          }

          // Tangential velocity & downslope gravity pull
          const vn2 = r.vx * nx + r.vy * ny + r.vz * nz;
          let vtx = r.vx - vn2 * nx;
          let vty = r.vy - vn2 * ny;
          let vtz = r.vz - vn2 * nz;
          const speedT = Math.hypot(vtx, vty, vtz);

          const sedBoost = Math.min(0.25, (st.coarse + st.fine) * 0.10);
          const muS = r.muS + sedBoost;
          const muK = muS * 0.72;
          // |g_tangential| = gEff * sqrt(1-ny^2); normal gravity load = gEff * ny
          const gTanMag = gEff * Math.sqrt(Math.max(0, 1 - ny * ny));
          const gNormMag = gEff * ny;

          if (speedT < 0.30 && gTanMag <= muS * gNormMag && impact < 1.2) {
            // Static friction holds: cancel tangential creep, count toward sleep
            r.vx -= vtx; r.vy -= vty; r.vz -= vtz;
            r.ox *= 0.55; r.oy *= 0.55; r.oz *= 0.55;
            r.sleepTimer += h;
            const spd = Math.hypot(r.vx, r.vy, r.vz);
            const ang = Math.hypot(r.ox, r.oy, r.oz);
            if (r.sleepTimer > 0.35 && spd < 0.45 && ang < 0.6) {
              r.settled = true;
              r.vx = 0; r.vy = 0; r.vz = 0;
              r.ox = 0; r.oy = 0; r.oz = 0;
            }
          } else {
            r.sleepTimer = 0;
            // Kinetic (sliding/rolling) friction opposes tangential motion
            if (speedT > 1e-6) {
              const decel = muK * gNormMag * h;
              const keep = Math.max(0, speedT - decel) / speedT;
              const nVx = vn2 * nx + vtx * keep;
              const nVy = vn2 * ny + vty * keep;
              const nVz = vn2 * nz + vtz * keep;
              r.vx = nVx; r.vy = nVy; r.vz = nVz;
              vtx *= keep; vty *= keep; vtz *= keep;
            }
            // Rolling: spin toward rolling-without-slipping omega = (n x vt)/r
            const rEff = Math.max(0.35, supN);
            const wrx = (ny * vtz - nz * vty) / rEff;
            const wry = (nz * vtx - nx * vtz) / rEff;
            const wrz = (nx * vty - ny * vtx) / rEff;
            const blend = 1 - Math.exp(-6.0 * h);
            r.ox += (wrx - r.ox) * blend;
            r.oy += (wry - r.oy) * blend;
            r.oz += (wrz - r.oz) * blend;
            // Rolling resistance
            const rr = Math.exp(-0.35 * h);
            r.ox *= rr; r.oy *= rr; r.oz *= rr;
          }
        } else {
          r.grounded = false;
          r.sleepTimer = 0;
        }
      }

      if (awakeThisSub) {
        anyAwake = true;
        this._collideRocks();
      }
    }

    if (anyAwake || duringPrewarm) {
      this._rebuildInstanceBuckets();
    }
    return anyAwake;
  }

  /** Impulse-based sphere collision between boulders (spatial hash broadphase). */
  _collideRocks() {
    const CELL = 10;
    const grid = new Map();
    const dynamics = [];
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this.rocks[i];
      if (r.qw === undefined) continue;
      dynamics.push(r);
      const key = `${Math.floor(r.x / CELL)},${Math.floor(r.z / CELL)}`;
      let bucket = grid.get(key);
      if (!bucket) { bucket = []; grid.set(key, bucket); }
      bucket.push(r);
    }

    for (let i = 0; i < dynamics.length; i++) {
      const a = dynamics[i];
      if (a.isOutcrop || a.settled) continue; // only awake bodies initiate pairs
      const cx = Math.floor(a.x / CELL);
      const cz = Math.floor(a.z / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const bucket = grid.get(`${gx},${gz}`);
          if (!bucket) continue;
          for (let j = 0; j < bucket.length; j++) {
            const b = bucket[j];
            if (b === a) continue;
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const minDist = (a.boundR + b.boundR) * 0.92;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= minDist * minDist || d2 < 1e-9) continue;

            const bStatic = b.isOutcrop || b.settled;
            let invA = a.invMass;
            let invB = bStatic ? 0 : b.invMass;
            const dist = Math.sqrt(d2);
            const nx = dx / dist, ny = dy / dist, nz = dz / dist;

            // Wake a sleeping boulder if struck firmly
            const relVn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
            if (bStatic && !b.isOutcrop && relVn < -1.4) {
              b.settled = false;
              b.sleepTimer = 0;
              invB = b.invMass;
            }
            const invSum = invA + invB;
            if (invSum <= 0) continue;

            // Positional separation split by inverse mass
            const pen = (minDist - dist) * 0.9;
            a.x -= nx * pen * (invA / invSum);
            a.y -= ny * pen * (invA / invSum);
            a.z -= nz * pen * (invA / invSum);
            if (invB > 0) {
              b.x += nx * pen * (invB / invSum);
              b.y += ny * pen * (invB / invSum);
              b.z += nz * pen * (invB / invSum);
            }

            if (relVn < 0) {
              const jimp = (-(1 + 0.15) * relVn) / invSum;
              a.vx -= jimp * invA * nx;
              a.vy -= jimp * invA * ny;
              a.vz -= jimp * invA * nz;
              if (invB > 0) {
                b.vx += jimp * invB * nx;
                b.vy += jimp * invB * ny;
                b.vz += jimp * invB * nz;
              }
            }
          }
        }
      }
    }
  }

  _rebuildInstanceBuckets() {
    this.bucketCounts.fill(0);
    for (let i = 0; i < this.rocks.length; i++) {
      const r = this._ensureBody(this.rocks[i]);
      const bIdx = r.submesh;
      const slot = this.bucketCounts[bIdx];
      if (slot >= MAX_INSTANCES) continue;
      this.bucketCounts[bIdx] = slot + 1;

      quatBasis(r.qx, r.qy, r.qz, r.qw, _basis);
      const tx = _basis[0], ty = _basis[1], tz = _basis[2];
      const ux = _basis[3], uy = _basis[4], uz = _basis[5];
      const bx = _basis[6], by = _basis[7], bz = _basis[8];

      // Compatibility fields for external readers (tests/tools)
      r.yaw = Math.atan2(tz, tx);
      r.upX = ux; r.upY = uy; r.upZ = uz;
      r.radiusY = r.ry;
      if (this.hasHeightSnapshot) {
        const st = this.sampleTerrain(r.x, r.z);
        r.airLift = Math.max(0, (r.y - this._support(r, 0, 1, 0)) - st.totalH);
      } else {
        r.airLift = 0;
      }

      const arr = this.bucketData[bIdx];
      const o = slot * FLOATS_PER_INSTANCE;
      arr[o + 0] = tx * r.sx;
      arr[o + 1] = ty * r.sx;
      arr[o + 2] = tz * r.sx;
      arr[o + 3] = r.seedHash ?? 0.5;
      arr[o + 4] = ux * r.sy;
      arr[o + 5] = uy * r.sy;
      arr[o + 6] = uz * r.sy;
      arr[o + 7] = r.wear ?? 0.4;
      arr[o + 8] = bx * r.sz;
      arr[o + 9] = by * r.sz;
      arr[o + 10] = bz * r.sz;
      arr[o + 11] = r.ry;
      // aInstPosMeta: TRUE rigid-body centre (worldX, worldY, worldZ, isOutcrop).
      // ROCK_INSTANCE_VERT renders exactly here -- no heightfield re-snapping.
      arr[o + 12] = r.x;
      arr[o + 13] = r.y;
      arr[o + 14] = r.z;
      arr[o + 15] = r.isOutcrop ? 1.0 : 0.0;
    }
  }
}
