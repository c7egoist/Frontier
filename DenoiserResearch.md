# Denoiser research — keeping detail (flakes/glints) without killing performance

**Question:** the current à‑trous denoiser "ruins the detail" — is there a better denoiser that fits
this pipeline, gives same/better quality, and doesn't tank performance?

**Short answer:** you don't need to replace the denoiser — you need to *split the signal it filters*.
Your denoiser is already a solid SVGF‑style variance‑guided à‑trous. The detail loss is a known,
documented consequence of it filtering **one combined radiance channel demodulated by the primary
base colour**, which smears specular/flake highlights, plus the fact that flakes are **sub‑pixel**.
The literature's fix — and the one your own `Docs/V8DenoiserReview.md` already recommends — is
**diffuse/specular separation + correct demodulation + roughness‑aware specular filtering**, evolving
toward **A‑SVGF** (adaptive temporal). All of that is algorithmic and therefore **line‑for‑line
CPU‑mirrorable**, unlike the AI denoisers (NRD/OIDN/DLSS‑RR), which is the decisive constraint here.

---

## 1. What you already have (so we don't reinvent it)

`Engine/Shaders/AtrousDenoise.slang` (+ CPU twin `AtrousDenoiseMirror.cpp`) is **not** a naïve blur.
It is essentially **SVGF's spatial stage** (Schied et al. 2017 [2](https://cg.ivd.kit.edu/publications/2017/svgf/svgf_preprint.pdf)):

- Edge‑avoiding à‑trous, 5 chained levels, 5×5 taps, up to 125×125 support at 5×25 taps/px
  (Dammertz et al. 2010 formulation).
- Three SVGF edge‑stopping weights: **normal** (`^σn`), **depth** (`|∇z|`‑relative), and
  **variance‑guided luminance** (divide the luminance delta by the estimated σ — small‑vs‑noise ⇒
  blur, large‑vs‑noise ⇒ edge, preserved).
- **Variance carried in alpha** and filtered with the square of the colour weights (correct
  propagation), with a 3×3 pre‑filter so one firefly can't declare itself an edge.
- **Albedo demodulation**: the kernel parks primary albedo in `OutputImage`, the filter runs on
  demodulated radiance and re‑applies albedo + tone‑maps on the final level.
- A **RELAX‑style outlier clamp** on extreme log‑luminance before accumulation (firefly guard).
- Temporal accumulation of colour+moments already happens upstream in `ReSTIRViewport.slang`
  (reprojected history, bounded to 32 samples via `ProgressiveDenoise.shared.h`).
- A derived per‑pixel **early‑out** once variance falls below one‑fifth of an 8‑bit step.

So the bones are good. This is roughly what Quake 2 RTX ships
([Q2RTX asvgf.glsl](https://github.com/NVIDIA/Q2RTX/blob/master/src/refresh/vkpt/shader/asvgf.glsl)).

## 2. Why it still eats the flakes (root cause)

Two reasons, both already flagged in your `V8DenoiserReview.md`:

1. **One combined channel, demodulated by *diffuse* base colour.** Finding #3 of your V8 review says
   it directly: the demodulated `mean` "includes diffuse AND specular lighting, lens contribution,
   and weather… Dividing all of these by primary base color is not a physical diffuse‑irradiance
   decomposition… specular reflections, colored metals, fog over texture and lens highlights may be
   distorted or become harder to filter." Flakes are a **specular** signal. Divided by the wrong
   factor and then run through the *same* spatial kernel as smooth diffuse GI, they get blurred —
   on a sphere the normal/depth weights are nearly constant, so only the luminance term protects
   them, and a lone flake highlight looks like noise to that term. This is the same class of bug the
   whole industry hits: NRD/ReLAX users report it too when they *don't* demodulate/split
   ([NVIDIA forum: NRD texture blurring](https://forums.developer.nvidia.com/t/unreal-rtxdi-nrd-texture-blurring/291428)),
   and SVGF's paper is explicit that you must "filter *untextured illumination components* and reapply
   texturing after reconstruction" and, "in case of multilayer materials add the per‑layer albedos"
   [2](https://cg.ivd.kit.edu/publications/2017/svgf/svgf_preprint.pdf).
2. **Flakes are sub‑pixel.** Your V8 review's sparkle row says it: "More light candidates do not
   automatically supersample a subpixel flake normal," and "Texture is not immune to arbitrary
   filtering." A feature below one pixel cannot be distinguished from Monte‑Carlo noise by *any*
   variance‑guided filter; it has to be treated as **known signal**, not reconstructed from samples.

The takeaway: this is a **signal‑decomposition** problem, not a "weak denoiser" problem. Swapping in
a fancier denoiser without decomposing the signal reproduces the same blur (exactly what the NRD/
UE users above see).

## 3. The decisive constraint: your CPU line‑for‑line mirror

Every kernel here has a C++ mirror gated for parity (`AtrousDenoiseMirror.cpp`, the `Check*` gates).
That single invariant orders the options:

- **Algorithmic denoisers (SVGF / A‑SVGF / ReBLUR‑style analytic passes)** are pure compute you can
  mirror in C++. ✅ Fits the doctrine.
- **AI denoisers (NVIDIA NRD is partly heuristic but shipped as a binary lib; Intel OIDN and NVIDIA
  DLSS Ray Reconstruction are CNNs)** cannot be "mirrored line‑for‑line" — the reference would have
  to be the library itself. ✋ Only viable if you add a GPU‑only "quality mode" and relax the parity
  rule for it.

## 4. Recommendation — evolve in place (all mirror‑able)

Ranked by leverage‑per‑effort. Each is an incremental, testable A/B against V8.

### A1 — Split diffuse and specular; demodulate each correctly *(highest leverage)*
Filter **two** channels: diffuse (demodulate by base albedo, as now) and specular (demodulate by the
**specular BRDF / Fresnel factor**, not base colour — cf. NRD's `NRD_MaterialFactors` and the
demodulation discussion in [nvpro vk_denoise_nrd](https://github.com/nvpro-samples/vk_denoise_nrd)).
This is exactly your V8 review's own recommendation ("Longer‑term, diffuse/specular separation…") and
the SVGF paper's per‑layer‑albedo guidance [2](https://cg.ivd.kit.edu/publications/2017/svgf/svgf_preprint.pdf).
Q2RTX goes further and runs **separate denoisers per channel** (HF diffuse via A‑SVGF, LF indirect via
SH blur, SPEC via a temporal‑only filter) precisely because "all the spatial filters… did not provide
adequate image quality on normal‑mapped surfaces"
([Q2RTX asvgf.glsl](https://github.com/NVIDIA/Q2RTX/blob/master/src/refresh/vkpt/shader/asvgf.glsl)).
Cost: ~2× filter buffers/dispatches, but each channel is cheaper and the specular one can be tiny.

### A2 — Roughness‑aware specular filtering
Scale the specular filter radius by roughness (near‑mirror ⇒ ~no blur; rough ⇒ blur). This is the core
idea in ReBLUR/ReLAX (`roughnessFraction`, `lobeAngleFraction`) [3](https://deepwiki.com/NVIDIA-RTX/NRD/3.1-reblur).
Flake highlights are effectively low‑roughness lobes, so this keeps them sharp while still cleaning
rough GI. Add roughness as a fourth edge‑stopping weight on the specular channel only. Fully mirror‑able.

### A3 — Upgrade the temporal stage to A‑SVGF (adaptive accumulation)
Your temporal reuse uses a bounded fixed history. SVGF's fixed α trades lag for stability and
"introduces temporal blur such that… glossy highlights leave a trail." A‑SVGF (Schied et al. 2018
[4](https://cg.ivd.kit.edu/publications/2018/adaptive_temporal_filtering/adaptive_temporal_filtering.pdf))
replaces the fixed α with a **per‑pixel, per‑frame** factor driven by a temporal‑gradient estimate,
dropping stale history at moving highlights and *raising* effective spp on static pixels — which lets
the spatial filter **shrink**, preserving more detail. This is the single biggest "same perf, better
detail" win and is what Q2RTX uses in production. It also fixes the in‑place history hazard your V8
review flags as high‑priority (Finding #1) if you adopt immutable ping‑pong history at the same time.

### A4 — Treat deterministic flakes as *known signal*, not noise *(the flake‑specific fix)*
Because System B flakes are **object‑locked and deterministic** (hash‑placed + footprint LOD, see
`FlakeVerification/ReSTIR/`), the resolved flake highlight can be **demodulated out before filtering
and multiplied back after** (fold it into the guide the way albedo/texture detail is), or gated by a
per‑pixel **flake mask** that zeroes the filter there. Then the flake survives at full sharpness and
only the surrounding MC noise is filtered. This leans on the same "reapply detail after
reconstruction" principle SVGF uses for textures [2](https://cg.ivd.kit.edu/publications/2017/svgf/svgf_preprint.pdf),
and on ReSTIR's temporal stability so the flake needs no reconstruction at all. This is the most
direct answer to "the denoiser ruins the flakes."

### A5 — Fix the two correctness bugs your V8 review already found
`(#2)` the RGBA8 albedo‑floor round‑trip (~1.96% dark‑channel attenuation) and `(#3)` whole‑radiance
demodulation. A1 subsumes #3; #2 is a one‑line "clamp before quantize." These aren't about noise but
they *change the numbers the edge‑stops see*, so fix them before tuning σ.

**Do NOT** just widen σ or add a 5th level on lower tiers to "clean more" — your V8 review measured
that as a detail‑vs‑hot‑pixel tradeoff, not a free win.

## 5. External libraries — only with a GPU‑only "quality mode" (they break the mirror)

| Option | Fit / quality | Why it's a caveat here |
|---|---|---|
| **NVIDIA NRD** — ReBLUR (diffuse+spec), ReLAX (built for ReSTIR DI/GI signals), SIGMA (shadows) | Purpose‑built for **ReSTIR DI/GI at low spp**, cross‑platform **Vulkan**+D3D12, free, battle‑tested; ReLAX "preserves lighting details" and is what RTXDI uses [6](https://developer.nvidia.com/nvidia-rt-denoiser) [8](https://blogs.nvidia.com/blog/what-is-denoising/). Has `enableAntiFirefly`. | Shipped as a **binary library**, not source you'd mirror line‑for‑line; still **requires** you to demodulate + split diffuse/spec + pass hit‑distance + motion vectors [4](https://github.com/nvpro-samples/vk_denoise_nrd) — i.e. you must do §4 A1 anyway. Best as a drop‑in for a GPU‑only path. |
| **Intel OIDN 2.x** — AI, Apache‑2.0 **open source** | Excellent **detail retention** with albedo+normal guides; **cross‑vendor GPU + CPU**; temporal denoising + a new lighter network are in development [1](https://community.intel.com/t5/Blogs/Tech-Innovation/Client/Visual-Efficiency-for-Intel-s-GPUs/post/1697911). Uniquely, because it also runs **on CPU**, OIDN‑CPU could *be* your reference and OIDN‑GPU the device path — same code both sides, matching your GPU+mirror doctrine without hand‑porting. | It's a **CNN**: convolutions dominate frame time and it's "**not intended for real‑time use in games** the way DLSS/XeSS are" [2](https://wallisc.github.io/rendering/2024/06/06/Intro-to-GPU-ML-Denoising.html) — real‑time only on high‑end GPUs. External dependency; not the sub‑ms cost of your à‑trous. Good for a **reference/look‑dev** mode. |
| **NVIDIA DLSS Ray Reconstruction** | Best‑in‑class quality; replaces hand‑tuned denoisers with a trained model. | **NVIDIA RTX‑only, closed**, and NVIDIA states "integrating RR into third‑party solutions is not in our scope" [10](https://forums.developer.nvidia.com/t/dlss-ray-reconstruction-nvrtx-5-3/266440). Not integrable or mirror‑able for this engine — **rule out**. |

## 6. Performance framing

- Your à‑trous is already ~5×25 taps/px + cheap temporal reuse — sub‑ms to low‑ms at your resolutions.
- §4 A1 (split) ≈ 2× filter cost but each channel is cheaper (specular is tiny/temporal‑only) → still
  low‑ms. A2/A4 are near‑free weight changes. A3 adds a gradient‑reprojection pass (a few taps/px) and
  **pays for itself** by shrinking the spatial filter. Net: **same order of magnitude, better detail.**
- **NRD** typically a few ms at 1080p. **OIDN** is convolution‑bound (tens of ms except on top GPUs)
  [2](https://wallisc.github.io/rendering/2024/06/06/Intro-to-GPU-ML-Denoising.html). So for
  "quality without killing perf," the algorithmic evolution wins on your hardware target.

## 7. Fireflies are a *separate* axis from detail
No denoiser reliably removes fireflies without also removing detail — the standard practice is to
attack them at the source with **radiance/path clamping** (UE "Max Path Intensity", Blender "Clamp
Indirect") [1](https://dev.epicgames.com/documentation/en-us/unreal-engine/path-tracer-in-unreal-engine)
plus an **anti‑firefly pre‑pass** (NRD's `enableAntiFirefly`; SVGF's outlier clamp, which you already
have). The real fix for *your* fireflies is the **bounce‑MIS gap** in `Frontier-RenderingReview.md`
(A/B flag `--restir-bounce-mis`), not the denoiser. Keep the two problems decoupled: clamp/MIS for
fireflies, §4 decomposition for flakes.

## 8. Suggested roadmap (each step is an A/B against V8, and mirror‑able)
1. **A5** correctness fixes (albedo floor, demodulation math) — cheap, unblocks clean measurement.
2. **A1** diffuse/specular split with correct per‑lobe demodulation — biggest detail win.
3. **A4** flake‑as‑guide (mask or demodulate the deterministic flake highlight) — rescues the flakes.
4. **A2** roughness‑aware specular edge‑stop — keeps glossy/mirror + flakes sharp.
5. **A3** A‑SVGF adaptive temporal + immutable ping‑pong history (also closes V8 Finding #1) — lets
   the spatial filter shrink for free detail.
6. *(optional)* Add a GPU‑only **quality mode** wired to **NRD ReLAX** (ReSTIR‑native) or **OIDN**
   (open, CPU+GPU), gated out of the parity mirror.

## Sources
- SVGF — Schied et al. 2017 [2](https://cg.ivd.kit.edu/publications/2017/svgf/svgf_preprint.pdf)
- A‑SVGF / Gradient Estimation — Schied et al. 2018 [4](https://cg.ivd.kit.edu/publications/2018/adaptive_temporal_filtering/adaptive_temporal_filtering.pdf)
- Q2RTX per‑channel denoising in practice [7](https://github.com/NVIDIA/Q2RTX/blob/master/src/refresh/vkpt/shader/asvgf.glsl)
- NVIDIA NRD (ReBLUR/ReLAX/SIGMA) [6](https://developer.nvidia.com/nvidia-rt-denoiser), [8](https://blogs.nvidia.com/blog/what-is-denoising/), ReBLUR pipeline [3](https://deepwiki.com/NVIDIA-RTX/NRD/3.1-reblur)
- NRD Vulkan integration + demodulation [4](https://github.com/nvpro-samples/vk_denoise_nrd)
- Evidence denoisers over‑blur without demodulation [7](https://forums.developer.nvidia.com/t/unreal-rtxdi-nrd-texture-blurring/291428)
- Intel OIDN 2 real‑time GPU + temporal roadmap [1](https://community.intel.com/t5/Blogs/Tech-Innovation/Client/Visual-Efficiency-for-Intel-s-GPUs/post/1697911); OIDN is CNN/heavy, not for realtime games [2](https://wallisc.github.io/rendering/2024/06/06/Intro-to-GPU-ML-Denoising.html)
- DLSS Ray Reconstruction closed / not third‑party‑integrable [10](https://forums.developer.nvidia.com/t/dlss-ray-reconstruction-nvrtx-5-3/266440)
- Firefly clamping practice [1](https://dev.epicgames.com/documentation/en-us/unreal-engine/path-tracer-in-unreal-engine)

*Grounded in this repo: `Engine/Shaders/AtrousDenoise.slang`, `ProgressiveDenoise.shared.h`,
`Exhibits/Workbench/Materials/AtrousDenoiseMirror.cpp`, and `Docs/V8DenoiserReview.md`.*
