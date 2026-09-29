//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/VehicleGeometry.h — the vehicle's physical dimensions, as authored DATA
//============================================================================================================================================
//
//    In GRIT the wheel positions and aero force-application points came from skeletal-mesh SOCKETS, which live on the
//    game thread; GRIT had to pre-resolve them to CoM-relative offsets and marshal them across to the physics thread.
//    Frontier is our own engine, so we have none of that: the geometry is a single plain-data block that BOTH threads
//    read directly. `VehicleGeometry` is that block. From it we derive the four `WheelMount`s, every aero device's
//    `ForceApplicationPoint_COM`, the CoM-above-floor reference for ride height, and the inertia tensor.
//
//    ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//    THESE NUMBERS ARE NO LONGER ESTIMATES. They are extracted from the real authored vehicle,
//    `CarModelling/ControlVehicle/ControlVehicle.blend` (Blender 5.2, the "PROTO-X" wedge coupe), by reading the
//    socket Empties directly out of the .blend (see ParseBlendSockets.py alongside it, and the ControlVehicleSockets
//    table below). Blender's axes for this model already match our body frame: +X forward (nose), +Y left, +Z up —
//    confirmed by Socket_AxleMount_FL sitting at (+X,+Y) = front-left. So NO reorientation of the vehicle is required;
//    the sockets drop straight into the physics frame.
//
//    Comparison of the real model vs. GRIT's ChassisConfiguration defaults (the "what GRIT used" reference):
//                                   GRIT default        ControlVehicle.blend (real)
//        Wheelbase                    3.00 m               3.396 m   (front axle +1.7274, rear −1.6686)
//        Track (front == rear)        1.60 m               2.095 m   (wheel centres at Y = ±1.0475)
//        Suspension strut span         —                   0.552 m   (mount Z 0.6436 − hub Z 0.0914)
//    The model is a wide, long muscle/GT wedge; the horizontal geometry below IS the model, and it is within ~13 %
//    of GRIT on wheelbase. Mass and the vertical scalars (CoM height, tyre radius, ride height) are NOT stored in the
//    .blend as reliable authored data — they need the applied-modifier mesh bounds, which only local Blender can give
//    (ExportControlVehicle.py emits them). Until then they stay at documented GT/muscle-class values, tunable freely.
//
//    Wheels are DELIBERATELY not read from the model: the RubberFL* / RimFL* mesh objects are excluded and the sim
//    builds procedural wheels at the four Socket_AxleMount_* positions instead.
//    ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

#pragma once

#include "XPBDSoftTyre.h"   // Vec3

#include <vector>

namespace Frontier::Vehicle {

struct WheelMount;                 // fwd (defined in VehicleSolver.h)
struct VehicleSolverConfiguration;    // fwd

//------------------------------------------------------------------------------------------------------------------------
// Raw socket coordinates lifted verbatim from ControlVehicle.blend (metres, model-origin frame = +X fwd, +Y left, +Z up).
// The model origin sits on the longitudinal/lateral centreline at roughly hub height; CoM is placed at CoMHeight above
// ground by the dynamics. These constants exist so every derived offset below is traceable to the authored asset — nothing
// here is invented. (Camera-mount "sockets" Chassis_Mount_Exterior / Cockpit_Mount_Internal are omitted: they mark the
// external/interior CAMERA rigs, not chassis hard-points.)
//------------------------------------------------------------------------------------------------------------------------
namespace ControlVehicleSockets {
    // Axle mounts (wheel centres). Front at +X, rear at −X; left +Y, right −Y.
    inline const Vec3 AxleMount_FL { +1.7274f, +1.0475f, +0.0914f };
    inline const Vec3 AxleMount_FR { +1.7274f, -1.0475f, +0.0914f };
    inline const Vec3 AxleMount_RL { -1.6686f, +1.0475f, +0.0914f };
    inline const Vec3 AxleMount_RR { -1.6686f, -1.0475f, +0.0914f };
    // Suspension upper mounts (strut tops).
    inline const Vec3 SuspensionMount_FL { +1.7274f, +1.0475f, +0.6436f };
    inline const Vec3 SuspensionMount_FR { +1.7274f, -1.0475f, +0.6436f };
    inline const Vec3 SuspensionMount_RL { -1.6686f, +1.0475f, +0.6436f };
    inline const Vec3 SuspensionMount_RR { -1.6686f, -1.0475f, +0.6436f };
    // Aero / body hard-points.
    inline const Vec3 RearWingPort       { -2.9822f,  0.0000f, +0.8367f };
    inline const Vec3 RearWingPortLeft   { -2.9072f, +1.0576f, +0.8367f };
    inline const Vec3 RearWingPortRight  { -2.9072f, -1.0576f, +0.8367f };
    inline const Vec3 SideSkirt_L        { -0.0979f, +1.0745f, +0.0228f };
    inline const Vec3 SideSkirt_R        { -0.0979f, -1.0745f, +0.0228f };
    inline const Vec3 IdPlate_Primary    { +2.9842f,  0.0000f, +0.1006f };  // front bumper plate (nose extent)
    inline const Vec3 IdPlate_Secondary  { -2.9906f,  0.0000f, +0.2628f };  // rear bumper plate (tail extent)
}

struct VehicleGeometry
{
    // ---- Mass & primary dimensions (horizontal dims = ControlVehicle.blend sockets) ----
    float Mass               = 1300.0f;  // [kg] incl. driver + fuel (not stored in model/GRIT chassis — tunable)
    float Wheelbase          = 3.396f;   // [m]  front→rear axle (blend: +1.7274 − (−1.6686))
    float TrackFront         = 2.095f;   // [m]  centre-to-centre front tyres (blend: 2·1.0475)
    float TrackRear          = 2.095f;   // [m]  centre-to-centre rear tyres  (blend: 2·1.0475, equal front/rear)
    float FrontWeightFraction= 0.4914f;  // [-]  static front mass fraction — puts CoM on the model X-origin (front 1.727 / rear 1.669)
    float CoMHeight          = 0.35f;    // [m]  centre of mass above flat ground at rest (LOW; tune from mesh bounds)
    float TyreRadius         = 0.34f;    // [m]  loaded rolling radius (keep in sync with SoftTyreParameters.Radius; tune from wheel mesh)
    float StaticRideHeight   = 0.06f;    // [m]  underfloor-to-ground at rest (feeds ground-effect ride height)

    // ---- Radii of gyration for the inertia tensor (m) ----
    //   Iaa = Mass · k_a². Truer than a solid-box estimate: mass concentrated low and central, so yaw/pitch inertia
    //   sits well below a box of the same envelope. Scaled for the model's longer wheelbase.
    float RollRadiusGyration  = 0.60f;   // [m] about body-X (forward)
    float PitchRadiusGyration = 1.55f;   // [m] about body-Y (right) — grows with the longer wheelbase
    float YawRadiusGyration   = 1.60f;   // [m] about body-Z (up)

    // ---- Derived quantities ----
    [[nodiscard]] float FrontAxleX() const noexcept { return Wheelbase * (1.0f - FrontWeightFraction); } // CoM→front (+x)
    [[nodiscard]] float RearAxleX()  const noexcept { return Wheelbase * FrontWeightFraction; }          // CoM→rear  (−x)
    [[nodiscard]] float WheelLocalZ() const noexcept { return TyreRadius - CoMHeight; }                  // hub z rel. CoM
    [[nodiscard]] float ComHeightAboveFloor() const noexcept { return CoMHeight - StaticRideHeight; }    // for ride height
    [[nodiscard]] Vec3  Inertia() const noexcept
    {
        return { Mass * RollRadiusGyration  * RollRadiusGyration,
                 Mass * PitchRadiusGyration * PitchRadiusGyration,
                 Mass * YawRadiusGyration   * YawRadiusGyration };
    }
    [[nodiscard]] Vec3 InvInertia() const noexcept
    {
        const Vec3 I = Inertia();
        return { 1.0f / I.x, 1.0f / I.y, 1.0f / I.z };
    }
    // Static rollover threshold [g] — a sanity number, not used by the sim.
    // Wide track + low CoM ⇒ (0.5·2.095)/0.35 ≈ 2.99 g ⇒ the car slides long before it rolls.
    [[nodiscard]] float RolloverThresholdG() const noexcept { return (0.5f * TrackFront) / CoMHeight; }
};

// Build the four wheel mounts (FL, FR, RL, RR) from the geometry. Front wheels steer; rears drive (RWD).
[[nodiscard]] std::vector<WheelMount> MakeWheelMounts(const VehicleGeometry& g);

// Stamp geometry onto a controller config: wheels, aero device force points, CoM-above-floor and mass.
void ApplyGeometry(VehicleSolverConfiguration& config, const VehicleGeometry& g);

} // namespace Frontier::Vehicle
