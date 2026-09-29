//============================================================================================================================================
// VehicleGeometry.cpp — derive wheel mounts + aero force points from the authored VehicleGeometry.
//============================================================================================================================================

#include "VehicleGeometry.h"
#include "VehicleController.h"   // WheelMount, VehicleControllerConfig (full definitions)

namespace Frontier::Vehicle {

std::vector<WheelMount> MakeWheelMounts(const VehicleGeometry& g)
{
    const float a  = g.FrontAxleX();       // CoM → front axle (+x)
    const float b  = g.RearAxleX();        // CoM → rear axle  (−x)
    const float hf = 0.5f * g.TrackFront;  // half front track (+y = left)
    const float hr = 0.5f * g.TrackRear;   // half rear track
    const float z  = g.WheelLocalZ();      // hub height relative to CoM
    return {
        WheelMount{ Vec3{  a,  hf, z}, /*Steered*/true,  /*Driven*/false, /*Braked*/true },   // front-left
        WheelMount{ Vec3{  a, -hf, z}, true,  false, true },                                  // front-right
        WheelMount{ Vec3{ -b,  hr, z}, false, true,  true },                                  // rear-left  (driven)
        WheelMount{ Vec3{ -b, -hr, z}, false, true,  true },                                  // rear-right (driven)
    };
}

void ApplyGeometry(VehicleControllerConfig& c, const VehicleGeometry& g)
{
    c.ChassisMass = g.Mass;
    c.Wheels      = MakeWheelMounts(g);
    if (g.TyreRadius > 0.01f) c.Tyre.Radius = g.TyreRadius;   // keep the soft tyre in sync with the geometry

    // Ride-height reference: ground-effect terms use (CoM.z − groundZ) − this.
    c.Aero.ComHeightAboveFloor_m = g.ComHeightAboveFloor();

    const float a = g.FrontAxleX(), b = g.RearAxleX();

    // Aero device force-application points, CoM-relative (body frame: +x forward, +y left, +z up).
    c.Aero.RearWing.ForceApplicationPoint_COM      = { -(b + 0.45f), 0.0f,  0.95f };            // behind rear axle, high
    c.Aero.FrontSplitter.ForceApplicationPoint_COM = {  (a + 0.30f), 0.0f, -g.CoMHeight + 0.04f }; // ahead of front axle, low
    c.Aero.FloorDiffuser.ForceApplicationPoint_COM = { -(b * 0.45f), 0.0f, -g.CoMHeight + 0.05f }; // under the rear floor
    c.Aero.VehicleBody.ForceApplicationPoint_COM   = {  0.05f,       0.0f,  0.12f };             // body centre of pressure

    for (std::size_t i = 0; i < c.Aero.Canards.size(); ++i)
    {
        const float sy = (i % 2 == 0) ? +0.62f : -0.62f;                 // left / right pair
        const float fx = (i < 2) ? (a + 0.20f) : (a - 0.10f);           // front pair slightly ahead of rear pair
        c.Aero.Canards[i].ForceApplicationPoint_COM = { fx, sy, 0.15f };
    }
}

} // namespace Frontier::Vehicle
