/**
 * Frontier — roof assembler
 * -------------------------
 * spec → surfaces → tiled & framed parts → report.
 * This is the single entry point used by the browser viewer, the Node CLI/report
 * and the Blender bridge, so all three generate byte-identical geometry.
 */

import { Part, partArea, vsub, vlen } from './geom.js';
import { buildSurface } from './surface.js';
import { resolveTile, coverFace, buildTileSolid, buildMainRidge, buildHipRidges, buildVerge, buildEaveBoard, buildBargeboard, tileStats } from './tiles.js';
import {
  layerOffsets, buildBattens, buildDeck, buildUnderlayment, buildRafters,
  buildPurlins, buildRidgeBeam, buildPrimaryFrame, buildHipRafters, buildEaveLanterns,
  buildBuildingVolume,
} from './frame.js';
import { mergeSpec } from './spec.js';

/** Integrate the area of a roof face over its (m, a) domain. */
export function faceArea(surface, face, mSteps = 24, aSteps = 24) {
  const prof = face.profile;
  let area = 0;
  for (let i = 0; i < mSteps; i++) {
    const m0 = prof.arcInv((i / mSteps) * prof.arc(face.mMax));
    const m1 = prof.arcInv(((i + 1) / mSteps) * prof.arc(face.mMax));
    for (let j = 0; j < aSteps; j++) {
      const hw0 = surface.halfWidth(face, m0), hw1 = surface.halfWidth(face, m1);
      const a0 = -hw0 + (2 * hw0) * (j / aSteps), a1 = -hw0 + (2 * hw0) * ((j + 1) / aSteps);
      const b0 = -hw1 + (2 * hw1) * (j / aSteps), b1 = -hw1 + (2 * hw1) * ((j + 1) / aSteps);
      const A = surface.sample(face, m0, a0), B = surface.sample(face, m0, a1);
      const C = surface.sample(face, m1, b1), D = surface.sample(face, m1, b0);
      const u = vsub(B, A), v = vsub(D, A);
      const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2], cz = u[0] * v[1] - u[1] * v[0];
      area += 0.5 * Math.hypot(cx, cy, cz);
      const u2 = vsub(C, B), v2 = vsub(D, B);
      const dx = u2[1] * v2[2] - u2[2] * v2[1], dy = u2[2] * v2[0] - u2[0] * v2[2], dz = u2[0] * v2[1] - u2[1] * v2[0];
      area += 0.5 * Math.hypot(dx, dy, dz);
    }
  }
  return area;
}

export function buildRoof(userSpec = {}, opts = {}) {
  const spec = mergeSpec(userSpec);
  const tile = resolveTile(spec.tiles);
  const surface = buildSurface(spec);
  const offs = layerOffsets(spec, tile);
  const parts = [];
  const add = (id, material, layer) => {
    const p = new Part(id, layer ?? id, material);
    parts.push(p);
    return p;
  };
  const show = spec.show;
  const report = { tile: tileStats(tile), offsets: offs, faces: [], counts: {}, warnings: [] };

  // ── tiles 瓦 ───────────────────────────────────────────────────────────────
  const tilePart = add('tiles', 'tile');
  const eavePart = add('tiles.eave', 'tileEave');
  const layoutByFace = {};
  let nTiles = 0, nAdjusted = 0, laidArea = 0;
  for (const face of surface.faces) {
    if (!show.tiles) break;
    const res = coverFace(surface, face, tile, spec, {
      lengthSegments: opts.lengthSegments ?? 5,
      snowStopEvery: spec.tiles.snowStops ? (spec.tiles.snowStopEvery ?? 3) : 0,
      sink: (t) => (t.eave ? eavePart : tilePart),
    });
    const arcTop = face.arcMax ?? face.profile.arcTotal;
    for (const t of res.tiles) {
      nTiles++;
      if (t.adjusted) nAdjusted++;
      // clip each tile at the top of its own face: the top course is cut back under
      // the ridge, and full-slope panels (金属板) have no head lap at all
      const usable = Math.max(0, Math.min(tile.length, arcTop - face.profile.arc(t.m)));
      laidArea += usable * t.width;
    }
    layoutByFace[face.id] = res;
    report.faces.push({
      id: face.id, kind: face.kind, courses: res.courses.length, tiles: res.tiles.length,
      area: faceArea(surface, face),
      mMax: face.mMax, width: surface.halfWidth(face, 0) * 2,
      eaveWidth: surface.halfWidth(face, 0) * 2,
    });
  }

  // ── ridge / hip / verge / eave trim ───────────────────────────────────────
  if (show.ridge) {
    const p = add('ridge', 'ridge');
    report.ridgeInfo = buildMainRidge(p, surface, tile, spec);
  }
  if (show.hipRidge && surface.hasEnds) {
    const p = add('hipRidge', 'ridge');
    report.hips = buildHipRidges(p, surface, tile, spec);
  }
  if (show.verge) {
    const p = add('verge', 'tile');
    buildVerge(p, surface, tile, spec);
  }
  if (show.eaveBoard) {
    const p = add('eaveBoard', 'wood');
    buildEaveBoard(p, surface, tile, spec);
  }
  if (show.bargeboard) {
    const p = add('bargeboard', 'wood');
    report.bargeboards = buildBargeboard(p, surface, tile, spec);
  }

  // ── structure below ───────────────────────────────────────────────────────
  const layerCounts = {};
  if (show.battens && spec.frame.battens.enabled && show.tiles) {
    const p = add('battens', 'wood');
    const bat = buildBattens(p, surface, tile, spec, null);
    p.records = bat.records;
    layerCounts.battens = bat.count;
    report.battenPart = p;
  }
  if (show.deck && spec.frame.deck.enabled) {
    const p = add('deck', 'deck');
    layerCounts.deck = buildDeck(p, surface, spec, offs);
    report.deckPart = p;
  }
  if (show.underlayment && spec.frame.underlayment.enabled) {
    const p = add('underlay', 'underlayment');
    layerCounts.underlay = buildUnderlayment(p, surface, spec, offs);
  }
  if (show.rafters) {
    const p = add('rafters', 'wood');
    report.rafters = buildRafters(p, surface, spec, offs);
    layerCounts.rafters = report.rafters.length;
  }
  if (show.hipRafters && surface.hasEnds) {
    const p = add('hiprafters', 'woodDark');
    layerCounts.hipRafters = buildHipRafters(p, surface, spec, offs);
  }
  if (show.purlins && spec.frame.purlin.enabled) {
    const p = add('purlins', 'woodDark');
    report.purlins = buildPurlins(p, surface, spec, offs);
    layerCounts.purlins = report.purlins.length;
  }
  if (show.ridgeBeam && spec.frame.ridgeBeam.enabled) {
    const p = add('ridgebeam', 'woodDark');
    report.ridgeBeam = buildRidgeBeam(p, surface, spec, offs);
  }
  if (show.frame) {
    const p = add('frame', 'woodDark');
    report.primary = buildPrimaryFrame(p, surface, spec, offs, { postsToGround: spec.frame.post.toGround });
    layerCounts.eaveBeams = report.primary.eaveBeams.length;
    layerCounts.ties = report.primary.ties.length;
  }
  if (show.lanterns) {
    const p = add('lanterns', 'glow');
    layerCounts.lanterns = buildEaveLanterns(p, surface, spec);
  }
  if (show.volume) {
    const p = add('volume', 'volume');
    layerCounts.volume = buildBuildingVolume(p, surface, spec);
  }

  const roofArea = report.faces.reduce((s, f) => s + f.area, 0);
  report.counts = { ...layerCounts, tiles: nTiles, adjustedTiles: nAdjusted };
  report.totalRoofArea = roofArea;
  report.laidTileArea = laidArea;
  report.coverageFactor = roofArea > 0 ? laidArea / roofArea : 0;
  report.massEstimateKg = roofArea * (tile.massPerM2 ?? 50);
  report.surface = surface;
  report.tile = tileStats(tile);
  report.pitchDeg = surface.profile.pitchDeg;
  report.ridgeLength = surface.ridgeHalf * 2;
  report.hipRun = surface.hipRun;
  report.sweep = surface.sweep;

  return { spec, tile, surface, parts, report, layout: layoutByFace };
}
