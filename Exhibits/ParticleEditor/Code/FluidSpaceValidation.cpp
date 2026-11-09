/*==========================================================================================================================================
                                                       FLUIDSPACEVALIDATION.CPP
==========================================================================================================================================*/
// 🧪 Validates fluid .space schema, CPU transport/projection, radial source projection, force coupling, and particle events.

#include "Engine/PhysicalDynamics/FluidDynamics/FluidSimulationSequence.h"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <string>

namespace
{

bool Require(bool Condition, const char* Message)
{
    if (!Condition) std::cerr << "FluidSpaceValidation: " << Message << '\n';
    return Condition;
}

double ComputeDivergenceMagnitude(const Frontier::FluidSpace& Space)
{
    const uint32_t Width = Space.QueryCellCountX();
    const uint32_t Height = Space.QueryCellCountY();
    const uint32_t Depth = Space.QueryCellCountZ();
    const double InverseCellSpan = 1.0 / Space.QueryDescriptor().Configuration.CellSpanMetres;
    double SquaredDivergenceSum = 0.0;
    for (uint32_t Z = 0; Z < Depth; ++Z)
        for (uint32_t Y = 0; Y < Height; ++Y)
            for (uint32_t X = 0; X < Width; ++X)
            {
                const Frontier::Vec3d Right = Space.QueryCell(std::min(X + 1, Width - 1), Y, Z).AirVelocityMetresPerSecond;
                const Frontier::Vec3d Left = Space.QueryCell(X == 0 ? 0 : X - 1, Y, Z).AirVelocityMetresPerSecond;
                const Frontier::Vec3d North = Space.QueryCell(X, std::min(Y + 1, Height - 1), Z).AirVelocityMetresPerSecond;
                const Frontier::Vec3d South = Space.QueryCell(X, Y == 0 ? 0 : Y - 1, Z).AirVelocityMetresPerSecond;
                const Frontier::Vec3d Above = Space.QueryCell(X, Y, std::min(Z + 1, Depth - 1)).AirVelocityMetresPerSecond;
                const Frontier::Vec3d Below = Space.QueryCell(X, Y, Z == 0 ? 0 : Z - 1).AirVelocityMetresPerSecond;
                const double Divergence = 0.5 * InverseCellSpan *
                    ((Right.X - Left.X) + (North.Y - South.Y) + (Above.Z - Below.Z));
                SquaredDivergenceSum += Divergence * Divergence;
            }
    return std::sqrt(SquaredDivergenceSum / static_cast<double>(Space.QueryCells().size()));
}

struct TestField final : Frontier::IFieldSampler
{
    [[nodiscard]] bool QueryFieldEnabled() const noexcept override { return true; }
    [[nodiscard]] double QueryGroundPlaneYMeters() const noexcept override { return 0.0; }
    [[nodiscard]] Frontier::Vec3d SampleFieldFlow(const Frontier::Vec3d&, double, bool) const noexcept override
    {
        return { 0.25, 0.0, 0.0 };
    }
    [[nodiscard]] Frontier::Vec3d SampleFieldContribution(Frontier::ForceContribution, const Frontier::Vec3d&,
                                                          double, bool, int32_t) const noexcept override
    {
        return {};
    }
    [[nodiscard]] Frontier::FieldPointSample EvaluateFullField(const Frontier::Vec3d&, bool, double) const noexcept override
    {
        Frontier::FieldPointSample Result;
        Result.AirVelocityMps = { 0.25, 0.0, 0.0 };
        return Result;
    }
};

} // namespace

int main()
{
    using namespace Frontier;
    FluidSpaceDescriptor Descriptor;
    Descriptor.Spatial.PositionMetres = { 10.0, -2.0, 3.0 };
    Descriptor.Configuration.CellCountX = 8;
    Descriptor.Configuration.CellCountY = 8;
    Descriptor.Configuration.CellCountZ = 8;
    Descriptor.Configuration.PressureIterationCount = 20;
    Descriptor.Configuration.CellSpanMetres = 0.5;
    Descriptor.Configuration.AmbientTemperatureKelvin = 290.0;
    Descriptor.Configuration.SmokeDiffusivitySquareMetresPerSecond = 0.015;
    Descriptor.Configuration.VaporDiffusivitySquareMetresPerSecond = 0.01;

    std::string Diagnostic;
    std::string Text;
    if (!Require(EncodeSpaceText("frontier.fluidspace", 1, Descriptor, Text), "schema encoding failed")) return 1;
    FluidSpaceDescriptor RoundTrip;
    if (!Require(DecodeSpaceText(Text, "frontier.fluidspace", 1, RoundTrip, &Diagnostic), "schema decoding failed")) return 1;

    const std::filesystem::path ScratchDirectory = std::filesystem::temp_directory_path() / "FrontierFluidSpaceValidation";
    const std::filesystem::path FluidPath = ScratchDirectory / "Validation.fluidspace";
    const std::filesystem::path ForbiddenPath = ScratchDirectory / "Validation.toml";
    if (!Require(EncodeSpaceFile(FluidPath, ".fluidspace", "frontier.fluidspace", 1, Descriptor, &Diagnostic),
                 "fluidspace file encoding failed")) return 1;
    FluidSpaceDescriptor FileRoundTrip;
    if (!Require(DecodeSpaceFile(FluidPath, ".fluidspace", "frontier.fluidspace", 1, FileRoundTrip, &Diagnostic),
                 "fluidspace file decoding failed")) return 1;
    if (!Require(!EncodeSpaceFile(ForbiddenPath, ".fluidspace", "frontier.fluidspace", 1, Descriptor, &Diagnostic),
                 "forbidden TOML extension was accepted")) return 1;
    std::filesystem::remove_all(ScratchDirectory);
    if (!Require(RoundTrip.Configuration.CellCountX == 8 && RoundTrip.Spatial.PositionMetres == Descriptor.Spatial.PositionMetres,
                 "descriptor round-trip lost fields")) return 1;

    FluidSpace Space;
    if (!Require(Space.Construct(RoundTrip, &Diagnostic), "construct failed")) return 1;
    RadialFluidSource Source;
    Source.Spatial.PositionMetres = Space.CellWorldPosition(3, 3, 3);
    Source.RadiusMetres = 1.1;
    Source.AirVelocityMetresPerSecond = { 0.5, 0.0, 0.0 };
    Source.SmokeDensityRateKilogramsPerCubicMetreSecond = 2.0;
    Source.VaporDensityRateKilogramsPerCubicMetreSecond = 1.0;
    Source.TemperatureRateKelvinPerSecond = 400.0;
    if (!Require(FluidSourceProjector::ProjectSource(Space, Source, 0.05) > 0, "source did not affect cells")) return 1;

    const uint64_t InitialRevision = Space.QueryRevision();
    TestField Field;
    FluidSimulationSequence Sequence;
    if (!Require(Sequence.Advance(Space, 0.05, &Field, &Diagnostic), "simulation step failed")) return 1;
    if (!Require(Space.QueryRevision() == InitialRevision + 1, "simulation did not advance the revision")) return 1;

    bool FoundSmoke = false;
    bool FoundWind = false;
    for (const FluidCell& Cell : Space.QueryCells())
    {
        if (Cell.SmokeDensityKilogramsPerCubicMetre > 0.0 && Cell.TemperatureKelvin > Descriptor.Configuration.AmbientTemperatureKelvin)
            FoundSmoke = true;
        if (Cell.AirVelocityMetresPerSecond.X > 0.0) FoundWind = true;
        if (!Require(std::isfinite(Cell.PressurePotentialSquareMetresPerSecondSquared) && Cell.SmokeDensityKilogramsPerCubicMetre >= 0.0 &&
                     Cell.VaporDensityKilogramsPerCubicMetre >= 0.0, "simulation produced invalid cell values")) return 1;
    }
    if (!Require(FoundSmoke && FoundWind, "source or field coupling was lost during stepping")) return 1;
    const auto Events = Sequence.CollectBurstTriggers(Space, 0.05, 0.01, 0.01);
    if (!Require(!Events.empty() && Events.front().EnergyScale > 0.0, "fluid did not produce particle trigger events")) return 1;

    FluidSpace ProjectionSpace;
    if (!Require(ProjectionSpace.Construct(RoundTrip, &Diagnostic), "projection validation construction failed")) return 1;
    for (uint32_t Z = 0; Z < ProjectionSpace.QueryCellCountZ(); ++Z)
        for (uint32_t Y = 0; Y < ProjectionSpace.QueryCellCountY(); ++Y)
            for (uint32_t X = 0; X < ProjectionSpace.QueryCellCountX(); ++X)
                ProjectionSpace.AccessCell(X, Y, Z).AirVelocityMetresPerSecond =
                    { (static_cast<double>(X) - 3.5) * 0.1,
                      (static_cast<double>(Y) - 3.5) * 0.1,
                      (static_cast<double>(Z) - 3.5) * 0.1 };
    const double InitialDivergence = ComputeDivergenceMagnitude(ProjectionSpace);
    if (!Require(Sequence.Advance(ProjectionSpace, 0.01, nullptr, &Diagnostic), "pressure projection step failed")) return 1;
    const double ProjectedDivergence = ComputeDivergenceMagnitude(ProjectionSpace);
    if (!Require(ProjectedDivergence < InitialDivergence, "pressure projection did not reduce field divergence")) return 1;

    if (!Require(!Sequence.Advance(Space, 0.0, nullptr, &Diagnostic) && !Diagnostic.empty(), "invalid delta time was accepted")) return 1;
    std::cout << "FluidSpaceValidation: schema, radial source, wind coupling, pressure solve, and burst triggers passed\n";
    return 0;
}
