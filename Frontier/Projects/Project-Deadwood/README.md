# Frontier playable level studies — Scene 04

**New default: [Iron Tide — working scrapyard](SCRAPYARD.md).** A 1.9 km point-to-point run through stacked and crushed cars, metal shacks and rubber-tyre courts. Choose between branching wreck alleys: crane magnets physically drag and lift loose metal **and the player car**, cranes release their loads or collapse with them, and hovering cargo drones dump new obstacles ahead. No painted route, reserved straight lane, neon styling or arbitrary pursuit timer.

Choose **04 / IRON TIDE** (default), **03 / ICEBOUND**, **02 / THE HUNGER** or **01 / DEADWOOD**. Direct links: `?scene=scrapyard`, `?scene=glacier`, `?scene=garden`, `?scene=forest`. All four studies coexist in one loaded scene; their portals transfer the vehicle without loading another level. The glacier now leads into the yard. Each later study has standalone glTF/layout interchange; the combined scene is refreshed too.

[Scrapyard controls, physics, inspection tests and limitations](SCRAPYARD.md) · [Icebound revision 02](GLACIER.md) · [Garden documentation](GARDEN.md). Original forest notes follow.

A **separate playable greybox** for Frontier: a 2.2 km one-way car run through a dead forest. Roots break through the ground, branch from nodes, keep growing, and displace stone, sand and dust. Muted earth, timber and stone; no neon/cyberpunk styling. Project-Networking remains unchanged.

## Play

```sh
cd Frontier/Projects/Project-Deadwood
npm ci
npm run dev
```

Desktop keyboard and WebGL required. Vite binds to `0.0.0.0` and accepts the Arena preview hostname. All runtime assets are local; no CDN or SDK credentials.

| Control | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake, then reverse |
| A D / Left Right | Steer |
| Space | Hard brake |
| R | Restart the current area using its current settings |
| C | Chase / bonnet camera |
| V | Inspection camera: drag to orbit, scroll to zoom |
| P | Freeze/resume active hazards **and debris** |
| Escape / Controls | Pause gameplay and open field notes |

### See the new growth up close

Choose **Inspect the blockout**, optionally select a section, then **Watch an eruption**. This restarts a nearby root at its underground stage and frames it with the orbit camera. Wait for the soil to split, the stem to break through, then side shoots and secondary forks to emerge. You can orbit while it grows.

Inspection now has:

- **Eruption frequency:** 0–4×, controlling approach delays and independent stochastic births. Zero stops new activations; existing roots continue growing.
- **Continuous growth:** 0.5–3×, controlling extension, girth and branch-emergence timing.
- **Root systems:** 30–150 concurrent systems (default 90). Changing this rebuilds the study.
- **Scatter a new forest:** selects another seed, rebuilding the site distribution, angles, branches and timings.
- **Pause root growth:** freezes the roots, dirt bursts and airborne debris together.

Inspection/tuning marks the run as a section test. R starts a fresh run using the selected tuning and seed, clearing debris and all growth/director state. The default seed remains repeatable for comparisons; scattering explicitly changes it.

## Revision 02: no repeating root rows

The old implementation paired left/right roots at regular intervals and preserved a sinusoidal opening. **Those rows, mirrored reaches and reserved lane have been removed.**

### Distribution and timing

- Ground anchors are independently scattered across the full earth corridor, **including its centre**, with loose random clusters and irregular gaps.
- Each system has its own activation distance (35–270 m), exponential delay and warning (0.65–1.35 s), not a shared distance trigger.
- An independent renewal director creates additional eruptions around the car, including behind it, **even if the car is stationary**. Inter-event delays are randomized, not a fixed beat.
- Distant dormant sites are reassigned for new events. Sites left more than 340 m behind are recycled ahead. Visible living systems are never removed to free an eruption slot.
- There is deliberately **no guaranteed safe lateral lane**. Root warnings remain, but random density/timing can close a route if the player lingers. Difficulty needs human driving feedback; the previous revision's 52.47 s fixed-weave result does **not** validate this new model.
- Scheduling is random-looking but seeded for reproducibility. The pool is finite for performance; this is not literally unbounded frequency or infinite simultaneous roots. Frequency and density controls expose that budget rather than hiding it.

### Actual branching growth

- Each system contains a hierarchical graph of **7–16 stems/branches**, depth up to two secondary levels, with a fixed rendering capacity of 18.
- Main stems may sprout almost vertically or at varied oblique angles. Two early low feeders spread from near the base; upper forks and secondary shoots emerge later from different parent nodes.
- A child begins only after its parent's growth front reaches its attachment node. Its origin stays welded to that node as the parent bends and expands. Forks are not detached decorative sticks.
- Swollen junctions and knotted tube radii emphasize the nodes. Seeded cubic curves, differing lengths, headings, lean, curl and slow independent torsion avoid one repeated tentacle shape.
- The anchor begins **0.65 m below the ground**. The shoot extends through the surface rather than scaling an already exposed branch into existence.
- After the initial shoot reaches its first length, both extension and girth continue increasing logarithmically. There is **no mature-size clamp**. The mesh topology stays fixed, but physical dimensions do not stop growing.
- Collision samples the same visible branch curves and thickening radii used by the renderer, including low feeders. Upper limbs may be driven under where there is physical clearance; trunks and lower forks still block the car.

### Displaced earth / debris

A warning mound trembles and radial cracks appear at each actual ground anchor. Surface breakthrough emits a larger burst, followed by continued smaller soil displacements while the root grows:

- **Rock chunks:** low-poly solid geometry, upward/outward velocity, gravity, two damped bounces, settling, spin and eventual removal.
- **Sand:** smaller ballistic grains, ground contact and fading.
- **Dust:** soft, expanding earth-coloured puffs with upward drift and fading. No luminous effects.

Later soil emission starts around the **outside of the thickening stem**, not inside its wood. Eruption events are detected by time crossings, so a slow frame cannot skip the initial burst. The debris pool is capped at 2,400 particles; old particles are reused during extreme activity. Stones are visual debris, not extra invisible vehicle obstacles.

## Route and portal

The **2,200 m forward distance**, bends, five major spatial beats, maximum speed (44 m/s / 158.4 km/h), stump split and pursuing root front remain. Even instantaneous top speed needs at least **50 seconds** over that forward distance. The UI's 50–70 s target remains a design target, not a measured human time for revision 02.

| Beat | Distance | Spatial role |
| --- | --- | --- |
| The threshold | 0–360 m | Broad introduction and first ground eruptions |
| The broken reach | 360–820 m | Scattered systems, mixed angles, growing forks |
| The old heart | 820–1,260 m | Wide clearing with a massive stump; physical split rejoins |
| The strangle | 1,260–1,810 m | Narrower ground corridor under encroaching growth |
| Last light | 1,810–2,200 m | Final forest approach to the stone gate |

These are **spatial beats, not eruption rows**. Growth can happen throughout them. Sparse survey stones are scale aids, not lap checkpoints. Off-corridor shoulders slow/constrain the car. A root front pursues at 26 m/s from 170 m behind after eight seconds of movement-clock time.

Crossing the exit opening at z=2,200 now transfers the car into **The Hunger**, the carnivorous garden maze at x=900, z=2,600. Both areas exist in the same `THREE.Scene` from startup; no level load or scene replacement occurs. The portal surface renders a live destination view. The garden has its own exit to a third-world quarry landing pad. See [GARDEN.md](GARDEN.md) for its hazards, controls and separate scene export.

## Native interchange / integration boundary

`Content/Scenes/CarnivorousGarden.gltf` is also available as a garden-only survey snapshot. `Content/Scenes/Deadwood.gltf` contains the forest, garden and landing area as a metre-scale **static geometry snapshot** of the same scene, including the new branching root systems at 20 seconds of authored age (pre-grown systems are older). `Deadwood.layout.json` contains the route, root graphs, spawn parameters, collider data and same-scene portal destination.

```sh
npm run export:scene
```

The glTF uses `EXT_mesh_gpu_instancing` and `KHR_materials_unlit`; importers need instancing support or expansion. Node exports omit canvas-generated survey text but retain the marker geometry. Runtime animation, stochastic spawning, particle simulation, driving and teleporting are **browser prototype code**, not embedded glTF animation and not integrated into a Frontier native DLL. No native manifest/runtime integration is claimed.

## Verification

```sh
npm test
npm run build
npx playwright install chromium   # once, where browser download access is available
npm run test:browser
```

`CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium. Tests cover unpaired site distribution, mixed vertical/angled stems, branching graph validity, underground emergence, continued length/girth growth, parent-node continuity, independent late births while stationary, zero-frequency behavior, deterministic scheduling, actual root collision, particle burst timing, bounded pools, ballistic motion/bounces/lifetimes, perimeter soil emission, and valid glTF loading/metadata.

The WebGL smoke test covers driving, section inspection, **Watch an eruption**, visible active debris, growth-rate tuning, layout scattering, freeze/resume, help and clean restart, while checking browser errors. `window.deadwood.snapshot()` provides read-only diagnostics.

This revision intentionally replaces the previous scripted weave test rather than pretending the old clean-route proof still applies. Randomized high-density gameplay, production physics and multiplayer fairness are not yet validated.

## Files / remaining greybox scope

- `src/course.js`: spatial layout, root graphs, growth, stochastic director, branch collision and portals.
- `src/world.js`: terrain, instanced dead forest, connected tube meshes and junction nodes.
- `src/debris-simulation.js`: bounded ballistic/soil simulation and eruption event detection.
- `src/debris.js`: instanced stone chunks and shader-based sand/dust rendering.
- `src/vehicle.js`: fixed-step arcade controller.
- `src/main.js`: cameras, local driving loop, root tuning, inspection and portal rendering.
- `tools/export-scene.js`: reproducible geometry/layout export.

Still greybox: no bark textures, final car, audio, production suspension, opponents, damage or network replication. The forest's behavior and readability should be evaluated before adding final art.
