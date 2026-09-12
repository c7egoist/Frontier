/*
 * Frontier Sketch kernel
 * ----------------------
 * A small, analytical 2D sketch kernel.  This deliberately stores points,
 * curves, and constraints — never tessellated polygons or viewport meshes.
 * Canvas samples are produced only at draw time by the UI.
 */

export const EPSILON = 1e-8;
const TAU = Math.PI * 2;

export class KernelError extends Error {
  constructor(message) { super(message); this.name = 'KernelError'; }
}

const finite = n => Number.isFinite(n);
const clone = value => JSON.parse(JSON.stringify(value));
const sq = n => n * n;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, n) => ({ x: a.x * n, y: a.y * n });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const normalize = v => {
  const n = Math.hypot(v.x, v.y);
  if (n < EPSILON) throw new KernelError('A non-zero direction is required.');
  return { x: v.x / n, y: v.y / n };
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const samePoint = (a, b) => dist(a, b) < EPSILON;
const normal = v => ({ x: -v.y, y: v.x });
const angle = (v) => Math.atan2(v.y, v.x);
const normAngle = a => ((a % TAU) + TAU) % TAU;

function lineIntersection(a, b, c, d, segmentOnly = true) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPSILON) return null;
  const ca = sub(c, a);
  const t = cross(ca, s) / denom;
  const u = cross(ca, r) / denom;
  if (segmentOnly && (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON)) return null;
  return { point: add(a, mul(r, t)), t, u };
}

function pointOnSegment(point, a, b, tolerance = EPSILON) {
  const ab = sub(b, a);
  const ap = sub(point, a);
  const length2 = dot(ab, ab);
  if (length2 < EPSILON) return dist(point, a) <= tolerance;
  const t = dot(ap, ab) / length2;
  return t >= -tolerance && t <= 1 + tolerance && Math.abs(cross(ab, ap)) <= tolerance * Math.sqrt(length2);
}

function deepCopySketch(sketch) {
  return clone(sketch);
}

/**
 * SketchKernel is intentionally independent from DOM, Canvas, WebGL, and
 * application state. IDs are stable strings; topology is represented by shared
 * point IDs and curves refer to those points by ID.
 */
export class SketchKernel {
  constructor(data = null) {
    this.sketch = data ? SketchKernel.normalise(data) : SketchKernel.empty();
    this.assertValid();
  }

  static empty() {
    return {
      schema: 'frontier-sketch/2',
      units: 'mm',
      name: 'Untitled sketch',
      pointSeq: 0,
      entitySeq: 0,
      constraintSeq: 0,
      points: [],
      entities: [],
      constraints: [],
      metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    };
  }

  static normalise(raw) {
    if (!raw || typeof raw !== 'object') throw new KernelError('The supplied sketch document is not an object.');
    const data = deepCopySketch(raw);
    if (data.schema !== 'frontier-sketch/2') throw new KernelError('Unsupported sketch format. Expected frontier-sketch/2.');
    data.units ||= 'mm';
    data.name ||= 'Untitled sketch';
    data.points ||= [];
    data.entities ||= [];
    data.constraints ||= [];
    data.metadata ||= {};
    data.pointSeq ||= 0;
    data.entitySeq ||= 0;
    data.constraintSeq ||= 0;
    for (const entity of data.entities) {
      entity.layer ||= 'Geometry';
      entity.construction = Boolean(entity.construction);
    }
    return data;
  }

  static fromJSON(json) {
    return new SketchKernel(typeof json === 'string' ? JSON.parse(json) : json);
  }

  toJSON(pretty = false) {
    this.sketch.metadata.updatedAt = new Date().toISOString();
    return JSON.stringify(this.sketch, null, pretty ? 2 : 0);
  }

  copy() { return new SketchKernel(deepCopySketch(this.sketch)); }
  snapshot() { return deepCopySketch(this.sketch); }
  restore(snapshot) { this.sketch = SketchKernel.normalise(snapshot); this.assertValid(); }

  _id(kind) {
    const key = kind === 'p' ? 'pointSeq' : kind === 'e' ? 'entitySeq' : 'constraintSeq';
    this.sketch[key] += 1;
    return `${kind}_${this.sketch[key]}`;
  }

  get points() { return this.sketch.points; }
  get entities() { return this.sketch.entities; }
  get constraints() { return this.sketch.constraints; }
  point(id) {
    const item = this.points.find(p => p.id === id);
    if (!item) throw new KernelError(`Point ${id} does not exist.`);
    return item;
  }
  entity(id) {
    const item = this.entities.find(e => e.id === id);
    if (!item) throw new KernelError(`Entity ${id} does not exist.`);
    return item;
  }
  constraint(id) {
    const item = this.constraints.find(c => c.id === id);
    if (!item) throw new KernelError(`Constraint ${id} does not exist.`);
    return item;
  }

  addPoint(x, y, options = {}) {
    if (!finite(x) || !finite(y)) throw new KernelError('Point coordinates must be finite numbers.');
    if (options.reuseTolerance != null) {
      const found = this.findPointNear({ x, y }, options.reuseTolerance);
      if (found) return found;
    }
    const point = { id: this._id('p'), x, y, fixed: Boolean(options.fixed) };
    this.points.push(point);
    return point;
  }

  findPointNear(position, tolerance) {
    let best = null;
    for (const point of this.points) {
      const d = dist(point, position);
      if (d <= tolerance && (!best || d < best.distance)) best = { ...point, distance: d };
    }
    return best;
  }

  addLine(a, b, options = {}) {
    const pa = this._coercePoint(a, options);
    const pb = this._coercePoint(b, options);
    if (pa.id === pb.id || dist(pa, pb) < EPSILON) throw new KernelError('A line needs two distinct endpoints.');
    return this._addEntity({ type: 'line', a: pa.id, b: pb.id, ...this._entityOptions(options) });
  }

  addCircle(center, radius, options = {}) {
    const c = this._coercePoint(center, options);
    if (!finite(radius) || radius <= EPSILON) throw new KernelError('Circle radius must be greater than zero.');
    return this._addEntity({ type: 'circle', center: c.id, radius, ...this._entityOptions(options) });
  }

  addArc(center, radius, startAngle, endAngle, clockwise = false, options = {}) {
    const c = this._coercePoint(center, options);
    if (!finite(radius) || radius <= EPSILON) throw new KernelError('Arc radius must be greater than zero.');
    if (![startAngle, endAngle].every(finite)) throw new KernelError('Arc angles must be finite.');
    return this._addEntity({
      type: 'arc', center: c.id, radius,
      startAngle: normAngle(startAngle), endAngle: normAngle(endAngle), clockwise: Boolean(clockwise),
      ...this._entityOptions(options),
    });
  }

  addRectangle(origin, opposite, options = {}) {
    const a = this._coercePoint(origin, options);
    const c = this._coercePoint(opposite, options);
    const pa = this.point(a.id), pc = this.point(c.id);
    if (Math.abs(pa.x - pc.x) < EPSILON || Math.abs(pa.y - pc.y) < EPSILON) throw new KernelError('A rectangle needs non-zero width and height.');
    const b = this.addPoint(pc.x, pa.y, options);
    const d = this.addPoint(pa.x, pc.y, options);
    const group = options.group || `rectangle-${this.sketch.entitySeq + 1}`;
    const lines = [
      this.addLine(a, b, { ...options, group }), this.addLine(b, c, { ...options, group }),
      this.addLine(c, d, { ...options, group }), this.addLine(d, a, { ...options, group }),
    ];
    for (const line of [lines[0], lines[2]]) this.addConstraint('horizontal', { entity: line.id });
    for (const line of [lines[1], lines[3]]) this.addConstraint('vertical', { entity: line.id });
    return lines;
  }

  addPolyline(points, closed = false, options = {}) {
    if (!Array.isArray(points) || points.length < (closed ? 3 : 2)) throw new KernelError('A polyline needs at least two points, or three when closed.');
    const vertices = points.map(p => this._coercePoint(p, options));
    const group = options.group || `polyline-${this.sketch.entitySeq + 1}`;
    const result = [];
    for (let i = 1; i < vertices.length; i++) result.push(this.addLine(vertices[i - 1], vertices[i], { ...options, group }));
    if (closed) result.push(this.addLine(vertices.at(-1), vertices[0], { ...options, group }));
    return result;
  }

  _coercePoint(value, options = {}) {
    if (typeof value === 'string') return this.point(value);
    if (value?.id && this.points.some(p => p.id === value.id)) return this.point(value.id);
    if (!value || !finite(value.x) || !finite(value.y)) throw new KernelError('Expected a point ID or an {x, y} point.');
    return this.addPoint(value.x, value.y, options);
  }

  _entityOptions(options) {
    return {
      name: options.name || '',
      layer: options.layer || 'Geometry',
      construction: Boolean(options.construction),
      group: options.group || null,
    };
  }

  _addEntity(payload) {
    const entity = { id: this._id('e'), ...payload };
    this.entities.push(entity);
    return entity;
  }

  entityPointIds(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    if (entity.type === 'line') return [entity.a, entity.b];
    return [entity.center];
  }

  entityPoints(entityOrId) { return this.entityPointIds(entityOrId).map(id => this.point(id)); }

  endpoints(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    if (entity.type !== 'line') throw new KernelError('Only line entities have editable endpoints.');
    return [this.point(entity.a), this.point(entity.b)];
  }

  pointUsers(pointId) {
    return this.entities.filter(entity => this.entityPointIds(entity).includes(pointId));
  }

  entitySample(entityOrId, segments = 32) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    if (entity.type === 'line') return this.endpoints(entity).map(p => ({ x: p.x, y: p.y }));
    const center = this.point(entity.center);
    const points = [];
    if (entity.type === 'circle') {
      for (let i = 0; i <= segments; i++) {
        const a = i / segments * TAU;
        points.push({ x: center.x + Math.cos(a) * entity.radius, y: center.y + Math.sin(a) * entity.radius });
      }
      return points;
    }
    const sweep = this.arcSweep(entity);
    for (let i = 0; i <= segments; i++) {
      const a = entity.startAngle + sweep * (i / segments);
      points.push({ x: center.x + Math.cos(a) * entity.radius, y: center.y + Math.sin(a) * entity.radius });
    }
    return points;
  }

  arcSweep(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    if (entity.type !== 'arc') throw new KernelError('Arc sweep is only defined for arcs.');
    const positive = normAngle(entity.endAngle - entity.startAngle);
    return entity.clockwise ? -(TAU - positive || TAU) : (positive || TAU);
  }

  lineLength(entityOrId) {
    const [a, b] = this.endpoints(entityOrId);
    return dist(a, b);
  }

  entityLength(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    if (entity.type === 'line') return this.lineLength(entity);
    if (entity.type === 'circle') return TAU * entity.radius;
    return Math.abs(this.arcSweep(entity)) * entity.radius;
  }

  bounds(entityIds = this.entities.map(e => e.id)) {
    const ids = new Set(entityIds);
    const samples = this.entities.filter(e => ids.has(e.id)).flatMap(e => this.entitySample(e, e.type === 'line' ? 1 : 48));
    if (!samples.length) return null;
    return samples.reduce((box, p) => ({
      minX: Math.min(box.minX, p.x), minY: Math.min(box.minY, p.y),
      maxX: Math.max(box.maxX, p.x), maxY: Math.max(box.maxY, p.y),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  nearest(position, tolerance) {
    const point = this.findPointNear(position, tolerance);
    let best = point ? { kind: 'point', id: point.id, distance: point.distance } : null;
    for (const entity of this.entities) {
      const hit = this._nearestEntity(entity, position);
      if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) best = { kind: 'entity', id: entity.id, ...hit };
    }
    return best;
  }

  _nearestEntity(entity, position) {
    if (entity.type === 'line') {
      const [a, b] = this.endpoints(entity);
      const ab = sub(b, a);
      const length2 = dot(ab, ab) || 1;
      const t = clamp(dot(sub(position, a), ab) / length2, 0, 1);
      const point = add(a, mul(ab, t));
      return { distance: dist(position, point), point, t };
    }
    const center = this.point(entity.center);
    const radial = sub(position, center);
    const r = Math.hypot(radial.x, radial.y);
    let candidateAngle = angle(radial);
    if (entity.type === 'arc' && !this.angleOnArc(entity, candidateAngle)) {
      const ends = this.arcEnds(entity);
      const endpoint = dist(position, ends[0]) < dist(position, ends[1]) ? ends[0] : ends[1];
      return { distance: dist(position, endpoint), point: endpoint, t: null };
    }
    const point = r < EPSILON ? { x: center.x + entity.radius, y: center.y } : add(center, mul(radial, entity.radius / r));
    return { distance: Math.abs(r - entity.radius), point, t: candidateAngle };
  }

  angleOnArc(entityOrId, value) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    const a = normAngle(value);
    const start = normAngle(entity.startAngle);
    const delta = entity.clockwise ? normAngle(start - a) : normAngle(a - start);
    return delta <= Math.abs(this.arcSweep(entity)) + EPSILON;
  }

  arcEnds(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entity(entityOrId) : entityOrId;
    const c = this.point(entity.center);
    return [
      { x: c.x + Math.cos(entity.startAngle) * entity.radius, y: c.y + Math.sin(entity.startAngle) * entity.radius },
      { x: c.x + Math.cos(entity.endAngle) * entity.radius, y: c.y + Math.sin(entity.endAngle) * entity.radius },
    ];
  }

  /** Move a topological vertex. Linked curves update because they share this point. */
  movePoint(pointId, position, solve = true) {
    const point = this.point(pointId);
    if (point.fixed) throw new KernelError('That point is fixed. Remove its Fix constraint first.');
    if (!finite(position.x) || !finite(position.y)) throw new KernelError('Point coordinates must be finite.');
    point.x = position.x; point.y = position.y;
    if (solve) this.solveConstraints();
  }

  /**
   * Separate selected curves from unselected neighbours before transforming.
   * This is the critical difference between a sketch operation and moving raw
   * screen polylines: a partial selection cannot silently drag an unselected
   * curve through a shared topological vertex.
   */
  detachSelection(entityIds) {
    const selected = new Set(entityIds);
    for (const entity of this.entities.filter(e => selected.has(e.id))) {
      for (const key of this._pointKeys(entity)) {
        const pointId = entity[key];
        const sharedWithUnselected = this.pointUsers(pointId).some(user => !selected.has(user.id));
        if (sharedWithUnselected) {
          const old = this.point(pointId);
          const copy = this.addPoint(old.x, old.y, { fixed: old.fixed });
          entity[key] = copy.id;
        }
      }
    }
  }

  translateEntities(entityIds, dx, dy, options = {}) {
    if (!finite(dx) || !finite(dy)) throw new KernelError('Translation must be finite.');
    const ids = [...new Set(entityIds)];
    if (options.detach !== false) this.detachSelection(ids);
    const pointIds = new Set(ids.flatMap(id => this.entityPointIds(id)));
    for (const id of pointIds) this.movePoint(id, add(this.point(id), { x: dx, y: dy }), false);
    this.solveConstraints();
  }

  scaleEntities(entityIds, pivot, factor, options = {}) {
    if (!finite(factor) || factor <= EPSILON) throw new KernelError('Scale must be greater than zero.');
    const ids = [...new Set(entityIds)];
    if (options.detach !== false) this.detachSelection(ids);
    const pointIds = new Set(ids.flatMap(id => this.entityPointIds(id)));
    for (const id of pointIds) {
      const p = this.point(id);
      this.movePoint(id, add(pivot, mul(sub(p, pivot), factor)), false);
    }
    for (const id of ids) {
      const entity = this.entity(id);
      if (entity.type === 'circle' || entity.type === 'arc') entity.radius *= factor;
    }
    this.solveConstraints();
  }

  rotateEntities(entityIds, pivot, radians, options = {}) {
    if (!finite(radians)) throw new KernelError('Rotation must be finite.');
    const ids = [...new Set(entityIds)];
    if (options.detach !== false) this.detachSelection(ids);
    const c = Math.cos(radians), s = Math.sin(radians);
    const pointIds = new Set(ids.flatMap(id => this.entityPointIds(id)));
    for (const id of pointIds) {
      const p = sub(this.point(id), pivot);
      this.movePoint(id, { x: pivot.x + p.x * c - p.y * s, y: pivot.y + p.x * s + p.y * c }, false);
    }
    for (const id of ids) {
      const entity = this.entity(id);
      if (entity.type === 'arc') {
        entity.startAngle = normAngle(entity.startAngle + radians);
        entity.endAngle = normAngle(entity.endAngle + radians);
      }
    }
    this.solveConstraints();
  }

  _pointKeys(entity) {
    return entity.type === 'line' ? ['a', 'b'] : ['center'];
  }

  deleteEntities(entityIds) {
    const removed = new Set(entityIds);
    this.sketch.entities = this.entities.filter(e => !removed.has(e.id));
    this.sketch.constraints = this.constraints.filter(c => {
      const refs = [c.entity, c.other, ...(c.entities || []), ...(c.points || [])].filter(Boolean);
      return !refs.some(ref => removed.has(ref));
    });
    this.pruneOrphanPoints();
  }

  deletePoints(pointIds) {
    const ids = new Set(pointIds);
    const entities = this.entities.filter(e => this.entityPointIds(e).some(id => ids.has(id))).map(e => e.id);
    this.deleteEntities(entities);
  }

  pruneOrphanPoints() {
    const used = new Set(this.entities.flatMap(e => this.entityPointIds(e)));
    this.sketch.points = this.points.filter(p => used.has(p.id));
    this.sketch.constraints = this.constraints.filter(c => !(c.points || []).some(id => !used.has(id)));
  }

  addConstraint(type, data = {}) {
    const allowed = ['horizontal', 'vertical', 'length', 'radius', 'equal', 'parallel', 'perpendicular', 'coincident', 'fixed'];
    if (!allowed.includes(type)) throw new KernelError(`Unknown constraint type: ${type}.`);
    const constraint = { id: this._id('c'), type, driving: data.driving !== false, ...clone(data) };
    delete constraint.id; constraint.id = `c_${this.sketch.constraintSeq}`;
    this._validateConstraint(constraint);
    this.constraints.push(constraint);
    this.solveConstraints();
    return constraint;
  }

  _validateConstraint(constraint) {
    const requireEntity = () => { if (!constraint.entity) throw new KernelError(`${constraint.type} requires an entity.`); this.entity(constraint.entity); };
    if (['horizontal', 'vertical', 'length', 'radius', 'fixed'].includes(constraint.type)) requireEntity();
    if (['equal', 'parallel', 'perpendicular'].includes(constraint.type)) { requireEntity(); if (!constraint.other) throw new KernelError(`${constraint.type} needs two entities.`); this.entity(constraint.other); }
    if (constraint.type === 'coincident') {
      if (!constraint.points || constraint.points.length !== 2) throw new KernelError('Coincident needs two point IDs.');
      constraint.points.forEach(id => this.point(id));
    }
    if (constraint.type === 'length' && (!finite(Number(constraint.value)) || Number(constraint.value) <= EPSILON)) throw new KernelError('Length value must be greater than zero.');
    if (constraint.type === 'radius' && (!finite(Number(constraint.value)) || Number(constraint.value) <= EPSILON)) throw new KernelError('Radius value must be greater than zero.');
  }

  removeConstraint(id) { this.sketch.constraints = this.constraints.filter(c => c.id !== id); }

  /** A predictable lightweight solver for the constraints supported by this UI. */
  solveConstraints(iterations = 12) {
    for (let pass = 0; pass < iterations; pass++) {
      let changed = false;
      for (const c of this.constraints) {
        if (!c.driving) continue;
        changed = this._solveOne(c) || changed;
      }
      if (!changed) break;
    }
    this.assertValid();
  }

  _solveOne(c) {
    const nudge = (point, x, y) => {
      if (point.fixed || (Math.abs(point.x - x) < EPSILON && Math.abs(point.y - y) < EPSILON)) return false;
      point.x = x; point.y = y; return true;
    };
    if (c.type === 'fixed') {
      const entity = this.entity(c.entity);
      for (const point of this.entityPoints(entity)) point.fixed = true;
      return false;
    }
    if (c.type === 'coincident') {
      const [a, b] = c.points.map(id => this.point(id));
      if (b.fixed) return false;
      return nudge(b, a.x, a.y);
    }
    const entity = this.entity(c.entity);
    if (c.type === 'horizontal' || c.type === 'vertical') {
      if (entity.type !== 'line') return false;
      const [a, b] = this.endpoints(entity);
      return c.type === 'horizontal' ? nudge(b, b.x, a.y) : nudge(b, a.x, b.y);
    }
    if (c.type === 'length') {
      if (entity.type !== 'line') return false;
      const [a, b] = this.endpoints(entity);
      const desired = Number(c.value);
      const direction = normalize(sub(b, a));
      return nudge(b, a.x + direction.x * desired, a.y + direction.y * desired);
    }
    if (c.type === 'radius') {
      if (!['circle', 'arc'].includes(entity.type)) return false;
      const value = Number(c.value);
      if (Math.abs(entity.radius - value) < EPSILON) return false;
      entity.radius = value; return true;
    }
    const other = this.entity(c.other);
    if (c.type === 'equal') {
      if (entity.type === 'line' && other.type === 'line') {
        const [a, b] = this.endpoints(other); const [c0, d] = this.endpoints(entity);
        const direction = normalize(sub(d, c0)); const length = dist(a, b);
        return nudge(d, c0.x + direction.x * length, c0.y + direction.y * length);
      }
      if (['circle', 'arc'].includes(entity.type) && ['circle', 'arc'].includes(other.type)) {
        if (Math.abs(entity.radius - other.radius) < EPSILON) return false;
        entity.radius = other.radius; return true;
      }
      return false;
    }
    if (c.type === 'parallel' || c.type === 'perpendicular') {
      if (entity.type !== 'line' || other.type !== 'line') return false;
      const [a, b] = this.endpoints(entity), [o0, o1] = this.endpoints(other);
      const source = normalize(sub(o1, o0));
      const direction = c.type === 'parallel' ? source : normal(source);
      const length = dist(a, b);
      return nudge(b, a.x + direction.x * length, a.y + direction.y * length);
    }
    return false;
  }

  updateConstraintValue(id, value) {
    const c = this.constraint(id);
    if (!['length', 'radius'].includes(c.type)) throw new KernelError('Only dimensional constraints have editable values.');
    if (!finite(Number(value)) || Number(value) <= EPSILON) throw new KernelError('Dimension must be a positive number.');
    c.value = Number(value); this.solveConstraints();
  }

  replaceLineEndpoint(lineId, oldPointId, position) {
    const line = this.entity(lineId);
    if (line.type !== 'line' || (line.a !== oldPointId && line.b !== oldPointId)) throw new KernelError('The specified point is not an endpoint of the line.');
    const point = this.addPoint(position.x, position.y);
    if (line.a === oldPointId) line.a = point.id; else line.b = point.id;
    return point;
  }

  /** Trim a selected line at the closest usable crossing on the clicked side. */
  trimLine(lineId, clicked) {
    const line = this.entity(lineId);
    if (line.type !== 'line') throw new KernelError('Trim currently operates on line segments.');
    const [a, b] = this.endpoints(line);
    const ab = sub(b, a);
    const clickT = clamp(dot(sub(clicked, a), ab) / dot(ab, ab), 0, 1);
    const crossings = this.entities
      .filter(other => other.type === 'line' && other.id !== line.id)
      .map(other => lineIntersection(a, b, ...this.endpoints(other), true))
      .filter(Boolean)
      .filter(hit => hit.t > EPSILON && hit.t < 1 - EPSILON)
      .sort((u, v) => Math.abs(u.t - clickT) - Math.abs(v.t - clickT));
    const hit = crossings[0];
    if (!hit) throw new KernelError('Trim needs a crossing line segment.');
    // Preserve the farther side of the line; the clicked side is removed.
    const endpoint = clickT < hit.t ? line.a : line.b;
    this.replaceLineEndpoint(line.id, endpoint, hit.point);
    this.pruneOrphanPoints(); this.solveConstraints();
    return hit.point;
  }

  chamfer(lineAId, lineBId, setback) {
    if (!finite(setback) || setback <= EPSILON) throw new KernelError('Chamfer setback must be greater than zero.');
    const first = this.entity(lineAId), second = this.entity(lineBId);
    if (first.type !== 'line' || second.type !== 'line') throw new KernelError('Chamfer requires two line segments.');
    const [a0, a1] = this.endpoints(first), [b0, b1] = this.endpoints(second);
    const hit = lineIntersection(a0, a1, b0, b1, false);
    if (!hit) throw new KernelError('Chamfer requires non-parallel line segments.');
    const aFar = dist(a0, hit.point) > dist(a1, hit.point) ? a0 : a1;
    const bFar = dist(b0, hit.point) > dist(b1, hit.point) ? b0 : b1;
    if (dist(aFar, hit.point) <= setback || dist(bFar, hit.point) <= setback) throw new KernelError('Chamfer setback exceeds one of the selected line segments.');
    const pa = add(hit.point, mul(normalize(sub(aFar, hit.point)), setback));
    const pb = add(hit.point, mul(normalize(sub(bFar, hit.point)), setback));
    const aNearId = aFar.id === a0.id ? a1.id : a0.id;
    const bNearId = bFar.id === b0.id ? b1.id : b0.id;
    const newA = this.replaceLineEndpoint(first.id, aNearId, pa);
    const newB = this.replaceLineEndpoint(second.id, bNearId, pb);
    const edge = this.addLine(newA, newB, { name: 'Chamfer', group: 'chamfer' });
    this.pruneOrphanPoints(); this.solveConstraints();
    return edge;
  }

  fillet(lineAId, lineBId, radius) {
    if (!finite(radius) || radius <= EPSILON) throw new KernelError('Fillet radius must be greater than zero.');
    const first = this.entity(lineAId), second = this.entity(lineBId);
    if (first.type !== 'line' || second.type !== 'line') throw new KernelError('Fillet requires two line segments.');
    const [a0, a1] = this.endpoints(first), [b0, b1] = this.endpoints(second);
    const hit = lineIntersection(a0, a1, b0, b1, false);
    if (!hit) throw new KernelError('Fillet requires non-parallel line segments.');
    const aFar = dist(a0, hit.point) > dist(a1, hit.point) ? a0 : a1;
    const bFar = dist(b0, hit.point) > dist(b1, hit.point) ? b0 : b1;
    const u = normalize(sub(aFar, hit.point)), v = normalize(sub(bFar, hit.point));
    const theta = Math.acos(clamp(dot(u, v), -1, 1));
    if (theta < 1e-5 || Math.abs(Math.PI - theta) < 1e-5) throw new KernelError('Fillet requires a real corner.');
    const tangentDistance = radius / Math.tan(theta / 2);
    if (tangentDistance >= dist(aFar, hit.point) || tangentDistance >= dist(bFar, hit.point)) throw new KernelError('Fillet radius is too large for the selected corner.');
    const pa = add(hit.point, mul(u, tangentDistance));
    const pb = add(hit.point, mul(v, tangentDistance));
    const bisector = normalize(add(u, v));
    const center = add(hit.point, mul(bisector, radius / Math.sin(theta / 2)));
    const aNearId = aFar.id === a0.id ? a1.id : a0.id;
    const bNearId = bFar.id === b0.id ? b1.id : b0.id;
    this.replaceLineEndpoint(first.id, aNearId, pa);
    this.replaceLineEndpoint(second.id, bNearId, pb);
    const start = angle(sub(pa, center)), end = angle(sub(pb, center));
    const clockwise = cross(sub(pa, center), sub(pb, center)) < 0;
    const arc = this.addArc(center, radius, start, end, clockwise, { name: 'Fillet', group: 'fillet' });
    this.pruneOrphanPoints(); this.solveConstraints();
    return arc;
  }

  offsetEntity(entityId, amount) {
    if (!finite(amount) || Math.abs(amount) <= EPSILON) throw new KernelError('Offset distance must be non-zero.');
    const entity = this.entity(entityId);
    if (entity.type === 'line') {
      const [a, b] = this.endpoints(entity);
      const n = mul(normalize(normal(sub(b, a))), amount);
      return this.addLine(add(a, n), add(b, n), { name: `${entity.name || 'Line'} offset`, construction: entity.construction });
    }
    if (entity.type === 'circle') {
      if (entity.radius + amount <= EPSILON) throw new KernelError('Offset would invert the circle.');
      return this.addCircle(this.point(entity.center), entity.radius + amount, { name: `${entity.name || 'Circle'} offset`, construction: entity.construction });
    }
    throw new KernelError('Offset currently supports lines and circles.');
  }

  mirrorEntities(entityIds, axisA, axisB) {
    const a = typeof axisA === 'string' ? this.point(axisA) : axisA;
    const b = typeof axisB === 'string' ? this.point(axisB) : axisB;
    const direction = normalize(sub(b, a));
    const created = [];
    const mapPoint = new Map();
    const mirror = p => {
      const ap = sub(p, a); const projected = add(a, mul(direction, dot(ap, direction)));
      return sub(mul(projected, 2), p);
    };
    const copyPoint = id => {
      if (mapPoint.has(id)) return mapPoint.get(id);
      const copy = this.addPoint(...Object.values(mirror(this.point(id))));
      mapPoint.set(id, copy); return copy;
    };
    for (const id of entityIds) {
      const e = this.entity(id);
      if (e.type === 'line') created.push(this.addLine(copyPoint(e.a), copyPoint(e.b), { name: `${e.name || 'Line'} mirror`, construction: e.construction }));
      if (e.type === 'circle') created.push(this.addCircle(copyPoint(e.center), e.radius, { name: `${e.name || 'Circle'} mirror`, construction: e.construction }));
      if (e.type === 'arc') {
        const c = copyPoint(e.center);
        const pa = mirror(this.arcEnds(e)[0]), pb = mirror(this.arcEnds(e)[1]);
        const cp = this.point(c.id);
        created.push(this.addArc(c, e.radius, angle(sub(pa, cp)), angle(sub(pb, cp)), !e.clockwise, { name: `${e.name || 'Arc'} mirror`, construction: e.construction }));
      }
    }
    return created;
  }

  assertValid() {
    const ids = new Set();
    for (const point of this.points) {
      if (!point.id || ids.has(point.id)) throw new KernelError('Sketch contains duplicate or missing point IDs.');
      ids.add(point.id);
      if (!finite(point.x) || !finite(point.y)) throw new KernelError(`Point ${point.id} has invalid coordinates.`);
    }
    const entityIds = new Set();
    for (const entity of this.entities) {
      if (!entity.id || entityIds.has(entity.id)) throw new KernelError('Sketch contains duplicate or missing entity IDs.');
      entityIds.add(entity.id);
      if (!['line', 'circle', 'arc'].includes(entity.type)) throw new KernelError(`Entity ${entity.id} has an unknown type.`);
      this.entityPointIds(entity).forEach(id => this.point(id));
      if (entity.type === 'line' && entity.a === entity.b) throw new KernelError(`Line ${entity.id} has coincident endpoints.`);
      if (entity.type !== 'line' && (!finite(entity.radius) || entity.radius <= EPSILON)) throw new KernelError(`Curve ${entity.id} has an invalid radius.`);
    }
    return true;
  }
}

export const Geometry = { dist, add, sub, mul, dot, cross, normalize, normal, angle, normAngle, lineIntersection, pointOnSegment, TAU };
