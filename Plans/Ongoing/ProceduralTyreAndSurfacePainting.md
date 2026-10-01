# Procedural tyre, lattice deformation, editor tooling and surface painting

Four phases. Phase 1 is a port with a measurable gate, Phase 2 is the piece that makes the generated
tyre deform, Phase 3 is editor surface, Phase 4 opens the painting application. Rims are explicitly on
hold; the rim generator on `arena/01a0f767-slate` is not part of this plan.

## Decision: cage deformation, not vertex animation textures

VAT was proposed because the generated tyre is high poly. It is the wrong mechanism here and the reason
is not performance, it is that a VAT replays a **fixed** animation indexed by `(vertex, frame)`. XPBD
deformation is not an animation; it is a response to vertical load, camber, slip angle, inflation
pressure and the road surface underneath. There is no frame axis to bake against, and the space of
states is not enumerable.

The budget argues the same way:

| Approach | Cost for one tyre |
|---|---|
| VAT, 60 frames, half-float RGB, 100k verts | ~36 MB per canned clip, one clip per load/pressure/camber combination |
| Cage bind data | ~1.6 MB once, shared by all four wheels |

The cage already exists. `XPBDSoftTyre` runs a lattice of `RingCount × SegmentCount` = 9 × 128 = 1152
nodes. That is the simulation mesh; the generated tyre is the render mesh; binding one to the other is
the ordinary arrangement and it is exact at the node positions. It also satisfies the shared-topology
rule directly: one topology, one index buffer and one set of bind weights shared across four wheels,
with only 1152 node positions (about 14 KB) differing per wheel.

VAT keeps one narrow use: a canned loop for parked or distant traffic that is not simulated at all. It
is worth having eventually. It is not the main path.

## Phase 1 — Port the generator, watertight by construction

`References/TyreGenerator.html` is a browser prototype. Its tread mesh is not closed, and
`Exhibits/Workbench/Tyre/TreadMeshAudit.mjs` now measures exactly how badly on the off-road preset, the
busiest tread it ships:

| | before | after the two fixes already landed |
|---|---|---|
| interior cracks | ~80,000 | 13,167 |
| non-manifold edges | 686 | 106 |
| triangles | 291,193 | 67,665 |

The remaining 13,167 are structural and will not be patched out of the prototype. The builder emits every
floor piece and every groove wall as an independent triangle soup and relies on separately triangulated
polygons agreeing on their shared vertices. The port closes them by construction with a single shared
vertex pool and an explicit index buffer, which is a change to how the builder is organised rather than
another patch to it.

### Files

```
Frontier/Engine/ContentInterchange/Tyre/
    TreadSpecification.h            carcass parameters: width, aspect, rim, depth, crown, shoulder, wear
    TreadPatternSpecification.h     the layer stack: circ, lateral, chevron, sipe, dimple, hex, noise
    TreadRegionSolver.{h,cpp}       boolean stack to depth-ordered floor pieces
    TreadMeshSolver.{h,cpp}         pieces to one indexed watertight mesh
    TyreProfileSpecification.h      crown, shoulder arc, sidewall bezier, bead seat
    SidewallMeshSolver.{h,cpp}      the lathe, and its seam to the tread shoulder
    TyreMeshStructure.h             positions, normals, uvs, tangents, indices, material groups
    TreadPatternCodec.{h,cpp}       specification to and from the project format
```

### Dependency

Clipper2 (C++, Boost Software Licence) through `python Tools/Bootstrap.py --package clipper2`. Per
`CLAUDE.md` a build change moves together: the MSVC project, `Module.toml` and the orchestration scripts,
and any g++ helper paths used by the workbench harnesses.

### Gate

`Exhibits/Workbench/Tyre/TreadMeshProof.cpp` — the audit above, in C++, against `TreadMeshSolver`.
Acceptance is **interior cracks 0, non-manifold 0, degenerate 0**, every UV chart injective, and the
shoulder seam between tread and sidewall closed. The `.mjs` audit stays as the prototype's gate.

## Phase 2 — Lattice skinning

```
Frontier/Engine/PhysicalDynamics/Vehicle/LatticeSkinIndex.{h,cpp}
Frontier/Engine/Shaders/LatticeSkinning.slang
```

Each render vertex stores the lattice cell that owns it, bilinear weights inside that cell, and a signed
offset along the rest normal. Built once against the rest lattice and the rest mesh, so it is part of the
shared topology and not per wheel. At runtime a compute pass reads the 1152 deformed node positions and
writes deformed positions and normals. Normals are rebuilt from the interpolated cell frame rather than
from finite differences, because finite differences across a groove wall produce garbage at exactly the
places the tread has the most geometry.

### Gate

`Exhibits/Workbench/Tyre/LatticeSkinProof.cpp`

1. At the 1152 node positions the skinned result is exact against the lattice, to float tolerance.
2. The mesh stays watertight under deformation — the Phase 1 audit, re-run on deformed positions.
3. No self-intersection at 100% sidewall travel, which is the load the ramp landing already reaches.
4. A `ProjectDriveGeneratedTyre` sequence in the Drive gallery, rendered through
   `RunDriveMirror.py --only ProjectDriveGeneratedTyre` so it is a seven minute loop rather than thirty.

## Phase 3 — Editor, prototyped in HTML first

The editor surface is prototyped as HTML before any C++ is written. There is precedent for this in the
codebase and it is the reason this plan can be specific at all: `References/TyreGenerator.html` and
`References/PaintingSurface/` are both working prototypes that settled their models before anything was
ported.

```
References/TyreEditor.html          outliner rows, the asset window, the inspector strip
```

The prototype answers the layout questions — what belongs in the always-present inspector versus the
separate asset window, how the layer stack reads, which values want sliders and which want numeric entry —
and only then does the C++ get written against the answer.

### Then, against the SolidArc template

`Frontier/Editor/AuthoringTools/Modelling/SolidArc/` is an existing procedural tool with a document, an
undo sequence, a standalone editor host and an outliner adapter. The tyre tool mirrors it rather than
inventing a second arrangement.

```
Frontier/Editor/AuthoringTools/Modelling/TyreForge/
    Document/TreadSpecification.{h,cpp}        the document is the specification
    Document/UndoSequence.{h,cpp}              SolidArc's pattern
    Editor/TyreForgeEditorHost.{h,cpp}         the separate asset window
    Editor/TyreForgeOutlinerAdapter.{h,cpp}    rows into the shared OutlinerPanel
Frontier/Engine/Editor/TyreInspectorPanel.{h,cpp}
    void RecordTyreInspector(ControlPanel&, EditorInstance&, EditorSheet&);
```

That signature matches `RecordCameraInspector` exactly, so the quick sliders land in the existing
inspector while the full editor is a separate window — the split the brief asked for.

Outliner rows: **Tyre** with children **Carcass**, **Tread pattern** (the layer stack), **Sidewall decals**
and **XPBD lattice**, using role bits in the shape of `SolidArcOutlinerFilter`.

### Inflation pressure

There is no pressure in the tyre model today. `XPBDSoftTyre::Parameters` authors carcass stiffness as raw
compliances, which is not a quantity anybody can reason about from a slider. The plan adds
`InflationPressure` in kPa as the authored value and derives the hoop and spoke compliance from it, so the
slider means something physical and the compliances become an advanced override rather than the interface.

Exposed in the inspector: inflation pressure, tread depth and wear, rim bottoming with its clearance and
damping ratio, solver iterations, ring and segment counts, and the compliances behind an advanced toggle.

### Gate

`Exhibits/Workbench/Tyre/TyrePressureProof.cpp` — sweeping pressure down must lengthen the contact patch
and lower the vertical rate, both monotonically. The harness already measures contact node count and Fz,
so the measurement exists; what is new is the parameter it is swept against.

## Phase 4 — Surface painting

In the editor this behaves like a painting application. Outside the editor the result is baked to one
texture set per variant and nothing paints at runtime.

### What already exists, and was found rather than assumed

There is **no written plan** for texture painting in either `SultanAladin/Frontier` or
`SultanAladin/Slate`. There is something better: a 31-file working prototype, now vendored here.

```
References/PaintingSurface/              the prototype, from SultanAladin/Frontier @ 4a77bfd
    Deposit/        DabFootprint, PaintPass, SnapshotStore, StrokeRecord
    Ingest/         AtlasGroundTruth, SurfaceUpload, WavefrontDecode
    Instruments/    StrokeDriver, SurfacePick
    Interface/      ToolMenu, LayerInspector, MaterialShelf, DesignTokens
    Layers/         LayerStack, LayerKinds, LayerMask, LayerComposite, ChannelSet,
                    ChannelPreview, GeneratorPass, MaterialSwatch
    Projection/     OrbitProjection, SurfaceCapture, SurfaceRasterization
References/GeometryWorkspaceAndMaterialProcessingPlan.md
```

The prototype has already settled two things worth keeping verbatim.

**Layer kinds are capabilities, not labels.** `paint`, `fill`, `material`, `generator`, where only `paint`
accepts brush strokes. Its own comment makes the point that this has to be enforced in the stroke path
rather than shown in the UI, because otherwise a stroke aimed at a material layer is swallowed silently
and reads to the user as painting having randomly stopped working.

**The channel set is fixed and ordered:** `baseColour, metallic, roughness, emission, normal, height`.

`GeometryWorkspaceAndMaterialProcessingPlan.md` is the second half of the answer. It is not a paint plan,
but it defines the contracts a paint evaluator has to satisfy — it already lists `PaintedTiles` alongside
`Constant`, `ImportedImage`, `ProceduralNode` and `Reference` as a layer source kind, and states that the
full procedural and paint compositing stack waits on an evaluator delivery. That is the interface this
phase delivers against, so the two documents should be read together.

### Work

```
Frontier/Engine/ContentInterchange/Surface/
    TyreChartProjection.{h,cpp}     cylindrical tread, planar-polar sidewalls, packed to one atlas
    PaintLayerDepot.{h,cpp}         stored layers, matching the prototype's four kinds
    LayerCompositeSolver.{h,cpp}    the compositor, channel order fixed as above
    SurfaceBakeSolver.{h,cpp}       layer stack to the shipped texture set
```

A decal and a brush stroke are the same thing — a layer — so the sidewall decal stack already on
`arena/01a0f767-slate` (commit `38440b0`) folds in as the first layer type rather than a parallel system.

Baking rather than shading from the stack is the right default: 400 instances sharing one topology also
share one baked atlas, which is the same argument that decided the cage question.

### Gate

Chart injectivity and no overlap in the atlas; a painted stroke round-trips through bake and reload
unchanged; the composite matches the prototype's output for the same layer stack, which gives a reference
to compare against instead of judging it by eye.

## Order, and why

Phase 1 first, because Phase 2 cannot be gated until the mesh is actually closed — a watertightness
assertion on a deformed mesh is meaningless if the rest mesh already has thirteen thousand open edges.
Phase 3 can start its HTML prototype in parallel with Phase 1 since it shares no code. Phase 4 depends on
Phase 1 for charts.

## Open questions

1. **Naming.** This plan uses the closed suffix list from `SKILL-Naming`: `Specification`, `Solver`,
   `Structure`, `Codec`, `Index`, `Panel`, `Host`, `Projection`, `Depot`. The neighbouring SolidArc tool
   ships `FigureRecipe`, `SceneDocument` and `OutlinerAdapter`, none of which are on that list. The rule
   and local consistency disagree; the rule is followed above, but that is a decision to confirm.
2. **Triangle budget.** One tread is 67,665 triangles at `polyDetail 6`, so four wheels is roughly 270k
   before the sidewalls. Acceptable for a hero vehicle, needs LODs before traffic. The target wants
   setting before Phase 1 rather than after.
