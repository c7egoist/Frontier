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
//    Defaults are documented, realistic GT3-class estimates (a modern GT3 is a ~1300 kg car on a ~2.65 m wheelbase,
//    ~1.65 m track, with a LOW centre of mass ~0.35 m). These fix the placeholder box's two geometry artefacts:
//      • rollover threshold a_roll = (½·track)/CoM_height·g → 0.825/0.35 ≈ 2.36 g  (was 0.88 g) ⇒ the car SLIDES
//        before it rolls, like a real car, instead of tipping over at 0.9 g;
//      • a sane CoM/track for load transfer and slope behaviour.
//    Swap these numbers for a specific vehicle's measured values (or a `.tyrx`-matched preset) at any time — nothing
//    downstream hard-codes a dimension.

#pragma once

#include "XPBDSoftTyre.h"   // Vec3

#include <vector>

namespace Frontier::Vehicle {

struct WheelMount;                 // fwd (defined in VehicleController.h)
struct VehicleControllerConfig;    // fwd

struct VehicleGeometry
{
    // ---- Mass & primary dimensions (GT3-class estimates) ----
    float Mass               = 1300.0f;  // [kg] incl. driver + fuel
    float Wheelbase          = 2.65f;    // [m]  front→rear axle
    float TrackFront         = 1.65f;    // [m]  centre-to-centre front tyres
    float TrackRear          = 1.62f;    // [m]  centre-to-centre rear tyres
    float FrontWeightFraction= 0.47f;    // [-]  static front mass fraction (47/53 ≈ mid-engine-ish GT3)
    float CoMHeight          = 0.35f;    // [m]  centre of mass above flat ground at rest (LOW)
    float TyreRadius         = 0.34f;    // [m]  loaded rolling radius (keep in sync with SoftTyreParameters.Radius)
    float StaticRideHeight   = 0.06f;    // [m]  underfloor-to-ground at rest (feeds ground-effect ride height)

    // ---- Radii of gyration for the inertia tensor (GT3 estimates, m) ----
    //   Iaa = Mass · k_a². These are truer than a solid-box estimate: a race car's mass is concentrated low and
    //   central, so its yaw/pitch inertia is well below a box of the same envelope.
    float RollRadiusGyration  = 0.55f;   // [m] about body-X (forward)
    float PitchRadiusGyration = 1.35f;   // [m] about body-Y (right)
    float YawRadiusGyration   = 1.40f;   // [m] about body-Z (up)

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
    [[nodiscard]] float RolloverThresholdG() const noexcept { return (0.5f * TrackFront) / CoMHeight; }
};

// Build the four wheel mounts (FL, FR, RL, RR) from the geometry. Front wheels steer; rears drive (RWD).
[[nodiscard]] std::vector<WheelMount> MakeWheelMounts(const VehicleGeometry& g);

// Stamp geometry onto a controller config: wheels, aero device force points, CoM-above-floor and mass.
void ApplyGeometry(VehicleControllerConfig& config, const VehicleGeometry& g);

} // namespace Frontier::Vehicle
