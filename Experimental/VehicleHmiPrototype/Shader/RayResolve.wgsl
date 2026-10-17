// RayResolve.wgsl — shade the selected reservoir (F(x->y) * W with a final
// visibility ray), add direct light, and temporally accumulate with
// motion/g-buffer rejection for a stable real-time image.
@group(1) @binding(0) var<storage, read> gbuf: array<vec4f>;
@group(1) @binding(1) var histColor: texture_2d<f32>;
@group(1) @binding(2) var<storage, read> res: array<Reservoir>;
@group(1) @binding(3) var outColor: texture_storage_2d<rgba16float, write>;
@group(1) @binding(4) var outHist: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn Resolve(@builtin(global_invocation_id) gid: vec3u) {
  touchScene();
  let W = u32(frame.misc.x); let H = u32(frame.misc.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let idx = gid.y * W + gid.x;
  let x = gbuf[gOff(gParity()) + idx].xyz;
  let nrm = gbuf[gOff(2u + gParity()) + idx];
  let alb = gbuf[gOff(4u) + idx];
  var color = gbuf[gOff(5u) + idx].rgb;
  let depth = gbuf[gOff(gParity()) + idx].w;
  if (depth < 599.0) {
    let r = res[idx];
    if (r.info.y > 0.0 && r.pos.w > 0.0 && r.info.x > 0.0) {
      let toY = r.pos.xyz - x; let d = length(toY); let dir = toY / max(d, 1e-5);
      if (d > 1e-4 && dot(nrm.xyz, dir) > 0.0) {
        var vis = 1.0;
        if (anyHit(x + nrm.xyz * 1e-3, dir, d - 0.04)) { vis = 0.0; }
        let mat = Material(vec4f(alb.rgb, alb.w), vec4f(0.0, 0.0, 0.0, nrm.w), vec4f(0.0));
        let wo = normalize(frame.eye.xyz - x);
        let f = evalBsdf(mat, nrm.xyz, wo, dir);
        let wFinal = r.info.x / (r.info.y * r.pos.w);
        color += f * r.rad.xyz * wFinal * vis * frame.misc2.w;
      }
    }
  }
  // temporal accumulation
  var acc = color; var count = 1.0;
  if (frame.misc2.x > 0.5 || true) {
    let motion = gbuf[gOff(6u) + idx].xy;
    let pp = vec2i(round(vec2f(f32(gid.x), f32(gid.y)) - motion));
    if (pp.x >= 0 && pp.y >= 0 && pp.x < i32(W) && pp.y < i32(H)) {
      let hp = gbuf[gOff(1u - gParity()) + u32(pp.y) * W + u32(pp.x)].xyz;
      let hn = gbuf[gOff(3u - gParity()) + u32(pp.y) * W + u32(pp.x)].xyz;
      let hc = textureLoad(histColor, vec2u(pp), 0);
      if (hc.a > 0.0 && distance(hp, x) < 0.35 && dot(hn, nrm.xyz) > 0.85) {
        count = min(hc.a + 1.0, 24.0);
        let alpha = 1.0 / count;
        acc = mix(hc.rgb, color, alpha);
      }
    }
  }
  textureStore(outColor, gid.xy, vec4f(acc, 1.0));
  textureStore(outHist, gid.xy, vec4f(acc, count));
}
