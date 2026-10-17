// RayGenerate.wgsl — primary ray, G-buffer, direct light (NEE+shadow rays),
// and the initial ReSTIR GI candidate: a BSDF-sampled path whose first bounce
// vertex y carries an unbiased estimate of the radiance leaving y.
@group(1) @binding(0) var<storage, read_write> gbuf: array<vec4f>;
@group(1) @binding(1) var<storage, read_write> reservoirs: array<Reservoir>;

fn cameraRay(px: vec2f, size: vec2f) -> vec3f {
  let ndc = vec2f((px.x / size.x) * 2.0 - 1.0, 1.0 - (px.y / size.y) * 2.0);
  let tanY = frame.up.w; let aspect = frame.fwd.w;
  return normalize(frame.fwd.xyz + frame.right.xyz * (ndc.x * tanY * aspect) + frame.up.xyz * (ndc.y * tanY));
}

// Radiance leaving vertex (x,n,mat) towards wo, estimated by a short path.
fn estimateLi(x0: vec3f, n0: vec3f, mat0: Material, wo: vec3f, bounces: u32) -> vec3f {
  var li = mat0.emissionMetal.rgb + nee(x0, n0, mat0, wo);
  var tp = vec3f(1.0); var x = x0; var n = n0; var mat = mat0; var view = wo;
  for (var b = 0u; b < bounces; b++) {
    let s = sampleBsdf(mat, n, view);
    if (s.pdf < 1e-6 || lum(s.f) < 1e-7) { break; }
    let h = traceScene(x + n * 1e-3, s.wi, 600.0);
    if (h.t >= 599.0) { li += tp * (s.f / s.pdf) * skyColor(s.wi); break; }
    let hx = hitPoint(x + n * 1e-3, s.wi, h);
    var hn = hitNormal(h); let hm = hitMaterial(h);
    if (dot(hn, s.wi) > 0.0) { hn = -hn; }
    tp *= s.f / s.pdf;
    // Russian roulette after the first continuation bounce
    if (b >= 1u) { let q = clamp(lum(tp), 0.05, 0.95); if (rnd() > q) { break; } tp /= q; }
    li += tp * (hm.emissionMetal.rgb + nee(hx, hn, hm, -s.wi));
    x = hx; n = hn; mat = hm; view = -s.wi;
  }
  return li;
}

@compute @workgroup_size(8, 8)
fn Generate(@builtin(global_invocation_id) gid: vec3u) {
  touchScene();
  let size = vec2f(frame.misc.x, frame.misc.y);
  if (f32(gid.x) >= size.x || f32(gid.y) >= size.y) { return; }
  let idx = gid.y * u32(size.x) + gid.x;
  let iPos = gOff(gParity()) + idx; let iNrm = gOff(2u + gParity()) + idx;
  let iAlb = gOff(4u) + idx; let iDir = gOff(5u) + idx; let iMot = gOff(6u) + idx;
  seedRng(idx * 1664525u + u32(frame.misc.z) * 1013904223u + 7u);
  let px = vec2f(f32(gid.x) + rnd(), f32(gid.y) + rnd());
  let dir = cameraRay(px, size);
  let ro = frame.eye.xyz;
  let h = traceScene(ro, dir, 600.0);
  var res = Reservoir(vec4f(0.0), vec4f(0.0), vec4f(0.0), vec4f(0.0));
  if (h.t >= 599.0) {
    gbuf[iPos] = vec4f(ro + dir * 600.0, 600.0);
    gbuf[iNrm] = vec4f(0.0, 0.0, 1.0, 0.0);
    gbuf[iAlb] = vec4f(0.0, 0.0, 0.0, 1.0);
    gbuf[iDir] = vec4f(skyColor(dir), 1.0);
    gbuf[iMot] = vec4f(0.0, 0.0, 0.0, 0.0);
    reservoirs[idx] = res; return;
  }
  let x = hitPoint(ro, dir, h);
  var n = hitNormal(h); let mat = hitMaterial(h);
  if (dot(n, dir) > 0.0) { n = -n; }
  gbuf[iPos] = vec4f(x, h.t);
  gbuf[iNrm] = vec4f(n, mat.emissionMetal.w);
  gbuf[iAlb] = vec4f(mat.albedoRough.rgb, mat.albedoRough.w);
  // direct: NEE at the primary vertex + its own emission
  let direct = mat.emissionMetal.rgb + nee(x, n, mat, -dir);
  gbuf[iDir] = vec4f(direct, 1.0);
  // motion: same local point through the instance's previous transform
  let tr = getTri(h.tri);
  let local = tr.a.xyz * (1.0 - h.u - h.v) + tr.b.xyz * h.u + tr.c.xyz * h.v;
  let prevWorld = (getPrevMat(h.inst) * vec4f(local, 1.0)).xyz;
  let prevClip = frame.prevViewProj * vec4f(prevWorld, 1.0);
  let curClip = frame.viewProj * vec4f(x, 1.0);
  var motion = vec2f(0.0);
  if (prevClip.w > 0.0 && curClip.w > 0.0) {
    let pn = prevClip.xy / prevClip.w; let cn = curClip.xy / curClip.w;
    motion = vec2f((cn.x - pn.x) * 0.5 * size.x, (pn.y - cn.y) * 0.5 * size.y);
  }
  gbuf[iMot] = vec4f(motion, f32(h.inst), h.t);
  // ---- ReSTIR GI initial candidate -------------------------------------
  let s = sampleBsdf(mat, n, -dir);
  if (s.pdf > 1e-6 && lum(s.f) > 1e-7) {
    let h1 = traceScene(x + n * 1e-3, s.wi, 600.0);
    if (h1.t < 599.0) {
      let y = hitPoint(x + n * 1e-3, s.wi, h1);
      var yn = hitNormal(h1); let ym = hitMaterial(h1);
      if (dot(yn, s.wi) > 0.0) { yn = -yn; }
      let li = estimateLi(y, yn, ym, -s.wi, u32(frame.misc.w) - 1u);
      res.pos = vec4f(y, 0.0); res.norm = vec4f(yn, 0.0);
      res.rad = vec4f(li, 1.0); // M = 1
      res.info = vec4f(0.0, 1.0, 0.0, s.pdf); // W filled by reuse passes
      let phat = targetPdf(x, n, res);
      res.info.x = select(0.0, phat / max(s.pdf, 1e-6), phat > 0.0); // RIS weight sum for M=1
      res.pos.w = phat;
    }
  }
  reservoirs[idx] = res;
}
