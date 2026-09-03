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

export function triangleVertexPacket(points) {
  if (points.length < 3) return new Float32Array();
  const vertices = [points[0], points[1], points[2]];
  for (let index = 3; index < points.length; index += 1) vertices.push(points[0], points[index - 1], points[index]);
  return pairVertexPacket(vertices);
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
  return form === 'rectangle' || form === 'circle' || form === 'ellipse' || form === 'plane';
}
