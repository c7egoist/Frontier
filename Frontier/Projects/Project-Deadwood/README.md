# The Hanging Crossing — adhesive silk driving study

**Default preview: study 004 / V.08, The Hanging Crossing.** Open `/` or `?world=web`. Earlier studies remain at `?world=glacier`, `?world=deadwood` and `?world=garden`; only the selected runtime is constructed.

## Play

Node 22.12+: `npm ci`, `npm run dev`. Preview port 5173, bound to 0.0.0.0. W/up accelerates; S/down brakes then reverses; A/D or left/right steer; C looks behind; P pauses; R creates a fresh web. Touch controls are included. Slow down before knots; line up gently on twin threads. There are no spiders, neon, laps or external art assets.

The point-to-point crossing spans **1,000 m**. It now has **41 junctions and 80 connections**, including upper climbing loops and lower recovery routes. Total speed is capped at 18 m/s, so reaching the gates requires over 55 seconds even before slow sections. All three terminal gates move the existing car to a landing instantiated at startup in the same scene; they do not load another level.

## Adhesion and handling

The previous sideways wind force and off-edge falling/death mechanic have been removed. Tyres adhere to the silk, including at a standstill on a vertical wall. A simplified Pacejka bicycle model still computes steering from front/rear slip angles and yaw torque; it now operates in the strand's local surface frame. Three-dimensional arc-length progression follows the driving surface; the car orientation and chase camera use its tangent and normal. A low-speed kinematic fallback provides stable steering and reversing. Steering recentres, braking is predictable, and no steering can rotate a parked car.

Adhesion is deliberately stylised, not a full physical adhesive/tyre simulator: it supports the car against gravity on walls and does not allow rollback when stopped. Excessive lateral error stretches silk and reduces speed. There is **no automatic checkpoint return, overstretch timeout, or hidden time penalty**. Even prolonged neutral-wheel thread mismatch stays on the current span. Silk tension costs speed and limits lateral stretch locally. At a knot boundary, adhesion holds the last valid local position so the driver can reverse or turn, rather than warping to another knot. It does not steer the car to a chosen outgoing connection. Project Drive is absent from this checkout; this uses the revised procedural fastback car, not imported Project Drive assets. Archived prototypes retain their own controllers.

## Implemented web mechanics

- **Two-thread crossings:** selected central spans taper over wide woven approaches into two 0.72 m braided tyre strips, spaced at the car's 1.98 m wheel-track centres. There is a real open 1.26 m central gap in the rendered topology. Front/rear tyre offsets and heading are checked against their corresponding threads. Small deviations visibly stretch the local threads toward the tyres and cost speed; wide knots remain available for lining up. Side routes bypass these precision connections.
- **Travelling wind waves:** coherent pulses start at the far anchor and propagate along each span. The HUD warns before the pulse cycle; fibres, silk and dust move. Wind deforms the support surface, never adds a random lateral force to the car. At higher speed a crest excites a damped body/suspension response, reduces steering authority slightly, and costs momentum. Tyres remain glued to the surface while the body absorbs the bounce. Slow crossings absorb the wave more gently.
- **Damaged overhead supports:** two marked spans trigger visible overhead anchor unravelling on approach. After three seconds of warning, the entire driving span gradually lowers over nine seconds, retaining its width and connectivity. At full lowering its middle meets a lower woven recovery junction. Continue directly uphill or take a longer side detour reconnecting to the original route. No driving road disappears. Support geometry, surface collision and recovery junctions share the same coordinates.
- **Vertical silk roads:** two optional upper loops each contain a smoothly rounded climb, an upper traverse and a descending wall. Their wall tangents reach a true 90 degrees, rather than merely rotating flat road meshes. Tyre contact, car attitude, camera and wind displacement all use the three-dimensional surface frame. Normal lower routes remain available.
- **Varied web patterns:** spans use seeded cross-lacing, chevrons, fan bracing, loose ladders and braided fibres, instead of one repeated square grid. Junctions use continuous spirals, off-centre fans or irregular patch meshes. Noncircular junction outlines share their radius function with support checks. Decorative weave choices do not secretly alter grip; twin-thread gaps remain open.
- **Same-scene portal:** three exit gates lead to one already-built landing. No scene reload or runtime world import is used for a portal crossing.

HUD includes speed/time/distance, adhesive contact, tyre margin or silk stretch, wind/wave warning, span type and a coloured network map (upper wall loops, lower detours and damaged supports).

## Validation and scope

**130 tests pass**, including 37 web-specific tests and all archived tests. Coverage includes tyre force symmetry/saturation, low-speed control, braking/reversing/recentring, pause, seed variation, graph alternatives, finite meshes, genuine twin-thread topology, travelling-wave timing, progressive intact support lowering, lower-junction continuity, vertical surface frames, standstill wall adhesion, and an actual controller-driven climb to the upper knot, and selection of a vertical branch by driving out from its real junction. Regression tests cover neutral-wheel mismatch beyond the former 2.2-second timeout, severe stretch without backward jumps, and absence of hidden knot-return penalties. The full seeded crossing test completes using tyre forces, waves, twin-thread constraints and the same-scene portal **without knot recoveries**. This does not establish human difficulty balance across every seed.

Production build passes (nonfatal shared Three.js chunk-size warning). Browser smoke check: default scene renders without page errors, throttle moves the car, pause freezes state, reset clears the run. Separate browser render checks inspected twin threads, an actual vertical-wall frame and the lowered recovery junction. Software rendering is not a hardware/mobile performance benchmark.

Single-player time-trial greybox, not networked racing. Multiplayer load coupling and optional jump gaps are not included. Human handling/balance and mobile performance still need playtesting. Development builds expose a read-only `window.webState` snapshot.

Implementation: `src/web-level.js`, `src/web-view.js`, `src/web-car.js`, `src/web-main.js`, `src/web-level.test.js`, `src/web-weave.js`.

---

# Archived Glacier study

# Frontier driving studies — Glacier Cave

The Glacier page is **study 003: Glacier Cave / The Drowned Fleet**. Hunger Garden is set aside, preserved at `?world=garden`; Deadwood remains at `?world=deadwood`. The bootstrap only constructs the selected study. These navigation links select prototypes; they are **not** the in-game portal mechanism.

## Glacier Cave: play and layout

Run `npm ci` then `npm run dev` (Node 22.12+). Open the served page, choose **Enter the frozen lead**. W/arrows throttle; A/D steer; S brakes/reverses; C looks behind; P pauses; R restarts with a fresh hazard seed. Touch throttle/brake/steering are provided.

One continuous **1,320 m**, point-to-point ice field, roughly **114–158 m wide**, with randomized obstacles and no marked driving lane: frozen sailing fleet → vaulted glacier / split passage → failing ice bridge → far portal. At a maximum 32 m/s, even a hypothetical straight run takes over 40 seconds; turns, acceleration and hazard avoidance add time. No laps. Weathered wood, faded canvas, pale ice and dirty snow; no neon or cyberpunk palette. All meshes are procedural greybox geometry, not downloaded artwork.

- **Timed collapse:** the front begins advancing after a six-second grace period, at 12.5 m/s; it also follows progress no farther than 180 m behind. Individual floes sink and tilt into the sea. Stopping indefinitely loses the run. Hold C to see it, and watch the collapse-gap readout.
- **Avalanche shortcut:** approaching the last fleet hull triggers a warning, then snow/ice falls at the blocked inner channel. At 3.7 seconds the plug clears and the shorter channel becomes drivable. Fallen snow obstructs only one bank of the longer passage; it never closes the entire main route. The shortcut has a localized fragile panel and heavy crystal showers.
- **Many spatial choices:** pairs of randomized pressure ridges split the broad field into gaps. Snow grip exists in separate, irregular patches, not two continuous guide lanes. Ridge, grip and weak-ice placement changes with the run seed. The map shows the field edges and obstacles rather than a line to follow.
- **Grip choices:** isolated packed-snow patches offer much stronger lateral traction and braking. Dark ice retains momentum and drifts; steering changes yaw independently of velocity. There is no guaranteed snow lane to the gate.
- **Local progressive ice failure:** seeded weak patches show branching fissures. Overspeed accumulates stress; above 60% load it creates a branching fracture under the car. Cracks spread for 2.2 seconds, then a local 5.5 m radius hole opens and broken fragments sink. Escape or slow before it starts; an entire 8 m road row no longer drops at once. Large crystal impacts also start smaller delayed fractures, so traversable areas change during the run.
- **Ship graveyard:** five collidable sailing hulls alternate through the lead and narrow bridge. Masts, torn canvas, rigging, leaning decks and icicles establish scale; three additional ships are frozen offshore. Hull collisions cost momentum rather than instantly ending the run.
- **Falling crystals:** random waves of 18–28 large crystals (8–16 m long) begin every 0.5–0.85 seconds, scattering 18–110 m ahead across the full passage and open shortcut. Placement does not use lateral position or velocity prediction. Staggered releases overlap into continuous showers; each crystal visibly drops from overhead and leaves a short-lived ice remnant. Muted ground rings mark impact areas. A hit slows the car, three disable it; a 0.65-second damage grace prevents overlapping impacts instantly consuming all three hits.
- **Same-loaded-world portal:** crossing the far ice gate changes the existing car state's coordinates to a separate landing at (245,1570) in the same Glacier scene. The landing is built at startup; the portal does not import a level or replace a scene. This landing is a blockout, not a completed second world.

HUD includes speed, elapsed time, remaining distance, surface, safe speed, ice stress, collapse gap, impacts, and a route map showing ships, collapse and the shortcut.

## Glacier validation and limits

`npm test`: **89 passing tests**, including preserved forest/garden tests and 33 Glacier tests. Coverage includes fresh/reproducible layouts, isolated snow grip, progressive local fracture/escape, crystal showers independent of driving aim, impact grace, pause/reset, and same-world portal coordinates. A spatial clearance test finds both left-side and right-side paths around hulls/ridges across 12 seeds. This checks static navigability with vehicle clearance, not successful human driving or survival of every randomized shower. The old narrow-lane full-drive regression was replaced: it is not evidence for traversal of this redesigned field. `npm run build` passes (shared Three.js size warning is nonfatal).

Browser smoke check: default Glacier renders without page errors; throttle changes position/speed; pause freezes state; reset clears hazards. New broad fleet field inspected in a browser capture. Full-route **human** balance and mobile/GPU performance still need playtesting. Browser checks used software rendering, not a hardware performance benchmark. This is a standalone single-player Three.js prototype, not native-engine integration or networked racing.

Glacier implementation: `src/glacier-level.js` (rules), `src/glacier-view.js` (procedural environment), `src/glacier-main.js` (runtime/HUD), `src/glacier-level.test.js` (tests). `src/bootstrap.js` selects the runtime. Development builds expose a read-only `window.glacierState` snapshot, not a teleport/cheat API.

---

# Archived study: Deadwood


Standalone browser prototype. Does not modify Project-Networking or claim to be an engine-integrated vehicle controller.

## Run

Node 22.12+ required.

```sh
npm ci
npm run dev
```

Open the served page. W/up accelerates, A/D or left/right steers, S/down brakes, R restarts, P pauses. Touch controls are included. `npm test` runs layout/geometry rules; `npm run build` creates the production bundle.

## Layout

One continuous 1,200 m winding passage, 30 m wide. Speed cap: 33 m/s (119 km/h), so the passage takes over 36 seconds before acceleration or avoidance. No laps. Muted soil, low-poly dead trees, rocks and a stone gate. The gate transfers the car to stone flats at (180, 1430) in the existing scene, not a scene load.

## Revised root simulation

The alternating line of single tubes has been removed entirely, including the equally spaced verge roots.

- Stochastic events use variable-rate intervals and occasional 2–5 eruption clusters. Each run gets a fresh seed. Tests can inject a fixed seed.
- Positions span the full passage and its verges, including central and near-car eruptions. There are no assigned left/right lanes, evenly spaced rows, or fixed root sections.
- Every root starts 0.65 m **underground**, with a 0.55–1.45 second fissure warning. Displaced earth bursts upward as the tip breaks the surface.
- Root graphs have 5–13 limbs across three generations. Children originate at actual parent nodes and only start when the parent reaches that junction. Swollen junctions and tapered limbs make the topology visible.
- Eruptions vary between upright shoots, diagonal trunks and low spreading roots. Each branch has its own speed, curvature, twisting phase, upward bend and thickening rate.
- Tips keep revealing new curved material-space geometry; existing branch nodes do not slide as roots elongate. Length and thickness continue increasing with age instead of clamping to a finished arch.
- Collision samples **all** emerged limbs, takes their current radius into account, and excludes branches above the car.
- Pausing freezes spawning and growth. Restart clears graphs, debris and warnings and chooses a new random sequence.

The short warning is intentional: arbitrary position/frequency does not mean an invisible instant collision. Deadwood pressure update: eruption events average roughly 0.44 s in the seeded distribution test, usually producing clusters of 2–5 networks (with occasional singles), roughly 6–7 networks per second before the active budget applies. Spawn lead adapts to speed: at the 33 m/s cap, roots begin about 111–209 m ahead, giving 3.4–6.3 s to emerge and grow before arrival. Events retry valid positions around a 40 m falling-tree exclusion instead of discarding entire clusters. Roots more than 60 m behind are retired; a 96-network cap bounds stationary allocation. The first event starts after 0.1 s, frame overruns catch up missed events, and roots near the finish never violate minimum lookahead just to fill the last metres. These are runtime limits, not a fixed race pattern. Near meshes update at 24 Hz and distant meshes at 12 Hz; growth time remains continuous. Four new regression tests cover density, growth before arrival, speed-aware/end-of-route bounds and timber clearance. Human difficulty and hardware performance still need playtesting.

## Scope / validation

Standalone single-player browser prototype, not yet native Frontier engine, production rigid-body physics, or networked gameplay. The stone flats are a landing blockout, not a completed second course. `npm test` covers minimum duration, branching attachment and birth timing, below-ground emergence, sustained growth, spatial/timing variation, finite geometry and child-branch collision. Human driving balance and mobile performance still require playtesting. No external art or services are required.


## Arches and falling timber

Root shape families now include broad rising/descending arches and hooks that double back, mixed with the original irregular twisting forms. Shapes belong to each limb, so a single network can contain several different curves while retaining attached junctions and ongoing growth.

Three authored tree encounters sit at 272 m, 603 m and 938 m. Approach triggers a 1.15-second shudder, then a 2.5-second accelerating fall. Collision follows the animated trunk **and branches**, not just the final resting pose. Dirt/clods burst at the end of the fall. Pause freezes the fall; restart restores upright timber and clears impact debris.

- The first and last trunks cover the whole main passage. Rough 170 m side tracks peel out into cleared forest, route around the hinge side, and rejoin. They are genuinely driveable; the old main-road-only clamp has been replaced by a union of allowed corridors.
- The middle tree catches in a standing fork, leaving a tested car-height opening through the middle. It also has an optional side route.
- Static forest is cleared around each detour. New random root origins are excluded within 55 m of these encounters to reduce overlapping blockages. Previously spawned, continuously growing limbs may still reach into these areas; this is not a guaranteed obstacle-free route under all random seeds.

Automated tests verify final full-width blockage, centre underpass clearance, collision-free detour centrelines against the tree geometry, reconnecting route bounds, warning/fall timing and the new curved-root forms. These are kinematic greybox falls, not rigid-body tree destruction. Human playtesting is still needed for steering difficulty and random-root overlap.

## Living-forest mechanics pass

All six approved additions are now part of the playable prototype:

| Mechanic | Greybox implementation |
| --- | --- |
| Ground heave / split | Four local ground patches crack, separate along a seam and rise over an underground root after a warning. The car follows the sampled surface height with pitch/roll and speed loss; flat shoulders remain. Dirt erupts as the ridge breaks open. |
| Closing routes | After the approach, a visible knotted root front advances behind the car at 12 m/s. A distance readout and urgent warning communicate pressure. Staying inside the closing front for a second ends the run. It spans both main and side routes. |
| Tightening arches | Three openings grow, hold open until age 6 s, then shrink and thicken over 8 s. The actual collision surface shrinks with the mesh. Outside shoulders remain available. |
| Connected reactions | Roots erupt beneath the authored tree hinges before the fall. At the first encounter, the first trunk strikes an opposite-verge tree after 3.5 s; the latter loses a low branch and falls outward, opening that verge while the first trunk blocks the main road. This is authored causal sequencing, not general-purpose physics propagation. |
| Mud / exposed roots | Four dark, rutted mud hollows locally reduce acceleration, braking effectiveness and steering grip, and retain lateral slide. Two pale root beds kick the wheels and scrub speed. Handling returns to normal on dry ground. |
| Breakable thin limbs | Sufficient speed snaps thin child roots and slender tree branches, with wood fragments and modest speed loss. Root descendants disappear too. Slow contact brushes thin roots; large roots and trunks remain solid. Broken limbs do not regrow or collide until restart. |

Pause freezes all six systems. Restart resets pursuit, terrain, arches, tree reaction state, broken limbs and debris. Static timber is batched into spatial chunks to reduce draw calls. A read-only `window.deadwoodState` snapshot is available in development builds for smoke testing, not production builds.

Validation: `npm test` now runs 26 tests, including a CPU-side Three.js rendering integration pass over all new environments, mesh finiteness and reset, root break propagation, shrinking opening collision, surface-aware collision, local surface zones and pursuit timestep consistency. A Chromium smoke test reached the driving state without page exceptions and verified pause stability and clean restart. It did **not** validate a full completed driving run or hardware/mobile frame rate; balance and those performance checks remain manual follow-up. This remains a lightweight kinematic greybox, not suspension or rigid-body terrain simulation.


## World 02 — Hunger Garden: organic terrain pass

The default preview opens **Hunger Garden**. Scene links open `?world=deadwood` or `?world=garden` for direct testing; these links reload the selected study. Deadwood's exit portal instead activates the garden at world X=2000 **inside the existing Three.js scene**, without another page/level load. Its old stone-flat landing remains unused blockout geometry.

### Maze, terrain and planting

- The 9 × 11 connectivity graph now maps into a **warped organic coordinate field**. Visible/collidable boundaries are curved capsule chains, surfaced as rounded earthen banks, exposed woody roots and narrow foliage—not rectangular green hedge boxes. All cells remain reachable, with loops and dead ends. The unwarped shortest route was 660 m; the physical path now bends with the terrain.
- **Five covered root-and-earth tunnels** occupy real openings on that route. They have opaque curved roofs, root ribs and high rootlets, clear vehicle-height passages and a lower chase camera inside. They are traversable portions of the maze, not separate scene transitions.
- The floor is a sampled undulating surface, with over four metres of height variation across the garden. The car follows the same height function with pitch/roll; climbing slopes costs some speed. This is kinematic terrain following, not full suspension physics.
- **196 low flower clumps** sit at the bank feet, alongside the existing giant flowers. Rounded pitcher plants remain bank-top landmarks, not a second capture mechanic.
- **145 stones** are scattered around the shoulders and corners. They collide with the vehicle, but placement excludes the centre lines of all open maze passages so they do not seal navigation routes.
- The minimap is an organic field sketch of visited banks and tunnel locations. **M** toggles the full structural survey. It never reveals buried traps. Gate distance is direct distance, not remaining driving distance.

### Concealed plants: readable cue, quick final strike

Most trap heads are fully buried, with no permanent mound/map giveaway. Each restart reshuffles their positions and concealed/exposed states; dormant concealed plants can also burrow to fresh reachable soil. Some exposed plants remain as requested.

The previous sub-0.8-second hard-pass bite was too severe. Current baseline:

1. **0.78 s soil-warning stage**, while a buried head is still hidden.
2. **0.26 s eruption**, with rock/soil clods, followed by a brief open pose.
3. **0.25 s final jaw snap**; capture becomes possible at age **1.25 s**.
4. Aim locks at **0.32 s**, early in the warning. Later steering/acceleration changes are not tracked. Stalk reach is reduced to **8.5 m** and capture radius to **3.1 m**.

Small rate variation gives roughly 1.18–1.30 s to first danger. Fast jaw motion is retained; it is the wind-up and commitment window that are more forgiving. Attack starts are staggered by 0.65–0.85 s; underground relocations are less frequent, cooldowns longer, and tunnels allow only one initiating hunter at a time. Active plants already encountered outside can finish their existing reactions. Heads re-bury after a missed hunt. Swept collision follows the moving mouth and respects maze banks. A capture draws the car into the jaws and offers restart.

### Explosive fireflies replace the old swooping insects

Fireflies hover low around bottom-level flowers. Their abdomens have subdued natural amber emission—no neon lighting, bloom, or cyberpunk materials.

- Approaching within **8.5 m**, with line of sight, starts a **1.35 s** swelling/flashing fuse.
- The insect commits to its location instead of chasing the car during the fuse.
- It bursts into a short dust/pollen cloud and fragments. The **6 m** blast radius scrubs speed and shoves the car, rather than instantly eating it. Leaving that radius or putting a bank between car and insect avoids the hit.
- No more than two fireflies arm at once. Swelling fireflies make active nearby plant attacks recoil/re-bury, preventing a forced plant-bite/explosion overlap. This can be used to bait a safer passage.
- Each firefly recovers only after 7.5 s. Pause freezes its fuse and particles; restart clears all explosion state. No additional insect species are added in this pass.

### Controls and validation

**W/up** accelerate; **A/D or arrows** turn; **S/down** brake/reverse; **R** restart the current study; **P** pause; **M** survey. Touch driving controls remain. The far gate completes the study; no third world is implemented.

Garden simulation consumes elapsed time in <=1/60 s slices with a 250 ms stall cap. Rendering uses a 1024 px shadow map, a 1.5 pixel-ratio cap and material-batched static geometry. Read-only `window.gardenState` exists in development builds for inspection.

Current validation: **56 automated tests**, including maze connectivity/openings, curved-bank collision, tunnel placement and clearance, sampled terrain agreement, finite generated meshes, stone-route clearances, low planting, concealed warning/commit timing, actual driving escape from a seeded ambush, firefly fuse/radius/one-shot/reset behavior, bank shielding, recoil interaction, pause and elapsed-time integration. Chromium smoke checks verified the organic scene renders without page errors, starts driving, pauses and resets. Full-route human balance and hardware/mobile frame-rate testing remain unverified. These are procedural browser greyboxes, not native Frontier engine or networked gameplay integration.
