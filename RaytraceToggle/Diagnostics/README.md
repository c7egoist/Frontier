# Renderer diagnostics — answers to two direct questions (2026-09-28)

## Q1. Do emissive lights work in the Surfel GI?  — YES

`Emissive_SurfelGI.png`. Test scene (`ModeMatrix --scene emissive`): a single **warm emissive sphere is the only
light** — the ceiling quad emits nothing, so there is **no NEE / direct lighting at all**; every lit pixel is lit
*indirectly*, through the surfel field.

- **Left (plain raster, GI off):** the emitter glows but lights nothing — the floor, wall and diffuse spheres are just
  flat sky-ambient fill. Correct: with GI off there is no mechanism to carry the emitter's light onto other surfaces.
- **Right (surfel GI):** the emissive sphere clearly **bleeds warm light** onto the floor, the back wall and the four
  diffuse spheres, with contact shadows and distance falloff.

**How it works in the mirror:** each surfel casts hemisphere rays; when one hits an emissive surface it adds that
surface's `emiss` into the surfel's accumulated irradiance `E`, which neighbouring surfaces then gather. So emissive
*geometry* is a first-class GI emitter in the surfel path (it converges through the diffuse gather rather than through a
direct light sample, which is exactly how a surfel/irradiance-cache GI is supposed to treat area emitters).

**In the real engine:** there is no surfel system — the engine's GI is the **path-traced ReSTIR GI**
(`ReSTIRViewport.slang`), and it already treats emissive triangles as lights: they are collected into `Luminaires[]`
with `LightTriangleCount` for NEE **and** their `Emission` is added when a bounce ray lands on them. So emissive lights
work on the RT/ReSTIR path too — as both direct (sampled) and indirect (hit) contributions. "Surfel GI" specifically is
the Slate render-mode construct (RT-off + GI-on); this test confirms emissive works there.

## Q2. Does the geometry-cluster (Nanite-like) feature work on all render paths?  — PARTLY; know the distinction

What exists in Frontier is **GPU cluster CULLING**, not a Nanite virtual-geometry simplification hierarchy:

- `Engine/Shaders/ClusterCull.slang` — two-phase occlusion culling (frustum → normal cone → HiZ), one thread per
  cluster, appending indirect draws consumed by `vkCmdDrawIndexedIndirectCount`. This is a **rasterization-path**
  feature (`VisibilityExchange.cpp`), and it is culling + LOD selection scaffolding, not mesh simplification.
- The **ray-traced path does NOT use cluster culling** — rays traverse the BLAS/TLAS (software CWBVH today, hardware AS
  after #31). So "clusters" affect what the *raster* visibility pass draws; they do not gate what *rays* see. Different
  render paths use different geometry front-ends by design.
- What is **NOT** built (per `Docs/ClusterLodLab.md`, stated explicitly there): a general QEM simplifier, a cluster-group
  DAG, streaming, an occlusion hierarchy, certified error bounds, or temporal geomorphing. The HTML lab is an
  educational demo, not a Nanite port. A true multi-resolution cluster LOD is still a roadmap item.

**So:** cluster culling works in the raster/visibility path; it is not part of the ray paths; and full Nanite-style
virtual geometry (simplification + LOD selection across all paths, including reflection/shadow rays) is not yet
implemented. If you want geometry clusters to also drive the RT path, that is the cluster-group-DAG-over-BLAS work the
lab doc sketches — a separate, larger item than #31.
