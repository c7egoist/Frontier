// Domain accessors shared by the fine and coarse shallow-water layers.
// Compiled twice: once with SWE_COARSE undefined (fine, camera-following, 1-2 m spacing) and
// once with SWE_COARSE defined (coarse nesting layer, 10-30 m spacing, lower update rate).

#pragma once

#include "common/globals.wgsl"

#ifdef SWE_COARSE
fn lOrigin() -> vec2<f32> { return P.cswOrigin; }
fn lSize() -> vec2<f32> { return P.cswSize; }
fn lDx() -> f32 { return P.cswDx; }
fn lH() -> f32 { return P.cswH; }
fn lCount() -> u32 { return P.cswCount; }
fn lGridW() -> u32 { return P.cswGridW; }
fn lGridH() -> u32 { return P.cswGridH; }
fn lCellSize() -> f32 { return P.cswCellSize; }
fn lViscosity() -> f32 { return P.sweViscosity * 2.0; }
fn lSponge() -> f32 { return max(P.sweSponge, lSize().x * 0.1); }
const IS_COARSE: bool = true;
#else
fn lOrigin() -> vec2<f32> { return P.sweOrigin; }
fn lSize() -> vec2<f32> { return P.sweSize; }
fn lDx() -> f32 { return P.sweDx; }
fn lH() -> f32 { return P.sweH; }
fn lCount() -> u32 { return P.sweCount; }
fn lGridW() -> u32 { return P.sweGridW; }
fn lGridH() -> u32 { return P.sweGridH; }
fn lCellSize() -> f32 { return P.sweCellSize; }
fn lViscosity() -> f32 { return P.sweViscosity; }
fn lSponge() -> f32 { return P.sweSponge; }
const IS_COARSE: bool = false;
#endif

struct SweParticle {
  /// x, z, column depth h (derived from the neighbours' volumes), whitecap metric
  posH: vec4<f32>,
  /// vx, vz, column volume V (m^3, the conserved quantity), surface elevation eta (m)
  velV: vec4<f32>,
};

fn emptyParticle() -> SweParticle {
  return SweParticle(vec4<f32>(0.0), vec4<f32>(0.0));
}

/// Cell coordinates of a world XZ position, clamped into the grid.
fn cellCoordOf(xz: vec2<f32>) -> vec2<u32> {
  let c = floor((xz - lOrigin()) / lCellSize());
  return vec2<u32>(
    u32(clamp(c.x, 0.0, f32(lGridW()) - 1.0)),
    u32(clamp(c.y, 0.0, f32(lGridH()) - 1.0)),
  );
}

fn cellLinearOf(c: vec2<u32>) -> u32 {
  return c.y * lGridW() + c.x;
}

/// Normalised distance to the nearest domain edge; < 0 outside, 0 at the edge.
fn edgeDistance(xz: vec2<f32>) -> f32 {
  let rel = xz - lOrigin();
  let inside = min(min(rel.x, rel.y), min(lSize().x - rel.x, lSize().y - rel.y));
  return inside;
}

/// 1 inside, 0 in the deep sponge band, smooth in between.
fn spongeFactor(xz: vec2<f32>) -> f32 {
  return clamp(edgeDistance(xz) / max(lSponge(), 1e-3), 0.0, 1.0);
}
