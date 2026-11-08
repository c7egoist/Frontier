# Scene 04 — Iron Tide / working scrapyard

A separate scrapyard study, now the default preview. **No continuous track, painted racing line or reserved safe lane.** Stacked wrecks, compacted car bales, corrugated metal shacks, rubber-tyre heaps and working crawler cranes divide a broad, bending yard into competing alleys and courts. Hazards change the usable gaps while you drive.

## Run it

```sh
npm ci
npm run dev
```

Open the preview, or use `?scene=scrapyard`. Earlier studies remain under **01 / DEADWOOD**, **02 / THE HUNGER** and **03 / ICEBOUND**. Everything is generated locally; no external asset/CDN requests. Desktop keyboard and WebGL are required. On low-powered machines, add `&quality=draft` (or `?quality=draft` without other parameters) for reduced rendering resolution and no expensive real-time shadows; geometry and physics stay the same.

- **W / arrows:** accelerate; **S:** brake, then reverse; **A/D:** steer.
- **Space:** hard brake. Release W to shed speed more quickly.
- **R:** fresh yard, scrap and hazard seed. `?seed=91` fixes the seed for repeatable comparisons.
- **C:** chase / bonnet camera. The chase camera retracts against scrap piles and shacks.
- **V:** inspect; drag to orbit and scroll to zoom. **P:** pause/resume machinery and debris.
- **Controls / Escape:** pause and open field notes.

This is a **1,900 m point-to-point** section, not a lap circuit. A 32 m/s maximum speed gives a theoretical 59.4-second lower bound even before bends, braking and weaving. There is no arbitrary countdown or advancing kill wall.

## Navigation, not another straight track

The yard's envelope bends and widens. Seeded wreck/bale islands, shacks and tyre heaps occupy the interior, not merely its margins. The default inspection seed has **159 salvage islands**, including **13 shacks and 40 tyre heaps**, plus eight crawler bases. Piles contain individual car silhouettes at different heights, crushed lower layers and compacted metal; they are not just featureless walls.

Generation checks a forward-connected 6 m clearance grid, retries obstructed layouts and removes blocking islands only as a fallback. It does **not** carve a protected middle road. Left- and right-biased connectivity probes take substantially different routes. Inspection outlines show obstacle footprints, never a recommended racing line.

The grid is a validation/navigation helper, **not an automatic driver or a promise that a gap stays safe**. Real crane falls, dropped cargo and magnetic fields can invalidate a formerly useful choice. Reverse, brake, wait for a field to release, or take another alley. Light ground scrap can be pushed; heavy scrap and fallen booms are blockers.

## Actual magnetic forces

Eight cranes automatically wake on approach. Their warning, pull, release and failure cycles run without demonstration buttons:

1. A 1.45 s wind-up precedes the strong field; attraction ramps up rather than instantly teleporting targets.
2. A hanging industrial disc magnet slews slowly around a fixed base orientation.
3. Metal bodies receive inward and upward acceleration. Strength falls off toward the 45–55 m field boundary and scales inversely with mass.
4. Loose cars, panels, beams and bales can slide, rise and attach underneath the magnet. Accessible salvage is also liberated from nearby heap tops while the crane works.
5. **The player's car uses the same field.** It can slide sideways, lose tyre contact, lift above the wrecks and be held under the magnet. Remaining captured for 2.3 s loses the run.
6. Leaving the weaker outer field before the tyres lift is a real escape. Releasing the field drops the vehicle; a hard landing can damage its hull.

Rubber is not magnetic. Bulk heap footprints, fences and anchored structures are static obstacles; this is not a full rigid-body simulation of every decorative car or tyre. Dynamic metal and the vehicle have explicit velocity, gravity, support, contact, attraction and capture state. Static heap support heights are conservative approximations.

## Loads drop; cranes can come down too

Each crane starts with seven attached pieces and can capture more. A normal work cycle releases its actual attached bodies, which fall, hit, bounce and remain as physical scrap. These are not cosmetic disappearance effects.

A seeded **16% malfunction chance per cycle** instead produces a distinct buckling warning, then a 2.8 s structural collapse. The lattice boom, cable, head and attached load move together as the crane falls. On impact the load releases, and the fallen boom remains a capsule collider across the yard. Nearby vehicle impacts and falling metal damage a 100-point hull, with a short hit cooldown to prevent one impact being charged every frame.

## Hovering cargo carriers

Six industrial quad-rotor cargo drones operate independently. They travel to randomized targets roughly 80–135 m ahead, hover over a dark ground shadow for 1.3–1.95 s, and dump **five physical pieces** in succession. They depart and repeat. Their targets and timing are not selected by the driver.

Falling cargo can damage the car; grounded pieces obstruct or can be pushed according to mass. The finite pool holds 240 metal bodies and recycles distant, settled debris rather than deleting visible foreground loads. Drop shadows and impact fragments help expose the danger without neon lighting or science-fiction force bubbles.

## Inspect the logic

Choose **Inspect the blockout**, then:

- **Test magnet attraction:** places the real player car in the first crane's field. Watch horizontal pull, lift and capture.
- **Watch a crane load drop:** advances a crane to its release point.
- **Watch a crane collapse:** stages its structural malfunction while keeping the observer car clear.
- **Watch hovering cargo drops:** stages a nearby carrier finishing its approach, then lets its automatic hover/drop/depart cycle run.
- Section buttons jump to the different courts; the final button is an explicitly marked portal test.
- **New yard / restart** returns to a fresh driving attempt.

These are labelled staged studies. Ordinary play triggers the same simulation automatically. Inspection leaves machinery physical but does not start the driving clock; pausing machinery freezes its force and debris updates too.

## Same-map portals and interchange

Forest → garden → glacier → scrapyard → onward pad are built at startup in **one shared Three.js scene**. The glacier's former landing at `(2700, 5600)` is now the scrapyard entrance. The yard's far gantry transfers the car to `(4100, 7900)` without changing level, fetching another scene or navigating the browser. The onward pad is a terminal preview area, not a fifth playable study. R there restarts Iron Tide.

- `src/scrapyard.js`: seeded layout, reachability, crane/magnet/body/drone simulation, vehicle controller and camera collision.
- `src/scrapyard-world.js`: industrial geometry, instancing, animated crane/drone/body visuals and scenery-sector culling.
- `Content/Scenes/IronTide.gltf`: standalone static Scene 4 survey, including all salvage sectors, eight cranes, six drones and player spawn.
- `Content/Scenes/IronTide.layout.json`: seed 91 footprints, initial bodies, crane/drone state, timing/force contracts and portal destination.
- `Content/Scenes/Deadwood.gltf` / `.layout.json`: refreshed combined four-study interchange.

Rebuild exports with `npm run export:scene`. The standalone yard is about 4.9 MB; the combined scene about 30.8 MB. Importers must support `EXT_mesh_gpu_instancing` and `KHR_materials_unlit`. Both have been round-tripped through Three's glTF loader, retaining all eight cranes and six drones. Existing non-PBR material recommendations from the garden/root exporter are nonfatal.

**glTF is a static survey, not the gameplay runtime.** Magnet forces, crane/drone state transitions, collision, vehicle control and portal transport live in the browser sources. The native networking client is untouched; native engine integration remains separate work.

## Verification and limitations

`npm test`, `npm run test:browser`, `npm run build`, `npm run export:scene`.

The Node suite includes 18 scrapyard checks: connectivity and distinct route choices across 20 seeds, reproducibility, bounded crane slew, material-sensitive attraction, actual player capture and outer-field escape, attached load release, boom collapse/collision, automatic drone drops, real fall damage, pushable scrap, hit cooldown, camera retraction, finite rendered matrices and a forward-only portal aperture. The full suite retains the 59 earlier study checks. Scrapyard browser checks use draft rendering for software Chromium; magnetic capture, mesh height, physical load release, completed crane collapse, drone drops, pause, retry and same-map transfer still use the actual runtime.

A development route-following controller completed two of five sampled seeds with live hazards (97–102 s, 90–100 hull). The other three became stuck; this is evidence of possible completion, **not a human win-rate or a guarantee for every dynamic arrangement**. Static reachability and physical escape tests do not replace playtesting. Collision/support shapes and falling debris are deliberately lightweight greybox approximations rather than a general rigid-body engine.
