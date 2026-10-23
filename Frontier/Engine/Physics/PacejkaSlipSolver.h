/*==========================================================================================================================================
                                                   PACEJKA SLIP SOLVER
==========================================================================================================================================*/
// 🧩 Pacejka MF6.1 pure-slip and combined-slip response, ported from the owner-authorized Frontier- reference.

#pragma once

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                           TYPES
//------------------------------------------------------------------------------------------------------------------------

struct PacejkaParameters
{
    double NominalLoadFz0 = 5.0; // [kN]
    double LongitudinalScaleLx = 1.2;
    double LateralScaleLy = 1.3;
    double LongitudinalLoadSensitivity = 0.08;
    double LateralLoadSensitivity = 0.12;
    double MinimumLoadFactor = 0.60;

    double LongitudinalB1 = 18.0;
    double LongitudinalB2 = 20.0;
    double LongitudinalB3 = 0.50;
    double LongitudinalC1 = 1.55;
    double LongitudinalD1 = 1.6;
    double LongitudinalD2 = -0.03;
    double LongitudinalD3 = 0.015;
    double LongitudinalE1 = -0.10;
    double LongitudinalE2 = -0.15;
    double LongitudinalE3 = 0.005;
    double LongitudinalE4 = 0.030;
    double LongitudinalH1 = 0.0;
    double LongitudinalH2 = 0.0;
    double LongitudinalV1 = 0.0;
    double LongitudinalV2 = 0.0;

    double LateralB1 = 18.0;
    double LateralB2 = 10.0;
    double LateralB3 = 0.10;
    double LateralC1 = 1.45;
    double LateralD1 = 1.85;
    double LateralD2 = -0.06;
    double LateralD3 = 0.10;
    double LateralE1 = -1.2;
    double LateralE2 = -0.50;
    double LateralE3 = 0.20;
    double LateralH1 = 0.0;
    double LateralH2 = 0.0;
    double LateralV1 = 0.0;
    double LateralV2 = 0.0;
    double LateralV3 = 0.0;
    double LateralV4 = 0.0;
    double Camber1 = 0.12;
    double Camber2 = -0.05;

    double CombinedLongitudinalB = 12.0;
    double CombinedLongitudinalC = 1.0;
    double CombinedLateralB1 = 5.0;
    double CombinedLateralB2 = 4.0;
    double CombinedLateralB4 = 0.0;
    double CombinedLateralC = 0.75;
    double CombinedLateralVertical1 = 0.0;
    double CombinedLateralVertical2 = 0.0;
    double CombinedLateralVertical3 = 0.0;
    double CombinedLateralVertical4 = 0.0;
    double CombinedLateralVertical5 = 1.9;

    double RelaxationLengthLongitudinal = 0.052; // [m]
    double RelaxationLengthLateral = 0.048;      // [m]
    double RelaxationLoadExponentLongitudinal = 0.4;
    double RelaxationLoadExponentLateral = 0.45;
};

struct TyreSlipForces
{
    double Fx = 0.0; // [N] - longitudinal force
    double Fy = 0.0; // [N] - lateral force
};

struct TyreRelaxationLengths
{
    double Longitudinal = 0.0; // [m]
    double Lateral = 0.0;      // [m]
};

//------------------------------------------------------------------------------------------------------------------------
//                                                           SOLVER
//------------------------------------------------------------------------------------------------------------------------

class PacejkaSlipSolver
{
  public:
    explicit PacejkaSlipSolver(PacejkaParameters Parameters = {});

    // Slip ratio κ [-], camber γ [rad], normal load Fz [N]. Result is in newtons.
    [[nodiscard]] double LongitudinalForce(double κ, double γ, double Fz) const noexcept;
    [[nodiscard]] double LateralForce(double α, double γ, double Fz) const noexcept;
    [[nodiscard]] TyreSlipForces Combine(double κ, double α, double γ, double Fz) const noexcept;
    [[nodiscard]] TyreRelaxationLengths ResolveRelaxationLengths(double Fz) const noexcept;

  private:
    struct CoefficientSet
    {
        double Fz0, InverseFz0, Ly, LoadLong, LoadLateral, LoadFloor;
        double Cx, Dx1, Dx2, Dx3, Bx1, Bx2, Bx3, Ex1, Ex2, Ex3, Ex4, Hx1, Hx2, Vx1, Vx2;
        double Cy, Dy1, Dy2, Dy3, By1, By2, By3, Ey1, Ey2, Ey3, Hy1, Hy2, Vy1, Vy2, Vy3, Vy4;
        double Camber1, Camber2;
        double rBx1, rCx1, rBy1, rBy2, rBy4, rCy1, rVy1, rVy2, rVy3, rVy4, rVy5;
    };

    PacejkaParameters Parameters_;
    CoefficientSet Coefficients_;
};

} // namespace Frontier
