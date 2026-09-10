# Species Presets

| Preset   | Method         | Look                                  | Bark verts¹ |
|----------|----------------|---------------------------------------|-------------|
| `oak`    | recursive      | spreading broadleaf, 4 levels         | ~10–13k     |
| `pine`   | recursive      | excurrent conifer, whorled limbs      | ~6–7k       |
| `birch`  | recursive      | slender fastigiate broadleaf          | ~10–18k     |
| `colony` | colonization   | dense natural broadleaf crown         | ~20k        |
| `sapling`| recursive      | tiny 2-level test tree                | ~0.5–0.8k   |

¹ LOD0, seed-dependent.

## Tuning (`frontier/presets.py`)

Skeleton (`method: recursive`): `max_depth`, `trunk_len`,
`trunk_radius`, `tip_radius`, `segs`, `len_decay`, `lat_ratio`
(lateral vs leader thickness), `branch_angle` ± spread, `laterals`,
`laterals2_prob`, `lateral_every`, `whorl` (pine rings), `apical`,
`phototropism`, `upright` (leader straightness), `gravitrop` (sag),
`curl` (wander), `up_bias`, `envelope` (`none|cone|sphere`),
`subdiv_factor`.

Skeleton (`method: colonization`): `attractors`, `influence`,
`kill_dist`, `step`, `crown_radius/height`, `max_nodes`, `max_iter`.

Rings: `trunk_n` (LOD0 18), `tip_n` (5), `ring_gamma`.
Mesh: `undulation`, `flare`, `relax`, `collar_parent`, `collar_child`.
Leaves: `count`, `size` ± spread, `min_depth`, `cross` (cards per site),
`droop`.

## LODs

`apply_lod` regenerates from the same skeleton family with reduced ring
counts, longer subdivisions and fewer leaf cards — topology stays
manifold at every LOD (no decimation cracks, ever).
