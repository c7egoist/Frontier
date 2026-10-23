/*==========================================================================================================================================
                                               PACEJKA SLIP SOLVER DEFINITION
==========================================================================================================================================*/

#include "PacejkaSlipSolver.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

namespace
{

constexpr double Small = 1.0e-8;
constexpr double SlipRatioMinimum = -0.92;
constexpr double SlipRatioMaximum = 1.5;
constexpr double SlipAngleMaximum = 1.3;

[[nodiscard]] double Clamp(double Scalar, double Minimum, double Maximum) noexcept
{
    return Scalar < Minimum ? Minimum : (Scalar > Maximum ? Maximum : Scalar);
}

[[nodiscard]] double Sign(double Scalar) noexcept
{
    return Scalar > 0.0 ? 1.0 : (Scalar < 0.0 ? -1.0 : 0.0);
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                        INITIALIZATION
//------------------------------------------------------------------------------------------------------------------------

PacejkaSlipSolver::PacejkaSlipSolver(PacejkaParameters Parameters)
    : Parameters_(Parameters)
    , Coefficients_{
          std::max(Parameters.NominalLoadFz0, 0.001),
          1.0 / std::max(Parameters.NominalLoadFz0, 0.001),
          Parameters.LateralScaleLy,
          Parameters.LongitudinalLoadSensitivity,
          Parameters.LateralLoadSensitivity,
          Parameters.MinimumLoadFactor,
          Parameters.LongitudinalC1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalD1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalD2 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalD3,
          Parameters.LongitudinalB1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalB2 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalB3,
          Parameters.LongitudinalE1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalE2 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalE3 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalE4,
          Parameters.LongitudinalH1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalH2 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalV1 * Parameters.LongitudinalScaleLx,
          Parameters.LongitudinalV2 * Parameters.LongitudinalScaleLx,
          Parameters.LateralC1 * Parameters.LateralScaleLy,
          Parameters.LateralD1 * Parameters.LateralScaleLy,
          Parameters.LateralD2 * Parameters.LateralScaleLy,
          Parameters.LateralD3,
          Parameters.LateralB1 * Parameters.LateralScaleLy,
          Parameters.LateralB2 * Parameters.LateralScaleLy,
          Parameters.LateralB3,
          Parameters.LateralE1 * Parameters.LateralScaleLy,
          Parameters.LateralE2 * Parameters.LateralScaleLy,
          Parameters.LateralE3,
          Parameters.LateralH1 * Parameters.LateralScaleLy,
          Parameters.LateralH2 * Parameters.LateralScaleLy,
          Parameters.LateralV1 * Parameters.LateralScaleLy,
          Parameters.LateralV2 * Parameters.LateralScaleLy,
          Parameters.LateralV3,
          Parameters.LateralV4,
          Parameters.Camber1 * Parameters.LateralScaleLy,
          Parameters.Camber2 * Parameters.LateralScaleLy,
          Parameters.CombinedLongitudinalB,
          Parameters.CombinedLongitudinalC,
          Parameters.CombinedLateralB1,
          Parameters.CombinedLateralB2,
          Parameters.CombinedLateralB4,
          Parameters.CombinedLateralC,
          Parameters.CombinedLateralVertical1,
          Parameters.CombinedLateralVertical2,
          Parameters.CombinedLateralVertical3,
          Parameters.CombinedLateralVertical4,
          Parameters.CombinedLateralVertical5}
{
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   PURE-SLIP RESPONSE
//------------------------------------------------------------------------------------------------------------------------

double PacejkaSlipSolver::LongitudinalForce(double κ, double γ, double Fz) const noexcept
{
    if (Fz < Small)
    {
        return 0.0;
    }
    const CoefficientSet& C = Coefficients_;
    κ = Clamp(κ, SlipRatioMinimum, SlipRatioMaximum);
    const double FzKilonewtons = Fz * 0.001;
    const double ΔFz = (FzKilonewtons - C.Fz0) * C.InverseFz0;
    const double Shifted = κ + C.Hx1 + C.Hx2 * ΔFz;
    const double Nominal = (C.Dx1 + C.Dx2 * ΔFz) * FzKilonewtons * (1.0 - C.Dx3 * γ * γ);
    const double Dx = Nominal * std::max(1.0 - C.LoadLong * std::abs(ΔFz), C.LoadFloor);
    const double BCD = (C.Bx1 + C.Bx2 * ΔFz) * (1.0 - C.Bx3 * std::abs(γ)) * FzKilonewtons;
    const double Bx = BCD / std::max(C.Cx * Dx, Small);
    const double Ex = Clamp((C.Ex1 + C.Ex2 * ΔFz + C.Ex3 * ΔFz * ΔFz) *
                            (1.0 - C.Ex4 * Sign(Shifted)), -1.0, 1.0);
    const double SVx = (C.Vx1 + C.Vx2 * ΔFz) * FzKilonewtons;
    const double Product = Bx * Shifted;
    return (Dx * std::sin(C.Cx * std::atan(Product - Ex * (Product - std::atan(Product)))) + SVx) * 1000.0;
}

double PacejkaSlipSolver::LateralForce(double α, double γ, double Fz) const noexcept
{
    if (Fz < Small)
    {
        return 0.0;
    }
    const CoefficientSet& C = Coefficients_;
    α = Clamp(α, -SlipAngleMaximum, SlipAngleMaximum);
    const double FzKilonewtons = Fz * 0.001;
    const double ΔFz = (FzKilonewtons - C.Fz0) * C.InverseFz0;
    const double SVy0 = (C.Vy1 + C.Vy2 * ΔFz) * FzKilonewtons;
    const double SVyGamma = FzKilonewtons * (C.Vy3 + C.Vy4 * ΔFz) * γ * C.Ly;
    const double KyGamma = (C.Camber1 + C.Camber2 * ΔFz) * FzKilonewtons;
    const double Nominal = (C.Dy1 + C.Dy2 * ΔFz) * FzKilonewtons * (1.0 - C.Dy3 * γ * γ);
    const double Dy = Nominal * std::max(1.0 - C.LoadLateral * std::abs(ΔFz), C.LoadFloor);
    const double BCD = (C.By1 + C.By2 * ΔFz) * (1.0 - C.By3 * std::abs(γ)) * FzKilonewtons;
    const double By = BCD / std::max(C.Cy * Dy, Small);
    const double SHy = C.Hy1 + C.Hy2 * ΔFz + (KyGamma * γ - SVyGamma) / std::max(BCD, Small);
    const double Effective = α + SHy;
    const double Ey = Clamp((C.Ey1 + C.Ey2 * ΔFz) * (1.0 - C.Ey3 * Sign(Effective)), -1.0, 1.0);
    const double Product = By * Effective;
    return (Dy * std::sin(C.Cy * std::atan(Product - Ey * (Product - std::atan(Product)))) + SVy0 + SVyGamma) * 1000.0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    COMBINED RESPONSE
//------------------------------------------------------------------------------------------------------------------------

TyreSlipForces PacejkaSlipSolver::Combine(double κ, double α, double γ, double Fz) const noexcept
{
    TyreSlipForces Forces{LongitudinalForce(κ, γ, Fz), LateralForce(α, γ, Fz)};
    if (Fz < Small)
    {
        return {};
    }

    const CoefficientSet& C = Coefficients_;
    κ = Clamp(κ, SlipRatioMinimum, SlipRatioMaximum);
    α = Clamp(α, -SlipAngleMaximum, SlipAngleMaximum);
    const double FzKilonewtons = Fz * 0.001;
    const double ΔFz = (FzKilonewtons - C.Fz0) * C.InverseFz0;
    const double StiffnessLong = (C.Bx1 + C.Bx2 * ΔFz) * (1.0 - C.Bx3 * std::abs(γ)) * FzKilonewtons;
    const double StiffnessLateral = (C.By1 + C.By2 * ΔFz) * (1.0 - C.By3 * std::abs(γ)) * FzKilonewtons;
    const double κs = κ / std::max(StiffnessLong, Small);
    const double αs = std::tan(α) / std::max(StiffnessLateral, Small);
    const double Combined = std::hypot(κs, αs);
    double Gx = 1.0;
    double Gy = 1.0;
    if (Combined > Small)
    {
        Gx = std::cos(C.rCx1 * std::atan(C.rBx1 * αs));
        const double rBy = C.rBy1 * std::cos(std::atan(C.rBy2 * (α - C.rBy4)));
        Gy = std::cos(C.rCy1 * std::atan(rBy * κs * Combined));
    }
    const double DyKappa = (C.rVy1 + C.rVy2 * ΔFz + C.rVy3 * γ) * std::cos(std::atan(C.rVy4 * α));
    const double SVyKappa = DyKappa * std::sin(std::atan(C.rVy5 * κ)) * FzKilonewtons;
    Forces.Fx *= Gx;
    Forces.Fy = Forces.Fy * Gy + SVyKappa * 1000.0;
    return Forces;
}

TyreRelaxationLengths PacejkaSlipSolver::ResolveRelaxationLengths(double Fz) const noexcept
{
    const double Ratio = std::max(Fz * 0.001 / Parameters_.NominalLoadFz0, 0.05);
    return {Parameters_.RelaxationLengthLongitudinal *
                std::pow(Ratio, Parameters_.RelaxationLoadExponentLongitudinal),
            Parameters_.RelaxationLengthLateral *
                std::pow(Ratio, Parameters_.RelaxationLoadExponentLateral)};
}

} // namespace Frontier
