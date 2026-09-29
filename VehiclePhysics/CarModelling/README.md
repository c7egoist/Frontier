# CarModelling — low-poly cars for Project-Tractrix, authored in SolidArc

This directory vendors the **SolidArc** parametric NURBS/B-rep modelling tool (from
`streamlinkinbox/Frontier@arena/01a0ce66-frontier`) and uses it to model low-poly car bodies for the Project-Tractrix
vehicle (Thread M, Phase 3). SolidArc is a standalone, dependency-free C++20 console modeller: geometry is authored by
text commands / `.scr` scripts, solids are B-reps of trimmed NURBS faces, and visuals are written as PNG proofs by its
software rasteriser (no GUI, no GPU required here).

## Layout
- `SolidArc/` — the vendored tool source (kernel + console + presentation + interaction + docs + plans). The 200 MB
  baseline `Proofs/` gallery and the upstream `.patch` were intentionally **not** vendored (they are references, not the
  tool). Upstream build/verify gate: `SolidArc/Tools/Build/CheckSolidArc.sh`.
- `BuildConsole.sh` — minimal build of just the console binary (no CMake, no verifier suite). `./BuildConsole.sh [out]`.
- `Cars/` — the `.scr` modelling scripts for each car (one per reference image).
- `Proofs/` — rendered preview PNGs for picking the best car.
- `Meshes/` — exported meshes + materials (added once a car is chosen).

## Build & render
```bash
VehiclePhysics/CarModelling/BuildConsole.sh /tmp/sa-build
/tmp/sa-build/SolidArc --continue --proofs VehiclePhysics/CarModelling/Proofs \
    VehiclePhysics/CarModelling/Cars/MuscleCar74.scr
```

## Modelling approach (why box + chamfer)
SolidArc's Boolean support is intentionally *bounded* (robust for coincident axis-aligned boxes; general
box-minus-cylinder wheel-arch cuts refuse transactionally rather than guessing). So the low-poly bodies are shaped with
the robust, exact operations: **`box`** primitives, **`chamfer`** for every slope (raked nose, windshield, fastback/
hatch, rocker bevels), and **`cylinder`** wheels/lights. Per-body colour for the previews uses the `matcap` studios
(`plastic-blue`, `plastic-white`, `pearl`, `carbon`, `steel`, `chrome`, …). Final engine materials (clearcoat-with-flakes
paint, rubber, glass, chrome, emissive) are bound at mesh-export time — see `Meshes/` once a car is selected.
