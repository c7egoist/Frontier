# HardwareRT — wiring the RT-core (RayQuery) traversal path (#31)

The hardware ray-tracing path for the ReSTIR kernel. Full research + design + integration guide in
**`RayQueryHardwarePath.md`**. Summary:

- **Choice:** inline **`VK_KHR_ray_query`** (trace on RT cores from the existing compute shader), NOT a ray-tracing
  pipeline/SBT — because the kernel is one dispatch and ray query is a drop-in and the fastest option for this megakernel
  shape. The SBT pipeline is a later high tier. The engine's `RayTracingCapabilitySet` tier enum already names both.
- **Seam:** only two shader functions change — `TraceTraversal` / `TraceTraversalOccluded` — because ray query returns
  the exact `(t, instance, local-primitive)` the kernel already consumes. Everything downstream is untouched.

## Files
- `RayQueryHardwarePath.md` — the doc (three approaches + why RayQuery, the API, AS build, descriptor set 1, toolchain, fallback, sources).
- `Shaders/ReSTIRTraversal_RayQuery.slang` — RayQuery `TraceTraversal`/`TraceTraversalOccluded` + the `accelerationStructureEXT` binding, guarded by `FRONTIER_RAYQUERY`. Copy to `Engine/Shaders/` before building.
- `Patches/ReSTIRViewport_RayQuery.patch` — swaps the software traversal for the include under the define. **`git apply --check` clean** against `main`.
- `HostWiring/RayQueryAccel.{h,cpp}` — BLAS-per-instance + TLAS build, device-requirement/tier gating, set-1 AS descriptor.

## Build the variant (on the RT-core PC)
```sh
cp Shaders/ReSTIRTraversal_RayQuery.slang <Frontier>/Engine/Shaders/
git apply Patches/ReSTIRViewport_RayQuery.patch     # from the Frontier repo root
glslc -fshader-stage=compute --target-env=vulkan1.2 --target-spv=spv1.4 \
      -DFRONTIER_RAYQUERY -I Engine Engine/Shaders/ReSTIRViewport.slang -o ReSTIRViewport.rayquery.spv
```

## Status
Shader + host + patch authored to spec and the patch verified; **not compiled/run** (no GPU, no ray-query `glslc` in the
authoring sandbox). Remaining task = build the `-DFRONTIER_RAYQUERY` variant on an RT card and A/B it against the software
walk at a fixed seed (results must match within traversal precision). That is the owner's test.
