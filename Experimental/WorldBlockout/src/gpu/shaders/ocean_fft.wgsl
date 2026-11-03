// Ocean compute pass 2 — inverse FFT of the packed spectrum (rows then columns).
//
// Radix-2 Cooley-Tukey, decimation in time, with bit-reversal permutation. Parallel form: every
// invocation produces exactly one output texel of one butterfly stage, so each pass is a full
// texture write and passes ping-pong between texture pairs.
//
//   step = 0        -> bit-reversal permutation along `axis`
//   step = 1..log2n -> butterfly stage, span = 2^step
//
// For an in-place DIT butterfly the lower half of a block is the twiddle-free operand:
//   a = X[base + k]                 b = W(k, span) * X[base + k + half]
//   X'[base + k]        = a + b
//   X'[base + k + half] = a - b
// which is what this shader reproduces per output texel.
//
// Packing: specA = (Re h, Im h, Re Dx, Im Dx), specB = (Re Dz, Im Dz, 0, 0).
// No scaling is applied here; the resolve pass divides by N^2.

struct FFTParams {
  n     : u32,
  axis  : u32,   // 0 = rows (along x), 1 = columns (along z)
  step  : u32,   // 0 = permutation, 1..log2(n) = butterfly
  inv   : u32,   // 1 = inverse transform (positive twiddle)
};
@group(0) @binding(0) var<uniform> p : FFTParams;
@group(0) @binding(1) var srcA : texture_storage_2d<rgba16float, read>;
@group(0) @binding(2) var srcB : texture_storage_2d<rgba16float, read>;
@group(0) @binding(3) var dstA : texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var dstB : texture_storage_2d<rgba16float, write>;

const PI2 : f32 = 6.283185307179586;

fn cmul(a : vec2f, b : vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn bitReverse(v : u32, bits : u32) -> u32 {
  var r = 0u;
  var x = v;
  for (var i = 0u; i < bits; i = i + 1u) {
    r = (r << 1u) | (x & 1u);
    x = x >> 1u;
  }
  return r;
}

fn log2i(v : u32) -> u32 {
  var l = 0u;
  var x = v;
  while (x > 1u) { x = x >> 1u; l = l + 1u; }
  return l;
}

// Coordinate of element `elem` along `axis` in row `row` (axis 0) or column `col` (axis 1).
fn coord(axis : u32, elem : i32, other : i32) -> vec2i {
  if (axis == 0u) { return vec2i(elem, other); }
  return vec2i(other, elem);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let n = i32(p.n);
  let gx = i32(gid.x);
  let gy = i32(gid.y);
  if (gx >= n || gy >= n) { return; }

  // position on the transformed axis
  let along = select(gy, gx, p.axis == 0u);
  // the row / column being processed
  let other = select(gx, gy, p.axis == 0u);

  if (p.step == 0u) {
    let bits = log2i(p.n);
    let rev = i32(bitReverse(u32(along), bits));
    let srcPos = coord(p.axis, rev, other);
    let dstPos = coord(p.axis, along, other);
    textureStore(dstA, dstPos, textureLoad(srcA, srcPos));
    textureStore(dstB, dstPos, textureLoad(srcB, srcPos));
    return;
  }

  let span = i32(1u << (p.step - 1u));
  let half = span;
  let size = span * 2;
  let base = along & ~(size - 1);
  let k = along & (half - 1);
  let lowerIndex = base + k;
  let upperIndex = lowerIndex + half;
  let upper = along < upperIndex;
  let outIndex = select(lowerIndex, upperIndex, upper);

  // Inverse transform conjugates the twiddle.
  let sign = select(-1.0, 1.0, p.inv == 1u);
  let ang = sign * PI2 * f32(k) / f32(size);
  let tw = vec2f(cos(ang), sin(ang));

  let aPos = coord(p.axis, lowerIndex, other);
  let bPos = coord(p.axis, upperIndex, other);
  let aA = textureLoad(srcA, aPos);
  let aB = textureLoad(srcB, aPos);
  let bA = textureLoad(srcA, bPos);
  let bB = textureLoad(srcB, bPos);

  let tH  = cmul(tw, vec2f(bA.x, bA.y));
  let tDx = cmul(tw, vec2f(bA.z, bA.w));
  let tDz = cmul(tw, vec2f(bB.x, bB.y));

  // Lower half takes a + tw*b, upper half takes a - tw*b (decimation-in-time butterfly).
  let sign2 = select(1.0, -1.0, upper);
  let outA = vec4f(aA.x + sign2 * tH.x,  aA.y + sign2 * tH.y,
                   aA.z + sign2 * tDx.x, aA.w + sign2 * tDx.y);
  let outB = vec4f(aB.x + sign2 * tDz.x, aB.y + sign2 * tDz.y, 0.0, 0.0);

  let dstPos = coord(p.axis, outIndex, other);
  textureStore(dstA, dstPos, outA);
  textureStore(dstB, dstPos, outB);
}
