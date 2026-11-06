#pragma once
/*==========================================================================================================================================
                                                            SMOKESEQUENCE.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of the SmokeSequence class in Experimental/VehicleHmiPrototype/Source/SmokeSequence.js — the
//    adapter for the Slate 3c987f3 tyre plume system: maps the editor's gas parameters onto plume settings,
//    projects vehicle telemetry into sources, schedules and steps the lattice, and aggregates the fire light.

#include "GasParameters.h"
#include "PlumeSpace.h"

#include <array>
#include <string>
#include <vector>

namespace FluidSmoke
{

// 📝 A free-standing editor/fracture/burst plume emission, beyond the four tyre sources.
struct EmissionRequest
{
    bool  Active = false;
    Vec3  Position = { 0, 0, 0 };
    float Radius = 0.3f;
    Vec3  Velocity = { 0, 0, 1 };
    float SmokeRate = 0.0f, HeatRate = 0.0f, FlameRate = 0.0f, SootRate = 0.0f;
};

struct SmokeSequenceMetrics
{
    int Sources = 0;
    int Ticks = 0;
    int Relocations = 0;
};

class SmokeSequence : public PlumeSpace
{
  public:
    SmokeSequence();
    explicit SmokeSequence(const PlumeGrade& Grade);

    // 📝 One frame: maps the gas parameters, projects the telemetry, schedules and steps the lattice.
    void Advance(float Seconds, bool Enabled, const PlumeTelemetry& Telemetry, const SourceOptions& SourceOpts,
                 const PlumeSettings& Settings, const Vec3& Focus, const Vec3& SunDirection,
                 const SceneDistanceField& Field, const std::vector<EmissionRequest>& Emissions = {});

    void Clear() noexcept;

    // 📝 The two-line readout of the exhibit's Presets card.
    [[nodiscard]] std::array<std::string, 2> QueryReadout() const noexcept;

    PlumeSourceProjection Sources;
    struct { Vec3 Position = { 0, 0, 0 }; float Intensity = 0.0f; Vec3 Colour = { 1.0f, 0.46f, 0.14f }; } FireLight;
    SmokeSequenceMetrics Metrics{};

  private:
    std::array<int, 2> LastOrigin{ 0, 0 };
    bool HasLastOrigin = false;
};

} // namespace FluidSmoke
