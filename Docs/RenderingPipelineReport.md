# Project‑Zero rendering pipeline — report, the Nanite question, and where the wins actually are

Written against the telemetry you pasted (GTX, ReSTIR path, 90 kpx, FIFO present) and the engine source
(`Engine/Shaders/*`, `Engine/DeviceExchange/*`, `Engine/DisplayPresentation/ReSTIRIntegrator.*`).

## 1. What your frame is actually made of

From the three frames you logged (GPU total 73 → 83 → 100 → 125 ms as the camera sees more):

| Stage | Time | Share | What it is |
|---|---|---|---|
| **ReSTIR kernel** | **67 – 123 ms** | **92 – 99 %** | the path‑tracing compute kernel: geometry+material+DI/GI lighting+weather, all inline |
| raster | 0.8 – 4.4 ms | ~1–6 % | cluster raster into the G‑buffer (`VisibilityExchange`) |
| cull | ~0.13 ms | <1 % | `ClusterCull.slang` (frustum → cone → HiZ) |
| resolve | 0.07 – 0.45 ms | <1 % | G‑buffer resolve |
| HiZ | 0.03 ms | <1 % | reverse‑Z min pyramid for phase‑2 occlusion |
| post | ~0.59 ms | <1 % | tonemap/present |
| **denoise (5 levels)** | **~0.5 ms total** | <1 % | à‑trous L0–L4, ~0.11 ms each |
| shadow / sky / volume | 0.00 ms | — | inline on the ReSTIR path (shared stages, not separately timed) |

**The single fact that should drive every decision: you are GPU‑bound and the ReSTIR kernel *is* the frame.**
`ReSTIRShareOfFrame` is 92 %, then 94 %, then 98 %, then 99 %. Everything else combined — raster, cull,
resolve, HiZ, post, all five denoise levels — is under 6 ms and often under 2 ms.

Note also the CPU line: 62–72 ms/frame at ~14–18 fps. That's not a CPU bottleneck; the CPU is *waiting on the
GPU* (`GpuBound = 1`). Fix the GPU and the CPU number follows it down.

## 2. "Unreal compacts everything into 1 draw call with Nanite — is that true, can we do it?"

**Two parts:**

**(a) The premise is a myth, slightly.** Nanite does not literally issue one draw call. What it actually does
is *GPU‑driven rendering*: it culls **clusters** (meshlets, ~128 tris) in a compute pass and then issues a tiny,
fixed number of **indirect** draws/dispatches whose contents the GPU filled — so the CPU cost is independent of
how many objects are on screen. For clusters whose triangles are smaller than a pixel it also *software‑
rasterises* them into a **visibility buffer**, and it streams a continuous **LOD** hierarchy of cluster groups.

**(b) You already have the important half of this.** `Engine/Shaders/ClusterCull.slang` says it in its own
header: *"Two‑phase occlusion culling (the Nanite / Niagara scheme): phase 1 clusters visible last frame
(frustum + cone) build the HiZ; phase 2 every cluster (frustum + cone + HiZ)."* The draw lists are consumed by
**`vkCmdDrawIndexedIndirectCount` — one call per phase** (`VisibilityExchange.cpp`). So:

> The **"draws 2367+4"** in your log is **not 2367 CPU draw calls** — it's the number of visible **clusters**
> packed into the indirect buffer. The CPU issues on the order of **two** `vkCmdDrawIndexedIndirectCount` calls
> (one per culling phase), regardless of object count. You are already at "≈1 draw call" in the sense people
> mean when they praise Nanite.

**So: implementing Nanite‑style draw compaction would win you almost nothing here**, because raster is 0.8–4.4 ms
and the CPU isn't the limiter. The parts of Nanite you *don't* have are software‑raster of sub‑pixel clusters,
a visibility‑buffer deferred‑material pass, and continuous LOD streaming — and none of those touch the 92–99 %
that is the ray‑tracing kernel. **Chasing draw calls / Nanite is optimising the 1 %.**

## 3. Where the wins actually are (the 99 %)

The kernel is ~1 µs/pixel at 90 kpx on a GTX. A GTX has **no RT cores**, so BVH traversal runs in *software* on
the shader cores — that is the fundamental reason it's this heavy. Levers, roughly in order of payoff:

1. **Hardware ray tracing (biggest single win, hardware change).** On an RTX card the BVH traversal moves to RT
   cores and this kernel typically drops several‑fold. If the target is GTX‑class, everything below is how you
   cope without RT cores.
2. **Spend fewer rays per pixel — and lean on reuse + the denoiser instead.** You're at **8 candidates + 3 extra
   + 3 spatial taps** with **reflections 3 / GI 2 bounces**. Every one of those is traversal work. ReSTIR's whole
   premise is *few samples, heavy reuse*; 8 initial candidates is generous. Cutting candidates/taps and bounces
   at the lower quality tiers is the most direct GPU saving. **This is exactly what the denoiser‑guide work is
   for:** a better denoiser lets you drop samples without the image falling apart, so the two efforts compound —
   fewer rays (perf) + guided denoise (quality).
3. **Render GI at reduced resolution / checkerboard, upscale.** 90 kpx is already low, but the *indirect* half
   especially tolerates half‑res + a joint bilateral upsample; primary visibility stays full‑res.
4. **Fewer bounces on perf tiers.** Reflections 3 → 1–2 and GI 2 → 1 roughly scales secondary traversal linearly.
5. **Accelerate light sampling (ReGIR / world‑space reservoir grid / light BVH).** With many lights, most of the
   8 candidates are spent *finding* a good light. A world‑space grid of reservoirs (ReGIR) or a light BVH gets
   equal quality from far fewer initial candidates → fewer shadow rays.
6. **Cheaper BVH: LOD the ray‑traced geometry, refit don't rebuild, compact BLAS.** 268 k triangles traversed in
   software is a lot; a coarser ray‑LOD for distant/secondary rays cuts traversal cost directly.
7. **Ray coherence & occupancy.** Sort/bin secondary rays, keep reservoirs in shared memory, pack them FP16 to cut
   bandwidth and divergence — the classic wavefront path‑tracer wins.
8. **The denoiser is already free (~0.5 ms) — so use it harder, not less.** Your guide additions cost ~nothing on
   the GPU; the payoff is that they *permit* levers 2–3.
9. **Present mode for honest benchmarking.** FIFO caps you at the refresh and pins `FrameTimePeakMs` at 100; use
   MAILBOX/IMMEDIATE when measuring so the cap doesn't hide real gains.

### One‑line recommendation
Leave the raster/cluster/draw path alone — it's already GPU‑driven and it's <6 % of the frame. Put all
performance effort into the ReSTIR kernel: **fewer candidates/taps/bounces per tier, half‑res indirect + upscale,
ReGIR‑style light sampling**, and let the guided denoiser hold quality while you take samples away. Hardware RT is
the only step‑change, and it's a GPU swap.
