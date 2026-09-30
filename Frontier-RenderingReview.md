# Frontier — Rendering pipeline review & problem report

**Repo reviewed:** `SultanAladin/Frontier-` @ `main` (commit `2fbe5c5`, pushed 2026‑09‑28).
**Scope of read:** `Engine/Shaders/*`, `Engine/DisplayPresentation/*` (ReSTIR integrator + inspectors),
`Engine/ContentInterchange/Material*` (slab records/codec/index), `References/*Plan.md`, and the relevant
`Docs/` evidence (`V8DenoiserReview.md`, `DenoiserSafetyFollowup.md`, `ReSTIRPipelineInvestigation.md`,
`AutomotiveFlakePaint.md`, `AutomotiveFlakesNextPass.md`).
**Note:** this is a report only — **no engine code was changed**. (The `Slate` repo we're working in is empty
apart from its README; all of the below lives in the Frontier repo. I pulled a blob‑less sparse checkout into a
scratch cache to read it.)

---

## 0. What this renderer is (so the terms below are unambiguous)

Frontier is a **real‑time path tracer** built around **ReSTIR** (reservoir spatiotemporal importance resampling),
lowered to Vulkan compute. The pixel pipeline, in order:

1. **`RayGeneration.slang`** — pinhole primary ray per pixel (jittered).
2. **`ReSTIRViewport.slang`** (the ~2,300‑line kernel — the heart of everything) —
   - `ResolveMaterial()` builds the shading record from the material **slab** at the hit;
   - **DI (direct)**: RIS candidate generation over three light "species" — mesh luminaires (Walker‑alias pick),
     the **sun** disc, and the **sky dome** as a reservoir light — then **temporal reuse** (row 2) and
     **spatial reuse** (row 3) with pairwise‑MIS merges and M‑clamp;
   - **GI / reflections**: a multi‑bounce loop with Russian roulette, NEE at each bounce, Beer/medium traversal
     for glass, and a first‑bounce **GI reuse pool**;
   - **Accumulation**: running mean + first two luminance moments → **per‑pixel variance** written to the
     denoise image (`DenoiseImage`, `rgba32f`, `w = variance`).
3. **`AtrousDenoise.slang`** — edge‑avoiding à‑trous wavelet (SVGF/Dammertz lineage), 4–5 levels, tier‑keyed;
   the final level also does the ACES tone map + presentation dither into the `rgba8` output.
4. **`ReSTIRIntegrator.{h,cpp}`** — host config: feature flags, bounce counts, denoise level count, temporal
   reuse/reprojection toggles, sun pick probability, accumulation reset policy.

Supporting shaders: `MaterialEvaluation.slang` (OpenPBR lobe evaluation — GGX + EON diffuse + F82 metal +
LTC sheen + thin‑film + coat + BTDF/SSS scaffolding), `SurfaceResolve.slang`, `LuminanceReduce.slang`
(auto‑exposure), sky/atmosphere/weather, and the BVH/traversal set (`TraversalCWBVH`, `BlasBuild/Refit`,
`ClusterCull`, `HiZReduce`).

**Overall assessment:** this is a mature, unusually well‑documented codebase. The math is careful (unbiased RIS
shares, MIS on the DI merges, energy‑compensated lobes) and the authors already keep an honest defect log. The
three issues you named are **known, localized, and already scoped in‑tree** — none require re‑architecting the
pipeline. Details and the exact file/line anchors follow.

---

## 1. Fireflies

**What a firefly is here:** a single pixel that latches onto a huge, low‑probability sample (a bright light hit
through a low‑pdf BSDF direction, a near‑singular `1/d²`, or a specular‑caustic path). Because the image is a
running mean, one such sample dominates its pixel and only fades slowly, so it reads as a persistent white/coloured
speck that the denoiser then tries (and sometimes fails) to remove.

### Where fireflies are currently *bounded* (the existing defenses)
- **Indirect contribution clamp** — `ReSTIRViewport.slang:883` `kIndirectFireflyBound = 64.0`, applied by
  `BoundIndirect()` to **every** term the bounce loop adds (its NEE arms, sky fill, and the GI pool shade — lines
  ~2141‑2230). It scales the whole RGB by its peak (hue‑preserving), and deliberately is **not** applied to the
  primary hit's direct light.
- **Per‑bounce throughput clamp** — `min(stepThroughput, vec3(8.0))` at `:2064`.
- **Area‑light distance softening** — `1/(d² + 0.01)` on the mesh‑light NEE terms, which kills the worst
  `1/d²` spikes when a bounce lands very close to a small emitter.
- **Denoiser firefly clamp** — `AtrousDenoise.slang:168‑169, 259‑261`: a RELAX‑style local
  `mean + 2.5σ + 0.15` log‑luminance ceiling, applied to a tap **only** when its variance certifies it as noise
  (`TapColour.a > 0.0225·L²`). A converged bright glint (low variance) is left alone.

### Why fireflies still get through (root causes, in priority order)
1. **No MIS between BSDF‑sampled emitter hits and NEE in the bounce loop — the biggest one.**
   In the bounce loop, when the continuation (BSDF‑sampled) ray randomly hits an emissive surface, the emission is
   added directly and the path terminates (`:2116` `accumulatedRadiance += curThroughput * (Emission + Unlit)`),
   while NEE also samples lights at the same vertex. There is **no power/balance‑heuristic MIS weight** combining
   the two strategies. A glossy/low‑roughness surface whose BSDF ray chances onto a small bright light produces a
   `f·L/pdf` spike with a tiny `pdf` — the textbook firefly that MIS exists to suppress. `BoundIndirect(64)` caps
   the amplitude but that is a biased hammer, not a fix; it darkens legitimately bright indirect highlights while
   still leaving 64‑bright specks. **This is the highest‑value correctness fix for fireflies.**
2. **Direct (primary) light is intentionally unclamped.** Correct for energy, but it means primary‑hit specular
   highlights and sun glints on low‑roughness materials can still spike — and these are exactly the pixels the
   denoiser's variance test is least willing to touch. Related: there is **no roughness floor / NDF clamp** on
   very smooth surfaces, so near‑mirror BSDF pdfs go very high and any stray light sample explodes.
3. **The variance estimate the denoiser trusts is itself fragile at low sample counts.** The kernel patches this
   with young‑history floors (`count<4` and `count<2` at `:1311‑1315`), and the denoiser pre‑filters variance
   over 3×3, but as `V8DenoiserReview.md` §"Firefly/glint qualifications" states plainly: *"fireflies always have
   high variance" is too strong.* A correlated or under‑sampled bright sample can read as low‑variance and then
   **survive every à‑trous level** because the clamp exempts it.
4. **In‑place reprojected history hazard (documented, high‑priority).** `V8DenoiserReview.md` §1 flags a
   GPU read/write hazard where one invocation can overwrite a texel another still needs as previous‑frame history
   during motion reprojection; `DenoiserSafetyFollowup.md` says immutable snapshot history was added to address
   it, but it is **pending GPU validation** — until validated on hardware it can manifest as motion‑correlated
   sparkle that looks like fireflies but is actually a history race.

### Recommended direction (report only, no code)
- **Add MIS to the bounce‑loop emitter/NEE pair** (balance or power heuristic using the light‑pick pdf vs the
  BSDF pdf). This removes the dominant source at the root and lets you *raise or remove* the `BoundIndirect`
  clamp, recovering energy you're currently throwing away.
- **Add a small roughness floor** for the specular/coat lobes on primary and secondary hits to cap the peak BSDF
  pdf (a standard, nearly invisible anti‑firefly measure).
- **Prefer a max‑luminance/outlier‑rejection clamp keyed to the *pick pdf*** over the flat `64` cap, or make the
  cap adaptive to exposure (auto‑exposure is already computed in `LuminanceReduce.slang`).
- **Close out the GPU validation of immutable history** (step 5 of `DenoiserSafetyFollowup.md`) before trusting
  any denoiser‑side firefly numbers.

---

## 2. "Flakes" vs "noise" — why you can't tell them apart

**This is a real ambiguity in the code, not just in perception. There are two completely different flake systems
in the tree, and the one the GPU actually runs is the wrong one.** That is the source of the confusion.

### System A — the *old* procedural signal (what the render kernel currently runs)
- File: **`Engine/Shaders/AutomotiveMaterialProfiles.slang`** →
  `AutomotiveFlakeSignal()` / `AutomotiveApplyTriCoatFlakeNormal()`.
- The GPU kernel calls it at **`ReSTIRViewport.slang:409‑421`** (the `M6 glints` block), driven by the stored
  `slate_glint_density` / `slate_glint_uv_scale` fields (`P14.xy`).
- Internally it is **three `sin()` bands** (`h0,h1,h2`) keyed to **`hitPos`** (world position). Documented defects
  (`Docs/AutomotiveFlakesNextPass.md`):
  - "Three sine bands are **not** a finite, footprint‑filtered flake population."
  - **No pixel‑footprint / LOD filtering** → at distance it **aliases**, i.e. it *becomes* shimmering high‑frequency
    grain that is visually indistinguishable from path‑tracer noise.
  - Keyed to raw `hitPos`, **not** a stable object/UV coordinate → it swims/scales incorrectly under motion.
  - The `h2` term can produce **nonzero sparkle even at density 0** (the `P14.x > 0` outer branch masks it in one
    route, but the helper lacks the zero invariant).
  - It perturbs the **base normal before** the coat frame is derived, so it's "facets poking through the coat,"
    not "flakes embedded under a smooth clearcoat."

### System B — the *new* finite‑flake model (correct, but only used in the standalone preview)
- File: **`Engine/Shaders/AutomotiveFlakePaint.slang`** → `AutomotivePrepareFlakes()` / `AutomotiveEvaluatePaint()`.
- Deterministic integer‑hash flakes placed in **material‑space cells**, oriented ellipses, **footprint‑aware LOD**
  that transitions explicit facets → a smooth Gaussian population lobe as the UV derivative grows, a multi‑family
  colour palette, and a **separate** dielectric clearcoat. This is the model that behaves like real metallic paint
  (`Docs/AutomotiveFlakePaint.md`).
- **But it is only wired into the standalone exhibit** (`Exhibits/Workbench/AutomotiveFlakes/`, WebGL preview).
  Per the plan: *"The GPU host does not serialize the new automotive parameters yet."* The main render path does
  **not** use it.

### So: which grain is flakes and which is noise?
- **Noise** = stochastic Monte‑Carlo variance from the path tracer. It is **different every accumulated sample**,
  **converges** (falls) as spp rises, is **not** locked to the surface, and is what the à‑trous denoiser targets.
- **Flakes** *should* be = a **deterministic, material/object‑space** signal that is **stable frame‑to‑frame when
  the camera is still**, and changes as **glints only with light/view angle**. System B satisfies this; **System A
  does not** — because System A is (a) unfiltered (aliases like noise), (b) keyed to world `hitPos` (swims), and
  (c) leaks at density 0.
- **The reason it's currently impossible to tell them apart is that the kernel is running System A**, whose output
  *is literally aliasing/shimmer* — i.e. the "flakes" the renderer draws are, today, partly indistinguishable from
  noise **by construction**. The clean model that would give you readable, stable sparkle (System B) is sitting
  unused in the preview.

### Practical way to separate the two while diagnosing (report only)
1. **Freeze the camera and light and let accumulation run.** Anything that keeps crawling/shrinking = **noise**.
   Anything that stays put but re‑glints when you move the light = **flake**.
2. **Set `slate_glint_density = 0`.** Any sparkle that remains is either the `h2` zero‑density leak (System A bug)
   or pure path‑tracer noise — this isolates System A's contribution immediately.
3. **Toggle the denoiser off** (`ReSTIRIntegratorConfiguration::Denoise = false`): raw accumulated image shows
   noise directly, unmixed with the filter's residual.

### Recommended direction (report only, no code)
- **Retire System A from the kernel and wire System B (`AutomotiveFlakePaint.slang`) into `ResolveMaterial`,**
  fed by the ray‑cone footprint the kernel already computes (`F.LodBias`, `coneWidth`) so the LOD transition
  actually engages. This is exactly the "footprint‑aware glint LOD" that both `V8DenoiserReview.md` (§Additional
  optimization candidate 6) and `AutomotiveFlakesNextPass.md` (next‑gate item 1) call for.
- **Key the flake field to a stable object/UV coordinate,** not world `hitPos`.
- Doing the above makes flakes *converge to a smooth metallic lobe at distance* instead of aliasing — which is
  what removes the "is this a flake or is this noise?" ambiguity for good, and also relieves the denoiser (it no
  longer has to fight surface‑locked high frequencies it can't average).

---

## 3. "Add the Slab for material" — current state & what the work is (report only)

### What a "slab" is in this engine
The material core is an **OpenPBR "slab"** model. Authoring produces a `MaterialDescriptor` holding a **graph** of
`MaterialSlabDescriptor`s plus operations (`VerticalLayer`, `HorizontalMix`, `Weight`, `Coverage`). At scene build
(`MaterialIndex::Finalise` → `Flatten`, `Engine/ContentInterchange/MaterialIndex.cpp`) that graph is evaluated and
**flattened to at most `SlabLimit` slabs** (ceiling `kMaterialSlabCeiling = 8`), each emitted as a
**`MaterialSlabRecord` (304 B = 19×vec4)** and uploaded to GPU **buffer binding 10**. A per‑material 64‑B header
(`GpuMaterial`) carries `Slabs = {SlabOffset, SlabCount, Flags, Complexity}`.

The record already carries a **superset of all 20 Sultan channels** (base/metal/rough/IOR/normal/emission/opacity/
anisotropy+direction/coat+coat‑roughness+coat‑normal/sheen+sheen‑rough/SSS/transmission/occlusion). Per
`References/MaterialRestir-Plan.md`, essentially every channel is stored, resolved, shaded and ReSTIR‑wired — the
plan reports all M‑phases shipped.

### The gap — the GPU only shades ONE slab
Both the code and its own comment are explicit:

> `ReSTIRViewport.slang:328` — `GpuMaterialSlab S = MaterialSlabs[mat.Slabs.x];`
> `// Tier A: the FIRST slab (top-most after flatten; multi-slab stacks arrive with R5)`
> `ResolveMaterial` (`:271` docstring) — *"Fills the ShadingRecord from the first slab (Tier A: one resolved slab)."*

So although the **data path folds a full N‑slab stack** and uploads all of it (`SlabCount` can be > 1, up to 8),
the **kernel reads only `Slabs.x` (the top slab)** and ignores the rest. The default `SlabLimit = 1`
(`MaterialIndex.h:106`) even flattens most materials down to one slab before upload. Multi‑slab evaluation is the
explicitly deferred **"Tier B multi‑slab kernel evaluation"** — `MaterialRestir-Plan.md` §2 lists it as *out of
scope* ("data path already folds; revisit after M9"), and the kernel comment tags it **R5**.

### What "adding the Slab for material" therefore means (the actual task)
Implement **Tier B**: have the kernel evaluate the **full resident slab stack** rather than only the top slab.
Concretely (design, not code):

1. **Walk the stack in the kernel** — loop `i ∈ [Slabs.x, Slabs.x + Slabs.y)` over `MaterialSlabs[i]` inside
   `ResolveMaterial` instead of reading a single record.
2. **Composite per the fold semantics `Flatten` already encodes** — the flatten step is an implicit
   **VerticalLayer chain with `Slabs[0]` on top**, plus **HorizontalMix** pairs carrying `MixWeight`/`MixMask`.
   Tier B must reproduce that on the GPU: **vertical layering** (upper slab's coat/Fresnel transmission attenuates
   the slab beneath — a layered‑BSDF composite, the same idea `AutomotiveFlakePaint`'s coat‑over‑base does), and
   **horizontal mix** (per‑texel `MixWeight`/mask blend of two slabs).
3. **Raise `SlabLimit`** from the default `1` toward the ceiling `8` for materials that need it, and confirm the
   uploaded `SlabCount` and the 304‑B `static_assert`/std430 mirror stay in lockstep (`SceneRecords.slang`).
4. **ReSTIR wiring is largely free** — per `MaterialRestir-Plan.md` §5, reservoir layout is unchanged; only the
   RIS target function (`p̂ = f·L·cosθ/d²`) and shadow/GI `EvaluateBsdf` calls need to evaluate the composited
   multi‑slab BSDF instead of the single‑slab one. Temporal/spatial reuse ride along via re‑evaluation.
5. **Budget/perf gate** — this multiplies BSDF cost by up to 8× on the heaviest materials; the plan's own budget
   (glass ≤ 2× Simple, kernel ms in the F3 popup per phase) and the `ClassifyComplexity` cost class are the
   natural throttle (evaluate 1 slab for Simple/Single, the full stack only for Complex).

### Interaction with problems 1 & 2 (why order matters)
- Wiring **System B flakes** (problem 2) is itself a **layered slab composite** (flake facet layer under a smooth
  coat), so it's cleanest to land it **as part of, or on top of, the Tier B slab work** rather than as a bolt‑on
  normal perturbation — otherwise you rebuild the coat‑over‑base coupling twice.
- Multi‑slab evaluation raises per‑pixel BSDF pdf complexity, which **feeds back into fireflies** (problem 1):
  do the **bounce‑loop MIS** fix first, or Tier B's extra glossy layers will produce more of exactly the spikes
  currently masked by `BoundIndirect(64)`.

---

## Suggested sequencing

1. **Fireflies first** — add bounce‑loop MIS + a roughness floor; this is a correctness fix that also makes
   everything downstream (denoiser, flakes, multi‑slab) better‑behaved and lets you relax the biased `64` clamp.
2. **Flakes vs noise** — wire the finite‑flake model (`AutomotiveFlakePaint.slang`, System B) into
   `ResolveMaterial` with footprint LOD, and delete the sine‑band System A path from the kernel. This removes the
   aliasing that *is* the flake/noise ambiguity.
3. **Add the Slab (Tier B)** — implement multi‑slab vertical‑layer + horizontal‑mix evaluation in the kernel,
   raise `SlabLimit`, gate cost by `ClassifyComplexity`; fold the flake coat/base composite into it.

*(No code was written or changed for this review. Anchors above are file:line references in `SultanAladin/Frontier-`
@ `2fbe5c5` for the follow‑up implementation work.)*
