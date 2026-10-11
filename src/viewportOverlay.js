// ============================================================================================================================================
//                                                           VIEWPORTOVERLAY.JS
// ============================================================================================================================================
// Renders:
//   1. Synchronized 2D Plan CAD View (left pane in Split View) showing road footprints, merged junction fillets,
//      city block parcels, railway/subway alignments, and interactive spline/junction handles.
//   2. 3D Viewport Interactive Overlay:
//      - Slate/Frontier 3D Translate Gizmo (X Red, Y Green, Z Blue axes + XZ plane quad + Center ring)
//        anchored directly on the selected Merged Intersection (moves the entire junction & all connected arms at once!)
//        or selected Spline Control Node, PLUS an interactive 3D Corner Fillet Radius Ring ('radius') for intersections.
//      - Coons Patch Topology Spoke visualization on the selected/hovered Merged Intersection.
//      - Clickable Junction Topology Pills ("4-Way +", "3-Way Y", "3-Way T") & Curve Drawing Preview.

import {
  clamp,
  vSub,
  vDist,
  vDistXZ,
  projectWorldToScreen,
  touchPlaneUnderRay,
  raySegmentDistance,
  pointSegXZ,
} from './math.js';

export const GIZMO_COLORS = {
  x: '#e03e3e',
  y: '#2ecc71',
  z: '#3498db',
  xz: '#ffb454',
  radius: '#6bc5d2',
  ring: '#f0f0f0',
};

/**
 * Moves an entire merged intersection (all connected road arms) by `newPos` in world space!
 * If any arm was formed by a curve crossing without an explicit node at `oldCenter`,
 * inserts a pinned node at the crossing so every connected road moves together as one unit.
 */
export function moveMergedJunction(project, builtJunction, newPos) {
  if (!builtJunction) return;
  const oldCenter = builtJunction.center;
  const delta = vSub(newPos, oldCenter);

  const movedNodeKeys = new Set();

  // 1. Move all anchored nodes
  for (const anchor of builtJunction.anchors || []) {
    const sp = (project.splines || []).find((s) => s.id === anchor.splineId);
    if (!sp) continue;
    const node = sp.nodes.find((n) => n.id === anchor.nodeId) || sp.nodes[anchor.index];
    if (node) {
      const key = `${sp.id}:${node.id}`;
      if (!movedNodeKeys.has(key)) {
        movedNodeKeys.add(key);
        node.position = [
          Math.round((node.position[0] + delta[0]) * 100) / 100,
          Math.round((node.position[1] + delta[1]) * 100) / 100,
          Math.round((node.position[2] + delta[2]) * 100) / 100,
        ];
      }
    }
  }

  // 2. Also check if any spline in sortedLegs has a node near oldCenter that wasn't in anchors, or needs a pinned crossing node
  for (const leg of builtJunction.sortedLegs || []) {
    const sp = (project.splines || []).find((s) => s.id === leg.splineId);
    if (!sp) continue;
    const alreadyMoved = sp.nodes.some((n) => movedNodeKeys.has(`${sp.id}:${n.id}`));
    if (alreadyMoved) continue;

    // Find closest node on this spline to oldCenter
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < sp.nodes.length; i++) {
      const d = vDistXZ(sp.nodes[i].position, oldCenter);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestD < 20.0) {
      const node = sp.nodes[bestIdx];
      movedNodeKeys.add(`${sp.id}:${node.id}`);
      node.position = [
        Math.round((node.position[0] + delta[0]) * 100) / 100,
        Math.round((node.position[1] + delta[1]) * 100) / 100,
        Math.round((node.position[2] + delta[2]) * 100) / 100,
      ];
    } else if (sp.nodes.length >= 2) {
      // Insert a control node at the crossing segment so dragging the junction bends the crossing spline cleanly
      let bestSeg = 0;
      let minSegDist = Infinity;
      for (let i = 0; i < sp.nodes.length - 1; i++) {
        const { dist } = pointSegXZ(oldCenter, sp.nodes[i].position, sp.nodes[i + 1].position);
        if (dist < minSegDist) {
          minSegDist = dist;
          bestSeg = i;
        }
      }
      const newNode = {
        id: `${sp.id}-jnode-${Date.now()}`,
        position: [
          Math.round(newPos[0] * 100) / 100,
          Math.round(newPos[1] * 100) / 100,
          Math.round(newPos[2] * 100) / 100,
        ],
      };
      sp.nodes.splice(bestSeg + 1, 0, newNode);
      movedNodeKeys.add(`${sp.id}:${newNode.id}`);
    }
  }
}

/**
 * Draws the 2D Plan View (if splitView is true) and the 3D Gizmo + Junction/Spline Handles on the overlay 2D canvas.
 */
export function drawViewportOverlay(ctx, width, height, state) {
  ctx.clearRect(0, 0, width, height);

  const split2D = !!state.splitView;
  const planW = split2D ? Math.floor(width * 0.44) : 0;
  const vpX = planW;
  const vpW = width - vpX;

  // 1. Draw 2D Plan CAD View on the left side when Split View is active
  if (split2D && planW > 80) {
    draw2DPlanPane(ctx, 0, 0, planW, height, state);
  }

  // 2. Draw 3D Overlay (Spline curves, Junction badges, Coons Patch Spokes, 3D Transform Gizmo, Active Draw Preview)
  if (state.renderer && state.renderer.lastViewProj) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(vpX, 0, vpW, height);
    ctx.clip();

    const vp = state.renderer.lastViewProj;
    const proj3D = (pt) => {
      const p = projectWorldToScreen(pt, vp, vpW, height);
      if (!p) return null;
      return { x: p.x + vpX, y: p.y, z: p.z, w: p.w };
    };

    // Draw Spline Control Polygons & Nodes
    for (const sp of state.project.splines || []) {
      const isSelectedSpline = state.selection?.kind === 'spline' && state.selection?.id === sp.id;
      for (let i = 0; i < sp.nodes.length; i++) {
        const n = sp.nodes[i];
        const scr = proj3D([n.position[0], n.position[1] + 0.35, n.position[2]]);
        if (!scr) continue;
        const isSelNode = state.selection?.kind === 'node' && state.selection?.id === n.id;

        ctx.beginPath();
        ctx.arc(scr.x, scr.y, isSelNode ? 6.5 : isSelectedSpline ? 5.0 : 3.8, 0, Math.PI * 2);
        ctx.fillStyle = isSelNode ? '#ffb454' : isSelectedSpline ? '#6bc5d2' : '#181818cc';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = isSelNode ? '#ffffff' : '#999999';
        ctx.stroke();
      }
    }

    // Draw Clickable Merged Intersection Badges ("4-Way +", "3-Way Y", "3-Way T") & Coons Patch Spokes
    for (const jn of state.builtNetwork?.builtJunctions || []) {
      const isSel = state.selection?.kind === 'junction' && state.selection?.id === jn.id;
      const isHov = state.hoveredJunctionId === jn.id;

      // When selected or hovered, draw the Coons Quad Patch seam spokes and fillet arcs in 3D!
      if (isSel || isHov) {
        drawJunctionCoonsOverlay3D(ctx, jn, proj3D, isSel);
      }

      const scr = proj3D([jn.center[0], jn.center[1] + 1.2, jn.center[2]]);
      if (!scr) continue;

      // Outer ring on the intersection center
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, isSel ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#ffb454' : isHov ? '#4a90e2' : '#161616dd';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isSel ? '#fff' : '#ffb454';
      ctx.stroke();

      // Label tag
      const label = `${jn.topologyShape} · ${jn.armCount} Arms`;
      ctx.font = '500 10px "DM Sans", sans-serif';
      const tw = ctx.measureText(label).width + 12;
      const bx = scr.x - tw * 0.5;
      const by = scr.y - 26;
      ctx.fillStyle = isSel ? '#ffb454ee' : '#121212dc';
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 17, 6);
      ctx.fill();
      ctx.strokeStyle = isSel ? '#ffffffaa' : '#ffffff22';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isSel ? '#111111' : '#e6e6e6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, scr.x, by + 8.5);
    }

    // Draw 3D Transform Gizmo on active Selection (Intersection or Spline Node)
    const gizmoTarget = getSelectedGizmoOrigin(state);
    if (gizmoTarget && !state.followActor) {
      draw3DGizmo(ctx, gizmoTarget, proj3D, state.camera.eye, state.activeGizmoPart);
    }

    // Draw Active Curve Drawing Preview when tool === 'draw'
    if (state.tool === 'draw' && state.drawHoverWorld) {
      const hScr = proj3D(state.drawHoverWorld);
      if (hScr) {
        ctx.beginPath();
        ctx.arc(hScr.x, hScr.y, state.drawSnapTarget ? 10 : 6, 0, Math.PI * 2);
        ctx.strokeStyle = state.drawSnapTarget ? '#34c759' : '#ffb454';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        if (state.activeDrawSplineId) {
          const sp = (state.project.splines || []).find((s) => s.id === state.activeDrawSplineId);
          const lastNode = sp?.nodes?.[sp.nodes.length - 1];
          if (lastNode) {
            const lastScr = proj3D(lastNode.position);
            if (lastScr) {
              ctx.beginPath();
              ctx.setLineDash([5, 4]);
              ctx.moveTo(lastScr.x, lastScr.y);
              ctx.lineTo(hScr.x, hScr.y);
              ctx.strokeStyle = '#ffb454';
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
        }
      }
    }

    ctx.restore();
  }
}

/**
 * Draws the N-way Coons Bilinear Quad Patch spokes (from hub C to each approach centerline and each corner fillet midpoint)
 * when a Merged Intersection is selected or hovered.
 */
function drawJunctionCoonsOverlay3D(ctx, jn, proj3D, isSelected) {
  const cScr = proj3D([jn.center[0], jn.center[1] + 0.15, jn.center[2]]);
  if (!cScr) return;

  ctx.save();
  // 1. Fillet boundary arcs
  for (const rf of jn.roadFillets || []) {
    ctx.beginPath();
    let started = false;
    for (const pt of rf) {
      const p = proj3D([pt[0], pt[1] + 0.12, pt[2]]);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.strokeStyle = isSelected ? '#ffb454cc' : '#4a90e2aa';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Spoke from C to fillet midpoint M_i
    const midPt = rf[Math.floor(rf.length / 2)];
    if (midPt) {
      const mScr = proj3D([midPt[0], midPt[1] + 0.12, midPt[2]]);
      if (mScr) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(cScr.x, cScr.y);
        ctx.lineTo(mScr.x, mScr.y);
        ctx.strokeStyle = '#6bc5d2aa';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // 2. Spokes from C to each leg approach centerline
  for (const leg of jn.sortedLegs || []) {
    const lScr = proj3D([leg.point[0], leg.point[1] + 0.12, leg.point[2]]);
    if (lScr) {
      ctx.beginPath();
      ctx.moveTo(cScr.x, cScr.y);
      ctx.lineTo(lScr.x, lScr.y);
      ctx.strokeStyle = '#ffb454aa';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function getSelectedGizmoOrigin(state) {
  if (!state.selection) return null;
  if (state.selection.kind === 'junction') {
    const jn = (state.builtNetwork?.builtJunctions || []).find((j) => j.id === state.selection.id);
    if (jn) return { kind: 'junction', id: jn.id, position: [...jn.center], junction: jn };
  }
  if (state.selection.kind === 'node') {
    for (const sp of state.project.splines || []) {
      const nd = sp.nodes.find((n) => n.id === state.selection.id);
      if (nd) return { kind: 'node', id: nd.id, splineId: sp.id, position: [...nd.position], node: nd };
    }
  }
  if (state.selection.kind === 'spline') {
    const sp = (state.project.splines || []).find((s) => s.id === state.selection.id);
    if (sp && sp.nodes.length > 0) {
      const midNode = sp.nodes[Math.floor(sp.nodes.length / 2)];
      return { kind: 'node', id: midNode.id, splineId: sp.id, position: [...midNode.position], node: midNode };
    }
  }
  return null;
}

export function getGizmoScale(origin, cameraEye) {
  const d = vDist(origin, cameraEye);
  return clamp(d * 0.14, 3.5, 22.0);
}

function draw3DGizmo(ctx, gizmoTarget, proj3D, cameraEye, activePart) {
  const origin = gizmoTarget.position;
  const c0 = proj3D(origin);
  if (!c0) return;

  const scale = getGizmoScale(origin, cameraEye);
  const pX = proj3D([origin[0] + scale, origin[1], origin[2]]);
  const pY = proj3D([origin[0], origin[1] + scale, origin[2]]);
  const pZ = proj3D([origin[0], origin[1], origin[2] + scale]);

  // If this is a Merged Intersection, draw the interactive 3D Corner Fillet Radius Ring ('radius')!
  if (gizmoTarget.kind === 'junction' && gizmoTarget.junction) {
    const rad = gizmoTarget.junction.cornerRadius ?? 6.5;
    const isRadHot = activePart === 'radius';
    ctx.beginPath();
    let started = false;
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const pt = [origin[0] + Math.cos(a) * rad, origin[1] + 0.18, origin[2] + Math.sin(a) * rad];
      const s = proj3D(pt);
      if (!s) continue;
      if (!started) {
        ctx.moveTo(s.x, s.y);
        started = true;
      } else {
        ctx.lineTo(s.x, s.y);
      }
    }
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = isRadHot ? '#ffffff' : GIZMO_COLORS.radius;
    ctx.lineWidth = isRadHot ? 2.6 : 1.7;
    ctx.stroke();
    ctx.setLineDash([]);

    // Radius handle knob at +45°
    const hAngle = Math.PI * 0.25;
    const hWorld = [
      origin[0] + Math.cos(hAngle) * rad,
      origin[1] + 0.18,
      origin[2] + Math.sin(hAngle) * rad,
    ];
    const hScr = proj3D(hWorld);
    if (hScr) {
      ctx.beginPath();
      ctx.arc(hScr.x, hScr.y, isRadHot ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isRadHot ? '#ffffff' : GIZMO_COLORS.radius;
      ctx.fill();
      ctx.font = '600 9.5px "DM Sans", sans-serif';
      ctx.fillStyle = GIZMO_COLORS.radius;
      ctx.fillText(`Fillet R=${rad.toFixed(1)}m`, hScr.x + 8, hScr.y + 3);
    }
  }

  // XZ Planar Drag Quad
  const q0 = proj3D([origin[0] + scale * 0.18, origin[1], origin[2] + scale * 0.18]);
  const q1 = proj3D([origin[0] + scale * 0.42, origin[1], origin[2] + scale * 0.18]);
  const q2 = proj3D([origin[0] + scale * 0.42, origin[1], origin[2] + scale * 0.42]);
  const q3 = proj3D([origin[0] + scale * 0.18, origin[1], origin[2] + scale * 0.42]);
  if (q0 && q1 && q2 && q3) {
    ctx.beginPath();
    ctx.moveTo(q0.x, q0.y);
    ctx.lineTo(q1.x, q1.y);
    ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(q3.x, q3.y);
    ctx.closePath();
    ctx.fillStyle = activePart === 'xz' ? '#ffb454aa' : '#ffb45444';
    ctx.fill();
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  const drawAxis = (endScr, color, label, partName) => {
    if (!endScr) return;
    const isHot = activePart === partName;
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(endScr.x, endScr.y);
    ctx.strokeStyle = isHot ? '#ffffff' : color;
    ctx.lineWidth = isHot ? 3.5 : 2.5;
    ctx.stroke();

    // Cone arrowhead
    const dx = endScr.x - c0.x;
    const dy = endScr.y - c0.y;
    const len = Math.hypot(dx, dy);
    if (len > 6) {
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      ctx.beginPath();
      ctx.moveTo(endScr.x + ux * 5, endScr.y + uy * 5);
      ctx.lineTo(endScr.x - ux * 8 + nx * 5, endScr.y - uy * 8 + ny * 5);
      ctx.lineTo(endScr.x - ux * 8 - nx * 5, endScr.y - uy * 8 - ny * 5);
      ctx.closePath();
      ctx.fillStyle = isHot ? '#ffffff' : color;
      ctx.fill();
    }

    ctx.font = '700 10px "DM Sans", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, endScr.x + 8, endScr.y + 3);
  };

  drawAxis(pX, GIZMO_COLORS.x, 'X', 'x');
  drawAxis(pY, GIZMO_COLORS.y, 'Y', 'y');
  drawAxis(pZ, GIZMO_COLORS.z, 'Z', 'z');

  // Center View-Plane Ring
  ctx.beginPath();
  ctx.arc(c0.x, c0.y, 11, 0, Math.PI * 2);
  ctx.strokeStyle = activePart === 'xz' ? '#ffb454' : GIZMO_COLORS.ring;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/**
 * Hit-tests the 3D Transform Gizmo under a camera ray.
 * Returns 'x' | 'y' | 'z' | 'xz' | 'radius' | null.
 */
export function hitTest3DGizmo(rayOrigin, rayDir, gizmoOrigin, cameraEye, gizmoTarget = null) {
  if (!gizmoOrigin) return null;
  const scale = getGizmoScale(gizmoOrigin, cameraEye);
  const tol = scale * 0.14;

  // Check center XZ plane ring / pad & Fillet Radius Ring
  const hitXZ = touchPlaneUnderRay([0, 1, 0], gizmoOrigin, rayOrigin, rayDir);
  if (hitXZ) {
    const dx = hitXZ[0] - gizmoOrigin[0];
    const dz = hitXZ[2] - gizmoOrigin[2];
    const distXZ = Math.hypot(dx, dz);
    if (distXZ < scale * 0.22) return 'xz';
    if (dx >= scale * 0.14 && dx <= scale * 0.46 && dz >= scale * 0.14 && dz <= scale * 0.46) return 'xz';

    if (gizmoTarget?.kind === 'junction' && gizmoTarget.junction) {
      const rad = gizmoTarget.junction.cornerRadius ?? 6.5;
      if (Math.abs(distXZ - rad) < Math.max(1.2, scale * 0.08)) {
        return 'radius';
      }
    }
  }

  const dX = raySegmentDistance(rayOrigin, rayDir, gizmoOrigin, [
    gizmoOrigin[0] + scale,
    gizmoOrigin[1],
    gizmoOrigin[2],
  ]);
  const dY = raySegmentDistance(rayOrigin, rayDir, gizmoOrigin, [
    gizmoOrigin[0],
    gizmoOrigin[1] + scale,
    gizmoOrigin[2],
  ]);
  const dZ = raySegmentDistance(rayOrigin, rayDir, gizmoOrigin, [
    gizmoOrigin[0],
    gizmoOrigin[1],
    gizmoOrigin[2] + scale,
  ]);

  const minD = Math.min(dX, dY, dZ);
  if (minD > tol) return null;
  if (minD === dX) return 'x';
  if (minD === dY) return 'y';
  return 'z';
}

/**
 * Renders the Synchronized 2D Plan CAD Viewport on the left side of the canvas when Split View is enabled.
 */
function draw2DPlanPane(ctx, x, y, w, h, state) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Dark CAD Drafting Background
  ctx.fillStyle = '#0d0e11';
  ctx.fillRect(x, y, w, h);

  const panX = state.planCamera?.panX ?? 0;
  const panZ = state.planCamera?.panZ ?? 0;
  const zoom = state.planCamera?.zoom ?? 2.35; // pixels per meter

  const worldToPlan = (wx, wz) => ({
    px: x + w * 0.5 + (wx - panX) * zoom,
    py: y + h * 0.5 + (wz - panZ) * zoom,
  });

  // 1. Metric CAD Grid (10m minor, 50m major)
  const step10 = 10 * zoom;
  if (step10 >= 8) {
    ctx.strokeStyle = '#181a20';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -250; gx <= 250; gx += 10) {
      const { px } = worldToPlan(gx, 0);
      if (px >= x && px <= x + w) {
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + h);
      }
    }
    for (let gz = -250; gz <= 250; gz += 10) {
      const { py } = worldToPlan(0, gz);
      if (py >= y && py <= y + h) {
        ctx.moveTo(x, py);
        ctx.lineTo(x + w, py);
      }
    }
    ctx.stroke();
  }

  // 2. City Block Parcels in 2D Plan
  for (const blk of state.builtNetwork?.cityBlocks || []) {
    const p = worldToPlan(blk.center[0], blk.center[2]);
    ctx.fillStyle = '#24221f88';
    ctx.beginPath();
    ctx.arc(p.px, p.py, 7 * zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Railway & Subway Corridors in 2D Plan
  for (const rl of state.builtNetwork?.railways || []) {
    ctx.beginPath();
    rl.pts.forEach((pt, idx) => {
      const p = worldToPlan(pt[0], pt[2]);
      if (idx === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.strokeStyle = '#b388ff88';
    ctx.lineWidth = Math.max(2, 3.2 * zoom);
    ctx.stroke();
  }

  // 4. Road Runs (Sidewalk Envelope + Carriageway + Centerline)
  for (const br of state.builtNetwork?.builtRuns || []) {
    const c = br.cross;
    if (c.paveL.length < 2) continue;

    // Sidewalk polygon
    ctx.beginPath();
    c.paveL.forEach((pt, idx) => {
      const p = worldToPlan(pt[0], pt[2]);
      if (idx === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    for (let idx = c.paveR.length - 1; idx >= 0; idx--) {
      const pt = c.paveR[idx];
      const p = worldToPlan(pt[0], pt[2]);
      ctx.lineTo(p.px, p.py);
    }
    ctx.closePath();
    ctx.fillStyle = '#383634';
    ctx.fill();

    // Carriageway polygon
    ctx.beginPath();
    c.roadL.forEach((pt, idx) => {
      const p = worldToPlan(pt[0], pt[2]);
      if (idx === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    for (let idx = c.roadR.length - 1; idx >= 0; idx--) {
      const pt = c.roadR[idx];
      const p = worldToPlan(pt[0], pt[2]);
      ctx.lineTo(p.px, p.py);
    }
    ctx.closePath();
    ctx.fillStyle = '#222428';
    ctx.fill();
    ctx.strokeStyle = '#60646c';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dashed yellow centerline
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    c.frames.forEach((f, idx) => {
      const p = worldToPlan(f.center[0], f.center[2]);
      if (idx === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.strokeStyle = '#d8b84a99';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 5. Merged Intersections (Watertight Fillet Boundary + Coons Hub Handle)
  for (const jn of state.builtNetwork?.builtJunctions || []) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < jn.roadFillets.length; i++) {
      for (const pt of jn.roadFillets[i]) {
        const p = worldToPlan(pt[0], pt[2]);
        if (!started) {
          ctx.moveTo(p.px, p.py);
          started = true;
        } else {
          ctx.lineTo(p.px, p.py);
        }
      }
    }
    ctx.closePath();
    const isSel = state.selection?.kind === 'junction' && state.selection?.id === jn.id;
    ctx.fillStyle = isSel ? '#3a3224' : '#25282e';
    ctx.fill();
    ctx.strokeStyle = isSel ? '#ffb454' : '#7a8290';
    ctx.lineWidth = isSel ? 2 : 1.2;
    ctx.stroke();

    // Central clickable handle in 2D Plan
    const cp = worldToPlan(jn.center[0], jn.center[2]);
    ctx.beginPath();
    ctx.arc(cp.px, cp.py, isSel ? 7 : 5.5, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? '#ffb454' : '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 6. Spline Control Nodes in 2D Plan
  for (const sp of state.project.splines || []) {
    for (const nd of sp.nodes) {
      const p = worldToPlan(nd.position[0], nd.position[2]);
      const isSel = state.selection?.kind === 'node' && state.selection?.id === nd.id;
      ctx.beginPath();
      ctx.rect(p.px - 4, p.py - 4, 8, 8);
      ctx.fillStyle = isSel ? '#ffb454' : '#dcdcdc';
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Header Badge for 2D Plan View
  ctx.fillStyle = '#141416dd';
  ctx.beginPath();
  ctx.roundRect(x + 12, y + 12, 198, 26, 7);
  ctx.fill();
  ctx.strokeStyle = '#ffffff18';
  ctx.stroke();
  ctx.font = '500 11px "DM Sans", sans-serif';
  ctx.fillStyle = '#d8d8d8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('2D ORTHO PLAN · CLICK/DRAG JOINTS', x + 22, y + 25);

  // Vertical Splitter Bar between 2D Plan and 3D WebGPU View
  ctx.fillStyle = '#2c2c30';
  ctx.fillRect(x + w - 2, y, 2, h);

  ctx.restore();
}
