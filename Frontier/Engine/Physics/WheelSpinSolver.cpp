/*==========================================================================================================================================
                                            WHEEL SPIN SOLVER DEFINITION
==========================================================================================================================================*/

#include "WheelSpinSolver.h"

#include <cmath>

namespace Frontier
{

namespace
{

constexpr double ReferencePressure = 220000.0; // [Pa] - VehicleSolver.js TyreReferencePressure
constexpr double FullTurn = 6.283185307179586476925286766559;

[[nodiscard]] double Sign(double Scalar) noexcept
{
    return Scalar > 0.0 ? 1.0 : (Scalar < 0.0 ? -1.0 : 0.0);
}

} // namespace

WheelSpinCoordinates WheelSpinSolver::Integrate(WheelSpinCoordinates Current, WheelSpinStep Step) const noexcept
{
    if (Step.Timestep <= 0.0 || Step.WheelInertia <= 0.0)
    {
        return Current;
    }

    double SpinTorque = Step.DriveTorque;
    if (Step.HasLoadedContact && Step.NormalLoad > 0.0)
    {
        SpinTorque -= Step.LongitudinalTyreForce * Step.RollingRadius;
        const double Softness = fmax(0.0, 1.0 - fmax(0.0, Step.TyrePressure) / ReferencePressure);
        const double Resistance = Step.Shredded ? 4.0 : 1.0 + 3.0 * Softness * Softness;
        SpinTorque -= Step.RollingResistanceCoefficient * Resistance * Step.NormalLoad * Step.RollingRadius *
                      Sign(Current.AngularVelocity);
    }

    const double Timestep = Step.Timestep;
    const double Inertia = Step.WheelInertia;
    const double IntegratedSpin = Current.AngularVelocity + SpinTorque * Timestep / Inertia;
    const double BrakeStep = Step.BrakeTorque * Timestep / Inertia;
    const double BrakedSpin = fabs(IntegratedSpin) <= BrakeStep
                                  ? 0.0
                                  : IntegratedSpin - Sign(IntegratedSpin) * BrakeStep;
    return {BrakedSpin, fmod(Current.Angle + BrakedSpin * Timestep, FullTurn)};
}

} // namespace Frontier
