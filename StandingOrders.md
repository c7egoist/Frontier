# Standing orders for every AI session on this repo

> The user has repeated these instructions for days across sessions. Read this file
> FIRST, before any other doc, and treat every line as a standing order until the
> user changes it. Update this file when the user repeats something new.

## 1. What Project Zero is

- Project Zero ships **ONE scene**. Not the Cornell box, not the showroom — one scene
  whose job is to demonstrate **sun / sky / moon / night / stars / sunset / sunrise /
  dawn / dusk / zenith**.
- The scene is a **blank world plus simple test shapes** (spheres, boxes, ground plane)
  with **coloured and emissive materials**, so light response can be judged: daylight,
  night, emissive, sun through cloud gaps, god-ray shafts. Never an empty plane.
- Reference implementation: the Celestial Panel demo, vendored at
  `References/CelestialPanel.reference.html` (source: `SultanAladin/Frontier-`
  `docs/celestial/index.html`, commit `eaab23e`). Its GLSL is the **specification**:
  port its **formulas AND its defaults**. If the engine disagrees with it, the engine
  is wrong until proven otherwise with a measurement.

## 2. The two render paths (both must show the sky correctly)

- **Visibility raster** = the software/level-design preview. NO global illumination,
  NO ReSTIR. Fast, for blocking out levels. Must still draw the same sun/sky/clouds.
- **ReSTIR path** = the quality path, with a **GI on/off** toggle. GI-off disables GI
  but **stays on ReSTIR** (that is correct behaviour, keep it).
- There must be an **explicit ReSTIR on/off trigger** that switches between the
  visibility raster and the ReSTIR path. Never conflate "GI off" with "ReSTIR off".
- Clouds must render correctly on the ReSTIR path — currently they do not.

## 3. No fake proofs (this rule has been broken before)

- Proof images must be rendered by the **exact shaders/code Project Zero uses**.
  CPU twins must share formulas with the GPU kernels (shared headers where possible,
  pairwise-pinned literals where not — the `kSunAngularRadius` pattern).
- The CPU render must give the **same result as the GPU run**. Never hand-draw,
  approximate, or mock up a proof image.
- "No GPU in the sandbox" is **never** an excuse to skip testing: build and run the
  real CPU path headlessly, commit the PNGs, and gate them numerically.

## 4. The sun is a disk

- The sun must render as a **crisp disk exactly like the reference panel** — never a
  blinding white blob, never a blurred ghost circle.
- "The atmosphere did it" is not an explanation: the reference has the same
  atmosphere and draws a clean disk. Match its formulas, exposure, and defaults first.

## 5. Clouds like the reference

- No streak lines, no banding, nothing cutting the clouds. If the engine's clouds do
  not look like the reference's, port the missing terms (march structure, jitter,
  octaves/erosion, phase function, multi-scatter, powder, extinction, wind coupling)
  instead of inventing new ones.

## 6. Editor vs production

- **Editor/Development** (gated, never ships): hosts the celestial panel UI port and
  the preview harness. The preview must run the **same code** as the game path.
- **Production**: the one Project Zero scene. No editor chrome, no debug views.

## 7. UI port

- The celestial panel UI (outliner + inspectors + bespoke widgets) must be ported into
  **Editor mode**. It stays deferred only until the ReSTIR sky path is correct — then
  it is built as a **projection of the entity registry** (one settings struct per
  entity, reference names, units in comments), not a rewrite.

## 8. How to work

- Plan meticulously, then fix. Diagnose against the reference before changing code.
- Keep `References/Backlog/CelestialFixPlan.md` current: checked-off phases, measured
  numbers, remaining gaps.
- Keep architecture/naming per `CLAUDE.md`. Keep proofs green (`Scratchpad/Check*.sh`).
- Commit working states on this branch early and often; never switch branches.
