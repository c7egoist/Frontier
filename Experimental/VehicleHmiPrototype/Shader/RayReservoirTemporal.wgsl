// RayReservoirTemporal.wgsl — ReSTIR GI temporal reuse.
// Reservoir invariant (all passes): meta.x = Wsum (sum of merge weights),
// meta.y = M (samples represented), pos.w = target pdf at the point where the
// sample was last weighted, so W = Wsum / (M * pos.w) can be recovered when
// the reservoir is reused at a different shading point.
@group(1) @binding(0) var<storage, read> gbuf: array<vec4f>;
@group(1) @binding(1) var<storage, read> srcRes: array<Reservoir>;
@group(1) @binding(2) var<storage, read> prevRes: array<Reservoir>;
@group(1) @binding(3) var<storage, read_write> dstRes: array<Reservoir>;

@compute @workgroup_size(8, 8)
fn Temporal(@builtin(global_invocation_id) gid: vec3u) {
  touchScene();
  let W = u32(frame.misc.x); let H = u32(frame.misc.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let idx = gid.y * W + gid.x;
  seedRng(idx * 2654435761u + u32(frame.misc.z) * 97u + 13u);
  var out = srcRes[idx];
  if (frame.misc2.x > 0.5 && out.info.y > 0.0) {
    let x = gbuf[gOff(gParity()) + idx].xyz;
    let n = gbuf[gOff(2u + gParity()) + idx].xyz;
    let motion = gbuf[gOff(6u) + idx].xy;
    let pp = vec2i(round(vec2f(f32(gid.x), f32(gid.y)) - motion));
    if (pp.x >= 0 && pp.y >= 0 && pp.x < i32(W) && pp.y < i32(H)) {
      var cand = prevRes[u32(pp.y) * W + u32(pp.x)];
      let px = gbuf[gOff(1u - gParity()) + u32(pp.y) * W + u32(pp.x)].xyz;
      let pn = gbuf[gOff(3u - gParity()) + u32(pp.y) * W + u32(pp.x)].xyz;
      let ok = distance(px, x) < 0.35 && dot(pn, n) > 0.85 && cand.info.y > 0.0 && cand.pos.w > 0.0;
      if (ok) {
        cand.info.y = min(cand.info.y, frame.misc3.w);
        let mTot = out.info.y + cand.info.y;
        let misCur = out.info.y / mTot;
        let misCand = cand.info.y / mTot;
        out.info.x *= misCur;                       // rescale existing Wsum by its MIS weight
        let wCand = (cand.info.x / (cand.info.y * cand.pos.w)) * targetPdf(x, n, cand) * misCand;
        let total = out.info.x + wCand;
        if (total > 0.0 && rnd() * total < wCand) {
          out.pos.xyz = cand.pos.xyz; out.rad = cand.rad; out.norm = cand.norm;
          out.info.z = cand.info.z + 1.0;
        }
        out.info.x = total;
        out.info.y = mTot;
        out.pos.w = targetPdf(x, n, out);
      }
    }
  }
  dstRes[idx] = out;
}
