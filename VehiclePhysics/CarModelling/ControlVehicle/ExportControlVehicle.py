# ============================================================================================================================================
# ExportControlVehicle.py — headless Blender export of the ControlVehicle body mesh (wheels EXCLUDED).
# ============================================================================================================================================
#
#   WHY THIS IS A SCRIPT AND NOT A PREBUILT OBJ/glTF:
#   The port sandbox has no Blender / bpy / assimp, and ControlVehicle.blend is a Blender 5.2 file whose meshes carry a
#   modifier stack (a "Modifiers" node is present in the outliner). A raw byte-level mesh dump would ignore those modifiers
#   and produce wrong geometry, so the visual body must be exported by Blender itself. Run this locally; it is deterministic.
#
#   USAGE (from this folder):
#       blender ControlVehicle.blend --background --python ExportControlVehicle.py
#   Outputs (written next to the .blend):
#       ControlVehicle_Body.glb     — body only, modifiers applied, +Y up (glTF convention)
#       ControlVehicle_Body.obj     — same, OBJ
#       ControlVehicle_Collision.obj — the UCX_ convex hull, if present (handy for the physics broadphase proxy)
#       ControlVehicle_Bounds.txt   — measured bounding boxes → feed exact TyreRadius / CoMHeight back into VehicleGeometry.h
#
#   WHAT IS EXCLUDED, AND WHY:
#     • Wheels  — RubberFL*, RimFL*  : the sim builds PROCEDURAL wheels at the four Socket_AxleMount_* points instead.
#     • Ground  — Plane*                : scene backdrop, not part of the car.
#     • Cameras — Camera*               : the "Chassis_Mount_Exterior"/"Cockpit_Mount_Internal" sockets are camera rigs.
#     • Collision — UCX_*               : exported SEPARATELY (not part of the visual body).
#     • Empties — Socket_*, Empty       : transforms only; already extracted into VehicleGeometry.h::ControlVehicleSockets.
#
#   ORIENTATION: the model's Blender axes already match our physics body frame (+X forward, +Y left, +Z up); no rotation is
#   applied to the mesh data. The glTF exporter re-maps to +Y-up as usual for glTF; the OBJ is left Z-up to match the sim.
# ============================================================================================================================================

import bpy
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(bpy.data.filepath)) or os.getcwd()

WHEEL_PREFIXES     = ("Rubber", "Rim")
EXCLUDE_PREFIXES   = ("Plane", "Camera", "Empty", "Socket_")
COLLISION_PREFIXES = ("UCX_",)


def is_body(obj):
    if obj.type != "MESH":
        return False
    n = obj.name
    if n.startswith(WHEEL_PREFIXES):     return False
    if n.startswith(EXCLUDE_PREFIXES):   return False
    if n.startswith(COLLISION_PREFIXES): return False
    return True


def world_bounds(objs):
    lo = Vector((1e18, 1e18, 1e18))
    hi = Vector((-1e18, -1e18, -1e18))
    found = False
    for o in objs:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
            found = True
    return (lo, hi) if found else (None, None)


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def main():
    all_objs   = list(bpy.data.objects)
    body       = [o for o in all_objs if is_body(o)]
    wheels     = [o for o in all_objs if o.type == "MESH" and o.name.startswith(WHEEL_PREFIXES)]
    collision  = [o for o in all_objs if o.name.startswith(COLLISION_PREFIXES)]

    print("Body meshes exported :", sorted(o.name for o in body))
    print("Wheels excluded      :", sorted(o.name for o in wheels))
    print("Collision hull       :", sorted(o.name for o in collision))

    # ---- measured bounds → finalize vertical scalars in VehicleGeometry.h ----
    lines = []
    blo, bhi = world_bounds(body)
    if blo:
        lines.append("BODY  (metres, +X fwd  +Y left  +Z up)")
        lines.append(f"  length  X: {bhi.x-blo.x:.4f}   [{blo.x:+.4f} .. {bhi.x:+.4f}]")
        lines.append(f"  width   Y: {bhi.y-blo.y:.4f}   [{blo.y:+.4f} .. {bhi.y:+.4f}]")
        lines.append(f"  height  Z: {bhi.z-blo.z:.4f}   [{blo.z:+.4f} .. {bhi.z:+.4f}]")
    for w in wheels:
        wlo, whi = world_bounds([w])
        if wlo:
            radius = 0.5 * max(whi.x - wlo.x, whi.z - wlo.z)   # wheel spins about Y; radius = half of X/Z extent
            width  = whi.y - wlo.y
            lines.append(f"WHEEL {w.name:14s} radius≈{radius:.4f} m  width≈{width:.4f} m")
    with open(os.path.join(HERE, "ControlVehicle_Bounds.txt"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))

    # ---- export body (glTF applies modifiers by default; export selected only) ----
    select_only(body)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(HERE, "ControlVehicle_Body.glb"),
        use_selection=True, export_apply=True, export_format="GLB",
    )
    bpy.ops.wm.obj_export(
        filepath=os.path.join(HERE, "ControlVehicle_Body.obj"),
        export_selected_objects=True, apply_modifiers=True,
        forward_axis="X", up_axis="Z",   # keep the sim's Z-up body frame
    )

    # ---- export collision hull separately, if present ----
    if collision:
        select_only(collision)
        bpy.ops.wm.obj_export(
            filepath=os.path.join(HERE, "ControlVehicle_Collision.obj"),
            export_selected_objects=True, apply_modifiers=True,
            forward_axis="X", up_axis="Z",
        )

    print("Export complete →", HERE)


if __name__ == "__main__":
    main()
