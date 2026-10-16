// WGSL for the volumetric tyre. Equations mirror src/tyreCore.js (CPU reference) one-to-one.

export const SIM_WGSL = /* wgsl */`
struct Params {
  mu: f32, lambda: f32, pressure: f32, dt: f32,
  gravity: f32, damping: f32, groundK: f32, groundC: f32,
  friction: f32, frictionC: f32, beadK: f32, beadC: f32,
  rimRadius: f32, treadRadius: f32, rimMass: f32, suspK: f32,
  suspC: f32, speed: f32, targetY: f32, roadCount: f32,
  yaw: f32, nodeCount: f32, tetCount: f32,
  NT: f32, NI: f32, NJ: f32, pad0: f32, roadPeriod: f32,
  road: array<vec4<f32>, 8>,   // x, w, h, kind
};

// Per node: nodeState[2n] = (position, reaction), nodeState[2n+1] = (velocity, 0)
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> nodeState: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> nodeInfo: array<vec4<f32>>;     // rest xyz (rim-centred), mass
@group(0) @binding(3) var<storage, read> tetIdx: array<vec4<u32>>;
@group(0) @binding(4) var<storage, read> tetData: array<vec4<f32>>;     // 3 per tet: columns of Dm^-T (w of first = V0)
@group(0) @binding(5) var<storage, read_write> tetForce: array<vec4<f32>>; // 4 per tet (entry = tet*4+local)
@group(0) @binding(6) var<storage, read> adjStart: array<u32>;
@group(0) @binding(7) var<storage, read> adjList: array<u32>;
@group(0) @binding(8) var<storage, read_write> rim: array<vec4<f32>>;   // [0] = (x, y, z, alpha) [1] = (vx, vy, vz, alphaDot)
@group(0) @binding(9) var<storage, read_write> nodeNormal: array<vec4<f32>>;

fn featureH(f: vec4<f32>, x: f32) -> f32 {
  if (f.z == 0.0) { return 0.0; }
  if (f.w > 0.5) {
    // kerb: block from f.x to f.x + f.y with 3 cm smooth ramps
    let up = smoothstep(f.x - 0.03, f.x, x);
    let down = 1.0 - smoothstep(f.x + f.y, f.x + f.y + 0.03, x);
    return f.z * up * down;
  }
  let d = (x - f.x) / f.y;
  if (abs(d) >= 1.0) { return 0.0; }
  return f.z * 0.5 * (1.0 + cos(3.14159265 * d));
}

fn terrainH(x: f32) -> f32 {
  // Periodic road: wrap x into one period and sum features at the wrapped position and its neighbours.
  let per = P.roadPeriod;
  let xl = x - per * floor(x / per);
  var h = 0.0;
  for (var k = 0u; k < 8u; k = k + 1u) {
    h = h + featureH(P.road[k], xl) + featureH(P.road[k], xl + per) + featureH(P.road[k], xl - per);
  }
  return h;
}

fn cofac(F: mat3x3<f32>) -> mat3x3<f32> {
  return mat3x3<f32>(cross(F[1], F[2]), cross(F[2], F[0]), cross(F[0], F[1]));
}

// Pass 1: per-tetrahedron first Piola–Kirchhoff stress → nodal forces.
@compute @workgroup_size(64)
fn cs_tet(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  if (f32(t) >= P.tetCount) { return; }
  let ids = tetIdx[t];
  let X0 = nodeState[2u * ids.x].xyz;
  let X1 = nodeState[2u * ids.y].xyz;
  let X2 = nodeState[2u * ids.z].xyz;
  let X3 = nodeState[2u * ids.w].xyz;
  let g0 = tetData[3u * t];
  let g1 = tetData[3u * t + 1u];
  let g2 = tetData[3u * t + 2u];
  let GT = mat3x3<f32>(g0.xyz, g1.xyz, g2.xyz);
  let V0 = g0.w;
  let Ds = mat3x3<f32>(X1 - X0, X2 - X0, X3 - X0);
  let F = Ds * transpose(GT);
  let E = 0.5 * (transpose(F) * F - mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0));
  let trE = E[0][0] + E[1][1] + E[2][2];
  let I3 = mat3x3<f32>(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
  let S = 2.0 * P.mu * E + P.lambda * trE * I3;
  let Pk = F * S - P.pressure * cofac(F);
  let f1 = -V0 * (Pk * g0.xyz);
  let f2 = -V0 * (Pk * g1.xyz);
  let f3 = -V0 * (Pk * g2.xyz);
  let f0 = -(f1 + f2 + f3);
  let base = 4u * t;
  tetForce[base] = vec4<f32>(f0, 0.0);
  tetForce[base + 1u] = vec4<f32>(f1, 0.0);
  tetForce[base + 2u] = vec4<f32>(f2, 0.0);
  tetForce[base + 3u] = vec4<f32>(f3, 0.0);
}

// Pass 2: gather nodal forces, bead springs, ground contact, semi-implicit integration.
@compute @workgroup_size(64)
fn cs_node(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = gid.x;
  if (f32(n) >= P.nodeCount) { return; }
  let info = nodeInfo[n];
  let m = info.w;
  var x = nodeState[2u * n].xyz;
  var v = nodeState[2u * n + 1u].xyz;
  var f = vec3<f32>(0.0, -P.gravity * m, 0.0);
  let e0 = adjStart[n];
  let e1 = adjStart[n + 1u];
  for (var e = e0; e < e1; e = e + 1u) {
    f = f + tetForce[adjList[e]].xyz;
  }
  f = f - P.damping * m * v;

  let c0 = rim[0];
  let c1 = rim[1];
  var react = 0.0;
  if (length(info.xy) < P.rimRadius + 1e-4) {
    let cA = cos(c0.w);
    let sA = sin(c0.w);
    let cY = cos(P.yaw);
    let sY = sin(P.yaw);
    // rest → Rz(alpha) (rolling plane) → Ry(yaw) (wheel heading)
    let ax = info.x * cA - info.y * sA;
    let ay = info.x * sA + info.y * cA;
    let az = info.z;
    let r = vec3<f32>(ax * cY + az * sY, ay, -ax * sY + az * cY);
    let tgt = c0.xyz + r;
    // spin vector W = alphaDot · axle, axle = (sin yaw, 0, cos yaw)
    let W = c1.w * vec3<f32>(sY, 0.0, cY);
    let vt = c1.xyz + cross(W, r);
    let fb = P.beadK * (tgt - x) + P.beadC * m * (vt - v);
    f = f + fb;
    react = -fb.y;
  }

  let pen = terrainH(x.x) - x.y;
  if (pen > 0.0) {
    let fNorm = max(P.groundK * pen - P.groundC * m * v.y, 0.0);
    f.y = f.y + fNorm;
    let vl = length(vec2<f32>(v.x, v.z));
    if (vl > 1e-6) {
      let ft = min(P.frictionC * m * vl, P.friction * fNorm);
      f.x = f.x - ft * v.x / vl;
      f.z = f.z - ft * v.z / vl;
    }
  }

  v = v + P.dt * f / m;
  x = x + P.dt * v;
  nodeState[2u * n] = vec4<f32>(x, react);
  nodeState[2u * n + 1u] = vec4<f32>(v, 0.0);
}

// Pass 3: reduce bead reactions and advance the sprung rim (one workgroup).
var<workgroup> partial: array<f32, 256>;

@compute @workgroup_size(256)
fn cs_rim(@builtin(local_invocation_id) lid: vec3<u32>) {
  let tid = lid.x;
  let count = u32(P.nodeCount);
  var s = 0.0;
  for (var n = tid; n < count; n = n + 256u) {
    s = s + nodeState[2u * n].w;
  }
  partial[tid] = s;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride = stride / 2u) {
    if (tid < stride) { partial[tid] = partial[tid] + partial[tid + stride]; }
    workgroupBarrier();
  }
  if (tid == 0u) {
    var pos = rim[0];
    var vel = rim[1];
    let ay = (P.suspK * (P.targetY - pos.y) - P.suspC * vel.y - P.rimMass * P.gravity + partial[0]) / P.rimMass;
    vel.y = vel.y + P.dt * ay;
    pos.y = pos.y + P.dt * vel.y;
    vel.x = P.speed;
    vel.z = 0.0;
    vel.w = -P.speed * cos(P.yaw) / P.treadRadius;
    pos.x = pos.x + P.dt * vel.x;
    pos.z = 0.0;
    pos.w = pos.w + P.dt * vel.w;
    rim[0] = pos;
    rim[1] = vel;
  }
}

// Pass 4: per-node normals from the (theta, radial, lateral) grid neighbours, oriented outward.
fn nodeAt(t: i32, i: i32, j: i32) -> u32 {
  let NT = i32(P.NT);
  let NI = i32(P.NI);
  let NJ = i32(P.NJ);
  let tt = ((t % NT) + NT) % NT;
  return u32((tt * NI + i) * NJ + j);
}

@compute @workgroup_size(64)
fn cs_normal(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = gid.x;
  if (f32(n) >= P.nodeCount) { return; }
  let NI = i32(P.NI);
  let NJ = i32(P.NJ);
  let ni = i32(n);
  let j = ni % NJ;
  let i = (ni / NJ) % NI;
  let t = ni / (NI * NJ);
  let ip = min(i + 1, NI - 1);
  let im = max(i - 1, 0);
  let jp = min(j + 1, NJ - 1);
  let jm = max(j - 1, 0);
  let pC = nodeState[2u * n].xyz;
  let dth = nodeState[2u * nodeAt(t + 1, i, j)].xyz - nodeState[2u * nodeAt(t - 1, i, j)].xyz;
  let di = nodeState[2u * nodeAt(t, ip, j)].xyz - nodeState[2u * nodeAt(t, im, j)].xyz;
  let dj = nodeState[2u * nodeAt(t, i, jp)].xyz - nodeState[2u * nodeAt(t, i, jm)].xyz;
  let axle = vec3<f32>(sin(P.yaw), 0.0, cos(P.yaw));
  let d = pC - rim[0].xyz;
  let radial = d - axle * dot(d, axle);
  let c1 = cross(dth, dj);
  let c2 = cross(dth, di);
  var nrm = vec3<f32>(0.0);
  if (i == NI - 1) { nrm = nrm + c1 * sign(dot(c1, radial)); }
  if (j == 0 || j == NJ - 1) {
    let lat = select(-1.0, 1.0, j == NJ - 1);
    nrm = nrm + c2 * sign(dot(c2, axle) * lat);
  }
  if (length(nrm) < 1e-12) { nrm = radial; }
  nodeNormal[n] = vec4<f32>(normalize(nrm), 0.0);
}
`;

export const RENDER_WGSL = /* wgsl */`
struct Globals {
  viewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  lightDir: vec4<f32>,
  terrain: vec4<f32>,   // road period (m) in x
  view: vec4<f32>,      // colourMode, NT, NI, NJ
  rimInfo: vec4<f32>,   // rimRadius, treadRadius, ground grid shift (m), yaw
  road: array<vec4<f32>, 8>,
};
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var<storage, read> nodeState: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> nodeNormal: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> nodeInfo: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> rim: array<vec4<f32>>;

fn featureH(f: vec4<f32>, x: f32) -> f32 {
  if (f.z == 0.0) { return 0.0; }
  if (f.w > 0.5) {
    let up = smoothstep(f.x - 0.03, f.x, x);
    let down = 1.0 - smoothstep(f.x + f.y, f.x + f.y + 0.03, x);
    return f.z * up * down;
  }
  let d = (x - f.x) / f.y;
  if (abs(d) >= 1.0) { return 0.0; }
  return f.z * 0.5 * (1.0 + cos(3.14159265 * d));
}

fn terrainH(x: f32) -> f32 {
  // Periodic road: wrap x into one period and sum features at the wrapped position and its neighbours.
  let per = G.terrain.x;
  let xl = x - per * floor(x / per);
  var h = 0.0;
  for (var k = 0u; k < 8u; k = k + 1u) {
    h = h + featureH(G.road[k], xl) + featureH(G.road[k], xl + per) + featureH(G.road[k], xl - per);
  }
  return h;
}

// Wheel frame: local = Ry(-yaw) · (world − centre), in the rolling plane + axle.
fn toWheel(d: vec3<f32>) -> vec3<f32> {
  let c = cos(G.rimInfo.w);
  let s = sin(G.rimInfo.w);
  return vec3<f32>(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
}

struct TyreOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) dev: f32,
};

@vertex
fn vs_tyre(@builtin(vertex_index) vi: u32) -> TyreOut {
  let p = nodeState[2u * vi].xyz;
  let info = nodeInfo[vi];
  let d = p - rim[0].xyz;
  let axle = vec3<f32>(sin(G.rimInfo.w), 0.0, cos(G.rimInfo.w));
  let radial = length(d - axle * dot(d, axle));
  var o: TyreOut;
  o.pos = G.viewProj * vec4<f32>(p, 1.0);
  o.world = p;
  o.normal = nodeNormal[vi].xyz;
  o.dev = length(info.xy) - radial; // + = squashed inward, - = bulged
  return o;
}

@fragment
fn fs_tyre(inp: TyreOut) -> @location(0) vec4<f32> {
  var n = normalize(inp.normal);
  let v = normalize(G.camPos.xyz - inp.world);
  if (dot(n, v) < 0.0) { n = -n; }
  let L = normalize(G.lightDir.xyz);
  // Tread pattern follows the material: angle in the wheel frame, integer frequency so it wraps cleanly.
  let local = toWheel(inp.world - rim[0].xyz);
  let ang = atan2(local.y, local.x) - rim[0].w;
  let blocks = fract(ang * 36.0 / 6.2831853);
  let transverse = 1.0 - smoothstep(0.02, 0.06, min(blocks, 1.0 - blocks));
  let rr = length(vec2<f32>(local.x, local.y));
  let onTread = smoothstep(0.26, 0.31, rr);
  let groove = transverse * onTread * (1.0 - smoothstep(0.03, 0.07, abs(local.z)));
  var base = vec3<f32>(0.075, 0.075, 0.08);
  base = mix(base, vec3<f32>(0.02, 0.02, 0.022), groove);
  if (G.view.x > 0.5) {
    // Deformation view: blue = bulge, red = squashed.
    let t = clamp(inp.dev / 0.012 * 0.5 + 0.5, 0.0, 1.0);
    base = mix(vec3<f32>(0.1, 0.25, 0.9), vec3<f32>(0.95, 0.2, 0.1), t);
  }
  let diff = max(dot(n, L), 0.0);
  let hemi = 0.5 + 0.5 * n.y;
  let h = normalize(L + v);
  let spec = pow(max(dot(n, h), 0.0), 18.0) * 0.06;
  let col = base * (0.25 + 0.85 * diff + 0.3 * hemi) + vec3<f32>(spec);
  return vec4<f32>(col, 1.0);
}

@fragment
fn fs_edge(inp: TyreOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.95, 0.85, 0.3, 1.0);
}

struct GroundOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
};

// The grid is authored around the origin and shifted in whole metres (rimInfo.z) so the road never ends.
@vertex
fn vs_ground(@location(0) xz: vec2<f32>) -> GroundOut {
  let wx = xz.x + G.rimInfo.z;
  var o: GroundOut;
  o.world = vec3<f32>(wx, terrainH(wx), xz.y);
  o.pos = G.viewProj * vec4<f32>(o.world, 1.0);
  return o;
}

@fragment
fn fs_ground(inp: GroundOut) -> @location(0) vec4<f32> {
  let gx = abs(fract(inp.world.x - 0.5) - 0.5);
  let gz = abs(fract(inp.world.z - 0.5) - 0.5);
  let line = 1.0 - smoothstep(0.0, 0.02, min(gx, gz));
  let base = vec3<f32>(0.16, 0.165, 0.17) + 0.04 * vec3<f32>(line);
  let d = length(inp.world.xz - G.camPos.xz);
  let fog = smoothstep(25.0, 60.0, d);
  let col = mix(base, vec3<f32>(0.42, 0.45, 0.5), fog);
  return vec4<f32>(col, 1.0);
}

struct RimIn {
  @location(0) pos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) colour: vec3<f32>,
};
struct RimOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) colour: vec3<f32>,
};

// Rim geometry is authored once in the wheel frame and placed on the GPU: Ry(yaw)·Rz(alpha)·local + centre.
@vertex
fn vs_rim(i: RimIn) -> RimOut {
  let a = rim[0].w;
  let c = cos(a);
  let s = sin(a);
  let cY = cos(G.rimInfo.w);
  let sY = sin(G.rimInfo.w);
  let p1 = vec3<f32>(c * i.pos.x - s * i.pos.y, s * i.pos.x + c * i.pos.y, i.pos.z);
  let n1 = vec3<f32>(c * i.normal.x - s * i.normal.y, s * i.normal.x + c * i.normal.y, i.normal.z);
  var o: RimOut;
  o.world = vec3<f32>(p1.x * cY + p1.z * sY, p1.y, -p1.x * sY + p1.z * cY) + rim[0].xyz;
  o.pos = G.viewProj * vec4<f32>(o.world, 1.0);
  o.normal = vec3<f32>(n1.x * cY + n1.z * sY, n1.y, -n1.x * sY + n1.z * cY);
  o.colour = i.colour;
  return o;
}

@fragment
fn fs_rim(inp: RimOut) -> @location(0) vec4<f32> {
  let n = normalize(inp.normal);
  let L = normalize(G.lightDir.xyz);
  let v = normalize(G.camPos.xyz - inp.world);
  let h = normalize(L + v);
  let diff = max(dot(n, L), 0.0);
  let spec = pow(max(dot(n, h), 0.0), 48.0) * 0.6;
  return vec4<f32>(inp.colour * (0.3 + 0.8 * diff) + vec3<f32>(spec), 1.0);
}
`;
