"""Frontier Tree Generator — Blender addon (4.x).

Generates single-mesh fused-topology trees directly in Blender, with
vertex colors (R=wind weight, G=branch phase, B=AO, A=level) and bark UVs.

Install: use `tools/make_blender_zip.py` to build the distributable zip
(frontier core is bundled inside), then Install from Disk in Blender.
"""

bl_info = {
    "name": "Frontier Tree Generator",
    "author": "Frontier",
    "version": (0, 1, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Frontier",
    "description": "Single-mesh procedural trees with fused branches + wind data",
    "category": "Add Mesh",
}

import os
import sys

try:
    import frontier  # noqa: F401
except ImportError:
    here = os.path.dirname(__file__)
    for cand in (here, os.path.dirname(here)):
        if os.path.isdir(os.path.join(cand, "frontier")):
            sys.path.insert(0, cand)
            break
    import frontier  # noqa: F401

import bpy
from bpy.props import BoolProperty, EnumProperty, IntProperty


def _build_mesh_object(result, kind: str):
    """Create a Blender object from a GenerateResult (bark or leaves)."""
    import numpy as np

    if kind == "bark":
        V = np.asarray(result.bark.verts(), dtype=np.float64)
        quads = [tuple(q) for q in result.bark.quads]
        tris = [tuple(t) for t in result.bark.tris]
        faces = quads + tris
        colors = np.asarray(result.bark_wind["color"], dtype=np.float32)
        uvs = np.asarray(result.bark_uv, dtype=np.float32)
        piv = np.asarray(result.bark_wind["pivot"], dtype=np.float32)
        flu = np.asarray(result.bark_wind["flutter"], dtype=np.float32)
        name = f"Frontier_{result.preset}_{result.seed}_bark"
    else:
        L = result.leaves
        V = np.asarray(L.positions, dtype=np.float64)
        faces = [tuple(t) for t in np.asarray(L.indices).tolist()]
        colors = np.asarray(L.colors, dtype=np.float32)
        uvs = np.asarray(L.uvs, dtype=np.float32)
        piv = np.asarray(L.pivots, dtype=np.float32)
        flu = np.ones(len(V), dtype=np.float32)
        name = f"Frontier_{result.preset}_{result.seed}_leaves"

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(V.tolist(), [], faces)
    mesh.update()

    # smooth shading
    for poly in mesh.polygons:
        poly.use_smooth = True

    # UV0: bark/leaf UVs
    uv0 = mesh.uv_layers.new(name="UVMap")
    loop_uv = np.zeros(len(mesh.loops) * 2, dtype=np.float32)
    for li, loop in enumerate(mesh.loops):
        loop_uv[li * 2 : li * 2 + 2] = uvs[loop.vertex_index]
    uv0.data.foreach_set("vector", loop_uv.ravel())

    # UV1/UV2: pivot wind payload (UV1=pivot.xy, UV2=pivot.z+flutter)
    uv1 = mesh.uv_layers.new(name="PivotXY")
    a1 = np.zeros(len(mesh.loops) * 2, dtype=np.float32)
    for li, loop in enumerate(mesh.loops):
        vi = loop.vertex_index
        a1[li * 2 : li * 2 + 2] = (piv[vi, 0], piv[vi, 1])
    uv1.data.foreach_set("vector", a1.ravel())
    uv2 = mesh.uv_layers.new(name="PivotZ_Flutter")
    a2 = np.zeros(len(mesh.loops) * 2, dtype=np.float32)
    for li, loop in enumerate(mesh.loops):
        vi = loop.vertex_index
        a2[li * 2 : li * 2 + 2] = (piv[vi, 2], flu[vi])
    uv2.data.foreach_set("vector", a2.ravel())

    # vertex colors: wind packing
    col = mesh.color_attributes.new(name="Wind", type="FLOAT_COLOR", domain="POINT")
    flat = np.zeros(len(V) * 4, dtype=np.float32)
    flat.reshape(-1, 4)[:] = colors
    col.data.foreach_set("color", flat.ravel())

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


class FRONTIER_OT_generate(bpy.types.Operator):
    bl_idname = "frontier.generate"
    bl_label = "Generate Tree"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        from frontier.generate import generate_tree
        from frontier.validate import MeshValidationError, assert_valid

        sc = context.scene
        preset = sc.frontier_preset
        try:
            r = generate_tree(preset, seed=sc.frontier_seed, lod=int(sc.frontier_lod))
            assert_valid(r.bark, preset)
        except MeshValidationError as e:
            self.report({"ERROR"}, f"validation failed: {e}")
            return {"CANCELLED"}
        bark_obj = _build_mesh_object(r, "bark")
        bark_obj.location = context.scene.cursor.location
        if r.leaves is not None and sc.frontier_leaves:
            leaf_obj = _build_mesh_object(r, "leaves")
            leaf_obj.location = bark_obj.location
            leaf_obj.parent = bark_obj
        rep = r.report
        self.report(
            {"INFO"},
            f"{preset} seed={r.seed}: {rep['verts']} verts, watertight genus-0, H={rep['height']:.1f}m",
        )
        return {"FINISHED"}


class FRONTIER_PT_panel(bpy.types.Panel):
    bl_label = "Frontier Tree"
    bl_idname = "FRONTIER_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Frontier"

    def draw(self, context):
        sc = context.scene
        col = self.layout.column(align=True)
        col.prop(sc, "frontier_preset", text="Species")
        col.prop(sc, "frontier_seed", text="Seed")
        col.prop(sc, "frontier_lod", text="LOD")
        col.prop(sc, "frontier_leaves", text="Leaf cards")
        col.operator("frontier.generate", icon="MESH_DATA")


def register():
    from frontier.presets import PRESETS

    bpy.utils.register_class(FRONTIER_OT_generate)
    bpy.utils.register_class(FRONTIER_PT_panel)
    items = [(k, k.capitalize(), "") for k in sorted(PRESETS)]
    bpy.types.Scene.frontier_preset = EnumProperty(items=items, default="oak")
    bpy.types.Scene.frontier_seed = IntProperty(default=1, min=0, max=99999)
    bpy.types.Scene.frontier_lod = EnumProperty(
        items=[("0", "LOD 0 (hero)", ""), ("1", "LOD 1", ""), ("2", "LOD 2", "")]
    )
    bpy.types.Scene.frontier_leaves = BoolProperty(default=True)


def unregister():
    bpy.utils.unregister_class(FRONTIER_OT_generate)
    bpy.utils.unregister_class(FRONTIER_PT_panel)
    del bpy.types.Scene.frontier_preset
    del bpy.types.Scene.frontier_seed
    del bpy.types.Scene.frontier_lod
    del bpy.types.Scene.frontier_leaves


if __name__ == "__main__":
    register()
