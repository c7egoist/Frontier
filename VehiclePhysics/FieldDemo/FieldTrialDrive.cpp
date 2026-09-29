//============================================================================================================================================
// FieldTrialDrive.cpp — drive the REAL ControlVehicle geometry across an open field (flat + speed bumps + a launch ramp),
//                      with NO body collision (only the wheels touch the ground), and dump per-frame telemetry to JSON.
//
//   This is a visual/behavioural demo, not a pass/fail suite. It reuses the exact same VehicleController + XPBD soft-tyre
//   + Pacejka drivetrain + the socket-derived VehicleGeometry that the validation suites use. The output field_drive.json
//   is played back by viewer.html (side view + top view + HUD) so you can actually SEE the procedural wheels spin, the
//   suspension work the speed bumps, the car launch off the ramp, and the steering turn the front wheels through cones.
//
//   Build:
//     g++ -std=c++17 -O2 FieldTrialDrive.cpp ../Overlay/Engine/PhysicalDynamics/Vehicle/VehicleController.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/VehicleGeometry.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/Aerodynamics.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/XPBDSoftTyre.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/PacejkaMagicFormula.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/TyreSlipDynamics.cpp \
//         ../Overlay/Engine/PhysicalDynamics/Vehicle/Drivetrain.cpp -I../Overlay/Engine/PhysicalDynamics/Vehicle \
//         -o fielddrive && ./fielddrive
//============================================================================================================================================

#include "VehicleController.h"
#include "VehicleGeometry.h"

#include <cmath>
#include <cstdio>
#include <vector>
#include <array>
#include <string>

using namespace Frontier::Vehicle;

//------------------------------------------------------------------------------------------------------------------------ mock rigid body (same as the suites)
struct MockChassis
{
    Vec3  Position{0,0,1.0f};
    Quat  Orientation{0,0,0,1};
    Vec3  LinearVelocity{}, AngularVelocity{};
    float Mass = 1300.0f;
    Vec3  InvInertiaDiag{};
    Vec3  Gravity{0,0,-9.81f};
    float LinearDamping = 0.0f, AngularDamping = 0.05f;
    Vec3  ForceAccum{}, TorqueAccum{};
    [[nodiscard]] Quat Conjugate() const noexcept { return {-Orientation.x,-Orientation.y,-Orientation.z,Orientation.w}; }
    [[nodiscard]] Vec3 WorldAngularAccel(const Vec3& t) const noexcept {
        const Vec3 tb = Conjugate().Rotate(t);
        const Vec3 ab{tb.x*InvInertiaDiag.x, tb.y*InvInertiaDiag.y, tb.z*InvInertiaDiag.z};
        return Orientation.Rotate(ab);
    }
    void ApplyForceAtPoint(const Vec3& f, const Vec3& p) noexcept { ForceAccum += f; TorqueAccum += Cross(p-Position,f); }
    void ApplyTorque(const Vec3& t) noexcept { TorqueAccum += t; }
    void Integrate(float dt) noexcept {
        ForceAccum += Gravity*Mass;
        LinearVelocity += ForceAccum*(dt/Mass);
        if (LinearDamping>0) LinearVelocity = LinearVelocity*std::exp(-LinearDamping*dt);
        Position += LinearVelocity*dt;
        AngularVelocity += WorldAngularAccel(TorqueAccum)*dt;
        AngularVelocity = AngularVelocity*std::exp(-AngularDamping*dt);
        const Quat wq{AngularVelocity.x,AngularVelocity.y,AngularVelocity.z,0.0f};
        const Quat dq = QuatMul(wq,Orientation);
        Orientation = QuatNormalize(Quat{Orientation.x+0.5f*dt*dq.x, Orientation.y+0.5f*dt*dq.y,
                                         Orientation.z+0.5f*dt*dq.z, Orientation.w+0.5f*dt*dq.w});
        ForceAccum={0,0,0}; TorqueAccum={0,0,0};
    }
    [[nodiscard]] ChassisState State() const noexcept { return {Position,Orientation,LinearVelocity,AngularVelocity}; }
};

//------------------------------------------------------------------------------------------------------------------------ the field terrain (y-invariant)
static float TerrainZ(float x)
{
    float h = 0.0f;
    const float A = 0.10f, w = 0.75f;                 // three rounded speed bumps
    const float bumps[3] = {44.0f, 47.0f, 50.0f};
    for (float c : bumps) { float d = x - c; if (std::fabs(d) < w) h += A*0.5f*(1.0f+std::cos(3.14159265f*d/w)); }
    if (x >= 68.0f && x <= 76.0f) h = std::max(h, (x-68.0f)/8.0f*1.35f);   // launch ramp, then a lip → jump
    return h;
}
static float TerrainSlope(float x){ const float e=0.02f; return (TerrainZ(x+e)-TerrainZ(x-e))/(2*e); }

int main()
{
    const float dt = 1.0f/240.0f;
    VehicleGeometry g;                                // real ControlVehicle socket geometry
    VehicleControllerConfig cfg; cfg.Model = DrivingModel::PacejkaDrivetrain;
    ApplyGeometry(cfg, g);
    cfg.Aero.Enabled = true;                          // aero ON — show downforce doing something at speed

    MockChassis ch; ch.Position = {0,0,0.42f}; ch.Mass = cfg.ChassisMass; ch.InvInertiaDiag = g.InvInertia();
    VehicleController ctl;
    VehicleController::Hooks h;
    h.ReadChassis       = [&]{ return ch.State(); };
    h.ApplyForceAtPoint = [&](const Vec3& f, const Vec3& p){ ch.ApplyForceAtPoint(f,p); };
    h.ApplyTorque       = [&](const Vec3& t){ ch.ApplyTorque(t); };
    h.Ground            = [](const Vec3& p, float& gz, Vec3& n){ gz = TerrainZ(p.x); float s = TerrainSlope(p.x);
                                                                 n = Vec3{-s,0.0f,1.0f}.Normalized(); return true; };
    ctl.Build(cfg, h, ch.State());

    // ---- scripted drive: settle, launch, slalom through cones, full-throttle over the bumps and off the ramp ----
    auto InputAt = [](float t)->DriverInput{
        DriverInput in{};
        if (t < 1.0f) return in;                          // settle
        in.Throttle = 1.0f;                               // pin it
        if (t >= 3.0f && t < 7.0f)                        // gentle slalom through the cone gates
            in.Steer = 0.16f*std::sin(2.0f*3.14159265f*(t-3.0f)/2.0f);
        if (t > 9.0f) { in.Throttle = 0.0f; in.Brake = 1.0f; }   // brake after the landing
        return in;
    };

    const float T = 12.0f; const int steps = int(T/dt);
    const int stride = 4;                                  // record at 60 Hz

    // JSON accumulation
    std::string frames; frames.reserve(1<<20);
    char buf[1024];
    float maxSpeed=0, takeoffSpeed=0, maxComp=0, minUp=1;
    bool wasAir=false; int airFrames=0;

    for (int s=0; s<=steps; ++s)
    {
        const float t = s*dt;
        ctl.SetInput(InputAt(t));
        ctl.Step(dt); ch.Integrate(dt);
        const auto& tl = ctl.Telemetry();

        const float up = ch.Orientation.Rotate({0,0,1}).z;
        minUp = std::min(minUp, up);
        maxSpeed = std::max(maxSpeed, tl.SpeedMetresPerSecond);
        const bool airborne = (tl.WheelsInContact == 0);
        if (airborne) { airFrames++; if (!wasAir && t > 2.0f) takeoffSpeed = tl.SpeedMetresPerSecond; }
        wasAir = airborne;
        for (uint32_t wi=0; wi<tl.WheelCount; ++wi){ float comp = tl.Wheels[wi].HubPosition.z - tl.Wheels[wi].ContactPoint.z; maxComp=std::max(maxComp,std::fabs(comp)); }

        if (s % stride == 0)
        {
            std::snprintf(buf,sizeof(buf),
                "{\"t\":%.3f,\"p\":[%.3f,%.3f,%.3f],\"q\":[%.4f,%.4f,%.4f,%.4f],\"v\":%.2f,\"rpm\":%.0f,\"gear\":%d,\"boost\":%.2f,\"thr\":%.2f,\"brk\":%.2f,\"air\":%d,\"w\":[",
                t, ch.Position.x,ch.Position.y,ch.Position.z,
                ch.Orientation.x,ch.Orientation.y,ch.Orientation.z,ch.Orientation.w,
                tl.SpeedMetresPerSecond, tl.EngineRPM, tl.GearIndex-2, tl.BoostBar,
                InputAt(t).Throttle, InputAt(t).Brake, airborne?1:0);
            frames += (s? ",\n":"\n"); frames += buf;
            for (uint32_t wi=0; wi<tl.WheelCount; ++wi){
                const auto& w = tl.Wheels[wi];
                std::snprintf(buf,sizeof(buf),
                    "%s{\"h\":[%.3f,%.3f,%.3f],\"c\":%.3f,\"st\":%.3f,\"om\":%.2f,\"sl\":%.3f,\"ct\":%d,\"ld\":%.0f}",
                    wi?",":"", w.HubPosition.x,w.HubPosition.y,w.HubPosition.z, w.ContactPoint.z,
                    w.SteerAngleRad, w.WheelOmega, w.SlipRatio, w.InContact?1:0, w.VerticalLoad);
                frames += buf;
            }
            frames += "]}";
        }
    }

    // ---- static scene: terrain profile, cones, car geometry ----
    std::string terr = "["; for (float x=-5; x<=145.001f; x+=0.5f){ std::snprintf(buf,sizeof(buf),"%s[%.2f,%.4f]", (x>-5?",":""), x, TerrainZ(x)); terr+=buf; } terr+="]";
    // cones: slalom gates on the flat, plus markers by the ramp and the landing zone
    std::string cones = "[";
    auto addCone=[&](float x,float y){ std::snprintf(buf,sizeof(buf),"%s[%.2f,%.2f,%.4f]", (cones.size()>1?",":""), x,y,TerrainZ(x)); cones+=buf; };
    for (int i=0;i<7;++i){ float cx=9.0f+i*3.6f; addCone(cx, (i%2? -2.2f: 2.2f)); }   // slalom
    addCone(66,3.0f); addCone(66,-3.0f);                                              // ramp entry gate
    addCone(90,3.5f); addCone(90,-3.5f); addCone(100,3.5f); addCone(100,-3.5f);       // landing zone
    cones += "]";

    // Output JSON
    FILE* f = std::fopen("field_drive.json","w");
    std::fprintf(f, "{\n\"dt\":%.5f,\"fps\":60,\n", dt*stride);
    std::fprintf(f, "\"geom\":{\"wheelbase\":%.4f,\"track\":%.4f,\"tyreR\":%.4f,\"tyreW\":0.34,"
                    "\"frontAxleX\":%.4f,\"rearAxleX\":%.4f,\"noseX\":%.4f,\"tailX\":%.4f,\"comLift\":0.10},\n",
                 g.Wheelbase, g.TrackFront, g.TyreRadius, g.FrontAxleX(), g.RearAxleX(),
                 ControlVehicleSockets::IdPlate_Primary.x, ControlVehicleSockets::IdPlate_Secondary.x);
    std::fprintf(f, "\"terrain\":%s,\n\"cones\":%s,\n\"frames\":[%s\n]\n}\n", terr.c_str(), cones.c_str(), frames.c_str());
    std::fclose(f);

    // ---- human-readable report ----
    const float airDur = airFrames * dt;
    std::printf("========================= FIELD TRIAL-DRIVE — what happened =========================\n");
    std::printf(" Vehicle: real ControlVehicle geometry (wheelbase %.3f m, track %.3f m, tyreR %.2f m), procedural wheels.\n", g.Wheelbase,g.TrackFront,g.TyreRadius);
    std::printf(" Course : flat -> cone slalom -> 3 speed bumps (44/47/50 m) -> launch ramp (68-76 m, ~1.35 m) -> land -> brake.\n\n");
    std::printf("  Top speed reached ............... %.1f m/s  (%.0f km/h)\n", maxSpeed, maxSpeed*3.6f);
    std::printf("  Max suspension travel (bumps) ... %.3f m (hub above contact patch)\n", maxComp);
    std::printf("  Launch-off-ramp speed ........... %.1f m/s\n", takeoffSpeed);
    std::printf("  AIRBORNE off the ramp for ....... %.2f s  (all four wheels off the ground)\n", airDur);
    std::printf("  Final chassis X ................. %.1f m\n", ch.Position.x);
    std::printf("  Stayed upright throughout ....... %s  (min up-vector z = %.3f, 1.0 = perfectly level)\n", (minUp>0.6f)?"YES":"NO", minUp);
    std::printf("  Frames written to field_drive.json for the viewer.\n");
    std::printf("====================================================================================\n");
    return 0;
}
