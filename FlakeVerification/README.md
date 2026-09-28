> ⚠️ **SUPERSEDED — see [`ReSTIR/`](./ReSTIR/README.md).**
> This `ScaleSweep` render is an *analytic*, noise-free BRDF sweep — useful to prove the System B
> flake model is correct in isolation, but it is **not a path-traced image**. Per your request, the
> flakes are now rendered on a **sphere by the real CPU ReSTIR path tracer** (`MaterialLevelViewport`),
> where you can actually judge fireflies-vs-flakes. Start with `ReSTIR/FlakeReSTIR_Compare.png`.
> The files below are kept only as the clean-reference (what a correct flake *should* look like).

# Flake verification — System B, CPU reference render, scale sweep

**Goal (your request):** render the *correct* flake model — **System B**
(`Engine/Shaders/AutomotiveFlakePaint.slang`, finite hash-placed flakes + footprint LOD + separate coat),
**not** System A (the sine-band path the live kernel currently runs) — on the **CPU**, at a **range of flake
sizes (big → small)**, so you can verify for yourself that flakes are actually there and behaving, without the
path-tracer noise confusing the picture.

## Why this settles the "is it flakes or noise?" question
These images are rendered by `ScaleSweep.cpp`, a small C++ driver that includes the **exact shared shader source**
(`AutomotiveFlakePaint.slang` via `CpuShader.h`) the GPU material evaluator uses. It is a **deterministic,
supersampled** render — there is **no Monte-Carlo sampling and therefore zero noise**. So every speck you see is a
flake, never a firefly. That is the whole point of rendering it this way.

## The images
- **`FlakeScaleSweep_Near.png`** — 8 curved swatches, close-up, flake diameter **2.0 mm → 0.05 mm** left→right
  (RGB flake palette so they're unmistakable). Large flakes read as discrete oriented facets; as they shrink you
  get the classic dense metallic sparkle; the finest ones start dissolving.
- **`FlakeScaleSweep_Far.png`** — the same swatches at a **far** viewing distance. This is the key proof of
  correctness: the **footprint LOD** makes flakes ≤ ~0.28 mm dissolve smoothly into a **silky metallic sheen**
  instead of aliasing into grain. Real flakes that shrink below a pixel become a smooth lobe — they do **not**
  turn into noise. (System A, by contrast, has no footprint filtering and *does* alias — which is exactly why the
  live viewport looks "flaky everywhere.")
- **`FlakeScaleSweep_Silver.png`** — stock silver metallic paint (no RGB palette), close-up, same size sweep.

Every swatch is labelled with its flake diameter in millimetres.

## How they were produced
```
g++ -std=c++20 -O2 -I Engine/Shaders -I Engine/ContentInterchange -I Exhibits/Workbench/AutomotiveFlakes \
    ScaleSweep.cpp -pthread -o sweep
./sweep <output_dir> 2        # 2 = sqrt(spp): 2 -> 4x supersampled; raise for a crisper render
```
`ScaleSweep.cpp` (included here) reuses the exhibit's studio-light rig and only varies `DiameterMm` per swatch;
density, coat and pigment are held constant so **only the flake size changes across the row**.

## What this tells us for the engine work
System B is correct and controllable. The remaining task (from the earlier review) is to **wire System B into
the render kernel's `ResolveMaterial`, fed by the ray-cone footprint the kernel already computes**, and retire the
System A sine-band path — after which flakes in the live viewport will sparkle when resolved and dissolve to
smooth metal at distance, exactly as above, instead of aliasing into something indistinguishable from noise.
