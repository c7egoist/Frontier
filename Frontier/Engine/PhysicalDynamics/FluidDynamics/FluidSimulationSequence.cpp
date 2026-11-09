/*==========================================================================================================================================
                                                    FLUIDSIMULATIONSEQUENCE.CPP
==========================================================================================================================================*/
// 🧩 Deterministic CPU fluid update: semi-Lagrangian advection, buoyancy, wind coupling, and Jacobi pressure projection.

#include "Engine/PhysicalDynamics/FluidDynamics/FluidSimulationSequence.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace Frontier
{
namespace
{

[[nodiscard]] double Mix(double A, double B, double T) noexcept
{
    return A + (B - A) * T;
}

[[nodiscard]] Vec3d Mix(const Vec3d& A, const Vec3d& B, double T) noexcept
{
    return A + (B - A) * T;
}

[[nodiscard]] FluidCell Mix(const FluidCell& A, const FluidCell& B, double T) noexcept
{
    FluidCell Result;
    Result.AirVelocityMetresPerSecond = Mix(A.AirVelocityMetresPerSecond, B.AirVelocityMetresPerSecond, T);
    Result.SmokeDensityKilogramsPerCubicMetre = Mix(A.SmokeDensityKilogramsPerCubicMetre, B.SmokeDensityKilogramsPerCubicMetre, T);
    Result.VaporDensityKilogramsPerCubicMetre = Mix(A.VaporDensityKilogramsPerCubicMetre, B.VaporDensityKilogramsPerCubicMetre, T);
    Result.TemperatureKelvin = Mix(A.TemperatureKelvin, B.TemperatureKelvin, T);
    Result.PressurePotentialSquareMetresPerSecondSquared =
        Mix(A.PressurePotentialSquareMetresPerSecondSquared, B.PressurePotentialSquareMetresPerSecondSquared, T);
    return Result;
}

[[nodiscard]] size_t Index(uint32_t X, uint32_t Y, uint32_t Z, uint32_t Width, uint32_t Height) noexcept
{
    return (static_cast<size_t>(Z) * Height + Y) * Width + X;
}

[[nodiscard]] FluidCell Sample(const std::vector<FluidCell>& Cells, uint32_t Width, uint32_t Height, uint32_t Depth,
                               const Vec3d& WorldPoint, const FluidSpaceDescriptor& Descriptor) noexcept
{
    const double CellSpan = Descriptor.Configuration.CellSpanMetres;
    const Vec3d ScaledLocalPoint = Descriptor.Spatial.RotationQuaternion().Conjugate().RotateVector(
        WorldPoint - Descriptor.Spatial.PositionMetres);
    const double GridX = ScaledLocalPoint.X / (CellSpan * Descriptor.Spatial.Scale.X) - 0.5;
    const double GridY = ScaledLocalPoint.Y / (CellSpan * Descriptor.Spatial.Scale.Y) - 0.5;
    const double GridZ = ScaledLocalPoint.Z / (CellSpan * Descriptor.Spatial.Scale.Z) - 0.5;
    const double ClampedX = std::clamp(GridX, 0.0, static_cast<double>(Width - 1));
    const double ClampedY = std::clamp(GridY, 0.0, static_cast<double>(Height - 1));
    const double ClampedZ = std::clamp(GridZ, 0.0, static_cast<double>(Depth - 1));
    const uint32_t X0 = static_cast<uint32_t>(std::floor(ClampedX));
    const uint32_t Y0 = static_cast<uint32_t>(std::floor(ClampedY));
    const uint32_t Z0 = static_cast<uint32_t>(std::floor(ClampedZ));
    const uint32_t X1 = std::min(X0 + 1, Width - 1);
    const uint32_t Y1 = std::min(Y0 + 1, Height - 1);
    const uint32_t Z1 = std::min(Z0 + 1, Depth - 1);
    const double Tx = ClampedX - X0, Ty = ClampedY - Y0, Tz = ClampedZ - Z0;
    const auto At = [&](uint32_t X, uint32_t Y, uint32_t Z) -> const FluidCell& { return Cells[Index(X, Y, Z, Width, Height)]; };
    const FluidCell Z00 = Mix(At(X0, Y0, Z0), At(X1, Y0, Z0), Tx);
    const FluidCell Z10 = Mix(At(X0, Y1, Z0), At(X1, Y1, Z0), Tx);
    const FluidCell Z01 = Mix(At(X0, Y0, Z1), At(X1, Y0, Z1), Tx);
    const FluidCell Z11 = Mix(At(X0, Y1, Z1), At(X1, Y1, Z1), Tx);
    return Mix(Mix(Z00, Z10, Ty), Mix(Z01, Z11, Ty), Tz);
}

[[nodiscard]] uint32_t ClampIndex(int32_t Value, uint32_t Limit) noexcept;

void DiffuseScalar(std::vector<FluidCell>& Cells,
                   uint32_t Width,
                   uint32_t Height,
                   uint32_t Depth,
                   double Diffusivity,
                   double DeltaSeconds,
                   double CellSpan,
                   uint32_t Iterations,
                   double FluidCell::* Property)
{
    const double λ = Diffusivity * DeltaSeconds / (CellSpan * CellSpan);
    if (λ <= 0.0) return;

    const size_t CellCount = Cells.size();
    std::vector<double> Original(CellCount), Diffused(CellCount), Next(CellCount);
    for (size_t Cell = 0; Cell < CellCount; ++Cell)
    {
        Original[Cell] = Cells[Cell].*Property;
        Diffused[Cell] = Original[Cell];
    }

    for (uint32_t Iteration = 0; Iteration < Iterations; ++Iteration)
    {
        for (uint32_t Z = 0; Z < Depth; ++Z)
            for (uint32_t Y = 0; Y < Height; ++Y)
                for (uint32_t X = 0; X < Width; ++X)
                {
                    const size_t Cell = Index(X, Y, Z, Width, Height);
                    const double NeighbourSum =
                        Diffused[Index(ClampIndex(static_cast<int32_t>(X) - 1, Width), Y, Z, Width, Height)] +
                        Diffused[Index(ClampIndex(static_cast<int32_t>(X) + 1, Width), Y, Z, Width, Height)] +
                        Diffused[Index(X, ClampIndex(static_cast<int32_t>(Y) - 1, Height), Z, Width, Height)] +
                        Diffused[Index(X, ClampIndex(static_cast<int32_t>(Y) + 1, Height), Z, Width, Height)] +
                        Diffused[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) - 1, Depth), Width, Height)] +
                        Diffused[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) + 1, Depth), Width, Height)];
                    Next[Cell] = (Original[Cell] + λ * NeighbourSum) / (1.0 + 6.0 * λ);
                }
        Diffused.swap(Next);
    }

    for (size_t Cell = 0; Cell < CellCount; ++Cell) Cells[Cell].*Property = Diffused[Cell];
}

[[nodiscard]] uint32_t ClampIndex(int32_t Value, uint32_t Limit) noexcept
{
    return static_cast<uint32_t>(std::clamp(Value, 0, static_cast<int32_t>(Limit) - 1));
}

} // namespace

bool FluidSimulationSequence::Advance(FluidSpace& Space, double DeltaSeconds, const IFieldSampler* FieldSampler,
                                      std::string* OutDiagnostic) const
{
    if (!std::isfinite(DeltaSeconds) || DeltaSeconds <= 0.0 || DeltaSeconds > 0.1)
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "Fluid step must be finite and in (0, 0.1] seconds";
        return false;
    }
    auto& Cells = Space.AccessCells();
    if (Cells.empty())
    {
        if (OutDiagnostic != nullptr) *OutDiagnostic = "FluidSpace must be constructed before stepping";
        return false;
    }

    const FluidSpaceConfiguration& Configuration = Space.QueryDescriptor().Configuration;
    const double AmbientKelvin = Configuration.AmbientTemperatureKelvin;
    for (uint32_t Z = 0; Z < Space.QueryCellCountZ(); ++Z)
        for (uint32_t Y = 0; Y < Space.QueryCellCountY(); ++Y)
            for (uint32_t X = 0; X < Space.QueryCellCountX(); ++X)
            {
                FluidCell& Cell = Space.AccessCell(X, Y, Z);
                const double ThermalDelta = Cell.TemperatureKelvin - AmbientKelvin;
                Cell.AirVelocityMetresPerSecond.Z += Configuration.BuoyancyAccelerationPerKelvin * ThermalDelta * DeltaSeconds;
                if (FieldSampler != nullptr && FieldSampler->QueryFieldEnabled())
                {
                    const Vec3d Wind = FieldSampler->SampleWorldFlow(Space.CellWorldPosition(X, Y, Z));
                    const double Blend = std::clamp(DeltaSeconds * 2.0, 0.0, 1.0);
                    Cell.AirVelocityMetresPerSecond = Mix(Cell.AirVelocityMetresPerSecond, Wind, Blend);
                }
            }

    Advect(Space, DeltaSeconds);
    auto& AdvectedCells = Space.AccessCells();
    DiffuseScalar(AdvectedCells, Space.QueryCellCountX(), Space.QueryCellCountY(), Space.QueryCellCountZ(),
                  Configuration.SmokeDiffusivitySquareMetresPerSecond, DeltaSeconds, Configuration.CellSpanMetres,
                  Configuration.PressureIterationCount, &FluidCell::SmokeDensityKilogramsPerCubicMetre);
    DiffuseScalar(AdvectedCells, Space.QueryCellCountX(), Space.QueryCellCountY(), Space.QueryCellCountZ(),
                  Configuration.VaporDiffusivitySquareMetresPerSecond, DeltaSeconds, Configuration.CellSpanMetres,
                  Configuration.PressureIterationCount, &FluidCell::VaporDensityKilogramsPerCubicMetre);
    ProjectDivergence(Space, DeltaSeconds);
    Space.AdvanceRevision();
    if (OutDiagnostic != nullptr) OutDiagnostic->clear();
    return true;
}

void FluidSimulationSequence::Advect(FluidSpace& Space, double DeltaSeconds)
{
    const uint32_t Width = Space.QueryCellCountX(), Height = Space.QueryCellCountY(), Depth = Space.QueryCellCountZ();
    const FluidSpaceDescriptor Descriptor = Space.QueryDescriptor();
    const std::vector<FluidCell> Previous = Space.QueryCells();
    std::vector<FluidCell>& Current = Space.AccessCells();
    for (uint32_t Z = 0; Z < Depth; ++Z)
        for (uint32_t Y = 0; Y < Height; ++Y)
            for (uint32_t X = 0; X < Width; ++X)
            {
                const size_t Cell = Index(X, Y, Z, Width, Height);
                const Vec3d Position = Space.CellWorldPosition(X, Y, Z);
                const Vec3d Backtrace = Position - Previous[Cell].AirVelocityMetresPerSecond * DeltaSeconds;
                Current[Cell] = Sample(Previous, Width, Height, Depth, Backtrace, Descriptor);
                Current[Cell].SmokeDensityKilogramsPerCubicMetre = std::max(0.0, Current[Cell].SmokeDensityKilogramsPerCubicMetre);
                Current[Cell].VaporDensityKilogramsPerCubicMetre = std::max(0.0, Current[Cell].VaporDensityKilogramsPerCubicMetre);
                Current[Cell].TemperatureKelvin = std::max(0.01, Current[Cell].TemperatureKelvin);
            }
}

void FluidSimulationSequence::ProjectDivergence(FluidSpace& Space, double DeltaSeconds)
{
    const uint32_t Width = Space.QueryCellCountX(), Height = Space.QueryCellCountY(), Depth = Space.QueryCellCountZ();
    const uint32_t Iterations = Space.QueryDescriptor().Configuration.PressureIterationCount;
    const double InverseCellSpan = 1.0 / Space.QueryDescriptor().Configuration.CellSpanMetres;
    const double InverseCellSpanSquared = InverseCellSpan * InverseCellSpan;
    const size_t Count = static_cast<size_t>(Width) * Height * Depth;
    std::vector<double> Divergence(Count, 0.0), Pressure(Count, 0.0), PressureNext(Count, 0.0);
    const auto& Cells = Space.QueryCells();
    const auto At = [&](int32_t X, int32_t Y, int32_t Z) -> const FluidCell& {
        return Cells[Index(ClampIndex(X, Width), ClampIndex(Y, Height), ClampIndex(Z, Depth), Width, Height)];
    };
    for (uint32_t Z = 0; Z < Depth; ++Z)
        for (uint32_t Y = 0; Y < Height; ++Y)
            for (uint32_t X = 0; X < Width; ++X)
            {
                const Vec3d Right = At(static_cast<int32_t>(X) + 1, Y, Z).AirVelocityMetresPerSecond;
                const Vec3d Left = At(static_cast<int32_t>(X) - 1, Y, Z).AirVelocityMetresPerSecond;
                const Vec3d North = At(X, static_cast<int32_t>(Y) + 1, Z).AirVelocityMetresPerSecond;
                const Vec3d South = At(X, static_cast<int32_t>(Y) - 1, Z).AirVelocityMetresPerSecond;
                const Vec3d Above = At(X, Y, static_cast<int32_t>(Z) + 1).AirVelocityMetresPerSecond;
                const Vec3d Below = At(X, Y, static_cast<int32_t>(Z) - 1).AirVelocityMetresPerSecond;
                Divergence[Index(X, Y, Z, Width, Height)] = 0.5 * InverseCellSpan *
                    ((Right.X - Left.X) + (North.Y - South.Y) + (Above.Z - Below.Z));
            }

    const double Denominator = 6.0 * InverseCellSpanSquared;
    for (uint32_t Iteration = 0; Iteration < Iterations; ++Iteration)
    {
        for (uint32_t Z = 0; Z < Depth; ++Z)
            for (uint32_t Y = 0; Y < Height; ++Y)
                for (uint32_t X = 0; X < Width; ++X)
                {
                    const size_t Cell = Index(X, Y, Z, Width, Height);
                    const double NeighbourPressure =
                        Pressure[Index(ClampIndex(static_cast<int32_t>(X) - 1, Width), Y, Z, Width, Height)] +
                        Pressure[Index(ClampIndex(static_cast<int32_t>(X) + 1, Width), Y, Z, Width, Height)] +
                        Pressure[Index(X, ClampIndex(static_cast<int32_t>(Y) - 1, Height), Z, Width, Height)] +
                        Pressure[Index(X, ClampIndex(static_cast<int32_t>(Y) + 1, Height), Z, Width, Height)] +
                        Pressure[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) - 1, Depth), Width, Height)] +
                        Pressure[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) + 1, Depth), Width, Height)];
                    PressureNext[Cell] = (NeighbourPressure * InverseCellSpanSquared - Divergence[Cell] / DeltaSeconds) / Denominator;
                }
        Pressure.swap(PressureNext);
    }

    auto& MutableCells = Space.AccessCells();
    for (uint32_t Z = 0; Z < Depth; ++Z)
        for (uint32_t Y = 0; Y < Height; ++Y)
            for (uint32_t X = 0; X < Width; ++X)
            {
                const size_t Cell = Index(X, Y, Z, Width, Height);
                const double PressureRight = Pressure[Index(ClampIndex(static_cast<int32_t>(X) + 1, Width), Y, Z, Width, Height)];
                const double PressureLeft = Pressure[Index(ClampIndex(static_cast<int32_t>(X) - 1, Width), Y, Z, Width, Height)];
                const double PressureNorth = Pressure[Index(X, ClampIndex(static_cast<int32_t>(Y) + 1, Height), Z, Width, Height)];
                const double PressureSouth = Pressure[Index(X, ClampIndex(static_cast<int32_t>(Y) - 1, Height), Z, Width, Height)];
                const double PressureAbove = Pressure[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) + 1, Depth), Width, Height)];
                const double PressureBelow = Pressure[Index(X, Y, ClampIndex(static_cast<int32_t>(Z) - 1, Depth), Width, Height)];
                Vec3d& Velocity = MutableCells[Cell].AirVelocityMetresPerSecond;
                Velocity.X -= 0.5 * DeltaSeconds * InverseCellSpan * (PressureRight - PressureLeft);
                Velocity.Y -= 0.5 * DeltaSeconds * InverseCellSpan * (PressureNorth - PressureSouth);
                Velocity.Z -= 0.5 * DeltaSeconds * InverseCellSpan * (PressureAbove - PressureBelow);
                MutableCells[Cell].PressurePotentialSquareMetresPerSecondSquared = Pressure[Cell];
            }
}

std::vector<FluidBurstTriggerEvent> FluidSimulationSequence::CollectBurstTriggers(const FluidSpace& Space,
                                                                                 double MinimumThermalIntensity,
                                                                                 double MinimumVaporDensity,
                                                                                 double MinimumSmokeDensity) const
{
    std::vector<FluidBurstTriggerEvent> Events;
    const auto& Descriptor = Space.QueryDescriptor();
    const double Ambient = Descriptor.Configuration.AmbientTemperatureKelvin;
    for (uint32_t Z = 0; Z < Space.QueryCellCountZ(); ++Z)
        for (uint32_t Y = 0; Y < Space.QueryCellCountY(); ++Y)
            for (uint32_t X = 0; X < Space.QueryCellCountX(); ++X)
            {
                const FluidCell& Cell = Space.QueryCell(X, Y, Z);
                const double ThermalIntensity = std::clamp((Cell.TemperatureKelvin - Ambient) / 200.0, 0.0, 1.0);
                if (ThermalIntensity < MinimumThermalIntensity && Cell.VaporDensityKilogramsPerCubicMetre < MinimumVaporDensity &&
                    Cell.SmokeDensityKilogramsPerCubicMetre < MinimumSmokeDensity)
                    continue;
                FluidBurstTriggerEvent Event;
                Event.WorldPointMetres = Space.CellWorldPosition(X, Y, Z);
                Event.ImpulseDirection = Normalise(Cell.AirVelocityMetresPerSecond + Vec3d{0.0, 0.0, 1.0e-9});
                Event.ThermalIntensity = ThermalIntensity;
                Event.VaporIntensity = Cell.VaporDensityKilogramsPerCubicMetre;
                Event.SmokeIntensity = Cell.SmokeDensityKilogramsPerCubicMetre;
                Event.EnergyScale = std::max({ ThermalIntensity, Event.VaporIntensity, Event.SmokeIntensity });
                Event.TriggerSeed = static_cast<uint32_t>(Space.CellIndex(X, Y, Z) ^ Space.QueryRevision());
                Events.push_back(Event);
            }
    std::sort(Events.begin(), Events.end(), [](const auto& Left, const auto& Right) { return Left.EnergyScale > Right.EnergyScale; });
    if (Events.size() > 32) Events.resize(32);
    return Events;
}

} // namespace Frontier
