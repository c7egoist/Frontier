# The Hunger / organic ambush maze — revision 04

The previous garden was too open, rectangular and easy to read. This revision replaces its visible block maze, slows the player's sightline rather than the plants, and changes the insect threat to **explosive fireflies**.

Open the running prototype and choose **02 / THE HUNGER → Enter the maze**. It remains the destination of Deadwood's forest portal. The default preview is now [Scene 03 / Icebound](GLACIER.md); the garden's exit leads to that glacier entrance. All areas coexist in the same scene. Use `?scene=garden` to open this older study directly.

## What changed

### Continuous organic passages, not hedge boxes

- The same connected authoring graph retains forks, blind alleys and reconnecting routes, but its nodes are now displaced and its connections are curved.
- **Rendered banks are one continuous heightfield** shaped around variable-width curved passages. Box-shaped beds and straight divider walls have been removed.
- Passage radii vary around **7.6–10 m**, versus the old roughly 20 m half-width. High, irregular earth banks and leaf growth make turns blind.
- **24 enclosed tunnel sections** have opaque root-and-leaf roofs, curved cross sections and root ribs. These are solid overhead cover, not decorative archways that can be seen through.
- The main-route reference follows the actual curved passages, approximately **1,153 m**, and is visible only in the untimed inspector.
- The underlying graph still has 61 connected cells and 64 links. Grid coordinates are authoring/connectivity metadata, not rendered cubes or a painted race track.

The driving camera sits lower/closer in this area and retracts before entering banks or tunnel roofs. Normal driving does not cut roofs away. Inspection hides the roof skins to expose the layout and explicitly marks the attempt as a **section test**.

### Actual uneven terrain and stones

The road floor rolls through overlapping long and short waves, with more than four metres of sampled height variation. Banks rise smoothly from those passages. Rendering, collision, car pose and debris all use the shared terrain contract in `src/garden-terrain.js`.

The car follows ground height, pitches and rolls on slopes, and loses/gains some speed uphill/downhill. This remains an arcade greybox controller, not a suspension simulator.

There are **175 seeded stones**, including **125 larger physical obstacles**, scattered mainly along the shoulders and junctions. Small pebbles remain visual; larger rocks actually stop/slow the car. Fast impacts also cost a small amount of hull integrity. The portal arrival and final apron remain clear.

### Fast, concealed mouths

There are now **42 traps**: **38 buried ambush plants** and only **4 initially exposed mouths**. Dormant plants have no visible rosette, mound or cracks: they are entirely below the terrain. The warning appears only when the trap actually activates.

| Phase | Old garden | Revision 04 |
| --- | --- | --- |
| Soil warning | 0.85 s | **0.18 s** |
| Upward eruption | 0.75 s | **0.22 s** |
| Windup | 0.8 s | **0.16 s** |
| Snap closure | 0.32 s | **0.12 s** |

The buried trigger is speed-aware and close (about 12–19 m), rather than revealing every trap at 27 m. Roots disturb the soil and throw debris during the eruption. Plants aim toward a short prediction of the vehicle's position: buried mouths lunge up to 2.2 m; exposed plants can lunge up to 4.2 m. Basal leaves stay planted while the head extends on its connecting stalk.

The same moving head centre and rotation are used for the mesh and capture envelope. Closed jaws are physical obstacles; waiting until the snap finishes does not allow ghosting through the closed leaf mesh. They can be passed around or during reopening. A caught car is pulled into the mouth, disappears, and ends the attempt.

**R rerolls the ambush positions/headings/scale**, preserving the maze's navigable graph and fixed rendering budget. Memorizing one exposed row of plants is no longer the main solution. There is still a short local soil/leaf cue: no deliberate zero-warning instant capture.

### Explosive fireflies replace the slow diving insects

The large diving pollinators have been removed from gameplay and the scene. There are **80 fireflies in 20 small clusters**, in both open passages and tunnels.

- Fireflies have small dark bodies, beating wings and restrained warm bioluminescent abdomens—not neon trails or point-light decorations.
- A vehicle within **6.2 m** arms a fly. Its abdomen flashes rapidly for **0.48 s**, then it bursts.
- The **7.2 m blast radius** deals distance-scaled hull damage, sharply reduces speed, nudges the car away where space is clear, and gives a short camera/screen impact.
- Nearby flies within **5.5 m** are primed with a **0.16 s chain fuse**. Reactions remain local; they do not detonate the entire level.
- Each insect detonates only once per attempt. Breaking away before the fuse ends avoids damage. Groups are placed on passage shoulders, not as invisible whole-lane instant-kill barriers.
- Bursts have an expanding, short-lived pressure/flash volume plus airborne soil, stone fragments and dust.

The car starts with **100% hull**. Damage persists through the attempt; 0.42 s hit protection prevents one simultaneous cluster from applying every overlapping hit in the same instant. Later swarms and impacts can wreck the vehicle. A wreck is distinct from being swallowed, and **R** restores the car and resets the encounter state.

The tall nectar blooms and giant pitcher plants remain as organic scenery and landmarks. Pitchers still do not swallow vehicles in this greybox; flytraps are the functional eating hazard.

## Play and study controls

| Control | Action |
| --- | --- |
| WASD / arrows | Drive, brake/reverse and steer |
| Space | Hard brake—especially important at a soil twitch or blind bend |
| R | Retry the current area with fresh ambush placement and restored hull |
| C | Chase / bonnet camera |
| V | Untimed inspection/cutaway; drag to orbit and scroll to zoom |
| P | Freeze/resume plants, fireflies, blast effects and debris |
| Escape / Controls | Pause gameplay / field notes |

The speed cap is **29 m/s**. The inspector has section starts plus:

- **Watch a fast ambush:** frames the short soil cue and rapid eruption.
- **Test a vehicle capture:** deliberately puts a car in a mouth, then shows the swallowing/failure sequence.
- **Test a firefly swarm:** frames a close-range flash/burst/chain reaction and real hull damage. Nearby jaws are explicitly held closed for this isolated, untimed demonstration.
- **Restart at garden entry**, and a far-gate portal test.

The UI's **80–140 s** duration is a design target, not a measured human run. The layout, hazards and cutaway tools are intended for further driving feedback. This revision changes difficulty substantially, but does not claim that every randomized attempt is competitively balanced or human-tested.

## Portals / same-scene layout

- Forest exit: z=2,200 → garden arrival **x=900, z=2,600**.
- Garden exit near **x=900, z=3,090** → open quarry landing **x=1,600, z=3,300**.
- No new level load or scene replacement on either transfer.
- R from the garden or its landing retries the garden, not the entire forest.

## Source and interchange

- `src/garden.js`: graph, curved-route reference, plant state machines, predictive lunge, oriented mouth/collision checks and portal trigger.
- `src/garden-terrain.js`: node warping, curved passages, shared signed corridor/bank surface, waves, stones and camera collision.
- `src/garden-organic-world.js`: continuous ground mesh, enclosed roof skins/root ribs, rocks, instanced fireflies and blast visuals.
- `src/fireflies.js`: proximity arming, local chains, one-shot explosion events and distance-scaled blast damage.
- `src/garden-combat.js`: persistent hull state / brief overlap-hit protection.
- `src/garden-world.js`: connected trap head/stalk, giant flora and garden assembly.
- `src/main.js`: area selection, retry randomization, terrain-aware car pose, camera, encounter events and HUD.

`npm run export:scene` regenerates:

- `Content/Scenes/CarnivorousGarden.gltf`: garden-only static survey, including terrain, roofs, stones, all trap positions exposed for inspection, and fireflies. Buried-at-start metadata is retained.
- `Content/Scenes/CarnivorousGarden.layout.json`: graph, curved segments/radii, tunnel flags/heights, stone colliders, default-seed traps, firefly positions/rules, timings and terrain source contract.
- `Content/Scenes/Deadwood.gltf`: combined forest, garden and landing snapshot.

Runtime retries use different trap/firefly seeds; the interchange is a reproducible default survey, not a recording of every random attempt. Files use glTF instancing. Animation, terrain functions, collision, damage and AI are browser prototype code—not native Frontier DLL integration or embedded glTF animation.

## Verification and limits

Run `npm test`, `npm run build` and `npm run test:browser`. Tests cover curved passage clearance, waves and bank consistency, stone collision, tunnel/camera clearance, concealed-to-visible growth, lunging node geometry, fast-pass capture versus braking escape, closed-jaw collision, seed variation, fuse timing, avoiding blast damage, local chains, hit protection/wrecking, terrain-aware debris and valid scene loading.

Browser checks exercise driving, cutaway/roof restoration, rapid eruption debris, swallowing/failure, firefly blasts that actually reduce hull, retry/reset, hazard pause, far-gate transfer and the unchanged forest study. The fast-pass versus hard-braking test demonstrates a meaningful change in the model; it is not a substitute for human difficulty testing.

Still greybox: no production suspension, final textures, audio, damage deformation, opponents or multiplayer replication. Narrow turns and randomized ambush combinations need human playtesting before claiming a finished difficulty curve.
