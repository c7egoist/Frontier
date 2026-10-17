// RayReservoirSpatial.wgsl — ReSTIR GI spatial reuse: merge reservoirs from
// neighbouring pixels (pairwise MIS by M), optionally re-validating the reused
// sample's visibility from this shading point with a shadow ray.
@group(1) @binding(0) var<storage, read> gbuf: array<vec4f>;
@group(1) @binding(1) var<storage, read> srcRes: array<Reservoir>;
@group(1) @binding(2) var<storage, read_write> dstRes: array<Reservoir>;

@compute @workgroup_size(8, 8)
fn Spatial(@builtin(global_invocation_id) gid: vec3u) {
  touchScene();
  let W = u32(frame.misc.x); let H = u32(frame.misc.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let idx = gid.y * W + gid.x;
  seedRng(idx * 40503u + u32(frame.misc.z) * 7919u + 29u);
  var out = srcRes[idx];
  if (frame.misc2.y > 0.5 && out.info.y > 0.0) {
    let x = gbuf[gOff(gParity()) + idx].xyz;
    let n = gbuf[gOff(2u + gParity()) + idx].xyz;
    let count = i32(frame.misc3.z);
    let radius = frame.misc3.y;
    for (var k = 0; k < 8; k++) {
      if (k >= count) { break; }
      let ang = rnd() * 6.2831853; let rad = sqrt(rnd()) * radius;
      let q = vec2i(gid.xy) + vec2i(i32(cos(ang) * rad), i32(sin(ang) * rad));
      if (q.x < 0 || q.y < 0 || q.x >= i32(W) || q.y >= i32(H)) { continue; }
      let cand = srcRes[u32(q.y) * W + u32(q.x)];
      if (cand.info.y <= 0.0 || cand.pos.w <= 0.0) { continue; }
      let qn = gbuf[gOff(2u + gParity()) + u32(q.y) * W + u32(q.x)].xyz;
      let qx = gbuf[gOff(gParity()) + u32(q.y) * W + u32(q.x)].xyz;
      if (dot(qn, n) < 0.7 || distance(qx, x) > 2.5) { continue; }
      var phat = targetPdf(x, n, cand);
      if (phat <= 0.0) { continue; }
      if (frame.misc2.z > 0.5) { // visibility validation of the reused sample
        let toY = cand.pos.xyz - x; let d = length(toY);
        if (d > 0.05 && anyHit(x + n * 1e-3, toY / d, d - 0.05)) { phat = 0.0; }
        if (phat <= 0.0) { continue; }
      }
      let mTot = out.info.y + cand.info.y;
      let misCur = out.info.y / mTot; let misCand = cand.info.y / mTot;
      out.info.x *= misCur;
      let wCand = (cand.info.x / (cand.info.y * cand.pos.w)) * phat * misCand;
      let total = out.info.x + wCand;
      if (total > 0.0 && rnd() * total < wCand) {
        out.pos.xyz = cand.pos.xyz; out.rad = cand.rad; out.norm = cand.norm; out.info.z = cand.info.z;
      }
      out.info.x = total; out.info.y = mTot;
      out.pos.w = targetPdf(x, n, out);
    }
  }
  dstRes[idx] = out;
}
