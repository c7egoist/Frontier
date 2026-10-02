++ b/AgenticInstuctions/ConstructionSequence/GlobalIlllumination/ScheduleAmendment.md
# ScheduleAmendment — What `08` Becomes

`08` declares fifteen shared targets, one ordering, and one substitution table. This branch adds four targets, six
recording positions, two substitution rows, and two fields to `DeclaredRecording`. It retires nothing.

This document carries the replacement text. It is the authority every other document in the branch defers to for
ordering — `IlluminationGroundwork` §4, `94` §8 and `98` §6 all point here — and it is where one tension between
two already-written documents is resolved rather than left for the recording site to discover.

## Position In The Sequence

| Field       | Value                                                                        |
|-------------|-------------------------------------------------------------------------------|
| Unit        | None — this is an amendment to `08` and to `RenderSchedule.h`, not a component |
| Layer       | `Layer2_Device`, with consequences at `Layer4_Compute`                        |
| Upstream    | `IlluminationGroundwork`, `90` (the capability), `92`, `94`, `96`, `98`, `100`, `102` |
| Downstream  | Every contribution in the branch, and `18`'s amended read set                 |
| Unblocks    | A schedule that orders the branch by derivation rather than by contribution accident |

## 1. What Is Amended

| Amended                          | Section here | Nature                                                  |
|----------------------------------|--------------|----------------------------------------------------------|
| `08` §2 — the target table       | §2           | Four targets appended; the existing fifteen untouched    |
| `08` §3 — the ordering           | §3           | Six positions inserted below ④, none renumbered          |
| `08` §5 — substitution           | §5           | Two rows, both authored by `90` §5                       |
| `RenderSchedule.h`               | §4           | Two fields on `DeclaredRecording`                        |
| `94` §3 and §7                   | 🔴 §3.1      | The direct recording separates from `18`                 |
| `18`, `64`, `86`, `02`, `14`, `90` | §6         | The amendment surface, one row each                      |
| `30`, `44`, `60`, `62`           | §6           | 🔴 Not amended at all — stated so it is not assumed      |

## 2. `08` §2 — The Target Table

Replacement text for the enumeration. 🔴 The four new members are **appended** and the ordinals of the existing
fifteen are unchanged.

```cpp
enum class SharedTarget : std::uint32_t
{
    DepthSurface            = 0u,   // [-] - D32, display extent
    VisibilityIndex         = 1u,   // [-] - R32G32 unsigned integer, display extent
    OccupancySurface        = 2u,   // [-] - R8, display extent
    MotionSurface           = 3u,   // [-] - R16G16 real, display extent
    OcclusionSurface        = 4u,   // [-] - R8, half display extent
    DirectOcclusionSurface  = 5u,   // [-] - RGBA8; four illuminants, per DirectOcclusionCapacity
    TransmissionIndex       = 6u,   // [-] - R32G32 unsigned integer × TransmissionDepth, display extent
    RadianceSurface         = 7u,   // [-] - RGBA16 real, display extent
    ReflectionSurface       = 8u,   // [-] - RGBA16 real, half display extent
    AccumulationSurface     = 9u,   // [-] - RGBA16 real, display extent
    DisplaySurface          = 10u,  // [-] - display format and extent
    OutlineSurface          = 11u,  // [-] - R8, display extent
    TransmittanceSurface    = 12u,  // [-] - RGBA16 real, 256 × 64 — resident, 128 KiB
    MultiScatterSurface     = 13u,  // [-] - RGBA16 real, 32 × 32 — resident, 8 KiB
    SkyViewSurface          = 14u,  // [-] - RGBA16 real, 192 × 108 — resident, 162 KiB
    DirectDiffuseSurface    = 15u,  // [-] - RGBA16 real, display extent — demodulated; `94` §3
    DirectSpecularSurface   = 16u,  // [-] - RGBA16 real, display extent — demodulated; α carries roughness
    IndirectDiffuseSurface  = 17u,  // [-] - RGBA16 real, half display extent — demodulated
    IndirectSpecularSurface = 18u,  // [-] - RGBA16 real, half display extent — demodulated
    TargetCount             = 19u   // [-] - the closed count, never a target
};
```

🔴 Appended and never inserted. `TargetSpace` indexes `ClaimedFor` and `TargetClaimed` by ordinal and
`RenderSchedule` indexes `ProducerOf` by ordinal; an insertion in the middle renumbers every one of them and every
`86` metric keyed by target, silently, in a way that compiles.

| New target                | Relation             | Produced by | Amended by | Read by                    |
|---------------------------|----------------------|-------------|------------|-----------------------------|
| `DirectDiffuseSurface`    | `DisplayRelative`    | `94` ③·iv   | `102` ③·vi | `18`                        |
| `DirectSpecularSurface`   | `DisplayRelative`    | `94` ③·iv   | `102` ③·vi | `18`                        |
| `IndirectDiffuseSurface`  | `FractionOfDisplay`  | `94` ③·v    | `102` ③·vi | `18`, bilaterally upsampled |
| `IndirectSpecularSurface` | `FractionOfDisplay`  | `94` ③·v    | `102` ③·vi | `18`, bilaterally upsampled |

⚠️ `RelationOfTarget` gains four rows and its table stays total over the enumeration. `06` §4.1's gate runs both
ways unchanged: all four are extent-derived, so all four are reclaimed on a display extent change and none is
absolute.

### 2.1 What Is **Not** A Shared Target

Stated because each is a target somebody would add on reflex, and each has exactly one reader.

| Not a shared target                     | Claimed by | Why not shared                                        |
|-----------------------------------------|------------|--------------------------------------------------------|
| `102`'s first and second moments        | `102`      | One reader; `102` §2 already keeps them out of the signals |
| `102`'s wavelet ping-pong extent        | `102`      | Scratch between iterations; nothing outside sees it   |
| `92`'s reservoirs, both signals, both slots | `92`   | Structured records, not images; `ImageSpace` claims neither |
| `92`'s traversal structure and scratch  | `92`       | Driver-shaped; `TargetSpace` claims images only        |
| `96`'s store, `98`'s cells              | Each       | World-referred and extent-independent                  |
| `100`'s maximum chain and illuminant atlas | `100`   | One reader — `94` §2's seam at `ScreenTraced`          |

🔴 A surface orientation target is **not** added and neither is a roughness target. `16` §6's gate stands: depth,
identity, coverage and motion, and nothing else. `102` reconstructs orientation from `VisibilityIndex` through the
same `Shared/` routine `18` uses, and roughness rides in `DirectSpecularSurface`'s alpha where `94` already has it
resolved. An arrangement that added either is the wide attribute target `16` §4 exists to refuse, arriving through
a reconstruction document rather than through a visibility one.

### 2.2 Extent Arithmetic — The Whole Branch At 1920 × 1080

| Claim                                        | Arithmetic                              | Claimed    |
|----------------------------------------------|------------------------------------------|------------|
| `DirectDiffuseSurface`                       | 1920 × 1080 × 8 B                        | 15.8 MiB   |
| `DirectSpecularSurface`                      | 1920 × 1080 × 8 B                        | 15.8 MiB   |
| `IndirectDiffuseSurface`                     | 960 × 540 × 8 B                          | 4.0 MiB    |
| `IndirectSpecularSurface`                    | 960 × 540 × 8 B                          | 4.0 MiB    |
| `102`'s moments, direct pair, two slots      | 1920 × 1080 × 4 B × 2                    | 15.8 MiB   |
| `102`'s moments, indirect pair, two slots    | 960 × 540 × 4 B × 2                      | 4.0 MiB    |
| `102`'s ping-pong extent                     | One display-extent RGBA16                | 15.8 MiB   |
| `92`'s reservoirs, both signals              | `92` §5                                  | 183 MiB    |
| `92`'s structure and scratch, ~500K triangles | `92` §5                                 | 16 MiB     |
| `96`'s store, `98`'s cells, `100`'s chain     | Declared extents; `96` §8, `98` §8        | ~40 MiB    |

⚠️ 💾 ≈ 314 MiB, of which `92`'s reservoirs are 58 %. The signal and moment targets together are 75 MiB and are
not where this branch's memory goes; `92` §7's open row about display-extent reservoirs above 1440p is the one that
decides whether this fits a 6 GiB device, and no amendment here changes that.

### 2.3 The Claim Stays Total

🔴 `TargetSpace::Claim` gains **no capability argument**. Every one of the nineteen targets is claimed at every
capability, including `DirectOcclusionSurface` where `60` is substituted away and the indirect pair where no
indirect term is produced.

⚠️ The cost is real and small — `DirectOcclusionSurface` is 8 MiB at 1080p and unread above `ScreenTraced`. The
alternative costs more than it saves: a conditional claim makes `Resolve` refuse at a site that never expected a
refusal, and `TargetSpace::Claim`'s own contract is that the claim is granted in full or refused in full. A partial
claim set is the arrangement that note exists to forbid, arriving with a capability attached.

## 3. `08` §3 — The Ordering

Six positions are inserted **between ③ and ④**, using `08` §3's existing sub-ordinal idiom — the one
`TransmissionSequence` already writes as ⑤·i and ⑤·ii. 🔴 Nothing is renumbered. Every existing amendment ordinal,
every `08` §3 reference in a source comment, and every `86` metric identity stands.

| Position | Recording                       | Produces / amends                                              | Recorded at            |
|----------|---------------------------------|-----------------------------------------------------------------|-------------------------|
| ①        | Atmosphere                      | The three resident targets                                      | every capability        |
| ②        | `16` — visibility               | Depth, index, occupancy, motion                                 | every capability        |
| ③        | `60` — occlusion projections    | `OcclusionSurface`, `DirectOcclusionSurface`                    | 🔴 `ScreenTraced` only  |
| ③·i      | `100` — maximum chain, atlas tiles | Produces no shared target; its chain is its own claim        | `ScreenTraced` only     |
| ③·ii     | `92` — structure refit          | Produces no shared target; serial on the one queue              | `ComputeTraced` upward  |
| ③·iii    | `98` — cell reservoir refresh   | Produces no shared target; round-robin, bounded                 | every capability        |
| ③·iv     | `94` direct — ordinal 4         | Produces `DirectDiffuseSurface`, `DirectSpecularSurface`        | every capability        |
| ③·v      | `94` indirect — ordinal 6       | Produces the indirect pair; injects `96`                        | `ComputeTraced` upward, or `100` §5 |
| ③·vi     | `102` — ordinal 8               | Amends all four signal targets                                  | every capability        |
| ④        | `18`                            | Produces `RadianceSurface`; 🔴 reads the four signals           | every capability        |
| ⑤·i ·ii  | `62` — ordinals 10, 20          | Unchanged                                                       | every capability        |
| ⑥        | `30` — ordinal 30               | Unchanged                                                       | every capability        |
| ⑦        | `64` — ordinal 40               | Unchanged                                                       | every capability        |
| ⑧        | `DisplayProjection` — ordinal 50 | 🔴 `08` §3.1's display-referred line                            | every capability        |
| ⑨        | `IntersectionOutline` — ordinal 60 | Unchanged                                                     | every capability        |
| ⑩ … ⑬    | Unchanged                       | 🔴 This branch records nothing after ⑧                          | every capability        |

🔴 Exactly one of ③·i and ③·ii records. They are the two answers to `94` §2's `ClassifyOcclusion` seam and a
schedule that recorded both would build a traversal structure nothing queries, or march a chain nothing reads.

⚠️ Everything this branch adds sits **above** ⑧. `08` §3.1's line is not approached, let alone crossed, and the
gate that `Fix` runs — nothing scene-referred ordered after the display-referred line — is satisfied without
argument for all six insertions.

### 3.1 🔴 The Direct Recording Is Its Own Dispatch

`94` §3 says direct resampling runs *inside* `18`'s per-material dispatch, and `102` §4 says reconstruction records
*before* `18`. Both cannot hold: a signal produced inside `18` cannot be reconstructed before `18` consumes it.
This document owns the ordering, so this document rules.

**`94`'s direct recording is a separate compute dispatch at ③·iv.** `94` §3's step list is unchanged in every
other respect — same compacted pixel lists, same eight steps, same single `ClassifyOcclusion` at ⑥ — but it
dispatches on its own and writes the two direct signal targets rather than shading into `RadianceSurface`.

| Consequence                                  | Cost or gain                                                    |
|----------------------------------------------|------------------------------------------------------------------|
| Position and orientation reconstructed twice | Cost: once at ③·iv for `p̂`, once at ④ for shading                |
| Radiometric channels resolved twice          | 🔴 **Avoided** — §3.2; `94` resolves far fewer channels than `18` |
| The direct term is reconstructible           | Gain: `102` §1's four-signal split becomes real rather than two   |
| `94` §3's one-visibility-query economy       | Unchanged — the economy is per pixel, not per dispatch            |
| `IlluminationGroundwork` §4's claims          | Unchanged — `16` still writes no new target, `30` still composites, `64` still accumulates unfiltered |

⚠️ The alternative — fusing direct into `18` and reconstructing only the indirect pair — was considered and
refused. Resampled direct light at one sample per pixel is the noisiest signal this branch produces, contact
shadows are where the artist looks, and a fused arrangement is one where the noisiest signal is the only one that
cannot be reconstructed. `102` §5's decay would then sharpen an image whose direct term never had a filter to decay
out of.

🔴 `94` §3's opening line and §7's table are superseded by this section, and `94` §10's fourth gate reads "writes
no new **resolved** target" — `RadianceSurface` is still produced whole by `18` and by nothing else.

### 3.2 Demodulation — Why The Signals Are Not Radiance

🔴 The four signal targets carry radiance **divided by the surface's reflectance**, and `18` re-modulates.

For a texture painting application this is not an optimisation, it is the difference between a usable image and an
unusable one. A reconstruction kernel run over modulated radiance averages albedo across its footprint, and albedo
is exactly the quantity the artist just painted. The brushwork blurs, and it blurs *more* where the signal is
noisiest — so the artist's strokes soften in shadow and sharpen in light, which reads as the paint tool being
broken rather than the renderer being smooth.

| Signal            | Divided by                                        | Re-modulated at ④ by                        |
|-------------------|---------------------------------------------------|----------------------------------------------|
| Direct diffuse    | Diffuse reflectance — channel 1, resolved          | The same channel, resolved again             |
| Direct specular   | The directional specular reflectance at this angle | The same                                     |
| Indirect diffuse  | Diffuse reflectance                                | The same                                     |
| Indirect specular | Directional specular reflectance                   | The same                                     |

⚠️ The divisor is bounded away from nothing and the bound lives in `Contract/`, never at the site — `02` §8. A
demodulation bound written at four sites is tuned at four sites and disagrees at three, and it disagrees precisely
on near-black materials where the quotient is largest.

🔴 `94`'s dispatch resolves what `p̂` needs and no more: position, orientation, the two reflectance quantities
above, and roughness. `18` continues to resolve every channel through `20` and `70`. The two dispatches overlap on
a small subset, which is why §3.1's second row reads as a gain — a fused arrangement would have had `94` carry
`18`'s whole channel resolve into a recording that only needed a fraction of it.

### 3.3 Where `18` Reads Them

Superseding `94` §7's table.

| `AmbientContribution` member | Source today                        | Source at ④ after this branch                       |
|------------------------------|-------------------------------------|------------------------------------------------------|
| `DiffuseComponent`           | `SkyViewSurface`, cosine-convolved  | `IndirectDiffuseSurface`, upsampled, re-modulated; the sky where absent |
| `SpecularComponent`          | `SkyViewSurface` at the reflection direction | `IndirectSpecularSurface`, likewise           |
| `EmissiveComponent`          | Channel 7                           | Unchanged — never attenuated, never resampled        |
| `Attenuation`                | Channel 6 × `60`                    | Channel 6 only above `ScreenTraced`                  |
| The direct term              | Integrate `44` §5's reaching set    | `DirectDiffuseSurface` + `DirectSpecularSurface`, re-modulated |

⚠️ `18`'s ambient specular is still **pre-added** before `30` subtracts it. `30` §1's exact composite has the same
operand it always had, computed from a different source, and `SpecularProjection::Compose` is not amended. This is
`IlluminationGroundwork` §4's first consequence and it survives §3.1's separation intact.

## 4. Two Amendments To `RenderSchedule.h`

Both are forced by the ordering above, and both are stated as source rather than as prose because `Fix` is
mechanical and refuses what it cannot derive.

### 4.1 A rotation-crossing read

`102` reads `AccumulationSurface` for `64`'s stored sample count — `102` §5 — and `64` produces that target at ⑦,
three positions later. `Fix` refuses when a target is read by a recording ordered before its producer, so the
declaration must say which rotation it means.

```cpp
// 🔴 Read from the **previous** cycle slot, and therefore excluded from the producer-ordering derivation.
//    `102` §5 reads `64`'s stored count and `64` §6 reads its own previous result; both are rotation-crossing
//    and both are declared, never omitted. An edge left out of `Reads` to dodge the derivation makes `Fix`
//    sound on a graph that is not the real one.
// 📝 `Contribute` refuses a target that appears in both `Reads` and `ReadsPreviousSlot`.
std::vector<SharedTarget>  ReadsPreviousSlot = {};   // [-] - consumed from the prior cycle slot
```

⚠️ `64`'s existing self-read migrates to this field. It changes no behaviour and no ordering — it makes the edge
that `64` §6 already declares in prose visible to the mechanism that checks it.

### 4.2 A capability range

`60` records only at `ScreenTraced` and `92` only above it. The existing pair — `CapabilityRequired` with a
`Substitution` — expresses "absent, so run something else" and cannot express "present, so do not run".

```cpp
// 🔴 The inclusive capability range this recording is contributed for. The defaults admit every capability, so
//    every recording contributed before this field existed is unchanged.
// 📝 The capability is fixed at device creation and `Contribute` runs at bring-up, so a contributor may equally
//    resolve its own declaration against it. This pair exists so that the common case needs no branch.
TraversalCapability  RecordedFrom    = TraversalCapability::ScreenTraced;     // [-] - inclusive floor
TraversalCapability  RecordedThrough = TraversalCapability::HardwareTraced;   // [-] - inclusive ceiling
```

| Recording       | `RecordedFrom`  | `RecordedThrough` |
|-----------------|-----------------|--------------------|
| `60` at ③       | `ScreenTraced`  | 🔴 `ScreenTraced`  |
| `100` at ③·i    | `ScreenTraced`  | `ScreenTraced`     |
| `92` at ③·ii    | `ComputeTraced` | `HardwareTraced`   |
| `94` indirect at ③·v | `ScreenTraced` where `100` §5 ships, else `ComputeTraced` | `HardwareTraced` |
| Everything else | Default         | Default            |

🔴 A recording excluded by its range is excluded from `ProducerOf` as well, so `18`'s read of
`DirectOcclusionSurface` must also be conditional above `ScreenTraced` or `Fix` refuses a read with no producer.
That conditionality is resolved at contribution time against the fixed capability — it is never a runtime branch,
which is `94` §2's rule and `VulkanExchange`'s own note.

⚠️ `RenderSchedule.h` already includes `VulkanExchange.h`, so `TraversalCapability` is in scope where the field is
declared. No include is added and no header inverts.

## 5. `08` §5 — Substitution

Two rows, authored by `90` §5 and reproduced here because `08` §5 is where the table lives.

| Capability absent          | Recordings affected     | Substitution                                                   |
|----------------------------|-------------------------|-----------------------------------------------------------------|
| Traversal group            | ③·ii, ③·v               | ③·i's extremum march answers `ClassifyOcclusion`; `96` is the only indirect source; ③ stands |
| Ray-tracing recording only | ③·iv, ③·v               | The inline ray-query form; the algorithm and every target are identical |

⚠️ The second row substitutes an execution model and not an algorithm, so it changes no target, no ordinal and no
read set. It is a row in the table because `08` §1 requires a capability requirement to name what runs instead,
not because anything downstream can tell the difference.

🔴 `102` at ③·vi declares **no capability requirement**. It reconstructs whatever the four signal targets carry,
and at `ScreenTraced` with no indirect term the indirect pair carries the sky-derived fallback `18` would have read
anyway. A reconstruction that refused when a capability was absent would leave the direct signals — the noisiest
ones — unreconstructed on exactly the hardware least able to converge them.

## 6. The Amendment Surface

One row per document the branch touches outside its own numbering. 🔴 A document not listed is not amended, and
four of them are listed precisely to say so.

| Document | Amended                                                                                       |
|----------|------------------------------------------------------------------------------------------------|
| `02`     | §6 gains `104`'s two entry points; `Contract/` gains the non-finite weight bound, the demodulation bound, and the march crossing bound |
| `14`     | One panel row presenting `90`'s negotiated capability and `86`'s occupancy and truncation reports |
| `18`     | §5's ambient sources become §3.3's table; §9's first gate becomes `IlluminationGroundwork` §1's restatement; the direct term is read and re-modulated rather than integrated |
| `28`     | 🔴 Not amended. `SkyViewSurface` keeps its meaning and remains the fallback `96` §4's chain terminates at |
| `30`     | 🔴 Not amended. §3.3's last note is why — the composite's operand is unchanged                  |
| `44`     | 🔴 Not amended. §5's index still answers the primary term; `98` is a second structure, not a replacement |
| `60`     | 🔴 Not amended internally. §8's second gate holds at `ScreenTraced`; §4.2's range excludes it above |
| `62`     | 🔴 Not amended. Ordinals 10 and 20 stand and `08` §3.2's rule covers `94`'s two recordings without change |
| `64`     | §6's self-read migrates to §4.1's field; `RejectionSpecification::CountCeiling` gains a second reader in `102` §5 |
| `86`     | New reported measures: `96`'s occupancy, `92`'s refit count and invalidation cause, `100`'s atlas truncation, `94`'s bounded non-finite weights |
| `90`     | Its own §2 enumeration is the operand of §4.2's fields; no change to `90`'s text                |
| `00`     | §5's global-illumination row deleted; §5.1's socket one names `102`; §9's series list gains eight entries; §9.1 re-derived |

## 7. Gates

- **Gate:** The four new targets are appended; no existing target ordinal changes.
- **Gate:** `RelationOfTarget` stays total over the enumeration.
- **Gate:** No orientation target and no roughness target is added; `16` §6's gate is untouched.
- **Gate:** `TargetSpace::Claim` takes no capability argument and claims all nineteen at every capability.
- **Gate:** Six positions are inserted below ④ using the sub-ordinal idiom; nothing is renumbered.
- **Gate:** Exactly one of ③·i and ③·ii records.
- **Gate:** Nothing this branch contributes is ordered after ⑧.
- 🔴 **Gate:** `94`'s direct term is its own dispatch at ③·iv and produces two targets; `18` produces
  `RadianceSurface` whole and remains its only producer.
- 🔴 **Gate:** All four signal targets are demodulated; `18` re-modulates; the bound is in `Contract/`.
- **Gate:** `102` amends the four signals and produces none of them.
- **Gate:** Every rotation-crossing read is declared through `ReadsPreviousSlot`, never omitted from `Reads`.
- **Gate:** A capability-conditional read set is resolved at contribution time, never branched at a recording site.
- **Gate:** `08` §5 carries both substitution rows and `102` requires no capability.
- **Gate:** `30`, `44`, `62` and `28` are not amended by this branch.

## 8. Open

| Open question                                                                  | Blocks                              |
|---------------------------------------------------------------------------------|--------------------------------------|
| Whether the direct pair packs to one RGBA16 target with a shared luminance       | 💾 §2.2; costs a reconstruction extent |
| Whether `DirectOcclusionSurface` is ever claimed conditionally                    | 💾 8 MiB against §2.3's ruling       |
| Whether `102`'s ping-pong extent can be one of `62`'s intermediates               | 💾 15.8 MiB; `62` §4 carries the shape |
| Whether `64`'s self-read migration is done in this branch or separately            | Nothing structural; §4.1 changes no behaviour |
| Whether ③·iii is worth a position of its own or folds into ③·v's dispatch          | Cost only; `98` §3's round-robin is small |
++ "b/AgenticInstuctions/ConstructionSequence/SlateCAD/Slate CAD \342\200\224 Top\342\200\221Level Architecture.md"	
Slate CAD — Top‑Level Architecture
Documents 88–110. Two new link units: SlateGeometry, SlateFeature. Zero changes to Contract/'s existing rules, three additions to it.

0. Why the previous three attempts failed, stated as mechanism
Every failure you described has one root: the display approximation was the source of truth. Once a shape exists only as a triangle run, four things become impossible and all four bit you.

Symptom you hit	Actual mechanism	What must exist instead
Extrude shows only top and bottom	The extruder triangulated two caps. Nothing enumerated the lateral faces because there was no face list — only a vertex run.	A face is a stored object. The extruder emits one lateral face per profile edge, and tessellation walks the face list rather than the profile.
Clicking the extrusion selects the base profile	The pick resolved to whatever polygon was hit, and the polygon still belonged to the 2D shape record. There was no ownership chain.	A pick resolves facet → face → shell → solid → body → feature, and the active scope decides which link is returned.
Moving moves one face	The transform was applied to the picked record, and the picked record was one polygon.	Transform targets a body occurrence, never a face. Face motion is a feature (push/pull), not a direct mutation.
Boolean fails	Mesh booleans on a display approximation.	Booleans run on exact surfaces — plane, cylinder, cone, sphere, torus, NURBS — with tolerant classification. Clipper2 handles the planar/UV cases only.
The rule the whole architecture is built to enforce:

The B‑rep is the document. Every triangle, every line strip, every bounding extent, every UV chart is a derived, evictable, reconstructible artefact keyed by the revision that produced it. A second copy of shape is a defect, not an optimisation.

That is Depot semantics, and Slate already has the vocabulary (SurfaceDepot, ContentKey, KeysAgree). We reuse it verbatim.

1. Link units and where they sit
Slate's existing strata (from 00 §9.1) are extended with two units. Neither has a device edge; neither includes a Vulkan header; both are testable headlessly through ConsoleHost.

CopyApplication/            ConsoleHost, DisplayHost
        │
SlateUI/                + SketchPanel, FeaturePanel, MeasurePanel
        │
SlateCompute/           + FacetDepot, CurveDepot, FacetRaster, CurveRaster
        │
SlateFeature/    ← NEW  FeatureStructure, RecomputeScheduler, ProvenanceIndex,
        │               SketchStructure, ConstraintSolver, ReferenceSpecification
SlateDocument/          (existing — PopulationIndex, SceneStructure, RevisionSequence …)
        │
SlateGeometry/   ← NEW  SolidStructure, CurveSpecification, SurfaceSpecification,
        │               IntersectionSolver, BooleanSolver, FilletSolver, FacetStructure
SlateMath/              + RootSolver, SystemSolver, PolynomialSolver
        │
Shared/                 (existing exact predicates — reused, never duplicated)
        │
Contract/               + GeometryContract.h, TopologyContract.h, ReferenceContract.h
SlateGeometry may not name SlateDocument. It knows nothing of occupants, revisions, selection or the outliner. It takes specifications in and returns Deliver<SolidStructure> out. This is what makes it fuzz‑testable in isolation and what stops the kernel from acquiring an opinion about the UI — the failure that produced your third rewrite.

SlateFeature may not name SlateCompute or SlateVulkan. It produces exact geometry and identity; the device sees only what a Depot hands it.

Directory hierarchy (per 00 §1.1)
CopyEngine/SlateGeometry/
  Geometry/
    CurveSpecification/     {Api,Source}
    SurfaceSpecification/   {Api,Source}
    CurveProjection/        {Api,Source,Shared}
    SurfaceProjection/      {Api,Source,Shared}
    ProximitySpace/         {Api,Source}
  Topology/
    SolidStructure/         {Api,Source}
    StitchSolver/           {Api,Source}
    SolidClassifier/        {Api,Source}
    MomentIntegrator/       {Api,Source}
  Operation/
    ExtrusionSpecification/ {Api,Source}
    RevolutionSpecification/{Api,Source}
    LoftSpecification/      {Api,Source}
    SweepSpecification/     {Api,Source}
    IntersectionSolver/     {Api,Source}
    BooleanSolver/          {Api,Source}
    FilletSolver/           {Api,Source}
    OffsetSolver/           {Api,Source}
    DraftSolver/            {Api,Source}
  Discrete/
    TessellationSpecification/ {Api,Source}
    FacetStructure/            {Api,Source}
    EdgeDiscretisation/        {Api,Source}     ← see §12 naming note
Engine/SlateFeature/
  Feature/
    FeatureStructure/       {Api,Source}
    RecomputeScheduler/     {Api,Source}
    ExpressionSolver/       {Api,Source}
  Reference/
    ProvenanceIndex/        {Api,Source}
    ReferenceSpecification/ {Api,Source}
    PickClassifier/         {Api,Source}
  Sketch/
    SketchStructure/        {Api,Source}
    ConstraintSpecification/{Api,Source}
    ConstraintSolver/       {Api,Source}
    ProfileSolver/          {Api,Source}
  Bridge/
    TopologyProjection/     {Api,Source}
  Format/
    StepCodec/  IgesCodec/  DxfCodec/  StlCodec/   {Api,Source}
Copy
2. Contract/ additions
Three headers. Nothing here allocates; everything is constexpr or a plain aggregate; both toolchains read it.

2.1 GeometryContract.h — the tolerance model
Your old code had AreaEps = 1e-6f sitting in an anonymous namespace inside one .cpp. That is the seed of every later disagreement. Tolerance is declared once, in millimetres, at 64 bits.

CopyModelTolerance          = 1e-6   [mm]   the finest distance two positions may differ and still be one point
AngularTolerance        = 1e-9   [rad]  the finest angle two directions may differ and still be parallel
ParameterTolerance      = 1e-9   [-]    curve/surface parameter resolution
ResolutionTolerance     = 1e-3   [mm]   default chord deviation for the finest display level
SliverAreaFloor         = 1e-8   [mm²]  a face below this is refused at construction, never emitted
MaximumModelExtent      = 1e6    [mm]   one kilometre; beyond it, rebasing is mandatory
Four rules stated as contract, not as convention:

Every topological item carries its own tolerance, never smaller than ModelTolerance. A vertex where three surfaces meet imprecisely carries the radius of the ball containing all three intersection candidates.
Tolerance only widens. An operation may raise the tolerance of an item it produces; it may never lower one. StitchSolver widens; nothing narrows.
Two items are the same point iff their positions differ by less than the sum of their tolerances. This is one function, PositionsCoincide, in Shared/, and it is the only coincidence test in the engine.
No operation invents an epsilon. A local constant that is not derived from these five is a defect caught at review.
2.2 TopologyContract.h
Copyenum class TopologicalSense   { Forward, Reversed }
enum class ShellOrientation   { Outward, Inward }
enum class Containment        { Inside, Boundary, Outside }
enum class CurveContinuity    { Positional, Tangential, Curvature }
enum class WindingOrientation { CounterClockwise, Clockwise }
WindingOrientation is the single authority you asked for. The convention, stated once and referenced everywhere:

Outer loops wind counter‑clockwise in the surface's own parameter space, viewed along the surface normal. Inner loops wind clockwise. In world millimetres on a planar face whose normal points toward the viewer, this reads as the familiar positive shoelace area.

Every consumer reads it and none re‑derives it: ProfileSolver, the Clipper2 conversion, the Earcut input assembly, FacetStructure's triangle winding, SolidClassifier's ray parity, and the CurveRaster line direction. Your old NormalizeBooleanLoops did depth‑by‑containment winding correction locally — that logic moves into ProfileSolver::Normalise and is called from exactly one site.

2.3 ReferenceContract.h
Copyenum class GeneratorRole {
    ProfileEdgeLateral, ProfileStartCap, ProfileEndCap,
    RevolutionLateral,  RevolutionSeam,  RevolutionAxisDegenerate,
    LoftLateral,        SweepLateral,
    BooleanIntersection, BooleanRetained, BooleanSplit,
    FilletRolling,      FilletSpherical, FilletSpring,
    OffsetTranslated,   ShellInner,      DraftTapered,
    PatternInstanced,   ImportedFace,    SketchDerived
}
enum class ReferenceStanding { Resolved, Migrated, Ambiguous, Stale }
ReferenceStanding is the return of every reference resolution and is why topological naming will not silently ruin a document. Migrated means the key changed but the fingerprint matched uniquely; Ambiguous means two candidates matched equally well — the feature enters error rather than picking one. Picking one is the defect that makes CAD users distrust a program forever.

3. SlateGeometry — the exact kernel
3.1 CurveSpecification and SurfaceSpecification — analytic first
You said you want analytic geometry kept analytic. That is a storage decision and it must be made here or nowhere.

Both are closed tagged aggregates, not virtual hierarchies. Reasons, in order of weight: they must serialise byte‑for‑byte for determinism; they must upload to the device for CurveRaster; a virtual call per parameter evaluation costs more than the evaluation on analytic forms; and a closed set makes the intersection matrix in §3.4 exhaustive rather than open‑ended.

Copyenum class CurveSubject   { Line, CircularArc, EllipticalArc, Parabola, Hyperbola,
                            PolynomialSpline, RationalSpline, SurfaceIntersection, Trimmed }
enum class SurfaceSubject { Plane, Cylinder, Cone, Sphere, Torus,
                            LinearExtrusion, Revolution, Ruled,
                            PolynomialPatch, RationalPatch, Offset }
SurfaceIntersection and Offset are procedural curves and surfaces: they store their two parents and are evaluated by solving, not by a formula. This is what lets a fillet on a NURBS pair stay exact instead of being frozen into an approximation at construction. They carry a PoleApproximation beside them — a fitted rational form, generated lazily, used only where a consumer explicitly asks for poles (export, some sweeps). The procedural form remains authoritative.

Analytic preservation rule. No operation may lower a surface to RationalPatch unless the result provably has no analytic form. Concretely:

Operation	Analytic result preserved
Extrude a line	Plane
Extrude a circular arc	Cylinder
Extrude an elliptical arc	LinearExtrusion over the ellipse (exact, not fitted)
Extrude a spline	LinearExtrusion over the spline (exact)
Revolve a line, parallel to axis	Cylinder
Revolve a line, oblique	Cone
Revolve a line, perpendicular	Plane (an annulus)
Revolve a circular arc, centre off axis	Torus
Revolve a circular arc, centre on axis	Sphere
Fillet, plane ∧ plane	Cylinder
Fillet, plane ∧ cylinder, axes parallel	Cylinder
Fillet, cylinder ∧ cylinder, axes parallel	Cylinder
Fillet, plane ∧ cylinder, perpendicular	Torus
Fillet, anything else, constant radius	Offset procedural, poles fitted on demand
Offset a plane / cylinder / cone / sphere / torus	same subject, amended parameters
Boolean	operand surfaces are never modified; only trimming loops change
That last row is the one that matters most. A boolean does not create new surfaces except along intersections; it re‑trims existing ones. A cylinder cut by a plane is still exactly a cylinder. Your old code lost that the moment it went to mesh.

CurveProjection / SurfaceProjection live in Shared/ form so the host and the device evaluate identically, and are enrolled in ParityRunner exactly as AtmosphereProjection is. 18 §1.1's tangent‑basis derivation reads them, so a disagreement would show as shading that differs from the silhouette.

3.2 SolidStructure — the B‑rep
Nine item kinds, each in a dense generational span (Identity from IdentityContract.h, reused unchanged):

Item	Holds
Body	one or more shells; one is outer, the rest are voids; a placement
Shell	a closed or open set of faces; an orientation
Face	a SurfaceSpecification ordinal, a sense, an ordered loop run, a tolerance, a ProvenanceKey
Loop	an ordered coedge run; outer or inner
Coedge	an edge ordinal, a sense, the next and previous coedge in its loop, the partner coedge across the edge
Edge	a CurveSpecification ordinal, a parameter interval, two vertex ordinals, a tolerance, a ProvenanceKey
Vertex	a DocumentPosition at 64 bits, a tolerance, a ProvenanceKey
Wire	an edge run not bounding a face — sketches, construction geometry, imported curves
Point	a free vertex
Coedge, not half‑edge. The distinction is not cosmetic: a coedge carries the sense in which its face traverses the edge, so a cylinder's seam and a non‑manifold edge shared by three faces both express naturally. Non‑manifold edges hold a coedge ring rather than a pair. SolidStructure admits them; BooleanSolver refuses to produce them (see §4.3) but must be able to hold one long enough to report it.

Invariants, checked under SLATE_DEBUG by SolidStructure::StructureValid after every operation:

Every coedge's partner's partner is itself.
Every loop closes: following Next returns to the start in exactly the coedge count.
Every edge is referenced by at least one coedge; a manifold solid's edges by exactly two, with opposing senses.
Every face's loops lie on its surface within the face tolerance, sampled at loop vertices and at coedge midpoints.
Euler–Poincaré holds per shell: V − E + F − (L − F) − 2(S − G) = 0.
Outer shell orientation is outward, verified by signed volume from MomentIntegrator.
No face's area is below SliverAreaFloor.
No two vertices of one solid coincide within the sum of their tolerances unless they are the same vertex.
A failed invariant refuses the operation and returns the prior structure. It never returns a half‑built one. This is the discipline that stops a corrupt body propagating into the next twelve features.

3.3 ProximitySpace
Recursive subdivision over face and edge extents, in body‑local space so an occurrence transform invalidates nothing. Refit on parameter change, rebuild through WorkSequence at Background when degraded — the same policy OctantSpace already runs in SlateDocument, and deliberately the same shape so there is one traversal idiom in the codebase rather than two.

3.4 IntersectionSolver — the hardest module, specified explicitly
Surface–surface intersection is where kernels are won or lost. The dispatch is exhaustive over the closed surface set, and the analytic cases are closed‑form.

∧	Plane	Cylinder	Cone	Sphere	Torus	Other
Plane	line, coincident, or empty	line pair, ellipse, or empty	conic section	circle or empty	1–2 curves, Villarceau case	§ marching
Cylinder		line pair, circle, ellipse, or degree‑4	degree‑4	circle or degree‑4	degree‑4	§ marching
Cone			conic or degree‑4	circle or degree‑4	degree‑4	§ marching
Sphere				circle, point, or empty	circle(s)	§ marching
Torus					degree‑4	§ marching
Other						§ marching
Where the entry is a named conic, the result is an exact CircularArc / EllipticalArc / Parabola / Hyperbola. Degree‑4 cases go through PolynomialSolver for the critical points and are then represented as SurfaceIntersection procedural curves with an exact parent pair — not fitted. Fitting happens only at export.

The § marching cell is one routine and it must be built correctly the first time:

Bound. Subdivide both surfaces' parameter domains, bounding each patch by its control hull (rational patches) or by an interval evaluation of the analytic form. Discard patch pairs whose bounds are disjoint. This is where RootSolver's interval arithmetic earns its place.
Seed. For each surviving pair, solve the 4‑variable system S₁(u₁,v₁) − S₂(u₂,v₂) = 0 by interval Newton. Interval Newton either proves a unique root in the box, proves none, or subdivides — it never returns a root that is not there, which is the property a marcher cannot supply.
March. From each seed, step along the intersection tangent (the cross product of the two normals), correcting back onto both surfaces by a two‑surface Newton at each step. Step length adapts to the local curvature so chord deviation stays under ResolutionTolerance / 8.
Terminate at a domain boundary, at a closure back to the seed, or at a singular point where the normals are parallel. Singular points are reported, not stepped over: a tangential intersection is a real geometric condition and BooleanSolver needs to know.
Refuse if the marching budget is exhausted, if a step fails to converge, or if a singular point cannot be classified. Deliver<IntersectionResult> with ContentUnsupported and the two surface ordinals named.
That last point is the whole difference between a kernel you can trust and one you cannot. A boolean that cannot compute an intersection must refuse, never approximate. Refusal produces a feature in error that the user can inspect and re‑pose; approximation produces a body that is subtly wrong and is discovered six features later.

4. Modeling operations
4.1 ExtrusionSpecification::Construct — walked in full
This is the operation that broke your first attempt, so here is the complete emission.

Input: a PlanarProfile — one outer loop and n inner loops of analytic curves, all coplanar within ModelTolerance, closed, non‑self‑intersecting (verified by ProfileSolver), each loop wound per TopologyContract; a direction; a ExtentSubject (Blind, Symmetric, ThroughAll, ToFace, ToVertex, Offset); an optional draft angle; a BooleanCategory for the result (New, Join, Cut, Intersect).

Emission, for a profile of k loops with eᵢ edges in loop i:

1 start cap face. Surface: Plane at the profile plane, sense reversed (its outward normal opposes the extrusion). Loops: a copy of every profile loop, wound so the outer loop is CCW about the reversed normal. ProvenanceKey role ProfileStartCap.
1 end cap face. Same plane translated, sense forward. Role ProfileEndCap. For a ToFace extent the end cap is replaced by the trimmed target face and the role becomes BooleanIntersection.
Σeᵢ lateral faces, one per profile edge, each with surface chosen by the table in §3.1, sense outward, bounded by exactly four coedges: the start‑cap copy of the profile edge (reversed), a lateral line edge at the profile edge's end vertex, the end‑cap copy (forward), a lateral line edge at the start vertex. Role ProfileEdgeLateral, generator ordinal = the sketch edge's identity, not its index.
Σeᵢ lateral edges (Line), one per profile vertex, joining the two cap copies.
2·Σeᵢ vertices, two per profile vertex.
Periodic special case. A loop that is a single closed curve — a full circle, a full ellipse — has one edge and one vertex. It emits one lateral face (a Cylinder with a periodic parameter domain), one seam edge, and two vertices. The seam edge is traversed twice by the lateral face's single loop, in opposing senses, by two coedges that are partners of each other. This case must be built and tested before anything else, because it is the one every naive extruder gets wrong and its failure mode is a cylinder with an invisible crack.

Degenerate refusals, all before anything is emitted: zero distance; direction in the profile plane; a draft angle that would fold a lateral face; a ToFace target the extrusion does not reach; a profile loop that self‑intersects (ProfileSolver reports it with the crossing position).

Result: a Body with one closed outer Shell of 2 + Σeᵢ faces. Not two. Your acceptance test for M2 is: extrude a 5‑segment polyline with one circular arc, count 7 faces, pick each one, get 7 distinct face identities.

RevolutionSpecification mirrors this, with the extra cases of an axis‑touching profile vertex (which degenerates a lateral face into a cone apex — the face loses one coedge and gains a degenerate vertex) and a full 360° revolution (which emits a seam and no cap faces).

4.2 ProfileSolver — where Clipper2 actually lives
Given a soup of 2D sketch curves in a plane, produce the set of closed regions with holes. This is the module that consumes Clipper2, and the honest statement of its role:

Curves are discretised to ResolutionTolerance / 4 first, because Clipper2 is a polygon clipper and cannot carry an arc.
Clipper2 resolves overlaps, self‑intersections and nesting into a PolyTreeD — outer contours with hole children, robustly, on its scaled integer grid. This is exactly what your existing AccumulatePolyTree walk does and that logic ports across essentially unchanged.
The discretised result is then re‑attached to the analytic curves. Each polygon vertex retains the identity of the sketch curve and the parameter it came from. The emitted profile loop is a run of analytic trimmed curves, not the polygon. The polygon was scaffolding.
That re‑attachment step is the piece your old code lacked and is why the extrusion could only ever be a mesh. It is not difficult; it is bookkeeping. Every point pushed into Clipper2 carries an index into a side channel; every point that comes out is either one of those (identity preserved) or a new intersection point (which becomes a split of the two curves it lies on, at parameters found by IntersectionSolver's 2D case at full precision — not at Clipper2's grid precision).

Clipper2's grid is a topology oracle, not a geometry source. It tells you which curves cross and in what nesting order; the where is recomputed exactly.

Clipper2 also serves: planar boolean of coplanar faces inside BooleanSolver (§4.3), UV‑space trimming inside tessellation (§5), and hatch region generation for section views.

4.3 BooleanSolver
Six ordered stages, each with a declared refusal.

Reject early. Body extents disjoint → the result is trivially known for all three operations. Costs one comparison and answers the common case.

Face pair candidacy. ProximitySpace traversal of A against B. Yields pairs whose extents overlap.

Intersect. IntersectionSolver per pair. Coplanar pairs branch to the Clipper2 planar path (project both faces' loops into the shared plane's parameter space, clip, lift back — exact, because a planar face's loops are exactly representable and the crossing positions are recomputed at full precision). Refuses per §3.4.

Imprint. Split each participating edge at every intersection point; split each participating face by the intersection curves, rebuilding its loops. This is a planar‑graph problem in each face's parameter space and is again Clipper2's shape, with the same re‑attachment discipline. Faces that no intersection curve reaches are untouched and keep their identity — this is what makes provenance survive a boolean.

Classify. Each resulting face fragment is classified against the other body by SolidClassifier: cast a ray from the fragment's interior point along a direction chosen to avoid every vertex and tangency (retry with a new direction on a degenerate hit, up to a bounded count, then refuse), count crossings, apply parity. Fragments lying on the other body's boundary are classified Boundary and additionally as same‑sense or opposite‑sense, which is what distinguishes union from subtraction on a shared face.

Select and sew. Per operation:

Union: A‑outside ∪ B‑outside ∪ Boundary‑same‑sense (kept once).
Subtract: A‑outside ∪ reversed B‑inside ∪ Boundary‑opposite‑sense.
Intersect: A‑inside ∪ B‑inside ∪ Boundary‑same‑sense.
StitchSolver pairs free coedges by vertex coincidence and curve agreement within the summed tolerance, forms shells, orients them by signed volume, and identifies voids. StructureValid runs. Any invariant failure refuses the whole boolean.

Non‑manifold results are refused with ContentUnsupported, naming the offending edge. Two cubes meeting at exactly one edge is a legitimate geometric answer and an illegitimate solid; the user must be told, not handed a body that fails at the next fillet.

4.4 FilletSolver, OffsetSolver, DraftSolver
FilletSolver per edge: compute the two spine curves (the loci at distance r from the edge on each face), build the rolling‑ball surface, trim the two faces back to the spines, insert the blend face. Convex/concave detection from the coedge senses and the surface normals. Vertex blends — where three or more filleted edges meet — are a separate construction (spherical corner for equal radii, a SetbackVertexBlend for unequal) and are the second‑hardest thing in the kernel after SSI; they are scheduled at M4 and their absence at M3 is declared, not discovered.

OffsetSolver handles shell and thicken. Analytic surfaces offset to themselves with amended parameters. Self‑intersection of the offset is detected by re‑running BooleanSolver's intersection stage on the offset shell against itself; a self‑intersecting offset refuses.

5. Discrete/ — tessellation, and where Earcut lives
FacetStructure is a derived polyhedral approximation of one body at one tolerance level. It holds positions, normals, UV coordinates, indices, and one FaceOrdinal per triangle. That last array is what makes picking work and is the field your old code had no place for.

Tolerance levels are discretised, exactly as Slate's reduction levels are, and for the same reason: continuous re‑tessellation on zoom is a stall on every scroll wheel tick. Levels are powers of two of ResolutionTolerance, seven of them. FacetDepot keys on (BodyIdentity, BodyRevision, Level) and is evictable and reconstructible — SurfaceDepot's ContentKey shape, reused.

Per face:

Planar face → discretise each loop's curves to the level's chord tolerance, hand the resulting outer polygon and hole polygons to Earcut, receive a triangulation. This is Earcut's exact use: fast, robust, holes native, no Steiner points. Its output winding is corrected once against WindingOrientation.
Analytic curved face (cylinder, cone, sphere, torus, extrusion, revolution) → subdivide the parameter domain to satisfy both a chord and an angular tolerance derived from the exact second derivatives (which is why keeping them analytic pays: the subdivision count is computed, not searched). Trim the parameter‑domain grid against the loops in UV with Clipper2, then Earcut the trimmed cells. Map every resulting UV point through SurfaceProjection to get an exact position and normal. Periodic domains are unwrapped across the seam and the seam vertices duplicated.
Rational patch → adaptive quadtree subdivision on the control hull's flatness, then the same UV trim‑and‑earcut.
Edge discretisation is shared, not per‑face. Each edge is discretised once at each level and both adjoining faces consume the same point run. This is the only way to guarantee crack‑free shells, and it is the reason EdgeDiscretisation is its own module rather than a local helper inside the tessellator. A face that discretised its own boundary would disagree with its neighbour in the last bit and the artist would see a hairline gap on a curved seam.

The same edge discretisation feeds CurveDepot for wireframe display, so the shaded silhouette and the drawn edge coincide exactly.

6. SlateFeature — the DAG, and the naming problem
6.1 FeatureStructure
A directed acyclic graph. Each feature holds: an Identity; a FeatureSubject (Sketch, Extrude, Revolve, Loft, Sweep, Fillet, Chamfer, Shell, Draft, Pattern, Mirror, Boolean, Plane, Axis, Import, Move); a PropertyIndex of its parameters (reusing SlateDocument's existing typed/validated/bounded declarations verbatim — this is where "a tool presented by hand-written panel code is a tool the panel must be edited to add" pays off: the feature panel presents any feature without knowing which); a run of ReferenceSpecification inputs; a Suppressed standing; a FeatureStanding (Resolved, Recomputing, Refused, Suppressed, ReferenceStale); and its output — zero or more Body values.

Edges are derived from the references, never authored. Cycle rejection at commit, reusing SceneStructure's existing RelationsAcyclic idiom.

6.2 RecomputeScheduler
A parameter amendment marks its feature dirty; dirt propagates forward transitively.
The dirty set is topologically ordered by depth.
Rebuild in order. Each feature reads only its inputs' outputs — which are immutable values — so the whole rebuild is declarable into WorkSequence with nothing captured but those values, satisfying 34 §2 exactly. Requester applies results on the tick, per 34 §3.
A refused feature does not stop the run. It is marked Refused, its output is empty, and every dependent is marked ReferenceStale rather than being attempted. The user sees one red feature and a chain of grey ones, not a crash.
Determinism. Same inputs, bit‑identical outputs. Enforced by: no unordered iteration anywhere in the kernel (every set is an ordered span); accumulation in declared order per 02 §5; no floating‑point reassociation across the toolchain boundary (Contract/ToolchainContract.h already fixes this); and a golden‑hash regression suite over the output SolidStructure of a corpus of documents.
Interactive preview during a drag. Only the tail of the DAG from the dragged feature downward is recomputed, speculatively, discarded and re‑run per rotation, entering no transaction — Slate's 22 §4.1 speculative‑extent policy applied to features. The drag Seals one transaction on release, per 10 §2.4.
6.3 ProvenanceIndex — topological naming
This is the module that decides whether the program is usable in year two.

Every face, edge and vertex a feature produces carries a ProvenanceKey:

CopyProvenanceKey {
    FeatureIdentity   Producer          // which feature emitted it
    GeneratorRole     Role              // ProfileEdgeLateral, BooleanIntersection, …
    Identity          GeneratorPrimary  // the sketch edge, the parent face, …
    Identity          GeneratorSecondary// the second parent for intersections; absent otherwise
    Unsigned32        Discriminator     // ordinal among items with an otherwise identical key
}
Keys are re‑derived deterministically on every recompute from the same generative structure. Where a key resolves uniquely, the reference is Resolved and the cost is one comparison.

Where it does not — because a boolean split one face into three, or a sketch edge was deleted and replaced — the fallback is a geometric fingerprint recorded when the reference was first taken:

CopyReferenceFingerprint {
    SurfaceSubject    Subject           // a plane cannot migrate to a cylinder
    DocumentPosition  Centroid          // in the *feature's* local frame, not the world's
    SurfaceDirection  NormalAtCentroid
    Real64            Area
    Unsigned32        LoopCount, EdgeCount
    Unsigned64        AdjacencyDigest   // ordered digest of adjoining faces' Subjects and areas
}
Resolution: score every candidate against the fingerprint, weighted subject‑first. A unique best score above a declared confidence → Migrated, and the reference's key is rewritten to the new one so the next recompute is a fast path again. Two candidates within the confidence band → Ambiguous, feature enters error, and the panel shows both candidates for the user to disambiguate by clicking. Nothing → Stale.

Two rules that are not negotiable. First, Ambiguous never auto‑resolves. Second, the frame the fingerprint is recorded in is the producing feature's local frame, so moving the whole body does not invalidate every downstream reference — the mistake that makes naming schemes appear to work in testing and collapse the first time a user drags a part.

ReferenceSpecification additionally records the intent where the UI knows it: "the face the sketch was drawn on", "the edge between face A and face B", "all edges of the top face". Intent‑level references are far more robust than item‑level ones and should be preferred by every tool that can express itself that way. A fillet on "all edges of face #7" survives a topology change that would strand a fillet on "edges 12, 13, 14, 15".

6.4 SketchStructure, ConstraintSolver
Sketch entities are CurveSpecification in a plane, with identities that outlive edits (that is what ProfileEdgeLateral's generator ordinal binds to).

Constraints: Coincident, Horizontal, Vertical, Parallel, Perpendicular, Tangent, Concentric, Equal, Symmetric, Midpoint, Collinear, Fix, plus dimensional Distance, Angle, Radius, Diameter — each an entry in ConstraintSpecification, each a residual function of the sketch's variable run.

ConstraintSolver builds the sparse residual system and solves by Levenberg–Marquardt with a dogleg trust region (SystemSolver in SlateMath), warm‑started from the current positions so a drag converges in two or three iterations. It reports:

Degrees of freedom = variables − rank of the Jacobian. Rank via sparse QR with column pivoting, not by counting constraints — counting is wrong the moment anything is redundant.
Redundancy: constraints in the null space, named individually so the panel can offer to remove one.
Conflict: an inconsistent subsystem, isolated to the minimal conflicting set by removing constraints and re‑testing (bounded search).
Termination cause, per Contract/DeliveryContract.h's existing TerminationCause — Convergent guarantee, exactly like UnwrapSolver.
Under‑constrained is normal and is presented, not refused; a sketch with DOF > 0 still extrudes.

7. Selection — the failure that started this
PickClassifier and PickSpecification in SlateShape/Reference/.

Picking is host‑side, against ProximitySpace, for the reason 74 §1 already gives Slate: a device readback is latent by the recording slot count while a pointer reports at hundreds of samples per second, so a pick resolved from a target is a pick at where the cursor used to be. Slate already made this decision; the CAD workspace inherits it rather than re‑deciding it.

Resolution, in one traversal, producing one tuple:

CopyResolvedTopology {
    Identity          Occurrence, Body, Face, Edge, Vertex   // absent ones are undeclared
    Identity          Feature                                // which feature produced Face
    Unsigned32        FacetOrdinal
    DocumentPosition  Position
    SurfaceDirection  Normal
    Real64            SurfaceParameterAlong, SurfaceParameterAcross
    Real64            Distance
    Resolved          bool
}
One traversal, every field — the same discipline PointerIntersection already applies, and for the same reason: four consumers each traversing separately is four traversals per pointer sample.

Precedence within the tuple is by screen‑space proximity, converted to model space at the hit depth: a vertex within VertexPickRadius pixels wins; else an edge within EdgePickRadius; else the face. Radii are declared in Contract/.

Scope in PickSpecification: Vertex, Edge, Face, Loop, Shell, Body, Occurrence, Feature, SketchCurve, SketchPoint. The tuple is promoted to the active scope after resolution. Default scope is Occurrence.

This is the fix for your three selection failures, stated as three rules:

A drag with the transform tool moves the Occurrence. Not the face, not the facet, not the profile. The tool declares its scope as Occurrence and PickClassifier promotes to it. There is no code path by which a transform reaches a Face.
Push/pull declares scope Face, and its edit is a feature. Dragging a face does not mutate geometry; it amends the generating feature's parameter where the face is a cap of an extrude (the common, cheap case), or appends a MoveFace feature where it is not. Either way the DAG recomputes and the result is exact.
A picked face resolves to the feature that produced it, through its ProvenanceKey, so the feature tree highlights in sync with the viewport and clicking a lateral face of your extrusion selects the extrusion — not the sketch beneath it. The sketch is reachable through the extrusion's inputs, one level up, deliberately.
Selection storage reuses SelectionSequence unchanged, including its pairing with the revision ordinal so undo restores the selection the transaction applied to.

8. Rendering integration with the existing Vulkan spine
Nothing new is invented at the device level. The CAD workspace contributes recordings to the existing RenderSchedule and claims from the existing SpanSpace, ImageSpace, DescriptorIndex, ProgramIndex and AttachmentIndex.

Recording	Produces	Reads	Notes
FacetRaster	VisibilityIndex, DepthSurface, OccupancySurface	facet spans, per‑body uniform	Writes (BodyOrdinal, FacetOrdinal) into the existing R32G32 word — the exact mechanism VisibilityIndex already declares. FacetOrdinal → FaceIdentity resolves through a per‑body span, one indexed hop, no search.
CurveRaster	OutlineSurface	edge discretisation spans	Wide lines as instanced quads in the vertex stage — no geometry stage, no dynamic line width, both of which vary by vendor. Depth‑biased toward the camera so an edge is never z‑fought by its own faces.
MarkerRaster	OutlineSurface	vertex/handle spans	Point sprites for vertices, sketch points, constraint glyphs.
SketchRaster	OutlineSurface, RadianceSurface	Earcut'd profile fills, Clipper2 boolean previews	The 2D workspace. Filled regions are display‑only artefacts and are re‑derived per level.
FacetDepot and CurveDepot sit in SlateCompute and hold the device‑resident spans, keyed by (BodyRevision, Level), evicted under the existing PromotionScheduler budget. A body whose feature is recomputing keeps its previous tessellation resident and displayed until the new one arrives — the same "the previous partition stands until Adopt takes this one" rule ChartPartition already states, and for the same reason: swapping mid‑solve makes the whole object flicker.

Occlusion culling, the two‑phase depth reduction, the reversed‑depth convention, the recording slot count, the descriptor lifetime — all inherited unchanged. The CAD workspace is a new set of contributions to a spine that already works.

(Naming note: FacetRaster and CurveRaster inherit the VisibilityRaster precedent already present in SlateCompute. Raster is not on the closed suffix list; if that precedent is retired these become FacetScheduler and CurveScheduler. Flagging it rather than silently diverging.)

9. One Mechanism, One Site
You said the codebase became a swamp of near‑duplicate functions. That is prevented by declaration, not by discipline. The following table is normative: a second implementation of any row is a defect, and the review question is always "which row does this belong to?"

Mechanism	Sole authority	Every consumer
Orientation sign of three planar points	Shared/OrientationClassifier	ProfileSolver, SolidClassifier, tessellation, Clipper2 conversion
Segment intersection classification	Shared/IntersectionClassifier	sketch, imprint, 2D boolean
Planar containment	Shared/PlanarClassifier	ProfileSolver, hole assignment, UV trimming
Loop winding convention	Contract/TopologyContract.h	everything that touches a loop
Coincidence of two positions	Shared/PositionsCoincide	StitchSolver, imprint, sketch snapping
Curve/surface evaluation	CurveProjection / SurfaceProjection in Shared/	host and device, parity‑proven
Tolerance constants	Contract/GeometryContract.h	all
Edge discretisation	EdgeDiscretisation	tessellation, wireframe, profile flattening, export
Transform composition	SlateMath/TransformProjection	all
Rebasing before narrowing	SlateMath/TransformProjection::Rebase	all device uploads
Generational identity	Contract/IdentityContract.h	all
Transaction lifecycle	SlateDocument/RevisionSequence	all edits
Reporting	SlateMath/ReportSequence	all
Threading	SlateMath/WorkSequence	all long solves
Enforced in C++ by:

Deliver<T> on every fallible surface. No exceptions, no error codes, no out‑parameter‑plus‑bool. This already exists and the kernel adopts it unchanged.
A closed tagged union for geometry, so adding a surface subject forces every switch to be revisited — the compiler finds the sites, not a grep.
Templates over the surface tag for the tessellation walk and the intersection dispatch, so the per‑subject code is the differences and the walk is written once.
Non‑owning spans in every signature, so no routine can quietly take ownership and no caller can be uncertain who frees.
Free functions returning values for every operation (Construct, Derive, Solve) rather than methods mutating a receiver. This is what makes them declarable into WorkSequence without capture analysis, and it is what makes them testable.
SLATE_DECLARES_PRECISION on every geometry header, so the Exact/Bounded/Convergent/Perceptual tiering is stated rather than assumed.
10. Failure discipline
Condition	Response	Never
Surface–surface intersection does not converge	Refuse the boolean, name both faces	Approximate, or fall back to mesh
Boolean produces a non‑manifold edge	Refuse, name the edge	Emit it and hope
Fillet radius exceeds the local curvature	Refuse, name the edge and the limiting radius	Clamp silently
A reference resolves ambiguously	Feature enters error, both candidates presented	Pick the nearest
A reference resolves to nothing	Feature enters ReferenceStale, dependents grey	Delete the feature
A sketch is over‑constrained	Solve what is consistent, name the conflicting set	Refuse the sketch
A sketch is under‑constrained	Solve, report DOF	Refuse
An invariant fails after an operation	Refuse, return the prior structure	Return the half‑built one
Tessellation exceeds its budget	Emit at the next coarser level, report the measure	Emit a partial mesh
Import geometry does not sew	Import as an open shell, report every free edge	Force‑close
Reports go through ReportSequence with the existing seven dispositions; per‑rotation quantities go through MeasureIndex. The distinction already declared in 86 — appended once versus overwritten — matters more here than anywhere: a fillet that refused is a report; a tessellation level that coarsened is a measure.

11. Build order
Each milestone ends with a headless ConsoleHost verification and a visible workspace capability. Nothing is begun before its dependencies are verified.

M0 — Foundations. Contract/ additions. RootSolver, PolynomialSolver, SystemSolver in SlateMath. CurveSpecification, SurfaceSpecification, CurveProjection, SurfaceProjection, parity‑registered. SolidStructure with all eight invariants and StructureValid. MomentIntegrator. Verification: hand‑build a cube's B‑rep in code; every invariant holds; volume is exact; Euler characteristic is 2.

M1 — Sketch. SketchStructure, ConstraintSpecification, ConstraintSolver with DOF and conflict reporting, ProfileSolver with the Clipper2 path and the analytic re‑attachment. SketchPanel. Verification: draw a polyline with arcs, constrain it, drag a point, watch the system re‑solve; extract closed profiles with holes; every profile edge retains its sketch curve identity.

M2 — The failure you hit, closed. ExtrusionSpecification::Construct with the full lateral‑face emission and the periodic seam case. TessellationSpecification, EdgeDiscretisation, FacetStructure with Earcut for planar and UV‑trim for cylindrical. FacetDepot, CurveDepot, FacetRaster, CurveRaster. ProximitySpace, PickClassifier, PickSpecification. FeatureStructure, RecomputeScheduler, ProvenanceIndex at key level. Verification, explicitly: extrude a 5‑segment profile containing one arc; see 7 faces; pick each and get 7 distinct identities; pick the lateral face and have the feature tree highlight the extrude; drag and have the whole body move; change the extrude distance and have everything rebuild.

M3 — Boolean. IntersectionSolver with the full analytic matrix and the marching path. BooleanSolver, StitchSolver, SolidClassifier. ProvenanceIndex fingerprint fallback (this is when it first earns itself, because booleans split faces). RevolutionSpecification. Verification: cut a cylinder from a box; the cylindrical face is exactly a Cylinder; the intersection edges are exact circles; the result passes every invariant; a downstream fillet on a face the boolean split still resolves.

M4 — Blends. FilletSolver including vertex blends, OffsetSolver for shell and thicken, DraftSolver, chamfer. LoftSpecification, SweepSpecification.

M5 — Interchange and patterns. StepCodec (AP242, read and write — the only interchange that carries exact B‑rep), StlCodec, DxfCodec, IgesCodec read. Linear/circular/mirror patterns. Measurement, section views, technical drawing extraction.

M6 — Painting bridge. TopologyProjection in SlateFeature/Bridge/: project a SolidStructure at export tessellation quality into Slate's TopologyStructure, seal it, enrol it as an occupant. The valuable half: analytic faces carry their own natural UV, so ChartPartition receives a supplied partition — one chart per face, seams exactly at the B‑rep edges — for every plane, cylinder, cone and torus, and UnwrapSolver is invoked only for rational patches. A CAD body arrives in the painting workspace already unwrapped, with zero distortion on every analytic face. That is a capability no mesh‑first pipeline can offer and it falls out of this architecture for free.

12. Two naming items to settle before code
EdgeDiscretisation carries no closed role suffix. The mechanism is "one edge's polyline at a declared chord tolerance", which is a derived, evictable, reconstructible artefact keyed by (edge revision, level) — so EdgeDepot is the correct name and the module owns both the derivation and the retention. Recommend that.

BooleanCategory (from your existing code) should become BooleanSubject to match Slate's established discriminant spelling (ProfileSubject, ShapeSource, PlacementMode, EmissionShape). Category is on the neighbouring‑vague list in SKILL-Naming.

13. The single most important sentence in this document
The kernel never sees a triangle. SlateGeometry has no vertex buffers, no draw calls, no display anything; its only discrete output is FacetStructure, and that is produced by an explicitly named derivation that a Depot owns and may throw away at any moment. If a routine in SlateGeometry ever needs to know what is on screen, the architecture has been breached and the next rewrite has begun.
