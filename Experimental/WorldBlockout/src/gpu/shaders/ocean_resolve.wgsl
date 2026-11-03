// Ocean compute pass 3 — resolve the inverse FFT into the field textures the renderer samples,
// and derive normals, the horizontal displacement Jacobian and foam.
//
//   fieldA = (height m, slope x, slope z, jacobian)
//   fieldB = (displacement x m, displacement z m, foam, 1)
//
// Slopes and the Jacobian come from the transformed surface with periodic finite differences,
// so the shading of the mesh and the sim agree with what is displaced.

struct ResolveParams {
  n        : u32,
  tile     : f32,
  invScale : f32,   // 1 / (N*N)
  choppy   : f32,
};
@group(0) @binding(0) var<uniform> rp : ResolveParams;
@group(0) @binding(1) var srcA : texture_storage_2d<rgba16float, read>;
@group(0) @binding(2) var srcB : texture_storage_2d<rgba16float, read>;
@group(0) @binding(3) var fieldA : texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var fieldB : texture_storage_2d<rgba16float, write>;

fn wrap(i : i32, n : i32) -> i32 { return (i + n) & (n - 1); }

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let n = i32(rp.n);
  let x = i32(gid.x);
  let z = i32(gid.y);
  if (x >= n || z >= n) { return; }

  let pos = vec2i(x, z);
  let scale = rp.invScale;

  let a = textureLoad(srcA, pos);
  let b = textureLoad(srcB, pos);

  let h = a.x * scale;
  let dx = a.z * scale;
  let dz = b.x * scale;

  // Central differences on the periodic tile.
  let xm = textureLoad(srcA, vec2i(wrap(x - 1, n), z)).x * scale;
  let xp = textureLoad(srcA, vec2i(wrap(x + 1, n), z)).x * scale;
  let zm = textureLoad(srcA, vec2i(x, wrap(z - 1, n))).x * scale;
  let zp = textureLoad(srcA, vec2i(x, wrap(z + 1, n))).x * scale;
  let cell = rp.tile / f32(n);
  let slopeX = (xp - xm) / (2.0 * cell);
  let slopeZ = (zp - zm) / (2.0 * cell);

  // Jacobian of the horizontal displacement map: < 0 means the surface folded (whitecaps).
  let dxp = textureLoad(srcA, vec2i(wrap(x + 1, n), z)).z * scale;
  let dxm = textureLoad(srcA, vec2i(wrap(x - 1, n), z)).z * scale;
  let dzp = textureLoad(srcB, vec2i(x, wrap(z + 1, n))).x * scale;
  let dzm = textureLoad(srcB, vec2i(x, wrap(z - 1, n))).x * scale;
  let ddx = (dxp - dxm) / (2.0 * cell);
  let ddz = (dzp - dzm) / (2.0 * cell);
  let jacobian = (1.0 + ddx) * (1.0 + ddz);

  let foam = smoothstep(0.55, 0.0, jacobian);

  textureStore(fieldA, pos, vec4f(h, slopeX, slopeZ, jacobian));
  textureStore(fieldB, pos, vec4f(dx, dz, foam, 1.0));
}
