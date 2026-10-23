/*==========================================================================================================================================
                                                  PACEJKA SLIP VALIDATION
==========================================================================================================================================*/
// 🧩 Differential MF6.1 oracle for the authorized previous-project JavaScript reference.

#include "Engine/Physics/PacejkaSlipSolver.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>

namespace
{

struct SlipOracle
{
    double κ, α, γ, Fz;
    double FxPure, FyPure, FxCombined, FyCombined;
};

constexpr SlipOracle Oracles[] = {
    {0.00,  0.00,  0.00, 4000.0,    0.0,     0.0,    0.0,     0.0},
    {0.10,  0.00,  0.00, 4000.0, 5601.0663544858444,    0.0, 5601.0663544858444,    0.0},
    {0.20,  0.00,  0.00, 4000.0, 7511.1794834348402,    0.0, 7511.1794834348402,    0.0},
    {-0.10, 0.00,  0.00, 4000.0,-5602.3026543698361,    0.0,-5602.3026543698361,    0.0},
    {-0.20, 0.00,  0.00, 4000.0,-7512.1541081051228,    0.0,-7512.1541081051228,    0.0},
    {0.00,  0.10,  0.00, 4000.0,    0.0, 7221.1916195446011,    0.0, 7221.1916195446011},
    {0.00, -0.10,  0.00, 4000.0,    0.0,-7221.1916195446011,    0.0,-7221.1916195446011},
    {0.12,  0.08,  0.04, 5000.0, 8813.6910891649150, 8385.9126285611455, 8813.3907489705234, 8385.9126284402191},
    {-0.25,-0.16, -0.08, 3200.0,-5877.5958716149407,-7015.6586255257125,-5874.4773554371577,-7015.6585609416234},
    {0.50,  0.30,  0.12, 7500.0, 7338.8826707875605,11557.9411810453200, 7337.8528684783414,11557.9411800949260},
    {1.50,  1.30,  0.20, 9000.0, 4860.3257565257381, 5135.0083246352424, 4810.0270564002694, 5135.0083202159167},
    {-0.92,-1.30, -0.20, 9000.0,-5712.4180227037923,-5135.0083246352424,-5653.3011619194058,-5135.0083231010331},
    {0.03, -0.21,  0.15, 1800.0,  310.96663702025393,-3919.1843584913490, 309.55345635172404,-3919.1843488073664}
};

uint32_t Checks = 0;
uint32_t Failures = 0;

void AssertEquivalent(double Actual, double Expected, const char* Quantity, uint32_t Sample)
{
    ++Checks;
    const double Tolerance = std::max(1e-8, std::abs(Expected) * 2e-12);
    if (!std::isfinite(Actual) || std::abs(Actual - Expected) > Tolerance)
    {
        ++Failures;
        std::printf("FAIL sample %u %s: %.15g vs JS %.15g (tol %.3g)\n", Sample, Quantity, Actual, Expected, Tolerance);
    }
}

void AssertCondition(bool Condition, const char* Description)
{
    ++Checks;
    if (!Condition)
    {
        ++Failures;
        std::printf("FAIL %s\n", Description);
    }
}

} // namespace

int main()
{
    using namespace Frontier;
    const PacejkaSlipSolver Solver;

    for (uint32_t Index = 0; Index < sizeof(Oracles) / sizeof(Oracles[0]); ++Index)
    {
        const SlipOracle& Oracle = Oracles[Index];
        const double FxPure = Solver.LongitudinalForce(Oracle.κ, Oracle.γ, Oracle.Fz);
        const double FyPure = Solver.LateralForce(Oracle.α, Oracle.γ, Oracle.Fz);
        const TyreSlipForces Combined = Solver.Combine(Oracle.κ, Oracle.α, Oracle.γ, Oracle.Fz);
        AssertEquivalent(FxPure, Oracle.FxPure, "pure Fx [N]", Index);
        AssertEquivalent(FyPure, Oracle.FyPure, "pure Fy [N]", Index);
        AssertEquivalent(Combined.Fx, Oracle.FxCombined, "combined Fx [N]", Index);
        AssertEquivalent(Combined.Fy, Oracle.FyCombined, "combined Fy [N]", Index);
    }

    // 📝 Four loads pin the source's relaxation-length equation, including its 5% floor.
    constexpr double RelaxationLoads[] = {0.0, 1000.0, 4000.0, 9000.0};
    constexpr TyreRelaxationLengths RelaxationOracles[] = {
        {0.015688858475017421, 0.012467452989764769},
        {0.027315889165799176, 0.023265089919769472},
        {0.047559725400441941, 0.043414192892430668},
        {0.065782798589468991, 0.062533662397720499}
    };
    for (uint32_t Index = 0; Index < 4; ++Index)
    {
        const TyreRelaxationLengths Lengths = Solver.ResolveRelaxationLengths(RelaxationLoads[Index]);
        AssertEquivalent(Lengths.Longitudinal, RelaxationOracles[Index].Longitudinal, "long relaxation [m]", Index);
        AssertEquivalent(Lengths.Lateral, RelaxationOracles[Index].Lateral, "lateral relaxation [m]", Index);
    }

    AssertCondition(Solver.LongitudinalForce(0.0, 0.0, 0.0) == 0.0, "zero normal load returns zero Fx");
    AssertCondition(Solver.LateralForce(0.0, 0.0, 0.0) == 0.0, "zero normal load returns zero Fy");
    AssertCondition(Solver.Combine(0.2, 0.1, 0.0, 0.0).Fx == 0.0, "zero normal load returns zero combined force");
    AssertEquivalent(Solver.LongitudinalForce(3.0, 0.0, 4000.0), Solver.LongitudinalForce(1.5, 0.0, 4000.0),
                     "positive κ saturation", 0);
    AssertEquivalent(Solver.LongitudinalForce(-2.0, 0.0, 4000.0), Solver.LongitudinalForce(-0.92, 0.0, 4000.0),
                     "negative κ saturation", 0);
    AssertEquivalent(Solver.LateralForce(2.0, 0.0, 4000.0), Solver.LateralForce(1.3, 0.0, 4000.0),
                     "positive α saturation", 0);
    AssertEquivalent(Solver.LateralForce(-2.0, 0.0, 4000.0), Solver.LateralForce(-1.3, 0.0, 4000.0),
                     "negative α saturation", 0);

    // 📝 Backward-Euler slip coordinates, evaluated from the authorized VehicleSolver.js equations.
    struct TransientOracle
    {
        TyreSlipCoordinates Current;
        double LongitudinalVelocity, LateralVelocity, WheelAngularVelocity, RollingRadius, Fz, Timestep;
        TyreSlipCoordinates Expected;
    };
    constexpr TransientOracle TransientOracles[] = {
        {{0.0, 0.0}, 15.0, 0.0, 28.0, 0.50855, 4000.0, 1.0 / 480.0, {-0.020106444036974799, 0.0}},
        {{0.08, -0.03}, 24.0, 1.2, 41.0, 0.50855, 5600.0, 1.0 / 480.0, {-0.021151271797208094, -0.039949120869700955}},
        {{-0.12, 0.07}, -8.0, -0.8, -12.0, 0.49, 2500.0, 1.0 / 480.0, {-0.0055705281175808356, 0.079651629571208374}},
        {{0.3, -0.25}, 35.0, 3.2, 61.0, 0.5, 8000.0, 1.0 / 240.0, {0.00036737438471535979, -0.13727148509344772}},
        {{-0.4, 0.4}, 18.0, -5.0, 30.0, 0.46, 6200.0, 1.0 / 600.0, {-0.34231154448411139, 0.35575865151005054}},
        {{1.4, -1.2}, 50.0, 8.0, 90.0, 0.5, 9000.0, 1.0 / 120.0, {0.10452753084059631, -0.29571570165781536}},
        {{-1.4, 1.2}, -20.0, -7.0, -35.0, 0.5, 1000.0, 1.0 / 120.0, {-0.089744726911531264, 0.45411806212514283}},
        {{0.01, 0.02}, 0.2, -0.1, 0.3, 0.50855, 4000.0, 1.0 / 480.0, {0.0078533278786517904, 0.024562995159388538}},
        {{0.5, 0.8}, 12.0, 4.0, 15.0, 0.5, 0.0, 1.0 / 480.0, {-0.037616458653688810, 0.043788112816920424}},
        {{0.2, -0.1}, 30.0, 0.0, 0.0, 0.5, 5000.0, 0.0, {0.2, -0.1}}
    };
    for (uint32_t Index = 0; Index < sizeof(TransientOracles) / sizeof(TransientOracles[0]); ++Index)
    {
        const TransientOracle& Oracle = TransientOracles[Index];
        const TyreSlipCoordinates Updated = Solver.IntegrateTransientSlip(
            Oracle.Current,
            Oracle.LongitudinalVelocity,
            Oracle.LateralVelocity,
            Oracle.WheelAngularVelocity,
            Oracle.RollingRadius,
            Oracle.Fz,
            Oracle.Timestep);
        AssertEquivalent(Updated.Kappa, Oracle.Expected.Kappa, "transient κ", Index);
        AssertEquivalent(Updated.Alpha, Oracle.Expected.Alpha, "transient α", Index);
    }

    const TyreSlipCoordinates PositiveClamp = Solver.IntegrateTransientSlip({10.0, 10.0}, 0.0, 0.0, 0.0, 0.5, 4000.0, 1.0);
    const TyreSlipCoordinates NegativeClamp = Solver.IntegrateTransientSlip({-10.0, -10.0}, 0.0, 0.0, 0.0, 0.5, 4000.0, 1.0);
    AssertEquivalent(PositiveClamp.Kappa, 1.5, "transient positive κ clamp", 0);
    AssertEquivalent(PositiveClamp.Alpha, 1.3, "transient positive α clamp", 0);
    AssertEquivalent(NegativeClamp.Kappa, -1.5, "transient negative κ clamp", 0);
    AssertEquivalent(NegativeClamp.Alpha, -1.3, "transient negative α clamp", 0);

    // 📝 Constant-velocity integration remains bounded and converges to the ODE's steady slip values.
    TyreSlipCoordinates Integrated{};
    bool RemainedBounded = true;
    for (uint32_t Index = 0; Index < 2000; ++Index)
    {
        Integrated = Solver.IntegrateTransientSlip(Integrated, 20.0, 1.0, 35.0, 0.5, 4000.0, 1.0 / 240.0);
        RemainedBounded = RemainedBounded && std::isfinite(Integrated.Kappa) && std::isfinite(Integrated.Alpha) &&
                          Integrated.Kappa >= -1.5 && Integrated.Kappa <= 1.5 &&
                          Integrated.Alpha >= -1.3 && Integrated.Alpha <= 1.3;
    }
    AssertCondition(RemainedBounded, "transient integration remains finite and inside source clamps");
    AssertEquivalent(Integrated.Kappa, -0.125, "transient longitudinal steady solution", 0);
    AssertEquivalent(Integrated.Alpha, -0.05, "transient lateral steady solution", 0);

    std::printf("Pacejka MF6.1 validation: %u checks, %u failed\n", Checks, Failures);
    return Failures == 0 ? 0 : 1;
}
