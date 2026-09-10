# Frontier in Unreal Engine 5

## Import

1. Generate a tree:
   `python tools/frontier_cli.py generate --preset oak --seed 1 --out out/oak --format glb`
2. Drag `oak_01_lod0.glb` into the Content Browser (glTF importer is
   built into UE 5.x). You get one Static Mesh with 2 sections/material
   slots: `bark` (opaque) and `leaves` (masked, double-sided).
3. Vertex colors (`COLOR_0`) and extra UVs arrive intact:
   * UV channel 0 — bark/leaf UVs
   * UV channel 1 — legacy lightmap slot (auto)
   * UV channel 2 — `pivot.xy`
   * UV channel 3 — `(pivot.z, flutter)`
   * Vertex color — `(weight, phase, ao, level01)`

   (If your importer shifts channels, open the mesh in the Static Mesh
   editor and check UV Channels; adjust the TexCoord indices below.)

## Wind material (bark)

Create `M_FrontierBark`, blend Opaque, and build:

* `VertexColor[R]` → `Weight`, `VertexColor[G]` → `Phase`
* `TexCoord[2]` → split → `PivotXY`; `TexCoord[3]` → split → `PivotZ`, `Flutter`
* `Pivot = Append(PivotXY, PivotZ)`
* `Time` → `Time`; MPC scalars → `WindStrength` (0.6), `WindSpeed` (1.0);
  MPC vector or constant `(0.8, 0, 0.6)` → `WindDirection`
* **Custom** node with 9 inputs, HLSL body = `unreal/FrontierPivotWind.ush`
  `FrontierWindOffset(...)` → **World Position Offset**
* BaseColor = bark texture × `VertexColor[B]` (cavity AO); Roughness 0.95

True pivot rotation: limbs swing rigidly around their branch base, and
because the mesh is one fused skin, junctions never crack. No pivot
textures needed (unlike Pivot Painter — nothing to bake).

## Wind material (leaves)

Duplicate the bark material: set Blend Mode **Masked**, Two Sided,
plug the leaf alpha texture; add flutter to WPO:
`Normal × (Flutter × 0.02 × Wind × sin(t×9 + Phase×40 + Pos.x×8))`.

## LODs, Nanite, collisions

* Generate LODs: `--lod 0,1,2` and assign as LOD0/1/2 in the Static Mesh
  editor (or let Nanite handle it — the mesh is Nanite-safe: closed,
  manifold, no degenerate faces).
* Collision: `Add Simplified Collision → Capsule` per trunk, or a custom
  UCX hull; foliage needs no per-leaf collision.
* Wind gusts: drive `WindStrength` from a Material Parameter Collection
  (global storm control) or a Directional Wind Actor via a small Blueprint.

## Pivot Painter 2 compatibility

If your project standardizes on PP2 materials: Frontier's per-vertex
`(pivot, weight, phase, level01)` payload is exactly what PP2 bakes into
textures. Map `level01` (color A) to your PP2 hierarchy levels; the
provided Custom-HLSL wind is a drop-in replacement for the PP2 wind
function with identical inputs and no texture dependency.
