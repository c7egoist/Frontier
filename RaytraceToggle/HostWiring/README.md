# Thread E-2 — Host-side wiring (compile on your GPU)

This folder completes the "your machine" seams the first Thread E delivery left open, so the surfel-GI
render path can be built and run on a real Vulkan device. Everything here has been **compiled and
verified as far as is possible without a GPU** in this sandbox:

| Artifact | What it is | Verified here |
|---|---|---|
| `SurfelGIStage.h` / `SurfelGIStage.cpp` | Self-contained host module: allocates the surfel SSBOs, builds the hash grid **host-side**, creates the three compute pipelines, and records the three `vkCmdDispatch` calls with barriers + per-frame surfel logging. | `g++ -std=c++17 -fsyntax-only` against real **Vulkan-Headers** → **clean** |
| `Patches/SurfaceResolve_MaterialAux.patch` | Adds the metal/rough **aux G-buffer target** (binding 14 `MaterialImage`) to `SurfaceResolve.slang`. | glslang → SPIR-V **31 204 B** (PASS) |
| `Patches/BuildDispatch_FeatureBits.patch` | Packs the feature bits in `BuildDispatch` — `kFeatureRaytracing` (bit 11) + the 2-bit reflection mode (bits 15-16) — and adds the matching `DispatchFeature` enum values. | `git apply --check` **clean** |
| `Patches/RaytracingIcon.patch` | The dedicated **Raytracing tile icon** (`RaytracingBeam`) — enum value + baked glyph path. | `git apply --check` clean; table size ↔ enum `Count` consistent (41 ↔ 41) |
| `../Shaders/SurfelCommit.slang` | Tiny Jacobi-commit pass (`Irradiance = IrradianceNew`) so the whole stage stays on-GPU (no per-frame readback). | glslang → SPIR-V **1 700 B** (PASS) |
| `shader_compile_proof.txt` | glslang lowering log for all four shaders touched this round. | — |
| `IconPreview/RaytracingIcon.png` | Preview of the new tile glyph beside the sparkles glyph it replaces. | — |

The four patches apply **cleanly together** on a pristine `SultanAladin/Frontier-@main` tree, on top of the
original `../Patches/RaytraceToggle_Integration.patch` (which was regenerated so the Raytracing tile now
points at `RaytracingBeam`).

---

## 1. What the module does (`SurfelGIStage`)

`RenderPath == 1` (RT off, GI on) runs the surfel path. The module owns its whole lifecycle:

1. **SSBO allocation** — three device-local storage buffers + host-visible staging mirrors:
   * `Surfels[]`   (`GpuSurfel`, 80 B) — the persistent surfel field (binding 0 / resolve binding 10);
   * `SurfelGridHead[]` (int, one per hash cell) — first surfel in each cell, `+1`-encoded;
   * `SurfelGridNext[]` (int, one per surfel) — next-in-cell chain, `+1`-encoded.
2. **Host-side hash-grid build** (`UpdateField`) — ages the field, spawns new surfels from the supplied
   surface samples up to `MaxSurfels`, recycles dead slots, then clears the head table and prepends every
   live surfel to its cell chain. The `CellHash` is byte-identical to the shaders' (73856093/19349663/83492791,
   `% GridHashSize`), so host bins and GPU lookups agree. All three buffers are uploaded to staging.
3. **Three dispatches** (`RecordFrame`) — staging→device copy + barrier, then
   `SurfelIrradianceUpdate` (⌈live/64⌉ groups) → barrier → `SurfelCommit` (Jacobi swap) → barrier →
   `SurfelGIResolve` (16×16 tiles, writes the presentation image).
4. **Logging** — `[SurfelGI] frame N live=… spawned=… recycled=… coverage=… rays=…` (throttled to ~1 Hz),
   satisfying the "add logs for surfel GI" requirement on the host side too (the shaders already carry the
   in-kernel counters).

Everything device-specific is passed in through `SurfelStageInit` (device, memory props, descriptor pool,
the shared CWBVH node/leaf buffers, the G-buffer image views incl. the new `MaterialAuxView`, and the sky
cube). The module never reaches into `SwapchainExchange` internals.

### Spawn source (the one caller-supplied input)
`UpdateField` takes `std::vector<SurfaceSample>` — primary-surface points to seed surfels from. Feed it from
a coarse `SurfaceImage` readback (one sample per screen tile) or from scene-geometry sampling. Pass an empty
vector and the field simply ages and holds; it never crashes for lack of samples.

---

## 2. Three call sites in `SwapchainExchange.cpp`

The module is dropped in with three edits (kept out of the patch because they interleave with private
per-frame bookkeeping that differs by branch; they are mechanical):

```cpp
// (a) member — beside the other stages
Frontier::SurfelGIStage SurfelStage;

// (b) bring-up — add to the ordered stage list in Compose(), AFTER BringStorageImage (the G-buffer views
//     must exist) and AFTER the CWBVH buffers are resident, BEFORE BringDescriptorSet is not required:
{
    Frontier::SurfelStageInit Init{};
    Init.Device           = Vulkan->Device;
    Init.MemoryProperties = Vulkan->MemoryProperties;
    Init.DescriptorPool   = Vulkan->DescriptorPool;
    Init.CwbvhNodeBuffer  = Vulkan->TraversalNodeBuffer;   // same buffer bound at 8
    Init.CwbvhLeafBuffer  = Vulkan->TraversalLeafBuffer;   // same buffer bound at 9
    Init.OutputImageView  = Vulkan->OutputImageView;
    Init.SurfaceImageView = Vulkan->SurfaceImageView;
    Init.NormalImageView  = Vulkan->NormalImageView;
    Init.AlbedoImageView  = Vulkan->AlbedoImageView;
    Init.MaterialAuxView  = Vulkan->MaterialImageView;     // NEW — see §3
    Init.SkyCubeView      = Vulkan->SkyCubeView;
    Init.SkyCubeSampler   = Vulkan->SkyCubeSampler;
    Init.GridCellSize     = 0.09f;                         // scene-scaled (≈ surfel RMAX)
    Init.SpirvDirectory   = "Engine/Shaders";
    if (!SurfelStage.Bring(Init)) return false;
}

// (c) record — in RecordComputeCommands(), replacing the `RenderPath == 1` branch. Build the frame params
//     from the same DispatchConfiguration the kernel uses, run the host field update, then record:
if (SurfelPathActive)   // (Dispatch.FeatureFlags bit 11 clear) && GI on
{
    Frontier::SurfelFrameParams P{};
    /* fill P.Sun*, P.Sky*, P.GridOrigin (min corner of the live AABB), P.CameraEye, P.Exposure,
       P.RayCount, P.FrameIndex = Dispatch.AccumulationIndex, P.FeatureFlags = Dispatch.FeatureFlags,
       P.ReflectionMode = (Dispatch.FeatureFlags >> 15) & 3, P.RenderWidth/Height */
    SurfelStage.UpdateField(SurfaceSamples, P);   // host hash-grid build + upload
    SurfelStage.RecordFrame(Command, P);          // update -> commit -> resolve
}

// (d) teardown — in the destroy path
SurfelStage.Destroy();
```

---

## 3. The one remaining device seam: `MaterialImage` allocation

The shader half of the aux target is done (`SurfaceResolve_MaterialAux.patch` adds binding 14). Its companion
host allocation lives in **`VisibilityExchange`** (which owns the SurfaceResolve descriptor set and creates
`SurfaceImage`/`NormalImage`). It is not in this sandbox's sparse clone, so it is documented rather than
patched. Add, exactly mirroring the existing `NormalImage` (rgba16f) creation:

```cpp
// storage image, render-region sized, GENERAL layout, rgba16f — one line beside NormalImage:
CreateStorageImage(Device, MemoryProperties, VK_FORMAT_R16G16B16A16_SFLOAT, Extent,
                   MaterialImage, MaterialMemory, MaterialImageView, "material aux image");

// descriptor: add binding 14 to the SurfaceResolve set layout (STORAGE_IMAGE, COMPUTE) and write
//   MaterialImageView into it in the resolve set's WriteDescriptorSet() — next to bindings 10/11.
```

`SurfelGIStage` binds that same `MaterialImageView` at resolve binding 4, so once this allocation exists the
non-raytraced paths read continuous metalness/roughness and shade **every material correctly** (metals
reflect, dielectrics diffuse) — the CPU mirror in `../MaterialGrid` shows the target result.
