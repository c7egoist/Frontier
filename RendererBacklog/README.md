# RendererBacklog

The owner's pre-games list of remaining renderer work, turned into `Docs/Roadmap.md` rows.

- `SectionE_OwnerList.md` — readable copy of the new **Section E** (rows #29–#38 + the ReSTIR-for-surfel-GI
  decision + adjacent tracked items).
- `patches/Roadmap_SectionE_OwnerList.patch` — appends Section E to `Docs/Roadmap.md` in Frontier; applies
  clean against `main` (`git apply` from the Frontier repo root).

## The list at a glance
| # | Item | Status found in code |
|---|------|----------------------|
| 29 | Materials verified through the **multi-slab** (layered) path | ⚠️ CPU-proven: `shadeStack` layered evaluator, grid resolves (RMSE ≈1.6%) — `MaterialGrid/MultiSlab_Compare.png` |
| 30 | **Flakes** on the non-raytraced paths | ⚠️ DONE on CPU: sun disc + per-flake facet normals → sparkle on all 3 modes — `MaterialGrid/GlintSheet_Modes.png` |
| 31 | Wire the **hardware-RT** traversal (RT cores) | capability probe done; traversal still software CWBVH |
| 32 | **Sky + cloud** bake | sky dome bake partly exists (#26); clouds still marched |
| 33 | **Sun** bake | sun inpainted out of dome today; not baked |
| 34 | **Clamp max star size** (no big-circle stars) | lower floor exists, **no upper clamp** — the bug |
| 35 | Fix the **fog** | FogModel + WeatherMedia present; defect to pin |
| 36 | **Scale / quality tiers** verified | 5-tier FidelityClassifier exists; verify end-to-end |
| 37 | Fix the **wind** (clouds look wrong) | wind→cloud-noise coupling to audit |
| 38 | **Cross-target** verification ("test both") | needs a device; overlaps GPU verification (#11) |

## Progress (2026-09-28)
Three items advanced this session — all in `RaytraceToggle/`, each a device/GPU-run away from shipped:
- **#30 flakes on non-RT paths** — DONE on the CPU mirror (sun disc + per-flake facet normals). `MaterialGrid/GlintSheet_Modes.png`.
- **#29 materials × multi-slab** — CPU-proven layered `shadeStack`; all 15 families resolve (RMSE ≈ 1.6% vs flat). `MaterialGrid/MultiSlab_Compare.png`.
- **#27 sky as a reflection reservoir candidate** — prototyped & measured: **RMSE 0.236 → 0.093, ≈ 2.53× lower error at ~1 sample**. `ReflectionReservoir/`.

## Decision captured
**ReSTIR for the surfel GI?** — Yes for **reflections** (that is roadmap #27, the cheap sub-ms reuse pass and the
largest measured residual class); **no** as a "denoiser" (ReSTIR reduces sampling variance, it does not replace the
SVGF-family denoiser already chosen in `../DenoiserResearch.md`). Keep #27 (reflections) separate from #5 (full
indirect coverage, which measurement says to defer). Details in `SectionE_OwnerList.md`.
