# Liger — proper CAD model (SolidArc)

All three Liger meshes are rebuilt as **real NURBS surfaces**, not lofts between sparse curves. Replay any file with `SolidArc --continue <file>.arc`.

| File | Part | Result |
|---|---|---|
| `Liger_Body_Shell.arc` | `Body_Main_Shell` | 44 faces (22 patches, mirrored) sewn into one manifold sheet (32 open edges: underside, arch holes, nose notch, deck slot) |
| `Liger_Front_Cowl.arc` | `Body_Front_Cowl` | 12 bicubic patches, sewn into one manifold sheet. Mean 0.12 cm, max 0.47 cm |
| `Liger_Roof_Glass_Frame.arc` | `Body_Roof_Glass_Frame` | 6 ribbon patches. Mean 0.13 cm, max 0.56 cm |
| `Liger_Full_Vehicle.arc` | all of the above | one replay script with tints |

* **Cowl:** a zero-thickness folded sheet with a lip / 45° slope / nose arc / long lower face section swept along Y. It has sheared ends and a notch in the lower edge.
* **Frame:** flat ribbons stored as triangle strips. Each branch of the strip tree becomes one cubic ribbon through the strip's transverse sections.
  * The ribbons are not sewn. They only touch at the two T-junctions.
  * They lie on the body surface, so they z-fight in the viewport, which is correct.
* **Orientation:** every frame ribbon has its normal pointing up. The cowl is oriented with its convex side outward, so its lower face shows pink from above.

* 22 bicubic B-spline patches are fitted to the mesh. Each is mirrored about the centreline, giving 44 faces.
* `sew` merges them into **one manifold, consistently oriented sheet**: V60 E104 F44, `manifold yes, oriented yes`, no T-junctions.
* The 32 open edges are all intentional: the underside perimeter, both wheel-arch holes and the nose notch (13 per side), plus the plate-rim and canopy-edge edges of the rear slot (3 per side; the canopy edge is split at the roof-edge node).
* Units are metres. X is forward, Z is up, and the **centreline is at Y = 0**. The Blender Y of the centreline was −47.718 cm, so add −0.47718 m to Y to get back to the original coordinates.
* `Liger_Body_Patches_Unsewn.arc` has the same patches before `sew`, for editing individual faces.

## How it was made (`pipeline/`)
1. **Layout.** `layout.py` and `full_layout.py` define a conforming quad layout on the half-body. Neighbouring patches share the same rail objects, so `sew` finds exactly identical boundary curves.
   * Rails follow real features: centreline, the valley between canopy and shoulder, the n_z = 0.7 shoulder contour, the wheel-arch rim circles, the sill and the end faces.
   * The wheel arches are built as sectors (flank, neck, flank).
2. **Projection.** Each patch grid is projected onto the mesh by exact ray casting: plan z-ray for the top skin, elevation y-ray for the side walls, x-ray for the tail and nose faces. A nearest-surface projection is used for the arch liner.
3. **Fit.** A constrained least-squares bicubic B-spline net is fitted with the boundary rows fixed to the shared rails.
4. **Export.** `export_arc.py` writes `patch … --degree=3` commands. Mirrored copies reverse the point order so the normals stay outward.

Run from `pipeline/` with `LIGER_MESH_DIR=<path to Vehicles/Liger/mesh>` set. `python export_all.py` rebuilds every part and rewrites all the `.arc` files here, and prints the per-patch deviation tables. It needs numpy, scipy and numba.

## Canopy and headlight cut lines
The canopy and the headlight are now cut into patches along real features (`proofs/Liger_CAD_10…14`).

**Canopy (greenhouse), 6 patches per side:** `Roof_Rear`, `Roof`, `Side_Rear`, `Side_Glass`, `Windscreen`, `Windscreen_Low`.
* **Roof edge:** from the rear this is a crease found in the mesh as the convex ridge of the height-field curvature, from the rear plate edge at x −147, y −39 to x −12. It runs straight into the start of the `Roof_Glass_Frame` side rail, follows the rail centreline, then the header centreline (the mean of the two header ribbons) to the centreline at x 123. Everything inside it is roof and glass. Everything outside it down to the valley is side glass.
* **A-pillar:** the centreline of the `Frame_2` pillar ribbon, from the rail/header junction to the valley at x 144. The windscreen is in front of it and the side glass is behind it.
* **Valley node moved:** the old `V160` node moved from x 160 to the pillar foot (x 144) so that the pillar ends on the valley without leaving a zero-width sliver.
* **Kept dividers:** the x −64 and x 160 dividers stay, so every shoulder patch still conforms.
* **Not in the data:** the frame ribbon has no rear edge, so there is **no rear glass edge**. `Roof` runs from x −64 to the header.

**Headlight, 5 patches per side:** `Headlight`, `Hood_b1…b4`.
* **Outline:** a closed loop traced from the mesh by gradient ridge. The NW edge is the 3.5 cm step of the lens pocket. The SE edge is where the pocket floor meets the rim. This loop is the `Headlight` patch boundary.
* **No recess:** the lens is fitted as a smooth patch with no hole, rim or recess.
* **Seams:** four seams run from the loop corners to the four corners of the old `Hood_b`. They are structural, not features. They are needed so the loop is a conforming quad network with no T-junctions.
* **SW tip:** it is closed by a 3 cm cap. A single corner there would make the neighbouring patch wrap a reflex angle.
* **Thin crescent:** the SE rim of the pocket is only 2–3 cm from the silhouette edge. `Hood_b3` is therefore a thin crescent along the nose edge.
* **Parameter grid:** the sampling grid of fold-prone quads is untangled (`fitlib.py`).

`pipeline/canopy_trace.py` and `pipeline/lamp_trace.py` contain the tracing. `pipeline/setup_env.sh` rebuilds the venv, the mesh data and the SolidArc binary on a fresh machine.

## Accuracy (distance from fitted surface to mesh, cm)
| Patches | mean | p99 | max |
|---|---|---|---|
| Canopy ×6, shoulders ×3, hood A, tail, arch sectors, door wall | 0.16–0.18 | 0.38–0.45 | 0.5–0.7 (Roof_Rear 1.97) |
| Headlight, Hood B ×4 | 0.11–0.18 | 0.3–0.87 | 0.44–1.14 |
| Nose face (NQ2) | 0.27 | 3.1 | 8.6 |
| Rear deck (spoiler plate) | 0.17 | 0.42 | 1.9 |
| Front-arch liner (NQ1) | 0.84 | 5.8 | 8.6 |

About 0.17 cm is the noise floor of the metric, set by the mesh sample spacing.

## Known gaps
* **Rear deck slot.** The source mesh has no riser wall between the spoiler plate and the canopy. The plate is a separate overhanging sheet with an open slot under it, and the floor at z ≈ 85 is not modelled. The CAD reproduces this: the plate rim and the canopy edge are free edges (the 4 extra open edges), and the slot looks dark from above. Add a floor patch if a closed tail is wanted.
* **Arch liners.** The tunnel liner behind the front arch (NQ1) and the nose notch are approximate (the error sits on the NQ1/NQ2 shared cut). A few small liner slivers render pink (back faces) from certain angles.
* The body is an open shell (no underside), like the source mesh. Add thickness with `solidify` per patch if a solid is needed.

`proofs/` has kernel renders of the sewn body and of the patch layout (each patch tinted).
