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
P1 DONE: Sun disk + exposure. autoEV landed (see log); planet/atmo/kelvin defaults aligned (6371 km / 100 km /
   kelvinRGB(5800)); disk gating + reddening transcribed exactly from REF 1238-1242 through one shared SunDisc
   (CPU raster calls it, shader transcribes it, parity proof executes it); sun portraits (noon + low) gate edge,
   roundness and colour. Post-D2 re-audit of the occlude-vs-overlay rule stays open (D1e).
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
- 2026-09-13: P1-disk landed, P1 COMPLETE. AtmosphereModel defaults now 6371 km / 100 km / kelvinRGB(5800);
  Kasten-Young moved to AtmosphereModel::AirMass as the single source (solver forwards; almanac pins hold).
  New shared SunDisc::Evaluate transcribes REF 1238-1242 exactly: sun-elevation soft/gate, analytic sun-path
  extinction maxed against view-transmittance-squared, 0.25/12x panel defaults. CPU raster calls it; SkyAlong
  transcribes it (new SkyAirMass, sun elev from SkySunDirection.w, pre-cloud view transmittance captured for the
  floor); parity proof executes it (13 pins incl. R/B 4.93 at 8 deg and 1.47 at 50 deg vs independent doubles).
  New sun portraits (4 deg FOV at the solved sun, noon +2.1 deg) gate aim, limb radius/roundness/crispness and
  colour through the production raster: edge at r=18 (stencil-corrected 21), +-1 px round, white overhead,
  R/B 1.39 warm core at dusk. Gates green: sky-kernel (+13 P1 pins, SPIR-V clean), celestial-sky (+6 portrait
  asserts), exposure, volumetric, sundirect, moon, editor-preview; all sheets + 2 portraits committed. The low
  portrait's bright glow is faithful (same integral + tonemap as REF saturates both); the disc's own deep-orange
  linear colour is pinned in the parity proof. D1e overlay-vs-occlude re-audit stays deferred to post-D2.

- 2026-09-13: P2.0 diagnosis landed (no code). REF cloud block (~986-1175: clDensity, cloudMarch, marchLocal,
  uniShadow, cloudLayer, cloudShadow, clProfiler, lcDensity, vfDensity) + wind JS (windBase/Gust/Turb/Disp/Step)
  mapped term-by-term against VolumetricMedia.h / WindField.h / SkyRecords.slang / SkyCloudKernelProof.cpp.
  CONFIRMED D2a-f, all now measured in ENG code: sin-hash at 3 sites (+ twin mirrors it); noise [-1,1] roundtrip;
  3/2 octaves vs REF 4-oct shape (2.02/4.1/8.3, /0.9375) + 2-oct erosion (erode=mix(det,1-det,clamp(hn*3))*
  detail*.45, clamp(base-erode*(1-base))); smoothstep-sharpened remap vs REF linear; extinction .01 vs .06;
  single HG .45 vs dual-lobe (g1 .8 / g2 .3 / mix .3, x4pi, sunL*.02) + per-medium ms-octaves (layer
  (a,b)=(1,1)/(.5,.55)/(.25,.3025), local sh+.55sqrt+.3fourth) + Beer-powder (.6) + absorption (.05); full-sky
  ambient vs REF amb*.9*mix(.35,1,hn) (ENG cloud bases ~3x overlit = the veil); no jitter / far cap (thick*14
  below-inside, max(60km,thick*40) above) / anvil lean (hn*thick*.35) / cirrus streak (x*1.12, z*.6) / lodFar
  fade (90-180 km) / aerial mix (mix(acc,sky*(1-T)*.9,aer*.6)); clock = LocalHours*3600 vs wall-clock integral
  (WIND.int += base(0)*gust*dt, drift = int*f(alt), gust phase += dt*(.35+gust*.4)).
  NEW transcription bugs: (i) SampleSwirl advects ALTITUDE (z*.02+t*.03) where REF advects the horizontal plane,
  and its component mix is not REF's (n1-n2,n2-n3,n3-n1) — re-transcribe exactly. (ii) GustPhase rate misses
  REF's gust term (Tick += dt*.35, REF dt*(.35+gust*.4)). (iii) Bearing comment claims TOWARD; the (sin,cos)
  formula is REF's FROM form (pattern moves bearing+180) — renumber 225->214 + fix the word. (iv) Steadiness is
  an ENG invention (default 1.0 = REF; keep + note). (v) Height profiles: stratus/sc/cumulus/cb match REF
  clProfiler; altostratus/cirrus differ — port. (vi) Fog uses the cloud coverage model; REF vf is extinction x
  hetero x gravity (.35/m, 3-oct .55/.3/.15, shapes/falloff) — needs lanes it doesn't have, so -> P8; P2 aligns
  only fog g .45->.6 + shared jitter. Defaults to align: wind 8@225/shear .35/veer 12/turb .3 -> 4.2@214/.6/18/
  .2; cov .55/thick 1200/scale 1.0/anvil .5/albedo .92-.97 -> .45/900/1.4/.3/white; local centre (0,0,400) half
  (300,300,150) scale 120 -> (40,-160,120)/(90,70,35)/30, den 1->1.2; tier taps 6->4 (REF Standard 28 steps/4
  taps; min(userSteps,tierSteps) rule + user axis -> P7). RECORD: P2 needs scatter (g1/g2/mix/absorb/amb/powder/
  detail) + localDetail + wind (int.xy, wall) = 11 lanes; grow +3 rows (320->368B, cloud rows are last so no
  offset shifts): SkyCloudScatter, SkyCloudDetail, SkyCloudClock. Albedo.w retired (sole reader: CloudDriftAt).
  lcType/lcShape/lcSoft bit-packed into CloudControl.w (reserved uint; soft 8-bit fixed). Layer/local single-g
  lanes retired-but-packed (documented). Unlinked entity winds + fog albedo/shape/absorb -> P8 (next growth).
  JITTER: REF hash13(pixel,fract(uTime*3)); ENG uses an integer hash of (pixelIndex, wall-clock frame) — animated
  like REF (no shower-door), bit-exact CPU/GPU (REF's float hash of large pixel coords is implementation-defined
  across sin). March gains a defaulted PixelSeed (0 = deterministic uniform shift for proofs); shader plumbing
  TBD by call-chain check (PixelIndex if <=2 hops, else ray-dir hash). STRUCTURAL keeps (reasoned, documented):
  flat slab (D2g); fixed-step counts (finer than REF fixed-count; the cap bounds cost); per-medium span marches
  (union broke transmittance monotonicity, measured); ShadowMarch already paces uniShadow (port the exact
  growing-tap form d=st*i^2*.35 + lod anyway). sunUp moves INTO the march per medium (layer: sun elev; local:
  normalized box height; fog: absolute height); caller-side DayF scaling (raster/twin/proofs) goes away.
  SLICES: P2.1 hash13 + noise[0,1] + jitter (3 transcriptions + determinism asserts; re-pin noise-shifted stats).
  P2.2 wind clock (integral state in Tick, AdvectDrift = int*f + static lean, gust rate, swirl, all defaults,
  record growth + Clock row). P2.3 far cap (layer only). P2.4a density terms (octaves/erosion/linear remap/lean/
  streak/lod/lc profiles+shape). P2.4b lighting terms (uniShadow/ms/powder/absorb/ext/HG/sunUp/hn-amb/aerial).
  P2.5 sheets + portraits + census gates. P8 takes: fog vf model, unlinked winds, point/spot on fog, user step
  axis; P3 takes the dead HeightFogOpticalDepth (only its proof calls it) + eye->hit fog segments.
- 2026-09-13: P2.1 LANDED (hash13 + jitter). Sin-hash replaced by Hoskins hash13 (REF-verbatim) at all 3 noise
  sites + twin, same op order (bit-identical CPU-side); noise now [0,1] like vnoise (both shape remaps dropped
  the *0.5+0.5; the WindField range fix also restores the REF swirl magnitude, which ran 2x hot on [-1,1]
  differences). Layer march jitters its start per ray: hash13 over the spread direction (x317.19 — bounces have
  no pixel to hash, so the direction seeds every path) plus fract(Time*3), layer only like REF; (I+Jitter) grid
  in CPU/shader/twin (the uniform shift absorbs the midpoint; no signature changes anywhere). Jitter-design
  note: dir-hash won over the planned PixelSeed (3-hop shader plumbing through the ONE-entry SkyAlong, and
  bounces need dir-hash anyway). Proof section 8 pins bit-identical repeat + fan variation + clock re-roll; the
  .sh guards hash13 presence, sin-hash absence (comments stripped) and jitter twins. Gates green: volumetric
  (section 6 shafts hold under the new field), sky-kernel (streakDy 0.0235/Dx 0.0164 ratio 1.43, twin-vs-raster
  0.0014, +2h identical character), celestial-sky (census bands hold with NO re-pins: noon 137550 px/114.4,
  box 14009/0.417), shader-compile (SPIR-V clean), moon, tiers, fidelity, exposure, editor-preview, scene. Noon
  A/B: horizontal striations across every puff (before) -> fine incoherent grain (after); the grain is the
  sharpened remap under dither (D2d) and P2.4a's linear remap + erosion removes its cause. Sheets recommitted.
- 2026-09-13: P2.2 LANDED (wind-integral clock + reference defaults + record growth). Tick now advances a
  wall-clock wind integral (gusted surface flow, REF windStep order — gust from the un-advanced phase), the
  gust phase at dt*(.35+gust*.4), and a wall-seconds dither clock; LocalHours moves none of them. AdvectDrift
  is REF windDisp transcribed exactly (integral x |step|/speed x art, trig-only): the Time, reference-altitude
  and cell params are gone, and with them the 120 s shear memory and the 2-cell clamp (both gates now assert
  their absence). Densities and the shadow march dropped their dead Time params (P2.4a re-adds wall time to the
  densities for the erosion drift); the march keeps it for the jitter. SampleSwirl re-transcribed term-by-term
  (horizontal-plane time advection — the old form drifted altitude upward — and the reference mix (Dz-Dy,
  Dx-Dz, Dy-Dx)); WindFieldProof section 7 pins it against an independent inline transcription (0.000e+00 over
  64 probes) and section 8 pins the drift formula plus the zero-wind/zero-integral guards. Struct defaults all
  REF now (wind 4.2@214 FROM + comment fix, shear .6, veer 18, turb .2; cov .45, thick 900, scale 1.4, anvil .3,
  albedo white; local (40,-160,120)/(90,70,35)/1.2/30; budget taps 6->4 — every sheet already renders at tier
  taps, so the pre-jitter posterization note is dead; Steadiness kept as a documented ENG extension, default
  1.0 = REF). Prepare's staged look untouched (P5 owns staging; only fog g .45->.6 added). Record 320->368 B
  (+SkyCloudScatter/Detail/Clock; Albedo.w retired to 0, sole reader gone): host mirror, shader block, host
  allocation, pack proof and both gate pins moved together; shader drift/jitter read the Clock row. Twin proof:
  drift test rewritten (formula + bit-exact CPU/kernel agreement — PASS), raster branch reads the packed wall,
  +2h test now Ticks 7200 s and pins drift=0.053 (moved) with streak 0.055/0.049 ratio 1.12 (coherent). Gates
  green with NO re-pins: wind, volumetric, sky-kernel (parity 0.0013), celestial-sky (census holds undrifted:
  noon 136590/127.1, box 13669/0.508), shader-compile, precip (one stale pin updated), moon, tiers, fidelity,
  exposure, editor-preview, scene. Two missed density callers caught by the pack-proof build (precip emitter,
  sky census probe). Morning render recommitted: undrifted broken sky, blue gaps overhead, veiling at horizon.
- 2026-09-13: P2.3 LANDED (layer far cap). REF line 1023 transcribed as one named helper per slab-interval
  twin — CPU SlabFarCap (public, next to SlabExtent) + shader CloudSlabFarCap + proof TwinSlabFarCap — both
  branches each: above the slab max(60 km, thick x 40), below or inside thick x 14, as a cut (Far = min(Far,
  Near + cap)), layer only (both box exits still run to the maximum, pinned). A grazing ray now marches
  12.6 km at full step resolution instead of stretching its count cap over ~90 km of chord; the far mush
  beyond the cut is gone on all three paths. Proofs: media section 9 pins the law exact-float (both branches
  + the max() arm at thick 2000 -> 80 km), the grazing discrimination (89 steps, not 112 — the probe cloud is
  optically thin so the T<0.005 early-out cannot fire and the count is geometry, not weather), Maximum-at-cut
  bit-identity, and the steep 7-step control; the twin pins its own interval directly (grazing below/above +
  steep plane exit). Gates green with NO re-pins: volumetric, sky-kernel (parity IMPROVED 0.0013->0.0008 —
  both paths stopped shading the far field they previously shaded slightly differently; morning streak
  0.0245/0.0180, +2h 0.0552/0.0491 drift 0.053), celestial-sky (noon 136352/126.3, box 13669/0.508, night ratio
  0.68), shader-compile, moon, tiers, fidelity, exposure, precip, editor-preview, scene. Sheets recommitted
  (above-camera dawn sheets move under the 60 km arm). CORRECTION to the P2.2 close-out note: the
  "packets-guard on WallSeconds_" and "WindSpeed unused-field decision" were phantoms — no WindSpeed
  identifier exists anywhere, and wall-clock semantics make large-dt integral advance correct (steady_clock
  never runs backward), so there is nothing to guard; the LocalDensity Time re-add stays P2.4a's per plan.
