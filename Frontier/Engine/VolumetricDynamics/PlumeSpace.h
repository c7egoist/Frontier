#pragma once
/*==========================================================================================================================================
                                                              PLUMESPACE.H
==========================================================================================================================================*/
// 🧩 Host port of Source/PlumeSpace.js: grades, residency, toroidal window, 256-byte record, detail volume.
//    RecordTransport / RecordMarch run the WGSL programs as CPU lattices with identical math.

#include "Frontier/Engine/VolumetricDynamics/GasParameters.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeRecords.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSourceProjection.h"
#include "Frontier/Engine/VolumetricDynamics/SceneDistanceField.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

struct PlumeLattice
{
    int Width = 0, Height = 0, Depth = 0;
    std::vector<PlumeVec4> Cells;

    void Construct(int W, int H, int D)
    {
        Width = W; Height = H; Depth = D;
        Cells.assign(static_cast<size_t>(W) * static_cast<size_t>(H) * static_cast<size_t>(D), {});
    }

    [[nodiscard]] int Count() const { return Width * Height * Depth; }

    [[nodiscard]] PlumeVec4& At(int X, int Y, int Z)
    {
        return Cells[static_cast<size_t>((Z * Height + Y) * Width + X)];
    }

    [[nodiscard]] const PlumeVec4& At(int X, int Y, int Z) const
    {
        return Cells[static_cast<size_t>((Z * Height + Y) * Width + X)];
    }
};

struct PlumeCoverage
{
    int Low[4]  = { 0x7FFFFFFF, 0x7FFFFFFF, 0x7FFFFFFF, 0 };
    int High[4] = { -0x7FFFFFFF, -0x7FFFFFFF, -0x7FFFFFFF, 0 };
};

struct PlumeDescription
{
    std::string Thermo;
    std::string Velocity;
    std::string Span;
    std::string Grade;
    int Cells = 0;
    int Sweeps = 0;
    int Samples = 0;
};

struct PlumeMarchFrame
{
    PlumeVec3 CameraPosition{ 0.0f, -8.0f, 2.2f };
    PlumeVec3 SunDirection{ 0.25f, 0.15f, 0.95f };
    PlumeVec3 SunIlluminance{ 12.0f, 11.2f, 9.6f };
    PlumeVec3 SkyAmbient{ 0.35f, 0.48f, 0.72f };
    float SkyScale = 1.0f;
    int Width = 0;
    int Height = 0;
    int FrameIndex = 0;
    std::vector<float> Depth;          // metres, 1e5 = miss
    std::vector<PlumeVec4> Radiance;   // rgb premultiplied, a transmittance
};

class PlumeSpace
{
public:
    explicit PlumeSpace(int GradeIndex = 2);

    void AssignConfiguration(const PlumeGrade& Configuration);
    void ReconstructGrade(int GradeIndex);
    void Clear();
    void Schedule(float Seconds, float FrameSeconds, PlumeVec3 Focus,
                  const PlumeSourceProjection& Sources, const PlumeSettings& Settings, PlumeVec3 SunDirection);
    void AssignFireLights(const std::vector<FireLight>& Lights);
    void RecordTransport(const SceneDistanceField& Distance);
    void RecordMarch(PlumeMarchFrame& Frame) const;
    [[nodiscard]] PlumeDescription QueryDescription() const;
    [[nodiscard]] std::vector<std::string> QueryReadout() const;

    bool Resident = false;
    bool StepPending = false;
    int  State = 0;
    int  StepsTaken = 0;
    int  StepOrdinal = 0;
    float Accumulator = 0.0f;
    float QuietSeconds = 0.0f;
    float ElapsedSeconds = 0.0f;
    std::array<int, 2> Origin{ 0, 0 };
    std::array<int, 2> PriorOrigin{ RestartOrigin, RestartOrigin };
    std::array<int, 3> ThermoExtent{ 128, 128, 32 };
    std::array<int, 3> VelocityExtent{ 64, 64, 16 };
    float CoarseEdge = 0.5f;
    PlumeGrade Configuration{};
    PlumeRecord Record{};
    PlumeCoverage Coverage{};
    std::vector<FireLight> FireLights;
    SceneDistanceField Distance;

    // 📝 Exposed so parity tests can inspect the 256-byte encoding.
    std::array<uint8_t, 256> RecordBytes{};

private:
    void RecentreWindow(PlumeVec3 Focus, bool Force);
    void EncodeRecord(float DeltaSeconds, float FrameSeconds, const PlumeSourceProjection& Sources, const PlumeSettings& Settings);
    void ConstructLattices();
    void ConstructDetail();

public:
    PlumeLattice Velocity[2];
    PlumeLattice Thermo[2];
    PlumeLattice Light;
    std::vector<PlumeVec4> Curl;
    std::vector<float> Divergence;
    std::vector<float> Pressure[2];
    std::vector<uint8_t> DetailTexels;
    std::vector<PlumeSource> PackedSources;
    PlumeVec3 SunDirection{ 0.0f, 0.0f, 1.0f };
    float QuietPrior = 0.0f;
    int PressureParity = 0;
};

} // namespace Frontier
