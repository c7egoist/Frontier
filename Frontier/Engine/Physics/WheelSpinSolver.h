/*==========================================================================================================================================
                                                  WHEEL SPIN SOLVER
==========================================================================================================================================*/
// 🧩 Provisional portable wheel angular update; JS-derived, not the authoritative Project-Drive vehicle port.

#pragma once

namespace Frontier
{

struct WheelSpinCoordinates
{
    double AngularVelocity = 0.0; // [rad/s]
    double Angle = 0.0;           // [rad]
};

struct WheelSpinStep
{
    double DriveTorque = 0.0;                  // [N·m]
    double BrakeTorque = 0.0;                  // [N·m]
    double LongitudinalTyreForce = 0.0;         // [N]
    double RollingRadius = 0.0;                // [m]
    double NormalLoad = 0.0;                   // [N]
    double TyrePressure = 220000.0;             // [Pa]
    double RollingResistanceCoefficient = 0.015; // [-]
    double WheelInertia = 1.2;                 // [kg·m²]
    double Timestep = 0.0;                      // [s]
    bool HasLoadedContact = false;
    bool Shredded = false;
};

class WheelSpinSolver
{
  public:
    // Drive torque always acts. Tyre reaction and pressure-dependent rolling resistance require loaded contact.
    // The brake is applied after torque integration, then the post-brake spin advances the wheel angle.
    [[nodiscard]] WheelSpinCoordinates Integrate(WheelSpinCoordinates Current, WheelSpinStep Step) const noexcept;
};

} // namespace Frontier
