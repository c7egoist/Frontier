# 00 — GroundworkSpecification

Slate is a general-purpose engine with a painting application built on top of it. It is not a renderer with
extras bolted on. Six subsystems are peers — numerics, platform translation, device abstraction, the document
model, the interface, and rendering — and the render spine is one consumer of the other five, not their owner.
This document fixes the parts every later document assumes: how the source tree partitions into link units,
what crosses each seam, which numerical guarantee each computation carries, and what is deliberately absent.

Nothing in this series is optional reading before writing code in it. A document that contradicts this one is
wrong; a decision absent from this one is not yet made and must be raised, not invented.

## Position In The Sequence

| Field       | Value                                                                                     |
|-------------|-------------------------------------------------------------------------------------------|
| Units       | All five, plus the host targets                                                            |
| Layers      | L0 … L6                                                                                    |
| Upstream    | None — this is the root                                                                    |
| Downstream  | Every document, 02 through 86                                                              |
| Unblocks    | Folder creation, `Module.toml` authoring, the first compile                                |

## 1. Authority Order

Four document roots were read to produce this series. They do not carry equal weight.

| Rank | Root                                          | Standing                                                      |
|------|-----------------------------------------------|---------------------------------------------------------------|
| 1    | `Slate/DOC/` and `Slate/DOC/Foundation/`      | Authoritative. Newest and correct. Wins every conflict.       |
| 2    | `Slate/AgenticInstuctions/SKILL-*.md`         | Authoritative for naming and formatting, without exception.   |
| 3    | `Frontier/EngineDocs/`, `Frontier/…/Research/`| Additive. Mechanism only, never structure or vocabulary.  |
| 4    | `Frontier/RetiredProject/.retired/Docs/`      | Additive, weakest. Polygon folder branches only.          |

Ranks 3 and 4 describe a **different codebase**. Their folder trees, unit partitions and identifier spellings
do not transfer. What transfers is the physics, the algorithms, and the measured numbers — and each such import
is recorded in the importing document's evidence section with its origin named.

## 2. The Link Partition — Five Units

✔️ The five-unit partition done — `SlateMath` → {`SlateDocument`, `SlateVulkan`} → `SlateCompute` → `SlateUI` →
`<Name>Host.exe`, the two middle units peers that link each other nowhere, and no `SlatePlatform.lib`.
`DOC/Foundation/04-UnitDirectoryStructure.md`'s three-unit claim is stale and superseded by it.

🔴 **`Contract/` is the only home for a constant two units both read.** A number declared in one unit and read
as "a declared constant" by another is a dependency edge wearing a disguise, and it is how `68` and `20`
re-acquired the edge conflict 13 was split to remove. `PhysicalTileApron`, the precision tiers, every tolerance
and every capacity ceiling live in `Contract/`, which depends on nothing and is depended on by everything.
Recorded as conflict 30.

### 2.1 Static linking — and what follows from it

✔️ Static linking done — five `.lib`, `/MD` in both configurations, standard-library and POD structures across
every seam, no export surface and no flat C ABI, `glfw3dll.lib` the only import library. `DOC/SlateUI.md`'s
`.dll` wording is stale. `00-DirectoryStructure.md`'s `SlateModuleEntry` apparatus binds `CodeInterchange` only.

### 2.2 What may cross each seam

🚧 Partially completed — the seam table is enforced by the partition for the units that exist, and exactly one
copy of ImGui is compiled inside `SlateUI`. `SlateCompute`'s row is unproven: the unit holds `ParityRunner`
only, so nothing has yet crossed it. A host that includes `imgui.h` remains a defect.

## 3. Precision Tiers

✔️ The four tiers and the transitivity rule done — `PrecisionContract.h`, where the rule is a `static_assert`
under `SLATE_DECLARES_PRECISION` rather than a review item.

## 4. The Parity Mechanism

🚧 Partially completed.

- ✔️ `Shared/` and `ToolchainInterchange.slang.h` done — the predicates compile under both toolchains from one source.
- ✔️ `ParityRunner` registers entry points and reports agreement per registration.
- 🚧 The shader form is not yet executed; it waits on the device `06` brings up. Until then a registration
  proves the host form self-consistent and nothing more, which is weaker than this section claims.

## 5. Deliberate Absences

These are not deferred. They are not in the tree, not in a `Module.toml`, and not referenced by any document in
this series. Each is listed with the substitution that stands in its place, because an absence with no
substitution is a dangling reference.

| Absent                        | Why                            | What stands in its place                     |
|-------------------------------|--------------------------------|-----------------------------------------------|
| Global illumination           | Out of scope by instruction    | See §5.1 — four substitution points          |
| CAD workspace and CAD render  | Out of scope by instruction    | Polygon branches; no CAD folder exists       |
| Voxel and distance-field work | Out of scope by instruction    | Nothing — no consumer references it          |
| CMake                         | Not used anywhere in Slate     | `Module.toml` plus compiler scripts          |
| Bindless descriptors          | Not adopted by the donor spine | Explicit descriptors per rotation            |
| Multiple queue families       | Not adopted by the donor spine | One graphics queue; transfers inside it      |
| Animation and deformation     | Not in scope for a painter     | `AttachmentFollows` composes static transforms only |
| Topology editing              | Slate paints; it does not model| `38` conditions imported topology; nothing mutates it |
| Vector effect operations      | Unbounded surface, low value   | `52` declares its accepted subset in full — §5.2 |
| Continuous stochastic sources | Patterns are deterministic     | `54` varies per cell by index, never by sampled noise |
| Occupant instancing           | Not resolved; measure first    | Nothing — recorded in §12 as a scale question |
| Reduction-level topology      | Not resolved; measure first    | Nothing — recorded in §12; `16` cost tracks partitions |

🔴 The six absences below the rule were **not** declared when the first seventeen documents were written. They
were absent without being declared, which §5's own opening forbids. The cause is recorded in §10 conflict 12,
and the review procedure that catches it is recorded in §11.

### 5.2 Vector content — the accepted subset

`52` accepts vector outlines from a file or from source text supplied directly. The accepted subset is closed and
declared there rather than discovered per document: path geometry, both fill rules, stroke conversion to outline,
transforms, and gradients. Everything else is refused with a reported reason.

| Refused                     | What stands in its place                                        |
|-----------------------------|------------------------------------------------------------------|
| Effect operations           | Nothing — refused at intake and reported; `Filter` is banned anyway |
| Clipping and masking        | `56`'s masking, applied after placement                          |
| Script and animation        | Nothing — refused at intake and reported                        |
| Embedded raster content     | Extracted and routed to `50` as imagery                          |

A refusal is reported through `86`. A vector source that silently loses content is worse than one that refuses it,
because the artist attributes the loss to their own file.

### 5.1 Global illumination — the substitution points

The donor render documents treat indirect lighting as a leaf consumer, so removing it does not unpick the spine.
It does leave four sockets, and each is filled explicitly rather than left open:

| Socket                                        | Filled by                                                          |
|-----------------------------------------------|---------------------------------------------------------------------|
| Ambient term in material shading (`18`)       | Sky-view irradiance from `28`, plus a constant floor when sky is off |
| Bent-normal consumer in horizon occlusion     | Scalar occlusion only; the bent normal is not produced              |
| Irradiance products described "for probes"    | Retained, retargeted to the ambient term; no probe population exists |
| Reflection fallback beyond the screen edge    | Sky-view radiance from `28`, then the constant floor                 |

A document that needs indirect light and does not name one of these four is making an assumption and must stop.

## 6. Repository Layout

🚧 Partially completed — the tree stands under `Engine/`, with `Contract/`, `Shared/` and all five unit folders
real, `ConsoleHost/` present and `_AgentScratch/` ignored. Two departures from the layout above are already on
disk and are the layout now: the layer folders are spelled `Platform/`, `Numeric/`, `Format/`, `Document/`,
`Device/`, `Compute/`, `Interface/` without the `Layer<N>_` prefix, and every component is `<Name>/Api/` plus
`<Name>/Source/` — `Contract/` alone keeps its four headers flat. `DOC/Technical Engine Directory Structure &
Architectur.md` is the layer map; this section is not a second copy of it.

Still empty of the components this section names: `PaintHost/`, most of `Platform/`, most of `Device/`, all of
`Compute/` but `ParityRunner`, most of `Interface/`, and `ToolSequence`.

Folder names inside a layer follow `<Subject><Role>` from the closed suffix list.

## 7. Build

✔️ Build done — one `Module.toml` per unit, PowerShell orchestration invoking `cl.exe` and `link.exe`, no CMake,
order fixed by §2's partition.

🔴 Nothing in this series is validated by running it. "It compiles" is not a deliverable unless it was asked for,
and no test, probe or executable is built without asking first.

## 8. Naming And Formatting Law

`SKILL-Naming.md` and `SKILL-Formatting.md` bind every identifier, folder, file and document produced under this
series. The rules most likely to be violated by habit:

- The role suffix list is **closed at nineteen entries**. `Boundary`, `Region` and `Tree` are retired as suffixes.
- Banned by category: `Manager`, `Handler`, `Processor`, `Controller`, `System`, `Core`, `Module`, `Node`, `Frame`,
  `Pass`, `Stage`, `Data`, `Info`, `Object`, `Item`, `Thing`, `Kind`, `Base`, and all kinship terms — `Parent`,
  `Child`, `Sibling`, `Ancestor`, `Descendant`, `Orphan`.
- 🔴 `Kind` is banned in prose as well as in identifiers — see `SKILL-Naming.md`. It is the word reached for when
  the discriminating mechanism has not been named yet, so it hides an unmade decision. `Type`, `Sort`, `Variety`,
  `Flavour` and noun-`Category` fall with it.
- Banned structurally: `Buffer`, `Pipeline`, `Memory`, `Cache`, `Pool`, `Mesh`, `Plan`, `Map`, `Table`, `Model`,
  `Store`, `Registry`, `Bake`, `Stamp`, `Blend`, `History`, `Filter`, `Grid`, `Array`, `Tier`, `Mip`, `Probe`.
- Banned addendum: `Cadence`, `Binding`, `Submission`, `Footprint`, `Region`, `Tree`, `Vacancy`.
- Mathematical exemption is narrow: `Graph`, `Predicate`, `Quadrature`, `Interpolant`, `Field`, `Kernel`,
  `Partition`, `Region`, `Space`, `Tree` — permitted only where the mathematical object is genuinely meant, and
  never as a role suffix.
- Booleans state a noun phrase — `VisibilityEnabled`, not `IsVisible`. Functions use domain verbs — `Solve`,
  `Traverse`, `Classify`, `Project`, `Reclaim`, `Linearize` — never `Get`, `Set`, `Update`, `Evaluate`, `Compose`.
- Math variables use real Unicode: β, γ, θ, ω, Δτ. This is the only exception to PascalCase.
- Third-party API calls mirror the vendor spelling verbatim: `VkBuffer`, `VkPipeline`, `ImDrawData`. The ban
  applies to Slate's own identifiers.

⚠️ Consequence for vocabulary: the donor documents' central terms are unusable as written. "Frame graph" is
`RenderSchedule`. "Visibility buffer" is `VisibilityIndex`. "Baking" is transfer. "Stamp" is impression. "Mesh" is
polygon topology or `TopologyStructure`. These are not synonyms chosen for taste — the banned spelling names a
category, the required spelling names a mechanism.

### 8.1 Document titles and numbering in this series

Document files are not modules, so the two-word formula is not enforced on them. Two rules are: the title names
the **mechanism the document specifies**, and it contains no banned word.

🔴 **A document number is an identity, not a position.** The gapped-by-two scheme was written on the assumption
that gaps absorb insertion. They do not: the sixteen gaps between `00` and `32` cannot carry twenty-six
insertions, and several of those insertions must land where no gap exists. Rather than renumber — which would
break every cross-reference in the series, and every one of them is by number — the number is demoted:

- The seventeen documents numbered `00` … `32` keep those numbers **permanently**. Nothing is renumbered, ever.
- A new document takes the next free even number from `34` upward, in the order it is added to §9.
- 🔴 **Build order is not encoded in the number.** It is the topological ordering of the Upstream edges every
  document already declares in its Position block, and it is stated in §9.1.

The reason is not convenience. A single integer imposes a total order, and dependency here is a partial order:
`28` and `16` are mutually independent, `20` and `24` were mutually entangled. A total order over a partial one
asserts edges that do not exist and conceals ones that do — which is precisely how §9 came to claim strictly
downward flow while a real cycle between `20` and `24` sat inside it undetected for the whole series.

The cost is stated plainly: a directory listing no longer shows build order. §9.1 is the authority for that, and
it always was.

### 8.2 Substitutes for two concepts the ban leaves unnamed

🔴 `Model` is banned structurally and `Base` is banned as a prefix, and two first-class concepts in `18` and
`42` were spelled with them throughout. Prose survived it; an enum member cannot. The substitutes are fixed
here so they are not each invented at the first compile.

| Concept                        | Was            | Is                            |
|--------------------------------|----------------|-------------------------------|
| One of `18` §3's eight models  | shading model  | `ReflectanceSpecification`    |
| A material's selection of one  | model selection| `ReflectanceSelection`        |
| `18` §2 channel 1              | Base colour    | Albedo colour                 |
| `18` §2 channel 4              | Reflectance    | Normal-incidence reflectance  |

## 9. The Sequence

Forty-four documents. The first seventeen were written first and keep their numbers; the remainder were added
after the completeness review recorded in §10 conflicts 12 through 27. Order in this table is **not** build
order — see §9.1.

| №  | Document                     | Unit          | Unblocks                                              |
|----|------------------------------|---------------|--------------------------------------------------------|
| 00 | `GroundworkSpecification`    | all           | Tree creation, `Module.toml`, first compile           |
| 02 | `NumericFoundation`          | Math          | Every computation in the engine                       |
| 04 | `PlatformInterchange`        | Math          | A window, a file, an input sample                     |
| 06 | `DeviceExchange`             | Vulkan        | A device, an allocation, a descriptor                 |
| 08 | `RenderSchedule`             | Vulkan        | Ordered recording and presentation                    |
| 10 | `DocumentStructure`          | Document      | Anything the engine can hold or persist               |
| 12 | `OutlinerSequence`           | Document + UI | Scene navigation, selection, kinematic containment    |
| 14 | `InterfacePanel`             | UI            | A visible, interactive application                    |
| 16 | `VisibilityIndex`            | Compute       | Knowing which surface each pixel resolved to          |
| 18 | `ReflectanceIntegrator`      | Compute       | A shaded image                                        |
| 20 | `SurfaceTileSpace`           | Compute       | Resolution-independent paintable surfaces             |
| 22 | `ImpressionSequence`         | Compute + Doc | Painting strokes that persist and undo                |
| 24 | `AttributeTransfer`          | Compute       | High-to-low transfer — unwrap moved to `68`           |
| 26 | `IntersectionOutline`        | Compute + UI  | Selection feedback the artist can see                 |
| 28 | `SkyAtmosphere`              | Compute       | Sky radiance, and the ambient term `18` depends on    |
| 30 | `SpecularProjection`         | Compute       | Screen-space reflection                               |
| 32 | `HostAssembly`               | Host          | A shipping application                                |
| 34 | `WorkSequence`               | Math          | Long solves off the tick; cancellation and progress   |
| 36 | `ColourSpecification`        | Math + Doc    | A declared working space; paint that matches display  |
| 38 | `TopologyConditioning`       | Document      | Imported topology that is fit to paint on             |
| 40 | `SpatialSubdivision`         | Document      | Host-side intersection without a device               |
| 42 | `MaterialSpecification`      | Document      | Channels that `16` can classify and `18` can read     |
| 44 | `IlluminantPopulation`       | Document      | Incident radiance — `18`'s direct term has a source   |
| 46 | `CameraProjection`           | Document      | Orbit, pan, dolly, framing; the frustum `16` culls to |
| 48 | `DocumentSession`            | Document      | Open, save, recover; not losing work                  |
| 50 | `AssetInterchange`           | Document      | Topology and imagery in; painted channels **out**     |
| 52 | `VectorInterchange`          | Document      | Vector outlines and typeface outlines as content      |
| 54 | `TilingSpecification`        | Document      | Repeating pattern definition — textiles and weaves    |
| 56 | `SurfaceLayerSequence`       | Document      | A non-destructive layer sequence; painted content     |
| 58 | `BrushSpecification`         | Document      | The brush every stroke in `22` is resolved against    |
| 60 | `OcclusionProjection`        | Compute       | Shadows                                               |
| 62 | `TransmissionSequence`       | Compute       | Transparent and cutout occupants                      |
| 64 | `SampleIntegrator`           | Compute       | Temporal accumulation; `02` §6's jitter has a consumer|
| 66 | `DisplayProjection`          | Compute       | Exposure, tone projection, encoding — a viewable image|
| 68 | `ChartPartition`             | Compute       | Seams and unwrap, ahead of the domain that needs them |
| 70 | `AnalyticProjection`         | Compute       | Resolution-free sources resolved at promotion         |
| 72 | `PlacementProjection`        | Doc + Compute | Placed, re-editable text, imagery and vector content  |
| 74 | `PointerIntersection`        | Doc + Compute | Picking — occupants, decals, components, marquee      |
| 76 | `ToolSequence`               | UI + Compute  | Active tool and every parameter that is not a document|
| 78 | `TransformManipulator`       | UI + Compute  | Moving, rotating and scaling anything                 |
| 80 | `OverlayProjection`          | Compute + UI  | Non-occupant geometry the artist needs to see         |
| 82 | `PreviewProjection`          | Compute + UI  | Thumbnails, speculative extents, the 2D domain view   |
| 84 | `RevisionPanel`              | UI            | Undo the artist can see and scrub                     |
| 86 | `DiagnosticPanel`            | Math + UI     | Somewhere for Tier C reports and misses to land       |

🔴 The table above is the whole series. **Every one of the forty-four is written**, and no reference anywhere in it
resolves to a document that does not exist.

⚠️ `88-ReferenceAmendment.md` is **deleted**, not archived. It was a holding document carrying nine specifications
— `52`, `54`, `70`, `72`, `74`, `76`, `78`, `80`, `82` — as nine sections, so that a reference of the form `72` §2
could resolve to `88` §72.2 before `72` existed. All nine are now files, §8.1 made the split free because the
number is an identity, and its own §88.90 gate required its deletion at that moment: a holding document that
outlives its contents is a second source of truth, and the two diverge in the direction nobody reads.

### 9.1 Build order — the dependency ordering

🔴 This subsection, not the numbering, is the authority on order. Every document declares its Upstream edges in
its Position block; the order below is the topological ordering of those edges and must be re-derived, never
hand-edited, whenever a document is added or an Upstream edge changes.

🔴 The unit of order is a **stratum**, not a wave, and the distinction is what the previous table got wrong. A
document's stratum is one greater than the greatest stratum among its Upstream. Mutual independence within a
stratum is then a consequence of the definition rather than a claim laid over the top of it: if A reads B,
A's stratum exceeds B's, so they cannot share one. The previous table asserted independence over groups that
contained unbroken chains — wave 5 held `16` → `60` → `18` → `62` → `30` → `64` → `66` entire — and asserted
strictly forward flow over a graph containing seven back edges and one cycle. Recorded as conflict 29.

| Stratum | Documents                          | What exists at the end of it                        |
|---------|------------------------------------|-----------------------------------------------------|
| 0       | `00`                               | The tree, one `Module.toml`, `Contract/`            |
| 1       | `02` · `04`                        | `SlateMath` links; the predicates are parity-proven |
| 2       | `06` · `10` · `34` · `36`          | A device, a population, work off the tick, a space  |
| 3       | `08` · `12` · `38` · `42` · `48` · `52` | A schedule, an outliner, conditioned topology  |
| 4       | `28` · `40` · `44` · `46` · `50` · `68` | Intake, illuminants, a camera, a domain        |
| 5       | `54` · `56` · `58`                 | Surface content that is ordered and revisable       |
| 6       | `20` · `72`                        | Resident tiles; placed content declared             |
| 7       | `16` · `24` · `70` · `74`          | Visibility, transfer, analytic resolution, picking  |
| 8       | `60` · `76`                        | Shadows; non-document state with one owner          |
| 9       | `18` · `22` · `78` · `84`          | A shaded image; painting; manipulation; undo        |
| 10      | `62` · `82`                        | Transmission and cutout; every preview              |
| 11      | `30`                               | Screen-space reflection                             |
| 12      | `64`                               | Temporal accumulation                               |
| 13      | `66` · `86`                        | A viewable image; somewhere for reports to land     |
| 14      | `14` · `26` · `80`                 | Interface, selection feedback, overlays             |
| 15      | `32`                               | A shipping application                              |

⚠️ The table is deeper than its predecessor and that depth is the truth rather than a regression. The render
spine is genuinely linear from `16` to `66`, and every stratum between 9 and 13 holds one or two documents
because that is how many are actually independent there. A table that grouped them more loosely would be
lying in the same direction the old one did.

🔴 The table is a build product, not prose. It is derived by a script over every Position block's Upstream
field, and §11's cycle gate is the same traversal. Hand-editing this table is forbidden; if it disagrees
with the declared edges, the edges are right and the table is stale.

Three edges were corrected to produce it, and each was a declaration that did not describe a real read:

- `72` declared `78` Upstream while `78` declares `74` Upstream and `74` declares `72` Upstream — a cycle
  through the pointer subsystem, which §11's gate exists to catch and had never been run against.
  `78` is `72`'s Downstream: it writes the placing transform `72` stores and does not precede it.
- `42` declared `38` Upstream and reads no conditioning mechanism. Removed; it closed a second cycle,
  `42` → `38` → `50` → `42`.
- `38` declared `50` Upstream. `50` invokes `38` and is its Downstream; `38` reads `10`'s topology, not `50`.

One edge was added, deliberately, and it is the reason strata 7 through 13 sit where they do: `16` now
declares `20`, `42` and `56` Upstream, because `16` §3.1's coverage test samples a resident channel. See
conflict 31.

⚠️ The claim previously made here — "strictly downward with two forward references" — was **false as written**.
`24` produced the parametric domain that `20` subdivides and `22` paints into, while simultaneously depending on
`20`'s `PhysicalTileApron` to size its inter-chart gap. That is a cycle, and prose review did not catch it in
seventeen documents. It is broken by splitting unwrap out of `24` into `68`, which now precedes `20`; `24`
retains transfer only. The gate in §11 that checks this mechanically is the reason it cannot recur.

## 10. Conflicts Resolved Here

Recorded so that a reader who finds the contradiction in the source documents lands on the ruling instead of
re-deciding it.

| #  | Conflict                                                    | Ruling                                       |
|----|-------------------------------------------------------------|-----------------------------------------------|
| 1  | `04` says three units; three layers have no home            | Five units, §2. `04` §3 is stale.            |
| 2  | User said `.dll`; `04` says `.lib`; `SlateUI.md` says `.dll`| Static `.lib`. `SlateUI.md` is stale.        |
| 3  | `00` and `04` declare two different repository trees        | §6 supersedes both.                          |
| 4  | Two files both numbered `02-` in `DOC/Foundation/`          | `02-` is a wave marker, not a key.           |
| 5  | `03`'s index omits `02-OutlinerPlan` and `04-Unit…`         | Stale index; both are in force.              |
| 6  | Outliner uses `MembershipRegion`, `ParameterSpecification`  | Now `EnrollmentIndex`, `PropertySpecification`. |
| 7  | `BoundingTree`, `OctantTree`, `AxisTree`                    | `BoundingStructure`, `OctantSpace`, `AxisSpace`. |
| 8  | Two competing five-pillar schemes in the retired trees      | Neither adopted; §2 governs.                 |
| 9  | Retired trees carry CAD branches throughout                 | Polygon grafted; CAD omitted entirely.       |
| 10 | PBR channel packing layout is specified nowhere             | Open in `18` §9; not invented here.          |
| 11 | Donor documents assume indirect lighting is present         | Four substitution points, §5.1.              |
| 12 | §5 listed only the absences the donor documents flagged     | §5 re-derived against the artist's workflow. Twenty-seven documents added. |
| 13 | §9 claimed downward flow; `20` and `24` were a real cycle   | Unwrap split into `68`, before `20`. `24` keeps transfer. |
| 14 | Numbering gapped by two cannot absorb the insertions        | §8.1 — number is identity, order is §9.1.    |
| 15 | `VisibilityIndex` holds partition identity, not occupant    | `42` declares the partition-to-occupant resolution. |
| 16 | `20` §4 says painted texels live in `10`; `10` has no home  | `56` holds them; tiles are a derived projection. |
| 17 | `10` declares `VectorCodec`; nothing in the series read it  | `52` is its consumer.                        |
| 18 | `14` §4 admits no path for state that is not the document   | Scoped to document mutation; `76` owns the rest. |
| 19 | `28` and `08` spell `Table`, which §8 bans structurally     | `TransmittanceSurface`, `MultiScatterSurface`. |
| 20 | `02` §6 declares jitter; nothing accumulated it             | `64` is its consumer.                        |
| 21 | `02` §5 sends `TimeIntegrator` to `12`; `12` never reads it | Retargeted to `64`; `12` composes static transforms. |
| 22 | `06` opens on "a layer stack" that no document defined      | `56` defines it.                             |
| 23 | Placement, ordering and containment of decals unstated      | §10.1.                                       |
| 24 | `14` §1 lists six panels; seven subsystems had no presenter | `14` §1 expanded; each names its owner.      |
| 25 | `26` recorded before tone mapping; the outline was mapped   | `08` §3.1 — display-referred, after `66`.    |
| 26 | `08` §6 gates one producer per target; `30` §5 amends `18`'s| One producer plus an ordered amendment list. |
| 27 | Channels 5, 10, 13 are tangent-space; no owner of the basis | `18` §1.1, derived from `68`'s domain.       |
| 28 | Nine documents referenced for mechanism they do not state   | All nine are files; `88` is deleted.         |
| 29 | §9.1 claimed intra-wave independence and forward-only flow  | Both false. §9.1 restated as strata, derived mechanically. |
| 30 | `68` read `20`'s apron "as a constant" — still an edge       | `PhysicalTileApron` moves to `Contract/`; §2. |
| 31 | `62` resolved cutout at `16`, which reads no channel         | `16` §3.1 declares the coverage test and the edge it costs. |
| 32 | `62` §3 ① collected transmissive occupants from nothing      | `TransmissionIndex` in `08` §2; `62` records twice at ⑤. |
| 33 | Exposure owned by `46`/`48` and by `66`/`76` simultaneously  | `46` wins. Exposure is a stored camera property. |
| 34 | `SelectionSequence` both persisted (`12`) and not (`48`)     | `48` wins. Session-scoped; `12` §11 amended. |
| 35 | `MotionSurface` required by `64`, forbidden by `16` §6       | `16` writes it; §6's gate names motion. `16` §4.2. |
| 36 | `06` §4.2 wrote the document through `10`, breaking §2       | `06` reports the loss; `32` instructs `48` to write. |
| 37 | `OccupancyIndex` named two components in one unit            | `42`'s becomes `PartitionResolutionIndex`.   |
| 38 | `TransferSpecification` named two; `ColourProjection` two spellings | `36`'s becomes `TransferProjection`; `ChromaticProjection` retired. |
| 39 | Conflict 27 named one owner for two tangent-basis mechanisms | `38` stores per vertex; `18` §1.1 interpolates per pixel. |
| 40 | `68` §6 resampled painted texels it cannot reach             | `68` advances the revision; `56` §3.1 resamples on the tick. |
| 41 | `02` §5's `ConstraintSolver` had no consumer in the series   | Removed, per `02` §8's own gate.              |
| 42 | `28`'s resident total was arithmetically wrong               | 298 KiB, not 217 KB. `SkyViewSurface` is 162 KiB. |
| 43 | The brush was referenced everywhere and declared nowhere     | `58`. Previously mis-cited as conflict 12.   |

### 10.1 Placed content — the four rulings

Placed content is text, imagery or vector outlines positioned on a surface and remaining editable afterwards.
Four decisions cut across `56`, `72`, `12`, `70` and `82`, so they are ruled here once rather than in each.

**① Three placement modes, and only two of them persist.**

| Mode         | Placed by                              | Manipulated by            | Crosses a chart seam |
|--------------|----------------------------------------|---------------------------|-----------------------|
| Screen       | Camera projection at the moment of placement | `78`, in three dimensions | Yes                   |
| Domain       | Positioned directly in the surface domain | `78`, in the domain view  | No — it is in one chart |
| Projected    | A projecting transform, slide-projector style | `78`, in three dimensions | Yes                   |

🔴 Screen placement is a **gesture, not a persistent mode**. On release it resolves into a projected placement
initialised from the camera at that instant. A placement that stays bound to the live camera slides across the
surface as the artist orbits, and the artist reads that as the placement having moved.

🔴 A projecting transform is attached to its occupant through `AttachmentFollows`. Without it the occupant moves
and the placement stays behind in document space.

**② Placement is re-resolved by what changed, never by the rotation.** Resolved texels are a function of the
source, the placing transform **expressed relative to the surface**, and the reduction level. The camera is not
in that list, and neither is the occupant's composed transform.

| What changed                                              | What is re-resolved                                    |
|-----------------------------------------------------------|---------------------------------------------------------|
| The camera moved                                          | Nothing                                                 |
| The occupant moved, placement attached and unchanged      | Nothing                                                 |
| The placing transform changed relative to the surface     | Resident tiles under the prior and the current extent   |
| A tile was promoted to a finer reduction level            | That tile                                               |
| A layer beneath the placement was edited                  | Upward from that layer, over the affected extent only   |

Each placement carries a revision counter advanced only by the third row; each resident tile records the counters
it was resolved from. Comparison is an integer test at Tier A. `56` caches the accumulated result beneath each
placement so an untouched layer sequence is never re-resolved.

**③ Ordering is the layer sequence, and there is only one of them.** Within a placement enclosure, enclosure
order and layer order are the **same stored ordinal**. Dragging a row in the outliner is a reorder of the layer
sequence, committed as one transaction. Two orderings over the same content would disagree, and the artist would
be right and the program wrong.

⚠️ Painted layers between two placements do not appear in the outliner, so a placement beneath a painted layer is
not visible there. The layer presentation in `56` is the complete ordering; the outliner shows the placements
within it.

**④ Source is a narrowing of the presented rows, not a containment.** Text, imagery and vector placements sit
interleaved in layer order and carry a source marker. Presenting them as three enclosures would impose a second
ordering that contradicts ruling ③, and cross-source order — the reason a text placement sits behind an image —
would become invisible exactly when the artist is asking why.

## 11. Gates

- **Gate:** No unit links a unit above it in §2, and `SlateVulkan` and `SlateDocument` never link each other.
- **Gate:** No ImGui spelling appears outside `SlateUI/`.
- **Gate:** No banned word appears in any folder, file, type, function or variable name in the tree.
- **Gate:** Every `Shared/` entry point has `ParityRunner` coverage at its declared tier.
- **Gate:** Every computation declares a tier, and no computation claims a tier above its weakest input.
- **Gate:** No occurrence of `CMakeLists.txt` anywhere in the repository.
- **Gate:** `glfw3dll.lib` is the linked import library; `glfw3.lib` appears nowhere.
- 🔴 **Gate:** The Upstream edges declared across §9 contain **no cycle**, and §9.1's stratum table is the output
  of the same traversal rather than a second hand-maintained copy of it. Checked by a script over the Position
  blocks, run in every build, not by reading. Conflict 29 records that this gate was written and never run: a
  cycle through `72`, `78` and `74` survived the entire series, which is the precise failure mode conflict 13
  was supposed to have closed. A gate that is not mechanised is a comment.
- 🔴 **Gate:** Every Upstream field names every document whose mechanism the document reads. An omitted edge
  makes the gate above sound on a graph that is not the real one.
- 🔴 **Gate:** Every item of state in the engine names exactly one owning document. Two owners is conflicts 33
  and 34, and both produced code that would run and be wrong.
- **Gate:** Every document named in a §9 Downstream or Upstream field exists in §9.
- 🔴 **Gate:** No document references a mechanism, section or field that does not exist. Every citation of the
  form `NN` §M resolves to a real section of a real document, checked mechanically. `88` is deleted and the
  clause that pointed at it is deleted with it.
- **Gate:** Every absence in §5 names a substitution, and §5 is re-derived against the artist's workflow whenever
  a document is added — never against the donor corpus alone.
- **Gate:** Every shared target in `08` §2 declares exactly one producing recording and, where amended, an
  explicit ordered list of amending recordings.
- **Gate:** Every analytic source resolves identically on the host and on the device, proven by `ParityRunner` at
  Tier B. A source that cannot be resolved on the host cannot be previewed, and the mismatch would be attributed
  to the preview rather than to the source.
- **Gate:** No mechanism resolves a pointer position to an occupant by reading back a device target. Readback is
  latent by the recording slot count; `74` resolves on the host.

## 12. Open

Carried deliberately rather than answered by assumption. Each names who must answer and what it blocks.

| Open question                                                            | Blocks                     |
|--------------------------------------------------------------------------|-----------------------------|
| `DOC/Engine Naming Generation Skill.md` was outside the read set          | Nothing yet; may amend §8   |
| `DOC/VulkanFolder.md` exists but was not listed; `00` says it supersedes  | `06` folder detail          |
| PBR channel bit depths and slot layout are unspecified in every source    | `18` implementation, not design |
| Whether `ConsoleHost` ships or stays internal                             | `32` only                   |
| Whether occupant instancing is adopted, or topology is stored per occupant| Scale only; measure first   |
| Whether partitions carry reduction levels, or `16` cost tracks partitions | Scale only; measure first   |
| Whether a typeface is embedded on save or referenced                      | `48` portability; licensing |
| Whether a stroke crossing a chart seam is continuous or two strokes       | `68` seam handling          |
| Whether the outliner presents painted layers or only placements           | `84` and `56` presentation  |

⚠️ "Whether a colour sampled from the workspace is display-referred or working" is closed — `36` §6 rules
it scene-referred and supplies the reason. It was carried here and in `76` §6 after being closed.
