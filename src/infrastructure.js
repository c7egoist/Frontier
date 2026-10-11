// ============================================================================================================================================
//                                                             INFRASTRUCTURE.JS
// ============================================================================================================================================
// Procedural Quad-first 3D generators for:
//   - Bridges & Overpasses (Box-Girder, Arch, Cable-Stayed Pylons, Bearings, Piers, Abutments)
//   - Railways & Road-over-Rail Underpasses (Ballast, Sleepers, UIC60 Steel Rails, Catenary Masts, Underpass Portal)
//   - Underground Road Tunnels (Segmental Vault, Portal Wing-Walls, Jet Fans, Luminaires)
//   - Underground Subway System (Deep Bored Tube, Third-Rail Track, Underground Station Platform)
//   - 6 Guardrail/Railing Designs & 6 Bollard Designs
//   - Road Construction / Rebuilding Zone (Rebar Grid, Jersey Barriers, Cones, Barricades, Excavator & Road Roller)
//   - On-Street Parking Bays + EV Chargers, 4 Streetlight Designs, 3 Billboard Designs, and Traffic Signal Masts.

import {
  clamp,
  lerp,
  smoothstep,
  vAdd,
  vSub,
  vScale,
  vMad,
  vLerp,
  vLen,
  vNorm,
  vNormXZ,
  leftNormalXZ,
  sampleSplineNodes,
  arcLengths,
  pointAtArc,
} from './math.js';
import { MAT } from './model.js';

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  1. BRIDGES, OVERPASSES & CABLE-STAYED PYLONS
// --------------------------------------------------------------------------------------------------------------------------------------------

export function emitBridgeStructures(builder, run, cross, roadLayerMap, gradeSeparations = []) {
  const lBridges = roadLayerMap['layer-bridges'];
  if (lBridges && !lBridges.visible) return;

  const br = run.spline.bridge;
  const frames = cross.frames;
  if (!frames || frames.length < 3) return;
  const total = frames[frames.length - 1].s;

  // Determine elevated span range: either explicit bridge.enabled OR stations with center[1] > 1.2m
  const hasExplicitBridge = br && br.enabled;
  let maxElev = 0;
  for (const f of frames) {
    if (f.center[1] > maxElev) maxElev = f.center[1];
  }
  if (!hasExplicitBridge && maxElev < 1.2) return;

  const girderDepth = lBridges?.params?.girderDepth ?? 1.35;
  const pierSpacing = Math.max(12, br?.pierSpacing ?? lBridges?.params?.pierSpacing ?? 20);
  const pierRadius = lBridges?.params?.pierRadius ?? 0.82;
  const parapetH = lBridges?.params?.parapetHeight ?? 1.05;
  const usePylon = lBridges?.params?.cableStayedPylon ?? true;
  const entityId = cross.entityId;

  // 1. Continuous Box-Girder / I-Girder Web & Soffit Quads under the elevated road deck
  const soffitL = [];
  const soffitR = [];
  const webTopL = [];
  const webTopR = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const pL = cross.paveL[i];
    const pR = cross.paveR[i];
    const wTL = vLerp(pL, pR, 0.16);
    const wTR = vLerp(pL, pR, 0.84);
    wTL[1] = f.center[1] - 0.35;
    wTR[1] = f.center[1] - 0.35;
    const sL = vLerp(pL, pR, 0.24);
    const sR = vLerp(pL, pR, 0.76);
    sL[1] = f.center[1] - girderDepth;
    sR[1] = f.center[1] - girderDepth;
    webTopL.push(wTL);
    webTopR.push(wTR);
    soffitL.push(sL);
    soffitR.push(sR);
  }

  builder.addQuadGrid(
    frames.map((_, i) => [webTopL[i], soffitL[i], soffitR[i], webTopR[i]]),
    (r, c) => [frames[r].s * 0.2, c],
    () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
    false
  );

  // 2. Bridge Parapet / Tubular Balustrades along elevated sections
  for (let i = 0; i < frames.length - 1; i++) {
    if (frames[i].center[1] < 0.6 && frames[i + 1].center[1] < 0.6) continue;
    for (const side of ['L', 'R']) {
      const edge0 = side === 'L' ? cross.paveL[i] : cross.paveR[i];
      const edge1 = side === 'L' ? cross.paveL[i + 1] : cross.paveR[i + 1];
      const top0 = [edge0[0], edge0[1] + parapetH * 0.45, edge0[2]];
      const top1 = [edge1[0], edge1[1] + parapetH * 0.45, edge1[2]];
      builder.addQuad(edge0, edge1, top1, top0, [0, 0], [1, 0], [1, 1], [0, 1], MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
      // Upper steel rail
      const r0 = [edge0[0], edge0[1] + parapetH, edge0[2]];
      const r1 = [edge1[0], edge1[1] + parapetH, edge1[2]];
      const r0b = [edge0[0], edge0[1] + parapetH - 0.08, edge0[2]];
      const r1b = [edge1[0], edge1[1] + parapetH - 0.08, edge1[2]];
      builder.addQuad(r0b, r1b, r1, r0, [0, 0], [1, 0], [1, 1], [0, 1], MAT.STEEL_GALVANIZED, 0, 0, entityId);
    }
  }

  // 3. Parabolic Arch Ribs if bridge.type === 'arch'
  if (br?.type === 'arch') {
    const n = frames.length;
    for (const frac of [0.26, 0.74]) {
      for (let i = 0; i < n - 1; i++) {
        const u0 = i / (n - 1);
        const u1 = (i + 1) / (n - 1);
        const archY0 = Math.sin(u0 * Math.PI) * (maxElev + 1.8) - 1.5;
        const archY1 = Math.sin(u1 * Math.PI) * (maxElev + 1.8) - 1.5;
        const p0 = vLerp(cross.paveL[i], cross.paveR[i], frac);
        const p1 = vLerp(cross.paveL[i + 1], cross.paveR[i + 1], frac);
        p0[1] = archY0;
        p1[1] = archY1;
        const p0b = [p0[0], p0[1] - 0.65, p0[2]];
        const p1b = [p1[0], p1[1] - 0.65, p1[2]];
        builder.addQuad(p0b, p1b, p1, p0, [0, 0], [1, 0], [1, 1], [0, 1], MAT.STEEL_DARK, 0, 0, entityId);
      }
    }
  }

  // 4. Bridge Piers, Hammerhead Pier Caps, Elastomeric Bearings & Spread Footings
  //    Automatically skips placing piers inside any lower road clearance envelope!
  let highestIdx = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].center[1] > frames[highestIdx].center[1]) highestIdx = i;
  }

  for (let s = pierSpacing * 0.7; s < total - pierSpacing * 0.4; s += pierSpacing) {
    let idx = 0;
    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i + 1].s >= s) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    if (f.center[1] < 1.35) continue;

    // Check clearance against gradeSeparations
    const blocked = gradeSeparations.some(
      (gs) => Math.hypot(gs.position[0] - f.center[0], gs.position[2] - f.center[2]) < 9.5
    );
    if (blocked) continue;

    const spanW = cross.halfW * 1.55;
    const capY = f.center[1] - girderDepth - 0.35;
    // Hammerhead Pier Cap Box
    builder.addBox([f.center[0], capY, f.center[2]], spanW, 0.7, 1.45, f.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);

    // Elastomeric Bridge Bearings seated on the pier cap
    for (const bOff of [-spanW * 0.34, 0, spanW * 0.34]) {
      const bPos = vMad(f.center, f.left, bOff);
      builder.addBox([bPos[0], capY + 0.45, bPos[2]], 0.55, 0.22, 0.55, f.tangent, MAT.STEEL_DARK, 0, 0, entityId);
    }

    // Twin Reinforced Concrete Columns + Pile Cap Footings down to ground (Y = -0.4m)
    for (const colOff of [-spanW * 0.28, spanW * 0.28]) {
      const cPos = vMad(f.center, f.left, colOff);
      builder.addCylinder(
        [cPos[0], -0.4, cPos[2]],
        [cPos[0], capY - 0.3, cPos[2]],
        pierRadius * 1.08,
        pierRadius,
        8,
        MAT.CONCRETE_STRUCTURE,
        0,
        0,
        entityId
      );
      builder.addBox([cPos[0], -0.25, cPos[2]], pierRadius * 2.8, 0.45, pierRadius * 2.8, f.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    }
  }

  // 5. Signature A-Frame / H-Frame Cable-Stayed Pylon & Stay Cables at the bridge crest!
  if (usePylon && frames[highestIdx].center[1] >= 2.5) {
    const fCrest = frames[highestIdx];
    const pylonH = fCrest.center[1] + 15.5;
    const pylonSpan = cross.halfW + cross.paveL.length > 0 ? vLen(vSub(cross.paveL[highestIdx], cross.paveR[highestIdx])) * 0.54 : 8.5;
    const legL = vMad(fCrest.center, fCrest.left, pylonSpan);
    const legR = vMad(fCrest.center, fCrest.right, pylonSpan);
    const topL = [legL[0], pylonH, legL[2]];
    const topR = [legR[0], pylonH, legR[2]];

    builder.addCylinder([legL[0], -0.4, legL[2]], topL, 0.95, 0.68, 8, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    builder.addCylinder([legR[0], -0.4, legR[2]], topR, 0.95, 0.68, 8, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    // Upper crossbeam & aviation beacon lights
    const crossMid = [(topL[0] + topR[0]) * 0.5, pylonH - 2.2, (topL[2] + topR[2]) * 0.5];
    builder.addBox(crossMid, pylonSpan * 2.1, 1.1, 1.2, fCrest.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    builder.addBox([topL[0], pylonH + 0.35, topL[2]], 0.45, 0.45, 0.45, fCrest.tangent, MAT.EMISSIVE_RED, 0, 0, entityId);
    builder.addBox([topR[0], pylonH + 0.35, topR[2]], 0.45, 0.45, 0.45, fCrest.tangent, MAT.EMISSIVE_RED, 0, 0, entityId);

    // Harp Stay Cables radiating to the bridge deck edges
    const stepStride = Math.max(2, Math.floor(frames.length / 10));
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const deckIdx = clamp(highestIdx + k * stepStride, 1, frames.length - 2);
      if (frames[deckIdx].center[1] < 0.8) continue;
      const anchorH = pylonH - 1.2 - Math.abs(k) * 0.9;
      const aL = [legL[0], anchorH, legL[2]];
      const aR = [legR[0], anchorH, legR[2]];
      const dL = cross.paveL[deckIdx];
      const dR = cross.paveR[deckIdx];
      builder.addCylinder(aL, dL, 0.055, 0.055, 4, MAT.STEEL_GALVANIZED, 0, 0, entityId);
      builder.addCylinder(aR, dR, 0.055, 0.055, 4, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    }
  }
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                    2. UNDERPASSES, RAILWAYS, ROAD TUNNELS & SUBWAY NETWORK
// --------------------------------------------------------------------------------------------------------------------------------------------

export function emitRailwaysAndUnderpasses(builder, project, roadLayerMap) {
  const lRail = roadLayerMap['layer-rail-tunnel'];
  if (lRail && (!lRail.visible || !(lRail.params?.railwayEnabled ?? true))) {
    return [];
  }

  const gauge = lRail?.params?.railwayGauge ?? 1.435;
  const catenaryOn = lRail?.params?.catenaryMasts ?? true;
  const railwaysOut = [];
  let seq = 1;

  for (const rail of project.railways || []) {
    if (!rail.nodes || rail.nodes.length < 2) continue;
    const nodeObjs = rail.nodes.map((p) => ({ position: p }));
    const sm = sampleSplineNodes(nodeObjs, false, 48);
    if (sm.pts.length < 2) continue;

    const entityId = 1200 + seq++;
    const n = sm.pts.length;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const a = sm.pts[Math.max(0, i - 1)];
      const b = sm.pts[Math.min(n - 1, i + 1)];
      const t = vNorm(vSub(b, a), [1, 0, 0]);
      const left = leftNormalXZ(t);
      frames.push({ center: sm.pts[i], tangent: t, left, s: sm.lengths[i] });
    }

    // 1. Trapezoidal Crushed Granite Ballast Bed + Concrete Retaining Trench Walls
    const balTopL = [];
    const balTopR = [];
    const balBotL = [];
    const balBotR = [];
    const wallTopL = [];
    const wallTopR = [];

    for (let i = 0; i < n; i++) {
      const f = frames[i];
      balTopL.push(vMad(f.center, f.left, 2.3));
      balTopR.push(vMad(f.center, f.left, -2.3));
      const bL = vMad(f.center, f.left, 3.4);
      const bR = vMad(f.center, f.left, -3.4);
      bL[1] -= 0.55;
      bR[1] -= 0.55;
      balBotL.push(bL);
      balBotR.push(bR);

      // Depressed underpass retaining walls up to ground level (Y = 0)
      const wL = vMad(f.center, f.left, 3.6);
      const wR = vMad(f.center, f.left, -3.6);
      wL[1] = 0.25;
      wR[1] = 0.25;
      wallTopL.push(wL);
      wallTopR.push(wR);
    }

    builder.addQuadGrid(
      frames.map((_, i) => [balBotL[i], balTopL[i], balTopR[i], balBotR[i]]),
      (r, c) => [frames[r].s * 0.25, c],
      () => [MAT.RAIL_BALLAST, 0, 0, entityId],
      false
    );

    // Concrete retaining walls flanking the depressed railway cut
    builder.addQuadGrid(
      frames.map((_, i) => [wallTopL[i], balBotL[i]]),
      (r, c) => [frames[r].s * 0.2, c],
      () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
      false
    );
    builder.addQuadGrid(
      frames.map((_, i) => [balBotR[i], wallTopR[i]]),
      (r, c) => [frames[r].s * 0.2, c],
      () => [MAT.CONCRETE_STRUCTURE, 0, 0, entityId],
      false
    );

    // 2. Dual Track Steel UIC60 I-Rails (Twin Parallel Tracks: Northbound & Southbound)
    for (const trackOffset of [-1.1, 1.1]) {
      for (const railSide of [-gauge * 0.5, gauge * 0.5]) {
        const lat = trackOffset + railSide;
        const rTopL = [];
        const rTopR = [];
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          const pL = vMad(f.center, f.left, lat + 0.045);
          const pR = vMad(f.center, f.left, lat - 0.045);
          pL[1] += 0.18;
          pR[1] += 0.18;
          rTopL.push(pL);
          rTopR.push(pR);
        }
        builder.addQuadGrid(
          frames.map((_, i) => [rTopL[i], rTopR[i]]),
          (r, c) => [frames[r].s * 0.5, c],
          () => [MAT.RAIL_STEEL, 0, 0, entityId],
          false
        );
      }
    }

    // 3. Prestressed Concrete Sleepers / Ties every 1.2m
    const total = sm.total;
    for (let s = 0.8; s < total - 0.8; s += 1.25) {
      const pt = pointAtArc(sm.pts, sm.lengths, s);
      const t = frames[Math.min(n - 1, Math.floor((s / total) * n))].tangent;
      builder.addBox([pt[0], pt[1] + 0.06, pt[2]], 4.2, 0.14, 0.28, t, MAT.RAIL_SLEEPER, 0, 0, entityId);
    }

    // 4. Overhead Electrified Catenary Portals & Contact Wire
    if (catenaryOn) {
      for (let s = 12; s < total - 10; s += 24) {
        const pt = pointAtArc(sm.pts, sm.lengths, s);
        const f = frames[Math.min(n - 1, Math.floor((s / total) * n))];
        const mL = vMad(pt, f.left, 3.2);
        const mR = vMad(pt, f.left, -3.2);
        builder.addBox([mL[0], pt[1] + 2.6, mL[2]], 0.24, 5.2, 0.24, f.tangent, MAT.STEEL_GALVANIZED, 0, 0, entityId);
        builder.addBox([mR[0], pt[1] + 2.6, mR[2]], 0.24, 5.2, 0.24, f.tangent, MAT.STEEL_GALVANIZED, 0, 0, entityId);
        builder.addBox([pt[0], pt[1] + 5.0, pt[2]], 6.6, 0.22, 0.22, f.tangent, MAT.STEEL_GALVANIZED, 0, 0, entityId);
      }
    }

    // 5. Road-Over-Rail Underpass Portal Bridge at `rail.underpassAt`
    if (rail.underpassAt) {
      const up = rail.underpassAt;
      const fMid = frames[Math.floor(n / 2)];
      // Heavy concrete portal beams & safety parapets where the road bridges over the depressed railway trench
      builder.addBox([up[0] - 8.2, -0.35, up[2]], 1.2, 0.85, 8.2, fMid.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
      builder.addBox([up[0] + 8.2, -0.35, up[2]], 1.2, 0.85, 8.2, fMid.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
      // Portal clearance warning beam + amber tunnel portal lights
      builder.addBox([up[0] - 8.4, -0.8, up[2] - 3.3], 0.35, 0.35, 0.35, fMid.tangent, MAT.EMISSIVE_AMBER, 0, 0, entityId);
      builder.addBox([up[0] + 8.4, -0.8, up[2] + 3.3], 0.35, 0.35, 0.35, fMid.tangent, MAT.EMISSIVE_AMBER, 0, 0, entityId);
    }

    railwaysOut.push({
      id: rail.id,
      name: rail.name,
      frames,
      pts: sm.pts,
      lengths: sm.lengths,
      total: sm.total,
      entityId,
    });
  }

  return railwaysOut;
}

/**
 * Emits Bored Underground Road Tunnel Vault, Portal Retaining Walls, Jet Fans & Luminaires
 * for any road run whose spline has `tunnel.enabled === true`.
 */
export function emitRoadTunnels(builder, run, cross, roadLayerMap) {
  const lRail = roadLayerMap['layer-rail-tunnel'];
  if (lRail && (!lRail.visible || !(lRail.params?.roadTunnelEnabled ?? true))) return;
  const tun = run.spline.tunnel;
  if (!tun || !tun.enabled) return;

  const frames = cross.frames;
  if (frames.length < 4) return;
  const n = frames.length;
  const iStart = Math.max(1, Math.floor((tun.startT ?? 0.22) * (n - 1)));
  const iEnd = Math.min(n - 2, Math.ceil((tun.endT ?? 0.78) * (n - 1)));
  if (iEnd - iStart < 2) return;

  const cutaway = lRail?.params?.subwayCutaway ?? false;
  const jetFansOn = lRail?.params?.tunnelJetFans ?? true;
  const entityId = cross.entityId;
  const vaultRadius = cross.halfW + 2.8;
  const vaultHeight = 6.2;
  const archSteps = 10;

  // Build horseshoe concrete segmental tunnel vault grid over [iStart .. iEnd]
  const vaultGrid = [];
  for (let i = iStart; i <= iEnd; i++) {
    const f = frames[i];
    const ring = [];
    for (let a = 0; a <= archSteps; a++) {
      // If cutaway is enabled, open a longitudinal window at the top of the vault for interior inspection
      const frac = a / archSteps;
      const theta = frac * Math.PI; // 0 (Right base) to PI (Left base)
      const lx = -Math.cos(theta) * vaultRadius;
      const ly = Math.sin(theta) * vaultHeight;
      const pt = vMad(f.center, f.left, lx);
      pt[1] += ly - 0.15;
      ring.push(pt);
    }
    vaultGrid.push(ring);
  }

  if (!cutaway) {
    builder.addQuadGrid(
      vaultGrid,
      (r, c) => [r * 0.4, c * 0.25],
      () => [MAT.TUNNEL_LINING, 0, 0, entityId],
      false
    );
  } else {
    // Cutaway mode: render side walls up to 60% height so interior jet fans & traffic are clearly visible from above
    const leftWall = vaultGrid.map((ring) => ring.slice(0, 4));
    const rightWall = vaultGrid.map((ring) => ring.slice(archSteps - 3));
    builder.addQuadGrid(leftWall, (r, c) => [r * 0.4, c], () => [MAT.TUNNEL_LINING, 0, 0, entityId], false);
    builder.addQuadGrid(rightWall, (r, c) => [r * 0.4, c], () => [MAT.TUNNEL_LINING, 0, 0, entityId], false);
  }

  // Portal Headwalls at iStart and iEnd
  for (const pIdx of [iStart, iEnd]) {
    const f = frames[pIdx];
    const pL = vMad(f.center, f.left, vaultRadius + 0.6);
    const pR = vMad(f.center, f.right, vaultRadius + 0.6);
    builder.addBox([pL[0], f.center[1] + 2.6, pL[2]], 1.1, 5.6, 1.4, f.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    builder.addBox([pR[0], f.center[1] + 2.6, pR[2]], 1.1, 5.6, 1.4, f.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    builder.addBox([f.center[0], f.center[1] + vaultHeight + 0.3, f.center[2]], vaultRadius * 2.15, 1.2, 1.4, f.tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
  }

  // Overhead Twin Jet-Fan Ventilation Drums & Sodium/LED Tunnel Luminaires
  for (let i = iStart + 2; i < iEnd - 1; i += 4) {
    const f = frames[i];
    // Continuous wall luminaires
    for (const side of [-1, 1]) {
      const lPos = vMad(f.center, f.left, side * (vaultRadius * 0.76));
      lPos[1] += vaultHeight * 0.64;
      builder.addBox(lPos, 0.22, 0.18, 1.8, f.tangent, MAT.EMISSIVE_AMBER, 0, 0, entityId);
    }
    if (jetFansOn && i % 8 === 0) {
      for (const side of [-1.4, 1.4]) {
        const fanPos = vMad(f.center, f.left, side);
        fanPos[1] += vaultHeight - 0.85;
        const p0 = vMad(fanPos, f.tangent, -1.3);
        const p1 = vMad(fanPos, f.tangent, 1.3);
        builder.addCylinder(p0, p1, 0.52, 0.52, 8, MAT.STEEL_DARK, 0, 0, entityId);
      }
    }
  }
}

/**
 * Emits Deep-Level Underground Subway Tubes, Third-Rail Trackbed, and Underground Subway Station Platform!
 */
export function emitSubwayNetwork(builder, project, roadLayerMap) {
  const lRail = roadLayerMap['layer-rail-tunnel'];
  if (lRail && (!lRail.visible || !(lRail.params?.subwayEnabled ?? true))) {
    return [];
  }

  const depthOverride = lRail?.params?.subwayDepth ?? -6.8;
  const subwaysOut = [];
  let seq = 1;

  for (const sub of project.subways || []) {
    if (!sub.nodes || sub.nodes.length < 2) continue;
    const adjustedNodes = sub.nodes.map((p) => ({ position: [p[0], depthOverride, p[2]] }));
    const sm = sampleSplineNodes(adjustedNodes, false, 44);
    if (sm.pts.length < 2) continue;

    const entityId = 1300 + seq++;
    const n = sm.pts.length;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const a = sm.pts[Math.max(0, i - 1)];
      const b = sm.pts[Math.min(n - 1, i + 1)];
      const t = vNorm(vSub(b, a), [1, 0, 0]);
      const left = leftNormalXZ(t);
      frames.push({ center: sm.pts[i], tangent: t, left, s: sm.lengths[i] });
    }

    // 1. Concrete Subway Invert Track Slab + Lower Segmental Tube Cradle (open-top cutaway so subway is visible in 3D!)
    const tubeRadius = 4.2;
    const cradleGrid = [];
    const archSteps = 8;
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const ring = [];
      for (let a = 0; a <= archSteps; a++) {
        // Angle from -0.15*PI to +1.15*PI (cradle + side walls, leaving top observation aperture)
        const theta = lerp(-0.85 * Math.PI, -0.15 * Math.PI, a / archSteps);
        const lx = Math.cos(theta) * tubeRadius;
        const ly = Math.sin(theta) * 3.2 + 2.2;
        const pt = vMad(f.center, f.left, lx);
        pt[1] += ly;
        ring.push(pt);
      }
      cradleGrid.push(ring);
    }

    builder.addQuadGrid(
      cradleGrid,
      (r, c) => [frames[r].s * 0.25, c * 0.25],
      () => [MAT.SUBWAY_TUBE, 0, 0, entityId],
      false
    );

    // 2. Overhead Segmented Concrete Ring Ribs every 6m (visualizes full circular tunnel bore while keeping interior visible!)
    for (let i = 0; i < n; i += 3) {
      const f = frames[i];
      const lWall = vMad(f.center, f.left, tubeRadius * 0.88);
      const rWall = vMad(f.center, f.left, -tubeRadius * 0.88);
      builder.addBox([f.center[0], f.center[1] + 4.2, f.center[2]], tubeRadius * 1.9, 0.32, 0.45, f.tangent, MAT.SUBWAY_TUBE, 0, 0, entityId);
      builder.addBox([lWall[0], f.center[1] + 2.1, lWall[2]], 0.35, 4.2, 0.45, f.tangent, MAT.SUBWAY_TUBE, 0, 0, entityId);
      builder.addBox([rWall[0], f.center[1] + 2.1, rWall[2]], 0.35, 4.2, 0.45, f.tangent, MAT.SUBWAY_TUBE, 0, 0, entityId);
      // Cyan/White Subway Tunnel Guide Strip Lights
      builder.addBox([lWall[0], f.center[1] + 2.8, lWall[2]], 0.14, 0.14, 2.2, f.tangent, MAT.EMISSIVE_CYAN, 0, 0, entityId);
    }

    // 3. Subway Running Rails + Electrified Third Rail
    for (const rOff of [-0.72, 0.72, 1.25]) {
      const isThirdRail = rOff > 1.0;
      const lineL = [];
      const lineR = [];
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        const pL = vMad(f.center, f.left, rOff + 0.05);
        const pR = vMad(f.center, f.left, rOff - 0.05);
        pL[1] += isThirdRail ? 0.28 : 0.15;
        pR[1] += isThirdRail ? 0.28 : 0.15;
        lineL.push(pL);
        lineR.push(pR);
      }
      builder.addQuadGrid(
        frames.map((_, i) => [lineL[i], lineR[i]]),
        (r, c) => [frames[r].s * 0.5, c],
        () => [isThirdRail ? MAT.EMISSIVE_AMBER : MAT.RAIL_STEEL, 0, 0, entityId],
        false
      );
    }

    // 4. Underground Subway Station Platform at midpoint!
    const midIdx = Math.floor(n / 2);
    const fSt = frames[midIdx];
    const platCenter = vMad(fSt.center, fSt.left, -2.55);
    platCenter[1] += 0.95;
    builder.addBox(platCenter, 2.4, 1.1, 26.0, fSt.tangent, MAT.PAVING_SIDEWALK, 3, 0, entityId);
    // Yellow tactile platform edge safety strip
    const edgeCenter = vMad(fSt.center, fSt.left, -1.45);
    edgeCenter[1] += 1.51;
    builder.addBox(edgeCenter, 0.28, 0.04, 25.8, fSt.tangent, MAT.TACTILE_YELLOW, 0, 0, entityId);
    // Station columns & illuminated platform signage
    for (const zOff of [-9, -3, 3, 9]) {
      const colPos = vMad(platCenter, fSt.tangent, zOff);
      builder.addCylinder(
        [colPos[0], platCenter[1] + 0.5, colPos[2]],
        [colPos[0], platCenter[1] + 3.4, colPos[2]],
        0.26,
        0.26,
        8,
        MAT.STEEL_GALVANIZED,
        0,
        0,
        entityId
      );
      builder.addBox([colPos[0], platCenter[1] + 2.9, colPos[2]], 0.35, 0.22, 1.8, fSt.tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
    }

    subwaysOut.push({
      id: sub.id,
      name: sub.name,
      frames,
      pts: sm.pts,
      lengths: sm.lengths,
      total: sm.total,
      entityId,
    });
  }

  return subwaysOut;
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                    3. GUARDRAILS, RAILINGS (6 DESIGNS) & BOLLARDS (6 DESIGNS)
// --------------------------------------------------------------------------------------------------------------------------------------------

export function emitGuardrailsAndBollards(builder, run, cross, roadLayerMap) {
  const lBarriers = roadLayerMap['layer-barriers'];
  if (lBarriers && !lBarriers.visible) return;

  const frames = cross.frames;
  const n = frames.length;
  if (n < 3) return;
  const total = frames[n - 1].s;

  const railDesign = run.spline.guardrailDesign || lBarriers?.params?.guardrailDesign || 'w-beam';
  const railH = lBarriers?.params?.guardrailHeight ?? 0.78;
  const postSpacing = Math.max(1.8, lBarriers?.params?.postSpacing ?? 2.8);

  const bollardDesign = run.spline.bollardDesign || lBarriers?.params?.bollardDesign || 'heritage-bell';
  const bollardSpacing = Math.max(2.5, lBarriers?.params?.bollardSpacing ?? 4.5);
  const bollardH = lBarriers?.params?.bollardHeight ?? 0.92;
  const entityId = cross.entityId;

  // 1. Outer Guardrails / Railings along both outer sidewalk edges
  for (const side of ['L', 'R']) {
    const baseLine = side === 'L' ? cross.paveL : cross.paveR;
    const inwardSign = side === 'L' ? -1 : 1;

    if (railDesign === 'jersey') {
      // Continuous F-Shape Precast Concrete Jersey Barrier
      const bBotOut = [];
      const bBotIn = [];
      const bTopIn = [];
      const bTopOut = [];
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        const p = baseLine[i];
        const pIn = vMad(p, f.left, inwardSign * 0.42);
        const tOut = [p[0], p[1] + railH, p[2]];
        const tIn = vMad(tOut, f.left, inwardSign * 0.18);
        bBotOut.push(p);
        bBotIn.push(pIn);
        bTopIn.push(tIn);
        bTopOut.push(tOut);
      }
      builder.addQuadGrid(
        frames.map((_, i) => [bBotOut[i], bTopOut[i], bTopIn[i], bBotIn[i]]),
        (r, c) => [frames[r].s * 0.3, c],
        () => [MAT.CONCRETE_STRUCTURE, 1, 0, entityId],
        side === 'R'
      );
    } else if (railDesign === 'ornamental' || railDesign === 'tubular-bridge') {
      // Multi-Rail Balustrade + Vertical Posts
      const railHeights = railDesign === 'ornamental' ? [0.15, railH] : [0.28, railH * 0.62, railH];
      for (const rh of railHeights) {
        for (let i = 0; i < n - 1; i++) {
          const p0 = baseLine[i];
          const p1 = baseLine[i + 1];
          const a0 = [p0[0], p0[1] + rh, p0[2]];
          const a1 = [p1[0], p1[1] + rh, p1[2]];
          const b0 = [p0[0], p0[1] + rh + 0.06, p0[2]];
          const b1 = [p1[0], p1[1] + rh + 0.06, p1[2]];
          builder.addQuad(
            a0,
            a1,
            b1,
            b0,
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            railDesign === 'ornamental' ? MAT.STEEL_DARK : MAT.STEEL_GALVANIZED,
            0,
            0,
            entityId
          );
        }
      }
    } else if (railDesign === 'cable-barrier') {
      // 4 Tensioned Wire Ropes
      for (const rh of [0.32, 0.46, 0.60, 0.74]) {
        for (let i = 0; i < n - 1; i++) {
          const p0 = baseLine[i];
          const p1 = baseLine[i + 1];
          builder.addQuad(
            [p0[0], p0[1] + rh, p0[2]],
            [p1[0], p1[1] + rh, p1[2]],
            [p1[0], p1[1] + rh + 0.025, p1[2]],
            [p0[0], p0[1] + rh + 0.025, p0[2]],
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            MAT.STEEL_GALVANIZED,
            0,
            0,
            entityId
          );
        }
      }
    } else {
      // Corrugated W-Beam or Heavy Thrie-Beam Profile
      const beamWaves = railDesign === 'thrie-beam' ? 3 : 2;
      const beamH = railDesign === 'thrie-beam' ? 0.50 : 0.34;
      const prof = [];
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        const p = baseLine[i];
        const row = [];
        const steps = beamWaves * 2;
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const wave = Math.sin(u * beamWaves * Math.PI) * 0.09 * inwardSign;
          const pt = vMad(p, f.left, wave);
          pt[1] += railH - beamH + u * beamH;
          row.push(pt);
        }
        prof.push(row);
      }
      builder.addQuadGrid(
        prof,
        (r, c) => [frames[r].s * 0.4, c / (beamWaves * 2)],
        () => [MAT.STEEL_GALVANIZED, 0, 0, entityId],
        side === 'R'
      );
    }

    // Guardrail Support Posts along the alignment
    if (railDesign !== 'jersey') {
      for (let s = 1.6; s < total - 1.6; s += postSpacing) {
        let idx = 0;
        for (let i = 0; i < n - 1; i++) {
          if (frames[i + 1].s >= s) {
            idx = i;
            break;
          }
        }
        const f = frames[idx];
        const p = baseLine[idx];
        builder.addBox(
          [p[0], p[1] + railH * 0.5, p[2]],
          0.11,
          railH,
          0.11,
          f.tangent,
          railDesign === 'ornamental' ? MAT.STEEL_DARK : MAT.STEEL_GALVANIZED,
          0,
          0,
          entityId
        );
      }
    }
  }

  // 2. Curb-Side Bollards (6 Distinct Architectural & Security Designs!)
  for (let s = 3.2; s < total - 3.2; s += bollardSpacing) {
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= s) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    for (const side of ['L', 'R']) {
      const curbPt = side === 'L' ? cross.curbTopL[idx] : cross.curbTopR[idx];
      const pavePt = side === 'L' ? cross.paveL[idx] : cross.paveR[idx];
      const bPos = vLerp(curbPt, pavePt, 0.14);
      emitSingleBollard(builder, bPos, f.tangent, bollardDesign, bollardH, entityId);
    }
  }
}

export function emitSingleBollard(builder, basePos, tangent, design, h = 0.92, entityId = 100) {
  const x = basePos[0];
  const y = basePos[1];
  const z = basePos[2];

  if (design === 'heritage-bell') {
    // Victorian Cast-Iron Fluted Bell Base + Tapered Column + Domed Cap
    builder.addCylinder([x, y, z], [x, y + h * 0.28, z], 0.16, 0.11, 8, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.28, z], [x, y + h * 0.85, z], 0.105, 0.085, 8, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.85, z], [x, y + h, z], 0.10, 0.03, 8, MAT.STEEL_DARK, 0, 0, entityId);
  } else if (design === 'stainless-led') {
    // Brushed Stainless Cylinder + Cyan LED Halo Ring
    builder.addCylinder([x, y, z], [x, y + h * 0.82, z], 0.11, 0.11, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.82, z], [x, y + h * 0.92, z], 0.112, 0.112, 8, MAT.EMISSIVE_CYAN, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.92, z], [x, y + h, z], 0.11, 0.09, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
  } else if (design === 'retractable') {
    // Hydraulic Retractable Security Bollard + Foundation Plate + Amber LED Status Ring
    builder.addCylinder([x, y, z], [x, y + 0.03, z], 0.22, 0.21, 8, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addCylinder([x, y + 0.03, z], [x, y + h * 0.86, z], 0.135, 0.135, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.86, z], [x, y + h, z], 0.138, 0.12, 8, MAT.EMISSIVE_AMBER, 0, 0, entityId);
  } else if (design === 'concrete-wedge') {
    // Architectural Faceted Anti-Ram Wedge Block
    builder.addBox([x, y + h * 0.5, z], 0.34, h, 0.48, tangent, MAT.CONCRETE_STRUCTURE, 0, 0, entityId);
    builder.addBox([x, y + h + 0.03, z], 0.28, 0.06, 0.40, tangent, MAT.STEEL_DARK, 0, 0, entityId);
  } else if (design === 'solar-lantern') {
    // Dark Anodized Column + Glowing Polycarbonate Lantern Head
    builder.addBox([x, y + h * 0.38, z], 0.18, h * 0.76, 0.18, tangent, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addBox([x, y + h * 0.86, z], 0.16, h * 0.24, 0.16, tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
  } else {
    // High-Vis Orange Flexible Traffic Delineator Post + Dual White Reflective Collars
    builder.addCylinder([x, y, z], [x, y + h * 0.62, z], 0.065, 0.065, 6, MAT.CONSTRUCTION_ORANGE, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.62, z], [x, y + h * 0.74, z], 0.068, 0.068, 6, MAT.MARKING_WHITE, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.74, z], [x, y + h * 0.84, z], 0.065, 0.065, 6, MAT.CONSTRUCTION_ORANGE, 0, 0, entityId);
    builder.addCylinder([x, y + h * 0.84, z], [x, y + h * 0.94, z], 0.068, 0.068, 6, MAT.MARKING_WHITE, 0, 0, entityId);
  }
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                    4. ROAD CONSTRUCTION / REBUILDING ZONE (TRENCH REBAR, BARRIERS, CONES & EXCAVATOR/ROLLER)
// --------------------------------------------------------------------------------------------------------------------------------------------

export function emitConstructionZones(builder, run, cross, roadLayerMap) {
  const lDistress = roadLayerMap['layer-distress'];
  if (lDistress && (!lDistress.visible || !(lDistress.params?.constructionEnabled ?? true))) return;
  const con = run.spline.construction;
  if (!con || !con.enabled) return;

  const frames = cross.frames;
  const n = frames.length;
  if (n < 4) return;
  const total = frames[n - 1].s;
  const s0 = (con.startS ?? 0.2) * total;
  const s1 = (con.endS ?? 0.45) * total;
  if (s1 - s0 < 4.0) return;

  const sideSign = con.side === 'left' ? 1 : -1; // +1 = left of centerline, -1 = right of centerline
  const entityId = cross.entityId;

  // 1. Exposed Steel Rebar Mesh Grid inside the milled roadbed trench
  for (let s = s0 + 1.2; s <= s1 - 1.2; s += 1.6) {
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= s) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    const barCenter = vMad(f.center, f.left, sideSign * (cross.carriageHalf * 0.52));
    barCenter[1] -= 0.06;
    builder.addBox(barCenter, cross.carriageHalf * 0.82, 0.025, 0.04, f.tangent, MAT.STEEL_DARK, 0, 0, entityId);
  }

  // 2. Orange & White Jersey Safety Barriers + Reflective Traffic Cones + Flashing Amber Beacons along the lane closure
  let barrierIdx = 0;
  for (let s = s0 - 2.0; s <= s1 + 2.0; s += 2.4) {
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= clamp(s, 0, total)) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    // Taper at ends of construction zone
    const taper = smoothstep(s0 - 2.0, s0 + 1.5, s) * smoothstep(s1 + 2.0, s1 - 1.5, s);
    const lat = sideSign * lerp(cross.carriageHalf * 0.88, 0.35, taper);
    const pos = vMad(f.center, f.left, lat);

    if (s >= s0 && s <= s1) {
      // Alternating Orange/White Jersey Barrier
      const mat = barrierIdx++ % 2 === 0 ? MAT.CONSTRUCTION_ORANGE : MAT.MARKING_WHITE;
      builder.addBox([pos[0], pos[1] + 0.42, pos[2]], 0.48, 0.84, 2.1, f.tangent, mat, 0, 0, entityId);
      if (barrierIdx % 2 === 1) {
        builder.addBox([pos[0], pos[1] + 0.94, pos[2]], 0.18, 0.18, 0.18, f.tangent, MAT.EMISSIVE_AMBER, 0, 0, entityId);
      }
    } else if (lDistress?.params?.constructionCones ?? true) {
      // Taper Traffic Cones
      builder.addBox([pos[0], pos[1] + 0.03, pos[2]], 0.38, 0.05, 0.38, f.tangent, MAT.RUBBER_TIRE, 0, 0, entityId);
      builder.addCylinder([pos[0], pos[1] + 0.05, pos[2]], [pos[0], pos[1] + 0.52, pos[2]], 0.15, 0.07, 6, MAT.CONSTRUCTION_ORANGE, 0, 0, entityId);
      builder.addCylinder([pos[0], pos[1] + 0.52, pos[2]], [pos[0], pos[1] + 0.68, pos[2]], 0.07, 0.045, 6, MAT.MARKING_WHITE, 0, 0, entityId);
    }
  }

  // 3. Heavy Road-Rebuilding Machinery (Articulated Compactor Road-Roller & Mini-Excavator) inside the trench!
  if (lDistress?.params?.constructionMachinery ?? true) {
    const midS = (s0 + s1) * 0.5;
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= midS) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    const machPos = vMad(f.center, f.left, sideSign * (cross.carriageHalf * 0.48));
    machPos[1] -= 0.08;

    // Heavy Tandem Drum Road-Roller / Compactor
    const rFront = vMad(machPos, f.tangent, 1.45);
    const rBack = vMad(machPos, f.tangent, -1.45);
    const drumL = vMad(rFront, f.left, 0.85);
    const drumR = vMad(rFront, f.left, -0.85);
    builder.addCylinder([drumL[0], machPos[1] + 0.58, drumL[2]], [drumR[0], machPos[1] + 0.58, drumR[2]], 0.58, 0.58, 10, MAT.STEEL_DARK, 0, 0, entityId);
    const drumBL = vMad(rBack, f.left, 0.85);
    const drumBR = vMad(rBack, f.left, -0.85);
    builder.addCylinder([drumBL[0], machPos[1] + 0.58, drumBL[2]], [drumBR[0], machPos[1] + 0.58, drumBR[2]], 0.58, 0.58, 10, MAT.STEEL_DARK, 0, 0, entityId);
    // Yellow/Orange Chassis, Engine Hood, ROPS Cab & Beacon
    builder.addBox([machPos[0], machPos[1] + 1.05, machPos[2]], 1.65, 0.72, 3.4, f.tangent, MAT.MARKING_YELLOW, 0, 0, entityId);
    builder.addBox([machPos[0], machPos[1] + 1.85, machPos[2]], 1.35, 1.05, 1.45, f.tangent, MAT.VEHICLE_GLASS, 0, 0, entityId);
    builder.addBox([machPos[0], machPos[1] + 2.42, machPos[2]], 1.45, 0.12, 1.55, f.tangent, MAT.MARKING_YELLOW, 0, 0, entityId);
    builder.addBox([machPos[0], machPos[1] + 2.58, machPos[2]], 0.24, 0.22, 0.24, f.tangent, MAT.EMISSIVE_AMBER, 0, 0, entityId);
  }
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                    5. ON-STREET PARKING BAYS, STREETLIGHTS (4 DESIGNS), BILLBOARDS (3 DESIGNS) & TRAFFIC SIGNALS
// --------------------------------------------------------------------------------------------------------------------------------------------

export function emitStreetFurniture(builder, run, cross, roadLayerMap) {
  const lFurn = roadLayerMap['layer-furniture'];
  if (lFurn && !lFurn.visible) return;

  const frames = cross.frames;
  const n = frames.length;
  if (n < 4) return;
  const total = frames[n - 1].s;
  const entityId = cross.entityId;

  // 1. On-Street Parking Bays + Concrete Wheel-Stops + EV Charging Pedestals
  const parkingOn = (lFurn?.params?.parkingEnabled ?? true) && run.spline.parking && run.spline.parking !== 'none';
  if (parkingOn && total > 24) {
    const style = lFurn?.params?.parkingStyle || run.spline.parking || 'parallel';
    const bayStep = style === 'parallel' ? 6.4 : 3.2;
    for (let s = 10.0; s < total - 10.0; s += bayStep) {
      let idx = 0;
      for (let i = 0; i < n - 1; i++) {
        if (frames[i + 1].s >= s) {
          idx = i;
          break;
        }
      }
      const f = frames[idx];
      // White parking bay T-divider line on left side of roadway
      const bayCenter = vMad(f.center, f.left, cross.carriageHalf - 1.15);
      bayCenter[1] += 0.025;
      builder.addBox(bayCenter, 2.1, 0.02, 0.12, f.tangent, MAT.MARKING_WHITE, 0, 0, entityId);

      // Curbside EV Charger Pedestal every 2nd bay
      if (Math.round(s / bayStep) % 2 === 0) {
        const evPos = vLerp(cross.curbTopL[idx], cross.paveL[idx], 0.28);
        builder.addBox([evPos[0], evPos[1] + 0.68, evPos[2]], 0.28, 1.36, 0.36, f.tangent, MAT.STEEL_DARK, 0, 0, entityId);
        builder.addBox([evPos[0], evPos[1] + 1.05, evPos[2]], 0.30, 0.32, 0.24, f.tangent, MAT.EMISSIVE_CYAN, 0, 0, entityId);
      }
    }
  }

  // 2. Streetlights (4 Architectural Designs)
  const lightDesign = lFurn?.params?.streetlightDesign || 'cobrahead';
  const lightSpacing = Math.max(14, lFurn?.params?.streetlightSpacing ?? 24);
  for (let s = 8.0; s < total - 6.0; s += lightSpacing) {
    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (frames[i + 1].s >= s) {
        idx = i;
        break;
      }
    }
    const f = frames[idx];
    for (const side of ['L', 'R']) {
      const curbPt = side === 'L' ? cross.curbTopL[idx] : cross.curbTopR[idx];
      const pavePt = side === 'L' ? cross.paveL[idx] : cross.paveR[idx];
      const poleBase = vLerp(curbPt, pavePt, 0.72);
      const inwardDir = side === 'L' ? f.right : f.left;
      emitSingleStreetlight(builder, poleBase, inwardDir, f.tangent, lightDesign, entityId);
    }
  }

  // 3. Highway & Urban Billboards (3 Designs: Gantry Signbridge, Digital Monopole, Sidewalk Info Totem)
  if ((lFurn?.params?.billboardsEnabled ?? true) && total > 34) {
    const bbDesign = lFurn?.params?.billboardDesign || 'gantry';
    const midIdx = Math.floor(n * 0.62);
    const f = frames[midIdx];
    const pL = cross.paveL[midIdx];
    const pR = cross.paveR[midIdx];
    emitBillboardStructure(builder, f, pL, pR, bbDesign, entityId);
  }
}

function emitSingleStreetlight(builder, base, inwardDir, tangent, design, entityId) {
  const x = base[0];
  const y = base[1];
  const z = base[2];

  if (design === 'acorn-heritage') {
    const h = 4.8;
    builder.addCylinder([x, y, z], [x, y + h, z], 0.16, 0.09, 8, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addCylinder([x, y + h, z], [x, y + h + 0.68, z], 0.28, 0.18, 8, MAT.EMISSIVE_AMBER, 0, 0, entityId);
  } else if (design === 'architectural') {
    const h = 6.2;
    builder.addBox([x, y + h * 0.5, z], 0.22, h, 0.22, tangent, MAT.STEEL_DARK, 0, 0, entityId);
    const lamp = vMad([x, y + h - 0.3, z], inwardDir, 0.65);
    builder.addBox(lamp, 1.3, 0.14, 0.26, tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
  } else if (design === 'twin-mast') {
    const h = 8.4;
    builder.addCylinder([x, y, z], [x, y + h, z], 0.19, 0.11, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    const armL = vMad([x, y + h, z], inwardDir, 1.8);
    const armR = vMad([x, y + h, z], inwardDir, -1.2);
    builder.addCylinder([x, y + h - 0.3, z], armL, 0.07, 0.05, 6, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addCylinder([x, y + h - 0.3, z], armR, 0.07, 0.05, 6, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addBox(armL, 0.55, 0.14, 0.36, tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
    builder.addBox(armR, 0.55, 0.14, 0.36, tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
  } else {
    // Modern Cobrahead LED Outreach
    const h = 7.4;
    builder.addCylinder([x, y, z], [x, y + h, z], 0.17, 0.095, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    const tip = vMad([x, y + h + 0.35, z], inwardDir, 2.2);
    builder.addCylinder([x, y + h - 0.2, z], tip, 0.075, 0.055, 6, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addBox([tip[0], tip[1] - 0.06, tip[2]], 0.68, 0.14, 0.38, tangent, MAT.EMISSIVE_WHITE, 0, 0, entityId);
  }
}

function emitBillboardStructure(builder, frame, pL, pR, design, entityId) {
  const span = vLen(vSub(pL, pR));
  if (design === 'gantry') {
    // Full-Span Overhead Highway Signbridge Truss + Illuminated Sign Panels
    const h = 6.8;
    const colL = vMad(pL, frame.left, 0.45);
    const colR = vMad(pR, frame.right, 0.45);
    builder.addCylinder(colL, [colL[0], colL[1] + h, colL[2]], 0.28, 0.24, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    builder.addCylinder(colR, [colR[0], colR[1] + h, colR[2]], 0.28, 0.24, 8, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    const beamCenter = [(colL[0] + colR[0]) * 0.5, frame.center[1] + h - 0.4, (colL[2] + colR[2]) * 0.5];
    builder.addBox(beamCenter, span + 1.4, 0.65, 0.65, frame.tangent, MAT.STEEL_GALVANIZED, 0, 0, entityId);
    // Twin overhead LED directional highway signboards
    for (const off of [-span * 0.22, span * 0.22]) {
      const signPos = vMad(beamCenter, frame.left, off);
      builder.addBox([signPos[0], signPos[1] + 0.2, signPos[2]], span * 0.36, 2.35, 0.24, frame.tangent, MAT.BILLBOARD_SCREEN, 1, 0, entityId);
    }
  } else if (design === 'monopole') {
    // Large Roadside Digital Monopole Billboard
    const base = vMad(pL, frame.left, 2.2);
    const h = 9.5;
    builder.addCylinder(base, [base[0], base[1] + h, base[2]], 0.48, 0.38, 10, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addBox([base[0], base[1] + h + 1.8, base[2]], 7.6, 3.8, 0.55, frame.tangent, MAT.BILLBOARD_SCREEN, 2, 0, entityId);
    builder.addBox([base[0], base[1] + h + 1.8, base[2]], 7.9, 4.1, 0.42, frame.tangent, MAT.STEEL_DARK, 0, 0, entityId);
  } else {
    // Sidewalk Backlit Urban Totem
    const base = vLerp(pL, pR, 0.06);
    builder.addBox([base[0], base[1] + 1.55, base[2]], 0.32, 3.1, 1.35, frame.tangent, MAT.STEEL_DARK, 0, 0, entityId);
    builder.addBox([base[0], base[1] + 1.65, base[2]], 0.36, 2.4, 1.15, frame.tangent, MAT.BILLBOARD_SCREEN, 3, 0, entityId);
  }
}

/**
 * Emits Cantilevered Traffic Signal Masts with 3-Aspect LED Signal Heads at Merged Intersections!
 */
export function emitJunctionTrafficSignals(builder, builtJunctions, roadLayerMap) {
  const lJunctions = roadLayerMap['layer-junctions'];
  if (lJunctions && (!lJunctions.visible || !(lJunctions.params?.trafficSignals ?? true))) return;

  for (const jn of builtJunctions) {
    const N = jn.sortedLegs.length;
    for (let i = 0; i < N; i++) {
      const cf = jn.curbTopFillets[i];
      if (!cf || cf.length < 3) continue;
      const base = cf[Math.floor(cf.length * 0.35)];
      const leg = jn.sortedLegs[i];
      const h = 5.8;

      builder.addCylinder(base, [base[0], base[1] + h, base[2]], 0.18, 0.13, 8, MAT.STEEL_DARK, 0, 0, jn.entityId);
      const armTip = vMad([base[0], base[1] + h - 0.25, base[2]], leg.left, -3.8);
      builder.addCylinder([base[0], base[1] + h - 0.25, base[2]], armTip, 0.10, 0.07, 6, MAT.STEEL_DARK, 0, 0, jn.entityId);
      // Signal head housing + Red/Amber/Green LED aspects
      builder.addBox([armTip[0], armTip[1] - 0.35, armTip[2]], 0.36, 0.95, 0.28, leg.tangent, MAT.STEEL_DARK, 0, 0, jn.entityId);
      builder.addBox([armTip[0], armTip[1] - 0.08, armTip[2]], 0.22, 0.22, 0.32, leg.tangent, MAT.EMISSIVE_RED, 0, 0, jn.entityId);
      builder.addBox([armTip[0], armTip[1] - 0.35, armTip[2]], 0.22, 0.22, 0.32, leg.tangent, MAT.EMISSIVE_AMBER, 0, 0, jn.entityId);
      builder.addBox([armTip[0], armTip[1] - 0.62, armTip[2]], 0.22, 0.22, 0.32, leg.tangent, MAT.EMISSIVE_CYAN, 0, 0, jn.entityId);
    }
  }
}
