# Geometry Workspace and Material Processing Plan

> **Forward-plan note:** `UnifiedGeometryRenderingAndMaterialPlan.md` supersedes this document's material inventory, reflectance-selection structure, render order, and micro-rasterization decision. This document remains authoritative for geometry intake, topology, selection, gizmos, and deferred layer-processing detail where the unified plan does not replace it.

## Decision and scope

Phase 2 should be named the **Geometry Workspace**. `GeometryInterchange` remains the narrower import/export conversion seam described in `PhysicsAndGeometryInterchangePlan.md`; it should not become the name of the entire editor, renderer, topology store, or material processor.

This phase implements, in order:

1. faithful geometry import with materials and source records;
2. editable CPU topology plus disposable GPU render geometry;
3. shaded, triangulated-wire, and source-topology-wire viewport modes;
4. depth-correct object/face/edge/vertex selection;
5. editor Empty entities and transform gizmos;
6. a default dielectric base-material layer with editable channels;
7. the contracts and scheduling model for a later GPU texture-paint evaluator.

The material layer processor is designed in this phase but the complete Substance-style stack is **not** implemented yet. Physics interchange and an extracted shared DLL also remain out of scope.

## Naming selected for Phase 2

- **GeometryInterchange** owns authoritative decoded geometry intake, derived CPU companions, stable geometry identities, and lifetime. It does not parse file formats or own GPU buffers.
- **GeometryFormatExchange** is the import/export boundary. It classifies formats and dispatches isolated OBJ, glTF, FBX, USD, and later codec adapters. The first delivered capability is faithful OBJ import; unsupported export is reported rather than simulated.
- **GeometryRenderingExchange** transfers immutable geometry views into revision-keyed rendering packets and, next, disposable GPU resources. The delivered CPU packet already separates shaded triangles, triangulated wire, and source-topology wire.
- **MaterialProcessingExchange** is the layer/channel command and processing seam. “Processing” covers constant edits now and dirty-tile GPU processing later without using the disliked “Evaluation” or “Composition” terms.

`GeometryCodecExchange` remains a valid alternative to `GeometryFormatExchange`, but **GeometryFormatExchange** is selected because the boundary describes user-visible file formats while codecs remain replaceable implementations beneath it.

## Entire structure

```text
Application/EditorHost
│
├── Scene composition (authoritative entities and components)
│   ├── EntityIdentity + parent relationship
│   ├── optional TransformComponent
│   ├── EmptyComponent
│   ├── GeometryInstanceComponent ───────────────┐
│   ├── MaterialAssignmentComponent          │
│   └── SourceRecordComponent            │
│                                             │
├── Scene Directory / Details                 │
│   ├── shared outliner registration          │
│   ├── object and Empty rows                 │
│   ├── transform editing                     │
│   └── object/component selection            │
│                                             │
├── Scene Transfer UI                         │
│   ├── FileInterchange                       │
│   ├── GeometryFormatExchange               │
│   │   └── isolated format codec adapters     │
│   └── GeometryInterchange                   │
│       ├── DecodedScene / polygon soup       │
│       ├── diagnostics + source records          │
│       ├── half-edge derivation (CPU)        │
│       ├── render-geometry derivation            │
│       └── entity-recipe transaction         │
│                                             │
├── GeometryDocumentStore ◄───────────────────┘
│   ├── GeometryAsset
│   │   ├── source polygon loops and groups
│   │   ├── half-edge vertices/edges/loops/faces
│   │   ├── stable element IDs
│   │   ├── arbitrary attributes
│   │   ├── source ↔ topology ↔ triangle maps
│   │   └── geometry/topology/attribute revisions
│   └── MaterialDocumentStore
│       ├── MaterialAsset
│       ├── mandatory Base Material layer
│       ├── additional authored layers
│       └── channel declarations and bindings
│
├── GeometryRenderingExchange
│   ├── observes immutable scene + asset snapshots
│   ├── derives dirty sets by revision
│   ├── uploads through ByteSpace / ImageSpace
│   ├── owns generation-checked GPU handles
│   └── publishes frame-local draw and picking tables
│
├── Vulkan RenderSchedule
│   ├── geometry depth/visibility pass
│   ├── material/shading resolve
│   ├── source-topology wire pass
│   ├── selection/gizmo/grid WorkspaceOverlayPass
│   └── interface composition
│
├── GeometrySelectionExchange
│   ├── pointer query → bounded GPU pick request
│   ├── visibility/depth result readback
│   ├── stable entity + topology element mapping
│   └── persistent SelectionSet update
│
└── MaterialProcessingExchange (contract first)
    ├── immutable layer/channel snapshot
    ├── dependency graph and dirty-tile compiler
    ├── GPU processor and transient image pool
    ├── bake/export requests
    └── evaluated material bindings → renderer
```

### Dependency direction

```text
codecs → GeometryFormatExchange → GeometryInterchange → document topology → presentation exchange → Vulkan
                                      ↑                    ↓
                              editor commands       read-only pick results

Layer Stack UI → material commands → material document → MaterialProcessingExchange
                                                               ↓
                                                     evaluated GPU material set
```

The renderer never owns editable topology. The UI never writes Vulkan buffers. Codec types never cross into scene components. GPU pick IDs never become persistent document IDs.

## Authoritative geometry on CPU

### Geometry asset

A `GeometryAsset` owns CPU data and stable IDs:

```text
GeometryAsset
  identity, name, source record
  SourcePolygonStore
  HalfEdgeStore
  AttributeStore
  MaterialSlotStore
  SourceMappingStore
  GeometryRevision
  TopologyRevision
  AttributeRevision
```

The source polygon store preserves imported face loops exactly, including triangles, quads, n-gons, polygon groups, source corner order, and non-manifold evidence. The half-edge store is the editable representation. Neither is replaced by the renderer's triangles.

### Stable topology IDs

Use generation-checked IDs for vertex, edge, loop/corner, and face records. Dense indices may move during compaction; IDs remain stable until the element is explicitly retired. Every command and selection stores IDs, not vector offsets.

Required maps:

```text
source vertex/corner/face ID ↔ half-edge element ID
half-edge face ID            → triangle range
render triangle ID           → half-edge face ID
render vertex ID             → source vertex + source corner + half-edge IDs
```

These mappings permit faithful source-wire display, face selection after triangulation, and diagnostics that identify the imported element that failed.

### Revisions and derived caches

- `GeometryRevision`: positions or topology changed.
- `TopologyRevision`: connectivity changed.
- `AttributeRevision`: normals, UVs, colours, weights, or custom values changed.
- `MaterialAssignmentRevision`: slot bindings changed.

Render geometry, geometry clusters, acceleration data, wire buffers, and physics geometry are disposable caches keyed by the revisions they consume.

## Import and export path

### First codec delivery

Implement glTF/GLB and OBJ/MTL first. They provide a practical split:

- glTF exercises hierarchy, PBR materials, textures, skinning-ready structures, and binary payloads;
- OBJ/MTL exercises arbitrary polygon loops, separate corner indices, groups, and external material files.

FBX and USD remain isolated provider adapters after the neutral decoded scene is proven. Do not make either vendor SDK part of the geometry document API.

### Import transaction

```text
path + options
  → FileInterchange bytes
  → codec DecodedScene + diagnostics
  → coordinate/unit conversion
  → polygon validation
  → optional authored operations
  → half-edge derivation
  → render derivation validation
  → material and texture intake
  → entity recipes
  → one atomic AssetInterchange registration
```

Nothing enters the document if a required stage fails. Warnings may be accepted explicitly; failures are not repaired silently.

### Material intake

Map standard metallic-roughness inputs into neutral channels:

- Base Colour (linear working value plus source colour-space metadata)
- Metallic
- Roughness
- Normal
- Height/Displacement
- Ambient Occlusion
- Emissive
- Opacity

Retain source material identity, texture paths, UV-set names, sampler settings, and unsupported extensions in source records/diagnostics. Packed maps retain channel swizzles rather than being destructively split on import.

## Scene objects and Empty entities

### Components

```text
EmptyComponent
  DisplayShape: Axes | Cross | Box | Circle | ImagePlaceholder
  DisplaySize
  ColourRole

GeometryInstanceComponent
  GeometryAssetIdentity
  MaterialAssignmentIdentity
  Visibility
  CastShadows
  ReceiveShadows

MaterialAssignmentComponent
  material identity per geometry slot
```

Transform remains optional. An Empty normally has a Transform and no render geometry. It can parent any entity and acts as a spawn/placement anchor. It is registered through the same general-purpose outliner as cameras, lights, folders, and geometry instances; no separate Empty tree is introduced.

### Initial object appearance

Until the material resolver is integrated, imported geometry instances render as fully directional white dielectric:

```text
BaseColour = (1, 1, 1)
Metallic   = 0
Roughness  = 0.5
Opacity    = 1
```

“Directional white” means the surface responds to the directional light and atmosphere; it is not unlit white and not an emissive debug draw.

## GPU geometry rendering

### Rendering exchange

`GeometryRenderingExchange` is the host-facing seam between immutable geometry snapshots and Vulkan resources. It should consume revisions and produce generation-checked rendering identities. It owns uploads and retirement but not document data.

```text
Synchronise(sceneSnapshot, geometryDirtySet, materialDirtySet)
BuildFrame(camera, viewport, selection)
  → DrawPacketSpan
  → PickingTable
  → OverlayGeometry
Retire(completedCycle)
```

Use existing `ByteSpace`, `ImageSpace`, `DescriptorIndex`, `ProgramIndex`, and `RenderSchedule` rather than creating a second device allocator or scheduler.

### GPU buffers

Per geometry cache:

- positions;
- packed normal/tangent;
- UV and colour streams as required;
- triangle indices;
- triangle-to-face mapping;
- source-wire segment records;
- optional geometry clusters and bounds;
- optional deformation output streams later.

Per instance:

- world transform and normal transform;
- geometry/material handles;
- stable frame pick index;
- visibility flags;
- selection mask/colour.

CPU topology remains available for editing and export. Normal frame rendering must not walk half edges.

## Three viewport structures

The viewport needs three independent presentations, not one “wireframe” toggle.

### 1. Shaded triangles

The regular material result over rasterized triangles. Triangle indices are derived from source/half-edge faces and include triangle-to-face mapping.

### 2. Triangulated wire

Shows every GPU triangle edge, including diagonals introduced by triangulation. Generate from triangle indices or edge-distance barycentrics. This mode diagnoses the actual raster structure.

### 3. Source topology wire

Shows only imported/editable polygon edges. It uses source/half-edge edge IDs, so a quad remains a quad and an n-gon does not expose derived diagonals. Build a compact segment/index buffer whenever topology changes.

Both wire modes are GPU rendered. The CPU stores topology and builds/updates source segments, but it does not draw per-edge interface primitives.

### Wire rendering policy

Use a dedicated line/edge pass with depth testing against geometry depth and a small, view-stable depth bias. Avoid expanding one-pixel hardware lines because width support differs by device. Prefer screen-space edge quads or barycentric coverage for stable antialiasing.

## Visibility and depth

No visibility buffer currently exists in SlateVulkan; Phase 2 introduces one deliberately rather than pretending an attachment is already available.

### Geometry visibility pass

Recommended attachments:

```text
Depth             D32_SFLOAT (or selected supported depth format)
Visibility        R32G32_UINT
  x: frame instance index
  y: primitive/triangle index
Optional Barycentric or reconstructed barycentrics
Motion/normal/material attachments only when the shading path requires them
```

A visibility-buffer path avoids a large G-buffer and supports material resolve from compact IDs. A fallback forward path may be retained for devices lacking required features, but picking still requires depth plus stable primitive identity.

### Depth correctness

- main geometry writes depth;
- shaded resolve reads the winning visibility record;
- wires depth-test against the same depth;
- selected hidden geometry can use an explicit x-ray mode, never accidental z-fighting;
- gizmos use their own declared depth policy;
- the interface is composed after scene rendering.

Reverse-Z should be evaluated when the depth attachment is introduced. If adopted, use it consistently in camera projection, clear value, comparisons, reconstruction, grid fading, and picking tests.

## Selection

### Selection domains

```text
Object
Vertex
Edge
Face
```

Object selection resolves an instance. Element selection resolves a stable topology ID through triangle/edge/vertex mapping. Persistent multi-selection uses the existing `SelectionSet` behavior and remains visible after pointer release.

### What-you-see picking

A click/box query reads visibility and depth, not a CPU ray against every face. This guarantees the selected face is the visible face and prevents clipping/order errors.

Single-pixel query:

1. enqueue pointer coordinate with a query generation;
2. copy the winning visibility/depth texel into a bounded readback ring;
3. consume after the owning GPU cycle completes;
4. validate frame generation;
5. map frame instance + triangle to entity + stable face;
6. apply selection gesture.

Vertex/edge selection uses the winning triangle plus barycentric/screen-space distance to that triangle's mapped vertices/edges. It does not search unrelated occluded elements.

### Region selection

Use a compute reduction over the selected screen rectangle into a bounded GPU hash/set of visible IDs, followed by compact readback. Overflow is reported and can fall back to tiled queries. Do not read the whole visibility image to CPU.

### Highlighting

- object: silhouette/outline from visibility discontinuities;
- face: selected face tint or overlay index draw;
- edge: selected source-edge quad;
- vertex: screen-stable marker;
- active element differs from other selected elements by semantic accent role.

Selection markers and filters continue to follow the standardized marker rules.

## Gizmos and overlay pass

### One overlay schedule

Grid, world axes, object placement marker, Empty shapes, selection markers, and transform gizmos should be submitted through the existing `WorkspaceOverlayPass`, expanded to accept depth-aware overlay records. Do not create one Vulkan pass per gizmo type.

### Transform gizmo

Modes:

- Translate: X/Y/Z axes and XY/YZ/ZX planes;
- Rotate: axis rings plus optional view ring;
- Scale: axis handles, plane handles, uniform centre;
- Universal can be added after the three individual modes are proven.

Spaces:

- world;
- local;
- parent;
- view (where meaningful).

Pivot policies:

- active element;
- median selection;
- individual origins;
- cursor/placement Empty later.

Interaction uses analytic CPU hit shapes projected from the exact gizmo pose, or a small dedicated overlay pick ID target. The visible and interactive shapes must derive from one record so they cannot drift.

### Placement gizmo and Empty

The placement marker is an Empty entity when persisted and a transient overlay record while previewing spawn placement. Confirming creates an undoable entity command. The same transform fields and gizmo manipulate it as any other transform-bearing entity.

### Depth policy

- grid: camera-relative fade and finite centre extent as already configured;
- axes/Empty: depth-tested with optional obscured fade;
- transform gizmo: visible handle may draw on top, while an obscured segment is dimmed from scene depth;
- selection markers: depth-tested unless x-ray selection is explicitly enabled.

## Base material layer

### Default state

Every material document begins with one mandatory **Base Material** layer. It cannot be deleted or moved above an absent predecessor. Its name remains editable and participates in export filenames where appropriate.

The base layer initially carries dielectric channels:

```text
Base Colour = white
Metallic = 0
Roughness = 0.5
Normal = neutral tangent normal
Height = 0
Ambient Occlusion = 1
Emissive = black
Opacity = 1
```

Users may add or remove optional channels, edit constants, bind imported textures, choose UV sets, and add further layers. In Phase 2 the renderer may evaluate constants and direct texture bindings; the complete procedural/paint compositing stack waits for the evaluator delivery.

### Authority

Material values are edited only through Layer Stack/material commands. Details may inspect the assignment but must not carry a second independent set of material values.

### Layer and channel model

```text
MaterialAsset
  ChannelSchema[]
    semantic, format, colour space, default, resolution policy
  LayerNode[]
    stable ID, parent group, order, enabled, opacity, mask
    blend policy per channel
    ChannelSource[]
      Constant | ImportedImage | PaintedTiles | ProceduralNode | Reference
  MaterialOutput
    channel bindings used by renderer/export
```

A layer can omit a channel; omission means pass-through, not a default overwrite. Masks are scalar evaluated sources. Normal and height blending use channel-specific policies rather than generic colour interpolation.

## Texture evaluation architecture

The proposed seam is **MaterialProcessingExchange**. It is separate from `GeometryInterchange`: import/export translates external assets, while evaluation turns authored layer graphs into GPU material images.

### Responsibilities

```text
Layer Stack UI
  → undoable MaterialCommand
  → MaterialAsset revision
  → MaterialProcessingExchange compiler
      → validated dependency DAG
      → dirty channel/tile set
      → GPU dispatch schedule
      → evaluated image handles
  → GeometryRenderingExchange material bindings
```

The exchange owns no UI state and no Vulkan device globally; a Vulkan processing adapter owns device resources behind the exchange.

### Entirely GPU-driven evaluation

Once commands and dirty regions are submitted, compositing stays on GPU:

- source images remain GPU resident;
- layers evaluate per dirty tile and channel;
- intermediate images come from a transient aliasing pool;
- channel packing is a final GPU operation;
- viewport materials consume evaluated images without CPU readback;
- CPU readback occurs only for explicit export or diagnostics.

“GPU-driven” does not mean CPU topology or document metadata disappears. CPU compiles the bounded graph and dirty set; GPU evaluates pixels.

### Dirty tiles

Use tiled residency (for example 128×128 physical tiles, configurable after profiling). Track dirtiness by material, channel, mip, UDIM tile, and tile coordinate. A stroke invalidates only intersected tiles plus filter borders and dependent downstream nodes.

```text
DirtyKey = material + channel + udim + mip + tileX + tileY
```

Propagate dirtiness through the DAG. Merge duplicate keys before dispatch. Generate lower mips on GPU only for affected parent regions.

### Processing order

For each output channel:

1. resolve source and mask dependencies;
2. evaluate constants/images/procedurals/paint tiles;
3. convert into the channel's declared linear working representation;
4. apply mask and opacity;
5. apply channel-specific blend;
6. retain or alias the result according to downstream lifetime;
7. generate required mips;
8. publish the final sampled image view.

Normal channels use reoriented-normal or declared normal blending. Height can combine add/max/min/replace according to layer policy. Colour channels blend in linear working space. Data channels never pass through sRGB conversion.

### Performance requirements

- no full-stack recompute for a small stroke;
- no CPU image compositing;
- bounded descriptor and transient-image allocation;
- asynchronous compute when it overlaps safely with graphics;
- timeline/generation ownership through the existing cycle scheduler;
- cache keys include source revision, node parameters, channel schema, and processor version;
- deterministic output for identical inputs and declared precision mode;
- explicit memory budget, eviction, and re-evaluation policy;
- timestamps per node/channel/tile for profiling.

### Virtual texturing and UDIM

Do not require virtual texturing for the first constant/direct-image material milestone. Design IDs and dirty keys so tiled residency and UDIM do not require changing document schemas. Add sparse/virtual residency only after ordinary tiled evaluation and eviction are measured.

## Render schedule

Initial schedule:

```text
Upload/derivation completion
        ↓
GeometryVisibilityPass
  writes depth + instance/primitive IDs
        ↓
MaterialResolvePass
  reads visibility, geometry attributes, evaluated material images, lights, atmosphere
        ↓
SourceTopologyWirePass (optional)
  depth tests against geometry depth
        ↓
WorkspaceOverlayPass
  grid + axes + Empty + selection + gizmo, with declared depth policy
        ↓
Interface composition
```

Triangulated wire may be part of material resolve through barycentric coverage or a separate pass. Source-topology wire needs its own edge data and should not be inferred from triangles.

## Commands, undo, and threading

All edits are commands:

- create/delete/reparent Empty or geometry entity;
- transform entities;
- select elements (selection history may remain UI-only);
- change topology;
- assign material;
- add/remove/reorder layer;
- add/remove channel;
- edit channel source, blend, opacity, mask, or constant.

Commands mutate document state on its owning thread, increment revisions, and emit compact change sets. Worker jobs derive topology/render caches from immutable snapshots. GPU completion never directly mutates the document.

## Validation and proof

### Geometry

- triangle, quad, n-gon, holes where supported;
- separate OBJ corner indices;
- non-manifold and boundary cases;
- source ↔ half-edge ↔ triangle round-trip mappings;
- unit/axis fixtures;
- atomic failure leaves no entities/assets;
- material and texture path source records.

### Rendering

- fully white dielectric lit by the directional light;
- shaded/triangulated-wire/source-wire reference images;
- depth ordering with intersecting and clipped geometry;
- source wire excludes triangulation diagonals;
- attachment resize/recovery;
- GPU resource retirement under rapid import/delete.

### Selection

- front face wins over occluded face;
- near-plane clipping remains correct;
- face maps through triangulation to one polygon ID;
- shared vertex/edge chosen by screen-space distance;
- box query returns only visible IDs unless x-ray is enabled;
- persistent multiselect and active-element highlight;
- stale readback generation cannot select a replacement entity.

### Gizmos

- handle visuals and hit regions agree at different DPI/FOV values;
- world/local/parent transforms;
- multi-selection pivot policies;
- undo/redo exactness;
- depth fade and on-top handle policy;
- stationary press does not introduce motion.

### Material evaluation

- one base layer always exists;
- omitted channels pass through;
- colour/data colour-space fixtures;
- normal and height blend fixtures;
- dirty stroke dispatches only affected tiles/dependants;
- GPU and high-precision reference images stay within declared tolerance;
- memory-budget eviction reproduces identical output after re-evaluation;
- packed Unreal/glTF/Unity-style export channel fixtures.

## Delivery sequence

### Geometry milestone A — document and import

1. Define stable geometry IDs, `DecodedScene`, source polygon store, and source records.
2. Implement OBJ/MTL codec and atomic import transaction.
3. Implement half-edge derivation and diagnostics without automatic repair.
4. Add Geometry Instance, Material Assignment, Source Record, and Empty components.
5. Register imported objects and Empty entities through the real Scene Directory.

### Geometry milestone B — rendering

6. Add `GeometryRenderingExchange` and revision-keyed GPU resources.
7. Add geometry depth/visibility attachments and white dielectric material resolve.
8. Render shaded triangles.
9. Render triangulated wire and source-topology wire as distinct GPU modes.
10. Add glTF/GLB material/texture intake.

### Geometry milestone C — selection and manipulation

11. Add bounded visibility readback and object/face selection.
12. Add edge/vertex resolution and region compute selection.
13. Extend `WorkspaceOverlayPass` for depth-aware Empty/selection records.
14. Implement translate, rotate, and scale gizmos with undoable transform commands.

### Material milestone A — editable base layer

15. Create a mandatory Base Material layer for every material.
16. Add channel schema, constants, imported image bindings, UV choice, and layer creation.
17. Bind base-layer values to viewport material resolve.
18. Keep all material editing in the Layer Stack command path.

### Material milestone B — processing contract and measured prototype

19. Define `MaterialProcessingExchange`, immutable snapshots, dirty keys, and capability report.
20. Implement constant/image/layer blend for one colour and one data channel on GPU.
21. Add tile dirtiness, transient image lifetime analysis, and GPU timestamps.
22. Validate normal/height policies before adding paint and procedural nodes.
23. Add export readback/packing only after viewport evaluation is stable.

## Explicit non-goals for the first Phase 2 delivery

- no complete FBX/USD feature matrix;
- no silent topology repair;
- no complete sculpt/modifier system;
- no complete Substance-style procedural library;
- no CPU layer compositor;
- no PhysicsInterchange implementation;
- no shared component DLL extraction;
- no replacement of optional Transform semantics;
- no vendor object/reflection model copied into Slate.
