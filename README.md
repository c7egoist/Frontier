# Frontier — Procedural Tree & Plant Generator

A production-oriented vegetation generator that outputs **one closed, manifold quad mesh** per
plant — no intersecting tubes, no "place a twig on a branch" merges. Branches grow *out of* their
parent's surface through shared edge loops, forks are true Y-crotches, grass blades and culms grow
out of a welded crown the same way, and every vertex carries wind data so the whole plant bends as
a single skin. 49 tree species and 30 grass / succulent species ship as presets.

```
npm install
npm run dev        # http://localhost:5173
npm test           # topology / determinism / export suite
npm run build      # static bundle in dist/
```

## What it does

| Stage | Module | Summary |
|---|---|---|
| Botany | `src/tree/skeleton.ts` | Weber–Penn parametric model (SIGGRAPH '95): per-level curvature, S-curves, clones/splits, phyllotactic child placement, crown-shape length envelopes, taper, root flare, tropism. 49 tree presets grouped by biome (oaks, forest broadleaf and conifers, jungle, savanna, desert, rocky terrain) in `src/tree/params.ts`, including ribbed cacti, flattened Opuntia pads, and clustered desert columns. |
| Meshing | `src/tree/mesher.ts` | **Welded quad mesher** (below). Emits quads only, plus ≤1 triangle per tip cap for odd ring counts. |
| Validation | `src/tree/validate.ts` | Half-edge style audit: boundary edges, non-manifold edges, winding consistency, degenerate faces, isolated vertices, connected components, Euler characteristic / genus, valence histogram. |
| Wind | `src/viewer/shaders.ts` | Three-tier vertex wind (trunk sway ∝ height², limb bending about a per-limb pivot with phase, twig/leaf flutter). Data is baked per vertex by the mesher. |
| Grasses | `src/plant/grassMesher.ts`, `src/plant/grassParams.ts` | **Welded grass mesher** (below): crown dome, leaf blades, culms with nodes/sheaths/leaves and four inflorescence types, all one closed quad manifold. 30 species across turf, meadow, tussock, cereals, reeds, and fleshy desert rosettes. |
| Export | `src/tree/export.ts` | OBJ with **quads preserved** (for Blender/Maya/ZBrush), GLB (triangulated) with wind data in `COLOR_0` and level/junction flags in `TEXCOORD_1`. |
| UI | `src/main.ts`, `src/ui/*` | Three floating cards in the SolidArc panel language: **Library** (species browser grouped by biome and plant family, search, census), **Viewport** (display modes shaded / clay / wire / levels / junctions / wind, pill toolbar, camera read-out, exact fit-to-view framing from 10 cm turf to 70 m redwoods, key hints), **Inspector** (hero card with height + mesh census, presence grid, tabs Botany · Roots · Mesh · View · Topology for trees and Grass · View · Topology for grasses, with tick-track sliders, steppers, per-level tables with drag-to-scrub cells, and a command line: `seed 42`, `preset oak`, `mode wire`, `export glb`, `help`). Generation runs in a Web Worker. |

## The welded mesher

Each stem is a tube of rings bridged by quads. The two junction types:

**Side branch (L-join).** A rectangular window of `w × h` cells is removed from the parent's ring
grid. Its boundary is a closed loop of `2(w + h)` vertices; the child's first ring is created with
exactly that many vertices and bridged to the loop through `collarRings` intermediate loops that
follow a quadratic fillet (tangent to both surfaces). The child's first ring is mitred toward the
parent surface so the collar quads are evenly sized above and below the branch. Parent rings are
inserted at the window edges so the window is approximately square; windows that would overlap
are shifted along/around the parent (the child subtree is moved with them) and, only as a last
resort, the child is dropped (reported in the UI — typically 0–3 stems on a 2,000-stem oak).

**Fork (Y-join).** The parent's end ring is divided into one arc per child at radius-weighted
bisectors. From each split vertex a chain of vertices rises to a hub above the fork point (the
crotch bridge). Each child's base ring is *its arc + the bridge*, so siblings share the crotch
edges instead of being placed on top of each other.

Radius follows the pipe model past every junction (`forkRadiusConservation` blends between
Weber–Penn "keep radius" and the da Vinci area rule). Because the parent's shoulder falls inside
the window, the collar reads as a real branch collar rather than a cylinder poking out.

Result: `V − E + F = 2`, zero boundary edges, zero non-manifold edges, > 99.8 % quads on every
preset × seed in the test matrix.

## The welded grass mesher

Grasses are not trees with the trunk removed: a tussock is a few hundred organs sharing one crown,
each organ a few millimetres wide. `src/plant/grassMesher.ts` builds every grass plant as **one
closed quad manifold** — the same guarantee as the trees, with no triangles at all:

* **Crown.** A grid dome (an elliptical disc mapped onto a `K × K` lattice, `K` derived from the
  tiller count) whose cells are the attachment windows: 1 × 1 / 1 × 2 / 2 × 2 cells per leaf blade,
  larger blocks per culm. Below the ground the dome continues as an inset rim skirt and a ladder
  cap, so the plant is closed and can sink into the soil (`crownSink`).
* **Organs.** Blades, culms, culm leaves, inflorescence branchlets, spikelets, bristles and awns
  are all tubes grown from a window in their parent's ring grid through the same collar loops
  (Bézier fillet) the tree mesher uses. Windows are planned on the parent's ring stations before
  the parent is meshed, so no window ever straddles a ring and no two windows overlap.
* **Blades.** Cross-section `bladePoint`: a 4-vertex strip, or a 6/8-vertex keeled section with a
  `rolled` parameter that curls the section into an arc (fescues, marram). Length, width, lean,
  droop, twist and a sine wave are all per-species with per-blade variation; a `centreBias` grows
  the inner tillers taller or shorter than the rim.
* **Culms.** Hollow-looking stems with nodes at `((k+1)/(n+1))^1.25` of the length, a swelling at
  each node and a +45 % sheath above it; distichous leaves leave the sheath top through their own
  window, the flag leaf is the shortest. Culms nod (`nod`) under the weight of the head.
* **Inflorescences.** `spike` (two opposite spikelet rows with awns — wheat, barley), `foxtail`
  (dense whorls of bristles — timothy, fountain grass, elephant grass), `panicle` (golden-angle
  branchlets with optional secondaries, spikelet bulges and awns — meadow grass, oat, red oat grass)
  and `plume` (soft drooping branchlet fans — silver grass, pampas, reed). Every head part shares a
  single ring-row height on the rachis so the windows tile cleanly.
* **Wind.** `height` is normalised by the real plant height; `limb` runs along each organ with the
  pivot at its base on the crown (culm children pivot at the culm base); `phase` is per tiller;
  `detail` is a flutter weight that fades out for small plants so lawn turf doesn't jitter.

`Lawn Turf` (330 blades) is 14.5 k faces, `Wheat` 9 k, `Meadow Grass` 67 k, `Pampas Grass` (24 culms,
plumes with secondaries) 305 k — all genus 0, zero dropped organs, on every seed in the test matrix.

## Desert library & review gate

The desert shelf is the default view and is deliberately split into two geometry families:

* **Cacti / woody desert plants** use rib corrugation, helical rib twist, areole tubercles,
  flattened pad cross-sections, and spine clusters placed at those same surface stations. The
  catalog includes Saguaro, Organ Pipe, Golden Barrel, Fishhook Barrel, Prickly Pear, Cholla,
  Ocotillo, Cardón, Pincushion, Claret Cup, Mexican Fencepost, Senita, Texas Rainbow, and
  Lady Finger, Blue Myrtle, Peruvian Apple, and Totem Pole Cactus, plus Ponytail Palm.
* **Succulent rosettes** use thick keeled blades grown through crown windows rather than flat
  cards: Agaves, Aloe, Sotol, Echeveria, Haworthia, Jade, Blue Agave, Red Yucca, Beargrass,
  Dudleya, Living Stones, Snake Plant, Queen Victoria Agave, Aloe Ferox, and Yucca Rostrata. The species palette is kept in the viewer so blue
  waxy rosettes, blue-green agaves, cactus tissue, and ivory spines do not all render as generic
  brown bark.

Before a desert preset is considered catalogued, `npm run verify:desert` builds seeds 1, 7, and
42 and rejects non-finite vertices, disconnected or non-manifold surfaces, dropped organs,
degenerate faces, under-resolved silhouettes, and quad ratios below 99.5%. Use the existing
`tools/screenshot.mjs` harness with a Chromium path for the final image review; topology passing
is never treated as a substitute for looking at the silhouette.

## Wind

Per-vertex attributes baked by the mesher:

* `height` — normalised height, drives the trunk's cantilever sway;
* `limb` + `pivot` — distance along the limb from its root (0 on the trunk) and the limb's root
  position; the shader rotates the vertex about that pivot. Twigs inherit it from their limb;
* `phase` — per-limb random phase so limbs don't move in lockstep;
* `detail` — high-frequency flutter weight for twigs and leaves.

Because junctions are shared topology, the deformation is C0-continuous through every collar.

## Verification tooling

`tools/*.mjs` drive a headless Chromium (SwiftShader WebGL2) against the dev server to capture the
full tree, close-ups of specific junction types, display modes and the wind deformation. They were
used to review the results in this repository; they require `puppeteer-core` and a Chromium binary
(`CHROME_PATH`).

`scripts/probe.ts` (trees), `scripts/grassProbe.ts` (grasses), and `scripts/desertProbe.ts` (the
strict desert review gate) run the full pipeline headlessly and print the topology audit per preset
× seed: `npx vite-node scripts/grassProbe.ts "" 1,2,3`.

`npm test` covers every preset (49 trees + 30 grasses / succulents) × 3 seeds: closed, manifold, consistently
wound, one component, genus 0, quad ratio, drop budget, wind attribute ranges, determinism and
the OBJ/GLB/GPU exporters.

## Scope of this phase

Form and topology are the source of truth: the preview now applies species-appropriate solid
material palettes, while tree foliage and cactus spines remain lightweight proxy cards. PBR bark /
blade texture atlases, UV packing, LOD chains, and detailed leaf cards are still the next production
step; the quad flow and UV seams are already laid out to make that straightforward. Succulents
reuse the welded crown / organ window machinery instead of faking volume with intersecting cards.
