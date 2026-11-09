/*==========================================================================================================================================
                                                            FLUIDSPACE.CPP
==========================================================================================================================================*/
// 🧩 Fluid field allocation, profile initialization, cell coordinates, and source injection.

#include "Engine/PhysicalDynamics/FluidDynamics/FluidSpace.h"

#include <cmath>
#include <limits>

namespace Frontier
{

bool FluidSpace::Construct(const FluidSpaceDescriptor& Descriptor, std::string* OutDiagnostic)
{
    const auto& Configuration = Descriptor.Configuration;
    const uint64_t CellCount = static_cast<uint64_t>(Configuration.CellCountX) * Configuration.CellCountY * Configuration.CellCountZ;
    const bool Valid = Configuration.CellCountX >= 2 && Configuration.CellCountX <= 128 &&
                       Configuration.CellCountY >= 2 && Configuration.CellCountY <= 128 &&
                       Configuration.CellCountZ >= 2 && Configuration.CellCountZ <= 128 &&
                       CellCount <= 1048576 && Configuration.PressureIterationCount >= 1 &&
                       Configuration.PressureIterationCount <= 128 && std::isfinite(Configuration.CellSpanMetres) &&
                       Configuration.CellSpanMetres > 0.0 && std::isfinite(Configuration.AmbientTemperatureKelvin) &&
                       Configuration.AmbientTemperatureKelvin > 0.0 &&
                       std::isfinite(Configuration.BuoyancyAccelerationPerKelvin) &&
                       Configuration.BuoyancyAccelerationPerKelvin >= 0.0 &&
                       std::isfinite(Configuration.SmokeDiffusivitySquareMetresPerSecond) &&
                       Configuration.SmokeDiffusivitySquareMetresPerSecond >= 0.0 &&
                       std::isfinite(Configuration.VaporDiffusivitySquareMetresPerSecond) &&
                       Configuration.VaporDiffusivitySquareMetresPerSecond >= 0.0 &&
                       std::isfinite(Descriptor.Spatial.PositionMetres.X) && std::isfinite(Descriptor.Spatial.PositionMetres.Y) &&
                       std::isfinite(Descriptor.Spatial.PositionMetres.Z) &&
                       std::isfinite(Descriptor.Spatial.OrientationDegrees.X) &&
                       std::isfinite(Descriptor.Spatial.OrientationDegrees.Y) &&
                       std::isfinite(Descriptor.Spatial.OrientationDegrees.Z) &&
                       std::isfinite(Descriptor.Thermal.TemperatureKelvin) && Descriptor.Thermal.TemperatureKelvin > 0.0 &&
                       std::isfinite(Descriptor.Spatial.Scale.X) &&
                       std::isfinite(Descriptor.Spatial.Scale.Y) && std::isfinite(Descriptor.Spatial.Scale.Z) &&
                       Descriptor.Spatial.Scale.X > 0.0 && Descriptor.Spatial.Scale.Y > 0.0 && Descriptor.Spatial.Scale.Z > 0.0;
    if (!Valid)
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "FluidSpace configuration is outside its finite supported domain";
        return false;
    }

    Descriptor_ = Descriptor;
    Cells_.assign(static_cast<size_t>(CellCount), FluidCell{});
    const double InitialTemperatureKelvin = Descriptor.Thermal.Enabled ? Descriptor.Thermal.TemperatureKelvin
                                                                       : Configuration.AmbientTemperatureKelvin;
    for (FluidCell& Cell : Cells_) Cell.TemperatureKelvin = InitialTemperatureKelvin;
    ++Revision_;
    if (OutDiagnostic != nullptr) OutDiagnostic->clear();
    return true;
}

void FluidSpace::Reset() noexcept
{
    Cells_.clear();
    ++Revision_;
}

size_t FluidSpace::CellIndex(uint32_t X, uint32_t Y, uint32_t Z) const noexcept
{
    return (static_cast<size_t>(Z) * Descriptor_.Configuration.CellCountY + Y) * Descriptor_.Configuration.CellCountX + X;
}

Vec3d FluidSpace::CellWorldPosition(uint32_t X, uint32_t Y, uint32_t Z) const noexcept
{
    const double Span = Descriptor_.Configuration.CellSpanMetres;
    const Vec3d Local{ (static_cast<double>(X) + 0.5) * Span * Descriptor_.Spatial.Scale.X,
                       (static_cast<double>(Y) + 0.5) * Span * Descriptor_.Spatial.Scale.Y,
                       (static_cast<double>(Z) + 0.5) * Span * Descriptor_.Spatial.Scale.Z };
    return Descriptor_.Spatial.PositionMetres + Descriptor_.Spatial.RotationQuaternion().RotateVector(Local);
}

FluidCell& FluidSpace::AccessCell(uint32_t X, uint32_t Y, uint32_t Z) noexcept
{
    return Cells_[CellIndex(X, Y, Z)];
}

const FluidCell& FluidSpace::QueryCell(uint32_t X, uint32_t Y, uint32_t Z) const noexcept
{
    return Cells_[CellIndex(X, Y, Z)];
}

void FluidSpace::Inject(uint32_t X, uint32_t Y, uint32_t Z, const FluidSourceContribution& Contribution) noexcept
{
    FluidCell& Cell = AccessCell(X, Y, Z);
    Cell.AirVelocityMetresPerSecond += Contribution.AirVelocityMetresPerSecond;
    Cell.SmokeDensityKilogramsPerCubicMetre = std::max(0.0, Cell.SmokeDensityKilogramsPerCubicMetre + Contribution.SmokeDensityKilogramsPerCubicMetre);
    Cell.VaporDensityKilogramsPerCubicMetre = std::max(0.0, Cell.VaporDensityKilogramsPerCubicMetre + Contribution.VaporDensityKilogramsPerCubicMetre);
    Cell.TemperatureKelvin = std::max(0.01, Cell.TemperatureKelvin + Contribution.TemperatureKelvin);
}

} // namespace Frontier
