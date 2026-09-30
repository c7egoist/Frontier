# Wiring the hardware RT-core traversal path (roadmap #31)

Research + design + integration for turning Frontier's ReSTIR kernel from a **software CWBVH compute walk** into one
that traverses the **hardware acceleration structure on the RT cores**. The owner will test on an RT-core PC; this doc
exists so the code that runs there is the correct one.

---

## 1. The three "versions" — which one, and why

There are genuinely different ways to use RT hardware in Vulkan; they are not interchangeable. All of them build on the
common base extension **`VK_KHR_acceleration_structure`** (the BLAS/TLAS the hardware traverses). [1](https://docs.vulkan.org/guide/latest/extensions/ray_tracing.html) [3](https://www.khronos.org/blog/ray-tracing-in-vulkan)

| Version | Extension | Where rays are traced | Fit for Frontier |
|---|---|---|---|
| **Software traversal** (today) | none | compute shader walks Slate's own CWBVH | works on any Vulkan 1.2 GPU incl. GTX; no RT cores used |
| **Inline ray query** ✅ | `VK_KHR_ray_query` | `rayQueryEXT` **inline in the existing compute shader** | **the right choice — drop-in, keeps the whole kernel as one dispatch** |
| **Ray-tracing pipeline (SBT)** | `VK_KHR_ray_tracing_pipeline` | dedicated raygen/closest-hit/miss stages + shader binding table | later high tier; large rewrite, not needed here |

**Decision: inline ray query (`VK_KHR_ray_query`).** The reasons are specific to this codebase, not generic:

- The ReSTIR kernel is **one compute dispatch** and every shading/reservoir decision already lives in it. Ray query
  lets a compute shader trace against the AS *inline* — no new shader stages, no SBT, no payload marshalled out to
  memory and back each bounce. [1](https://docs.vulkan.org/guide/latest/extensions/ray_tracing.html) [7](https://www.reddit.com/r/vulkan/comments/ko9wz4/are_vulkan_rt_extensions_vk_khr_acceleration/)
- On simple-to-moderate scenes inline ray query is measured **faster** than both pipeline variants precisely because it
  is the leanest — the trace is a local call and data stays in registers, while the pipeline path pays for stage
  dispatch and payload round-trips. [6](https://medium.com/@Ksatese/vulkan-path-tracer-b719b296285a)
- It is a **drop-in**: the kernel already funnels *all* traversal through two functions (below), and ray query returns
  exactly the data they return. Nothing else in the 2 300-line shader changes.
- The engine's own tier enum already anticipates this: `RayTracingTierCategory{ Software, RayQuery, Pipeline }`
  (`Engine/DeviceExchange/RayTracingCapabilitySet.h`). We are implementing the **RayQuery** tier; **Pipeline** stays a
  future high tier.

The one caveat from the research: on some architectures (Intel Xe) a wavefront full of inline `TraceRayInline` can stall
execution units while the RT cluster works, where the separated pipeline can repack rays to hide divergence. [4](https://www.reddit.com/r/vulkan/comments/vph2gt/is_ray_query_intended_as_a_replacement_for_ray/) That is an
argument for the *Pipeline* tier as a later high-end option on divergent workloads — not a reason to skip RayQuery,
which is the correct, portable, high-value first step (and best on NVIDIA/AMD for this kind of megakernel).

---

## 2. The seam — only two functions change

`ReSTIRViewport.slang` already abstracts traversal behind exactly two entry points, and everything downstream
(`TraceScene`, `TraceShadow`, material resolve, both reservoir pools) is written in terms of them:

```glsl
TraversalResult TraceTraversal(vec3 origin, vec3 dir, vec3 rD, float tmax); // closest hit
bool            TraceTraversalOccluded(vec3 origin, vec3 dir, vec3 rD, float tmax); // any hit
```

`TraversalResult` carries `{ float t; uint primitive /*LOCAL*/; uint instance; bool valid; }`. Ray query hands back the
**same pair** natively:

- `rayQueryGetIntersectionInstanceCustomIndexEXT` → `instance` (we set the custom index = the top-level row at build)
- `rayQueryGetIntersectionPrimitiveIndexEXT` → `primitive` (the LOCAL triangle index inside the BLAS)
- `rayQueryGetIntersectionTEXT` → `t`

So `FlatPrimitiveOf()`, `InstanceNormalToWorld()`, the `(instance, primitive)` hit identity (D2/D10) and the alpha-mask
retrace loop are all **unchanged**. That is why this is a drop-in rather than a rewrite.

The replacement lives in `Shaders/ReSTIRTraversal_RayQuery.slang` and is switched in by
`Patches/ReSTIRViewport_RayQuery.patch`, which wraps the two software functions in `#ifndef FRONTIER_RAYQUERY` and
`#include`s the ray-query versions in the `#ifdef` arm. (Patch verified `git apply --check` clean against `main`.)

### The inline trace (opaque closest hit)
```glsl
rayQueryEXT rq;
rayQueryInitializeEXT(rq, Tlas, gl_RayFlagsOpaqueEXT, 0xFFu, origin, 0.0, dir, tmax);
while (rayQueryProceedEXT(rq)) { }          // all geometry opaque → no candidate handling
if (rayQueryGetIntersectionTypeEXT(rq, true) == gl_RayQueryCommittedIntersectionTriangleEXT) { /* read t, prim, custom index */ }
```
Occlusion adds `gl_RayFlagsTerminateOnFirstHitEXT` and only asks whether the committed type is not `...NoneEXT`. This is
the canonical ray-query shape from the Khronos blog and the Arm/SaschaWillems samples. [2](https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/ray_tracing/rt03_ray_traversal/) [3](https://www.khronos.org/blog/ray-tracing-in-vulkan) [7](https://www.reddit.com/r/vulkan/comments/ko9wz4/are_vulkan_rt_extensions_vk_khr_acceleration/)

### Alpha cut-outs
Geometry is built with `VK_GEOMETRY_OPAQUE_BIT_KHR`, so a ray-query closest hit can land on a cut-out texel — exactly
as the software walk does. `TraceScene`/`TraceShadow` already **re-trace from just past the hit** for up to
`kAlphaMaskRetraceLimit` passes, so cut-outs resolve identically with zero extra shader work here. (A later refinement
can mark alpha materials non-opaque and confirm in the `rayQueryProceedEXT` loop with
`rayQueryConfirmIntersectionEXT`; not needed for parity.)

---

## 3. Descriptor placement — a new set 1

Set 0 in the ReSTIR kernel is **completely packed** (bindings 0–31) and the bindless `Textures[]` array must remain the
last binding of its set (a variable-count binding has to be last). There is no free slot. The TLAS therefore goes in its
**own descriptor set**:

```glsl
layout(set = 1, binding = 0) uniform accelerationStructureEXT Tlas;   // only declared under FRONTIER_RAYQUERY
```

The host creates and binds set 1 **only** when the resolved tier ≥ RayQuery, so a software-tier run never references it
and set 0 is untouched. Ray query allows an AS descriptor in any set/stage, so this is legal and clean. [1](https://docs.vulkan.org/guide/latest/extensions/ray_tracing.html)

---

## 4. Host work — `HostWiring/RayQueryAccel.{h,cpp}`

Standard `VK_KHR_acceleration_structure` build; the module is self-contained for review and mirrors the
Khronos/nvpro/SaschaWillems recipe. [3](https://www.khronos.org/blog/ray-tracing-in-vulkan) [9](https://gpuopen.com/news/vulkan-ray-tracing-extensions/)

1. **Device creation** — `AppendDeviceRequirements(tier, ...)` adds `VK_KHR_acceleration_structure`,
   `VK_KHR_ray_query`, `VK_KHR_deferred_host_operations` and chains the `accelerationStructure`, `rayQuery` and
   `bufferDeviceAddress` feature structs. No-op below the RayQuery tier. (`bufferDeviceAddress` is required by AS builds
   and is already flagged in `RayTracingCapabilitySet`.)
2. **BLAS per instance** — object-space triangles, vertex/index device addresses taken from the **same** `Vertices[]`
   (binding 11) / `Indices[]` (binding 12) buffers the raster + CWBVH paths use, offset by the instance's
   `VertexOffset`/`FirstIndex`. `vertexStride = sizeof(GpuVertex) = 64`. Built `PREFER_FAST_TRACE`, opaque.
3. **TLAS** — one `VkAccelerationStructureInstanceKHR` per instance: `transform` = `GpuInstance.World` (row-major 3×4,
   which is byte-identical to `VkTransformMatrixKHR`), **`instanceCustomIndex = top-level row`** (this is the value the
   shader reads back as `instance`), `accelerationStructureReference` = BLAS device address.
4. **Single-blob scene** (`TlasInstanceCount == 0`, the pre-D6 path): build **one** BLAS over the world-space triangles
   and **one** identity TLAS instance with custom index 0. Then `FlatPrimitiveOf()` returns `result.primitive` directly
   — and a single-geometry BLAS's primitive index *is* the flat index — so both paths agree with no branch in the
   shader.
5. **Descriptor** — `CreateSetLayout` (one `ACCELERATION_STRUCTURE_KHR` binding, COMPUTE) + `WriteDescriptor`
   (`VkWriteDescriptorSetAccelerationStructureKHR`).

Reuse the engine's `AllocateBuffer(...)` in place of the module's `MakeBuffer` when integrating; the signatures line up
(the AS/scratch buffers just need `..._STORAGE_BIT_KHR` / `SHADER_DEVICE_ADDRESS_BIT` usage and device-local memory).

### Call sites in the engine (where to hook)
- **Device create** (`SwapchainExchange` device bring-up): call `AppendDeviceRequirements` while assembling the
  extension list + `pNext` chain.
- **Per resident scene** (after `UploadInstances`, alongside the software TLAS build): fill `RayQueryInstanceDesc` from
  `Instances[]` and call `Build(...)` on a one-shot command buffer.
- **Pipeline** (`MakeCompute` for the ReSTIR kernel): when tier ≥ RayQuery, load the `-DFRONTIER_RAYQUERY` SPIR-V
  variant and add set-1 layout to the pipeline layout; else load the existing software SPIR-V. This is the tier switch —
  `RayTracingCapabilitySet::QuerySupportedTier()` resolved against the config request already exists to drive it.
- **Record** (`SwapchainExchange::RecordComputeCommands`, ~L3116; the ReSTIR dispatch ~L3287): `vkCmdBindDescriptorSets`
  set 1 = the AS set before the ReSTIR dispatch when the RayQuery pipeline is bound.

---

## 5. Toolchain

Ray query needs SPIR-V 1.4 and the extension enabled. Build the second SPIR-V variant alongside the existing one:

```sh
glslc -fshader-stage=compute --target-env=vulkan1.2 --target-spv=spv1.4 \
      -DFRONTIER_RAYQUERY -I Engine \
      Engine/Shaders/ReSTIRViewport.slang -o ReSTIRViewport.rayquery.spv
# and, as today, the software variant without the define:
glslc -fshader-stage=compute --target-env=vulkan1.2 -I Engine \
      Engine/Shaders/ReSTIRViewport.slang -o ReSTIRViewport.spv
```
(First copy `RaytraceToggle/HardwareRT/Shaders/ReSTIRTraversal_RayQuery.slang` → `Engine/Shaders/`.) The `GL_EXT_ray_query`
`#extension` line lives inside that included file, guarded by the define, so the software build never sees it.

---

## 6. Fallback / correctness guarantees

- **Never faked upward:** `RayTracingCapabilitySet` trusts the device *extension* list before the feature flag (early
  Pascal drivers advertised `rayQuery=true` then crashed at pipeline creation), and the config may force a lower tier.
  On any device without genuine `VK_KHR_ray_query`, the tier resolves to Software and none of this code path is created.
- **Identical results:** the ray-query and software walks return the same `(t, instance, local-primitive)`, feed the
  same material/normal resolve, and share the alpha retrace loop — so a RayQuery frame should match a software frame
  within traversal-precision noise. That equality is the first thing to check on the RT PC (`--restir` A/B of the two
  SPIR-V variants at a fixed seed).

## 7. Status

- ✅ Shader traversal variant written to the exact seam interface; **patch applies clean** (`git apply --check`).
- ✅ Host AS build + descriptor authored to the spec (BLAS/TLAS, custom-index = instance row, set-1 binding).
- ✅ Device-requirement + tier-gating helper.
- ⚠️ **Not compiled or run** — the authoring sandbox has no GPU, no Vulkan loader and no ray-query-capable `glslc`.
  The one remaining task is exactly the owner's: build the `-DFRONTIER_RAYQUERY` variant and run it on an RT-core card,
  then A/B it against the software walk. This is the §B GPU-verification item for #31.

## Sources
- Khronos: *Ray Tracing in Vulkan* (three extensions; ray query traces from any stage). [3](https://www.khronos.org/blog/ray-tracing-in-vulkan)
- Vulkan Docs: ray_tracing extensions guide (ray query = traversal inline in shader; complementary to pipeline). [1](https://docs.vulkan.org/guide/latest/extensions/ray_tracing.html)
- Arm learning path: ray-query call sequence (`rayQueryInitializeEXT`/`ProceedEXT`/`GetIntersection*`). [2](https://learn.arm.com/learning-paths/mobile-graphics-and-gaming/ray_tracing/rt03_ray_traversal/)
- Vulkan path tracer backend comparison: inline ray query fastest on simple scenes (registers vs payload round-trip). [6](https://medium.com/@Ksatese/vulkan-path-tracer-b719b296285a)
- r/vulkan: ray query works from compute; pipeline needed only for the separate-stage model; divergence tradeoff. [4](https://www.reddit.com/r/vulkan/comments/vph2gt/is_ray_query_intended_as_a_replacement_for_ray/) [7](https://www.reddit.com/r/vulkan/comments/ko9wz4/are_vulkan_rt_extensions_vk_khr_acceleration/)
- AMD GPUOpen: driver support for the three KHR RT extensions. [9](https://gpuopen.com/news/vulkan-ray-tracing-extensions/)
