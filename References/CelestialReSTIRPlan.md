════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  Celestial on ReSTIR — sun · sky · clouds · fog · moon · stars, one light path, no second renderer
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
Branch: `arena/01a09b29-frontier`, base `f988d51` (the sky-less, UI-less ReSTIR tree).
Status: PLAN ONLY — nothing below is implemented yet. Research findings in §1 are measured from THIS tree.

Scope, in the user's words: sun, sky, clouds, local clouds, atmospheric fog, local fog, night sky with moon and
stars, moon and stars visible in daylight too. All of it on the ReSTIR path ONLY. Scene objects must receive this
light. Sliders and properties for everything. Real-time game, fully dynamic. Proofs run the ReSTIR path.


① RESEARCH — WHAT THIS TREE ACTUALLY IS (measured, not assumed)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
R1 · There is ONE renderer here, and it is ReSTIR. `Engine/Shaders/ReSTIRViewport.slang` (1076 lines) is the only
     shading kernel. `VisibilityRaster.vert/frag.slang` is NOT a second renderer — it is the R2 primary-visibility
     G-buffer (`SurfaceImage` = world pos + visibility id, `NormalImage`, `MotionImage`) that ReSTIR reads instead
     of generating camera rays. There is no `Engine/GeometricRaster/VisibilityRaster.cpp` in this tree. So "ReSTIR
     only" is already true, and the previous sessions' raster-vs-ReSTIR split CANNOT recur here. Nothing in this
     plan adds a second path.

R2 · Three explicit "no environment light" sites, all of which must change together or the sky will be
     inconsistent between what you see and what lights the scene:
       a) ReSTIRViewport.slang:763-769 — primary miss: `Resolve(pixel, vec3(0.0))`. The background.
       b) ReSTIRViewport.slang:1019-1021 — GI bounce escape: "A bounce ray that escapes the scene contributes
          nothing". This is the one that makes OBJECTS receive sky light. Without it, sky is a backdrop.
       c) The DI light pool is `Luminaires[]` — emissive triangles only (`LightEmission()` at :533 reads
          `Materials[...].Emissive`). The sun is not in it. This is exactly the user's complaint "sun isn't being
          used in ReSTIR": a sun that is only drawn on the miss path is a painting, not a light.

R3 · Binding budget is TIGHT and gated. `kComputeBindingCount = 22` (SwapchainExchange.h:64), bindings 0-21, and
     `Textures[]` (bindless, variable-count) MUST stay last — Vulkan requires the variable-count binding on the
     highest binding number. `CheckTemporalReprojection.sh:22-36` asserts the count is exactly 22 AND that
     Textures[] is at count-1. So new sky resources cannot be appended after 21. Two lawful options:
       (i) renumber Textures[] upward (22, 23, …) and move the gate's pins with it — the gate is checking the
           INVARIANT (last), not the literal, so this is honest; or
       (ii) put the sky LUTs in the bindless table itself as texture slots.
     Decision: option (i), one UBO + three LUT images at 21-24, Textures[] moves to 25, gate re-pinned to 26.
     Reason: the sky LUTs are read every pixel with a fixed sampler; hiding them in a 1024-slot bindless array
     makes their lifetime and format invisible to the gate.

R4 · Push constants are FULL. The block is exactly 128 bytes — Vulkan's guaranteed minimum — and says so at
     :323-325, with 7 reserve uints left. Sun direction + sky params will NOT fit. They go in the UBO (R3). The
     7 reserves are enough for a feature-bit word and a couple of scalars, nothing more.

R5 · THE EXPOSURE COMPLAINT IS THE MOST IMPORTANT FINDING. The user says exposure changes with camera angle even
     when the sun has not moved. `References/ReSTIRBrightnessDiagnosis.md` (this tree) already proved the meter is
     not the cause — Manual mode returns a constant. The real mechanism, from the diagnosis and confirmed by
     reading the kernel:
       • `ObserveCamera` (ReSTIRIntegrator.cpp:37-55) resets accumulation on ANY camera motion > 1e-5 m / 1e-6 rad.
       • EVERY temporal path is gated on `FrameIndex > 0`. So while the camera moves, the image is 1-spp.
       • The running mean is linear; display is ACES + gamma, both nonlinear. By Jensen, E[T(X)] ≠ T(E[X]) — a
         noisy 1-spp pixel and a converged pixel with the SAME mean display at DIFFERENT brightness.
     ⇒ Camera motion changes variance, variance changes displayed brightness. It reads as "exposure moved".
     A sky makes this WORSE, not better: sky light is a huge low-frequency source, so 1-spp sky-lit frames are
     much noisier than 1-spp luminaire-lit frames. **If I add the sky before fixing this, the user will report
     the exact same bug again, louder.** Hence P0 below, before any sky work.
     Second, independent rule: the sky's own exposure must be a function of SUN ELEVATION ONLY, never of frame
     content or camera direction. Looking at the bright horizon vs. dark zenith must not change the gain. This is
     the standard physical-camera approach (EV100 from incident illuminance; UE's "Apply Physical Camera Exposure"
     / BeamNG's manual-EV validation mode). Frame metering stays available for A/B but is NOT the celestial default.

R6 · Sky model choice: Hillaire 2020 (Epic, "A Scalable and Production Ready Sky and Atmosphere Rendering
     Technique", CGF 39(4)) — Transmittance LUT (2D), Multiple-Scattering LUT (2D, the 1/(1-r) power-series
     approximation), Sky-View LUT (2D lat/long, non-linear latitude `v = 0.5 + 0.5·sign(l)·sqrt(|l|/(π/2))` to
     pack texels at the horizon). Chosen over Bruneton 2008 (4D LUTs, artifacts at low sun, expensive to update
     for dynamic time-of-day) and over the previous sessions' analytic per-pixel integral. Critical detail from
     the paper, and it is exactly the previous sessions' "sun is a blob / sky gives weird shapes" failure:
     **the sun disk is NOT rendered into the Sky-View LUT** — the LUT is low-resolution with a non-linear
     mapping, which smears a 0.53° disk into a lopsided blob. The disk is composited afterwards, analytically,
     at full resolution. That single architectural rule is why this plan cannot reproduce that bug.

R7 · Sun-as-light: ReGIR/RTXDI treat the sun as an ordinary entry in the light pool — "directional lighting from
     the sun has the same intensity everywhere in the scene" (Ray Tracing Gems II ch. 23). So the sun becomes
     light index `LightTriangleCount` (one past the emissive triangles), sampled as a cone of half-angle 0.265°,
     resampled by the SAME reservoir, shadow-tested by the SAME `TraceShadow`. No special-case sun path, no second
     shadow system. Sky (the non-sun hemisphere) is sampled separately as an environment light with its own
     cosine/luminance-weighted pick, MIS-combined with the BSDF bounce so neither double-counts.

R8 · Clouds: Schneider/Guerrilla (HZD 2015, Nubis 2017/2023) is the canonical model — Perlin-Worley base shape,
     Worley erosion, weather map for coverage/type, height gradients, Beer-Lambert + powder, dual-lobe HG,
     an inner light march for self-shadowing. The previous sessions' cloud bugs (streaks, banding, "something
     cutting them") were, by their own diagnosis, missing march jitter, a missing far cap, and a sin-based hash.
     All three are design requirements here from day one, not fixes later.

R9 · Proof mechanism EXISTS and is honest: `Scratchpad/GlslShim.h` compiles the REAL `.slang` files as C++ (the
     `FRONTIER_CPU_PORT` path; `MaterialEvaluationTest.cpp` does exactly this with a sed rewrite of swizzles).
     So a proof can execute the production sky/cloud/sun code with no GPU and no hand-written twin. Additionally
     I built **glslang** in this sandbox (`/home/user/deps/glslang/bin/glslangValidator`) and verified the
     production kernel compiles to SPIR-V headlessly:
         glslangValidator -V --target-env vulkan1.2 -S comp -IEngine/Shaders -IEngine -o /tmp/restir.spv \
             Engine/Shaders/ReSTIRViewport.slang      → 186 996 bytes, clean.
     So every phase can gate BOTH "the real kernel still compiles" and "the real kernel's maths is correct".
     There is no GPU here, so no phase may claim a rendered-on-GPU image; proofs render via the CPU-compiled
     production kernel code and say so.

R10 · "Sliders and properties": the entire UI stack (SpatialInterface, ImGui, ControlCentreHost, inspectors) was
      deleted from this tree. The interface is CLI flags in `GameExecution.cpp` (`--exposure`, `--no-gi`, …).
      Rebuilding an ImGui panel is a large, separate job and would drag the deleted UI stack back in. Decision:
      a `CelestialStructure` settings struct is the single source of truth (one field per property, units in
      comments, min/max/default declared next to each field as slider metadata), driven by (a) CLI flags, and
      (b) a live-reloaded TOML file so values can be changed WITHOUT recompiling — which is what a slider is
      actually for. A real slider panel is P8, and it becomes a thin projection of that struct's metadata.
      ⚠️ I will confirm this with the user before P8; if they want an on-screen panel earlier, it moves up.


② THE FAULT LIST THIS PLAN IS WRITTEN AGAINST (the user's own words)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
F1 "the sky gives weird shapes"        → R6: disk composited analytically, never baked into the low-res LUT.
                                          Plus: non-linear horizon parameterisation, and a gate on disk roundness.
F2 "sun isn't being used in ReSTIR"    → R7: the sun is a member of the light pool the reservoir resamples;
                                          proof asserts a surface goes black when the sun alone is removed.
F3 "exposure keeps changing when camera → R5: P0 fixes the variance→brightness mechanism FIRST; celestial exposure
    angle changes, sun hasn't moved"      is a pure function of sun elevation; gate renders the SAME scene from
                                          N camera angles at a fixed sun and asserts the lit-patch radiance is
                                          identical to within a tight band.
F4 "must be all dynamic"               → No bake-at-load anything. LUTs rebuild when the atmosphere changes;
                                          sun/moon/stars advance from a clock; clouds advance on wall-time wind.
F5 "for realtime games"                → Budgets stated per phase; LUT sizes from the paper (256×64, 32×32,
                                          192×108); cloud march step counts on a tier ladder.


③ ARCHITECTURE (one diagram, so the phases below have somewhere to land)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    CelestialStructure (settings, one struct, TOML + CLI)          ← the "sliders"
            │
    CelestialSequence (Tick: clock → sun/moon/star frame, wind integral)   [CPU, per frame]
            │  packs
    CelestialRecord (UBO, binding 21)  ── sun dir/colour/angular radius, atmosphere coefficients,
            │                             cloud params, fog params, moon/star params, wind clock
            ├─→ SkyLutSequence  [3 compute passes, only when the atmosphere changes or the sun moves]
            │       Transmittance LUT (256×64, binding 22)
            │       Multi-scatter LUT (32×32,  binding 23)
            │       Sky-View LUT     (192×108, binding 24)   ← no sun disk baked in (R6)
            │
            └─→ ReSTIRViewport.slang, at the three sites of R2:
                    a) primary miss  → SkyAlong(dir): sky-view LUT + analytic sun disk + moon + stars + clouds
                    b) bounce escape → SkyAlong(dir) (no disk: the disk is handled by NEE, else double-count)
                    c) light pool    → sun cone light + sky environment light, in the SAME reservoir
                and on every camera→hit segment: aerial perspective / height fog.

    Naming per CLAUDE.md §2: Sequence = ordered deterministic steps, Structure = topology/settings,
    Integrator = advances an ODE. "CelestialSolver" is correct for the ephemeris (constraint/position solve).


④ PHASES — each lands with: code, a numeric gate, committed PNG(s) from the CPU-compiled production kernel,
   and a status-log line. Order is chosen so the user's repeat-offender bugs are dead before the pretty work.
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
P0 · STABILITY FIRST — no sky code at all.                                                   [the F3 insurance]
     Fix the variance→brightness mechanism so that adding a huge new light source cannot resurrect it.
     0a. Stop resetting accumulation on camera motion; let the 25°/10% temporal validation do its job (the
         diagnosis's own recommended architectural fix). Keep a `--reset-on-motion` flag for A/B.
     0b. Make the spatial tap radius world-space-aware (scale the pixel radius by view depth) so reuse covers a
         constant footprint in metres — the diagnosis's suspect 1.
     0c. Unify the epsilon regularisation (`d²+0.001` in the target vs `d²+0.01` in shading — a real bug the
         diagnosis flagged).
     GATE: the same scene, same lights, rendered from 8 camera positions/angles; a marked patch's converged
     radiance must agree within 1%. Today that is the failing test; it must pass before P1.

P1 · CelestialStructure + CelestialSolver + the UBO.                                          [F4 foundation]
     Settings struct with slider metadata; ephemeris (sun/moon altitude-azimuth from date/time/lat/long, NOAA);
     the 368-byte-class record packed and bound at 21; Textures[] renumbered; binding gate re-pinned.
     GATE: solver vs. independently computed almanac values (not a re-run of the same code); record round-trip;
     `kComputeBindingCount` invariant re-asserted; SPIR-V still compiles.

P2 · Sky: the three LUTs + the miss path.                                                     [F1]
     Hillaire transmittance / multi-scatter / sky-view, the non-linear horizon parameterisation, and
     `SkyAlong()` at the primary miss. NO sun disk yet — deliberately, so the sky can be judged alone.
     GATE: energy sanity (zenith bluer than horizon in LINEAR radiance, not 8-bit); LUT boundary continuity
     (no seam at the horizon row); a "weird shapes" gate — the sky-view LUT reconstructed at full res must be
     monotonic in latitude away from the sun. Sheets: noon / dusk / night.

P3 · The sun: analytic disk + THE LIGHT.                                                      [F1 + F2]
     Disk composited after the LUT at full resolution (limb darkening, sun-path extinction). Then the part that
     matters: sun enters the light pool as a cone light at index `LightTriangleCount`, resampled by the existing
     reservoir, shadow-tested by the existing `TraceShadow`. Bounce escape gets `SkyAlong` minus the disk (the
     disk is NEE's job; both would double-count).
     GATE: (a) disk roundness/edge contrast at a 4° FOV portrait — the anti-blob gate; (b) **the F2 gate**: a lit
     surface's radiance drops to the ambient floor when the sun light is removed from the pool, proving the sun
     actually lights geometry through ReSTIR and is not a backdrop; (c) MIS one-sample-vs-many convergence check.

P4 · Celestial exposure.                                                                      [F3, the real one]
     Exposure as a function of sun elevation only (physical-camera EV100 from the sun's own illuminance), shared
     by everything. Frame metering stays behind `--adaptive`.
     GATE: fixed sun, 12 camera yaw/pitch angles including straight at the sun and straight away: the exposure
     scalar must be BIT-IDENTICAL across all 12, and a marked lit patch within 1%.

P5 · Clouds (layer) on ReSTIR.                                                                [F4, F5]
     Perlin-Worley shape + Worley erosion, weather-map coverage, height gradients, Beer+powder, dual-lobe HG,
     inner light march. Mandatory from the first commit, because these are the previous sessions' scars:
     per-ray march JITTER, a far CAP on the march span, and a fract-only hash (never sin-based). Wind advances
     on WALL time, never on time-of-day, so scrubbing the clock cannot teleport clouds.
     GATE: a horizontal-band-energy (streak) metric below threshold; march-cap bounds; clock-scrub invariance
     (changing time-of-day by 2 h must not translate the cloud field).

P6 · Local clouds + local fog + atmospheric fog.                                              [scope completion]
     Aerial perspective on the camera→hit segment (so surfaces and sky fog consistently), a height-fog term, and
     box-bounded local volumes. Cloud/fog shadowing of the sun NEE uses the SAME march — no double-count.
     GATE: fog must darken a distant surface and the sky by the same law; a god-ray shaft appears with a
     shadowing occluder; energy conservation across the segment split.

P7 · Night: moon (phase-correct, earthshine) + stars (catalogue) + daylight visibility.       [scope completion]
     Moon as a second cone light in the pool (so it lights the scene at night, through the same reservoir).
     Stars from a catalogue with proper rotation. Both visible in daylight when their radiance survives the sky's
     — which the physical model gives for free; no special "show in daytime" hack.
     GATE: moon phase vs. almanac; star positions vs. catalogue; the daylight-visibility assertion is a RADIANCE
     comparison, not a pixel count.

P8 · Sliders/properties surface.                                                              [R10 — confirm first]
     Live-reloaded TOML + CLI over CelestialStructure's metadata; then, if the user wants it, an on-screen panel
     as a projection of that same metadata.

P9 · Performance pass.                                                                        [F5]
     Budget the LUT rebuilds (only on change), the cloud step ladder per tier, and measure. State the numbers.


⑤ RULES I AM HOLDING MYSELF TO (these are the ones that were broken before)
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
• ONE render path. Every phase lands on ReSTIRViewport.slang. If a proof needs the CPU, it compiles THAT file
  (GlslShim / FRONTIER_CPU_PORT), never a hand-written twin that can drift.
• No proof image is ever hand-drawn, approximated, or mocked. If it cannot be rendered by the production code,
  it does not get committed.
• No GPU in this sandbox is stated, not hidden: proofs run the production code on the CPU, and every phase also
  gates that the real kernel still lowers to SPIR-V (glslang is built and verified — R9).
• Nothing is "done" without a number. Sheets alone are not evidence.
• Commit working states on this branch only; never switch branches.


Status log (append; newest last):
- 2026-09-13: P0 LANDED (stability; no sky code). The three faults are fixed and measured.
  0a. ObserveCamera no longer restarts the accumulation on camera motion. Every temporal path is gated on
      FrameIndex > 0, so the old reset forced the moving image to 1 spp, and a nonlinear display (ACES + gamma)
      turns that variance into apparent brightness (Jensen). Measured by the new harness: at IDENTICAL true
      radiance, 1 spp displays 53.4% darker than converged -- and 93.5% for a broad source like a sky, which is
      why this had to land before P1. Eight camera stops on one fixed, fixed-lit surface: 4.97% spread at 1 spp
      vs 0.11% with history kept, so the 1% band the plan promised is met with room. The reprojection machinery
      (R2 motion vectors, R6 row 2 back-projection, R7a mean reprojection, all validated by the same 25 deg/10%
      rule) already existed and was simply switched off by the reset -- no new validator was written. A viewport
      RESIZE still restarts, correctly: the reservoir buffers are indexed by y*ViewportWidth+x, so there is
      nothing to inherit. Legacy behaviour kept behind --reset-on-motion for A/B.
  0b. Spatial tap radius corrected toward a constant WORLD footprint (kSpatialReferenceDepth 4 m, clamped
      [0.35, 2.50]). A pixel-space radius varied its footprint 128x across 0.5-64 m; depth-scaled it is 17.9x,
      clamped at both ends so a far surface keeps a usable cross and a near one does not tap across the screen.
  0c. One distance regularisation. The RIS target divided by d^2+0.001 while both shading sites divided by
      d^2+0.01 -- the reservoir was resampling against a target not proportional to what got shaded (3.57x
      apart at 5 cm). Now a single kDistanceEpsilon, read by all four sites; the gate forbids the literals.
  Gates: new Scratchpad/CheckViewpointStability.sh (numeric proof + pins every constant against the shader and
  the integrator + asserts the production kernel still lowers to SPIR-V, 187 192 bytes via the in-sandbox
  glslang). Added to CheckEverything. ALL 16 SUITES GREEN. Five suites that were failing on arrival (tinybvh,
  Jolt) were missing third-party trees, not regressions -- verified by running them against the pre-P0 stash --
  and are now populated out-of-band; .gitignore records that ExternalPackages/ is not carried on this branch.
  User confirmed: TOML + CLI for the slider surface (P8), stability before sky. NEXT: P1.
- 2026-09-13: **P2a DONE — the scattering integral, and the LUT question settled with measurements.**
  The user challenged the LUT plan directly: their LUT gave no white line at dawn, no vibrant sunrise/sunset, no
  vivid zenith, and they asked whether an analytic sky would be more realistic. Researched, then MEASURED.
  **The research answer.** Hosek-Wilkie is not an independent model — it is a curve FITTED to a brute-force path
  trace (1M rays/px, 40 min-3 hr per 128x128). So "analytic vs LUT" is a fit-to-physics vs the physics; the LUT
  caches the same integral Hosek fitted to. Three specifics, all against analytic:
    · The paper itself says after-sunset "cannot be fitted... because it cannot recreate the earth casting a
      shadow onto the atmosphere". That shadow IS the dawn band. A fit has no geometry to cast it.
    · Vibrant sunset + blue twilight zenith are OZONE (Chappuis, peak 603 nm). Hulburt 1953: the sunset zenith
      blue is "1/3 Rayleigh and 2/3 ozone, during twilight wholly ozone"; without it the zenith goes
      "grayish green-blue... yellowish". Preetham and Hosek-Wilkie have NO ozone term.
    · Hosek-Wilkie gets BRIGHTER as the sun sets (Kol 2012: "game developers will not use a model that generates
      a sky with an increasingly bright solar region as the sun sets"); at turbidity 2.99 it can go fully black.
    · Cost is inverted here anyway: the sky is a ReSTIR reservoir light evaluated many times per pixel, not a
      backdrop drawn once, so analytic-per-sample is the EXPENSIVE option.
  **Built** `Engine/Shaders/AtmosphereScatter.slang` — one implementation compiled twice (GLSL + C++ via
  GlslShim), included by ReSTIRViewport.slang and by the proof, so they cannot drift. Ozone as a 25 km SHELL
  (tent, 30 km thick) not an exponential — the shell geometry is what makes the slant path explode at twilight.
  Mie extinction = scattering x 1.11 (albedo 0.9). Analytic per-segment integration (S - S*T)/sigma instead of a
  rectangle rule, which removes horizon banding.
  **Measured (Scratchpad/AtmosphereScatterTest.cpp, 27 checks):** dawn band peaks at **3.70 deg above** the
  horizon, **6.24x** the horizon and **4.11x** the sky 25 deg up — a real ridge. Sunset horizon R/B goes
  **0.90 -> 242.8**. Ozone shifts twilight zenith B/G **0.87 -> 1.77** and moves luma **43.2% at twilight vs
  3.0% at noon** (correctly a twilight-only effect). Sky irradiance monotonic, **7.9x** drop 80 deg -> 0 deg.
  **Two real defects the harness caught.** (i) §6 first reported brightness RISING at 20 deg. The physics was
  fine; the TEST was aliasing the narrow Mie lobe on a coarse 8x40 deg grid and not weighting by solid angle.
  Fixed to a 2x10 deg sin*cos-weighted irradiance integral — the fix was the measurement, not the threshold.
  (ii) Dawn LUT error was 6.195%, over budget. Root cause found by sweep: **linear storage**. A bilinear filter
  tracks the arithmetic mean between texels differing 100x across the shadow edge; the falloff is Beer-Lambert,
  so the geometric mean is right. Log-space storage + 192x192:
      192x108 linear 6.195% | 192x108 log 2.316% | 192x192 linear 2.714% | **192x192 log 0.983%** | 192x256 log 0.965%
  256 rows buys 0.02% for 33% memory, so 192x192 is the knee. Final dawn **0.607%**, sunset **0.205%**.
  **The LUT answer, quantified.** Non-linear (Hillaire 5.3) vs naive linear mapping, dawn: **8.91% -> 0.61%**.
  The user's bad LUT was almost certainly linear-mapped and/or linear-stored, not "LUTs can't do this". Through
  the cache the band still peaks at **3.70 deg** (identical to the march) at 6.36x/4.15x, and sunset keeps
  **220/243 = 91%** of its chroma. Gate keeps the linear-mapping and ozone-off CONTROLS so the comparison keeps
  proving something.
  F1 enforced mechanically: the gate greps AtmosphereScatter.slang for any disc/limb/angular-radius term and
  fails if one appears. Visual check rendered to `Scratchpad/SkyPreview.png` (4 elevations; disc composited at
  full res, never baked).
  Gates: `Scratchpad/CheckAtmosphereScatter.sh`, registered. **ALL 18 SUITES GREEN.**
  NEXT: P2b — bake the LUT on the GPU, wire the miss path, keep --sky-raymarch as the live A/B reference.

- 2026-09-13: **P1 DONE — CelestialStructure, the ephemeris solver, and the GPU record.** Four new files.
  1a. `Engine/DisplayPresentation/CelestialStructure.h` — every celestial property with its units, plus a
      `kCelestialProperties` table (52 entries) that binds name/unit/range/default to each field's own offset, so
      a control cannot exist for a field that is gone and a field cannot be added without saying how it is edited.
      No `HideInDay` flag anywhere: a daytime moon must fall out of the radiance comparison, not a special case.
  1b. `CelestialSolver.h` — header-only, Vulkan-free, so the test includes the production file. Almanac
      Appendix C sun (0.01 deg), truncated Meeus moon (arcminutes), IAU 1982 sidereal time, ENU on the engine's
      Z-up. `SolveCelestialEv100(elevation, settings)` — the signature IS the F3 fix: no camera can be passed,
      so a still sun gives a still gain. Anchors 15 EV zenith / 9 EV horizon / -6 EV night.
  1c. `CelestialUniform.h` — 21 vec4s = 336 B, std140-safe by having no scalar arrays at all; black-body sun
      tint normalised to unit luminance so temperature changes hue and Intensity changes brightness, separately.
      Wind drift is INTEGRATED ON THE CPU in metres from wall time, so moving the speed slider does not
      retroactively rewrite cloud history.
  1d. `CelestialSettingsCodec.h` — live-reloaded TOML (mtime poll), generated from the same property table;
      `--write-sky` emits a fully commented template. This is the slider surface until P8.
  Plumbing: binding 21 = celestial SSBO, bindless `Textures[]` moved to 22, `kComputeBindingCount` 22 -> 23,
  storage-buffer pool count 11 -> 12 (the file's own comments record the 11-vs-12 bug; the new gate now counts
  both sides instead of trusting the literal). Buffer allocated once and kept across resizes, host-visible and
  persistently mapped, zeroed so a pre-upload frame reads flags=0 rather than NaN. Game loop solves and uploads
  every frame; `--time/--date/--latitude/--longitude/--time-rate/--sky/--no-sky` added.
  ⚠️ TWO CLOCKS: wall time drives the wind, `LocalHours` drives the sun. Scrubbing the hour must not teleport
  the clouds.
  Measured, not assumed — three real defects the proof caught: (i) the daylight EV curve used a CUBE root, whose
  infinite derivative at zero elevation jumped **0.288 EV in the first hundredth of a degree** above the horizon,
  a visible flash at sunrise; the 2/3 exponent brings the largest step to **0.0139 EV**. (ii) The first transit
  test sampled clock noon corrected for longitude and missed due north by **4.58 deg** — the equation of time,
  up to +/-16 min; the test now finds the transit by search, and both solstice altitudes land within 0.005 deg
  (40.375 / 87.244 vs 40.37 / 87.25). (iii) The star-rotation test compared an unwrapped angle; it now compares
  modulo a turn and confirms the **0.9856 deg/day** sidereal over-rotation.
  Gates: `Scratchpad/CelestialSolverTest.cpp` (44 checks, 0 failures) + `Scratchpad/CheckCelestialSolver.sh`,
  which also diffs the 21 C++ field names against the shader struct field-by-field, compares all six flag bits,
  counts the descriptor pool against the layout, asserts 22 is the highest binding, and re-lowers the production
  kernel to SPIR-V (188 680 bytes, up from 187 192). `CheckTemporalReprojection.sh` updated for 23/22.
  **ALL 17 SUITES GREEN.** NEXT: P2, the sky LUTs and the miss path.
- 2026-09-13: Plan written after reading the tree. Key findings: this tree is ReSTIR-only already (R1), the
  three "no environment light" sites are located (R2), the binding set is full and gated (R3), push constants are
  full (R4), and the exposure complaint has a known mechanism that a sky would AMPLIFY (R5) — so P0 fixes it
  before any sky code lands. glslang built in-sandbox; production kernel verified compiling to SPIR-V (R9).
  Awaiting the user's call on the P8 slider surface before starting.
