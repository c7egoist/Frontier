#pragma once
/*==========================================================================================================================================
                                                       PLUMESOURCEPROJECTION.H
==========================================================================================================================================*/
// 🧩 Exact port of Source/PlumeSourceProjection.js: onset, tyre / arch / flame seats, bounds.

#include "Frontier/Engine/VolumetricDynamics/PlumeRecords.h"

#include <array>
#include <cstdint>
#include <vector>

namespace Frontier
{

struct SmokeSpecificationValues
{
    float SourcePowerOnset     = 200.0f;
    float SourceReleaseRatio   = 0.60f;
    float SourceOnsetSeconds   = 0.05f;
    float SourceReleaseSeconds = 0.08f;
    float SourcePowerFull      = 18000.0f;
    float MinimumSlipSpeed     = 0.35f;
    float DensityRate          = 18.0f;
    float CarrierVelocityShare = 0.15f;
    float SmokeHeatRate        = 0.04f;
    float FireHeatPowerScale   = 0.001f;
    float PatchRadius          = 0.16f;
};

[[nodiscard]] inline SmokeSpecificationValues QuerySmokeSpecification() noexcept
{
    return {};
}

struct WheelTelemetry
{
    bool      InContact = false;
    bool      Burst     = false;
    float     SlidingPower = 0.0f;
    float     SlipSpeed = 0.0f;
    float     SurfaceSpeed = 0.0f;
    float     Radius = 0.5f;
    PlumeVec3 ContactPoint{};
    PlumeVec3 HubPosition{};
    PlumeVec3 ContactVelocity{};
    PlumeVec3 Longitudinal{ 1.0f, 0.0f, 0.0f };
    bool      Ignited = false;
    float     CombustionPower = 0.0f;
    float     SurfaceTemperature = 293.15f;
};

struct ExhaustTelemetry
{
    PlumeVec3 Position{};
    PlumeVec3 Direction{ 1.0f, 0.0f, 0.0f };
};

struct PlumeTelemetry
{
    PlumeVec3 Position{};
    PlumeVec3 Velocity{};
    std::vector<WheelTelemetry> Wheels;
    std::vector<ExhaustTelemetry> Exhausts;
    float AfterfireSeconds = 0.0f;
};

struct PlumeEmission
{
    bool      Active = false;
    PlumeVec3 Position{};
    float     Radius = 0.3f;
    PlumeVec3 Velocity{ 0.0f, 0.0f, 1.0f };
    float     SmokeRate = 0.0f;
    float     HeatRate = 0.0f;
    float     FlameRate = 0.0f;
    float     SootRate = 0.0f;
};

struct SourceProjectOptions
{
    bool  Afterfire = false;
    float EmissionRate = 1.0f;
    float SmokeYield = 1.0f;
    float HeatYield = 1.0f;
    float SootYield = 1.0f;
    float FireLight = 1.0f;
    float Embers = 1.0f;
};

struct SourceOnset
{
    float RequestSeconds = 0.0f;
    float QuietSeconds = 0.0f;
    bool  Active = false;
};

class PlumeSourceProjection
{
public:
    PlumeSourceProjection();
    void Reset();
    int  Project(const PlumeTelemetry& Telemetry, float Seconds, const SourceProjectOptions& Options);
    void WriteExtra(const PlumeEmission& Emission);
    [[nodiscard]] std::array<float, 6> ResolveBounds() const;

    std::array<float, SourceCapacity * SourceStride> Records{};
    int Count = 0;
    int ActiveTyres = 0;
    std::vector<FireLight> Lights;
    float Elapsed = 0.0f;

private:
    bool AdvanceOnset(SourceOnset& Onset, float Power, float SlipSpeed, bool Contact, float Seconds);
    float ProjectUniform();
    void WriteSource(PlumeVec3 Position, float Radius, PlumeVec3 Velocity, float Smoke, float Heat, float Flame, float Soot);

    std::array<SourceOnset, 4> Onsets{};
    std::array<float, 2> PopSeconds{};
    std::array<float, 2> PopStrength{};
    uint32_t Seed = 0x2545F491u;
};

[[nodiscard]] PlumeEmission ResolveTestPlume(PlumeVec3 VehiclePosition, PlumeVec3 Forward, bool Burning) noexcept;

} // namespace Frontier
