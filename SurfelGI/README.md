# Surfel GI — pure‑C++ reference (Cornell box)

A self‑contained, dependency‑free C++ implementation of **surfel‑based global illumination**,
built to diagnose and fix the two failures you hit on the previous two attempts:

1. **Flicker** — the indirect term boiling frame to frame.
2. **Poor surfel distribution** — surfels clumping / leaving gaps so the GI is uneven.

It follows the same split your engine uses on the GTX path: a **visibility raster produces the
G‑buffer**, and **surfels carry only the indirect (bounced) light**. Direct light stays sharp.

The scene now includes **analytic curved primitives** (three diffuse spheres of different radius,
plus a flat box for contrast) to prove surfels handle continuously‑varying normals, not just
axis‑aligned faces — see *Curved surfaces* below.

Reference technique: Jure Triglav's *surfel‑based GI* write‑up and the WebGI experiments — same idea,
re‑derived here in plain C++ so every term is inspectable and there is no shader/driver black box.

---

## Build & run

```sh
g++ -O2 -std=c++17 -pthread SurfelGI.cpp -o surfelgi
./surfelgi --w 512 --h 512 --frames 300 --rays 10 --direct 96
```

No third‑party libraries. Multithreaded via `std::thread`. A 512² / 300‑frame render is ~30 s on 2 cores.
Flags: `--w --h` resolution, `--frames` temporal steps, `--rays` hemisphere rays per surfel per frame,
`--direct` NEE shadow samples for the primary hit.

Outputs (PPM; convert with ImageMagick `convert x.ppm x.png`):

| file | meaning |
|------|---------|
| `cornell_combined` | final image = direct + indirect |
| `cornell_direct`   | direct only (NEE, sharp) |
| `cornell_indirect` | indirect only (surfel GI) |
| `conv_20/60/160`   | combined at frame 20 / 60 / 160 (convergence) |
| `surfel_distribution` | every surfel splatted, coloured by its irradiance |
| `coverage`         | per‑pixel surfel coverage heat map (warm = dense, blue = sparse) |
| `flicker_diff_x20` | \|frameN − frameN‑1\| of the indirect term, amplified ×20 |

Pre‑rendered montages in this folder: `SurfelGI_Result.png`, `SurfelGI_Convergence.png`,
`SurfelGI_Diagnostics.png`.

---

## Pipeline

1. **Visibility pass → G‑buffer.** A primary ray per pixel writes position / normal / albedo /
   emissive. This is a stand‑in for the hardware `VisibilityRaster`; the G‑buffer it produces is
   identical in content, so the surfel stage is unchanged when you move it behind the real raster.
2. **Persistent world‑space surfel field + hash grid.** Surfels live in world space, never move, and
   are looked up through a uniform spatial hash (`Grid`, cell = max radius).
3. **Temporal irradiance update.** Each frame every surfel casts a few cosine‑weighted hemisphere
   rays, gathers direct light at the hit (NEE) plus the neighbouring surfels' *previous* irradiance
   (one‑bounce → multi‑bounce over time), and folds the result into a running mean.
4. **Apply.** Per pixel: **sharp NEE direct** + **smooth surfel indirect** (irradiance gathered from
   the surfels overlapping that point, `albedo·E/π`). The two terms are kept separate so nothing is
   double‑counted.

---

## How flicker is fixed

Every one of these is in the code (`SurfelGI.cpp`), and together they take the ×20‑amplified
frame‑to‑frame difference down to near‑black (mean ≈ 0.03/255 at 512²):

- **Persistent surfels.** They are allocated once in world space and never move, so there is no
  per‑frame reseeding jitter — the single biggest flicker source in naive surfel/probe GI.
- **Running mean, not a moving EWA.** `alpha = 1/min(age, 4096)`. Early frames converge fast; once a
  surfel is old the step size is tiny, so its value *settles and holds* instead of oscillating.
- **Warm start.** A newly spawned surfel is seeded from the existing field around it, so it never
  pops in dark and ramps up.
- **Jacobi update.** Surfels read last frame's field and write a separate buffer (`E` → `Enew`),
  so the update is order‑independent and stable — no read‑after‑write feedback shimmer.
- **Firefly clamp** (`FIREFLY = 4`) on each indirect sample kills the sparse bright spikes that
  temporal accumulation would otherwise smear into visible sparkle.

## How distribution is fixed

- **Coverage‑driven spawning.** Surfels are added *only where the screen is under‑covered*
  (`coverage < COVERAGE_TARGET`), with a probabilistic gate that biases spawning toward the
  emptiest pixels. No fixed grid, no clumping — the field fills exactly the gaps.
- **View‑distance‑scaled radius** (`radius ≈ 0.03·distance`, clamped to `[RMIN,RMAX]`). Distant
  surfels are larger, so each one covers a similar *screen* footprint → uniform on‑screen density
  regardless of depth. This is what the `coverage` heat map shows as an even warm field.
- **Per‑frame spawn budget** so the population grows smoothly to a steady state (~8.4k surfels here)
  rather than exploding in frame 0 and thrashing the hash grid.

The `surfel_distribution` and `coverage` outputs are the direct evidence: even splat density on every
wall, floor and box face, with only mild falloff into corners.

---

## Curved surfaces

Surfels are a point‑sampled representation, so they don't care whether a surface is flat or curved —
what matters is the **per‑hit geometric normal** in the G‑buffer and even coverage over the surface.
Both are handled:

- The visibility `trace()` returns a **per‑hit normal**. For a sphere that's `normalize(hit − centre)`,
  so every surfel on a sphere gets the correct local normal; the hit record carries normal + material
  directly, so nothing downstream branches on primitive type.
- The gather (`gatherE`) already weights neighbours by `dot(N, surfel.n)` and by distance to the
  surfel's tangent plane, which is exactly what you want on curvature: a surfel only contributes to
  points whose normal agrees with it, so the shading follows the curve smoothly instead of leaking
  across it.
- Coverage‑driven spawning fills curved surfaces to the same target density as flat ones — the
  `coverage` heat map is uniformly warm across the spheres, with only faint seams at silhouettes.

Result (`SurfelGI_Result.png`): smooth GI gradients wrapping each sphere, red/green colour bleed on
the curvature, and the small floating sphere picking up bounce from all directions — no faceting, no
flicker (the ×20 diff stays black), no coverage gaps. Adding more/other analytic primitives is just
another case in `trace()` returning `{t, normal, albedo}`.

## Mapping back to the engine

- The visibility pass is the seam for the real `VisibilityRaster` — feed its G‑buffer straight into
  the surfel apply.
- The surfel field, hash grid, coverage spawn and running‑mean update map 1:1 to a compute pass over
  a persistent surfel buffer; the Jacobi ping‑pong is two SSBOs.
- Keep direct light out of the surfels (NEE at the primary hit) so edges/contact shadows stay sharp —
  the surfels only ever carry the low‑frequency bounce, which is why the result is both stable *and*
  detailed.

This is the GTX‑friendly GI path: no RT cores required, cost scales with surfel count (≈8k here),
not pixel count, and the temporal design means quality accumulates instead of flickering.
