# Abandoned City — the VehicleHMI demo's second level

An overgrown, flooded, post-war city, built inside the same VehicleHMI demo as the proving grounds. The proving grounds remain the default.

## Run it

```
?level=city            the abandoned city
?level=proving         the proving grounds (also the default when ?level= is missing or unknown)
```

Tools use the same query string, e.g. `node Tools/HeadlessHarness.mjs .. 12 "?capture=1&level=city"`.

## What is in it

- **Procedural buildings.** 42 buildings from a seeded generator (`Source/CityLevelLayout.js`, seed 55, mulberry32). Each lot gets a building or is left as garden. A building is a base tier, and about half carry a smaller upper tier stacked on it. Heights are 2–4 storeys in the base and 1–2 in the upper tier.
- **Windows.** Each window is intact glass, cracked (one triangle of the pane shattered), or void (open black). Measured for this seed: on ordinary buildings 19% of windows are void and 20% cracked; on the "broken" buildings 35% are void and 30% cracked. The remainder is intact.
- **Ivy.** Ivy climbs the piers between windows on the lower two storeys. For this seed it covers 67 of the 168 faces.
- **Damp lower walls.** The bottom 1.1 m of every wall uses a darker, stained family.
- **Rooftop and garden overgrowth.** Trees sit on 55% of building roofs (a random draw with a 60% chance per building) and in the garden lots. They are raster-only (`Distance: false`), so they never intersect a closed building.
- **Broken roads.** 42 potholes, 64 cracks, 5 dips. Some potholes and dips hold standing water. Some tarmac is cracked, and worn centre dashes run down the avenue.
- **Broken grass.** About 83 tufts across the lots, mixed with broken paving and dead grass.
- **Flood.** Patchy pools in the potholes and dips, plus a flood sheet over the whole surround outside the pad.
- **Roadworks.** A ring of 8 cones around a pothole cluster on the avenue, the only cones in the city.
- **Garden props.** Four breakable props (a pane, a block, a crate, a wall section) in garden lots. Rubble heaps sit on some lots, and the level keeps the proving grounds' Jersey perimeter.

Terrain is unchanged: the avenue kerbs, the rubble ramp, the spawn and the recovery code all come from `CourseStructure.js`. The city adds no physics code.

## Files

| File | Role |
|---|---|
| `Source/CityLevelLayout.js` | Pure data: seed, lots, buildings (tiers, windows, ivy, roof trees), garden lots, potholes, cracks, dips, tufts, breakables. No GPU, no DOM. |
| `Source/CityLevelStructure.js` | The level API (`LevelShapes`, placements, cones, breakables, ground, zones) built from the layout. |
| `Source/LevelCatalogue.js` | Chooses the level from `?level=` and re-exports its API. The five consumers import from here. |
| `Source/MaterialSpecification.js` | Adds families 86–98 (facades, windows, ivy, roofs, asphalt cracked, pothole, flood water, dead grass, foliage, bark, rust). Nothing earlier moved. |
| `index.html` | Inline script: retitles the window and the viewport pill when `?level=city`. |
| `Tools/CityLevel.test.mjs` | 14 Node tests (below). |

## Geometry rules

- **Closed shells.** Each building is one watertight shell. Every wall, the roof and the base share a single set of breakpoints per axis, so no edge hangs. The upper tier has no underside: it stands on the base, and the base's top keeps only the ring the upper tier does not cover.
- **Winding.** Every facet is emitted counter-clockwise seen from outside (`EmitOutwardQuad`).
- **Colliders.** Each building and each rubble heap is a collider through its bounding box, the same way the proving grounds handle their placements.

## Deliberate simplifications

- **No window frames.** A frame needs a 3×3 subdivision, which puts four more breakpoints on every neighbouring face. At 42 buildings that multiplies the facet count and the distance-field slices beyond what the adapter allows. Windows are single cells.
- **Potholes and cracks are decals.** The terrain is analytic (`ResolveCourseHeight`), and the tyres read that exact surface. A real dip would break the tyre model, so potholes are dark, slightly raised shapes.
- **Water is opaque decal, not a fluid.** Pools sit above the potholes and dips. A full-pad water sheet would hide the cracks and potholes, so the flood covers the surround and the low spots only.
- **No timed drills.** `TrainingDrills` is empty in the city. The drill stations belong to the proving grounds track.
- **No street lamps.** `StreetLampPoles` is empty (no `PoleHead` placements), so no light sources are added. Dead poles were not placed.

## Budgets

- **Distance-field slices.** The atlas allows 2,048 slices. With the buildings at 0.25 m voxels the city needed 2,942 (the first run failed on this), so buildings use 0.5 m voxels. The engine's ~400 slices for the vehicle and breakables, plus 188 for the other city shapes and 1,376 for buildings, come to roughly 1,960. The null-backend harness passes, which confirms it fits, but the headroom is small.
- **Facets.** About 65,000 in total across all shapes, about 1,500 per building (the proving grounds total about 3,500 across instanced shapes).
- **Occupants.** Buildings, props and cones together stay under the identity ceiling with the ground's 185 occupants (tested).

## Verification

- `node --test Tools/*.test.mjs`: **78/78 pass** (64 proving-grounds tests plus 14 new city tests).
  - Generator is deterministic for a seed and varies with the seed.
  - Lots, buildings and blocks: buildings sit inside lots, lots inside blocks, no building corner on a road, no two buildings overlap.
  - Every building is a closed shell: every edge has a reverse edge (0 unpaired). A dropped facet or a flipped facet makes the check fail with 3 unpaired edges, so the check does catch errors.
  - Each building's signed volume equals the expected volume of its tiers.
  - Every family the city uses is defined in the material table.
  - No `PoleHead` placements, drill list empty, zones and clear zones defined.
- Null-backend harness: `?capture=1&level=city` gives 12 frames, 0 errors, 0 warnings. The proving-grounds default gives the same.
- Browser (headless Chromium, SwiftShader, `?level=city&quality=low`): bring-up reaches **Ready in 59 s** (the proving grounds take about 45 s on the same setup), with no failure panel and no page errors. The HUD and HMI come up normally.

Evidence is in `Exhibits/AbandonedCity/`: the 960×540 and 1600×900 chase captures, the proving-grounds baseline capture, the Node test log, both harness logs, and the bring-up log.

## Known limits

- The first SwiftShader run is slow (the bring-up logs show the large distance-volume transfer). Real GPUs should not have a problem, but I have not measured one.
- The outliner still reads "Proving Grounds.scene", and the shell's title text is hardcoded in `EditorShell.js` and `InspectorPages.js`. The city only changes the window title and the viewport pill.
- Only the low-quality preset was captured. Medium and high have not been checked.
- The proving grounds remain the default. Whether the city should become the default is a separate decision.
