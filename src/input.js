function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy, distance: Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) };
}

function rectangleCorners(record) {
  const x = record.origin.x;
  const y = record.origin.y;
  return [{ x, y }, { x: x + record.width, y }, { x: x + record.width, y: y + record.height }, { x, y: y + record.height }];
}

function cubicPoint(points, t) {
  const a = { x: points[0].x + (points[1].x - points[0].x) * t, y: points[0].y + (points[1].y - points[0].y) * t };
  const b = { x: points[1].x + (points[2].x - points[1].x) * t, y: points[1].y + (points[2].y - points[1].y) * t };
  const c = { x: points[2].x + (points[3].x - points[2].x) * t, y: points[2].y + (points[3].y - points[2].y) * t };
  const d = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  const e = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t };
  return { x: d.x + (e.x - d.x) * t, y: d.y + (e.y - d.y) * t };
}

function hermitePoint(record, t) {
  const p0 = record.start;
  const p1 = record.end;
  const m0 = { x: (record.tangentStart.x - p0.x) * 1.65, y: (record.tangentStart.y - p0.y) * 1.65 };
  const m1 = { x: (p1.x - record.tangentEnd.x) * 1.65, y: (p1.y - record.tangentEnd.y) * 1.65 };
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: (2 * t3 - 3 * t2 + 1) * p0.x + (t3 - 2 * t2 + t) * m0.x + (-2 * t3 + 3 * t2) * p1.x + (t3 - t2) * m1.x,
    y: (2 * t3 - 3 * t2 + 1) * p0.y + (t3 - 2 * t2 + t) * m0.y + (-2 * t3 + 3 * t2) * p1.y + (t3 - t2) * m1.y
  };
}

function catmullRomPoint(points, t) {
  if (points.length === 1) return points[0];
  if (points.length === 2) return { x: points[0].x + (points[1].x - points[0].x) * t, y: points[0].y + (points[1].y - points[0].y) * t };
  const scaled = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const segment = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - segment;
  const p0 = points[Math.max(0, segment - 1)];
  const p1 = points[segment];
  const p2 = points[segment + 1];
  const p3 = points[Math.min(points.length - 1, segment + 2)];
  const local2 = local * local;
  const local3 = local2 * local;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * local + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * local2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * local3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * local + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * local2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * local3)
  };
}

function continuousCurvePoints(points, count = 128) {
  if (points.length < 2) return points.slice();
  const sampled = [];
  for (let index = 0; index <= count; index += 1) sampled.push(catmullRomPoint(points, index / count));
  return sampled;
}

function sampleRecord(record, callback) {
  if (record.form === 'line' || record.form === 'polyline') return record.points.slice();
  if (record.form === 'rectangle') return rectangleCorners(record);
  if (record.form === 'circle' || record.form === 'ellipse') {
    const points = [];
    for (let index = 0; index <= 64; index += 1) {
      const angle = index / 64 * Math.PI * 2;
      const radiusX = record.form === 'circle' ? record.radius : record.radiusX;
      const radiusY = record.form === 'circle' ? record.radius : record.radiusY;
      points.push({
        x: record.center.x + Math.cos(angle) * radiusX,
        y: record.center.y + Math.sin(angle) * radiusY
      });
    }
    return points;
  }
  if (record.form === 'bezier' && record.points?.length === 4) {
    const points = [];
    for (let index = 0; index <= 128; index += 1) points.push(cubicPoint(record.points, index / 128));
    return points;
  }
  if (record.form === 'hermite' && !record.points?.length && record.start && record.end && record.tangentStart && record.tangentEnd) {
    const points = [];
    for (let index = 0; index <= 128; index += 1) points.push(hermitePoint(record, index / 128));
    return points;
  }
  if ((record.form === 'bezier' || record.form === 'hermite' || record.form === 'spline') && record.points?.length) {
    return continuousCurvePoints(record.points);
  }
  return callback ? callback(record) || [] : [];
}

function recordBounds(points) {
  if (!points.length) return null;
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function candidatePoints(record, samples) {
  const candidates = [];
  const points = samples(record);
  if (!points.length) return candidates;
  points.forEach(point => candidates.push({ point, label: 'point' }));
  for (let index = 1; index < points.length; index += 1) candidates.push({ point: midpoint(points[index - 1], points[index]), label: 'midpoint' });
  if (record.form === 'circle' || record.form === 'ellipse') candidates.push({ point: record.center, label: 'centre' });
  if (record.form === 'rectangle') {
    const corners = rectangleCorners(record);
    candidates.push({ point: midpoint(corners[0], corners[2]), label: 'centre' });
  }
  if (record.form === 'bezier' || record.form === 'spline') record.points.forEach(point => candidates.push({ point, label: 'control point' }));
  if (record.form === 'hermite') {
    const controls = record.points || [record.start, record.end, record.tangentStart, record.tangentEnd];
    controls.filter(Boolean).forEach(point => candidates.push({ point, label: 'control point' }));
  }
  return candidates;
}

function pointOnImportant(point, records, planes, threshold, samples) {
  let best = null;
  const consider = (candidate, distanceToPoint) => {
    if (distanceToPoint <= threshold && (!best || distanceToPoint < best.distance)) best = { point: candidate, distance: distanceToPoint, label: 'snap' };
  };
  records.forEach(record => {
    const candidates = candidatePoints(record, samples);
    candidates.forEach(candidate => consider(candidate.point, distance(point, candidate.point)));
    if (!['rectangle', 'circle', 'ellipse'].includes(record.form)) return;
    const bounds = recordBounds(samples(record));
    if (!bounds) return;
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    if (point.y >= bounds.minY - threshold && point.y <= bounds.maxY + threshold) consider({ x: centreX, y: point.y }, Math.abs(point.x - centreX));
    if (point.x >= bounds.minX - threshold && point.x <= bounds.maxX + threshold) consider({ x: point.x, y: centreY }, Math.abs(point.y - centreY));
  });
  planes.forEach(plane => {
    consider(plane.center, distance(point, plane.center));
  });
  return best;
}

function pointAlongGeometry(point, records, threshold, samples) {
  let best = null;
  records.forEach(record => {
    const points = samples(record);
    for (let index = 1; index < points.length; index += 1) {
      const hit = pointToSegment(point, points[index - 1], points[index]);
      if (hit.distance <= threshold && (!best || hit.distance < best.distance)) best = { point: { x: hit.x, y: hit.y }, distance: hit.distance, label: 'curve' };
    }
  });
  return best;
}

export function snapPoint(point, options = {}) {
  const records = options.records || [];
  const planes = options.planes || [];
  const threshold = options.threshold ?? 12;
  const samples = options.samples || (record => sampleRecord(record));
  if (options.altKey) {
    const along = pointAlongGeometry(point, records, threshold, samples);
    if (along) return along.point;
  }
  if (options.ctrlKey) {
    const important = pointOnImportant(point, records, planes, threshold, samples);
    if (important) return important.point;
  }
  if (options.grid) return { x: Math.round(point.x / options.gridSize) * options.gridSize, y: Math.round(point.y / options.gridSize) * options.gridSize };
  return point;
}

export function confirmDrawing({ activeTool, sketch, addPlane, finishPolyline, finishDrawing }) {
  if (activeTool === 'plane') {
    if (sketch.previewWorld) addPlane(sketch.previewWorld);
    else if (sketch.preview) addPlane(sketch.preview);
    return true;
  }
  if (activeTool === 'polyline') {
    if (sketch.preview && (!sketch.points.length || distance(sketch.points[sketch.points.length - 1], sketch.preview) > 0.01)) sketch.points.push(sketch.preview);
    sketch.preview = null;
    finishPolyline();
    return true;
  }
  const required = { line: 2, rectangle: 2, circle: 2, ellipse: 2, bezier: 2, hermite: 2, spline: 2 }[activeTool];
  if (!required) return false;
  const continuousCurve = ['bezier', 'hermite', 'spline'].includes(activeTool);
  if (sketch.preview && ((continuousCurve && (!sketch.points.length || distance(sketch.points[sketch.points.length - 1], sketch.preview) > 0.01)) || (!continuousCurve && sketch.points.length < required))) sketch.points.push(sketch.preview);
  if (sketch.points.length >= required) finishDrawing();
  return true;
}
