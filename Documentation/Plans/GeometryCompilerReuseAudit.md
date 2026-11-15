# 🔍 Geometry Compiler G1/G2: Reuse Audit

> **Short answer:** I was mostly **rewriting**, and that was wrong. The engine imported from `unassignedinbox/Frontier@arena/6eeea758-frontier` (`7eb76ce`) already contains units that cover about half of what I wrote. Plan §3.1 marks them ✔️ reuse.
>
> **CLAUDE.md:** at the start of this turn I applied only the naming rules (SKILL-Naming + banned words). I did **not** re-read the full §1 startup list, and I broke §2.6 (chat-only replies) in earlier turns. I have now read the whole file.

---

## 1. 📊 What I wrote compared with what already exists

| New file (uncommitted, never compiled) | Already in the engine | Verdict |
| :--- | :--- | :--- |
| `Interchange/TriangleStreamInterchange.cpp`: OBJ reader + `usemtl` | `Interchange/GeometryInterchange::ImportWavefrontObjText` | ❌ Duplicate. Extend the existing reader with `usemtl` → `FacePartitionRegister` slots |
| Same file: an embedded `JsonTextReader` plus a glTF scene walk | `GeometryInterchange::ImportGltf2JsonText` (JSON field scan) | ❌ Duplicate. Add `ImportGlbBytes` that unwraps the GLB chunks and hands the JSON to the existing path. Node transforms are added there |
| Same file: FCT1 decode | `ParticleSpace/Origins/ControlVehicleSurfaceLoader.cpp::DecodeFct1BinaryFile` (private) | ❌ Duplicate. Promote that decoder to `Interchange` and have the loader call it |
| Same file: STL (bin/ascii), PLY (ascii/bin) | none | ✅ Truly new. Keep, but output into `PolygonNetwork` |
| `GeometrySpace/Compile/IndexedTriangleSet.h` | `GeometrySpace/Network/PolygonNetwork` + `FacePartitionRegister` | ❌ A parallel geometry type. The plan routes everything through `PolygonNetwork` |
| `Compile/SourceUnitConversion.*`: weld | `Primitives/WatertightSewing::WeldCoincidentVertices` | ❌ Duplicate weld. Keep only the unit-scale and up-axis rotation |
| `Compile/ConnectivityReport.*`: open / non-manifold edges, area | `WatertightSewing::EvaluateWatertightAudit` (open, non-manifold, orientation, Euler, volume, area) | ❌ Duplicate. Only **part count** is missing. Add it to the audit |
| `Compile/CornerNormalSplitter.*` | `PolygonNetwork::RecomputeNormals` covers smooth only | ⚠️ Flat and angle split are new. Build them on top of `PolygonNetwork` |
| `Compile/GeometryTransformDirectives.*` | none | ✅ New (plan 🚧) |
| `SimulationSpace/PhysicsSpace/CollisionFitSolver.*` | none | ✅ New (plan 🚧) |
| `Compile/CompileStepSequence.*` + `GeometryCompileSession.*` | none | ✅ New (plan 🚧) |
| `Exhibits/GeometryCompileExhibitCanvas.h`: a CPU clay painter in `ImDrawList` | `SoftwareRasterCanvas` + the existing exhibit pattern | ⚠️ This is exhibit-only, but it is a home-made renderer. Check it against CLAUDE.md §2.5 before keeping it |

## 2. ⚠️ Other mistakes found

| Issue | Fix |
| :--- | :--- |
| Models were read from `Experimental/Shared/Models/*.facet`, and the reader detects the extension `facet` | The engine copies are `EngineContent/EnvironmentArchives/ControlVehicle/*.face`. `facet` is a banned word. Use `.face` |
| My reader exhibit, which was still in progress, tests the readers with a home-made STL/PLY/OBJ/GLB writer round trip | Keep the round-trip idea, but use `GeometryInterchange::ExportWavefrontObjText` and `ExportGltf2JsonText` where they exist |

## 3. ✔️ Approved rework

| # | Change |
| :---: | :--- |
| 1 | Delete `IndexedTriangleSet.h`, `ConnectivityReport.*`, and the OBJ / JSON / FCT1 parts of `TriangleStreamInterchange.cpp` |
| 2 | `GeometryInterchange`: add `usemtl` slots, `ImportGlbBytes`, `ImportStlBytes`, `ImportPlyBytes` and `ImportFct1Bytes` (moved from `ControlVehicleSurfaceLoader`). All of them output `ConstructedSampleAsset` / `PolygonNetwork` |
| 3 | `WatertightSewing`: add `PartCount` to `WatertightAuditSummary` |
| 4 | Port the session, sequence, transform, normals and collision code onto `PolygonNetwork`. Weld goes through `WeldCoincidentVertices` |
| 5 | Then build, run ctest and produce the PNGs |

---

## 4. 🧭 Rework decisions (from scratch, reuse first)

### 4.1 Where FCT1 slot codes live

| Option | Reuse | Lossless | Consumers | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| A — `Face.PartGroupOrdinal` = raw slot code (6..15), plus one `FacePartitionRegister` layer per slot (4-layer cap like OBJ) | ✔️ existing field and register | ✔️ | `GeometryCodec`, `StudyGeometryBuilder`, `UVWorkspaceRasterizer` already read it | 🥇 |
| B — new `MaterialSlotOrdinal` field on `Face` | ❌ widens `Face` | ✔️ | none yet | 🥉 |
| C — layers only | ✔️ | ❌ 4-layer cap drops slots | — | 🥈 |

⭐ **A.** OBJ `usemtl` keeps its existing behaviour (one `PartGroupOrdinal` per name, ≤ 4 layers), so both readers report slots the same way.

### 4.2 GLB and glTF node transforms

| Option | Reuse | Covers TRS + matrix | Verdict |
| :--- | :--- | :--- | :--- |
| A — `ImportGlbBytes` unwraps chunks, then one shared glTF document walk (nodes → meshes → primitives) used by both `.gltf` and `.glb` | ✔️ `ImportGltf2JsonText` body, `SplitJsonObjectArray`, accessor resolver | ✔️ local 3 × 4 affine | 🥇 |
| B — convert node TRS to `SpatialTransform` (Euler XYZ) | ✔️ | ❌ quaternions lose precision, matrices cannot be expressed | 🥈 |

⭐ **A.** `SplitJsonObjectArray` becomes depth-aware (top-level keys only), because `scenes[0].nodes` appears before the root `nodes` array.

### 4.3 Angle-split normals

| Option | Reuse | Verdict |
| :--- | :--- | :--- |
| A — factor step 1 of `EvaluateContinuousCornerTangents` into `EvaluateCreaseCornerNormals(Network, CreaseAngleDegrees)`; tangents call it with 55° | ✔️ same code path, no behaviour change | 🥇 |
| B — copy the loop into the compile session | ❌ duplicate | 🥉 |

⭐ **A.** Angle mode = `MarkDihedralSharpSeams(angle, false)` + `EvaluateCreaseCornerNormals(angle)`. Smooth = `RecomputeNormals` vertex normals. Flat = face `GeometricNormal`.

### 4.4 Homes for the genuinely new units

| Unit | Home | Why |
| :--- | :--- | :--- |
| `CollisionFitSolver` (box, Ritter sphere, capsule, volume) | `Engine/SimulationSpace/PhysicsSpace/` | `FolderStructure.md` lists PhysicsSpace; no bounding-volume utility exists |
| `GeometryCompileSession` + `GeometryCompileSteps` (settings, step sequence, invalidation, source / geometry / collision / meta runners) | `Engine/Workspaces/Geometry/` | `FolderStructure.md` lists it as the headless GeometrySpace authoring runtime |
| STL / PLY / FCT1 readers | `Engine/Interchange/GeometryInterchange` | same unit as OBJ / glTF |

UV, SDF, LOD and icon steps exist in the sequence (for invalidation) but report **Pending — lands in G3/G4**; they never claim a result.

### 4.5 Exhibit rendering

| Option | Reuse | CLAUDE.md §2.5 | Verdict |
| :--- | :--- | :--- | :--- |
| A — `UVWorkspaceRasterizer::Rasterize3DViewport` (Vulkan, `PriorityLayerTint`) blitted into `SoftwareRasterCanvas` | ✔️ the engine's real viewport | ✔️ GPU | 🥇 |
| B — ImGui isometric polygons | ✔️ exhibit pattern | ⚠️ CPU painter | 🥈 |

⭐ **A** for clay tiles and the vehicle; ImGui only for labels, the step timeline and the 2D collision-fit overlays.

### 4.6 Gates

| Exhibit | Checks | Proof |
| :--- | :--- | :--- |
| `GeometryReaderValidation` | OBJ cube 12 tris / 2 slots / 8 tris in slot 2; STL bin + ascii; PLY ascii quad + bin; GLB node +2 X; `.fbx` → no reader; FCT1 body 2924 / 1492 (slots 6, 13), tyre 3968, rim 1568; truncated FCT1 rejected | `01-ReaderFormatTiles.png` |
| `GeometryCompileValidation` | body 6.2202 × 1.4574 × 2.4996, cm → 0.062202; welded cube closed / 1 part; loose quad 5 → 4; flat + 40° normals axis-aligned, smooth blends; box / sphere / capsule fits; uv-only and geometry-downstream invalidation, lod off, floor pivot; vehicle body centre none, low Z −0.10586, 8 slots | `02-CompileStepTimeline.png`, `03-CollisionFits.png` |

## 5. ✔️ Results: G1 and G2 gates passing

| Exhibit | Checks | Proof |
| :--- | :--- | :--- |
| `GeometryReaderValidation` | ✔️ 29 / 29 | `Exhibits/Images/GeometryCompiler/01-ReaderFormatTiles.png` |
| `GeometryCompileValidation` | ✔️ 29 / 29 | `02-CompileStepTimeline.png`, `03-CollisionFits.png` |
| Full `ctest` | ✔️ 53 / 54 | the only failure is `MaterialWorkspaceUIValidation` (an ImGui assert that predates this work) |

- 🧩 The six tiles are real reader outputs (OBJ, glTF, GLB with a parent and a child instance, binary STL, binary PLY, FCT1), rendered by `UVWorkspaceRasterizer::Rasterize3DViewport` on Vulkan.
- 🧩 FCT1 slot code 15 (`Default`, the licence plates) also appears on the body, so `QueryFct1SlotTitle` covers 6..15. The body has 8 distinct slots.
- 🧩 Shared exhibit studio: `Exhibits/GeometryCompileExhibitStudio.h` (Vulkan tiles, ImGui labels, scoreboard).
- ⏭️ Next is G3: the UV / SDF / LOD / icon runners replace the `Deferred` reports.
