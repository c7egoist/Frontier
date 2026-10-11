// ============================================================================================================================================
//                                                                ROADMESH.JS
// ============================================================================================================================================
// Canonical Quad-First Geometry Builder for Roads, Curbs, Gutters, Sidewalks, Potholes, Speed Bumps, Construction Trenches,
// Road Markings, City Block Paving Parcels, and Watertight Merged N-Way Intersections (Y, T, +, Star).
//
// Every surface is authored as structured Quads FIRST (stored in builder.quads and builder.quadEdges),
// then triangulated into GPU vertex/index buffers for WebGPU and WebGL2 rendering.

import {
  clamp,
  lerp,
  smoothstep,
  vAdd,
  vSub,
  vScale,
  vMad,
  vDot,
  vCross,
  vLen,
  vDist,
  vDistXZ,
  vLerp,
  vNorm,
  vNormXZ,
  leftNormalXZ,
  filletBetweenEdgesXZ,
  offsetCurvePinnedXZ,
  coonsPatchGrid,
  resamplePolyline,
} from './math.js';
import { MAT, CURB_PROFILES, PAVING_PATTERNS } from './model.js';

/**
 * Accumulates structured Quads first, then emits triangles + quad wireframe edges + triangle wireframe edges.
 * Vertex layout (12 floats = 48 bytes per vertex):
 *   [0..2] position (x, y, z)
 *   [3..5] normal   (nx, ny, nz)
 *   [6..7] uv       (u, v) — metric world/road coordinates
 *   [8]    matId    (float material ID)
 *   [9]    aux0     (pavingPatternId / laneCoord / custom param)
 *   [10]   aux1     (wearMask / potholeDepth / custom param)
 *   [11]   entityId (encoded pick ID for clicking intersections, roads, furniture)
 */
export class QuadMeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.metas = []; // [matId, aux0, aux1, entityId]
    this.quads = []; // [i0, i1, i2, i3]
    this.triangles = []; // [i0, i1, i2]
    this.quadLineIndices = []; // pairs for quad-only wireframe
    this.triLineIndices = []; // pairs for full triangle wireframe
    this.entityBounds = new Map(); // entityId -> { kind, id, name, center, count }
  }

  addVertex(pos, norm, uv, matId, aux0 = 0, aux1 = 0, entityId = 0) {
    const idx = this.positions.length / 3;
    this.positions.push(pos[0], pos[1], pos[2]);
    this.normals.push(norm[0], norm[1], norm[2]);
    this.uvs.push(uv[0], uv[1]);
    this.metas.push(matId, aux0, aux1, entityId);
    return idx;
  }

  addQuad(p0, p1, p2, p3, uv0, uv1, uv2, uv3, matId, aux0 = 0, aux1 = 0, entityId = 0, explicitNormal = null) {
    const n =
      explicitNormal ||
      vNorm(vCross(vSub(p1, p0), vSub(p3, p0)), [0, 1, 0]);
    const i0 = this.addVertex(p0, n, uv0, matId, aux0, aux1, entityId);
    const i1 = this.addVertex(p1, n, uv1, matId, aux0, aux1, entityId);
    const i2 = this.addVertex(p2, n, uv2, matId, aux0, aux1, entityId);
    const i3 = this.addVertex(p3, n, uv3, matId, aux0, aux1, entityId);

    this.quads.push([i0, i1, i2, i3]);
    this.triangles.push(i0, i1, i2, i0, i2, i3);
    this.quadLineIndices.push(i0, i1, i1, i2, i2, i3, i3, i0);
    this.triLineIndices.push(i0, i1, i1, i2, i2, i0, i0, i2, i2, i3, i3, i0);
    return [i0, i1, i2, i3];
  }

  /**
   * Adds a structured 2D grid of points `grid[row][col]` as smooth-normal shared-vertex Quads.
   * `uvFn(r, c, pt)` returns `[u, v]`, `metaFn(r, c, pt)` returns `[matId, aux0, aux1, entityId]`.
   */
  addQuadGrid(grid, uvFn, metaFn, flipWinding = false) {
    const R = grid.length;
    if (R < 2) return;
    const C = grid[0].length;
    if (C < 2) return;

    // Compute smooth per-vertex normals on the grid
    const norms = Array.from({ length: R }, () => Array.from({ length: C }, () => [0, 1, 0]));
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const pU0 = grid[Math.max(0, r - 1)][c];
        const pU1 = grid[Math.min(R - 1, r + 1)][c];
        const pV0 = grid[r][Math.max(0, c - 1)];
        const pV1 = grid[r][Math.min(C - 1, c + 1)];
        const dU = vSub(pU1, pU0);
        const dV = vSub(pV1, pV0);
        let n = vCross(dU, dV);
        if (flipWinding) n = vScale(n, -1);
        if (n[1] < 0 && Math.abs(n[1]) > 0.25) {
          // Ensure upward normal for horizontal road/junction surfaces
          n = vScale(n, -1);
        }
        norms[r][c] = vNorm(n, [0, 1, 0]);
      }
    }

    const idxGrid = Array.from({ length: R }, () => new Array(C));
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const pt = grid[r][c];
        const uv = uvFn ? uvFn(r, c, pt) : [r, c];
        const [matId, aux0, aux1, entityId] = metaFn ? metaFn(r, c, pt) : [MAT.ASPHALT, 0, 0, 0];
        idxGrid[r][c] = this.addVertex(pt, norms[r][c], uv, matId, aux0, aux1, entityId);
      }
    }

    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const i00 = idxGrid[r][c];
        const i10 = idxGrid[r + 1][c];
        const i11 = idxGrid[r + 1][c + 1];
        const i01 = idxGrid[r][c + 1];
        const q = flipWinding ? [i00, i01, i11, i10] : [i00, i10, i11, i01];
        this.quads.push(q);
        this.triangles.push(q[0], q[1], q[2], q[0], q[2], q[3]);
        this.quadLineIndices.push(q[0], q[1], q[1], q[2], q[2], q[3], q[3], q[0]);
        this.triLineIndices.push(q[0], q[1], q[1], q[2], q[2], q[0], q[0], q[2], q[2], q[3], q[3], q[0]);
      }
    }
  }

  /**
   * Builds a 6-face oriented 3D box (6 Quads -> 12 Triangles).
   */
  addBox(center, sizeX, sizeY, sizeZ, forwardXZ = [0, 0, -1], matId = MAT.CONCRETE_STRUCTURE, aux0 = 0, aux1 = 0, entityId = 0) {
    const fwd = vNormXZ(forwardXZ, [0, 0, -1]);
    const right = [-fwd[2], 0, fwd[0]];
    const up = [0, 1, 0];
    const hx = sizeX * 0.5;
    const hy = sizeY * 0.5;
    const hz = sizeZ * 0.5;

    const pt = (sx, sy, sz) => [
      center[0] + right[0] * sx + up[0] * sy + fwd[0] * sz,
      center[1] + right[1] * sx + up[1] * sy + fwd[1] * sz,
      center[2] + right[2] * sx + up[2] * sy + fwd[2] * sz,
    ];

    const p000 = pt(-hx, -hy, -hz);
    const p100 = pt(hx, -hy, -hz);
    const p110 = pt(hx, hy, -hz);
    const p010 = pt(-hx, hy, -hz);
    const p001 = pt(-hx, -hy, hz);
    const p101 = pt(hx, -hy, hz);
    const p111 = pt(hx, hy, hz);
    const p011 = pt(-hx, hy, hz);

    const uv0 = [0, 0];
    const uv1 = [1, 0];
    const uv2 = [1, 1];
    const uv3 = [0, 1];

    // Top, Bottom, Front, Back, Left, Right (all Quads!)
    this.addQuad(p010, p110, p111, p011, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, up);
    this.addQuad(p001, p101, p100, p000, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, [0, -1, 0]);
    this.addQuad(p001, p011, p111, p101, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, fwd);
    this.addQuad(p100, p110, p010, p000, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, vScale(fwd, -1));
    this.addQuad(p000, p010, p011, p001, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, vScale(right, -1));
    this.addQuad(p101, p111, p110, p100, uv0, uv1, uv2, uv3, matId, aux0, aux1, entityId, right);
  }

  /**
   * Builds a vertical or oriented cylinder using a ring of Quads along the barrel and quad caps.
   */
  addCylinder(baseCenter, topCenter, radiusBottom, radiusTop, sides = 8, matId = MAT.STEEL_DARK, aux0 = 0, aux1 = 0, entityId = 0) {
    const axis = vSub(topCenter, baseCenter);
    const len = vLen(axis);
    if (len <= 1e-5) return;
    const up = vScale(axis, 1 / len);
    const ref = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const uVec = vNorm(vCross(up, ref), [1, 0, 0]);
    const vVec = vCross(up, uVec);

    const ringB = [];
    const ringT = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const dir = [uVec[0] * c + vVec[0] * s, uVec[1] * c + vVec[1] * s, uVec[2] * c + vVec[2] * s];
      ringB.push(vMad(baseCenter, dir, radiusBottom));
      ringT.push(vMad(topCenter, dir, radiusTop));
    }

    for (let i = 0; i < sides; i++) {
      this.addQuad(
        ringB[i],
        ringB[i + 1],
        ringT[i + 1],
        ringT[i],
        [i / sides, 0],
        [(i + 1) / sides, 0],
        [(i + 1) / sides, 1],
        [i / sides, 1],
        matId,
        aux0,
        aux1,
        entityId
      );
    }
    // Top cap as quads
    for (let i = 0; i < sides; i += 2) {
      const i1 = (i + 1) % sides;
      const i2 = (i + 2) % sides;
      this.addQuad(
        topCenter,
        ringT[i],
        ringT[i1],
        ringT[i2],
        [0.5, 0.5],
        [0, 0],
        [1, 0],
        [1, 1],
        matId,
        aux0,
        aux1,
        entityId,
        up
      );
    }
  }

  toBuffers() {
    const vertCount = this.positions.length / 3;
    const interleaved = new Float32Array(vertCount * 12);
    for (let i = 0; i < vertCount; i++) {
      const base = i * 12;
      interleaved[base + 0] = this.positions[i * 3 + 0];
      interleaved[base + 1] = this.positions[i * 3 + 1];
      interleaved[base + 2] = this.positions[i * 3 + 2];
      interleaved[base + 3] = this.normals[i * 3 + 0];
      interleaved[base + 4] = this.normals[i * 3 + 1];
      interleaved[base + 5] = this.normals[i * 3 + 2];
      interleaved[base + 6] = this.uvs[i * 2 + 0];
      interleaved[base + 7] = this.uvs[i * 2 + 1];
      interleaved[base + 8] = this.metas[i * 4 + 0];
      interleaved[base + 9] = this.metas[i * 4 + 1];
      interleaved[base + 10] = this.metas[i * 4 + 2];
      interleaved[base + 11] = this.metas[i * 4 + 3];
    }
    return {
      vertexBufferData: interleaved,
      triangleIndices: new Uint32Array(this.triangles),
      quadLineIndices: new Uint32Array(this.quadLineIndices),
      triLineIndices: new Uint32Array(this.triLineIndices),
      vertexCount: vertCount,
      quadCount: this.quads.length,
      triangleCount: this.triangles.length / 3,
    };
  }
}

function getPavingIdNum(patternId) {
  const found = PAVING_PATTERNS.find((p) => p.id === patternId);
  return found ? found.idNum : 0;
}

function getCurbSpec(profileId, fallbackHeight = 0.15, fallbackWidth = 0.18) {
  const found = CURB_PROFILES.find((c) => c.id === profileId);
  if (found) return found;
  return { id: 'granite-batter', height: fallbackHeight, width: fallbackWidth, chamfer: 0.025 };
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                  CROSS-SECTION & ROAD SPAN QUAD MESH GENERATION
// --------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Computes all cross-section station profiles for a road run, including:
 * - Multi-strip carriageway grid (subdivided laterally so crown, potholes, speed bumps & construction trenches deform real quad vertices)
 * - Left & Right Gutter channels
 * - Left & Right Chamfered Curbs (face + chamfer + top table)
 * - Left & Right Sidewalks (with crossfall & paving pattern)
 * - Superstructure tub walls & bottom slab
 */
export function computeRunCrossSection(frames, spline, roadLayerMap, entityId = 100) {
  const lCarriage = roadLayerMap['layer-carriageway'];
  const lCurbs = roadLayerMap['layer-curbs'];
  const lPaving = roadLayerMap['layer-paving'];
  const lDistress = roadLayerMap['layer-distress'];

  const halfW = Math.max(2.0, (spline.width || 10.0) * 0.5);
  const latSubdiv = clamp(Math.round(lCarriage?.params?.quadSubdivLat ?? 8), 4, 16);
  const crownSlope = lCarriage?.params?.crownSlope ?? 0.022;
  const tubDepth = lCarriage?.params?.tubDepth ?? 0.55;

  const curbVisible = lCurbs ? lCurbs.visible : true;
  const curbSpec = getCurbSpec(spline.curbProfile || lCurbs?.params?.curbProfile || 'granite-batter');
  const curbH = curbVisible ? curbSpec.height : 0.01;
  const curbW = curbVisible ? curbSpec.width : 0.05;
  const chamfer = curbVisible ? curbSpec.chamfer : 0.01;

  const gutterOn = curbVisible && (lCurbs?.params?.gutterEnabled ?? true);
  const gutterW = gutterOn ? (lCurbs?.params?.gutterWidth ?? 0.42) : 0.05;
  const gutterDrop = gutterOn ? (lCurbs?.params?.gutterDepth ?? 0.035) : 0.0;

  const paveVisible = lPaving ? lPaving.visible : true;
  const paveW = paveVisible ? Math.max(0.8, spline.sidewalkWidth ?? lPaving?.params?.sidewalkWidth ?? 3.4) : 0.3;
  const crossfall = lPaving?.params?.crossfall ?? 0.018;

  const distressOn = lDistress ? lDistress.visible : true;
  const bumpsOn = distressOn && (lDistress?.params?.speedBumpsEnabled ?? true);
  const bumpH = lDistress?.params?.speedBumpHeight ?? 0.095;
  const bumpW = lDistress?.params?.speedBumpWidth ?? 2.8;

  const potholesOn = distressOn && (lDistress?.params?.potholesEnabled ?? true);
  const potholeScaleDepth = (lDistress?.params?.potholeDepth ?? 0.085) / 0.085;
  const potholeScaleRad = (lDistress?.params?.potholeRadius ?? 1.15) / 1.15;

  const constructionOn =
    distressOn &&
    (lDistress?.params?.constructionEnabled ?? true) &&
    spline.construction?.enabled;
  const trenchDepth = lDistress?.params?.constructionTrenchDepth ?? 0.14;

  const n = frames.length;
  const totalLen = frames[n - 1]?.s || 1;

  const roadGrid = []; // [station][latIndex 0..latSubdiv] (0 = Left road edge, latSubdiv = Right road edge)
  const roadMatGrid = []; // per-vertex material override (ASPHALT, SPEED_BUMP, POTHOLE_GRAVEL, CONSTRUCTION_MILLED)
  const roadAuxGrid = []; // per-vertex aux1 (pothole/bump/trench intensity)

  const roadL = [];
  const roadR = [];
  const gutInL = [];
  const gutInR = [];
  const curbBotL = [];
  const curbBotR = [];
  const curbChamferL = [];
  const curbChamferR = [];
  const curbTopL = [];
  const curbTopR = [];
  const paveL = [];
  const paveR = [];
  const botL = [];
  const botR = [];

  const carriageHalf = Math.max(1.5, halfW - gutterW);

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    const s = f.s;
    const uNorm = totalLen > 0 ? s / totalLen : 0;

    // End-fade factor so potholes/bumps/trenches never distort the pinned junction approach boundaries!
    const endGuard = smoothstep(0, 3.2, Math.min(s, totalLen - s));

    // Clamp lateral offsets by curvature radius so tight inner curves never self-intersect
    const limL = Math.max(1.2, f.maxLeft);
    const limR = Math.max(1.2, f.maxRight);
    const effCarriageL = Math.min(carriageHalf, limL * 0.72);
    const effCarriageR = Math.min(carriageHalf, limR * 0.72);

    // 1. Multi-strip carriageway row from Left (-effCarriageL) to Right (+effCarriageR)
    const rowPts = [];
    const rowMats = [];
    const rowAux = [];

    for (let k = 0; k <= latSubdiv; k++) {
      const frac = k / latSubdiv; // 0 = Left edge, 0.5 = Centerline, 1 = Right edge
      const signedNorm = frac * 2 - 1; // -1 (Left) .. +1 (Right)
      const latOffset = signedNorm < 0 ? -signedNorm * effCarriageL : signedNorm * effCarriageR;
      const basePt = vMad(f.center, f.left, latOffset);

      // Parabolic road crown camber (highest at center, slopes down toward gutters)
      const crownY = halfW * crownSlope * (1 - signedNorm * signedNorm);
      let dy = crownY;
      let vMat = MAT.ASPHALT;
      let vAux = Math.abs(signedNorm);

      // Check Speed Bumps along spline
      if (bumpsOn && endGuard > 0.1 && Array.isArray(spline.speedBumps)) {
        for (const bumpU of spline.speedBumps) {
          const bumpS = bumpU * totalLen;
          const ds = Math.abs(s - bumpS);
          if (ds < bumpW * 0.5) {
            const profile = Math.cos((ds / (bumpW * 0.5)) * (Math.PI * 0.5));
            const edgeTaper = smoothstep(1.0, 0.82, Math.abs(signedNorm));
            const lift = bumpH * profile * profile * edgeTaper * endGuard;
            if (lift > 0.004) {
              dy += lift;
              vMat = MAT.SPEED_BUMP;
              vAux = profile;
            }
          }
        }
      }

      // Check 3D Quad Potholes
      if (potholesOn && endGuard > 0.1 && Array.isArray(spline.potholes)) {
        for (const ph of spline.potholes) {
          const phS = ph.s * totalLen;
          const phOff = ph.offset || 0; // lateral offset (+left / -right)
          const rad = (ph.radius || 1.15) * potholeScaleRad;
          const depth = (ph.depth || 0.085) * potholeScaleDepth;
          const ds = s - phS;
          const dl = latOffset - phOff;
          const d = Math.hypot(ds, dl);
          if (d < rad * 1.25) {
            const rNorm = d / rad;
            if (rNorm < 1.0) {
              // Depressed crater bowl
              const bowl = (1 - rNorm * rNorm) * (1 - rNorm * 0.35);
              dy -= depth * bowl * endGuard;
              vMat = MAT.POTHOLE_GRAVEL;
              vAux = bowl;
            } else {
              // Slight fractured asphalt rim lip around the pothole
              const rim = Math.sin(((rNorm - 1.0) / 0.25) * Math.PI);
              dy += depth * 0.16 * rim * endGuard;
            }
          }
        }
      }

      // Check Road Construction / Rebuilding Milled Trench Zone
      if (constructionOn && endGuard > 0.05) {
        const cStart = (spline.construction.startS ?? 0.2) * totalLen;
        const cEnd = (spline.construction.endS ?? 0.45) * totalLen;
        const side = spline.construction.side || 'right';
        if (s >= cStart && s <= cEnd) {
          const inLane = side === 'right' ? signedNorm > 0.05 : signedNorm < -0.05;
          if (inLane) {
            const rampS = smoothstep(0, 1.4, Math.min(s - cStart, cEnd - s));
            dy -= trenchDepth * rampS * endGuard;
            vMat = MAT.CONSTRUCTION_MILLED;
            vAux = rampS;
          }
        }
      }

      // Keep outer edges (k === 0 and k === latSubdiv) cleanly aligned with gutter inner edge
      if (k === 0 || k === latSubdiv) {
        dy = 0;
        vMat = MAT.ASPHALT;
      }

      rowPts.push([basePt[0], basePt[1] + dy, basePt[2]]);
      rowMats.push(vMat);
      rowAux.push(vAux);
    }

    roadGrid.push(rowPts);
    roadMatGrid.push(rowMats);
    roadAuxGrid.push(rowAux);

    const rL = rowPts[0];
    const rR = rowPts[latSubdiv];
    roadL.push(rL);
    roadR.push(rR);

    // 2. Gutter outer/bottom edge (dropped by gutterDrop at curb base)
    const oGutL = Math.min(effCarriageL + gutterW, limL * 0.8);
    const oGutR = Math.min(effCarriageR + gutterW, limR * 0.8);
    const gL = vMad(f.center, f.left, oGutL);
    gL[1] -= gutterDrop;
    const gR = vMad(f.center, f.right, oGutR);
    gR[1] -= gutterDrop;
    gutInL.push(rL);
    gutInR.push(rR);
    curbBotL.push(gL);
    curbBotR.push(gR);

    // 3. Curb Chamfer & Curb Top Table
    const oChamL = oGutL + chamfer;
    const oChamR = oGutR + chamfer;
    const chL = vMad(f.center, f.left, oChamL);
    chL[1] += curbH - chamfer * 0.6;
    const chR = vMad(f.center, f.right, oChamR);
    chR[1] += curbH - chamfer * 0.6;
    curbChamferL.push(chL);
    curbChamferR.push(chR);

    const oCurbTopL = oGutL + curbW;
    const oCurbTopR = oGutR + curbW;
    const ctL = vMad(f.center, f.left, oCurbTopL);
    ctL[1] += curbH;
    const ctR = vMad(f.center, f.right, oCurbTopR);
    ctR[1] += curbH;
    curbTopL.push(ctL);
    curbTopR.push(ctR);

    // 4. Sidewalk Outer Edge (with gentle upward crossfall so water drains toward gutter)
    const oPaveL = Math.min(oCurbTopL + paveW, limL * 0.96);
    const oPaveR = Math.min(oCurbTopR + paveW, limR * 0.96);
    const pL = vMad(f.center, f.left, oPaveL);
    pL[1] += curbH + (oPaveL - oCurbTopL) * crossfall;
    const pR = vMad(f.center, f.right, oPaveR);
    pR[1] += curbH + (oPaveR - oCurbTopR) * crossfall;
    paveL.push(pL);
    paveR.push(pR);

    // 5. Superstructure Bottom
    const bL = [pL[0], f.center[1] - tubDepth, pL[2]];
    const bR = [pR[0], f.center[1] - tubDepth, pR[2]];
    botL.push(bL);
    botR.push(bR);
  }

  return {
    frames,
    halfW,
    carriageHalf,
    latSubdiv,
    pavingIdNum: getPavingIdNum(spline.pavingPattern || lPaving?.params?.pavingPattern || 'herringbone'),
    roadGrid,
    roadMatGrid,
    roadAuxGrid,
    roadL,
    roadR,
    curbBotL,
    curbBotR,
    curbChamferL,
    curbChamferR,
    curbTopL,
    curbTopR,
    paveL,
    paveR,
    botL,
    botR,
    entityId,
  };
}

/**
 * Emits all Quad grids for one road run into the QuadMeshBuilder.
 */
export function emitRoadRunQuads(builder, run, cross, roadLayerMap) {
  const { frames, latSubdiv, pavingIdNum, entityId } = cross;
  const n = frames.length;
  if (n < 2) return;

  const lCarriage = roadLayerMap['layer-carriageway'];
  const lCurbs = roadLayerMap['layer-curbs'];
  const lPaving = roadLayerMap['layer-paving'];
  const lDistress = roadLayerMap['layer-distress'];
  const lFurniture = roadLayerMap['layer-furniture'];

  // 1. Carriageway multi-strip Quad Grid
  if (!lCarriage || lCarriage.visible) {
    builder.addQuadGrid(
      cross.roadGrid,
      (r, c) => [frames[r].s * 0.25, (c / latSubdiv) * 2 - 1],
      (r, c) => [
        cross.roadMatGrid[r][c],
        (c / latSubdiv) * 2 - 1, // lateral normalized coord (-1..+1) for wheel-track shader
        cross.roadAuxGrid[r][c],
        entityId,
      ],
      false
    );
  }

  // 2. Pothole Puddle Water Quads & Construction Rebar / Barriers
  if (!lDistress || lDistress.visible) {
    const totalLen = frames[n - 1].s || 1;
    // Standing water puddles inside potholes
    if ((lDistress?.params?.potholesEnabled ?? true) && (lDistress?.params?.potholePuddles ?? true)) {
      for (const ph of run.spline.potholes || []) {
        const phS = ph.s * totalLen;
        if (phS < 3.0 || phS > totalLen - 3.0) continue;
        // Find station nearest phS
        let bestIdx = 0;
        let bestD = Infinity;
        for (let i = 0; i < n; i++) {
          const d = Math.abs(frames[i].s - phS);
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
        const f = frames[bestIdx];
        const rad = (ph.radius || 1.15) * 0.72;
        const center = vMad(f.center, f.left, ph.offset || 0);
        const yWater = f.center[1] - 0.022;
        const p0 = [center[0] - rad, yWater, center[2] - rad];
        const p1 = [center[0] + rad, yWater, center[2] - rad];
        const p2 = [center[0] + rad, yWater, center[2] + rad];
        const p3 = [center[0] - rad, yWater, center[2] + rad];
        builder.addQuad(p0, p3, p2, p1, [0, 0], [0, 1], [1, 1], [1, 0], MAT.POTHOLE_PUDDLE, 0, 1, entityId, [0, 1, 0]);
      }
    }
  }

  // 3. Gutter Channels + Curbs (Face + Chamfer + Top Table)
  if (!lCurbs || lCurbs.visible) {
    // Left & Right Gutter Quads
    builder.addQuadGrid(
      frames.map((_, i) => [cross.curbBotL[i], cross.roadL[i]]),
      (r, c) => [frames[r].s * 0.5, c],
      () => [MAT.GUTTER, 0, 0, entityId],
      false
    );
    builder.addQuadGrid(
      frames.map((_, i) => [cross.roadR[i], cross.curbBotR[i]]),
      (r, c) => [frames[r].s * 0.5, c],
      () => [MAT.GUTTER, 0, 0, entityId],
      false
    );

    // Left Curb (Bot -> Chamfer -> Top)
    builder.addQuadGrid(
      frames.map((_, i) => [cross.curbTopL[i], cross.curbChamferL[i], cross.curbBotL[i]]),
      (r, c) => [frames[r].s * 0.8, c * 0.5],
      () => [MAT.CURB_GRANITE, 0, 0, entityId],
      false
    );
    // Right Curb (Bot -> Chamfer -> Top)
    builder.addQuadGrid(
      frames.map((_, i) => [cross.curbBotR[i], cross.curbChamferR[i], cross.curbTopR[i]]),
      (r, c) => [frames[r].s * 0.8, c * 0.5],
      () => [MAT.CURB_GRANITE, 0, 0, entityId],
      false
    );

    // Cast-iron Drainage Grates & Manholes along the run
    if (lCurbs?.params?.drainGrates ?? true) {
      const spacing = Math.max(8, lCurbs?.params?.grateSpacing ?? 16);
      const total = frames[n - 1].s;
      for (let s = spacing * 0.6; s < total - 4.0; s += spacing) {
        let idx = 0;
        for (let i = 0; i < n - 1; i++) {
          if (frames[i + 1].s >= s) {
            idx = i;
            break;
          }
        }
        const f = frames[idx];
        // Left & Right recessed cast-iron gully grates
        const gL = vLerp(cross.roadL[idx], cross.curbBotL[idx], 0.55);
        const gR = vLerp(cross.roadR[idx], cross.curbBotR[idx], 0.55);
        builder.addBox([gL[0], gL[1] + 0.008, gL[2]], 0.36, 0.02, 0.68, f.tangent, MAT.STEEL_DARK, 1, 0, entityId);
        builder.addBox([gR[0], gR[1] + 0.008, gR[2]], 0.36, 0.02, 0.68, f.tangent, MAT.STEEL_DARK, 1, 0, entityId);

        if (lCurbs?.params?.manholes ?? true) {
          const mhPos = vMad(f.center, f.left, 0.85);
          builder.addCylinder(
            [mhPos[0], mhPos[1] + 0.005, mhPos[2]],
            [mhPos[0], mhPos[1] + 0.022, mhPos[2]],
            0.42,
            0.40,
            10,
            MAT.STEEL_DARK,
            2,
            0,
            entityId
          );
        }
      }
    }
  }

  // 4. Sidewalks (3 lateral quad strips per sidewalk for high-resolution paving & tree-pit support)
  if (!lPaving || lPaving.visible) {
    builder.addQuadGrid(
      frames.map((_, i) => [
        cross.paveL[i],
        vLerp(cross.paveL[i], cross.curbTopL[i], 0.5),
        cross.curbTopL[i],
      ]),
      (r, c, pt) => [pt[0] * 0.5, pt[2] * 0.5],
      () => [MAT.PAVING_SIDEWALK, pavingIdNum, 0, entityId],
      false
    );
    builder.addQuadGrid(
      frames.map((_, i) => [
        cross.curbTopR[i],
        vLerp(cross.curbTopR[i], cross.paveR[i], 0.5),
        cross.paveR[i],
      ]),
      (r, c, pt) => [pt[0] * 0.5, pt[2] * 0.5],
      () => [MAT.PAVING_SIDEWALK, pavingIdNum, 0, entityId],
      false
    );
  }

  // 5. Structural Roadbed Tub Walls & Bottom
  builder.addQuadGrid(
    frames.map((_, i) => [cross.botL[i], cross.paveL[i]]),
    (r, c) => [frames[r].s * 0.3, c],
    () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
    false
  );
  builder.addQuadGrid(
    frames.map((_, i) => [cross.paveR[i], cross.botR[i]]),
    (r, c) => [frames[r].s * 0.3, c],
    () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
    false
  );

  // 6. Road Markings (Centerline, Lane Dividers, Edge Lines, Stop Bars, Crosswalks, Speed Bump Chevrons)
  if (!lFurniture || (lFurniture.visible && (lFurniture.params?.markingsEnabled ?? true))) {
    emitRoadMarkingsQuads(builder, run, cross);
  }
}

function emitRoadMarkingsQuads(builder, run, cross) {
  const { frames, carriageHalf, entityId } = cross;
  const n = frames.length;
  if (n < 2) return;
  const total = frames[n - 1].s;
  const lanes = run.spline.lanes || 2;
  const lift = 0.016;

  // Double yellow centerline or dashed white lane dividers
  for (let i = 0; i < n - 1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    const sMid = (f0.s + f1.s) * 0.5;

    // Skip markings inside active construction trench
    if (run.spline.construction?.enabled) {
      const c0 = (run.spline.construction.startS ?? 0.2) * total;
      const c1 = (run.spline.construction.endS ?? 0.45) * total;
      if (sMid >= c0 && sMid <= c1) continue;
    }

    // Center double yellow line
    const sep = 0.14;
    const w = 0.11;
    for (const sign of [-1, 1]) {
      const off = sign * sep;
      const p0L = vMad(f0.center, f0.left, off + w * 0.5);
      const p0R = vMad(f0.center, f0.left, off - w * 0.5);
      const p1L = vMad(f1.center, f1.left, off + w * 0.5);
      const p1R = vMad(f1.center, f1.left, off - w * 0.5);
      const crown = cross.halfW * 0.022 + lift;
      p0L[1] += crown;
      p0R[1] += crown;
      p1L[1] += crown;
      p1R[1] += crown;
      builder.addQuad(
        p0L,
        p1L,
        p1R,
        p0R,
        [f0.s * 0.2, 0],
        [f1.s * 0.2, 0],
        [f1.s * 0.2, 1],
        [f0.s * 0.2, 1],
        MAT.MARKING_YELLOW,
        0,
        0,
        entityId,
        [0, 1, 0]
      );
    }

    // Dashed lane dividers for 4+ lane roads
    if (lanes >= 4 && Math.floor(sMid / 3.2) % 2 === 0) {
      for (const side of [-1, 1]) {
        const laneOff = side * (carriageHalf * 0.5);
        const p0L = vMad(f0.center, f0.left, laneOff + 0.07);
        const p0R = vMad(f0.center, f0.left, laneOff - 0.07);
        const p1L = vMad(f1.center, f1.left, laneOff + 0.07);
        const p1R = vMad(f1.center, f1.left, laneOff - 0.07);
        const crown = cross.halfW * 0.022 * 0.75 + lift;
        p0L[1] += crown;
        p0R[1] += crown;
        p1L[1] += crown;
        p1R[1] += crown;
        builder.addQuad(
          p0L,
          p1L,
          p1R,
          p0R,
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          MAT.MARKING_WHITE,
          0,
          0,
          entityId,
          [0, 1, 0]
        );
      }
    }

    // Solid white outer edge lines
    for (const side of [-1, 1]) {
      const edgeOff = side * (carriageHalf - 0.22);
      const p0L = vMad(f0.center, f0.left, edgeOff + 0.06);
      const p0R = vMad(f0.center, f0.left, edgeOff - 0.06);
      const p1L = vMad(f1.center, f1.left, edgeOff + 0.06);
      const p1R = vMad(f1.center, f1.left, edgeOff - 0.06);
      p0L[1] += lift + 0.01;
      p0R[1] += lift + 0.01;
      p1L[1] += lift + 0.01;
      p1R[1] += lift + 0.01;
      builder.addQuad(
        p0L,
        p1L,
        p1R,
        p0R,
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        MAT.MARKING_WHITE,
        0,
        0,
        entityId,
        [0, 1, 0]
      );
    }
  }

  // Continental Zebra Crosswalks & Stop Bars at junction approaches
  const emitApproachCrosswalk = (atStart) => {
    const targetS = atStart ? 2.2 : total - 2.2;
    if (total < 10) return;
    let idx = atStart ? 1 : n - 2;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= targetS) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    const dir = atStart ? f.tangent : vScale(f.tangent, -1);
    const zebraLen = 2.6;
    const stripeW = 0.46;
    const gap = 0.44;
    for (let lat = -carriageHalf + 0.6; lat <= carriageHalf - 0.6; lat += stripeW + gap) {
      const c0 = vMad(f.center, f.left, lat);
      const c1 = vMad(c0, dir, zebraLen);
      const p00 = vMad(c0, f.left, -stripeW * 0.5);
      const p01 = vMad(c0, f.left, stripeW * 0.5);
      const p11 = vMad(c1, f.left, stripeW * 0.5);
      const p10 = vMad(c1, f.left, -stripeW * 0.5);
      p00[1] += 0.032;
      p01[1] += 0.032;
      p11[1] += 0.032;
      p10[1] += 0.032;
      builder.addQuad(p00, p10, p11, p01, [0, 0], [1, 0], [1, 1], [0, 1], MAT.MARKING_WHITE, 1, 0, entityId, [0, 1, 0]);
    }
    // Stop bar 1.4m behind crosswalk
    const sbCenter = vMad(f.center, dir, zebraLen + 1.1);
    const halfStop = carriageHalf - 0.3;
    const s0 = vMad(sbCenter, f.left, -halfStop);
    const s1 = vMad(sbCenter, f.left, 0);
    const s2 = vMad(s1, dir, 0.42);
    const s3 = vMad(s0, dir, 0.42);
    s0[1] += 0.032;
    s1[1] += 0.032;
    s2[1] += 0.032;
    s3[1] += 0.032;
    builder.addQuad(s0, s3, s2, s1, [0, 0], [1, 0], [1, 1], [0, 1], MAT.MARKING_WHITE, 2, 0, entityId, [0, 1, 0]);
  };

  if (run.trimStart) emitApproachCrosswalk(true);
  if (run.trimEnd) emitApproachCrosswalk(false);
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                        WATERTIGHT MERGED N-WAY INTERSECTION BUILDER (Y, T, +, STAR) — ALL-QUAD COONS PATCHES
// --------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Extracts the exact boundary cross-section leg from a trimmed road run's start or end station.
 * Notice that `tangent` points INTO the junction, `left` is CCW 90° from `tangent`,
 * and `roadL / roadR`, `curbTopL / curbTopR`, `paveL / paveR` are oriented facing INTO the junction
 * so every corner `i` transitions cleanly from `leg[i].roadR` to `leg[i+1].roadL`!
 */
export function extractJunctionLeg(run, cross, atStart) {
  const idx = atStart ? 0 : cross.frames.length - 1;
  const f = cross.frames[idx];

  // Tangent pointing INTO the junction
  const intoTangent = atStart ? vScale(f.tangent, -1) : [...f.tangent];
  const intoLeft = leftNormalXZ(intoTangent);

  // When atStart is true, the run's forward direction points AWAY from the junction,
  // so looking INTO the junction swaps Left and Right!
  const roadL = atStart ? cross.roadR[idx] : cross.roadL[idx];
  const roadR = atStart ? cross.roadL[idx] : cross.roadR[idx];
  const curbBotL = atStart ? cross.curbBotR[idx] : cross.curbBotL[idx];
  const curbBotR = atStart ? cross.curbBotL[idx] : cross.curbBotR[idx];
  const curbTopL = atStart ? cross.curbTopR[idx] : cross.curbTopL[idx];
  const curbTopR = atStart ? cross.curbTopL[idx] : cross.curbTopR[idx];
  const paveL = atStart ? cross.paveR[idx] : cross.paveL[idx];
  const paveR = atStart ? cross.paveL[idx] : cross.paveR[idx];
  const botL = atStart ? cross.botR[idx] : cross.botL[idx];
  const botR = atStart ? cross.botL[idx] : cross.botR[idx];

  // Also grab the full approach carriageway row oriented from Left (looking into junction) to Right (looking into junction)
  const rawRow = cross.roadGrid[idx];
  const approachRow = atStart ? [...rawRow].reverse() : [...rawRow];

  // Outward angle from junction center (for CCW sorting around Y-up)
  const outward = vScale(intoTangent, -1);
  // In XZ with Y-up, atan2(-z, x) increases CCW when viewed from +Y!
  const ccwAngle = Math.atan2(-outward[2], outward[0]);

  return {
    runId: run.id,
    splineId: run.spline.id,
    splineName: run.spline.name,
    atStart,
    point: [...f.center],
    tangent: intoTangent,
    left: intoLeft,
    ccwAngle,
    roadL: [...roadL],
    roadR: [...roadR],
    curbBotL: [...curbBotL],
    curbBotR: [...curbBotR],
    curbTopL: [...curbTopL],
    curbTopR: [...curbTopR],
    paveL: [...paveL],
    paveR: [...paveR],
    botL: [...botL],
    botR: [...botR],
    approachRow,
    pavingIdNum: cross.pavingIdNum,
  };
}

/**
 * Builds a single, watertight, all-quad merged N-way intersection mesh (Y, T, +, 5-way)
 * from the sorted approach legs.
 * - Zero overlapping faces!
 * - Shared boundary vertices with every approaching road span!
 * - Structured Coons bilinear quad patches radiating from the central hub point C!
 */
export function emitMergedJunctionQuads(builder, jGroup, legs, roadLayerMap, entityId = 500, junctionOverride = null) {
  if (!legs || legs.length < 2) return null;

  const lJunctions = roadLayerMap['layer-junctions'];
  const lCurbs = roadLayerMap['layer-curbs'];
  const lPaving = roadLayerMap['layer-paving'];

  const cornerRadius = junctionOverride?.cornerRadius ?? lJunctions?.params?.cornerRadius ?? 6.5;
  const rawSteps = junctionOverride?.filletSteps ?? lJunctions?.params?.filletSteps ?? 10;
  const halfSteps = clamp(Math.round(rawSteps * 0.5), 4, 10);
  const filletSteps = halfSteps * 2; // even number so midpoint split is exact

  // Sort legs CCW around the junction center when viewed from +Y
  const sorted = [...legs].sort((a, b) => a.ccwAngle - b.ccwAngle);
  const N = sorted.length;

  // Compute true junction center C (with slight crown elevation matching approaching roads)
  const C = [0, 0, 0];
  for (const leg of sorted) {
    C[0] += leg.point[0];
    C[1] += leg.point[1];
    C[2] += leg.point[2];
  }
  C[0] /= N;
  C[1] = C[1] / N + 0.14; // subtle central intersection crown
  C[2] /= N;

  // 1. Build corner fillet arcs between leg[i] (Right edge looking into junction) and leg[(i+1)%N] (Left edge looking into junction)
  const roadFillets = [];
  const curbBotFillets = [];
  const curbTopFillets = [];
  const paveFillets = [];
  const botFillets = [];

  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];

    const rf = filletBetweenEdgesXZ(cur.roadR, cur.tangent, nxt.roadL, nxt.tangent, cornerRadius, filletSteps);
    roadFillets.push(rf);

    const cbf = offsetCurvePinnedXZ(rf, cur.curbBotR, nxt.curbBotL);
    curbBotFillets.push(cbf);

    const ctf = offsetCurvePinnedXZ(rf, cur.curbTopR, nxt.curbTopL);
    curbTopFillets.push(ctf);

    const pf = offsetCurvePinnedXZ(ctf, cur.paveR, nxt.paveL);
    paveFillets.push(pf);

    const bf = offsetCurvePinnedXZ(pf, cur.botR, nxt.botL);
    botFillets.push(bf);
  }

  // 2. Build 2*N All-Quad Coons Patch Sectors for the Merged Intersection Carriageway!
  //    Each leg `cur` has its approach centerline point `cur.point`, its right road edge `cur.roadR`,
  //    and its left road edge `cur.roadL`.
  //    Sector `iA` spans between:
  //      - bottom (u: 0..1): leg[i] right half-approach from `cur.point` to `cur.roadR`
  //      - top    (u: 0..1): spoke from center `C` to fillet midpoint `M_i`
  //      - left   (v: 0..1): central spine spoke from `cur.point` to `C`
  //      - right  (v: 0..1): first half of corner fillet `rf[0 .. halfSteps]`
  //    Sector `iB` spans between:
  //      - bottom (u: 0..1): spoke from center `C` to fillet midpoint `M_i`
  //      - top    (u: 0..1): leg[i+1] left half-approach from `nxt.point` to `nxt.roadL`
  //      - left   (v: 0..1): central spine spoke from `C` to `nxt.point`
  //      - right  (v: 0..1): second half of corner fillet `rf[halfSteps .. filletSteps]`
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    const rf = roadFillets[i];
    const h1 = rf.slice(0, halfSteps + 1);
    const h2 = rf.slice(halfSteps);
    const midFilletPt = rf[halfSteps];

    const spokeCurToC = resamplePolyline([cur.point, C], halfSteps + 1);
    const spokeCToNxt = resamplePolyline([C, nxt.point], halfSteps + 1);
    const spokeCToMid = resamplePolyline([C, midFilletPt], halfSteps + 1);
    const legCurRight = resamplePolyline([cur.point, cur.roadR], halfSteps + 1);
    const legNxtLeft = resamplePolyline([nxt.point, nxt.roadL], halfSteps + 1);

    const patchA = coonsPatchGrid(legCurRight, spokeCToMid, spokeCurToC, h1, halfSteps, halfSteps);
    const patchB = coonsPatchGrid(spokeCToMid, legNxtLeft, spokeCToNxt, h2, halfSteps, halfSteps);

    builder.addQuadGrid(
      patchA,
      (r, c, pt) => [pt[0] * 0.22, pt[2] * 0.22],
      (r, c) => [MAT.ASPHALT, (r / halfSteps) * 0.8, 0.2, entityId],
      false
    );
    builder.addQuadGrid(
      patchB,
      (r, c, pt) => [pt[0] * 0.22, pt[2] * 0.22],
      (r, c) => [MAT.ASPHALT, (r / halfSteps) * 0.8, 0.2, entityId],
      false
    );

    // 3. Corner Gutter, Curb & ADA Tactile Dropped Curb Ramp Quads
    if (!lCurbs || lCurbs.visible) {
      // Gutter fillet
      builder.addQuadGrid(
        rf.map((p, k) => [p, curbBotFillets[i][k]]),
        (r, c) => [r * 0.3, c],
        () => [MAT.GUTTER, 0, 0, entityId],
        false
      );
      // Curb fillet (with tactile yellow ADA ramp in the middle of the corner!)
      const useRamps = lJunctions?.params?.curbRamps ?? true;
      builder.addQuadGrid(
        curbBotFillets[i].map((p, k) => [p, curbTopFillets[i][k]]),
        (r, c) => [r * 0.3, c],
        (r) => {
          const isMidCorner = useRamps && Math.abs(r - halfSteps) <= 2;
          return [isMidCorner ? MAT.TACTILE_YELLOW : MAT.CURB_GRANITE, 0, 0, entityId];
        },
        false
      );
    }

    // 4. Corner Sidewalk Paving Quads (pinned to approaching sidewalk edges)
    if (!lPaving || lPaving.visible) {
      const midPave = curbTopFillets[i].map((p, k) => vLerp(p, paveFillets[i][k], 0.5));
      builder.addQuadGrid(
        curbTopFillets[i].map((p, k) => [p, midPave[k], paveFillets[i][k]]),
        (r, c, pt) => [pt[0] * 0.5, pt[2] * 0.5],
        (r, c) => {
          const useRamps = lJunctions?.params?.curbRamps ?? true;
          const isTactilePad = useRamps && c === 0 && Math.abs(r - halfSteps) <= 2;
          return [
            isTactilePad ? MAT.TACTILE_YELLOW : MAT.PAVING_SIDEWALK,
            cur.pavingIdNum ?? 0,
            0,
            entityId,
          ];
        },
        false
      );
    }

    // 5. Outer Tub Side Wall around the corner
    builder.addQuadGrid(
      paveFillets[i].map((p, k) => [p, botFillets[i][k]]),
      (r, c) => [r * 0.3, c],
      () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
      false
    );
  }

  return {
    id: jGroup.id,
    center: C,
    topologyShape: jGroup.topologyShape,
    armCount: N,
    cornerRadius,
    filletSteps,
    paveFillets,
    curbTopFillets,
    roadFillets,
    sortedLegs: sorted,
    entityId,
  };
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                        CITY BLOCK PERIMETER PAVING PARCELS (EMPTY URBAN BLOCK INFRASTRUCTURE — NO BUILDINGS!)
// --------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Generates clean all-quad City Block Paving Parcels nested into the quadrants/sectors between intersecting roads.
 * Honors the user's explicit instruction: "[ u can generate city blocks; but not the buildings; paving too is important;
 * generate pavings and pavemnt designs ]".
 */
export function emitCityBlockParcels(builder, builtJunctions, roadLayerMap) {
  const lPaving = roadLayerMap['layer-paving'];
  if (lPaving && (!lPaving.visible || !(lPaving.params?.cityBlocksEnabled ?? true))) {
    return [];
  }

  const blockPatternId = getPavingIdNum(lPaving?.params?.blockPavingPattern || 'cobblestone');
  const treePitsOn = lPaving?.params?.treePits ?? true;
  const blocks = [];
  let blockSeq = 1;

  for (const jn of builtJunctions) {
    const N = jn.sortedLegs.length;
    for (let i = 0; i < N; i++) {
      const cur = jn.sortedLegs[i];
      const nxt = jn.sortedLegs[(i + 1) % N];
      const pf = jn.paveFillets[i];
      if (!pf || pf.length < 3) continue;

      // Extend outward along the two adjacent road sidewalk edges to form a paved urban plaza parcel
      const dirCurOut = vScale(cur.tangent, -1);
      const dirNxtOut = vScale(nxt.tangent, -1);
      const dot = dirCurOut[0] * dirNxtOut[0] + dirCurOut[2] * dirNxtOut[2];
      // Skip if angle between arms is > 155° (flat side of a T-junction)
      if (dot < -0.88) continue;

      const parcelDepth = 22.0;
      const pStart = pf[0];
      const pEnd = pf[pf.length - 1];
      const farCur = vMad(pStart, dirCurOut, parcelDepth);
      const farNxt = vMad(pEnd, dirNxtOut, parcelDepth);
      const biDir = vNormXZ(vAdd(dirCurOut, dirNxtOut), [1, 0, 1]);
      const farCorner = vMad(pf[Math.floor(pf.length / 2)], biDir, parcelDepth * 1.32);
      farCur[1] = pStart[1] - 0.02;
      farNxt[1] = pEnd[1] - 0.02;
      farCorner[1] = (pStart[1] + pEnd[1]) * 0.5 - 0.02;

      const uSeg = 8;
      const vSeg = 8;
      const leftEdge = resamplePolyline([pStart, farCur], vSeg + 1);
      const rightEdge = resamplePolyline([pEnd, farNxt], vSeg + 1);
      const backEdge = resamplePolyline([farCur, farCorner, farNxt], uSeg + 1);

      const blockGrid = coonsPatchGrid(pf, backEdge, leftEdge, rightEdge, uSeg, vSeg);
      const entityId = 800 + blockSeq;

      builder.addQuadGrid(
        blockGrid,
        (r, c, pt) => [pt[0] * 0.45, pt[2] * 0.45],
        (r, c) => [MAT.PAVING_BLOCK, blockPatternId, (r === 0 || r === uSeg || c === 0 || c === vSeg) ? 1 : 0, entityId],
        false
      );

      // Perimeter granite curbing & cast-iron tree-pit grates along the city block plaza (no buildings!)
      const centerPt = blockGrid[Math.floor(uSeg / 2)][Math.floor(vSeg / 2)];
      if (treePitsOn) {
        for (const [ru, rv] of [[2, 2], [uSeg - 2, 2], [Math.floor(uSeg / 2), vSeg - 2]]) {
          const tp = blockGrid[ru]?.[rv];
          if (tp) {
            // Recessed cast-iron tree-pit grate frame (empty infrastructure aperture)
            builder.addBox([tp[0], tp[1] + 0.015, tp[2]], 1.6, 0.03, 1.6, dirCurOut, MAT.STEEL_DARK, 3, 0, entityId);
            builder.addBox([tp[0], tp[1] + 0.025, tp[2]], 0.55, 0.03, 0.55, dirCurOut, MAT.POTHOLE_GRAVEL, 0, 0, entityId);
          }
        }
      }

      blocks.push({
        id: `city-block-${blockSeq++}`,
        name: `City Block Plaza ${blockSeq - 1} (${jn.id})`,
        center: centerPt,
        entityId,
      });
    }
  }

  return blocks;
}
