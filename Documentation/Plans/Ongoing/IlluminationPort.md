# VehicleHMI ReSTIR GI — 1:1 C++/Vulkan/Slang port

## Status

| Area                                   | State        | Evidence                                                        |
|----------------------------------------|--------------|-----------------------------------------------------------------|
| WGSL → Slang (51 units, 29 entries)    | ✔️ compiles  | `Frontier/Engine/Shaders/Illumination/`                         |
| `DeviceExchange` (raster + compute)    | ✔️ compute   | bit-identical occupant distance space                           |
| Scene topology + vertex stream         | ✔️ identical | 3,964,224 B vertex upload byte-identical                        |
| Bounding structures (32 sets)          | ✔️ identical | entry + facet uploads byte-identical                            |
| Occupant distance space                | ✔️ identical | 13,166,440 half values, 100 % bit-identical                     |
| Scene distance cascades                | 🚧           |                                                                 |
| Surface cards                          | 🚧           |                                                                 |
| Ray tracing space (BLAS/TLAS)          | 🚧           |                                                                 |
| Atmosphere, shadow, surface, direct    | 🚧           |                                                                 |
| ReSTIR GI, reflection, SVGF, display   | 🚧           |                                                                 |

## Source of truth

- SultanAladin/Frontier `arena/e9bd7db5-frontier` @ `6afb6f00b5f25c45f7cda92c7da65b64845768f3`,
  `Experimental/VehicleHmiPrototype/` (WebGPU JS + WGSL), plus `ReferenceApps/Working/` (imported by the demo).
- Reference run: the demo itself under Node + Dawn (`webgpu@0.6.2`) on SwiftShader, recorded by
  `Exhibits/RestirGiParity/Tools/CaptureHooks.mjs` (write log, command log, scene topology, raw targets).

## Method

1. Shaders: `Frontier/Projects/Project-VehicleHmiDemo/Contract/TranslateShaders.py` makes a first token-level pass
   (declarations, entry points, WGSL builtin semantics via `IntrinsicParity.slang`, matrix products, rename table);
   the output is then corrected by hand. Matrices: WGSL columns are stored as Slang rows (`-matrix-layout-row-major`),
   so WGSL `M * v` is Slang `mul(v, M)`.
2. Host: each demo module is ported statement for statement; JS doubles stay doubles, `Float32Array` stores round
   through `float` (`StoreSingle`), JS `Math.hypot` is reproduced (V8 algorithm), stable sorts stay stable.
3. Device: `DeviceExchange` keeps WebGPU ordering — queue writes precede the next submission, every dispatch is
   ordered after earlier work, images live in `GENERAL`, raster viewports are y-flipped like Dawn's Vulkan backend.
4. Parity: every host upload is compared byte for byte with the demo's write log; every device target is compared
   texel for texel with the demo's dump of the same refresh.

## Naming rulings (SKILL-Naming.md conflicts in the demo vocabulary)

| Demo                         | Port                        | Rule hit              |
|------------------------------|-----------------------------|-----------------------|
| `FrameRecord` / `Frame`      | `RefreshConstants` / `Refresh` | `Frame`, `Record`  |
| `FrameIndex`                 | `RefreshIndex`              | `Frame`               |
| `FrameDescriptor.wgsl`       | `RefreshDescriptor.slang`   | `Frame`               |
| `*Record` structs            | `*Profile` / `PackedReservoir` / `*Constants` | bare `Record` |
| `SceneRecords.wgsl` etc.     | `SceneLayouts.slang` etc.   | `Record`              |
| `RayTraversal.wgsl`          | `RayIntersection.slang`     | `Traversal`           |
| `DistanceTraversal.wgsl`     | `DistanceMarch.slang`       | `Traversal`           |
| `ReflectionTraversal.wgsl`   | `ReflectionTrace.slang`     | `Traversal`           |
| BVH `Node`                   | `Entry`                     | `Node`                |
| `Emission`                   | `Incandescence`             | `Emission`            |
| `OccupantRole` / `Roles`     | `OccupantParticipation`     | `Role`                |
| `Footprint`                  | `Coverage`                  | `Footprint`           |
| `VarianceKernel`             | `VarianceFilter`            | `Kernel`              |
| `LightingSystem.js`          | `LuminaireTable`            | `system`              |

## Scope decisions

- Ported: everything the demo executes for the illumination image with clouds, cloud shadows, lens flare, smoke,
  sparks and tyre marks switched off (the reference run switches them off too).
- Not ported: those effect systems, vehicle physics, HMI/cabin overlays, editor UI of the demo.
- Removed from the engine: the earlier non-1:1 CPU illumination chain (see Tracker).
