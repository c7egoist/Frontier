# Frontier — Road Designer

Robust, game-engine-ready road network editor in a single HTML app. Built for the `arena/378a7d3e-frontier` session.

**Live preview:** `dist/index.html` is committed with relative asset paths — open directly via raw.githack:
`https://raw.githack.com/c7egoist/Frontier/arena/378a7d3e-frontier/dist/index.html`

Or locally:

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # -> dist/
```

---

## Highlights

### 2D / 3D split view
- Left pane — 3D perspective (iso / front / orbit, fog, hemisphere light).
- Right pane — 2D plan (top-down, orthographic-leaning, no rotation). Both panes render the same scene graph (splines, spans, junctions) and share selection, snap hints, and history.
- Drag the centre divider (⋮) to resize 25–75 %. Both views stay in sync — selecting a node, spline or joint in one highlights it in the other.
- View bar is global: `Iso` / `Top` / `Front` / `Frame` affect the 3D pane and refit the 2D plan to bounds.

### Watertight junctions — “clean geometry”
- Fork of the **RoadWorks v3 topology** (`arena/01a10cf3-frontier`): one dense polyline per spline, splits at shared nodes + node-on-curve touches + exact XZ crossings (height gate 1.2 m), merges closer than 0.6 m, seeks landings across gaps — so crossings/touches never slip into overpasses by accident.
- Junctions derive **from trimmed span ends** (TransitArchitect / GRIT rule): `3+ legs` or `2 legs ≥15°` become a merged junction with true circular fillet arcs, curb/pavement offsets pinned exactly to span boundaries, and a tub (side walls + bottom membrane) sharing the span bottom edge. No gaps, no overlaps, no narrow slivers.
- Curvature-safe frames: signed curvature radius per station clamps road/pavement offsets (`SAFETY 0.9`) and smooths them — pavement can never invert on tight curves.

### Single-handle joint gizmo
- Selecting any auto-generated **JOINT** (junction badge) adds a **white joint gizmo** in *both* panes, 1.1 m above the tub centre.
- Drag with the Slate translate gizmo (cones X red / Y green / Z blue, quads, white view-ring). The handle translates **every incident spline endpoint** that participates in that joint by the same world delta — watertight by construction, no re-trim needed.
- For node-fused joints, coincident endpoints move together; for interior-crossing “auto” joints (X / T where a curve crosses a span interior), the nearest control node of each arm rides with distance falloff so the joint visibly migrates.
- Inspector `Joint handle` section explains the semantics.

### Slate gizmo (all objects)
- Port of `Frontier/Engine/Editor/GizmoFigures.cpp` + `SlateGizmo.tsx`: cones, corner quads (cyan/magenta/yellow) with two opaque edges, billboarded white ring, constant screen size (`pixelSize`), axis / plane / view-plane drags, `Ctrl` → snap 0.25 m (Blender rules). Used for nodes, spline centres, Bezier handles and the joint handle.

### Paving patterns
Per-spline `Paving pattern` section:
- `plain` (no overlay) · `ashlar` · `herringbone` · `basket` · `stretcher` · `cobble` · `hex` · `diag`
- Parameters: `Tile scale` (0.25–1.2 m), `Mortar gap` (0.5–6 cm), `Colour A / B / Mortar` (colour pickers). Overlay is a thin patch set (`+1.5 cm` above pavement) subdivided along the alignment into bricks with gap insets so the base pavement shows as mortar. Herringbone offsets every other row, basket weaves 2×2, stretcher staggers, cobble jitters and variegates.
- Demo: *Shore Road* herringbone, *Diagonal* basket, *Causeway* ashlar.

### Drainage
Per-spline `Drainage`:
- `Enabled`, `Style` (`grated` / `slotted` / `channel`), `Grate spacing` (3–14 m), `Channel width` (0.18–0.6 m), `Gutter depth` (3–16 cm).
- A shallow V-channel is tucked against each pavement edge (inner / gutter / outer) even on bridges, with `0.45·chW` depth. Periodic grates/slots are oriented to the road tangent: `grated` = 4-bar grated lid, `slotted` = long dark slot, `channel` = sparse inlets. Sides alternate so the road never reads as a trench.

### Guardrails, paving, bridges (done better)
- **Guardrails**: W-beam profile (5 offsets from `height·0.4` to `height·0.8`), posts `0.15 m` square oriented to the road tangent, `postSpacing` slider, landing links bend rails onto adjoining bridge parapets (smooth `3 m` length).
- **Bridges**: Re-uses the RoadWorks beam/arch generator (slab / I-girder / box, diaphragm, pier styles single/bent/wall/hammerhead/portal, round/square columns height-adaptive `colH/12`, spread/pile foundations, cantilever/stub/spill abutments, arch parabolic ribs). Bridge decks also receive paving & drainage overlays where enabled.
- **Road markings**: dashed amber centre line, solid white edge lines, dashed lane dividers with per-lane phase offset — lifted `0.02 m` to avoid Z-fighting. Controlled via `CrossSection` toggles.

### Exchange — fixed
- **OBJ**: `networkToObj` iterates `spans` then `junctions`, maps `roadToWorld` (road `x,y,zUp` → world `x,zUp,-yFwd`) with stable `o spanN_name` names, correct triangle winding (`a-d-b / b-d-c`). Includes paving & drainage meshes.
- **JSON**: full `Project` round-trip including `paving` & `drainage`. `migrateProject` fills missing fields from `defaultPaving`/`defaultDrainage` for backwards compatibility.
- **Import** via Inspector → *Exchange → Import* or File menu; drag-to-save uses `downloadText` Blob API.

### Editor chrome (Slate seating)
- Black trapezoid tabs, `#2a2a2a` selection, black pill fields, white slider grabs (`--frame: #000`), `#2e2e2e` separators — matching `Exhibits/Gallery/Editor` proofs. Outliner, Inspector, MenuBar, status bar, viewport hints retained.

---

## Project model

```
Project { splines[], junctions{cornerRadius,filletSteps,depth,inset}, scene{groundZ,waterLevel,drawHeight} }
Spline { nodes[], closed, visible, color, cross, paving, drainage, bridge, rails }
CrossSection { preset,width,lanes,paveLeft, paveRight, curbHeight, crossfall, showCenter/Edge/LaneLines }
PavingSettings { pattern, scale, gap, colorA, colorB, mortar, enabled }
DrainageSettings { enabled, style, grateSpacing, channelWidth, gutterDepth, slope }
BridgeSettings { enabled,type,superstructure,deckDepth,girderDepth,diaphragms,pierSpacing,pierStyle,columnShape,pierSize,foundation,abutment,archRise,parapet }
RailSettings { enabled,height,thickness,posts,postSpacing }
```

Splines are cubic Bezier chains (`handleIn` / `handleOut` per node). World `X right, Y up, Z toward viewer`; generator works in road space `x right, y forward, z up` via `worldToRoad` / `roadToWorld`.

---

## Controls

- `V` select · `P` draw · `H` pan · `G` grid · `F` frame · `1` iso · `2` top · `3` front · `Esc` clear
- `Ctrl+Z` undo · `Ctrl+Y` / `Ctrl+Shift+Z` redo
- Draw: click ground to append node (snaps to nearby nodes/curves), click spline endpoint to extend. Right-drag orbits, wheel zooms, middle pans.
- Select: click node/spline/joint badge or Outliner row; gizmo drag moves, `Ctrl` snaps, `Del` deletes.
- Joint: click the `JOINT` badge or nearby white handle — drag the gizmo to relocate the whole intersection.

---

## Topology note

Only the graph-building philosophy is taken from `arena/01a10cf3-frontier`:

> sample → split (shared node + touch 0.5 m + crossing exact XZ with 1.2 m height gate + seek landings 1.2 m road / 2.5 m bridge) → MERGE_ARC 0.6 m → runs → trim by `cornerRadius` (TA rule) → one span per run → merged junctions from approach frames.

All surfacing (paving pattern overlays, drainage V-channels & grates, rail bends, bridge superstructure, markings) is rebuilt here with cleaner, more game-ready tessellation.

---

## File map

```
src/
  App.tsx              state, history, snap, joint-handle move
  app.css              Frontier seating + split-view grid
  components/
    Viewport.tsx       2D/3D split panes, SceneContent, JunctionGizmo
    SlateGizmo.tsx     translate gizmo (axis/plane/view)
    PatchMesh.tsx      BufferGeometry from PatchSpec grid
    Inspector.tsx      per-spline + joint + scene panels (paving, drainage, guardrails, bridges)
    Outliner.tsx       splines + auto junctions tree
    MenuBar.tsx        File/Edit/Spline/View
    controls.tsx       Slider/Toggle/Segmented/Section
  lib/
    model.ts           Project/Spline types + defaults + demo
    network.ts         TA graph → spans + merged junctions
    roadGeometry.ts    frames, cross-lines, markings, end-caps, paving, drainage, merged junctions
    bridgeGeometry.ts  beam/arch super- & substructure
    vec.ts             world↔road, Bezier, Coons, arcLengths
    gizmoMath.ts       axisParam/planePoint under ray
    editing.ts         snapTarget (node/curve)
    history.ts         undo/redo
    exportObj.ts       OBJ (world space) + downloadText
```

---

## Commit

`npm run build` outputs `dist/` with `base: './'` so raw.githack serves assets relatively. `dist/` is committed on this arena branch.
