//============================================================================================================================================
// VehicleGeometry.cpp — derive wheel mounts + aero force points from the authored VehicleGeometry.
//
//   Horizontal positions are lifted straight from ControlVehicle.blend sockets (see ControlVehicleSockets). The model
//   origin lies on the vehicle centreline (X = Y = 0) at roughly hub height, so socket X/Y ARE the CoM-relative offsets
//   directly. Socket Z is model-origin-relative; the CoM rides a little above the origin, so aero heights are shifted
//   down by `kComLift` to land in the CoM frame. That lift is small next to the metre-scale moment arms, but we apply it
//   so the numbers stay honest rather than fudged.
//============================================================================================================================================

#include "VehicleGeometry.h"
#include "VehicleSolver.h"   // WheelMount, VehicleSolverConfiguration (full definitions)

namespace Frontier::Vehicle {

// Model origin → CoM vertical offset [m]: the reference point sits ~this far below the centre of mass.
static constexpr float kComLift = 0.10f;

std::vector<WheelMount> MakeWheelMounts(const VehicleGeometry& g)
{
    const float a  = g.FrontAxleX();       // CoM → front axle (+x)  = blend +1.7274
    const float b  = g.RearAxleX();        // CoM → rear axle  (−x)  = blend  1.6686
    const float hf = 0.5f * g.TrackFront;  // half front track (+y = left) = blend 1.0475
    const float hr = 0.5f * g.TrackRear;   // half rear track
    const float z  = g.WheelLocalZ();      // hub height relative to CoM
    // Procedural wheels mounted at the four Socket_AxleMount_* positions — the RubberFL*/RimFL* meshes are NOT imported.
    return {
        WheelMount{ Vec3{  a,  hf, z}, /*Steered*/true,  /*Driven*/false, /*Braked*/true },   // front-left
        WheelMount{ Vec3{  a, -hf, z}, true,  false, true },                                  // front-right
        WheelMount{ Vec3{ -b,  hr, z}, false, true,  true },                                  // rear-left  (driven)
        WheelMount{ Vec3{ -b, -hr, z}, false, true,  true },                                  // rear-right (driven)
    };
}

void ApplyGeometry(VehicleSolverConfiguration& c, const VehicleGeometry& g)
{
    c.ChassisMass = g.Mass;
    c.Wheels      = MakeWheelMounts(g);
    if (g.TyreRadius > 0.01f) c.Tyre.Radius = g.TyreRadius;   // keep the soft tyre in sync with the geometry

    // Ride-height reference: ground-effect terms use (CoM.z − groundZ) − this.
    c.Aero.ComHeightAboveFloor_m = g.ComHeightAboveFloor();

    namespace S = ControlVehicleSockets;
    const float a = g.FrontAxleX();   // +1.7274 (front axle X)

    // Aero device force-application points, CoM-relative (body frame: +x forward, +y left, +z up).
    // Rear wing: straight from Socket_RearWingAssemblyPort (behind the rear axle, high on the tail).
    c.Aero.RearWing.ForceApplicationPoint_COM      = { S::RearWingPort.x, 0.0f, S::RearWingPort.z - kComLift };
    // Front splitter: no dedicated socket — placed on the front lower lip, between the front axle and the nose ID plate,
    // at side-skirt (floor) height.
    c.Aero.FrontSplitter.ForceApplicationPoint_COM = { 0.5f * (a + S::IdPlate_Primary.x), 0.0f, S::SideSkirt_L.z - kComLift };
    // Floor diffuser: under the rear floor, ahead of the wing, at floor height.
    c.Aero.FloorDiffuser.ForceApplicationPoint_COM = { 0.5f * (-g.RearAxleX() + S::RearWingPort.x), 0.0f, S::SideSkirt_L.z - kComLift };
    // Body centre of pressure: on the centreline, mid-height between floor skirt and canopy.
    c.Aero.VehicleBody.ForceApplicationPoint_COM   = { 0.0f, 0.0f, 0.30f - kComLift };

    // Canards: no sockets in the model — procedural front pair, ahead of the front axle, at splitter/skirt height.
    for (std::size_t i = 0; i < c.Aero.Canards.size(); ++i)
    {
        const float sy = (i % 2 == 0) ? +0.85f : -0.85f;                // left / right pair, inboard of the track
        const float fx = (i < 2) ? (a + 0.55f) : (a + 0.25f);          // front pair slightly ahead of rear pair
        c.Aero.Canards[i].ForceApplicationPoint_COM = { fx, sy, 0.18f - kComLift };
    }
}

} // namespace Frontier::Vehicle
