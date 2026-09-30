# ControlVehicle — real-vehicle geometry extraction

This folder holds the **actual authored vehicle** for Project-Tractrix and everything derived from it.

| File | What it is |
|---|---|
| `ControlVehicle.blend` | The real vehicle (Blender 5.2), the "PROTO-X" wedge coupe, with socket Empties. Copied verbatim from `SultanAladin/Frontier-` commit `28ec065` (`EngineContent/GeometryArchives/ControlVehicle.blend`). The `.blend1` autosave was **not** copied. |
| `ParseBlendSockets.py` | Standalone Python (no Blender needed) that walks the `.blend` block table and prints every object's name / type / transform. This is how the sockets below were extracted. |
| `ExportControlVehicle.py` | Headless Blender script to export the **body** mesh (wheels excluded) to glTF/OBJ and measure bounds. Must be run on a machine with Blender — see below. |

---

## 1. How the `.blend` was read without Blender

The sandbox has no Blender / `bpy` / assimp, so the file was parsed directly. Blender 5.2 uses a **new 32-byte block header** (older Blender used 20/24-byte headers, which is why the classic walkers failed):

```
offset  +0   code   char[4]      ("REND","GLOB","OB","ME","DNA1","ENDB", …)
        +4   (pad)  4 bytes
        +8   old    uint64        (original in-memory pointer)
        +16  len    uint64        (payload length in bytes)   ← the field that matters
        +24  SDNAnr uint32
        +28  nr     uint32
        +32  payload …
```

Validated by walking from the file header (`BLENDER17-01v0502`, uncompressed) cleanly to `ENDB`, whose block ends exactly at EOF. The SDNA (`DNA1`) block then gives the `Object` struct layout (`loc[3]` @ +736, `rot[3]` @ +796, `type` @ +416, `id.name` @ +40, …), and each `OB` block is decoded from that. `ParseBlendSockets.py` reproduces this exactly.

## 2. Axis frame — no reorientation needed

Blender's axes for this model **already match our physics body frame**: **+X forward (nose), +Y left, +Z up.** Confirmed because `Socket_AxleMount_FL` sits at (+X, +Y) = front-left and the rear-wing / rear ID-plate sockets sit at −X. So the sockets drop straight into the sim with **no rotation** — the "fix vehicle orientation" step reduces to: the model is already correctly oriented.

## 3. Sockets extracted (metres, model-origin frame)

The model origin lies on the centreline (X = Y = 0) at roughly hub height.

| Socket | X (fwd) | Y (left) | Z (up) | Role |
|---|---:|---:|---:|---|
| `Socket_AxleMount_FL` | +1.7274 | +1.0475 | +0.0914 | front-left wheel centre |
| `Socket_AxleMount_FR` | +1.7274 | −1.0475 | +0.0914 | front-right wheel centre |
| `Socket_AxleMount_RL` | −1.6686 | +1.0475 | +0.0914 | rear-left wheel centre |
| `Socket_AxleMount_RR` | −1.6686 | −1.0475 | +0.0914 | rear-right wheel centre |
| `Socket_SuspensionMount_FL/FR` | +1.7274 | ±1.0475 | +0.6436 | front strut tops |
| `Socket_SuspensionMount_RL/RR` | −1.6686 | ±1.0475 | +0.6436 | rear strut tops |
| `Socket_RearWingAssemblyPort` | −2.9822 | 0 | +0.8367 | rear wing centre |
| `Socket_RearWingAssemblyPortLeft/Right` | −2.9072 | ±1.0576 | +0.8367 | rear wing endplates |
| `Socket_SideSkirtAssembly_L/R` | −0.0979 | ±1.0745 | +0.0228 | side-skirt / floor line |
| `Socket_ID_Plate_Primary` | +2.9842 | 0 | +0.1006 | front bumper (nose extent) |
| `Socket_ID_Plate_Secondary` | −2.9906 | 0 | +0.2628 | rear bumper (tail extent) |
| `Socket_Chassis_Mount_Exterior` | −5.5957 | 0 | +2.6121 | **external camera rig** (not chassis) |
| `Socket_Cockpit_Mount_Internal` | +0.3366 | +0.4760 | +1.0332 | **interior camera rig** (not chassis) |

The last two coincide exactly with the two `Camera` armatures in the scene, so they are camera mounts, **not** chassis hard-points, and are excluded from the physics geometry.

## 4. Derived dimensions vs. GRIT

| Quantity | GRIT `ChassisConfiguration` default | ControlVehicle.blend (real) | Source |
|---|---:|---:|---|
| Wheelbase | 3.00 m | **3.396 m** | +1.7274 − (−1.6686) |
| Track (front == rear) | 1.60 m | **2.095 m** | 2 × 1.0475 |
| Front / rear split | — | **49.1 / 50.9** | CoM on the model X-origin |
| Suspension strut span | — | **0.552 m** | mount Z 0.6436 − hub Z 0.0914 |
| Rear-wing height above hub | — | **0.745 m** | wing Z 0.8367 − hub Z 0.0914 |

The real car is a **wide, long muscle/GT wedge** — within ~13 % of GRIT on wheelbase, noticeably wider on track. Per the standing rule "geometry must not be arbitrary — derive from the real vehicle," the **horizontal geometry is now the model's**, verbatim, in `VehicleGeometry.h::ControlVehicleSockets`.

## 5. What is now wired into the sim

`VehicleGeometry.h` / `VehicleGeometry.cpp`:
- **Wheelbase 3.396 m, track 2.095 m, front fraction 0.4914** — from the axle-mount sockets.
- **Wheel mounts** built at the four `Socket_AxleMount_*` positions. **Wheels are procedural** — the `RubberFL*` / `RimFL*` meshes are deliberately not imported.
- **Aero force-application points** derived from sockets: rear wing from `Socket_RearWingAssemblyPort`; splitter on the front lower lip between front axle and nose plate; diffuser under the rear floor; canards procedural (no canard sockets exist).
- Inertia radii of gyration nudged up for the longer wheelbase.
- Rollover threshold is now (½·2.095)/0.35 ≈ **2.99 g** → the car slides long before it rolls.

All Thread-M suites stay green with the real geometry: driving 12/12, aero 8/8 + 23/23, ABS+supercharger 11/11, braking 16/16, supercharger 13/13, scene 38/38, core 35/35, input 16/16, XPBD tyre 14/14. (The hill-climb test's fixed spawn height was lifted along the grade to suit the longer wheelbase — a harness change, not a physics change.)

## 6. What still needs local Blender (the mesh → OBJ/glTF)

Vertical scalars that need **applied-modifier mesh bounds** (`Mass`, exact `CoMHeight`, `TyreRadius`, `StaticRideHeight`) stay at documented GT/muscle-class values until measured. Run, on a machine with Blender:

```
blender ControlVehicle.blend --background --python ExportControlVehicle.py
```

It writes `ControlVehicle_Body.glb` / `.obj` (body only, wheels excluded, modifiers applied) and `ControlVehicle_Bounds.txt` with the measured body height and per-wheel radius/width. Copy the measured `TyreRadius` and body height back into `VehicleGeometry.h` to close out the vertical numbers.

> **UCX_ collision is dropped on purpose.** `UCX_ControlVehicle_00` was Unreal's collision-mesh convention; Frontier uses its own collision, so the imported hull is useless and is not exported. (And for the field test-drive below, the car body carries **no** collision at all — only the wheels contact the ground.)
