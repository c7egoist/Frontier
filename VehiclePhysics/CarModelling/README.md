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
- `Cars/` — `.scr` modelling scripts, one per car (the deliverable): `MuscleCar74.scr` (blue fastback),
  `Sedan.scr` (pearl notchback), `Hatchback.scr` (red hot hatch). Each script models the car, renders its proof, and
  exports its mesh.
- `Proofs/` — rendered preview PNGs (`muscle.png`, `sedan.png`, `hatch.png`) and the `AllCars.png` contact sheet.
- `Meshes/` — exported `<Car>.obj` + `<Car>.mtl` + `<Car>.materials.json` for each car (default = sharp/duplicated
  faces). `MuscleCar74_welded.obj` is a welded (smooth) export demonstrating the `--weld` toggle.

## Material system + exporter (Frontier additions to SolidArc)
SolidArc's matcap studios *are* the material system. This checkout extends them for a racing game and adds mesh export:

- **Per-face materials.** `matcap <fig> <studio> --face=i,j,…` assigns a studio to individual faces (default is still the
  whole figure; `--face=all` clears overrides). Stored on `SceneFigure::FaceMatcap`, honoured by the preview renderer,
  and written per-face by the exporter — so any panel's material is trivially changed later.
- **Car/engine studios added** (indices 10–13): `rubber` (matte tyre), `glass` (dark tinted, glossy), `headlight`
  (emissive white), `taillight` (emissive red), alongside the originals (steel chrome gold copper plastic-white/-red/-blue
  clay pearl carbon). `matcap list` prints all 14.
- **`export <path.obj> [--chord=t] [--weld[=eps]]`** tessellates every solid (via the kernel's exact `TessellateFace`)
  to a Wavefront **OBJ**, with faces grouped by their per-face material as `usemtl` groups.
  - **Duplicated vs welded (edge sharpness) is a toggle.** By **default** coincident vertices are **kept duplicated** so
    every face carries its own normals and the low-poly creases stay crisp (the intended look). Passing **`--weld`**
    merges vertices that share a position within each body and averages their normals — producing smooth, shared
    topology with a smaller vertex count (e.g. MuscleCar74: 4609 → 3065 verts). `--weld=eps` sets the merge tolerance
    in metres (default `1e-5`).
  It also writes:
  - a portable **`.mtl`** (Kd/Ks/Ns/d + a `# frontier <Material>` tag per studio) for any OBJ viewer, and
  - an editable **`.materials.json`** manifest binding each studio to the real **Frontier engine material** — paints →
    **System B `AutomotiveFlakePaint`** (clear-coat + metallic flakes), tyres → `Rubber_Tyre`, windows → `Glass_Tinted`,
    trim → `Metal_Chrome`/`Metal_Steel`, lights → `Emissive_Headlight`/`Emissive_Taillight`, splitters/wings → `CarbonFibre`.
  Edit the JSON (or reassign `usemtl` groups) to change any material without re-modelling.

## The three cars
The reference images were style targets only; these are original low-poly designs, each a distinct body class:
1. **MuscleCar74** — blue fastback muscle car: long hood, raked windshield, fastback roofline, raised fender haunches,
   tinted windshield/backlight + side DLO glass, chrome hub caps, emissive head/taillights.
2. **Sedan** — pearl three-box notchback saloon: long wheelbase, upright greenhouse, separate trunk volume.
3. **Hatchback** — red compact hot hatch: short overhangs, steep tailgate, tall greenhouse over the rear axle.

## Build & render
```bash
VehiclePhysics/CarModelling/BuildConsole.sh /tmp/sa-build
/tmp/sa-build/SolidArc --continue --proofs VehiclePhysics/CarModelling/Proofs \
    VehiclePhysics/CarModelling/Cars/MuscleCar74.scr
```

## Modelling approach (real CAD: silhouette extrude + boolean wheel arches)
Each body is built the way a CAD user would, using SolidArc's exact NURBS/B-rep operations:

1. **Side silhouette → solid.** A closed `polyline` on the `xz` workplane traces the car's profile (nose, hood, cowl,
   windshield, roof, backlight, deck, haunches, tail); `extrude` sweeps it across the car's width into a solid.
2. **Wheel arches by boolean subtraction.** Two full-width `cylinder` tunnels (one per axle) are combined with
   `boolean union` into a single cutter, and one `boolean subtract` carves both arches — leaving a closed, manifold
   solid (χ=2, genus 0). The silhouette's beltline is kept **above** each arch top across the wheel footprint, so the
   tunnels never sever the body, and the raised fender haunches over the axles read as real arches.
3. **No intersecting geometry.** The tyres (`cylinder`, `rubber`) sit **concentrically inside** the arches with radial
   clearance and top clearance below the fender band — they do **not** intersect the body, which matters for the Jolt
   collision pass. Hub caps, side glass and lights are placed **flush against or just outside** the body surface, again
   without interpenetration.
4. **Per-face materials.** Glass is assigned to the windshield/backlight (and tailgate) faces of the single solid via
   `matcap … --face=…`; separate parts get rubber / chrome / emissive studios. Final engine materials
   (System-B `AutomotiveFlakePaint`, `Rubber_Tyre`, `Glass_Tinted`, `Metal_Chrome`, emissive) are bound in the exported
   `.materials.json`.

> **Kernel notes (robustness).** Booleans in this kernel want **exactly one body per side**, so multiple cutters are
> `union`ed first and subtracted once (chaining subtracts onto already-curved faces, or blind pockets whose end-cap lands
> inside the body, are unreliable — they can flip inside/outside classification). Through-cutters (both caps outside the
> body) subtract cleanly; nudging a cutter to non-round coordinates avoids seam/edge singularities.
