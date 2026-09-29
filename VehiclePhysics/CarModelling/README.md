# CarModelling — low-poly cars for Project-Tractrix, authored in SolidArc

This directory vendors the **SolidArc** parametric NURBS/B-rep modelling tool (from
`streamlinkinbox/Frontier@arena/01a0ce66-frontier`) and uses it to model low-poly car bodies for the Project-Tractrix
vehicle (Thread M, Phase 3). SolidArc is a standalone, dependency-free C++20 console modeller: geometry is authored by
text commands / `.scr` scripts, solids are B-reps of trimmed NURBS faces, and visuals are written as PNG proofs by its
software rasteriser (no GUI, no GPU required here).

## Layout
- `SolidArc/` — the vendored tool source (kernel + console + presentation + interaction + docs + plans), **with local
  Frontier additions** (see "Material system + exporter" below). The 200 MB baseline `Proofs/` gallery and the upstream
  `.patch` were intentionally **not** vendored (references, not the tool). Upstream gate: `SolidArc/Tools/Build/CheckSolidArc.sh`.
- `BuildConsole.sh` — minimal build of just the console binary (no CMake, no verifier suite). `./BuildConsole.sh [out]`.
- `Cars/` — `.scr` modelling scripts. **Racing cars (the deliverable):** `RaceGT.scr`, `RaceOpenWheel.scr`,
  `RaceRally.scr`. Reference-style studies (early, replicate the sample images): `MuscleCar74.scr`, `Sedan.scr`, `Hatchback.scr`.
- `Proofs/` — rendered preview PNGs. `AllRacingCars.png` is the contact sheet of the three racing designs.
- `Meshes/` — exported `<Car>.obj` + `<Car>.mtl` + `<Car>.materials.json` for each racing car.

## Material system + exporter (Frontier additions to SolidArc)
SolidArc's matcap studios *are* the material system. This checkout extends them for a racing game and adds mesh export:

- **Per-face materials.** `matcap <fig> <studio> --face=i,j,…` assigns a studio to individual faces (default is still the
  whole figure; `--face=all` clears overrides). Stored on `SceneFigure::FaceMatcap`, honoured by the preview renderer,
  and written per-face by the exporter — so any panel's material is trivially changed later.
- **Car/engine studios added** (indices 10–13): `rubber` (matte tyre), `glass` (dark tinted, glossy), `headlight`
  (emissive white), `taillight` (emissive red), alongside the originals (steel chrome gold copper plastic-white/-red/-blue
  clay pearl carbon). `matcap list` prints all 14.
- **`export <path.obj>`** tessellates every solid (via the kernel's exact `TessellateFace`) to a Wavefront **OBJ**, with
  faces grouped by their per-face material as `usemtl` groups. It also writes:
  - a portable **`.mtl`** (Kd/Ks/Ns/d + a `# frontier <Material>` tag per studio) for any OBJ viewer, and
  - an editable **`.materials.json`** manifest binding each studio to the real **Frontier engine material** — paints →
    **System B `AutomotiveFlakePaint`** (clear-coat + metallic flakes), tyres → `Rubber_Tyre`, windows → `Glass_Tinted`,
    trim → `Metal_Chrome`/`Metal_Steel`, lights → `Emissive_Headlight`/`Emissive_Taillight`, splitters/wings → `CarbonFibre`.
  Edit the JSON (or reassign `usemtl` groups) to change any material without re-modelling.

## The three racing cars
The reference images were style targets only; these are original low-poly **racing** designs (box + chamfer + cylinder):
1. **Race1_GT** — low, wide GT endurance coupe: flake-red paint, tinted glass canopy, carbon rear wing + front splitter,
   fat rubber slicks on chrome hubs, emissive head/taillights.
2. **Race2_OpenWheel** — flake-blue formula single-seater: tapered nose, carbon front/rear wings, headrest + airbox,
   four exposed rubber tyres.
3. **Race3_Rally** — pearl rally hatch: raised ride height, carbon roof spoiler + front light bar, glass greenhouse,
   chunky rubber tyres on steel hubs, emissive lights.

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
