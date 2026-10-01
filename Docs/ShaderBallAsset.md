# ShaderBall asset

The material-evaluation geometry for the showcase grid: derkreature's ShaderBall, converted to the engine's axes
and units and loaded once as shared topology.

## Why a shader ball and not a sphere

A sphere shows a material at one curvature, with no occlusion and no edges, so sheen, coat, anisotropy and
subsurface all read as a single highlight on a single gradient. The shader ball carries a flat plate, a convex
dome, a concave sweep, a thin lip and a self-occluding cushion. That is what makes a coat distinguishable from a
polish, and a sheen distinguishable from a wide specular.

## Source

[`derkreature/ShaderBall`](https://github.com/derkreature/ShaderBall) by Mat Makin, released under the Unlicense
(public domain). The file used is `shaderBallNoCrease/shaderBall.obj`: 34 623 positions, 50 914 UVs, 135 792
normals, 33 980 faces (33 852 quads + 128 triangles), Y-up in a ~268-unit box.

The OBJ itself is **not** committed — it is 8.9 MB of text that converts to 1.9 MB of binary. Fetch it with:

```bash
curl -L https://github.com/derkreature/ShaderBall/archive/master.zip -o sb.zip && unzip -q sb.zip
```

## Conversion

```bash
python3 Exhibits/Workbench/ShaderBallAsset/ConvertShaderBall.py \
    --input  ShaderBall-master/shaderBallNoCrease/shaderBall.obj \
    --output Exhibits/Assets/ShaderBall/ShaderBall.mesh
```

What it does, in order:

1. **Triangulate** — fan-split the 33 852 quads. 33 980 faces become 67 832 triangles.
2. **Weld** — one vertex per distinct *value*, not per distinct index triple. The source writes a normal per face
   corner, so keying on the triple would keep all 135 792; keying on the quantised value collapses them to
   35 897, a 3.8× reduction with no change to the surface. Positions snap at 1e-6 of the source box, normals at
   1e-4, UVs at 1e-6 — fine enough that a genuine hard edge or UV seam still separates.
3. **Seat** — `(x, y, z) → (x, −z, y)`, the same Y-up → Z-up swap `ObjCodec` applies, then uniform scale to a
   1.10 m height, centred in xy, resting on `z = 0`.

Result: 35 897 vertices, 67 832 triangles, 1.87 MB, bounding box 1.114 × 1.035 × 1.100 m.

### Verified

| check | result |
| ----- | ------ |
| bounding box | x [−0.557, 0.557] · y [−0.518, 0.518] · z [0.000, 1.100] — seated on the ground plane |
| normals | 0 of 35 897 non-unit |
| degenerate triangles | 0 of 67 832 |
| UV range | u [−1.00, 1.66] · v [−0.58, 1.00] — the source's own layout, tiling outside [0,1] |
| surface area | 7.708 m² |

A shaded render from the binary confirms the silhouette, the concave cut, the inner shell and the cushion base
all survive the conversion.

## Format

`SBM1`, little-endian:

```
magic     u32    'SBM1' = 0x314D4253
vertices  u32
indices   u32
height    f32    [m] the seated height
vertices × (px py pz  nx ny nz  u v)    8 × f32, 32 B
indices  × u32
```

Read by `ShaderBallGeometry::Load` into a `GeometryStructure`. Tangents are not authored; `ResolveMaterial`
derives a frame from the UV gradient when the tangent is degenerate, which is the same thing it does for a glTF
without `TANGENT`.

## Why there is no decimated variant

A proof that three render paths agree about a material is void if the paths are not looking at the same
triangles. The CPU parity harness therefore traces this exact mesh and renders **fewer balls rather than smaller
ones** — 20 balls at 67 832 triangles is 1.4 M, which a CPU BVH handles comfortably. Only the full 400-ball grid
at 27 M was ever a problem, and shared topology plus a subset view solves that without a second geometry.

The converter keeps a `--decimate N` flag for ad-hoc inspection. Be warned what it does to this mesh: vertex
cluster snapping merges vertices across the gap between the inner and outer surfaces wherever the shell is
thinner than a cell, so a 3 000-triangle target comes out riddled with holes. Measured, the damage hides from
summary statistics — bounding box within 2 %, surface area 7.748 m² against 7.708 m² — and is obvious the moment
it is rendered. Making it usable would need a quadric edge collapse with a boundary constraint.

## Placement

The grid registers the topology once and places it 400 times:

```cpp
GeometryStructure Ball;
std::string Error;
if (ShaderBallGeometry::LoadResolved(kShaderBallAssetPath, Ball, nullptr, &Error))
{
    const uint32_t Topology = Scene.RegisterTopology(Ball);
    for (uint32_t Slot = 0u; Slot < 400u; ++Slot)
        Scene.PlaceTopology(Topology, GridTransform(Slot), MaterialOf(Slot), 0u);
}
```

See `Docs/SharedTopology.md`. The mesh is resident once however many placements there are; at 67 832 triangles it
is 9 `InstanceRecord`s per placement, because of the 8 192-triangle span.
