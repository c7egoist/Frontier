══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  Celestial fix plan — sun disk, clouds, ReSTIR weather, scene, proofs, editor panel
══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

Branch: `arena/01a09785-frontier` (base: streamlink `arena/01a09335-frontier` @ `86c5ab3`, imported).
Reference: `References/CelestialPanel.reference.html` (SultanAladin/Frontier- `eaab23e`).
Standing orders: `StandingOrders.md`. Prior plan docs (`CelestialPortPlan.md`, `CelestialPortSteps.md`) stay valid for
sequencing rationale; this doc is the fault-by-fault fix list with evidence.

Conventions: REF = reference HTML line; ENG = engine file. All REF lines are `grep`-verifiable in the vendored file.


① DIAGNOSIS — WHAT IS WRONG AND WHY (evidence first)
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

D1 · Sun renders as a blinding blob / ghost circle, not a disk.
    The disk FORMULA is correctly transcribed (SkyRecords.slang SkyAlong ≈ REF 1237-1242). The failure is
    everything around it:
    a) EXPOSURE. REF tames daylight with autoEV (REF: `autoEV=-.35·ss(-8,-1,elev)-1.0·ss(-1,6,elev)-.6·ss(6,30,elev)`,
       ≈ −1.95 at noon) on top of pp_ev=+0.4 → effective ×0.34 at noon. The engine has NO sun-elevation term:
       Manual 1.05 (ExposureIntegrator.h) is ~3× brighter than REF at noon, so the ~1.5-linear aureole lands at
       ACES ≈ 0.9 next to a 1.0 disk — no edge survives. The aureole cap (kAureoleKnee/Slope/Sigma) narrows the
       gap but cannot replace the missing 3×.
    b) PLANET/ATMOSPHERE GEOMETRY. REF defaults: planetR 6371 km, atmo height 100 km. Engine: 6360 km / 60 km
       (AtmosphereModel.h). Changes horizon/limb brightness and the grazing path.
    c) DISK GATING uses view elevation where REF uses SUN elevation (soft + `mix(.35,1,ss(-1,8,elev))`).
       Equivalent when looking at the sun, divergent nowhere else that matters — fix for exactness anyway.
    d) DISK REDDENING uses view-ray transmittance where REF uses sun-path extinction
       (`max(ext_airmass(elev), trans²)`). At low sun the two differ strongly.
    e) REF draws the disk OVER clouds (unoccluded) then fogs it; ENG attenuates by cloud transmittance. ENG is
       more physical, but while the cloud field is buggy (D2) the disk inherits every cloud bug as ghosting.
    Fix: port autoEV into the celestial exposure chain; align geometry/kelvin defaults; transcribe (c)+(d)
    exactly; re-audit the disk AFTER the cloud field is fixed, then decide the occlude-vs-overlay rule by
    A/B sheets against REF.

D2 · Clouds: streak lines, banding, "something cutting them", wrong look vs REF.
    a) NO MARCH JITTER. REF jitters the march start per pixel (`t=t0+dt·hash13`, cloudMarch). ENG uses a
       deterministic span-relative midpoint grid (VolumetricMedia.h March, SkyRecords.slang CloudMarchMedium).
       Adjacent elevation rays take different step phases → contour bands = horizontal streaks. The span-relative
       grid was itself a fix for union-span streaks; without jitter it only changed their shape.
    b) NO FAR CAP. REF clamps the march span to `thick·14` (below/inside) or `max(60km, thick·40)` (above).
       ENG marches to Maximum (200 km in-shader) with a 4×-budget step cap → at grazing, ~1.8 km steps through
       ~300 m features: massive undersampling (streaks) plus step-size discontinuities at cap boundaries (hard
       cuts). The "cut" is the cap edge, not geometry.
    c) MISSING MARCH TERMS. REF cloudMarch has: 4-octave shape + detail-erosion octave (cl_detail), dual-lobe HG
       (g1 0.8 / g2 0.3 / mix 0.3), 3-octave multi-scatter, Beer-powder (0.6), absorption (0.05), extinction 0.06,
       ambient × 0.9, anvil shear lean, cirrus streak, lodFar orbit fallback, aerial-perspective mix. ENG has:
       3 octaves (layer) / 2 (local), single HG (0.45), no multi-scatter, no powder, no absorption, extinction
       0.01 (6× too clear), full-sky ambient, no lean, no lodFar. Result is unavoidably flatter and more veiled.
    d) SHARPENING WITHOUT DITHER. ENG smoothstep-sharpens the coverage remap; REF keeps it linear and carves
       detail with erosion. Sharp + deterministic = hard contour edges = "streaks of lines".
    e) SIN-HASH NOISE. ENG `Hash` is sin/fract-based (VolumetricMedia.h, WindField.h, SkyRecords.slang);
       REF hash13 is fract-only. Sin-hash correlates and bands at large coordinates — and ENG feeds it huge
       coordinates (see f).
    f) CLOUD CLOCK = TIME-OF-DAY. ENG CloudTime = LocalHours·3600 (CelestialSequence.cpp ApplyTo/PackSkyRecord).
       At 7am that is 25 200 s × ~8 m/s ≈ 200 km of drift; scrubbing the time slider teleports clouds kilometres
       per minute. REF integrates wind over WALL time (WIND.int += base·gust·dt) — time-of-day never moves clouds.
    g) FLAT SLAB vs SPHERICAL SHELL. REF marches planet-curved shells (rsi on R0/R1); ENG marches a flat slab.
       Keep the flat slab (it matches the CPU/GPU twins and the editor), but the far cap (b) and shell-aware
       horizon fade must bound the grazing error REF's curvature handles implicitly.
    Fix: port (a)(b)(c)(d)(f) faithfully in BOTH twins; replace sin-hash with hash13 in all three noise sites;
    align defaults (wind 4.2 m/s @214°, shear 0.6, veer 18, turb 0.2; cloud cov 0.45, base 1500, thick 900,
    scale 1.4, albedo white; absorb 0.05, amb 0.9, powder 0.6, g 0.8/0.3/0.3); add a wind-integral clock advanced
    by Tick wall-time, decoupled from LocalHours.

D3 · Clouds on the ReSTIR path.
    PackSkyVolumes bridges weather to binding 21 (fixed at `9cbea26`), and SkyAlong marches it for misses and
    bounces. Remaining risks, all downstream of D2: (i) the shader twin must receive every D2 term or the paths
    diverge; (ii) sun NEE through weather must occlude by the SAME shadow march (no double-count with the
    medium in-scatter); (iii) height/aerial fog on misses AND on the eye→hit segment (REF applyMedia runs on
    every ray; ENG must do the same or surfaces and sky fog differently); (iv) local-volume sun-shadow taps pace
    the medium step — verify against REF uniShadow (4 taps × st·0.5).
    Fix: after D2, A/B the two paths on identical frames (same seed/clock/camera) and pin them with the parity
    proof; add the eye→hit fog segment if missing.

D4 · Visibility raster is "terrible quality" and the path switching is unclear.
    GameExecution wires S.GlobalIllumination → Integrator.AssignGlobalIllumination (ReSTIR GI on/off); the
    visibility raster (GeometricRaster CPU + VisibilityRaster.vert/frag.slang GPU) is the no-ray path but there
    is NO explicit user-facing ReSTIR on/off trigger selecting raster-vs-ReSTIR. Quality gaps to audit: tonemap
    parity (fixed by ColourTransfer.h — verify it is actually consumed everywhere), no jitter/dither in the
    raster sky, raster resolution/scale.
    Fix: add the explicit trigger (Control Centre tile + config + CLI), define GI-off ⊂ ReSTIR (keep current,
    correct) vs raster (no rays at all), and bring the raster sky through the SAME fixed code as D1/D2.

D5 · Scene.
    Project Zero still carries CornellBox.gltf content and showroom seams. Per l.md §1 it must open on ONE
    celestial test scene: ground + spheres/boxes with coloured/emissive materials.
    Fix: new `CelestialYard` scene (procedural or minimal glTF), default boot scene, Cornell/showroom kept only
    as loadable files, never the default.

D6 · Proof parity.
    Several proofs re-implement rather than call production code (see CheckProofFidelity.sh scope). Per l.md §3
    every proof must execute the production path (CPU twins) and commit PNGs + numeric gates.
    Fix: audit each celestial proof; rewire fakes onto production calls; extend CheckProofFidelity.sh.

D7 · Editor panel port (deferred until D1–D3 are green, per user).
    Registry projection per CelestialPanelUi.md; 21 widget types; headless proof via EditorProof mechanism.


② REFERENCE DEFAULTS (measured from the vendored HTML — the values ENG must match)
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
sun_temp 5800 · sun_intensity 22 · sun_ang 0.53° (diameter; shader takes /2) · sun_soft 0.25 · sun_disc 12
pp_ev +0.4 · tonemap ACES · bloom 1 · vignette 0.28 · grain 0.1 · flare on/Cinematic/int 1/ghosts 5
atm rayleigh 1 · mie 1 · mieG 0.78 · ozone 1.2 · hr 8000 · hm 1200 · planetR 6371 km · height 100 km
wind speed 4.2 · dir 214 (FROM) · shear 0.6 · veer 18 · gust 0.25 · turb 0.2
vclouds Cumulus · cov 0.45 · den 1 · scale 1.4 km · detail 0.6 · anvil 0.3 · base 1500 · thick 900
        wind 6 @214 · g1 0.8 · g2 0.3 · mix 0.3 · absorb 0.05 · amb 0.9 · powder 0.6 · albedo #fff · steps 36
cloud2D cov .46 · den .62 · alt 130 · scale 1 · detail .55 · speed 1 · tint #eef3f8 · shade #5c6a7c
fogP on · den .011 · height 42 · color #8fa4bb · sunScatter .7
afog den 7e-5 · height 1200 (see af_* registry)   · lc (40,120,-160) ext (90,35,70)   · vf (6,2.5,-14) ext (18,4,18)
stars density 1 · bright 1 · size 1 · Natural(.8/.5) · limit 1.5 · milky 1 · rot 40 · tilt -62
rainbow on · from-rain · int 1 · width 1 · sec 0.6 · super 0.35   · precip Rain 12 mm/h
moons [luna] az 300 · size 0.52° · bright 1.6 · glow 0.8
tier ladder: Draft 20 / Balanced 36 / High 64 cloud steps (map onto our 5-tier ladder per CelestialPortPlan §6)


③ PHASES (in order; each lands with PNG sheets + numeric gate + proof-fidelity note)
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
P0 DONE this session: base import, StandingOrders.md, this plan, vendored reference.
P1 Sun disk + exposure. Port autoEV; align planet/atmo/kelvin defaults; transcribe disk gating + reddening;
   re-audit disk vs REF sheets (noon/sunset/night). Gate: disk edge contrast + centre/edge ratio within REF band.
P2 Cloud march fidelity (D2 a–g). Both twins + defaults + wind-integral clock + hash13. Gate: CPU/GPU twin
   agreement per pixel (parity proof), streak metric (horizontal-band energy below threshold), span-cap bounds.
P3 ReSTIR weather (D3). NEE occlusion, fog segments, no-double-count. Gate: A/B path sheets + estimator audits.
P4 Raster path + triggers (D4). Explicit ReSTIR on/off; raster sky through fixed code; quality audit.
P5 Scene (D5). CelestialYard default; Cornell/showroom demoted to loadables.
P6 Proof parity (D6). Rewire fakes; extend CheckProofFidelity.sh; commit the showcase sheets.
P7 Editor panel (D7). Registry projection; headless sheets per entity; numeric gates.
P8 Remaining entities audit: 2D cloud layer, terrain, precipitation on both paths, god-ray (shadow-map term)
   design per CelestialPortSteps §5b — each with its own sheet + gate before closing.

Status log (append; newest last):
- 2026-09-12: P0 landed. D1–D7 diagnosed against vendored REF. Starting P1.
- 2026-09-12: P1-exposure landed. `ColourPipeline::DaylightExposure(elev)` transcribes the panel's autoEV curve
  (-.35·ss(-8,-1) -1.0·ss(-1,6) -.6·ss(6,30), linear exp2) into ColourTransfer.h, shared by both paths. ReSTIR:
  `ReSTIRIntegrator.CelestialExposureFactor` multiplies `Adaptation.QueryExposure()` at BuildDispatch;
  GameExecution assigns it from the solved sun elevation pre-dispatch (1.0 when celestial off); the setter is
  presentation-only (no reset — exposure lands after accumulation, same argument as AssignDenoise), answering
  the RESTIR×exposure worry: no feedback into reservoirs/history/meter. Raster/proofs: ManualExposure 1.05f +
  ApplyTo composes manual × DaylightExposure. Exposure gate pins the dispatch line + P1 structure; test §15 pins
  5 reference values, monotonicity, bit determinism. Headless enablers: RayTracingCapabilitySet.h compiles
  without the Vulkan SDK (__has_include fallback; proofs never link Probe()); sandbox deps in /home/user/deps
  (CGLTF/UFBX/STB/TINYBVH) + imgui/stb submodules initialised. Gates green: exposure, sky-kernel (+SPIR-V),
  celestial-sky, editor-preview; showcase re-rendered; sheets committed. REMAINING P1: disk gating/reddening
  transcription + planet/atmosphere default alignment (100 km / 6371 km / Rayleigh pair).
