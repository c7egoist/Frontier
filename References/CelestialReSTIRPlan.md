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


## DEFERRED — user-reported visual gaps (2026-09-13)

The user reviewed `Renders/` and judged the result "believable", but named three things that are not yet
convincing. These are NOT done and must not be quietly dropped. Each carries what is already known about the
cause, so whoever picks it up does not start from zero.

- **D1 — the dawn horizon line. ✅ FIXED (2026-09-13). See the multiple-scattering note below.**
  (original diagnosis kept:)
  The physics IS there and is gated: `CheckAtmosphereScatter` measures the band peaking **3.70 deg above** the
  horizon at 6.24x the horizon radiance, surviving the LUT at the same 3.70 deg. So this is a PRESENTATION
  failure, not a missing feature. Suspects in order: (a) the ACES tone map compresses a ~6x linear difference
  into nearly the same output where its curve is steepest; (b) the dawn exposure comes from the twilight EV
  branch and may be crushing it; (c) the band is ~4 deg tall and the render is 240 px over a ~58 deg vertical
  FOV, so it spans ~16 px. NEXT STEP: render dawn at high resolution with a LINEAR tone map and a false-colour
  ramp, and confirm the band is in the pixels before touching any physics.

- **D2 — the blue sky tint. ✅ FIXED (2026-09-13). Same root cause as D1.**
  (original diagnosis kept:)
  The bounce path does collect sky radiance (`SkyIntegrationTest` measures B/R 2.54 on an up-facing surface) and
  the shadows ARE blue. But on SUNLIT faces the sun term dominates by 2-3 orders of magnitude, so the sky's
  share is genuinely small — physically right, possibly under-selling reality where multiple scattering and
  ground inter-reflection add more. NEXT STEP: inspect the multiple-scattering term in `AtmosphereScatter`; it
  is one cheap approximation and may simply be too dark.

- **D3 — the sun disc is not visible. ✅ FIXED (2026-09-13).** Two causes, both real, neither in the disc.
  **Cause 1, the one that mattered: THE SKY WAS OVER-EXPOSED.** The showcase's unit-reconciliation constant was
  7000, which put the sky 0.4 deg from the sun at **ACES 1.000 — pure white**, with the disc clipping to the
  same value. The sun was invisible against a white sky and NO glare term could have helped. A photographer
  shooting toward the sun stops down so the sky holds detail and only the sun clips. Measured sweep:
      recon   ACES at 0.4deg / 2deg / 10deg / 30deg / lit ground
       7000    1.000  1.000  1.000  0.942  0.715   <- sky blown, sun invisible
        800    0.870  0.866  0.776  0.436  0.090   <- chosen
  **Cause 2: 0.53 deg is ~2 px** at render size, so even correctly exposed it needs glare to read — which is
  what a real lens and a real eye do.
  **Added `CelestialSunGlare` to the production shader.** ⚠️ USER CONSTRAINT: "the sun blending into the
  atmosphere like a halo is 1 thing i absolutely do not want." The atmosphere ALREADY makes a broad aureole
  (sky 0.3 deg from the sun is only 3.2x the sky 20 deg away), so a second broad term would be exactly that halo.
  🔴 **THE FIRST ATTEMPT WAS A HALO, AND TUNING COULD NOT FIX IT.** Using the full CIE disability-glare function
  (theta^-3 + theta^-2, 6 deg cutoff) the flare still lifted the sky at 3 deg after cutting strength 800x —
  measured lift at 3 deg across the sweep: 0.139, 0.139, 0.139, 0.117, 0.071, 0.030. It refused to go away
  because **reach is a SHAPE problem, not a strength problem**: the theta^-2 term describes ocular scatter out
  to 30 degrees, which is right for modelling disability glare and wrong for drawing a sun. Dropped the tail
  entirely, pure **theta^-3** inside a hard **2.5 deg** cutoff with a squared-cosine window. Now: **zero lift at
  3 deg**, flare visible only to ~0.6 deg, and strength controls brightness WITHOUT controlling reach.
  Gated in `SkyIntegrationTest` section 4b by SHAPE, not brightness: zero beyond 2.5 deg; falls 47.9x by 1 deg
  and **3450x by 2 deg**; and the decisive one — the glare is **3450x concentrated vs the atmosphere's aureole
  at 1.024x over the same span**, i.e. >100x steeper than the thing it must not resemble. Plus monotonic fade
  (no ring) and faded to 0.008% before the cutoff (no edge). `CheckSkyIntegration` pins the constants and FAILS
  if the theta^-2 tail returns. `CheckShowcaseTracksShader` gained a falsification probe for the glare.
  Renders: `19_sun_glare_afternoon.png`, `20_sun_glare_morning.png`, `21_sun_glare_golden.png`,
  `22_sun_glare_sunrise.png` — a distinct disc with a tight smooth fade, sitting in front of the sky.

- **D3 (original diagnosis, kept for the record).**
  Two independent causes, both measured, neither of them a bug in the disc:
  1. **Size.** 0.53 deg over a ~58 deg vertical FOV at 240 px is **2.2 px**. At the 540 px heroes it is 4.9 px.
     It is physically the right size and visually nothing. Real photographs show a big sun because of lens
     bloom and sensor blooming, not because the disc is large.
  2. **The tone map eats it.** Measured at 17:00 along a ray sweeping off the sun:
         0.00 deg  luma 1.659e5    ACES out 1.03
         0.26 deg  luma 1.060e5    ACES out 1.03      <- still inside the disc
         0.27 deg  luma 4.384      ACES out 1.01      <- just outside; a 24 000x CLIFF
         5.00 deg  luma 3.791      ACES out 1.01
     The disc is **24 000x** its surrounding sky and the edge is razor sharp at exactly 0.265 deg — but ACES maps
     everything above ~0.3 linear to ~1.0, so the disc AND the sky around it both clip to pure white.
  **Proved visually:** `Renders/18_sun_disc_zoom_log_scale.png` — same scene, same shader, 8 deg FOV, with the
  tone map swapped for a diagnostic log10 ramp. The disc appears as a clean sharp-edged circle. With ACES the
  identical frame is uniformly white (`Renders/18_sun_disc_zoom_8deg_fov.png` before it was replaced).
  **So the sun is correct and the DISPLAY PATH is the problem.** The fix is a bloom pass — which is the honest
  way to make a 2 px, 24 000x-contrast object read on screen, and is exactly what a real lens does. Scheduled
  for P9 (perf/present) rather than bodged now by inflating the disc, which would be a lie about its size.

**Scene change (DONE 2026-09-13):** the default level is now `--scene spheres` (`SkySpheresStructure`) — the
same three matte spheres and open ground as `Renders/`, with **no luminaire at all**, so the sun and sky are the
only lights and a broken celestial path renders black rather than being covered for by a fill light. 11 906
triangles, 80x80 m ground so the skyline in shot is the atmosphere's horizon and not a plane edge. The Cornell
box is untouched and still reachable via `--scene cornell`: twelve harnesses use it as a bit-identity reference,
and deleting it to change a default would have been vandalism. Gated by `CheckSkySpheresScene.sh`, which asserts
the new default AND that Cornell still works.


### D1 + D2 ROOT CAUSE: multiple scattering was never implemented (2026-09-13)

Both complaints had ONE cause, and it was not tone mapping. `AtmosphereScatter` carried a comment promising
multiple scattering and implemented **none** of it — it added a ground-albedo bounce when the view ray hit the
planet, and nothing else. Hillaire 2020 is explicit that omitting it "results in overly dark scenes" and that at
sunset it is "critical to achieving believable results".

**Implemented** Hillaire's dual-scattering idea inline: once-scattered light treated as an isotropic source, each
further bounce redistributing it with a constant albedo, summed as the geometric series `total = first/(1-albedo)`
— the paper's "power series 1/(1-r)" trick. One divide instead of an N-order iteration.

🔴 **THE ALBEDO IS SET BY A REAL-WORLD ANCHOR, NOT BY EYE.** A clear zenith is ~8 000 cd/m² against a solar disc
of ~1.6e9 cd/m². In these units (solar irradiance = 1, disc radiance = 1/solid angle = 14 880) that is **0.074**:

      albedo   noon zenith   B/R
        0.00      0.0227     2.78   <- single scattering only: 3.3x too dark AND too grey
        0.62      0.0368     2.96
        0.85      0.0736     3.12   <- lands on the reference; chosen
        0.90      0.1004     3.15

⚠️ **A WRONG FIX WAS TRIED FIRST AND REMOVED.** Assuming the black sky *below* the horizon at dawn was the bug, a
"twilight coupling" term was added to couple light down from sunlit air 30 km up. Measured, it barely moved the
result — and the reason is that the darkness is CORRECT: the march is clamped at the planet, and a ray 1 degree
below horizontal hits the ground ~100 m away, so there is almost no air along it to scatter. The dark wedge in
the preview was the **80 m scene plane ending before the true horizon**, not a shading bug. Removed rather than
tuned; a gate now asserts below-horizon STAYS dark so nobody "fixes" it again.

**Results.** Noon zenith **0.0683 vs the real 0.0744**; zenith **B/R 3.25**; sky supplies **31.7%** of a surface's
total light (real clear-sky diffuse 15-20%) at **B/R 2.89**. Renders `23_ms_dawn.png` (gold horizon line with the
Belt of Venus above it), `24_ms_morning.png` (blue sky, distinctly blue shadows), `25_ms_golden.png`.
Gated in `AtmosphereScatterTest` section 5b against the real-world numbers. **ALL 23 SUITES GREEN.**


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
- 2026-09-13: **The showcase now compiles the SHADER'S OWN TEXT — the previous visual proof was not one.**
  User pushed back: "did u render what the GPU would have done via the CPU (that's what you should do)". Correct
  challenge. The first showcase HAND-WROTE C++ "mirrors" of CelestialSunDisc / CelestialMoonDisc / CelestialSky
  and described them as mirroring the shader. That is a proof that agrees with itself: if the shader's disc
  maths were broken, the mirror would still render a pleasant picture and report success.
  Built `Scratchpad/ExtractCelestialPort.sh`, which lifts the ACTUAL TEXT of the shader's celestial block —
  CelestialRecord + all 5 functions — out of ReSTIRViewport.slang, rewrites GLSL swizzles/out-params, and
  compiles it as C++. Mirrors deleted. The record is filled by `memcpy` from PackCelestialUniform with a
  `static_assert` on size, so a packing divergence produces garbage rather than a plausible lie. Flag bits are
  deliberately NOT emitted by the extractor — the shader code binds to `Frontier::kCelestialFlag*` from the C++
  header, forcing the two to agree.
  🔴 **PROVED BY FALSIFICATION, NOT ASSERTION.** New `Scratchpad/CheckShowcaseTracksShader.sh` edits the shipping
  shader, re-renders, and REQUIRES the image to change: zeroing the sun disc (3 bytes), halving sky radiance
  (99 341 bytes), removing the moon disc (6 bytes). It also greps the showcase for re-introduced mirrors.
  **The falsification immediately caught that the showcase was not showing its own subject.** Zeroing the sun
  disc changed ZERO bytes — because the camera faced a fixed north-east bearing while the sun was 63.7 deg
  off-axis at noon and 275 deg away at sunset. The disc was never in shot. Camera now follows
  `SunAzimuthDegrees`, and the spheres are placed camera-relative and rotated with it (fixed world positions put
  them out of frame at every hour but noon). An image that CANNOT show the thing it claims to prove is not
  evidence, and only the falsification test surfaced that.
  **Two of my own probes were wrong before the code was.** A "disable the flag check" probe appended a no-op
  label and changed nothing; a "multiply earthshine by 64" probe changed nothing because the moon already
  renders at ~2.4e5 times saturation. Both reported FAIL, both times the probe was at fault, and the fix was a
  probe that perturbs something observable (zeroing the moon disc) rather than a loosened comparison.
  Visual: `Scratchpad/CelestialDayCycle.png` regenerated — 10 frames 5.5h..22h, sun disc visible, shadows
  rotating with the sun through the day, blue sky-lit shadows, gold horizon at dawn and dusk, stars at night.
  **ALL 22 SUITES GREEN.**

- 2026-09-13: **VISUAL PROOF of P1-P4 — and it found three real bugs that every gate had missed.**
  User asked to SEE the sun/atmosphere before clouds go on top. Built `Scratchpad/CelestialShowcase.cpp`, which
  drives the whole production chain per frame: `SolveCelestial` (real almanac ephemeris at Benoni) ->
  `PackCelestialUniform` (the actual GPU record) -> read back through the SAME fields the shader reads ->
  `AtmosphereScatter.slang` + `RayGeneration.slang` compiled as C++ -> `SolveSunTransmittance` for direct light
  -> `ExposureIntegrator` in Celestial mode. Only the toy scene and integrator loop are harness code.
  Ephemeris self-validates in the output: noon sun **+60.09 deg at azimuth 1.33** (due north — correct for the
  southern hemisphere), sunrise az **90**, sunset az **275**, EV100 **13.98 -> -5.60** across the day.
  🔴 **BUG 1 (ENGINE, SHIPPED): the moon was 96 145x too bright.** First render had blown-white night frames.
  `PackCelestialUniform` computed moon radiance as `irradiance / solidAngle`, copying the SUN's rule. That rule
  is right for the sun, whose irradiance is the known quantity; the moon is a diffuse sphere LIT BY that
  irradiance, so **L = E x albedo / pi**. Delivered 0.192 of the sun's ground irradiance instead of ~2e-6.
  Fixed to the physical form — no tuning constant — and it lands at **3.96e-6 vs the real 2.08e-6, within 2x**
  (full moon ~0.25 lux against sunlight ~120 000 lux). This was a direct consequence of the P2b units fix
  over-correcting, i.e. a bug I introduced two phases earlier and only a picture caught.
  🔴 **BUG 2 (ENGINE): night exposure ignored the moon.** The solver pinned full night at -6 EV with the comment
  "moonlight is scene radiance, not an exposure change". That comment was wrong. Photographically a moonless
  landscape is ~EV -6 and a full-moon landscape ~EV -2.5 — **3.5 stops** a real camera must dial in. Added
  `SolveCelestialEv100WithMoon(sunElev, moonElev, moonPhase, settings)`, ramped in below -6 deg sun so there is
  no step. ⚠️ Does NOT reopen F3: the new terms are moon elevation and phase, both world state like the sun's
  elevation; still no camera in the signature. F3 was never "exposure must not change", it was "must not change
  WHEN THE SUN HASN'T".
  🔴 **BUG 3 (HARNESS, not the engine): the showcase lit the ground with a new moon as if it were full.**
  MoonRadiance is the radiance of the LIT part of the disc; the disc shader applies the terminator per-pixel,
  but a LIGHT SOURCE integrates the whole disc and must be scaled by the lit fraction. Phase was 0.09 (near new)
  yet the ground rendered at **202/255 — brighter than the sunlit frames**. Scaled by phase² (grazing terminator
  light); night ground now **6.8 / 9.7 / 0.0** at 18.6h / 19.5h / 22.0h.
  Also fixed in the harness: the star field was quoted in raw units (~1.0) against a night gain of 2.8e5, so
  every star rendered **845 000x white**. Recalibrated to radiance (~2.1e-6). The engine was never wrong here —
  `Stars.Brightness` is a multiplier awaiting P7 — but a preview that lies is worse than no preview.
  Gated: new section 4b in `SunReservoirTest.cpp` checks moon/sun ground irradiance against the REAL WORLD ratio
  (within 10x), asserts the moon can never approach the sun, and asserts the formula is exactly E·albedo/pi with
  no fudge factor. Visual: `Scratchpad/CelestialDayCycle.png` (10 frames, 5.5h -> 22h).
  **ALL 21 SUITES GREEN.** Lesson recorded: 21 green suites did not catch a 96 000x error, because every gate
  compared the code against itself. The real-world ratio check is the fix for that class.

- 2026-09-13: **P4 DONE — F3 fixed: the exposure stops moving when the camera does.**
  New `ExposureModeCategory::Celestial` alongside Manual and Adaptive, selected by `--sky-exposure`. Manual does
  not drift but cannot follow a day; Adaptive follows the day but meters the FRAME, so turning to face a bright
  wall is indistinguishable from the wall getting brighter — that IS F3, by construction. Celestial takes the
  gain from `SolveCelestialEv100(elevation, settings)`, whose signature cannot reach a camera.
  **Measured, with a control.** A camera sweep swinging the frame meter **160x** with the sun fixed:
  Celestial drift **0.00000000%** (bit-stable), Adaptive on the IDENTICAL sweep **29.51x**. The Adaptive control
  stays in the harness and the gate fails if it is removed — without it, §1 only proves a constant is constant.
  Celestial still tracks the sky: **2.1e6x** from noon to −20°, monotonic.
  🔴 **A REAL DEFECT FOUND, AND THE FIRST FIX WAS THE WRONG ONE.** A smoothness check failed at 0.0222 EV across
  a 0.02° window. Investigating rather than widening the bound: the VALUE is continuous at the horizon join
  (9.3917 → 9.4000 → 9.4139, one-sided steps 8e-5 / 6e-4 EV) — only the SLOPE changes, 0.83 → 1.39 EV/deg, a
  C0-but-not-C1 join that is invisible. EV-per-degree is not perceptible; EV-per-SECOND is. Rewritten that way:
  realtime worst is **0.01514 EV/s**, 6.6x under the ~0.1 EV/s flicker threshold.
  **But the rewrite exposed a genuine one**: at `--time-rate 60` the same curve hits **0.908 EV/s** — visible
  pumping through sunrise. Added a 4 s ease on the GAIN (not a change to the curve). Constant chosen by sweep:
      ease   1x rate   1x lag | 60x rate  60x lag
        0s   0.00351   0.0000 |  0.46406   0.0000
        4s   0.00347   0.0138 |  0.19949   0.7962
       20s   0.00331   0.0659 |  0.09527   1.9046
       30s   0.00302   0.0899 |  0.07030   2.1080
  ⚠️ **I could not get 60x under the threshold and said so rather than faking it.** The requirement is
  self-contradictory: a 60x lapse compresses sunrise's ~6 EV into ~a minute, so the average rate is ~0.1 EV/s by
  construction. Buying it costs ~2 EV of lag — the exposure visibly trailing the sky, a worse artefact than the
  flicker. 4 s is the knee: realtime lag 0.0138 EV (invisible), and it still more than halves the lapse rate.
  The test now asserts what is true and useful — easing must measurably help (>40%), and REALTIME must be 4x
  under threshold — instead of an impossible bound.
  **The ease does not reopen F3**, and that is its own gated section: with easing ON the 160x sweep still moves
  nothing (0.00000000%). Easing adds a dependence on TIME, never on the camera.
  Gate greps the Celestial branch of `QueryExposure` for `AdaptedLuminance|ObservedLuminance|ExposureForLuminance`
  and fails if any appears; verified by DELIBERATELY adding a frame-luminance term — caught — then restoring.
  Also enforces `--adaptive` and `--sky-exposure` mutual exclusion.
  **Visual**: `Scratchpad/ExposureStabilityPreview.png`, a 105° pan with a fixed sun, Adaptive (red bar) vs
  Celestial (green bar). On a FIXED LIT SURFACE the spread is **Adaptive 19.05% vs Celestial 4.28%** — and the
  residual is one frame whose sample patch clips a sphere, not exposure drift; the exposure value itself is
  1.07087 at every angle. ⚠️ Whole-frame mean is a poor measure here (15.8% vs 11.9%) because panning genuinely
  changes what is in shot; the fixed-surface patch is the honest one.
  Gates: `Scratchpad/CelestialExposureTest.cpp` (16 checks) + `Scratchpad/CheckCelestialExposure.sh`, registered.
  **ALL 21 SUITES GREEN.** NEXT: P5 — clouds.

- 2026-09-13: **P3 DONE — F2 fixed: the sun is a member of the reservoir's light pool.**
  The sun is given light index `LightTriangleCount` (one past the real luminaires) so it travels through EVERY
  existing path — initial RIS, extra candidates, temporal reuse, spatial reuse, the shadow ray, the final shade —
  with no parallel code path that could drift out of step. RTG2 ch.23's rule: the sun is an ordinary pool entry.
  **The one trick, and why it needs no special case.** The reservoir stores a world POINT and divides by d²; the
  sun has no position. Rather than fork the estimator across 11 `PHatFull` call sites, the sun is a disc at
  `kSunDistance = 100 km` with emission = irradiance × d². The two cancel exactly, leaving f·E·cosθ through
  unmodified shared code. Sampling the DISC rather than the centre gives genuine penumbrae from the existing
  shadow ray, free. Proven, not asserted: cancellation exact at the owning pixel, **0.0100% worst** for reuse
  from 5 m away, survives fp32. kSunDistance justified in BOTH directions — at 1 km the reuse parallax (0.287°)
  would EXCEED the sun's own disc (0.265°); at 1e9 m emission would be ~2.2e19 and lose fp32 mantissa. At 100 km
  parallax is **0.0029°, ~1% of the disc**.
  **Unbiasedness measured**, since adding the sun changes pSource for every light and getting that wrong biases
  the image permanently: RIS converges to ground truth within **0.008% / 0.108% / 0.057%** at sunShare
  0.50 / 0.25 / 0.75 (400k trials each). Cone sampling verified uniform over solid angle (2.02% bin spread) and
  correctly sized (0.26467° vs 0.265°).
  🔴 **A SILENT-DEATH BUG FIXED AND GATED.** The direct-lighting block was gated on `LightTriangleCount > 0u`, so
  an outdoor scene with no emissive triangles skipped direct lighting entirely — the sun would have been in the
  pool and STILL never sampled, i.e. F2 reintroduced while every other check passed. Now gated on
  `TotalLightCount(sky)`, and the gate greps for the old form returning.
  **Sunset reddening of DIRECT light** added as `SolveSunTransmittance` (record 352 → **368 B**, 23 vec4s, new
  `SunTransmittance`). Kasten-Young air mass, because naive 1/sin diverges at the horizon — exactly when it
  matters. Measured R/B **1.274 at noon → 721 at sunset**; monotonic; fades through the −2..0° refraction window
  instead of cutting. Elevation-only signature: no camera reachable (F3 discipline, gated).
  **A gate that passed because it crashed.** The stray-`SampleLightPoint` check used `grep -v` with an unescaped
  `(`, so grep errored, produced empty output, and the check printed OK. Rewritten with `grep -F`, then verified
  by DELIBERATELY reintroducing the bug — the gate caught it at line 1135 — and restoring.
  Gates: `Scratchpad/SunReservoirTest.cpp` (22 checks) + `Scratchpad/CheckSunReservoir.sh`, registered.
  SPIR-V 211 956 → **217 356 B**. Visual: `Scratchpad/SunShadowPreview.png` (64 spp, sun-disc sampled; shadows are
  blue from skylight, not black, and lengthen and warm as the sun sets). **ALL 20 SUITES GREEN.**
  ⚠️ ENVIRONMENT NOTE: the sandbox reset wiped `/home/user/deps` and `ExternalPackages/` (both outside the repo,
  never committed). Rebuilt glslang from source and re-cloned tinybvh/ufbx/cgltf/jolt/stb + Vulkan-Headers;
  libJolt.a rebuilt. Celestial suites were unaffected throughout — only the 5 third-party suites had failed.
  NEXT: P4 — celestial exposure driven by sun elevation only, which is the direct fix for F3.

- 2026-09-13: **P2b DONE — the sky is on screen, and scene objects receive it.**
  Wired both escape paths in `ReSTIRViewport.slang`. Primary miss now reconstructs the ray via the SHARED
  `GeneratePrimaryDirection` (RayGeneration.slang) — not a local copy, because a hand-rolled version is one sign
  error from a vertically mirrored sky that shows ONLY on the miss path. Bounce-escape now returns
  `CelestialSky(..., includeDiscs=false)` into `accumulatedRadiance`: this is the line that satisfies "scene
  objects actually receive this light". Discs excluded there because the sun becomes an explicit reservoir light
  in P3 — including it would double-count AND deliver fireflies, being tiny and enormously bright.
  SPIR-V **188 680 -> 211 956 B**; the gate now FAILS if the module drops below 200 kB, since dead-code stripping
  would silently prove the sky is unreachable while every other check still passed.
  **Step budget, measured not guessed.** Uniform stepping converged badly (32 steps still 2.44% off). Added a
  warped distribution t = (i/n)^kStepWarp:
      8 steps: uniform 18.413% | k=1.5 6.699% | k=2.0 4.376%
     16 steps: uniform  8.142% | k=1.5 2.120% | k=2.0 1.680%
  k=2.0 has a lower mean but a much worse tail (42.5% vs 21.4% worst at 16) because it starves the far field —
  which is where the twilight band lives. **k=1.5 chosen; 16 warped steps beat 32 uniform at half the cost.**
  Production runs kSkyViewSteps 16 / kSkySunSteps 8, verified at **2.164% mean vs a 256/32 reference**.
  🔴 **A REAL PHYSICS BUG, FOUND BY RENDERING.** The first scene render had a blown-white ground under a correct
  sky. Cause: the scattering integral assumes top-of-atmosphere solar irradiance = 1, but `Sun.Intensity` was
  being used directly as the DISC RADIANCE. Radiance and irradiance differ by the disc's solid angle
  (6.72e-5 sr). Measured consequence: direct sun was **1377x the zenith sky at 50 deg elevation**, against a true
  ratio nearer 100-200x. Fixed by deriving both from one number — Intensity IS the irradiance, disc radiance is
  irradiance/solidAngle, and the sky is scaled by the same irradiance. Added `SunIrradianceAndScale` (record
  336 -> **352 B**, 22 vec4s). Now energy-conserving: the disc integrates back to its own irradiance to **0.006%**
  at 0.25/0.53/1.5 deg, and changing the sun's angular SIZE no longer silently brightens the scene.
  **Two test bugs also caught and fixed honestly** (the code was right both times): (i) asserted the frame is
  brighter towards the bottom — false, with a 27.5 deg half-FOV the bottom is BELOW the horizon looking at
  shadowed ground; the horizon is a ~50x cliff at exactly 0 deg, so the test now finds the horizon row and checks
  it is the brightest. (ii) Asserted an up-facing surface receives more than a sideways one — false: measured
  up 0.017, side 0.050, down 0.078, because a sideways face sees the bright horizon band plus lit ground. Now
  checks all orientations are non-zero and that the zenith-facing sample is the BLUEST (it alone sees no ground).
  Gates: `Scratchpad/SkyIntegrationTest.cpp` (25 checks) + `Scratchpad/CheckSkyIntegration.sh`, registered.
  Visual: `Scratchpad/SkyScenePreview.png` (4 elevations, sky + sky-lit ground). **ALL 19 SUITES GREEN.**
  NEXT: P3 — the sun as an explicit ReSTIR reservoir light (F2), with shadow rays.

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
