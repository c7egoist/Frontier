# Scene 03 — Icebound / revision 02

**The continuous snow route and 24 fixed crystal stations have been removed.** This revision replaces the follow-the-strip run with a randomized ice field, many large falling crystals, local polygon fractures and several competing ways through the space.

## Play

```sh
npm ci
npm run dev
```

Choose **03 / ICEBOUND** or use `?scene=glacier` (the default preview is now Scene 4). Desktop keyboard and WebGL required. All geometry/assets are local.

| Control | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A D / Left Right | Steer |
| Space | Hard brake; release the accelerator when shedding speed |
| R | New field and storm seed; restart Scene 3 |
| C | Chase / bonnet camera |
| V | Inspection / driving; drag to orbit and scroll to zoom |
| P | Pause hazards; marks the attempt as a section test |
| Escape | Pause and open controls |

`?scene=glacier` opens this study; `?scene=forest` and `?scene=garden` open the retained older studies. A debug URL such as `?seed=711` reproduces a run for QA; ordinary retries use fresh browser-generated seeds.

## No painted route to follow

The 2 km point-to-point progression remains **cave → avalanche field → frozen fleet → final cave → portal**, but progression along the map is not a prescribed driving line.

- **162 scattered snow grip islands**, not a continuous ribbon. Their positions, sizes and angles change each run.
- **53 broad firm-blue-ice patches** offer another grip/speed choice; they are not linked into a reserved route.
- Up to **64 irregular pressure ridges** split the space into intersecting passages and reconnecting gaps. These are actual colliders, not decorative boxes.
- Random **open-water leads** remove clusters of support polygons. Going into them loses the vehicle. They are visibly dark, jagged openings, not invisible kill zones.
- The frozen sea widens to approximately **270 m**, with multiple ways around the eight sailing hulls. The caves are approximately 140 m wide.
- No snow, central line or permanent side of the field is protected from the storm.
- The field generator checks forward connectivity and rejects sealed layouts. This is a clearance check, not a hidden in-game driving assist.

The environment remains natural ice, dark water, timber and canvas. No neon, emissive hazard rings or cyberpunk styling. Ships retain tapered hulls, decks, ribs, masts, curved sails, yards and rigging. The chase camera retracts before crossing pressure ridges and hulls.

## Actual randomized crystal showers

There are **no authored drop stations and no player-selected falling crystal** during normal driving.

A seeded runtime director attempts **18–27 large crystals per shower**, approximately every **2.4–3.5 seconds**. Three randomly placed lobes scatter them ahead of the vehicle, across the playable width. Heights, sizes, warning delays and exact landing positions vary independently. New candidates appear at least 55 m ahead after scatter, rather than snapping onto the current vehicle position.

- Falling crystals have **2.1–4.2 m radii** and **9–18 m lengths**. They are substantial obstacles, not a single small cone.
- Individual **0.95–1.8 second warnings** shake the overhead ice and grow a dark footprint. Gravity then visibly pulls the entire mesh down.
- Several crystals can be falling simultaneously. The browser test verifies at least **12 at once** in a sample shower.
- Falling ice can strike snow islands, blue ice or black ice. It does not avoid a preferred line.
- An impact inflicts approximately **36–45 hull damage**, then shatters the large crystal into smaller colliding rubble with fragment bursts.
- Rubble persists for **4.5–8 seconds**, then sinks/clears. This makes recent gaps change without permanently paving the whole field with impassable towers.
- A **320-slot reused pool** supports hundreds of drops over a run without unbounded accumulation.

The director rejects overlapping placements, checks local escape gaps, and trims a batch if its projected footprints would seal all forward connectivity. It does **not** select a protected snow trail or always leave the same side open. A batch can therefore contain fewer than its initial 18–27 candidates when safety/space checks reject placements. Existing danger still has to be read and avoided; the guard is not a guarantee that every late steering choice remains recoverable.

## Ice failure is no longer a square tile trap

The floor now consists of **4,929 clipped Voronoi polygons**, with irregular shared edges. It is not a grid of 18 m boxes.

- Contact strain follows the moving car into nearby polygons.
- Cracks grow along plate junctions and fork through their interiors as load increases, rather than drawing a radial star around the car.
- Sustained excessive speed breaks the polygon underneath and nearby plates. Individual fragments rotate and sink; support checks use the same polygon identities.
- Snow and ice colours are part of the fracture surface itself, so no white strip floats over a hole.
- Open leads, speed break-throughs and timed collapse all remove actual rendered support.
- The chase front is irregular across the width rather than a ruler-straight row of dropping squares. Fragments fall along its edge.

### Driving tension

Velocity and heading remain separate. Packed snow has lateral grip **7.6**, firm blue ice **2.5**, and black ice **1.05**. Black ice still carries a sideways slide, but is more recoverable than the previous controller when responding to the much denser hazards.

Black-ice speed limits vary with the local ice strength, approximately **87–100 km/h**. Avalanche cuts are fragile at **79 km/h**. Firm blue ice and snow do not accumulate speed load, but storms, ridges and open leads still interrupt those surfaces. The HUD reports the current surface, limit and strain.

The timed collapse starts with the first accelerator input: **4-second delay**, initial front **220 m behind the entrance**, then **14 m/s**, even while the player stops. This was retuned alongside the added manoeuvring and debris; difficulty is not created simply by making the pursuit impossible to outrun. The 38 m/s speed cap and 2 km length still put the theoretical straight-line bound above 52 seconds.

## Avalanches and portals remain physical

Two blocking ice plugs rumble for 1.25 seconds, then fall for 1.6 seconds. Their colliders are removed only when the cuts open. Active avalanche footprints can cost 55 hull. The new gaps offer choices but remain fragile.

All four studies and the onward pad are built into **one Three.js scene at startup**. The garden gate arrives at the glacier entrance; the glacier exit requires a forward crossing inside its aperture and transfers the vehicle to the scrapyard entrance at `(2700, 5600)`. There is no scene replacement, level fetch or browser navigation. Nearby exit surfaces render their destination. R restarts the current area; select **03 / ICEBOUND** to return from the yard. The former icy landing geometry is replaced by the yard entrance.

## Verification and balance limits

```sh
npm test
npm run build
npm run export:scene
npm run test:browser
node tools/check-glacier-balance.js
```

The completed revision originally passed **59 unit/interchange checks** and **4 browser tests** across the first three studies. These remain in the suite; the glacier portal assertion now checks entry into Scene 4 rather than terminal completion. Checks cover randomized layout connectivity across 20 seeds, different/reproducible seed sequences, large simultaneous falls, real mesh descent, impact damage/rubble, projected escape space, grip, strain recovery, polygon support, rendered break-through, camera retraction, avalanche collision removal and same-map portal/retry behaviour. Holding full throttle straight ahead fails in the tested fields.

The developer-only reactive driver uses the **real vehicle controller and live storms**, without an authored snow route. The seven-seed sample produced:

| Seed | Outcome | Time | Hull | Crystals released |
| --- | --- | --- | --- | --- |
| 711 | Cleared | 135.43 s | 18% | 864 |
| 101 | Caught by collapse | 40.35 s | 100% | 186 |
| 202 | Caught by collapse | 144.45 s | 70% | 772 |
| 303 | Cleared | 143.90 s | 50% | 872 |
| 404 | Cleared | 137.67 s | 50% | 888 |
| 505 | Caught by collapse | 65.88 s | 80% | 344 |
| 606 | Cleared | 148.65 s | 30% | 889 |

These establish possible full-controller wins and losses, **not a human win rate or proof that every seed/input history is recoverable**. The reference planner is imperfect, can reverse after contacts, and is never run as an in-game assist. Human difficulty feedback is still needed. The former 81.43-second clean reference run belongs to revision 01 and does not validate this field.

Inspection cuts away cave roofs and outlines grip islands; it does not display a single ideal route. Its buttons demonstrate a polygon breakthrough, timed collapse, avalanche opening and an automatically generated crystal shower. Section jumps and hazard pauses mark the attempt as a test. Screenshots are written to ignored `test-results/`; software Chromium timing is not a production performance benchmark.

## Source and interchange

- `src/glacier-layout.js` — map envelope, ships and avalanche locations.
- `src/glacier-field.js` — randomized islands/ridges/leads, Voronoi geology and connectivity checks.
- `src/glacier-storm.js` — independent random shower director, pooled falling ice, impact and clearing.
- `src/glacier.js` — grip, inertia, collisions, strain/support, damage, pursuit and portal.
- `src/glacier-ice-mesh.js` — polygon geometry, contact cracks, vertex colours and individually falling plates. Buffer updates are limited to changed regions.
- `src/glacier-world.js`, `src/glacier-camera.js` — procedural world, instanced showers/debris and camera clearance.
- `tools/check-glacier-balance.js` — developer-only reactive reference check.
- `Content/Scenes/Icebound.gltf` / `.layout.json` — updated standalone static shower snapshot and schema-2 field/storm contract, seed 711.
- `Content/Scenes/Deadwood.gltf` — refreshed combined snapshot.

The interchange requires **EXT_mesh_gpu_instancing** support. It contains static geometry and metadata, **not embedded moving hazards, physics or native engine integration**. The old `snowRoute` metadata has been removed. Native engine/networking code is unchanged.
