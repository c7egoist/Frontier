/*==========================================================================================================================================
                                                            FLUIDSPACE.H
==========================================================================================================================================*/
// 🧩 CPU Eulerian fluid field, shared spatial/thermal profiles, and declarative .fluidspace settings.

#pragma once

#include "Frontier/Engine/Foundation/Math.h"
#include "Frontier/Engine/Scene/Profiles/ProfileSchemas.h"
#include "Frontier/Engine/Scene/SpaceCodec.h"

#include <algorithm>
#include <cmath>
#include <concepts>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace Frontier
{

struct FluidSpaceConfiguration
{
    uint32_t CellCountX = 16;
    uint32_t CellCountY = 16;
    uint32_t CellCountZ = 16;
    uint32_t PressureIterationCount = 24;
    double CellSpanMetres = 0.25;
    double AmbientTemperatureKelvin = 293.15;
    double BuoyancyAccelerationPerKelvin = 0.02;
    double SmokeDiffusivitySquareMetresPerSecond = 0.0;
    double VaporDiffusivitySquareMetresPerSecond = 0.0;
};

template <>
struct SpaceSchema<FluidSpaceConfiguration>
{
    static constexpr auto Bindings() noexcept
    {
        using F = FluidSpaceConfiguration;
        return std::make_tuple(
            MakeClampedField("cell_count_x", &F::CellCountX, 2.0, 128.0),
            MakeClampedField("cell_count_y", &F::CellCountY, 2.0, 128.0),
            MakeClampedField("cell_count_z", &F::CellCountZ, 2.0, 128.0),
            MakeClampedField("pressure_iteration_count", &F::PressureIterationCount, 1.0, 128.0),
            MakeClampedField("cell_span_metres", &F::CellSpanMetres, 1.0e-3, 1000.0),
            MakeClampedField("ambient_temperature_kelvin", &F::AmbientTemperatureKelvin, 0.01, 100000.0),
            MakeClampedField("buoyancy_acceleration_per_kelvin", &F::BuoyancyAccelerationPerKelvin, 0.0, 100.0),
            MakeClampedField("smoke_diffusivity_square_metres_per_second", &F::SmokeDiffusivitySquareMetresPerSecond, 0.0, 100.0),
            MakeClampedField("vapor_diffusivity_square_metres_per_second", &F::VaporDiffusivitySquareMetresPerSecond, 0.0, 100.0));
    }
};

struct FluidSpaceDescriptor
{
    SpatialProfile Spatial{};
    ThermalProfile Thermal{};
    FluidSpaceConfiguration Configuration{};
};

template <>
struct SpaceSchema<FluidSpaceDescriptor>
{
    static constexpr auto Bindings() noexcept
    {
        using F = FluidSpaceDescriptor;
        return std::make_tuple(
            MakeFieldBinding("spatial", &F::Spatial),
            MakeFieldBinding("thermal", &F::Thermal),
            MakeFieldBinding("fluid", &F::Configuration));
    }
};

struct FluidCell
{
    Vec3d  AirVelocityMetresPerSecond{};
    double SmokeDensityKilogramsPerCubicMetre = 0.0;
    double VaporDensityKilogramsPerCubicMetre = 0.0;
    double TemperatureKelvin = 293.15;
    double PressurePotentialSquareMetresPerSecondSquared = 0.0;
};

struct FluidSourceContribution
{
    Vec3d  AirVelocityMetresPerSecond{};
    double SmokeDensityKilogramsPerCubicMetre = 0.0;
    double VaporDensityKilogramsPerCubicMetre = 0.0;
    double TemperatureKelvin = 0.0;
};

struct RadialFluidSource
{
    SpatialProfile Spatial{};
    double RadiusMetres = 1.0;
    Vec3d  AirVelocityMetresPerSecond{};
    double SmokeDensityRateKilogramsPerCubicMetreSecond = 0.0;
    double VaporDensityRateKilogramsPerCubicMetreSecond = 0.0;
    double TemperatureRateKelvinPerSecond = 0.0;

    [[nodiscard]] FluidSourceContribution Sample(const Vec3d& WorldPointMetres, double DeltaSeconds) const noexcept
    {
        if (!std::isfinite(DeltaSeconds) || DeltaSeconds <= 0.0 || !std::isfinite(RadiusMetres) || RadiusMetres <= 0.0 ||
            !std::isfinite(WorldPointMetres.X) || !std::isfinite(WorldPointMetres.Y) || !std::isfinite(WorldPointMetres.Z) ||
            !std::isfinite(Spatial.PositionMetres.X) || !std::isfinite(Spatial.PositionMetres.Y) ||
            !std::isfinite(Spatial.PositionMetres.Z) || !std::isfinite(AirVelocityMetresPerSecond.X) ||
            !std::isfinite(AirVelocityMetresPerSecond.Y) || !std::isfinite(AirVelocityMetresPerSecond.Z) ||
            !std::isfinite(SmokeDensityRateKilogramsPerCubicMetreSecond) ||
            !std::isfinite(VaporDensityRateKilogramsPerCubicMetreSecond) || !std::isfinite(TemperatureRateKelvinPerSecond))
            return {};
        const double SafeRadius = RadiusMetres;
        const double DistanceMetres = Distance(Spatial.PositionMetres, WorldPointMetres);
        const double Weight = std::clamp(1.0 - DistanceMetres / SafeRadius, 0.0, 1.0);
        return { AirVelocityMetresPerSecond * (Weight * DeltaSeconds),
                 SmokeDensityRateKilogramsPerCubicMetreSecond * Weight * DeltaSeconds,
                 VaporDensityRateKilogramsPerCubicMetreSecond * Weight * DeltaSeconds,
                 TemperatureRateKelvinPerSecond * Weight * DeltaSeconds };
    }
};

class FluidSpace
{
  public:
    [[nodiscard]] bool Construct(const FluidSpaceDescriptor& Descriptor, std::string* OutDiagnostic = nullptr);
    void               Reset() noexcept;

    [[nodiscard]] const FluidSpaceDescriptor& QueryDescriptor() const noexcept { return Descriptor_; }
    [[nodiscard]] FluidSpaceDescriptor&       AccessDescriptor() noexcept { return Descriptor_; }
    [[nodiscard]] const std::vector<FluidCell>& QueryCells() const noexcept { return Cells_; }
    [[nodiscard]] std::vector<FluidCell>&       AccessCells() noexcept { return Cells_; }
    [[nodiscard]] uint32_t QueryCellCountX() const noexcept { return Descriptor_.Configuration.CellCountX; }
    [[nodiscard]] uint32_t QueryCellCountY() const noexcept { return Descriptor_.Configuration.CellCountY; }
    [[nodiscard]] uint32_t QueryCellCountZ() const noexcept { return Descriptor_.Configuration.CellCountZ; }
    [[nodiscard]] uint64_t QueryRevision() const noexcept { return Revision_; }

    [[nodiscard]] size_t CellIndex(uint32_t X, uint32_t Y, uint32_t Z) const noexcept;
    [[nodiscard]] Vec3d  CellWorldPosition(uint32_t X, uint32_t Y, uint32_t Z) const noexcept;
    [[nodiscard]] FluidCell&       AccessCell(uint32_t X, uint32_t Y, uint32_t Z) noexcept;
    [[nodiscard]] const FluidCell& QueryCell(uint32_t X, uint32_t Y, uint32_t Z) const noexcept;
    void Inject(uint32_t X, uint32_t Y, uint32_t Z, const FluidSourceContribution& Contribution) noexcept;
    void AdvanceRevision() noexcept { ++Revision_; }

  private:
    FluidSpaceDescriptor Descriptor_{};
    std::vector<FluidCell> Cells_{};
    uint64_t Revision_ = 0;
};

class FluidSourceProjector
{
  public:
    template <typename SourceT>
        requires requires(const SourceT& Source, const Vec3d& Position, double DeltaSeconds) {
            { Source.Sample(Position, DeltaSeconds) } -> std::same_as<FluidSourceContribution>;
        }
    [[nodiscard]] static uint32_t ProjectSource(FluidSpace& Space, const SourceT& Source, double DeltaSeconds)
    {
        uint32_t AffectedCells = 0;
        for (uint32_t Z = 0; Z < Space.QueryCellCountZ(); ++Z)
            for (uint32_t Y = 0; Y < Space.QueryCellCountY(); ++Y)
                for (uint32_t X = 0; X < Space.QueryCellCountX(); ++X)
                {
                    const FluidSourceContribution Contribution = Source.Sample(Space.CellWorldPosition(X, Y, Z), DeltaSeconds);
                    if (Contribution.TemperatureKelvin == 0.0 && Contribution.SmokeDensityKilogramsPerCubicMetre == 0.0 &&
                        Contribution.VaporDensityKilogramsPerCubicMetre == 0.0 && LengthSquared(Contribution.AirVelocityMetresPerSecond) == 0.0)
                        continue;
                    Space.Inject(X, Y, Z, Contribution);
                    ++AffectedCells;
                }
        return AffectedCells;
    }
};

} // namespace Frontier
