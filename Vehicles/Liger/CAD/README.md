# Liger — proper CAD body (SolidArc)

`Liger_Body_Shell.arc` rebuilds `Body_Main_Shell` as a **real NURBS surface body**, not a loft between sparse curves.
Replay it with `SolidArc --continue Liger_Body_Shell.arc`.

* 15 bicubic B-spline patches are fitted to the mesh. Each is mirrored about the centreline, giving 30 faces.
* `sew` merges them into **one manifold, consistently oriented sheet**: V44 E73 F30, `manifold yes, oriented yes`, no T-junctions.
* The 26 open edges are all intentional: the underside perimeter, both wheel-arch holes and the nose notch, 13 per side.
* Units are metres. X is forward, Z is up, and the **centreline is at Y = 0**. The Blender Y of the centreline was −47.718 cm, so add −0.47718 m to Y to get back to the original coordinates.
* `Liger_Body_Patches_Unsewn.arc` has the same patches before `sew`, for editing individual faces.

## How it was made (`pipeline/`)
1. **Layout.** `layout.py` and `full_layout.py` define a conforming quad layout on the half-body. Neighbouring patches share the same rail objects, so `sew` finds exactly identical boundary curves.
   * Rails follow real features: centreline, the valley between canopy and shoulder, the n_z = 0.7 shoulder contour, the wheel-arch rim circles, the sill and the end faces.
   * The wheel arches are built as sectors (flank, neck, flank).
2. **Projection.** Each patch grid is projected onto the mesh by exact ray casting: plan z-ray for the top skin, elevation y-ray for the side walls, x-ray for the tail and nose faces. A nearest-surface projection is used for the arch liner.
3. **Fit.** A constrained least-squares bicubic B-spline net is fitted with the boundary rows fixed to the shared rails.
4. **Export.** `export_arc.py` writes `patch … --degree=3` commands. Mirrored copies reverse the point order so the normals stay outward.

Run from `pipeline/` with `LIGER_MESH_DIR=<path to Vehicles/Liger/mesh>` set, e.g. `python full_layout.py` for the per-patch deviation table and `python export_arc.py` to regenerate the `.arc` files.

## Accuracy (distance from fitted surface to mesh, cm)
| Patches | mean | p99 | max |
|---|---|---|---|
| Canopy ×3, shoulders ×3, hood A, tail, arch sectors, door wall | 0.17–0.20 | 0.40–0.45 | 0.5–0.85 |
| Hood B | 0.20 | 0.71 | 1.13 |
| Nose face (NQ2) | 0.26 | 1.75 | 7.5 |
| Rear deck | 0.37 | 4.0 | 6.0 |
| Front-arch liner (NQ1) | 0.76 | 5.5 | 7.5 |

About 0.17 cm is the noise floor of the metric, set by the mesh sample spacing.

## Known gaps
* **Rear deck.** There is a 6.5–13 cm vertical riser between canopy and spoiler plate that a single smooth patch cannot follow. The error is confined to a ~3 cm strip. Fix: add a ruled riser patch and a separate plate rim.
* **Arch liners.** The tunnel liner behind the front arch (NQ1) and the nose notch are approximate. A few small liner slivers render pink (back faces) from certain angles.
* **Parts not yet converted:** `Body_Front_Cowl` and `Body_Roof_Glass_Frame` (low-poly ribbons and a wedge, which need their own parametrisation).
* The body is an open shell (no underside), like the source mesh. Add thickness with `solidify` per patch if a solid is needed.

`proofs/` has kernel renders of the sewn body and of the patch layout (each patch tinted).
