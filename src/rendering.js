export function pairVertexPacket(points) {
  if (points.length < 2) return new Float32Array();
  const packed = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    packed[index * 3] = point.x;
    packed[index * 3 + 1] = point.y;
    packed[index * 3 + 2] = point.z;
  });
  return packed;
}

export function lineVertexPacket(points, close = false) {
  if (points.length < 2) return new Float32Array();
  const vertices = [];
  for (let index = 1; index < points.length; index += 1) vertices.push(points[index - 1], points[index]);
  if (close) vertices.push(points[points.length - 1], points[0]);
  return pairVertexPacket(vertices);
}

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointInTriangle(point, a, b, c) {
  const first = cross2(a, b, point);
  const second = cross2(b, c, point);
  const third = cross2(c, a, point);
  const hasNegative = first < -0.000001 || second < -0.000001 || third < -0.000001;
  const hasPositive = first > 0.000001 || second > 0.000001 || third > 0.000001;
  return !(hasNegative && hasPositive);
}

function triangulatePolygon(points) {
  const vertices = points.slice();
  if (vertices.length > 3) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 0.000001) vertices.pop();
  }
  if (vertices.length < 3) return [];
  if (vertices.length === 3) return polygonSignedArea(vertices) < 0 ? [vertices[0], vertices[2], vertices[1]] : vertices;
  if (polygonSignedArea(vertices) < 0) vertices.reverse();
  let convex = true;
  for (let index = 0; index < vertices.length; index += 1) {
    if (cross2(vertices[index], vertices[(index + 1) % vertices.length], vertices[(index + 2) % vertices.length]) <= 0.000001) { convex = false; break; }
  }
  if (convex) {
    const fan = [];
    for (let index = 2; index < vertices.length; index += 1) fan.push(vertices[0], vertices[index - 1], vertices[index]);
    return fan;
  }
  const indices = Array.from({ length: vertices.length }, (_, index) => index);
  const triangles = [];
  let guard = vertices.length * vertices.length;
  while (indices.length > 3 && guard > 0) {
    let clipped = false;
    for (let index = 0; index < indices.length; index += 1) {
      const previous = indices[(index + indices.length - 1) % indices.length];
      const current = indices[index];
      const next = indices[(index + 1) % indices.length];
      const a = vertices[previous];
      const b = vertices[current];
      const c = vertices[next];
      if (cross2(a, b, c) <= 0.000001) continue;
      let containsVertex = false;
      for (const candidate of indices) {
        if (candidate === previous || candidate === current || candidate === next) continue;
        if (pointInTriangle(vertices[candidate], a, b, c)) { containsVertex = true; break; }
      }
      if (containsVertex) continue;
      triangles.push(a, b, c);
      indices.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
    guard -= 1;
  }
  if (indices.length === 3) triangles.push(vertices[indices[0]], vertices[indices[1]], vertices[indices[2]]);
  if (triangles.length < 3) {
    triangles.length = 0;
    for (let index = 2; index < vertices.length; index += 1) triangles.push(vertices[0], vertices[index - 1], vertices[index]);
  }
  return triangles;
}

export function triangleVertexPacket(points) {
  const triangles = triangulatePolygon(points);
  return triangles.length >= 3 ? pairVertexPacket(triangles) : new Float32Array();
}

export function polygonSignedArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function windingOrder(points) {
  return polygonSignedArea(points) >= 0 ? 'CCW' : 'CW';
}

export function ensureWinding(points, desired = 'CCW') {
  const ordered = points.slice();
  if (ordered.length > 2 && windingOrder(ordered) !== desired) ordered.reverse();
  return ordered;
}

export function isClosedForm(form) {
  return ['rectangle', 'circle', 'ellipse', 'polygon', 'slot', 'plane'].includes(form);
}
