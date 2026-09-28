# RendererBacklog

The owner's pre-games list of remaining renderer work, turned into `Docs/Roadmap.md` rows.

- `SectionE_OwnerList.md` — readable copy of the new **Section E** (rows #29–#38 + the ReSTIR-for-surfel-GI
  decision + adjacent tracked items).
- `patches/Roadmap_SectionE_OwnerList.patch` — appends Section E to `Docs/Roadmap.md` in Frontier; applies
  clean against `main` (`git apply` from the Frontier repo root).

## The list at a glance
| # | Item | Status found in code |
|---|------|----------------------|
| 29 | Materials verified through the **multi-slab** (layered) path | single slab exists; multi-slab layering deferred (#10) |
| 30 | **Flakes** on the non-raytraced paths | proven on RT; unverified on plain-raster / surfel-GI |
| 31 | Wire the **hardware-RT** traversal (RT cores) | capability probe done; traversal still software CWBVH |
| 32 | **Sky + cloud** bake | sky dome bake partly exists (#26); clouds still marched |
| 33 | **Sun** bake | sun inpainted out of dome today; not baked |
| 34 | **Clamp max star size** (no big-circle stars) | lower floor exists, **no upper clamp** — the bug |
| 35 | Fix the **fog** | FogModel + WeatherMedia present; defect to pin |
| 36 | **Scale / quality tiers** verified | 5-tier FidelityClassifier exists; verify end-to-end |
| 37 | Fix the **wind** (clouds look wrong) | wind→cloud-noise coupling to audit |
| 38 | **Cross-target** verification ("test both") | needs a device; overlaps GPU verification (#11) |

## Decision captured
**ReSTIR for the surfel GI?** — Yes for **reflections** (that is roadmap #27, the cheap sub-ms reuse pass and the
largest measured residual class); **no** as a "denoiser" (ReSTIR reduces sampling variance, it does not replace the
SVGF-family denoiser already chosen in `../DenoiserResearch.md`). Keep #27 (reflections) separate from #5 (full
indirect coverage, which measurement says to defer). Details in `SectionE_OwnerList.md`.
