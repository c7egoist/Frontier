export function pairVertexPacket(points) {
  if (points.length < 2) return new Float32Array();
  const packed = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    packed[index * 3] = Number(point.x) || 0;
    packed[index * 3 + 1] = Number(point.y) || 0;
    packed[index * 3 + 2] = Number(point.z) || 0;
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

function coordinate(point, axis) {
  const value = Number(point?.[axis]);
  return Number.isFinite(value) ? value : 0;
}

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function signedArea2(vertices) {
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function pointInTriangle(point, a, b, c, tolerance) {
  const first = cross2(a, b, point);
  const second = cross2(b, c, point);
  const third = cross2(c, a, point);
  return first >= -tolerance && second >= -tolerance && third >= -tolerance;
}

function planarProjection(points) {
  // Newell's normal lets the same clipper handle 2D polygons and polygons
  // drawn on tilted or vertical 3D construction planes. Projecting onto the
  // dominant normal plane avoids the zero-area XY projection of vertical faces.
  const normal = { x: 0, y: 0, z: 0 };
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentX = coordinate(current, 'x');
    const currentY = coordinate(current, 'y');
    const currentZ = coordinate(current, 'z');
    const nextX = coordinate(next, 'x');
    const nextY = coordinate(next, 'y');
    const nextZ = coordinate(next, 'z');
    normal.x += (currentY - nextY) * (currentZ + nextZ);
    normal.y += (currentZ - nextZ) * (currentX + nextX);
    normal.z += (currentX - nextX) * (currentY + nextY);
  }
  const absolute = { x: Math.abs(normal.x), y: Math.abs(normal.y), z: Math.abs(normal.z) };
  const hasArea = absolute.x > 0.0000001 || absolute.y > 0.0000001 || absolute.z > 0.0000001;
  const dropAxis = !hasArea ? 'z' : (absolute.x >= absolute.y && absolute.x >= absolute.z
    ? 'x'
    : (absolute.y >= absolute.z ? 'y' : 'z'));
  if (dropAxis === 'x') return points.map(point => ({ point, x: coordinate(point, 'y'), y: coordinate(point, 'z') }));
  if (dropAxis === 'y') return points.map(point => ({ point, x: coordinate(point, 'x'), y: coordinate(point, 'z') }));
  return points.map(point => ({ point, x: coordinate(point, 'x'), y: coordinate(point, 'y') }));
}

function samePosition(a, b) {
  return Math.hypot(coordinate(a, 'x') - coordinate(b, 'x'), coordinate(a, 'y') - coordinate(b, 'y'), coordinate(a, 'z') - coordinate(b, 'z')) < 0.0000001;
}

function polygonTolerance(vertices) {
  const xs = vertices.map(vertex => vertex.x);
  const ys = vertices.map(vertex => vertex.y);
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  return Math.max(scale * scale * 1e-10, 1e-12);
}

function removeDegenerateVertices(points) {
  const cleaned = [];
  points.forEach(point => {
    if (!Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y))) return;
    if (!cleaned.length || !samePosition(cleaned[cleaned.length - 1], point)) cleaned.push(point);
  });
  if (cleaned.length > 1 && samePosition(cleaned[0], cleaned[cleaned.length - 1])) cleaned.pop();
  if (cleaned.length < 3) return [];

  let vertices = planarProjection(cleaned);
  let changed = true;
  while (changed && vertices.length > 3) {
    changed = false;
    const tolerance = polygonTolerance(vertices);
    for (let index = 0; index < vertices.length; index += 1) {
      const previous = vertices[(index + vertices.length - 1) % vertices.length];
      const current = vertices[index];
      const next = vertices[(index + 1) % vertices.length];
      if (Math.abs(cross2(previous, current, next)) <= tolerance) {
        vertices.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return vertices.map(vertex => vertex.point);
}

function pointOnSegment(point, a, b, tolerance) {
  if (Math.abs(cross2(a, b, point)) > tolerance) return false;
  return point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance
    && point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance;
}

function segmentsIntersect(a, b, c, d, tolerance) {
  const first = cross2(a, b, c);
  const second = cross2(a, b, d);
  const third = cross2(c, d, a);
  const fourth = cross2(c, d, b);
  const crosses = ((first > tolerance && second < -tolerance) || (first < -tolerance && second > tolerance))
    && ((third > tolerance && fourth < -tolerance) || (third < -tolerance && fourth > tolerance));
  if (crosses) return true;
  return (Math.abs(first) <= tolerance && pointOnSegment(c, a, b, tolerance))
    || (Math.abs(second) <= tolerance && pointOnSegment(d, a, b, tolerance))
    || (Math.abs(third) <= tolerance && pointOnSegment(a, c, d, tolerance))
    || (Math.abs(fourth) <= tolerance && pointOnSegment(b, c, d, tolerance));
}

function hasSelfIntersection(vertices, tolerance) {
  for (let first = 0; first < vertices.length; first += 1) {
    const firstNext = (first + 1) % vertices.length;
    for (let second = first + 1; second < vertices.length; second += 1) {
      const secondNext = (second + 1) % vertices.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(vertices[first], vertices[firstNext], vertices[second], vertices[secondNext], tolerance)) return true;
    }
  }
  return false;
}

export function triangulatePolygon(points) {
  const cleaned = removeDegenerateVertices(points);
  if (cleaned.length < 3) return [];

  let vertices = planarProjection(cleaned);
  const tolerance = polygonTolerance(vertices);
  const area = signedArea2(vertices);
  if (Math.abs(area) <= tolerance || hasSelfIntersection(vertices, tolerance)) return [];
  if (area < 0) vertices.reverse();

  const indices = Array.from({ length: vertices.length }, (_, index) => index);
  const triangles = [];
  let guard = vertices.length * vertices.length;
  while (indices.length > 3 && guard > 0) {
    let clipped = false;
    for (let index = 0; index < indices.length; index += 1) {
      const previousIndex = indices[(index + indices.length - 1) % indices.length];
      const currentIndex = indices[index];
      const nextIndex = indices[(index + 1) % indices.length];
      const previous = vertices[previousIndex];
      const current = vertices[currentIndex];
      const next = vertices[nextIndex];
      if (cross2(previous, current, next) <= tolerance) continue;

      const minX = Math.min(previous.x, current.x, next.x) - tolerance;
      const maxX = Math.max(previous.x, current.x, next.x) + tolerance;
      const minY = Math.min(previous.y, current.y, next.y) - tolerance;
      const maxY = Math.max(previous.y, current.y, next.y) + tolerance;
      let containsVertex = false;
      for (const candidateIndex of indices) {
        if (candidateIndex === previousIndex || candidateIndex === currentIndex || candidateIndex === nextIndex) continue;
        const candidate = vertices[candidateIndex];
        if (candidate.x < minX || candidate.x > maxX || candidate.y < minY || candidate.y > maxY) continue;
        if (pointInTriangle(candidate, previous, current, next, tolerance)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;

      triangles.push(previous.point, current.point, next.point);
      indices.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) return [];
    guard -= 1;
  }

  if (indices.length !== 3) return [];
  const last = vertices[indices[0]];
  const middle = vertices[indices[1]];
  const final = vertices[indices[2]];
  if (cross2(last, middle, final) <= tolerance) return [];
  triangles.push(last.point, middle.point, final.point);
  return triangles.length === (cleaned.length - 2) * 3 ? triangles : [];
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
  // A polyline is deliberately an open stroke; only these forms receive a face.
  return ['rectangle', 'circle', 'ellipse', 'polygon', 'slot', 'plane'].includes(form);
}
