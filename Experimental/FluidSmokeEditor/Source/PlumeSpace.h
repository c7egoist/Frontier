#pragma once
/*==========================================================================================================================================
                                                              PLUMESPACE.H
==========================================================================================================================================*/
// 🧩 1:1 C++ port of Experimental/VehicleHmiPrototype/Source/PlumeSpace.js — the smoke-and-fire cell lattices:
//    toroidal windows that follow the car, one fixed-rate step, a coverage-clipped march. The WebGPU storage
//    textures become CPU lattices; the compute passes (Shaders/PlumeAdvection.wgsl, PlumeVorticity.wgsl,
//    PlumePressure.wgsl) are ported entry-for-entry in PlumeTransport.h.

#include "GasParameters.h"
#include "PlumeRecords.h"
#include "PlumeSourceProjection.h"
#include "SceneDistanceField.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace FluidSmoke
{

struct Vec4
{
    float X = 0, Y = 0, Z = 0, W = 0;
    [[nodiscard]] Vec3 XYZ() const { return { X, Y, Z }; }
};

constexpr int   RecordBytes      = 256;          // [B]   PlumeRecord: sixteen vec4
constexpr int   FireLightBytes   = 144;          // [B]   FireLightRecord
constexpr int   FireLightLimit   = 4;            // [-]
constexpr float StepSeconds      = 1.0f / 60.0f; // [s]   shortest step
constexpr float StepCeiling      = 1.0f / 30.0f; // [s]   longest step
constexpr float FadeCeiling      = 12.0f;        // [s]   SmokeSpecification::FadeCeiling — the plume is gone this long after the last source
constexpr int   RestartOrigin    = 1 << 24;      // [cell] a prior window nothing lies in: every read of the old state returns nothing
constexpr int   DetailExtent     = 32;           // [texel] tiling detail-noise volume edge
constexpr float FloorHeight      = -0.5f;        // [m]   the window's floor, under the course
constexpr float FlameScale       = 80.0f;        // [-]   flame emission at PlumeFire 1

// 📝 The smoke-and-fire quality slider — independent of the GI grade. Extent [fine cells, each even], CellExtent [m],
//    PressureSweeps (even), MarchSamples.
struct PlumeGrade
{
    const char* Name;
    int Extent[3];
    float CellExtent;
    int PressureSweeps;
    int MarchSamples;
};

constexpr std::array<PlumeGrade, 4> PlumeGrades = { {
    { "Low",    { 64,  64,  20 }, 0.40f,  8, 32 },
    { "Medium", { 96,  96,  24 }, 0.30f, 12, 40 },
    { "High",   { 128, 128, 32 }, 0.25f, 16, 48 },
    { "Ultra",  { 160, 160, 48 }, 0.20f, 20, 64 },
} };

// 📝 Every transport and optics reading the Smoke & fire editor exposes, at the values the exhibit opens with.
constexpr PlumeSettings PlumeDefaults = PlumeSettings{};

struct PlumeDescription
{
    std::string Thermo, Velocity, Span, Grade;
    long long Cells = 0, Bytes = 0;
    int Sweeps = 0, Samples = 0;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                 PLUME SPACE
//------------------------------------------------------------------------------------------------------------------------

class PlumeSpace
{
  public:
    PlumeSpace();
    explicit PlumeSpace(const PlumeGrade& Configuration);

    void AssignConfiguration(const PlumeGrade& Configuration) noexcept;
    [[nodiscard]] const PlumeGrade& QueryConfiguration() const noexcept { return Configuration; }

    // 📝 Called once per frame with the sources of this frame. Decides residency and whether a step runs, moves the
    //    window when the focus leaves its middle half, and fills the step record, the sources and the coverage reset.
    void Schedule(float Seconds, float FrameSeconds, const Vec3& Focus, const PlumeSourceProjection& Sources,
                  const PlumeSettings& Settings, const Vec3& SunDirection);

    void RecentreWindow(const Vec3& Focus, bool Force) noexcept;
    void EncodeRecord(float DeltaTau, float FrameSeconds, const PlumeSourceProjection& Sources, const PlumeSettings& Settings) noexcept;

    // 📝 Lights: brightest first; written every frame, resident or not, because the direct radiance pass lights the scene.
    void AssignFireLights(const std::vector<FireLight>& Lights) noexcept;

    // 📝 Forgets the plume at once: the next source restarts a clean lattice.
    void Clear() noexcept;

    // 📝 Runs one transport step: the PlumeAdvection/PlumeVorticity/PlumePressure passes, in dispatch order.
    void RecordTransport(const SceneDistanceField& Field);

    [[nodiscard]] PlumeDescription QueryDescription() const noexcept;

    //--------------------------------------------------------------------------------------------------------------------
    //                                                   STATE (public for the ported passes and the march)
    //--------------------------------------------------------------------------------------------------------------------

    PlumeGrade Configuration{};
    Vec3u ThermoExtent{}, VelocityExtent{};
    float CoarseEdge = 0.0f;
    std::array<int, 2> Origin{ 0, 0 }, PriorOrigin{ RestartOrigin, RestartOrigin };

    bool Resident = false;
    bool StepPending = false;
    int  State = 0;
    float Accumulator = 0.0f;
    float QuietSeconds = 0.0f;
    float QuietPrior = 0.0f;
    int  StepOrdinal = 0;
    float ElapsedSeconds = 0.0f;
    int  StepsTaken = 0;

    PlumeRecord Record{};
    FireLightRecord FireLights{};
    std::array<PlumeSource, SourceCapacity> SourceRecords{};
    std::array<int, 8> Coverage{ 0x7FFFFFFF, 0x7FFFFFFF, 0x7FFFFFFF, 0, -0x7FFFFFFF, -0x7FFFFFFF, -0x7FFFFFFF, 0 };

    // 📝 The device lattices, ping-ponged per step parity: velocity (coarse, rgba: xyz velocity, w solid),
    //    thermo (fine, rgba: r smoke, g heat, b flame, a soot), light (coarse, rg transmittance).
    std::vector<Vec4> Velocity[2];
    std::vector<Vec4> Thermo[2];
    std::vector<Vec4> Light;
    std::vector<Vec4> Curl;
    std::vector<float> Divergence;
    std::vector<float> Pressure[2];

    Vec3 SunDirection = { 0.0f, 0.0f, 1.0f };

  private:
    void AllocateLattices();
};

} // namespace FluidSmoke
