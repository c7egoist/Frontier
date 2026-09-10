# Frontier in Blender

## Addon (recommended)

1. `python tools/make_blender_zip.py` → `dist/frontier_blender.zip`
2. Blender → Edit → Preferences → Add-ons → Install from Disk → select the zip
3. 3D View → Sidebar (`N`) → **Frontier** tab → pick species/seed/LOD → Generate Tree

You get `Frontier_<preset>_<seed>_bark` (single manifold mesh, quads +
a few darts/tris at count transitions) and `..._leaves` parented to it, with:

* `UVMap` — bark/leaf UVs; `PivotXY`, `PivotZ_Flutter` — wind payload
* `Wind` color attribute — `(weight, phase, ao, level01)`
* smooth shading enabled

Wind preview in Blender: add a Geometry Nodes modifier displacing by the
same pivot-rotation formula (see `viewer/app.js` vertex shader), or
simply use an Armature How to… — the mesh deforms cleanly since it is
one welded skin.

## OBJ / glTF import

`File → Import → .glb` keeps vertex colors + all UV channels.
OBJ (`v x y z r g b`) also carries vertex colors. Validate after import:
Edit Mode → Select → Select All by Trait → Non-Manifold should select
nothing.

## Editing tips

* The mesh is subdivision-friendly (mostly quads, poles only at crotches
  and dart transitions): a Subdivision Surface modifier (level 1–2)
  gives hero-quality bark.
* Keep `Pivot*` UVs + `Wind` colors if you edit: they drive engine wind.
  Proportional editing keeps them attached per-vertex automatically.
* Sculpting bark detail: Multires + bark alpha brushes; bake to the
  existing `UVMap`.
