// Resolution-independent 2D mask model.
// Authoritative data is a list of world-space capsule strokes (polylines with
// radius). The canvas is only a display raster — the mask can be rebuilt at
// ANY resolution, so the world is effectively infinite and zoom-independent.

let nextStrokeId = 1;

export function createStroke(points, radius, mode, layerId) {
  return { id: nextStrokeId++, points: points.map((p) => ({ x: p.x, y: p.y })), radius, mode, layerId };
}

// Distance from point p to segment ab
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Signed mask value at world point: >0 outside, <0 inside (SDF convention).
export function strokeSDF(stroke, x, y) {
  let d = Infinity;
  const pts = stroke.points;
  if (pts.length === 1) d = Math.hypot(x - pts[0].x, y - pts[0].y);
  else {
    for (let i = 0; i < pts.length - 1; i++) {
      d = Math.min(d, segDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
    }
  }
  return d - stroke.radius;
}

// Evaluate a full layer mask (union of add strokes, minus erase strokes) at a point.
export function layerMaskSDF(strokes, x, y) {
  let d = Infinity;
  for (const s of strokes) {
    if (s.mode === 'erase') continue;
    d = Math.min(d, strokeSDF(s, x, y));
  }
  for (const s of strokes) {
    if (s.mode !== 'erase') continue;
    d = Math.max(d, -strokeSDF(s, x, y)); // subtract
  }
  return d;
}

// Rasterize a layer's strokes into a Float32 buffer (display/preview use).
// Returns values in [-1,1] where <0 is inside the mask. Grid covers
// [originX, originX + size*cell] x [originY, originY + size*cell] (y down).
export function rasterizeLayer(strokes, size, originX, originY, cell, regionRect = null) {
  const buf = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = originX + (i + 0.5) * cell;
      const y = originY + (j + 0.5) * cell;
      let d = layerMaskSDF(strokes, x, y);
      if (regionRect) d = Math.max(d, rectSDF(regionRect, x, y));
      buf[j * size + i] = Math.max(-1, Math.min(1, d / (cell * 4)));
    }
  }
  return buf;
}

// Signed distance to an axis-aligned rect: negative inside, positive outside.
export function rectSDF(rect, x, y) {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  const outside = Math.hypot(dx, dy);
  if (outside > 0) return outside;
  const inside = Math.min(x - rect.x, rect.x + rect.w - x, y - rect.y, rect.y + rect.h - y);
  return -inside;
}

// Append a smoothed point to an in-progress stroke (distance filter).
export function appendPoint(stroke, x, y, minDist = 0.5) {
  const pts = stroke.points;
  const last = pts[pts.length - 1];
  if (!last || Math.hypot(x - last.x, y - last.y) >= minDist) {
    pts.push({ x, y });
    return true;
  }
  return false;
}
