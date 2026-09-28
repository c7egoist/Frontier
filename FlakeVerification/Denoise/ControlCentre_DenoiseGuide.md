# Hooking the denoiser guide into Project‑Zero — Control Centre → Render Settings

This wires the denoiser **detail‑guide** (the flake/spec/emissive/fresnel/edge/**smart** menu prototyped in
this folder) into the real Project‑Zero engine as a first‑class **Control Centre → Render Settings** control,
plumbed down to the ReSTIR integrator and out to the denoise dispatch.

Patch: **`ControlCentre_DenoiseGuide.patch`** — applies to a clean Frontier `main` with
`git apply` (verified). Touches 7 files; every change is **additive and identity‑preserving** (with the guide
set to *Standard* the pipeline renders bit‑for‑bit as before).

## What the patch does (the part that's done)

| Layer | File | Change |
|---|---|---|
| Shared enum | `Engine/DisplayPresentation/DenoiseGuide.h` *(new)* | `DenoiseGuideCategory { Standard, Flakes, Reflections, Emissive, Fresnel, Edges, Smart }` + `DenoiseGuideLabel` + `NextDenoiseGuide` |
| Settings record | `ControlCentreHost.h` | `ControlCentreSettings.DenoiseGuide = Smart` |
| **Control Centre UI** | `ControlCentreHost.cpp` | New **"Denoising"** section on the Render Settings page with a **"Detail Guide"** pill‑cycler (taps advance Standard → Flakes → … → Smart), bumps `Settings.Revision` like every other render row |
| Integrator config | `ReSTIRIntegrator.h` | `ReSTIRIntegratorConfiguration.DenoiseGuide` + `AssignDenoiseGuide()` (resets accumulation on change, like the other Assign\* setters) |
| Project wiring | `Project-Zero/Source/GameExecution.cpp` | `ApplyControlCentreSettings` calls `Integrator.AssignDenoiseGuide(S.DenoiseGuide)` — so the pick takes effect live, on the same gesture as GI / Reflections / Sky Reuse |
| GPU carry | `SwapchainExchange.h` + `ReSTIRIntegrator.cpp` | Guide id packed into `FeatureFlags` bits **[12..14]** (`DispatchGuideShift`/`DispatchGuideMask`) — *not* a new push field, because `DispatchConfiguration` already sits at Vulkan's guaranteed **128‑byte** push‑constant ceiling |

So today: the control exists in the Control Centre, it flows through the settings record → integrator config →
dispatch feature bits, and changing it resets the accumulator (visible reset). Default is **Smart**, which is the
setting that keeps flakes visible at Standard quality.

The algorithm itself is already **validated** in the CPU mirror (`MaterialLevelViewport`, this folder's renders):
what the patch adds is the engine‑side wiring, not new maths.

## What remains (needs a GPU + build this sandbox doesn't have)

1. **Kernel emits the preserve weight.** In `Engine/Shaders/ReSTIRViewport.slang` (and its required‑identical CPU
   twin `MaterialLevelViewport.cpp`), decode the guide id from `FeatureFlags` and, at the primary hit, compute the
   per‑pixel preserve weight from the material record — exactly the CPU‑prototype signals: System‑B flake mask,
   effective roughness (min of base/coat/glass), emissive luminance, `pow(1‑N·V,4)`, geometry edge. Write it into
   the **free alpha channel of the parked‑albedo image** (`OutputImage.a`, denoise set binding 3) — no new
   descriptor binding needed.
2. **Denoiser consumes it.** In `Engine/Shaders/AtrousDenoise.slang`, at the final level, read that alpha and
   `mix(filtered, raw, preserve)` before the tone map. (The filter already demodulates albedo, so the raw target
   is the right space.)
3. **Rebuild the SPIR‑V** — `glslc` the modified `AtrousDenoise.slang` (and the kernel) to `.spv`.
4. **Parity gate.** Run `Tools/CheckPostKernel.sh` / the ReSTIRViewport↔MaterialLevelViewport parity gate so the
   GPU kernel and CPU twin stay identical.
5. **Validate on a Vulkan device** — confirm Standard is bit‑for‑bit unchanged and Smart matches the CPU‑mirror
   renders in this folder.
6. **Per‑tier defaults (optional).** Decide whether `FidelityClassifier` should pick a guide per quality tier
   (e.g. Smart at Standard+, Flakes at Economy) instead of a single global default.

Items 1–2 are the only remaining *logic*; 3–5 are build/validation that require the GPU toolchain.
