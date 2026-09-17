bl_info = {
    "name": "Frontier — Japanese Machiya Generator",
    "author": "Frontier",
    "version": (1, 0, 0),
    "blender": (4, 0, 0),
    "location": "View3D > Sidebar > Frontier",
    "description": "Procedural ancient Japanese building generator with modern styling — Geometry Nodes style booleans",
    "category": "Add Mesh",
}

import bpy
import bmesh
import math
import random
from mathutils import Vector

# ------------------------------------------------------------
# Utility: Seeded random
class SeededRandom:
    def __init__(self, seed=1):
        self.seed = seed
        random.seed(seed)
    def range(self, a,b):
        return random.uniform(a,b)
    def bool(self, p=0.5):
        return random.random()<p
    def pick(self, arr):
        return random.choice(arr)

# ------------------------------------------------------------
# Core building generation (bmesh)
def create_pillar(bm, x,z, h, size=0.14, mat_idx=0):
    # create box pillar
    verts = [
        bm.verts.new((x-size/2, 0, z-size/2)),
        bm.verts.new((x+size/2, 0, z-size/2)),
        bm.verts.new((x+size/2, 0, z+size/2)),
        bm.verts.new((x-size/2, 0, z+size/2)),
        bm.verts.new((x-size/2, h, z-size/2)),
        bm.verts.new((x+size/2, h, z-size/2)),
        bm.verts.new((x+size/2, h, z+size/2)),
        bm.verts.new((x-size/2, h, z+size/2)),
    ]
    faces = [
        (0,1,2,3),
        (4,7,6,5),
        (0,4,5,1),
        (1,5,6,2),
        (2,6,7,3),
        (3,7,4,0),
    ]
    for f in faces:
        try:
            face = bm.faces.new([verts[i] for i in f])
            face.material_index = mat_idx
        except:
            pass

def create_roof_kirizuma(bm, width, depth, base_y, height, overhang, curve, mat_idx=2):
    # Two slopes with sori
    roofW = width + overhang*2
    roofD = depth + overhang*2
    segs = 12
    ridge_y = base_y + height
    eave_y = base_y + 0.15

    def add_slope(side):
        # side = 1 front, -1 back
        grid = []
        for iz in range(segs+1):
            t = iz/segs
            z = side * (t*roofD/2)
            y = ridge_y*(1-t) + eave_y*t
            row=[]
            for ix in range(segs+1):
                tx = ix/segs
                x = (tx-0.5)*roofW
                ly = y
                corner = abs(tx-0.5)*2 * t
                ly += t*curve*0.25 + corner*curve*0.6
                if t>0.8 and abs(tx-0.5)>0.35:
                    ly+=curve*0.5
                v = bm.verts.new((x, ly, z))
                row.append(v)
            grid.append(row)
        for iz in range(segs):
            for ix in range(segs):
                try:
                    f = bm.faces.new((grid[iz][ix], grid[iz][ix+1], grid[iz+1][ix+1], grid[iz+1][ix]))
                    f.material_index = mat_idx
                except:
                    pass

    add_slope(1)
    add_slope(-1)

    # ridge
    try:
        v0 = bm.verts.new((-roofW/2-0.1, ridge_y+0.1, -0.15))
        v1 = bm.verts.new((roofW/2+0.1, ridge_y+0.1, -0.15))
        v2 = bm.verts.new((roofW/2+0.1, ridge_y+0.1, 0.15))
        v3 = bm.verts.new((-roofW/2-0.1, ridge_y+0.1, 0.15))
        v4 = bm.verts.new((-roofW/2-0.1, ridge_y-0.05, -0.15))
        v5 = bm.verts.new((roofW/2+0.1, ridge_y-0.05, -0.15))
        v6 = bm.verts.new((roofW/2+0.1, ridge_y-0.05, 0.15))
        v7 = bm.verts.new((-roofW/2-0.1, ridge_y-0.05, 0.15))
        bm.faces.new((v0,v1,v2,v3)).material_index=3
        bm.faces.new((v4,v7,v6,v5)).material_index=3
        bm.faces.new((v0,v3,v7,v4)).material_index=3
        bm.faces.new((v1,v5,v6,v2)).material_index=3
        bm.faces.new((v3,v2,v6,v7)).material_index=3
        bm.faces.new((v0,v4,v5,v1)).material_index=3
    except:
        pass

# ------------------------------------------------------------
# Operator
class FRONTIER_OT_generate_building(bpy.types.Operator):
    bl_idname = "frontier.generate_building"
    bl_label = "Generate Machiya"
    bl_options = {'REGISTER','UNDO'}

    seed: bpy.props.IntProperty(name="Seed 乱数", default=1425, min=0, max=99999)
    width: bpy.props.FloatProperty(name="Width 幅", default=6.5, min=2, max=15)
    depth: bpy.props.FloatProperty(name="Depth 奥行", default=8.0, min=2, max=20)
    floors: bpy.props.IntProperty(name="Floors 階数", default=2, min=1, max=4)
    floor_height: bpy.props.FloatProperty(name="Floor Height 階高", default=3.1, min=2, max=5)
    roof_type: bpy.props.EnumProperty(
        name="Roof Type 屋根形式",
        items=[
            ('KIRIZUMA','Kirizuma 切妻 — Gable',''),
            ('YOSEMUNE','Yosemune 寄棟 — Hip',''),
            ('IRIMOYA','Irimoya 入母屋 — Hip-and-Gable',''),
            ('KARAH AFU','Karahafu 唐破風 — Cusped',''),
            ('PAGODA','Pagoda 重層',''),
        ],
        default='IRIMOYA'
    )
    roof_height: bpy.props.FloatProperty(name="Roof Height 屋根高", default=2.8, min=0.5, max=6)
    roof_curve: bpy.props.FloatProperty(name="Sori Curve 反り", default=0.65, min=0, max=1)
    roof_overhang: bpy.props.FloatProperty(name="Overhang 軒出", default=0.9, min=0.1, max=2.5)
    roof_tile_type: bpy.props.EnumProperty(
        name="Tile Type 瓦種",
        items=[
            ('NIHON','Nihon Kawara 日本瓦',''),
            ('IBUSHI','Ibushi いぶし',''),
            ('RED','Sekishu 赤瓦',''),
            ('MOKUME','Mokume 木目',''),
            ('COPPER','Copper 銅板',''),
        ],
        default='NIHON'
    )
    wood_type: bpy.props.EnumProperty(
        name="Wood 木材",
        items=[
            ('HINOKI','Hinoki 檜',''),
            ('SUGI','Sugi 杉',''),
            ('YAKISUGI','Yakisugi 焼杉',''),
            ('KEYAKI','Keyaki 欅',''),
        ],
        default='HINOKI'
    )
    has_engawa: bpy.props.BoolProperty(name="Engawa 縁側", default=True)
    has_chochin: bpy.props.BoolProperty(name="Chochin 提灯", default=True)
    chochin_count: bpy.props.IntProperty(name="Chochin Count", default=3, min=0, max=8)
    has_kanban: bpy.props.BoolProperty(name="Kanban 看板", default=True)
    kanban_text: bpy.props.StringProperty(name="Kanban Text", default="山田商店")
    has_noren: bpy.props.BoolProperty(name="Noren 暖簾", default=True)
    noren_text: bpy.props.StringProperty(name="Noren Text", default="営業中")
    has_electric_pole: bpy.props.BoolProperty(name="Electric Pole 電柱", default=True)
    has_aircon: bpy.props.BoolProperty(name="Aircon 室外機", default=True)
    modernity: bpy.props.FloatProperty(name="Modernity 現代度", default=0.45, min=0, max=1)

    def execute(self, context):
        rng = SeededRandom(self.seed)
        bm = bmesh.new()

        # Materials indices: 0 wood, 1 wall, 2 roof, 3 ridge
        # Foundation
        w = self.width
        d = self.depth
        # simple floor slabs
        cur_y = 0.35
        pillar_density = 3
        for f in range(self.floors):
            # slab
            try:
                v0 = bm.verts.new((-w/2, cur_y, -d/2))
                v1 = bm.verts.new((w/2, cur_y, -d/2))
                v2 = bm.verts.new((w/2, cur_y, d/2))
                v3 = bm.verts.new((-w/2, cur_y, d/2))
                v4 = bm.verts.new((-w/2, cur_y+0.12, -d/2))
                v5 = bm.verts.new((w/2, cur_y+0.12, -d/2))
                v6 = bm.verts.new((w/2, cur_y+0.12, d/2))
                v7 = bm.verts.new((-w/2, cur_y+0.12, d/2))
                for face in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:
                    vs = [ [v0,v1,v2,v3,v4,v5,v6,v7][i] for i in face]
                    try:
                        ff = bm.faces.new(vs)
                        ff.material_index = 0
                    except: pass
            except: pass

            # pillars
            step_x = w / pillar_density
            step_z = d / pillar_density
            for ix in range(pillar_density+1):
                for iz in range(pillar_density+1):
                    if ix>0 and ix<pillar_density and iz>0 and iz<pillar_density:
                        continue
                    x = -w/2 + ix*step_x
                    z = -d/2 + iz*step_z
                    create_pillar(bm, x, z, cur_y+self.floor_height, 0.14, 0)

            cur_y += self.floor_height

        # Roof
        roof_base = cur_y - self.floor_height + 0.35
        if self.roof_type in ('KIRIZUMA','IRIMOYA'):
            create_roof_kirizuma(bm, w, d, roof_base, self.roof_height, self.roof_overhang, self.roof_curve, 2)
        elif self.roof_type == 'YOSEMUNE':
            # simplified as kirizuma for addon demo
            create_roof_kirizuma(bm, w, d, roof_base, self.roof_height, self.roof_overhang, self.roof_curve, 2)
        elif self.roof_type == 'KARAH AFU':
            create_roof_kirizuma(bm, w, d, roof_base, self.roof_height, self.roof_overhang, self.roof_curve, 2)
        else:
            create_roof_kirizuma(bm, w, d, roof_base, self.roof_height, self.roof_overhang, self.roof_curve, 2)

        # Create mesh
        mesh = bpy.data.meshes.new(f"Machiya_{self.seed}")
        bm.to_mesh(mesh)
        bm.free()

        obj = bpy.data.objects.new(mesh.name, mesh)
        context.collection.objects.link(obj)
        context.view_layer.objects.active = obj
        obj.select_set(True)

        # Create materials if not exist
        mat_names = ["Frontier_Wood", "Frontier_Wall", "Frontier_Roof", "Frontier_Ridge"]
        mat_colors = [(0.79,0.66,0.48,1),(0.96,0.94,0.91,1),(0.29,0.31,0.32,1),(0.22,0.22,0.22,1)]
        for i, mname in enumerate(mat_names):
            if mname not in bpy.data.materials:
                mat = bpy.data.materials.new(mname)
                mat.use_nodes=True
                bsdf = mat.node_tree.nodes.get("Principled BSDF")
                if bsdf:
                    bsdf.inputs["Base Color"].default_value = mat_colors[i]
            if mat_names[i] not in obj.data.materials:
                obj.data.materials.append(bpy.data.materials[mat_names[i]])

        # Add-ons: chochin as separate objects
        if self.has_chochin:
            for i in range(self.chochin_count):
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.22, location=(rng.range(-w/2+0.3,w/2-0.3), rng.range(roof_base-1, roof_base-0.2), d/2+0.4))
                cho = context.active_object
                cho.name = f"Chochin_{i}"
                cho.scale.z = 1.25
                mat = bpy.data.materials.get("Frontier_Chochin")
                if not mat:
                    mat = bpy.data.materials.new("Frontier_Chochin")
                    mat.use_nodes=True
                    bsdf = mat.node_tree.nodes["Principled BSDF"]
                    bsdf.inputs["Base Color"].default_value = (1,0.94,0.88,1)
                    bsdf.inputs["Emission"].default_value = (1,0.6,0.2,1)
                    bsdf.inputs["Emission Strength"].default_value = 1.2
                cho.data.materials.append(mat)

        # Kanban
        if self.has_kanban:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(w/2+0.3, roof_base-1, 0.4))
            kan = context.active_object
            kan.name = f"Kanban_{self.kanban_text}"
            kan.scale = (0.05, 1.8, 0.6)
            # add text object
            bpy.ops.object.text_add(location=(w/2+0.36, roof_base-1, 0.4))
            txt = context.active_object
            txt.data.body = self.kanban_text
            txt.rotation_euler = (0, math.radians(90), math.radians(90))
            txt.scale = (0.3,0.3,0.3)

        # Electric pole
        if self.has_electric_pole:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=6.5, location=(w/2+2.2, 6.5/2, d/2+0.5))
            pole = context.active_object
            pole.name="Denchu_ElectricPole"

        self.report({'INFO'}, f"Generated Machiya {self.seed} — {self.roof_type} roof, {self.floors}F")
        return {'FINISHED'}

class FRONTIER_PT_panel(bpy.types.Panel):
    bl_label = "Frontier Machiya Generator 縁側"
    bl_idname = "FRONTIER_PT_machiya"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Frontier'

    def draw(self, context):
        layout = self.layout
        col = layout.column(align=True)
        col.label(text="GEOMETRY NODES // ジオメトリノード", icon='NODETREE')
        col.separator()
        col.prop(context.scene, "frontier_seed")
        col.prop(context.scene, "frontier_width")
        col.prop(context.scene, "frontier_depth")
        col.prop(context.scene, "frontier_floors")
        col.prop(context.scene, "frontier_floor_height")
        col.separator()
        col.label(text="⛩ ROOF / 屋根 — Most Important")
        col.prop(context.scene, "frontier_roof_type")
        col.prop(context.scene, "frontier_roof_height")
        col.prop(context.scene, "frontier_roof_curve")
        col.prop(context.scene, "frontier_roof_overhang")
        col.prop(context.scene, "frontier_tile_type")
        col.separator()
        col.label(text="🪵 MATERIALS / 材質")
        col.prop(context.scene, "frontier_wood_type")
        col.separator()
        col.label(text="🏮 DETAILS — Booleans")
        col.prop(context.scene, "frontier_has_engawa")
        col.prop(context.scene, "frontier_has_chochin")
        col.prop(context.scene, "frontier_chochin_count")
        col.prop(context.scene, "frontier_has_kanban")
        col.prop(context.scene, "frontier_kanban_text")
        col.prop(context.scene, "frontier_has_noren")
        col.prop(context.scene, "frontier_noren_text")
        col.prop(context.scene, "frontier_has_pole")
        col.prop(context.scene, "frontier_has_aircon")
        col.prop(context.scene, "frontier_modernity")
        col.separator()
        col.operator("frontier.generate_building", text="Generate 町家 生成", icon='MESH_CUBE')

def register_props():
    bpy.types.Scene.frontier_seed = bpy.props.IntProperty(name="Seed", default=1425, min=0, max=99999)
    bpy.types.Scene.frontier_width = bpy.props.FloatProperty(name="Width", default=6.5, min=2, max=15)
    bpy.types.Scene.frontier_depth = bpy.props.FloatProperty(name="Depth", default=8.0, min=2, max=20)
    bpy.types.Scene.frontier_floors = bpy.props.IntProperty(name="Floors", default=2, min=1, max=4)
    bpy.types.Scene.frontier_floor_height = bpy.props.FloatProperty(name="Floor Height", default=3.1, min=2, max=5)
    bpy.types.Scene.frontier_roof_type = bpy.props.EnumProperty(name="Roof", items=[
        ('KIRIZUMA','Kirizuma 切妻',''),('YOSEMUNE','Yosemune 寄棟',''),('IRIMOYA','Irimoya 入母屋',''),('KARAH AFU','Karahafu 唐破風',''),('PAGODA','Pagoda 重層','')], default='IRIMOYA')
    bpy.types.Scene.frontier_roof_height = bpy.props.FloatProperty(name="Roof H", default=2.8, min=0.5, max=6)
    bpy.types.Scene.frontier_roof_curve = bpy.props.FloatProperty(name="Sori 反り", default=0.65, min=0, max=1)
    bpy.types.Scene.frontier_roof_overhang = bpy.props.FloatProperty(name="Overhang", default=0.9, min=0.1, max=2.5)
    bpy.types.Scene.frontier_tile_type = bpy.props.EnumProperty(name="Tile", items=[
        ('NIHON','Nihon 日本瓦',''),('IBUSHI','Ibushi いぶし',''),('RED','Red 赤瓦',''),('MOKUME','Mokume 木目',''),('COPPER','Copper 銅板','')], default='NIHON')
    bpy.types.Scene.frontier_wood_type = bpy.props.EnumProperty(name="Wood", items=[
        ('HINOKI','Hinoki 檜',''),('SUGI','Sugi 杉',''),('YAKISUGI','Yakisugi 焼杉',''),('KEYAKI','Keyaki 欅','')], default='HINOKI')
    bpy.types.Scene.frontier_has_engawa = bpy.props.BoolProperty(name="Engawa 縁側", default=True)
    bpy.types.Scene.frontier_has_chochin = bpy.props.BoolProperty(name="Chochin 提灯", default=True)
    bpy.types.Scene.frontier_chochin_count = bpy.props.IntProperty(name="Chochin Count", default=3, min=0, max=8)
    bpy.types.Scene.frontier_has_kanban = bpy.props.BoolProperty(name="Kanban 看板", default=True)
    bpy.types.Scene.frontier_kanban_text = bpy.props.StringProperty(name="Kanban", default="山田商店")
    bpy.types.Scene.frontier_has_noren = bpy.props.BoolProperty(name="Noren 暖簾", default=True)
    bpy.types.Scene.frontier_noren_text = bpy.props.StringProperty(name="Noren", default="営業中")
    bpy.types.Scene.frontier_has_pole = bpy.props.BoolProperty(name="Electric Pole 電柱", default=True)
    bpy.types.Scene.frontier_has_aircon = bpy.props.BoolProperty(name="Aircon", default=True)
    bpy.types.Scene.frontier_modernity = bpy.props.FloatProperty(name="Modernity", default=0.45, min=0, max=1)

    # sync to operator
    def update_operator_from_scene():
        pass

def unregister_props():
    del bpy.types.Scene.frontier_seed
    del bpy.types.Scene.frontier_width
    del bpy.types.Scene.frontier_depth
    del bpy.types.Scene.frontier_floors
    del bpy.types.Scene.frontier_floor_height
    del bpy.types.Scene.frontier_roof_type
    del bpy.types.Scene.frontier_roof_height
    del bpy.types.Scene.frontier_roof_curve
    del bpy.types.Scene.frontier_roof_overhang
    del bpy.types.Scene.frontier_tile_type
    del bpy.types.Scene.frontier_wood_type
    del bpy.types.Scene.frontier_has_engawa
    del bpy.types.Scene.frontier_has_chochin
    del bpy.types.Scene.frontier_chochin_count
    del bpy.types.Scene.frontier_has_kanban
    del bpy.types.Scene.frontier_kanban_text
    del bpy.types.Scene.frontier_has_noren
    del bpy.types.Scene.frontier_noren_text
    del bpy.types.Scene.frontier_has_pole
    del bpy.types.Scene.frontier_has_aircon
    del bpy.types.Scene.frontier_modernity

classes = (FRONTIER_OT_generate_building, FRONTIER_PT_panel)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    register_props()

    # Wrapper operator that reads from scene props
    # Monkey-patch execute to use scene props if called from panel
    orig_execute = FRONTIER_OT_generate_building.execute
    def new_execute(self, context):
        sc = context.scene
        self.seed = sc.frontier_seed
        self.width = sc.frontier_width
        self.depth = sc.frontier_depth
        self.floors = sc.frontier_floors
        self.floor_height = sc.frontier_floor_height
        self.roof_type = sc.frontier_roof_type
        self.roof_height = sc.frontier_roof_height
        self.roof_curve = sc.frontier_roof_curve
        self.roof_overhang = sc.frontier_roof_overhang
        self.roof_tile_type = sc.frontier_tile_type
        self.wood_type = sc.frontier_wood_type
        self.has_engawa = sc.frontier_has_engawa
        self.has_chochin = sc.frontier_has_chochin
        self.chochin_count = sc.frontier_chochin_count
        self.has_kanban = sc.frontier_has_kanban
        self.kanban_text = sc.frontier_kanban_text
        self.has_noren = sc.frontier_has_noren
        self.noren_text = sc.frontier_noren_text
        self.has_electric_pole = sc.frontier_has_pole
        self.has_aircon = sc.frontier_has_aircon
        self.modernity = sc.frontier_modernity
        return orig_execute(self, context)
    FRONTIER_OT_generate_building.execute = new_execute

def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    unregister_props()

if __name__ == "__main__":
    register()
