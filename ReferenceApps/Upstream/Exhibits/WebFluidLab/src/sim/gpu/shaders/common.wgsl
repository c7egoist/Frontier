// Shared structures, bindings and SPH kernel math used by every compute pass.
// Concatenated in front of each pass-specific WGSL source at pipeline-build
// time (see GpuSolver.ts) because WGSL has no #include directive.

struct Particle {
  position : vec4<f32>, // xyz = world position [m],         w = reserved
  velocity : vec4<f32>, // xyz = velocity [m/s],              w = density scratch
  props    : vec4<f32>, // x materialType, y spawnAge, z contactAmount, w pressure scratch
  accel    : vec4<f32>, // xyz = acceleration [m/s^2],        w = reserved
};

struct MaterialGpu {
  a : vec4<f32>, // restDensity, stiffness, viscosity, cohesion
  b : vec4<f32>, // adhesion, friction, releaseThreshold, particleRadius
  c : vec4<f32>, // colorR, colorG, colorB, damping
  d : vec4<f32>, // opacity, unused, unused, unused
};

struct ColliderGpu {
  posKind : vec4<f32>, // xyz position,     w kind (0 unused/plane,1 sphere,2 box,3 paddle)
  size    : vec4<f32>, // xyz half extents, w static rotationY
  spin    : vec4<f32>, // x spinSpeed,      yzw colour (unused by solver)
};

struct SimParams {
  p0        : vec4<f32>, // dt, smoothingRadius(h), cellSize, gravity
  domainMin : vec4<f32>,
  domainMax : vec4<f32>,
  gridDims  : vec4<f32>, // nx, ny, nz, maxPerCell
  counts    : vec4<f32>, // activeCount, numColliders, time, particleVolume
};

const PI : f32 = 3.14159265359;
const MAX_PER_CELL : u32 = 64u;

@group(0) @binding(0) var<uniform> params : SimParams;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(2) var<storage, read> materials : array<MaterialGpu>;
@group(0) @binding(3) var<storage, read> colliders : array<ColliderGpu>;
@group(0) @binding(4) var<storage, read_write> gridCount : array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> gridCells : array<u32>;

fn cellCoord(pos: vec3<f32>) -> vec3<i32> {
  let rel = (pos - params.domainMin.xyz) / params.p0.z;
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  let nz = i32(params.gridDims.z);
  let cx = clamp(i32(floor(rel.x)), 0, nx - 1);
  let cy = clamp(i32(floor(rel.y)), 0, ny - 1);
  let cz = clamp(i32(floor(rel.z)), 0, nz - 1);
  return vec3<i32>(cx, cy, cz);
}

fn cellIndex(c: vec3<i32>) -> u32 {
  let nx = i32(params.gridDims.x);
  let ny = i32(params.gridDims.y);
  return u32(c.x + c.y * nx + c.z * nx * ny);
}

fn poly6(r2: f32, h: f32) -> f32 {
  if (r2 > h * h) { return 0.0; }
  let h2 = h * h;
  let diff = h2 - r2;
  let k = 315.0 / (64.0 * PI * pow(h, 9.0));
  return k * diff * diff * diff;
}

fn spikyGrad(rij: vec3<f32>, r: f32, h: f32) -> vec3<f32> {
  if (r <= 0.00001 || r > h) { return vec3<f32>(0.0, 0.0, 0.0); }
  let k = -45.0 / (PI * pow(h, 6.0));
  let diff = h - r;
  return (rij / r) * (k * diff * diff);
}

fn viscLap(r: f32, h: f32) -> f32 {
  if (r > h) { return 0.0; }
  let k = 45.0 / (PI * pow(h, 6.0));
  return k * (h - r);
}

fn cohesionKernel(r: f32, h: f32) -> f32 {
  if (r > h || r <= 0.0001) { return 0.0; }
  return (1.0 - r / h) * (h - r);
}

struct SdfHit {
  dist   : f32,
  normal : vec3<f32>,
};

fn sdfSphere(p: vec3<f32>, c: ColliderGpu) -> SdfHit {
  var hit : SdfHit;
  let d = p - c.posKind.xyz;
  let dist = length(d);
  hit.dist = dist - c.size.x;
  hit.normal = d / max(dist, 0.00001);
  return hit;
}

fn sdfBox(p: vec3<f32>, c: ColliderGpu, extraYaw: f32) -> SdfHit {
  var hit : SdfHit;
  let yaw = c.size.w + extraYaw;
  let cs = cos(-yaw);
  let sn = sin(-yaw);
  let lx0 = p.x - c.posKind.x;
  let lz0 = p.z - c.posKind.z;
  let lx = lx0 * cs - lz0 * sn;
  let lz = lx0 * sn + lz0 * cs;
  let ly = p.y - c.posKind.y;
  let q = vec3<f32>(abs(lx), abs(ly), abs(lz)) - c.size.xyz;
  let outside = length(max(q, vec3<f32>(0.0, 0.0, 0.0)));
  let inside = min(max(q.x, max(q.y, q.z)), 0.0);
  hit.dist = outside + inside;
  var gx = 0.0;
  var gy = 0.0;
  var gz = 0.0;
  if (q.x > q.y && q.x > q.z) {
    gx = sign(lx);
  } else if (q.y > q.x && q.y > q.z) {
    gy = sign(ly);
  } else {
    gz = sign(lz);
  }
  if (gx == 0.0 && gy == 0.0 && gz == 0.0) {
    gx = select(-1.0, 1.0, lx >= 0.0);
  }
  let wx = gx * cs + gz * sn;
  let wz = -gx * sn + gz * cs;
  hit.normal = vec3<f32>(wx, gy, wz);
  return hit;
}

fn evalCollider(p: vec3<f32>, c: ColliderGpu) -> SdfHit {
  let kind = c.posKind.w;
  if (kind < 1.5) {
    return sdfSphere(p, c);
  }
  return sdfBox(p, c, c.spin.x * params.counts.z);
}
