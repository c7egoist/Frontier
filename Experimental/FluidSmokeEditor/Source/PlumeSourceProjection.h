#pragma once
/*==========================================================================================================================================
                                                         PLUMESOURCEPROJECTION.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Experimental/VehicleHmiPrototype/Source/PlumeSourceProjection.js — vehicle telemetry projected
//    into smoke, soot and fire sources, fire lights and ember emitters: onset hysteresis, burnout, burning rubber,
//    pops. Ported from unassignedinbox/Slate@3c987f3 (SmokeOnsetClassifier.h / GasVehicleIntake.h).

#include "PlumeMath.h"
#include "PlumeRecords.h"

#include <array>
#include <cstdint>
#include <vector>

namespace FluidSmoke
{

// 📝 A port of Frontier's vehicle gas intake constants (SmokeSpecification's).
struct SmokeSpecificationT
{
    float SourcePowerOnset     = 200.0f;    // [W]
    float SourceReleaseRatio   = 0.60f;     // [-]
    float SourceOnsetSeconds   = 0.05f;     // [s]
    float SourceReleaseSeconds = 0.08f;     // [s]
    float SourcePowerFull      = 18000.0f;  // [W]
    float MinimumSlipSpeed     = 0.35f;     // [m/s]
    float DensityRate          = 18.0f;     // [1/s]
    float CarrierVelocityShare = 0.15f;     // [-]
    float SmokeHeatRate        = 0.04f;     // [K/s]
    float FireHeatPowerScale   = 0.001f;    // [K/J]
    float PatchRadius          = 0.16f;     // [m]   GasRoadTyrePatchRadius
};

constexpr SmokeSpecificationT SmokeSpecification{};

constexpr int SourceStride   = 12;   // [f32] PlumeSource in PlumeRecords.wgsl: position·radius, velocity·spare, rates (smoke, heat, flame, soot)
constexpr int SourceCapacity = 24;   // [-]   four patches, four arches, eight flame seats, two exhaust tips, four bursts, two spare

constexpr float WarmBase       = 333.15f;   // [K]   below this a sliding tread hardly smokes
constexpr float WarmSpan       = 190.0f;    // [K]   from WarmBase to full vapourisation
constexpr float FlingShare     = 0.35f;     // [-]   of the surface slip speed carried by the thrown smoke
constexpr float FlingCeiling   = 9.0f;      // [m/s]
constexpr float ArchShare      = 0.35f;     // [-]   of the patch smoke shed from the arch
constexpr Vec3  FireColour     = { 1.0f, 0.46f, 0.14f };   // [-] a sooty rubber flame, linear
constexpr float FireLightGain  = 0.00042f;  // [lx·m²/W] combustion power to fire-light intensity
constexpr float FlameSidewallReach = 0.24f; // [m]   hub to the flame seat outside the sidewall
constexpr float FlameRise      = 2.6f;      // [m/s] momentum given to a flame seat — burning rubber jets its vapour upward

//------------------------------------------------------------------------------------------------------------------------
//                                                 TELEMETRY
//------------------------------------------------------------------------------------------------------------------------

struct WheelThermal
{
    bool  Ignited = false;
    float CombustionPower = 0.0f;   // [W]
    float Surface = 300.0f;         // [K] tread surface temperature
};

struct WheelTelemetry
{
    float ContactFraction = 0.0f;
    bool  OnDebris = false;
    bool  Shredded = false;
    bool  InContact = false;        // ContactFraction > 0.5 && !OnDebris, resolved by ProjectPlumeTelemetry
    float Steer = 0.0f;             // [rad] wheel steer angle, used to derive the heading
    float SlidingPower = 0.0f;      // [W]
    float SlipSpeed = 0.0f;         // [m/s]
    Vec3  ContactVelocity = { 0, 0, 0 };
    Vec3  HubPosition = { 0, 0, 0 };
    Vec3  ContactPoint = { 0, 0, 0 };
    Vec3  Longitudinal = { 1, 0, 0 };   // wheel heading in world space
    float Radius = 0.33f;
    float SurfaceSpeed = 0.0f;      // [m/s] tread surface speed
    WheelThermal Thermal{};
    bool  Burst = false;
};

struct ExhaustTelemetry
{
    Vec3 Position = { 0, 0, 0 };
    Vec3 Direction = { -1, 0, 0 };
};

struct PlumeTelemetry
{
    Vec3 Position = { 0, 0, 0 };
    Vec3 Velocity = { 0, 0, 0 };
    std::vector<ExhaustTelemetry> Exhausts;
    float AfterfireSeconds = 0.0f;
    std::vector<WheelTelemetry> Wheels;   // four
};

struct SourceOptions
{
    bool  Afterfire = false;
    float EmissionRate = 1.0f;
    float SmokeYield = 1.0f;
    float HeatYield = 1.0f;
    float SootYield = 1.0f;
    float FireLight = 1.0f;
    float Embers = 1.0f;
};

struct SourceBounds
{
    Vec3 Minimum = { 0, 0, 0 };
    Vec3 Maximum = { 0, 0, 0 };
};

struct FireLight
{
    Vec3  Position = { 0, 0, 0 };
    float Radius = 0.0f;
    Vec3  Radiance = { 0, 0, 0 };
};

struct EmberEmitter
{
    Vec3  Position = { 0, 0, 0 };
    Vec3  Velocity = { 0, 0, 0 };
    float Rate = 0.0f;
    float Temperature = 0.0f;
    float Spread = 0.0f, Lift = 0.0f, Gravity = 0.0f, Life = 0.0f;
};

struct BurstRequest
{
    Vec3  Position = { 0, 0, 0 };
    float Radius = 0.3f;
    Vec3  Velocity = { 0, 0, 0 };
    float Smoke = 0.0f, Heat = 0.0f, Flame = 0.0f, Soot = 0.0f;
    float Seconds = 0.0f;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                 PLUME SOURCE PROJECTION
//------------------------------------------------------------------------------------------------------------------------

class PlumeSourceProjection
{
  public:
    PlumeSourceProjection();

    void Reset() noexcept;

    // 📝 xorshift32 (ProjectUniform in the exhibit).
    float ProjectUniform() noexcept;

    // 📝 Queues a transient source.
    void QueueBurst(const BurstRequest& Burst);

    struct OnsetState
    {
        float RequestSeconds = 0.0f;
        float QuietSeconds = 0.0f;
        bool  Active = false;
    };

    // 📝 AdvanceSmokeOnset(): entry needs power and slip speed sustained, release has grace, contact loss cuts at once.
    static bool AdvanceOnset(OnsetState& Onset, float Power, float SlipSpeed, bool Contact, float Seconds) noexcept;

    // 📝 Fills Records with this advance's sources, Lights with the fire lights and Embers with the ember emitters.
    int Project(const PlumeTelemetry& Telemetry, float Seconds, const SourceOptions& Options);

    // 📝 Bounds of every source grown by 3.5 of its radii (the Gaussian's reach), for the lattice's cheap reject.
    [[nodiscard]] SourceBounds ResolveBounds() const noexcept;

    std::array<OnsetState, 4> Onsets;
    std::array<float, 2> PopSeconds{};
    std::array<float, 2> PopStrength{};
    uint32_t Seed = 0x2545F491u;
    std::array<float, SourceCapacity * SourceStride> Records{};
    int Count = 0;
    int ActiveTyres = 0;
    bool Popping = false;
    std::vector<BurstRequest> Bursts;
    std::vector<float> RemainingTimes;   // [s] parallel to Bursts: the burst's remaining emission time
    std::vector<FireLight> Lights;
    std::vector<EmberEmitter> Embers;
    float Elapsed = 0.0f;
};

} // namespace FluidSmoke
