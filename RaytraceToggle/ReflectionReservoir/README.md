# Reflection reservoir — ReSTIR "sky as a candidate" for glossy reflections (roadmap #27)

The tree's own roadmap named the **sky / glass-specular class** as the largest *measured* residual variance
(§14.5/§14.6). This is the cheap ReSTIR extension that targets it — **reflection reuse** — and the CPU proof that it
pays. It is not a new system: it reuses the reservoir + RIS + spatial-merge machinery ReSTIR already has, applied to
the glossy reflection lobe instead of the diffuse light pool, and it adds the **sun/sky as an explicit reservoir
candidate** so bright environment features stop being found only by luck.

## What it does
- **RIS** with `M` candidates per pixel, drawn from two sources: half **BRDF (GGX)** samples, half **sun/sky** samples
  (the new candidate). Each is weighted by `p̂/p_mix` under a balance-heuristic MIS pdf.
- **Spatial reuse** over `K` neighbours, each neighbour's stored reflection direction **reweighted to the current
  pixel's** BRDF/geometry (the shift is trivial for a shared environment) — the standard ReSTIR spatial merge, with a
  bounded `M` clamp (mirrors the temporal M cap). On a static frame this also stands in for temporal reuse.
- Final estimate `F(y)·W`, `W = wsum/(M·p̂(y))`.

## Measured result (`ReflectReSTIR_Compare.png`)
Glossy floor, roughness ramping near→far, under a sky with a bright sun disc — exactly the specular-sky variance class.

| Estimator | RMSE vs 512-spp reference |
|---|---|
| Baseline: 1-spp GGX BRDF sampling | **0.236** |
| ReSTIR: RIS(8) + sky candidate + 3× spatial(5) | **0.093** |

**≈ 2.53× lower error at ~1 effective sample.** Visually the baseline is a firefly storm (the bright sun is hit only
by chance); the reservoir image is smooth and tracks the reference. The extra cost is a few cheap reuse passes over a
one-sample reservoir — sub-millisecond class on GPU, because it reuses code that already exists.

## Recommendation
Do this (#27). Keep it **separate** from #5 (full indirect coverage / replay+shift), which measurement says to defer.
And note ReSTIR here is variance reduction at the *sampling* stage — it *feeds* the SVGF-family denoiser
(`../../DenoiserResearch.md`), it does not replace it.

## Reproduce
```bash
g++ -O2 -std=c++17 -pthread ReflectReSTIR.cpp -o reflectrestir
./reflectrestir --w 640 --h 400 --M 8 --spatial 3 --neighbors 5 --ref 512
```
