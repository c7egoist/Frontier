# Flake verification — rendered by the real CPU ReSTIR path tracer

This supersedes the earlier `../ScaleSweep` studio preview (an analytic BRDF sweep, not a
path-traced image). Everything here is produced by **`MaterialLevelViewport`**, the CPU port
of the engine's Vulkan ReSTIR renderer (`Engine/Shaders/ReSTIRViewport.slang`, mirrored
line-for-line in `Projects/Project-Zero/Host/MaterialLevelViewport.cpp`). It runs the same
RIS + temporal/spatial reservoir reuse + à-trous denoise the GPU path runs, so what you see
here is what the flakes look like *inside the actual renderer*, fireflies and all.

Subject: a **sphere** from the showcase grid, **row 12 col 3** — the "glint flakes" row
(`ShowcaseStructure.cpp` case 12: `SlateGlintDensity 1→8`, `SlateGlintUvScale 4→12` across the
row). Col 3 has moderate density with coarse flakes, so individual flakes are large enough to
resolve against the pixel footprint at close range.

## What changed to render System B

The shipped glint hook in the ReSTIR renderer is **System A** — `AutomotiveApplyTriCoatFlakeNormal`
(a sine-band normal perturbation keyed to world position). I added an A/B switch, `--flakes-systemb`,
that instead drives the shading-normal perturbation from **System B**
(`Engine/Shaders/AutomotiveFlakePaint.slang` → `AutomotivePrepareFlakes`): finite, hash-placed
flake cells with ray-cone **footprint LOD**, so sub-footprint flakes stop contributing (they
converge to a smooth surface) instead of aliasing. The change is in
`MaterialLevelViewport_SystemB.patch` (also wire the same call into `ReSTIRViewport.slang` if you
want it on the GPU — the two files are kept identical by `Tools/CheckPostKernel.sh`-style gates).

Scope note: this bridges System B's **flake placement + LOD** into the existing "perturb the
normal, then run OpenPBR" flake architecture. It is **not** the full System B layered BRDF
(coat-over-flake transport); that is a larger integration touching BSDF sampling/pdf/MIS and
should be validated on-GPU. The placement/LOD is the part that decides *flakes vs aliasing*,
which is what this verification is about.

## Repro

```bash
# build (needs Vulkan-Headers for a header include; no GPU/device is used)
git clone --depth 1 https://github.com/KhronosGroup/Vulkan-Headers ~/.cache/m7/Vulkan-Headers
make -C Projects/Project-Zero/Host MaterialLevelViewport

cd Projects/Project-Zero/Host
COMMON="--level showcase --view flake1 --width 448 --height 448 --spp 6 --frames 6 --taps 2 --threads 2 --restir"
./MaterialLevelViewport $COMMON                       --out A_raw.png       # System A, raw
./MaterialLevelViewport $COMMON --denoise             --out A_denoise.png   # System A, à-trous
./MaterialLevelViewport $COMMON --flakes-systemb          --out B_raw.png       # System B, raw
./MaterialLevelViewport $COMMON --flakes-systemb --denoise --out B_denoise.png # System B, à-trous
```

`flake1` is a close-up view I added to `GetView` (eye `(-9.75, 15.20, 1.75)`, pitch −40°, FoV 34°)
so a single flake sphere fills the frame. `--denoise` requires a **square** panel. The `row12_*`
images are the wider `--view glints` framing of the whole flake row for context.

## Files

| file | what it shows |
|---|---|
| `FlakeReSTIR_Compare.png` | 2×2 contact sheet: System A vs B, raw vs denoised (start here) |
| `closeup_SystemA_raw.png` / `_denoise.png` | System A (sine-band) close-up |
| `closeup_SystemB_raw.png` / `_denoise.png` | System B (finite hash flakes + LOD) close-up |
| `row12_System{A,B}_{raw,denoise}.png` | whole flake row, `--view glints`, for context |
| `MaterialLevelViewport_SystemB.patch` | the `--flakes-systemb` wiring + `flake1` view |

## What the renders show — flakes vs fireflies

- **Raw ReSTIR, System A** (`closeup_SystemA_raw`): the flake speckle sits on a visible
  **regular lattice** — the sine-band signal aliasing across the tessellated sphere. That
  structured pattern is the System-A artifact the review flagged.
- **Raw ReSTIR, System B** (`closeup_SystemB_raw`): the sparkle is **organic / stochastically
  clustered** (hash-placed cells), without the regular lattice. This is the intended flake look.
- **Both denoised**: the à-trous filter smooths the sphere to a clean gradient and, at this
  sample budget (6 spp × 6 frames), **removes most of the flake sparkle along with the GI noise**,
  leaving the broad specular glint plus one or two **residual bright blobs** — those blobs are
  path-tracer **fireflies** that survive as low-frequency smears, not flakes.

### The headline answer to "do I get fireflies or flakes?"

At a normal interactive budget, **both**, and the current pipeline can't cleanly separate them:
the flakes are high-frequency point highlights of the *same* magnitude and frequency as the
ReSTIR fireflies, so the denoiser treats them identically — it erases the genuine flakes and
only partially tames the fireflies. To make flakes read as *flakes* rather than noise you need
one of:

1. **Guide the denoiser** — write the resolved flake highlight into the albedo/normal guide
   buffers so à-trous edge-stopping preserves it instead of blurring it away (best fix).
2. **More samples / accumulation** so the flake field is stable frame-to-frame and survives
   temporal reuse (System B's object-locked placement already makes it temporally stable — it
   does not swim, unlike screen-space noise).
3. **Larger / higher-contrast flakes** (as tuned here) so they sit above the noise floor.

The firefly problem itself is the separate MIS/clamp issue noted in
`../../Frontier-RenderingReview.md`; `--restir-bounce-mis` is the A/B flag for that fix.
