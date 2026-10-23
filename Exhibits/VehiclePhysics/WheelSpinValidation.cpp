/*==========================================================================================================================================
                                                   WHEEL SPIN VALIDATION
==========================================================================================================================================*/
// 🧩 Differential wheel-angular oracle for the authorized previous-project JavaScript reference.

#include "Engine/Physics/WheelSpinSolver.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>

namespace
{

struct WheelSpinOracle
{
    Frontier::WheelSpinCoordinates Current;
    Frontier::WheelSpinStep Step;
    Frontier::WheelSpinCoordinates Expected;
};

constexpr WheelSpinOracle Oracles[] = {
    {{3.0, 0.5}, {120.0, 0.0, 0.0, 0.5, 0.0, 220000.0, 0.015, 1.2, 0.01, false, false}, {4.0, 0.54}},
    {{30.0, -2.0}, {100.0, 40.0, 800.0, 0.5, 4000.0, 220000.0, 0.015, 1.2, 0.002, true, false}, {29.383333333333333, -1.9412333333333334}},
    {{25.0, 1.0}, {0.0, 10.0, -500.0, 0.46, 5200.0, 100000.0, 0.015, 1.2, 1.0 / 480.0, true, false}, {25.264053604224060, 1.0526334450088002}},
    {{-20.0, 3.0}, {-30.0, 50.0, -900.0, 0.50855, 6200.0, 50000.0, 0.02, 1.4, 1.0 / 240.0, true, true}, {-17.827572023809523, 2.9257184499007938}},
    {{12.0, -1.0}, {200.0, 0.0, 900.0, 0.5, 3000.0, 150000.0, 0.015, 1.2, 0.01, false, false}, {13.666666666666666, -0.86333333333333329}},
    {{2.0, 0.25}, {0.0, 100.0, 0.0, 0.5, 4000.0, 220000.0, 0.015, 1.2, 0.02, false, false}, {0.33333333333333326, 0.25666666666666665}},
    {{-8.0, 5.0}, {20.0, 30.0, 100.0, 0.5, 0.0, 220000.0, 0.015, 1.2, 0.01, false, false}, {-7.5833333333333330, 4.9241666666666664}},
    {{0.0, 0.0}, {0.0, 0.0, -1.0, 0.5, 4000.0, 220000.0, 0.015, 1.2, 0.01, true, false}, {0.0041666666666666666, 0.000041666666666666665}},
    {{4.0, 2.0}, {-200.0, 0.0, 500.0, 0.4, 3000.0, -10000.0, 0.015, 1.2, 0.005, true, false}, {2.0333333333333332, 2.0101666666666667}},
    {{1.0, 1.0}, {0.0, 100.0, 500.0, 0.4, 3000.0, 220000.0, 0.015, 1.2, 0.0, true, false}, {1.0, 1.0}},
    {{0.2, -3.0}, {-100.0, 0.0, 500.0, 0.5, 0.0, 220000.0, 0.015, 1.2, 0.01, false, false}, {-0.63333333333333330, -3.0063333333333335}}
};

uint32_t Checks = 0;
uint32_t Failures = 0;

void AssertEquivalent(double Actual, double Expected, const char* Quantity, uint32_t Sample)
{
    ++Checks;
    const double Tolerance = std::max(1e-12, std::abs(Expected) * 2e-12);
    if (!std::isfinite(Actual) || std::abs(Actual - Expected) > Tolerance)
    {
        ++Failures;
        std::printf("FAIL sample %u %s: %.15g vs JS %.15g (tol %.3g)\n", Sample, Quantity, Actual, Expected, Tolerance);
    }
}

} // namespace

int main()
{
    const Frontier::WheelSpinSolver Solver;
    for (uint32_t Index = 0; Index < sizeof(Oracles) / sizeof(Oracles[0]); ++Index)
    {
        const WheelSpinOracle& Oracle = Oracles[Index];
        const Frontier::WheelSpinCoordinates Updated = Solver.Integrate(Oracle.Current, Oracle.Step);
        AssertEquivalent(Updated.AngularVelocity, Oracle.Expected.AngularVelocity, "wheel spin [rad/s]", Index);
        AssertEquivalent(Updated.Angle, Oracle.Expected.Angle, "wheel angle [rad]", Index);
    }

    const Frontier::WheelSpinCoordinates Stopped = Solver.Integrate(
        {0.25, 0.0}, {0.0, 100.0, 0.0, 0.5, 0.0, 220000.0, 0.015, 1.2, 0.01, false, false});
    AssertEquivalent(Stopped.AngularVelocity, 0.0, "brake stops a wheel below the brake step", 0);
    const Frontier::WheelSpinCoordinates InvalidInertia = Solver.Integrate(
        {2.0, 1.0}, {100.0, 0.0, 0.0, 0.5, 0.0, 220000.0, 0.015, 0.0, 0.01, false, false});
    AssertEquivalent(InvalidInertia.AngularVelocity, 2.0, "nonpositive inertia preserves spin", 0);
    AssertEquivalent(InvalidInertia.Angle, 1.0, "nonpositive inertia preserves angle", 0);

    std::printf("Wheel spin validation: %u checks, %u failed\n", Checks, Failures);
    return Failures == 0 ? 0 : 1;
}
