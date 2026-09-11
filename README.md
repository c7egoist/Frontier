# Frontier — Procedural Tree Generator

A production-oriented tree generator that outputs **one closed, manifold quad mesh** per tree —
no intersecting tubes, no "place a twig on a branch" merges. Branches grow *out of* their parent's
surface through shared edge loops, forks are true Y-crotches, and every vertex carries wind data
so the whole tree bends as a single skin.

```
npm install
npm run dev        # http://localhost:5173
npm test           # topology / determinism / export suite
npm run build      # static bundle in dist/
```

## What it does

| Stage | Module | Summary |
|---|---|---|
| Botany | `src/tree/skeleton.ts` | Weber–Penn parametric model (SIGGRAPH '95): per-level curvature, S-curves, clones/splits, phyllotactic child placement, crown-shape length envelopes, taper, root flare, tropism. 30 species presets grouped by biome (oaks, forest broadleaf and conifers, jungle, savanna, desert, rocky terrain) in `src/tree/params.ts`. |
| Meshing | `src/tree/mesher.ts` | **Welded quad mesher** (below). Emits quads only, plus ≤1 triangle per tip cap for odd ring counts. |
| Validation | `src/tree/validate.ts` | Half-edge style audit: boundary edges, non-manifold edges, winding consistency, degenerate faces, isolated vertices, connected components, Euler characteristic / genus, valence histogram. |
| Wind | `src/viewer/shaders.ts` | Three-tier vertex wind (trunk sway ∝ height², limb bending about a per-limb pivot with phase, twig/leaf flutter). Data is baked per vertex by the mesher. |
| Export | `src/tree/export.ts` | OBJ with **quads preserved** (for Blender/Maya/ZBrush), GLB (triangulated) with wind data in `COLOR_0` and level/junction flags in `TEXCOORD_1`. |
| UI | `src/main.ts`, `src/ui/*` | DCC-style parameter panel (per-level tables, drag-to-scrub fields), display modes (shaded, clay, quad wire, levels, junction loops, wind weights), topology report tab. Generation runs in a Web Worker. |

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

## Scope of this phase

Form and topology only: solid-colour materials, proxy leaf cards. Bark textures, UV layout for
atlases, LOD chains and detailed leaves are the next step; the quad flow and the UV seams are
already laid out to make that straightforward.
