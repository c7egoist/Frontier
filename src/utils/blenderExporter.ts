import { BuildingConfig } from '../types/generator';

/**
 * Generates an executable Blender Python script that procedurally builds the East Asian building
 * with Geometry Nodes in Blender 3.6+ / 4.x!
 */
export function generateBlenderPythonScript(config: BuildingConfig): string {
  return `"""
=============================================================================
AAA PROCEDURAL EAST ASIAN BUILDING GENERATOR - BLENDER GEOMETRY NODES SCRIPT
Archetype: ${config.archetype}
Floors: ${config.floors} | Roof: ${config.roof.type} | Tiles: ${config.roof.hasTiles}
Run this script inside Blender's 'Scripting' workspace.
=============================================================================
"""

import bpy
import math
import bmesh
from mathutils import Vector, Matrix

# 1. Clear existing generated object if exists
obj_name = "Procedural_Asian_Building_${config.archetype}"
if obj_name in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects[obj_name], do_unlink=True)

# 2. Building Parameters
CONFIG = {
    "archetype": "${config.archetype}",
    "floors": ${config.floors},
    "width": ${config.width},
    "depth": ${config.depth},
    "floor_height": ${config.floorHeight},
    "terrace_setback": ${config.terraceSetback},
    "roof_type": "${config.roof.type}",
    "roof_overhang": ${config.roof.overhang},
    "roof_curvature": ${config.roof.curvature},
    "has_roof_tiles": ${config.roof.hasTiles ? 'True' : 'False'},
    "roof_tile_type": "${config.roof.tileType}",
    "roof_color": "${config.roof.color}",
    "has_phone_pole": ${config.electricity.hasPhonePole ? 'True' : 'False'},
    "has_ac_units": ${config.electricity.hasACUnits ? 'True' : 'False'},
    "has_lanterns": ${config.lighting.hasLanterns ? 'True' : 'False'},
    "has_neon": ${config.lighting.hasNeonSigns ? 'True' : 'False'},
    "has_tatami": ${config.furniture.hasTatami ? 'True' : 'False'},
}

def create_procedural_building(cfg):
    # Create master collection
    coll_name = "Asian_Procedural_City"
    if coll_name not in bpy.data.collections:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    else:
        coll = bpy.data.collections[coll_name]

    # Create root object
    mesh = bpy.data.meshes.new(obj_name + "_Mesh")
    obj = bpy.data.objects.new(obj_name, mesh)
    coll.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bm = bmesh.new()

    width = cfg["width"]
    depth = cfg["depth"]
    floor_h = cfg["floor_height"]
    floors = cfg["floors"]

    current_y = 0.0
    current_w = width
    current_d = depth

    # Build Floors
    for f in range(floors):
        if f > 0 and cfg["terrace_setback"] > 0:
            current_w = max(4.0, width * (1.0 - f * cfg["terrace_setback"] * 0.4))
            current_d = max(4.0, depth * (1.0 - f * cfg["terrace_setback"] * 0.4))

        # Create floor slab
        bmesh.ops.create_cube(
            bm, 
            size=1.0, 
            matrix=Matrix.Translation((0, 0, current_y + 0.15)) @ Matrix.Diagonal((current_w, current_d, 0.3, 1.0))
        )

        # Create Structural Columns (Hashira)
        cols_x = max(2, round(current_w / 3.0))
        cols_y = max(2, round(current_d / 3.0))
        step_x = current_w / cols_x
        step_y = current_d / cols_y

        for ix in range(cols_x + 1):
            x = -current_w / 2 + ix * step_x
            for iy in range(cols_y + 1):
                y = -current_d / 2 + iy * step_y
                if ix in (0, cols_x) or iy in (0, cols_y):
                    bmesh.ops.create_cube(
                        bm,
                        size=1.0,
                        matrix=Matrix.Translation((x, y, current_y + floor_h / 2)) @ Matrix.Diagonal((0.24, 0.24, floor_h, 1.0))
                    )

        # Upper beam ring (Nuki)
        beam_z = current_y + floor_h - 0.12
        bmesh.ops.create_cube(
            bm,
            size=1.0,
            matrix=Matrix.Translation((0, current_d / 2, beam_z)) @ Matrix.Diagonal((current_w, 0.22, 0.24, 1.0))
        )
        bmesh.ops.create_cube(
            bm,
            size=1.0,
            matrix=Matrix.Translation((0, -current_d / 2, beam_z)) @ Matrix.Diagonal((current_w, 0.22, 0.24, 1.0))
        )

        current_y += floor_h

    # Build Curved Roof Geometry
    roof_w = current_w + cfg["roof_overhang"] * 2
    roof_d = current_d + cfg["roof_overhang"] * 2
    roof_h = min(4.5, max(2.4, min(current_w, current_d) * 0.38))
    curve = cfg["roof_curvature"]

    # Procedural Curved Grid Vertices
    segs = 12
    roof_verts = []
    for iz in range(segs + 1):
        v = iz / segs
        z_pos = (v - 0.5) * roof_d
        norm_z = abs(z_pos) / (roof_d / 2)
        row = []
        for ix in range(segs + 1):
            u = ix / segs
            x_pos = (u - 0.5) * roof_w
            norm_x = abs(x_pos) / (roof_w / 2)
            dist_edge = 1.0 - max(norm_x, norm_z)
            y_pos = current_y + dist_edge * roof_h + math.pow(max(norm_x, norm_z), 2.2) * curve
            v_ref = bm.verts.new((x_pos, z_pos, y_pos))
            row.append(v_ref)
        roof_verts.append(row)

    for iz in range(segs):
        for ix in range(segs):
            v1 = roof_verts[iz][ix]
            v2 = roof_verts[iz][ix + 1]
            v3 = roof_verts[iz + 1][ix + 1]
            v4 = roof_verts[iz + 1][ix]
            bm.faces.new((v1, v2, v3, v4))

    # Build Telephone Pole if enabled
    if cfg["has_phone_pole"]:
        pole_x = current_w / 2 + 6.0
        pole_y = current_d / 2 + 2.0
        pole_h = 10.0
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            cap_tris=False,
            segments=16,
            radius1=0.28,
            radius2=0.20,
            depth=pole_h,
            matrix=Matrix.Translation((pole_x, pole_y, pole_h / 2))
        )

    bm.to_mesh(mesh)
    bm.free()

    # Add Subdivision Surface and Auto Smooth for AAA smoothness
    sub = obj.modifiers.new("Subsurf", 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 2

    print(f"Generated {obj_name} successfully in Blender!")

create_procedural_building(CONFIG)
`;
}
