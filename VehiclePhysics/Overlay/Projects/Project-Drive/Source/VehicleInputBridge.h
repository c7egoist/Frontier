//============================================================================================================================================
//                                                       VEHICLEINPUTBRIDGE.H
//============================================================================================================================================
// 🧩 The thin seam between Frontier's device polling (InputExchange) and the engine-agnostic VehicleInputController
//    that already lives in the vehicle layer. The controller does all the feel work (digital ramps, self-centring
//    steer, dead-zones, analog shaping); this bridge only forwards the raw button state and edge-detects the
//    discrete pulses (shift up/down, reset) so they fire once per press, not every frame the key is held.
//
//    STANDARD KEYBOARD LAYOUT (the default the user asked for):
//        W throttle   S brake/reverse   A/D steer left/right   Space handbrake
//        Left-Shift up-shift   Left-Ctrl down-shift   R reset
//
//    Play mode only: the host should poll this when the chase (player) camera is active and skip it when the editor
//    fly camera owns input, so W/A/S/D fly the editor camera instead of driving. A gamepad/wheel would instead push
//    analog axes into the same VehicleInputController (SetThrottleAxis/SetSteerAxis…) — documented there.

#pragma once

#include "../../../Engine/DeviceExchange/InputExchange.h"
#include "../../../Engine/PhysicalDynamics/Vehicle/VehicleInputController.h"

namespace Frontier {
namespace Drive {

class VehicleInputBridge
{
public:
    // Forward this frame's device state into `controller`, fire edge pulses, and return the resolved command.
    Frontier::Vehicle::DriverCommand Poll(const Frontier::InputExchange& In,
                                          Frontier::Vehicle::VehicleInputController& Controller,
                                          float DeltaSeconds) noexcept
    {
        using K = Frontier::VirtualKeyCategory;

        Controller.SetThrottleKey (In.IsKeyPressed(K::KeyW));
        Controller.SetBrakeKey    (In.IsKeyPressed(K::KeyS));
        Controller.SetSteerLeftKey (In.IsKeyPressed(K::KeyA));
        Controller.SetSteerRightKey(In.IsKeyPressed(K::KeyD));
        Controller.SetHandbrakeKey (In.IsKeyPressed(K::KeySpace));

        const bool up    = In.IsKeyPressed(K::KeyLeftShift);
        const bool down  = In.IsKeyPressed(K::KeyLeftControl);
        const bool reset = In.IsKeyPressed(K::KeyR);
        if (up    && !PrevUp)    Controller.ShiftUp();      // rising edge only
        if (down  && !PrevDown)  Controller.ShiftDown();
        if (reset && !PrevReset) Controller.RequestReset();
        PrevUp = up; PrevDown = down; PrevReset = reset;

        return Controller.Update(DeltaSeconds);
    }

private:
    bool PrevUp = false, PrevDown = false, PrevReset = false;
};

} // namespace Drive
} // namespace Frontier
