# ReSTIR brightness shift on dolly — diagnosis

**Symptom.** The scene's brightness changes when the camera moves closer to or
further from the Cornell box. Suspected cause: the exposure is not staying still.

**Verdict.** The exposure is exonerated — in the default configuration the tone
map is a constant and *cannot* move. The shift is in the ReSTIR estimate and
the presentation chain around it. Ranked suspects and decisive experiments below.

All line references are to the post-surgery tree (`arena/01a080e1-frontier`),
which also removed the sun/sky/atmosphere and the UI, so no environment term
can move underneath the estimate anymore: ray misses resolve to black and the
scene is lit by its own luminaires only
(`Engine/DisplayPresentation/ReSTIRIntegrator.h:1-4`).

---

## 1. Exposure is not the cause (proof)

- The integrator holds `ExposureIntegrator Adaptation{}`, whose default mode is
  Manual: *"Manual by default, so the tone map cannot move under ReSTIR"*
  (`ReSTIRIntegrator.h:129`).
- `QueryExposure()` in Manual mode returns the configured constant, ignoring
  the adapted state entirely (`ExposureIntegrator.cpp:78-82`); the default is
  1.05, overridable only by `--exposure`. `QueryColourSaturation()` likewise
  returns exactly 1.0 (`ExposureIntegrator.cpp:65-70`).
- The per-frame `ObserveLuminance` / `Advance` calls in the render loop
  (`Projects/Project-Zero/Source/GameExecution.cpp:510-515`) therefore cannot
  alter either value the shader receives. `BuildDispatch` passes
  `Adaptation.QueryExposure()` straight into the `Exposure` push constant.

Corroborating experiment (E0): repeat the dolly with `--adaptive`. The shift
persists in Manual mode, where the tone map is a compile-time-behaviour
constant — that alone rules exposure out. (In `--adaptive` a small legitimate
response to frame composition is by design, but the median-anchored meter
measures 0.00 stops of pumping.)

---

## 2. Suspect 1 (primary): screen-space spatial-reuse radius

The R6 row-3 spatial taps live in *pixel* space:

- `kSpatialRadiusMinPx = 4.0`, `kSpatialRadiusMaxPx = 16.0`
  (`ReSTIRViewport.slang:132-133`), scaled only by `RenderWidth/1280`
  (resolution independence — *not* distance independence).

When the camera is close to a wall, a 4–16 px tap lands on nearly the same
world point; when far, the same pixel radius spans a much larger world area.
Two consequences, both viewpoint-dependent:

1. **M-clamp bias varies with distance.** Every merge caps the incoming count
   at `min(prevM, 20 × M)` (`ReSTIRViewport.slang:125,889,944`). M-capping is
   a deliberate bias-for-variance trade: how often the cap binds, and the size
   of the resulting bias, depends on validation pass rates and M growth — both
   of which change as the pixel radius covers more or less world. The same
   world surface can therefore converge to a slightly different brightness seen
   from near vs. far.
2. **Variance varies with distance.** Near: taps validate, M grows, low noise.
   Far: taps span more world, validation fails more often, higher noise. The
   noisier estimate is then pushed through the nonlinear ACES + gamma curve
   (§4), so equal means display as unequal brightness.

**Decisive experiment (E1):** dolly with `--no-spatial`, converged at each
stop. If the near/far difference disappears, the spatial radius is confirmed.
The fix direction is a world-space-aware tap radius (scale the pixel radius by
view depth so the reuse footprint stays constant in metres).

---

## 3. Suspect 2 (structural): camera motion switches all temporal machinery off

`ObserveCamera` resets accumulation on *any* camera move beyond 1e-5 m / 1e-6
rad (`ReSTIRIntegrator.cpp:37-49`), and the render loop calls it every frame
(`GameExecution.cpp:516`). A dolly therefore holds `FrameIndex == 0` on every
frame — and every temporal path in the kernel is gated on `FrameIndex > 0`:

- temporal reservoir reuse (`ReSTIRViewport.slang:873`),
- spatial neighbour reuse (`ReSTIRViewport.slang:919`),
- the R7a running-mean reprojection and even the plain same-pixel history read
  (`ReSTIRViewport.slang:667,694`).

So **while the camera moves, every frame is a fresh 1-sample estimate**: no
reuse, no accumulation. The R7a comment block ("a pan keeps its samples",
`ReSTIRViewport.slang:640-655`) contradicts this behaviour — as integrated,
R7a can only ever engage on a *static* camera, where there is nothing to
reproject. One of the two is wrong:

- either `ObserveCamera` should *not* reset on motion and the 25°/10%
  validation rules should do their job (the ReSTIR-correct architecture), or
- R7a is dead code and the "restarts on camera motion" status line is the
  honest description.

Either way, the moving image is pure 1-spp noise, and §4 explains why that
reads as a brightness offset against the converged still image.

**Decisive experiment (E2):** compare the *converged* still image at the near
stop vs. the far stop (wait for convergence at each; identical wall patch in
view). If those match but the *moving* image differs, the shift is the
motion/still variance gap (§4), not a viewpoint bias. If the converged stills
differ on the same surface, the estimator itself is viewpoint-biased (suspect 1
or 3) — that is the tell.

---

## 4. The variance → brightness mechanism (why noise reads as a shift)

The kernel's running mean is linear, but it is displayed through ACES filmic +
gamma 2.2 (`ToneMap`, `ReSTIRViewport.slang:704-720`), both nonlinear. For any
nonlinear display transform T, E[T[X]] ≠ T[E[X]] (Jensen): a high-variance
1-spp pixel and a converged pixel with the *same* true mean display at
*different* average brightness. This needs no bug in the estimator — it turns
every variance difference (motion vs. still, near vs. far via suspect 1) into
a visible brightness difference. It also means: judge brightness only on
converged stills, never on the moving image.

---

## 5. Suspect 3 (secondary): the à-trous denoiser footprint

The R7 filter's kernel steps are in pixels (5 levels, doubling step) while its
depth tolerance is relative (σz) and its luminance weight is nonlinear
(`AtrousDenoise.slang:47-49,85-89,153+`). Near vs. far changes how much world
the kernel covers, hence how much smoothing each pixel gets, and the filter is
only approximately energy-preserving. It cannot be the whole story (the shift
was reported with the denoiser's contribution unclear), but it can add a
viewpoint-dependent term on top of suspect 1.

**Decisive experiment (E3):** dolly with `--no-denoise` (raw accumulated
image). If the shift shrinks but survives, the denoiser contributes; compare
against E1 to apportion blame.

---

## 6. Ruled out as the camera-shift cause (but real bugs worth fixing)

**Epsilon regularisation.** The DI target divides by `d² + 0.001`
(`ReSTIRViewport.slang:570`) while shading divides by `d² + 0.01` (line 995;
the bounce NEE matches at line 1060). These are constant in *world* units, so
they darken close-range light↔surface transport (at 10 cm the shading
denominator is doubled: −1 stop) but **cannot move with the camera** for fixed
geometry. Fix independently: use one consistent regularisation, ideally scaled
rather than absolute.

**Composition.** A near frame and a far frame show different surfaces; different
surfaces are differently bright. That is correct rendering. Experiment E2's
fixed-surface control separates it from estimator bias.

**Stale F-key references.** Shader comments mention "F5" for the alias pick
(e.g. `ReSTIRViewport.slang:538-541`) but there is no UI and no key handling
left; the CLI flags (`--uniform-pick`, `--no-temporal`, `--no-spatial`,
`--no-denoise`, `--no-reprojection`, `--adaptive`, `--exposure`) are the
interface. Cosmetic only.

---

## 7. Recommended experiment order

| # | Run | Decides |
|---|-----|---------|
| E0 | dolly, default vs. `--adaptive` | shift in Manual ⇒ not exposure (already proven statically) |
| E2 | converged still near vs. converged still far, same wall patch | stills differ ⇒ estimator/viewpoint bias; stills match ⇒ motion/still variance gap |
| E1 | `--no-spatial` dolly, converged at each stop | shift gone ⇒ pixel-radius reuse (suspect 1) |
| E3 | `--no-denoise` dolly | shift shrinks ⇒ denoiser contributes (suspect 3) |
| E4 | `--no-temporal` dolly | isolates the temporal-merge M-clamp term |

If E1 confirms suspect 1, the principled fix is to scale the spatial tap
radius by view depth (constant world footprint); if E2 shows the estimator is
clean and only the moving image shifts, the fix is architectural: stop
resetting accumulation on camera motion (suspect 2) so the camera can move
without collapsing to 1 spp — accepting that validation/ghosting bugs, if any,
will then become visible and must be fixed where they live.

---

## 8. Provenance

Symptom history (from the exposure-gate comments, since reworded for the
sky-less tree): *"the sky changes brightness when I move closer to or further
from the box"* (reported four times); *"close to the object it looks fine,
move away and the scene gets brighter"*; *"moving back and forth still changes
the brightness of the sky and the Cornell box."* The exposure meter's own
pumping was measured at 0.00 stops across all three test framings
(`Engine/DeviceExchange/SwapchainExchange.h:40-61`), consistent with this
report's finding that the remaining shift lives downstream of the meter, in
the estimate and its presentation.
