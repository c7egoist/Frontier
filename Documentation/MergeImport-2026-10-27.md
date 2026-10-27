# Merge import — 2026-10-27

🧩 Record of merging `eosclient0001-rgb/Frontier@arena/672a179a-frontier` (98fbc76) with
`SultanAladin/Frontier@arena/4014756b-frontier` (7731a12) into this repository. Source-complete:
all code and documents; binary payload excluded under the rule below and restorable from the two
origin repositories.

## Lineage (measured, not assumed)

| Fact | Evidence |
|---|---|
| Common base tree | sultan `5626385` "Initial commit" — 0 file differences vs eos `d878111` "Initial commit" tree |
| eos lineage | 12 commits after base: VehiclePhysics, LightCompute, NightSky, celestial/reference rendering |
| sultan lineage | 261 commits after base: TextureStudio, GPU bake field, Texture Paint workspace |
| Union paths | 4,372 — identical 3,522 · eos-only 726 · sultan-only 61 · divergent 63 |

## Divergent 63 — how each was decided

Blob archaeology (a tip blob found in the other lineage's history = that side is older), then
`git merge-file` against the closest sultan-history base blob per file.

| Outcome | Count | Files (abridged; full table in git history of this import) |
|---|---|---|
| take-sultan | 22 | `PanelDockspace.cpp`, `VectorAuthoring*`, `VectorAuthoringControls*`, `WindowsWorkspaces.yml`, TextureStudio headers, `TextureStudioApplication.cpp` |
| take-eos | 11 | `.gitignore`, `Docs/*`, `DistanceField`, `ReservoirSampling`, `README.md` |
| auto-merged, 0 conflicts | 22 | `WindowsApplication.cpp`, `SurfaceMaterial*`, atmosphere/celestial/cloud/fog models, TextureStudio panels `.cpp` |
| hand-resolved | 8 | see below |

Hand resolutions (16 hunks):

| File | Side kept per hunk | Reason |
|---|---|---|
| `CLAUDE.md` (1) | eos | eos appended the 2026-10-25/26 checkpoints; sultan side empty |
| `Documentation/Tracker.md` (1) | sultan | sultan 2026-10-26/27 bake + Texture Paint entries; eos side empty there (eos entries sit above, merged clean) |
| `CMakeLists.txt` (1) | sultan | TextureStudio `*Evidence` executable block; plus 5 dropped target blocks re-grafted verbatim with a 📝 marker (`VectorAuthoringEditingValidation`, `LayerDragReorder{Validation,Evidence}`, `DockCycleRecoveryValidation`, `FrameFaultRecoveryValidation`) |
| `UI/TextureStudio/StampWorkspacePanel.h` (1) | sultan | `ActivateBaking`/`ActivateTexture` callbacks used by the merged `.cpp` |
| `Frontier/Engine/Rendering/ReferenceRenderer.cpp` (8) + `.h` (1) | eos | eos is newer (2026-10-27 vs 2026-10-22) and strictly extends: lunar bounce, reservoirs, celestial beams, `ReferenceSurfaceSample` |
| `Engine/Render/ScatteringSequence.h` (2) + `Shader/ScatteringEvaluation.slang` (1) | eos | Energy-bounded sheen (`EvaluateSheenEnergyScale`) + diffuse transmission refine sultan's additive lobe; matches `MaterialEnergyValidation` (same `1/max(R²,1e-3)` bound); C++ and Slang twins kept consistent |

Verification of the merged `CMakeLists.txt`: target/test sets checked against both tips —
union complete (70 sultan + 50 eos − overlap = merged set), every referenced source path exists.

## Excluded payload (restorable)

Rule: media extensions (`png gif jpg jpeg pfm ppm bin exr wav mp4 zip spv ttf otf 7z`) or any
single file > 1 MiB. 833 files, ≈205 MB, including `EngineContent/MaterialArchives/TextureStudio/Textures/`
(267 PNG, 78 MB), 15 PatternArchives starter `.vector.toml` > 1 MiB, exhibit evidence images/GIFs,
`Exhibits/NightSky/Data/Hipparcos8.csv`, 3 monolithic evidence `.html`. Kept: all `.material`,
`Library.toml`, icons, every source/document ≤ 1 MiB.

Restore any excluded path from the origin repositories, e.g.:

```sh
git remote add eos https://github.com/eosclient0001-rgb/Frontier.git
git fetch eos arena/672a179a-frontier
git checkout FETCH_HEAD -- EngineContent/MaterialArchives/TextureStudio/Textures
```

## Deliberate changes on top of the merge

- `.github/workflows/networking-windows.yml`: upstream push trigger (`arena/**` + networking paths)
  disabled in this repository — the import contains those paths and must not start an unapproved
  Actions run (`CLAUDE.md`). `workflow_dispatch` retained.
- `CMakeLists.txt`: 5 re-grafted target blocks (above).

## Not merged here

- Full 263 MB trees (binary payload) — exceeds this workspace's delivery cap; canonical copies
  remain in the two origin repositories.
- The 3 MB `01a1631b-*.patch` upload at this repository's root predates the import and is left
  untouched; the imported source supersedes it.
