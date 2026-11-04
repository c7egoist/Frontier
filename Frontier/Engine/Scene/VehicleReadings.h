/*==========================================================================================================================================
                                                            VEHICLEREADINGS.H
==========================================================================================================================================*/
// 🧩 The live readings of every simulated vehicle, by record: the physics extension publishes each refresh's snapshot, the vehicle
//    and tyre inspectors and the telemetry dock read it. Read-only for the readers; nothing here ever writes a record.

#pragma once

#include "Engine/PhysicalDynamics/Vehicle/VehicleSolver.h"
#include "Engine/Scene/RecordToken.h"

#include <array>
#include <cstdint>

namespace Frontier
{

struct VehicleReading
{
    bool                       Simulating       = false;
    Vehicle::VehicleTelemetry  Telemetry{};
    double                     SimulatedSeconds = 0.0;   // [s]
    uint64_t                   Steps            = 0;     // [-] fixed physics steps
    double                     StepHz           = 0.0;   // [Hz]
    double                     StepMicroseconds = 0.0;   // [µs] mean wall time of a physics step
    double                     RealtimeRatio    = 1.0;   // [-]
    std::array<float, 4>       Throttle{};               // [-] driver input as the physics took it: throttle, brake, steer, handbrake
};

void PublishVehicleReading(RecordToken Vehicle, const VehicleReading& Reading);
[[nodiscard]] bool QueryVehicleReading(RecordToken Vehicle, VehicleReading& Reading);
void ClearVehicleReadings();

} // namespace Frontier
