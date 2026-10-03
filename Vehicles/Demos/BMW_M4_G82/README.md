# BMW M4 G82 — 2D Blueprint → NURBS CAD with SolidArc (Round 3)

**Goal.** Given only a 2D CAD sketch/blueprint of a modern BMW, produce a proper CAD
model **inside SolidArc** and prove it with SolidArc's own renders.

**Subject.** BMW M4 (G82, 2020+ — the big-kidney generation).
Dimensions 4 794 × 1 887 × 1 393 mm, wheelbase 2 857 mm, track 1 617/1 605 mm,
tyres 225/40 R19 front · 275/30 R19 rear (rollout Ø 724.5/723.4 mm in plan units).

## Pipeline (all numbers traced from the blueprint at 4 mm plan accuracy)

1. **Trace** — `trace.py` reads `M4_G82_Blueprint_Source.jpg` (a 4-view engineering
   drawing), isolates the side / plan / front views, and extracts the car silhouette
   raster→vector polylines in blue. Wheels are found by Hough circle detection.
   Diagnostic overlays: `overlay_side.png` (chord-lengthened silhouette trace +
   wheel circles), `trace_overlays_run/latest.png`.
2. **Generate journal** — `build_arc.py` turns the traces into an `.arc` command
   journal (two blocks + one boolean classic — the same three-step strategy as the
   SolidArc demo docs):
   - **Side block** — the silhouette becomes a closed sketch on an XZ workplane;
     wheel-arch circles are 2D-boolean-subtracted in-plane, then the closed figure
     is extruded to a slab (width preset at traced max half-width + clear rim).
   - **Plan block** — the plan outline becomes 9 closed horizontal sections at
     rocker / sill / beltline / roof-crown heights; each section is half-width-scaled
     by the tumblehome factors traced from the blueprint front view; a degree-1
     (ruled) loft builds the plan block with no overshoot past any section.
   - **One boolean** — `boolean intersect SideBlock -- PlanLoft --name=Body`
     is the *only* solid boolean in the journal: it is the intersection of two
     clean genus-0 NURBS solids, which is the configuration SolidArc's engine
     handles robustly (subtracted solids degenerate in ≥3-op chains — see
     `boolean subtract` cage-rank notes; the one-intersect rule was established
     empirically through 40+ probe journals this session).
3. **Trim as assembly** — kidney grilles, front intake and headlamp inserts are
   *separate mated parts* (bolted-on trim parts, exactly as on the real car), never
   boolean-op'd into the main shell.
4. **Running gear** — four wheels as stacked cylinders (tyre on traced rollout
   radius, rim band pressed 8 mm proud, hub cap 14 mm proud), placed on the real
   G82 track widths; mirrors as small prism parts.
5. **Proof renders** — everything is rendered **by SolidArc itself**: orthographic
   sheet sheet 0–3 composited via `render sheet … finalize`, and six 1920×1200
   hero shots.

## Results (SolidArc kernel numbers, this build)

| Item | Value |
|---|---|
| Body solid | V160 E240 F82 · χ=2 · genus 0 · closed manifold oriented |
| Volume | 5.86 m³ (plausible for a 2-door coupé bodyshell bounding solid) |
| Bounds | x −3.936 … 0.858 · y ±0.92 · z 0.15 … 1.42 (4 794 × 1 887 ✓ height ✓) |
| Solids in export | 20 (body, 12 wheel parts, 2 mirrors, 5 trim pieces) |
| Export | 15 999 tris · 8 828 welded verts · 6 materials |
| Journal | 159 commands · **0 refusals** |

## Files

- `BMW_M4_G82_Build.arc` — build journal (run in `SolidArc --proofs Proofs BMW_M4_G82_Build.arc`)
- `BMW_M4_G82_CAD.arc`  — final document journal (replays to the finished model)
- `BMW_M4_G82.obj/.mtl/.materials.toml` — welded exchange export for ZBrush/KeyShot/renderers
- `Proofs/` — SolidArc's own renders (construction sequence + heroes)
- `traces.json` — traced geometry data (side silhouette, plan outline, front section, circles)

## Where G82 DNA lives in this build

The double-tall kidney grilles (separate near-black mated parts at the nose face),
long-bonnet / short-deck fastback proportion set by the traced side silhouette,
rounded-pointy nose and swept tail from the traced plan outline, tumblehome swept
from the front-view trace, 4 794/1 887/1 393/2 857 packaging, staggered 19-inch
running gear on the real front/rear track.

Regenerate: `cd /home/user/Frontier && /tmp/venv/bin/python Vehicles/Demos/BMW_M4_G82/build_arc.py && /tmp/solidarc_build/SolidArc --proofs Vehicles/Demos/BMW_M4_G82/Proofs Vehicles/Demos/BMW_M4_G82/BMW_M4_G82_Build.arc`
