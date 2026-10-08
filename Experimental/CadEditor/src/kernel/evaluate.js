// Document evaluation on top of replicad (OpenCascade). Runs inside the kernel
// worker, and directly under Node for the test suite. `kit` is the replicad module
// after setOC() has been called.
//
// Every node is cached by a key built from its parameters, transform and input keys,
// so an edit only rebuilds the nodes downstream of it.

import { chainToBeziers } from "../geometry/spline.js";
import { NODE_TYPES } from "../model/nodeTypes.js";

const DEG = Math.PI / 180;

export function createEvaluator(kit) {
  const { r } = { r: kit };
  const cache = new Map(); // id -> { key, shape, kind, out }

  // ---------- helpers ----------
  const vecAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vecScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const vecLen = (a) => Math.hypot(a[0], a[1], a[2]);
  const vecNorm = (a) => {
    const l = vecLen(a);
    if (l < 1e-12) throw new Error("Direction vector must not be zero");
    return vecScale(a, 1 / l);
  };
  const nums = (v) => (Array.isArray(v) ? v.map(Number) : [0, 0, 0]).slice(0, 3).map((x) => (Number.isFinite(x) ? x : 0));

  const toTopo = (shape) => shape.wrapped;
  const cast = (topo) => kit.cast(topo);

  function sizeOfWire(wire) {
    const bb = wire.boundingBox;
    return Math.max(1e-3, bb.width, bb.height, bb.depth);
  }

  // Wire from a list of curve shapes (Wire objects) - joined in order.
  function joinWires(wires) {
    if (wires.length === 0) throw new Error("Connect at least one curve");
    return r.assembleWire(wires);
  }

  function centreOf(wire) {
    const [lo, hi] = wire.boundingBox.bounds;
    return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  }

  // ---------- kernel-shape builders ----------
  // Each returns a Wire (curves), Face/Shell (surfaces) or Shape3D (bodies).

  const BUILD = {
    // primitives ---------------------------------------------------------
    box(p) {
      const w = p.w / 2, h = p.h / 2, d = p.d / 2;
      return r.makeBox([-w, -h, -d], [w, h, d]);
    },
    cylinder(p) {
      return r.makeCylinder(p.r, p.h, [0, 0, 0], [0, 0, 1]);
    },
    sphere(p) {
      return r.makeSphere(p.r);
    },
    ellipsoid(p) {
      return r.makeEllipsoid(p.a, p.b, p.c);
    },

    // curves -------------------------------------------------------------
    line(p) {
      return r.assembleWire([r.makeLine(nums(p.a), nums(p.b))]);
    },
    polyline(p) {
      const pts = p.points.map(nums);
      if (pts.length < 2) throw new Error("A polyline needs two vertices");
      const edges = [];
      for (let i = 0; i + 1 < pts.length; i++) edges.push(r.makeLine(pts[i], pts[i + 1]));
      if (p.closed) edges.push(r.makeLine(pts[pts.length - 1], pts[0]));
      return r.assembleWire(edges);
    },
    arc3(p) {
      return r.assembleWire([r.makeThreePointArc(nums(p.a), nums(p.b), nums(p.c))]);
    },
    tangentArc(p) {
      return r.assembleWire([r.makeTangentArc(nums(p.a), vecNorm(nums(p.tangent)), nums(p.b))]);
    },
    circle(p) {
      if (p.r <= 0) throw new Error("Radius must be positive");
      return r.assembleWire([r.makeCircle(p.r, nums(p.c), vecNorm(nums(p.n)))]);
    },
    ellipse(p) {
      return r.assembleWire([r.makeEllipse(p.rx, p.ry, nums(p.c), vecNorm(nums(p.n)))]);
    },
    helix(p) {
      return r.makeHelix(p.pitch, p.height, p.radius);
    },
    bezier(p) {
      const pts = p.points.map(nums);
      if (pts.length < 2) throw new Error("A Bezier needs at least two control points");
      return r.assembleWire([r.makeBezierCurve(pts)]);
    },
    spline(p) {
      const segments = chainToBeziers(p.knots);
      if (!segments.length) throw new Error("A spline needs at least two knots");
      const edges = segments.map((s) => r.makeBezierCurve([s.p0, s.c1, s.c2, s.p3]));
      return r.assembleWire(edges);
    },
    fitCurve(p) {
      const pts = p.points.map(nums);
      if (pts.length < 2) throw new Error("A fit needs at least two points");
      return r.assembleWire([r.makeBSplineApproximation(pts)]);
    },

    // surfaces -----------------------------------------------------------
    planeSurface(_p, [wire]) {
      return r.makeFace(wire);
    },
    patch(_p, wires) {
      return r.makeNonPlanarFace(joinWires(wires));
    },
    extrudeSurface(p, [wire]) {
      const v = vecScale(vecNorm(nums(p.dir)), p.distance);
      const prism = new (kit.getOC()).BRepPrimAPI_MakePrism(toTopo(wire), new r.Vector(v).wrapped, false, true);
      const out = cast(prism.Shape());
      prism.delete();
      return out;
    },
    revolveSurface(p, [wire]) {
      return revolveTopo(wire, p);
    },
    loftSurface(p, wires) {
      return loftWires(wires, p, true);
    },
    sweepSurface(p, [profile, spine]) {
      return r.genericSweep(profile, spine, { frenet: !!p.frenet }, false);
    },

    // solids -------------------------------------------------------------
    extrude(p, [wire]) {
      const face = r.makeFace(wire);
      const dir = vecNorm(nums(p.dir));
      const v = vecScale(dir, p.distance);
      if (p.symmetric) {
        const shifted = cast(r.translate(toTopo(face), vecScale(v, -0.5)));
        return r.basicFaceExtrusion(shifted, new r.Vector(v));
      }
      return r.basicFaceExtrusion(face, new r.Vector(v));
    },
    revolve(p, [wire]) {
      const face = r.makeFace(wire);
      return r.revolution(face, nums(p.axisOrigin), nums(p.axisDir), p.angle);
    },
    loft(p, wires) {
      return loftWires(wires, p, false);
    },
    sweep(p, [profile, spine]) {
      return r.genericSweep(profile, spine, { frenet: !!p.frenet }, false);
    },
    fillet(p, [body], edgeList) {
      if (!p.edges?.length) throw new Error("Select at least one edge");
      return body.fillet(p.radius, (f) => f.inList(edgeList));
    },
    chamfer(p, [body], edgeList) {
      if (!p.edges?.length) throw new Error("Select at least one edge");
      return body.chamfer(p.distance, (f) => f.inList(edgeList));
    },
    bevel(p, [body], edgeList) {
      if (!p.edges?.length) throw new Error("Select at least one edge");
      const faces = body.faces;
      const e0 = edgeList[0].hashCode;
      const adjacent = faces.find((fc) => fc.edges.some((e) => e.hashCode === e0));
      if (!adjacent) throw new Error("Could not find a face adjacent to the first edge");
      const adjHash = adjacent.hashCode;
      return body.chamfer(
        { distances: [p.distance, p.setback], selectedFace: (f) => f.inList(faces.filter((x) => x.hashCode === adjHash)) },
        (f) => f.inList(edgeList),
      );
    },
    boolean(p, [a, b]) {
      if (p.op === "subtract") return a.cut(b);
      if (p.op === "intersect") return a.intersect(b);
      return a.fuse(b);
    },
    pushpull(p, [body]) {
      const faces = body.faces;
      if (!(p.face >= 0 && p.face < faces.length)) throw new Error("Select a face to push or pull");
      const face = faces[p.face];
      if (face.geomType !== "PLANE") throw new Error("Push/Pull currently works on planar faces");
      const normal = face.normalAt();
      const n = vecNorm([normal.x, normal.y, normal.z]);
      if (Math.abs(p.distance) < 1e-6) return body;
      const v = vecScale(n, p.distance);
      const prism = r.basicFaceExtrusion(face, new r.Vector(v));
      return p.distance > 0 ? body.fuse(prism) : body.cut(prism);
    },
    mirror(p, [body]) {
      const mirrored = cast(r.mirror(toTopo(body), p.plane));
      return p.merge ? body.fuse(mirrored) : mirrored;
    },
  };

  function revolveTopo(wire, p) {
    const oc = kit.getOC();
    const ax = r.makeAx1(nums(p.axisOrigin), nums(p.axisDir));
    const builder = new oc.BRepPrimAPI_MakeRevol(toTopo(wire), ax, p.angle * DEG, false);
    const out = cast(builder.Shape());
    ax.delete();
    builder.delete();
    return out;
  }

  // Loft with the chosen continuity. Tangent options are implemented with guide
  // sections placed beyond the end profiles along the tangent direction; this gives
  // G1 at the ends (the tangent plane is matched to the guide direction) and is
  // labelled as an approximation in the UI.
  function loftWires(wires, p, asShell) {
    if (wires.length < 2) throw new Error("A loft needs at least two sections");
    const type = p.loftType ?? "smooth";
    const size = Math.max(...wires.map(sizeOfWire));
    const lead = Math.max(0.01, p.lead ?? 0.1) * size;
    const apex = nums(p.apex ?? [0, 0, 100]);
    const first = wires[0];
    const last = wires[wires.length - 1];
    const dirAt = (a, b) => vecNorm(vecAdd(centreOf(b), vecScale(centreOf(a), -1)));
    const startDir = wires.length > 1 ? dirAt(wires[0], wires[1]) : [0, 0, 1];
    const endDir = dirAt(wires[wires.length - 2], last);
    const sections = [...wires];
    const cfg = { ruled: type === "ruled" };
    if (type === "g1start" || type === "g1both") {
      sections.unshift(cast(r.translate(toTopo(first), vecScale(startDir, -lead))));
    }
    if (type === "g1end" || type === "g1both") {
      sections.push(cast(r.translate(toTopo(last), vecScale(endDir, lead))));
    }
    if (type === "apexStart") cfg.startPoint = apex;
    if (type === "apexEnd") cfg.endPoint = apex;
    return r.loft(sections, cfg, asShell);
  }

  // ---------- transforms ----------
  function applyTransform(shape, xf) {
    let out = shape;
    const t = nums(xf?.r ?? [0, 0, 0]);
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(t[i]) > 1e-9) out = cast(r.rotate(toTopo(out), t[i], [0, 0, 0], axes[i]));
    }
    const s = Number.isFinite(xf?.s) && xf.s > 0 ? xf.s : 1;
    if (Math.abs(s - 1) > 1e-9) out = cast(r.scale(toTopo(out), [0, 0, 0], s));
    const tr = nums(xf?.t ?? [0, 0, 0]);
    if (vecLen(tr) > 1e-9) out = cast(r.translate(toTopo(out), tr));
    return out;
  }

  // ---------- output meshes ----------
  function meshBody(shape, kindLabel) {
    const bb = shape.boundingBox;
    const diag = Math.hypot(bb.width, bb.height, bb.depth);
    const tol = Math.max(0.01, diag * 0.002);
    const faces = shape.faces;
    const faceIndex = new Map(faces.map((f, i) => [f.hashCode, i]));
    const mesh = shape.mesh({ tolerance: tol, angularTolerance: 0.25 });
    const edgesList = shape.edges;
    const edgeIndex = new Map(edgesList.map((e, i) => [e.hashCode, i]));
    const edgeMesh = shape.meshEdges({ tolerance: tol, angularTolerance: 0.5 });
    const out = {
      kind: kindLabel,
      bbox: bbox(bb),
      faceCount: faces.length,
      edgeCount: edgesList.length,
      mesh: {
        positions: Float32Array.from(mesh.vertices),
        normals: Float32Array.from(mesh.normals),
        indices: Uint32Array.from(mesh.triangles),
        // [faceIndex, firstIndex, indexCount] triples into `indices`.
        faceRanges: Int32Array.from(mesh.faceGroups.flatMap((g) => [faceIndex.get(g.faceId) ?? -1, g.start, g.count])),
      },
      edges: {
        positions: Float32Array.from(edgeMesh.lines),
        // [edgeIndex, firstVertex, vertexCount] triples into `positions` (vertex = 3 floats).
        ranges: Int32Array.from(edgeMesh.edgeGroups.flatMap((g) => [edgeIndex.get(g.edgeId) ?? -1, g.start, g.count])),
      },
    };
    return out;
  }

  function meshCurve(wire) {
    const edgeMesh = wire.meshEdges({ tolerance: 0.05, angularTolerance: 0.2 });
    let length = 0;
    try {
      length = kit.measureLength(wire);
    } catch {
      length = 0;
    }
    return {
      kind: "curve",
      bbox: bbox(wire.boundingBox),
      length,
      curve: {
        positions: Float32Array.from(edgeMesh.lines),
        ranges: Int32Array.from(edgeMesh.edgeGroups.flatMap((g) => [0, g.start, g.count])),
      },
    };
  }

  function bbox(bb) {
    return {
      min: [bb.bounds[0][0], bb.bounds[0][1], bb.bounds[0][2]],
      max: [bb.bounds[1][0], bb.bounds[1][1], bb.bounds[1][2]],
    };
  }

  function stats(shape, kind) {
    const s = {};
    try {
      if (kind === "body") s.volume = kit.measureVolume(shape);
    } catch {
      /* not a closed solid */
    }
    try {
      if (kind === "surface" || kind === "body") s.area = kit.measureArea(shape);
    } catch {
      /* area unavailable for this topology */
    }
    return s;
  }

  // ---------- graph evaluation ----------
  function keyOf(node, inputKeys) {
    return JSON.stringify([node.type, node.params, node.xf ?? null, inputKeys]);
  }

  function topoOrder(nodes, order) {
    const seen = new Set();
    const out = [];
    const visit = (id, stack = new Set()) => {
      if (seen.has(id)) return;
      if (stack.has(id)) throw new Error("Cycle in document graph");
      const node = nodes[id];
      if (!node) return;
      stack.add(id);
      for (const dep of node.inputs ?? []) visit(dep, stack);
      stack.delete(id);
      seen.add(id);
      out.push(id);
    };
    for (const id of order) visit(id);
    return out;
  }

  // Evaluate the whole document. Returns { results: { [id]: out } }.
  function evaluate(doc) {
    const nodes = doc.nodes;
    const results = {};
    const entries = new Map();
    const ordered = topoOrder(nodes, doc.order);
    const alive = new Set(ordered);

    for (const id of ordered) {
      const node = nodes[id];
      const meta = NODE_TYPES[node.type];
      const inputIds = node.inputs ?? [];
      const inputEntries = inputIds.map((d) => entries.get(d));
      const failed = inputEntries.find((e) => !e || e.error);
      const inputKeys = inputEntries.map((e) => e?.key ?? "missing");
      const key = keyOf(node, inputKeys);
      const cached = cache.get(id);

      if (failed) {
        const err = `Input failed: ${failed?.error ?? "missing input"}`;
        results[id] = { ok: false, error: err, kind: meta?.kind ?? "body" };
        entries.set(id, { key, error: err });
        continue;
      }
      if (cached && cached.key === key) {
        results[id] = cached.out;
        entries.set(id, { key, shape: cached.shape, kind: cached.kind, error: null });
        continue;
      }
      try {
        if (!meta) throw new Error(`Unknown node type "${node.type}"`);
        const builder = BUILD[node.type];
        const edgeLists = inputEntries.map((e) => e.shape);
        // Edge selections refer to the input shape's edge order; resolve them here.
        let edgeObjs = null;
        if (node.type === "fillet" || node.type === "chamfer" || node.type === "bevel") {
          const all = edgeLists[0].edges;
          edgeObjs = (node.params.edges ?? []).map((i) => {
            if (!(i >= 0 && i < all.length)) throw new Error(`Edge ${i} is out of range`);
            return all[i];
          });
        }
        const rawShape =
          node.type === "fillet" || node.type === "chamfer" || node.type === "bevel"
            ? builder(node.params, edgeLists, edgeObjs)
            : builder(node.params, edgeLists);
        const shape = node.xf ? applyTransform(rawShape, node.xf) : rawShape;
        const kind = meta.kind;
        let out;
        if (kind === "curve") out = { ok: true, ...meshCurve(shape) };
        else out = { ok: true, ...meshBody(shape, kind), ...stats(shape, kind) };
        results[id] = out;
        const prev = cached?.shape;
        cache.set(id, { key, shape, kind, out });
        if (prev && prev !== shape) safeDelete(prev);
        entries.set(id, { key, shape, kind, error: null });
      } catch (e) {
        const message = e?.message || String(e);
        results[id] = { ok: false, error: message, kind: meta?.kind ?? "body" };
        entries.set(id, { key, error: message });
        const prev = cache.get(id);
        if (prev) {
          safeDelete(prev.shape);
          cache.delete(id);
        }
      }
    }
    // Drop cache entries for nodes that no longer exist.
    for (const id of [...cache.keys()]) {
      if (!alive.has(id)) {
        safeDelete(cache.get(id).shape);
        cache.delete(id);
      }
    }
    return { results };
  }

  function safeDelete(shape) {
    try {
      shape?.delete?.();
    } catch {
      /* already released */
    }
  }

  function dispose() {
    for (const id of [...cache.keys()]) {
      safeDelete(cache.get(id).shape);
      cache.delete(id);
    }
  }

  return { evaluate, dispose, cacheSize: () => cache.size };
}
