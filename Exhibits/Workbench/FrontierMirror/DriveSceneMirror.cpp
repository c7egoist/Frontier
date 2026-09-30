//============================================================================================================================================
//                                                    DRIVESCENEMIRROR.CPP
//============================================================================================================================================
// 📦 Project-Drive's `--scene drive` level, DRIVEN, on the CPU, with the engine's own code at every stage.  There is
//    no renderer, no material model, no sky and no camera authored in this file — only the loop that asks the
//    engine to step and to draw.
//
//      level     Projects/Project-Drive/Source/DriveSceneAuthor     the app's own level author: the drivable course,
//                                                                    the real ControlVehicle shell, four wheels, and
//                                                                    the twelve authored material slabs, in the
//                                                                    app's own span order
//      physics   Engine/PhysicalDynamics/Vehicle/VehicleSolver      the real solver: socket-derived VehicleGeometry,
//                                                                    XPBD soft tyres, Pacejka drivetrain, aerodynamics
//      camera    Projects/Project-Drive/Source/ChaseCameraSolver    the app's own chase camera, spring and all
//      sky       Projects/Project-Zero/Source/CelestialSequence     the engine's real sun/sky/atmosphere/twilight
//                                                                    model — this is what replaces the flat plate the
//                                                                    retired hand-written proof painted behind the car
//      raster    Engine/GeometricRaster/VisibilityRaster            the shipped GI-off/RT-off render path
//
//    The body and the four wheels are re-registered every frame from the solver's own pose telemetry, so the car in
//    the frame sequence is at the position the physics put it — the sequence IS the run, not an animation of it.
//
//    Usage: DriveSceneMirror --frames-out <dir> [--width 480] [--height 270] [--fps 20] [--seconds 12]
//                            [--camera chase|trackside|orbit] [--sun 15.0]
//                            [--freeze <s>] [--orbit-period <s>] [--orbit-radius <m>] [--orbit-height <m>]
//
//    `--camera orbit --freeze <s>` drives the car to that moment of the run and then holds it while the eye
//    circles it, which is how the material angles are produced: the same authored paint, glass, rubber and brake
//    materials seen from every azimuth, shaded by the same engine raster that renders the driving sequence.

#include "GeometricRaster/VisibilityRaster.h"
#include "GeometricRaster/SceneStructure.h"
#include "GeometricRaster/GeometryStructure.h"
#include "GeometricRaster/CameraProjection.h"
#include "CelestialSequence.h"

#include "DriveSceneAuthor.h"
#include "DriveCourse.h"
#include "ChaseCameraSolver.h"
#include "VehicleSolver.h"
#include "VehicleGeometry.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

using namespace Frontier;
using namespace Frontier::Vehicle;
namespace DC = Frontier::Drive;

namespace {

unsigned g_Checks = 0u;
void Check(bool Ok, const char* Message)
{
    ++g_Checks;
    if (!Ok) { std::fprintf(stderr, "[drive-scene] FAIL %s\n", Message); std::exit(1); }
    std::printf("[drive-scene] pass  %s\n", Message);
}

//------------------------------------------------------------------------------------------------------------------------ the chassis integrator
// The same mock rigid chassis DriveTelemetry.cpp and the vehicle suites drive the solver with, so the motion in the
//    frames below is bit-for-bit the motion in ProjectDrivePhysicsTelemetry_CPU_Reference.csv.
struct MockChassis
{
    Vec3  Position{};
    Quat  Orientation{ 0, 0, 0, 1 };
    Vec3  LinearVelocity{}, AngularVelocity{};
    Vec3  ForceAccum{}, TorqueAccum{};
    Vec3  InvInertiaDiag{};
    Vec3  Gravity{ 0.0f, 0.0f, -9.81f };
    float Mass = 1300.0f, LinearDamping = 0.0f, AngularDamping = 0.05f;

    [[nodiscard]] Quat Conjugate() const noexcept { return { -Orientation.x, -Orientation.y, -Orientation.z, Orientation.w }; }
    [[nodiscard]] Vec3 WorldAngularAccel(const Vec3& Torque) const noexcept
    {
        const Vec3 Body = Conjugate().Rotate(Torque);
        const Vec3 Accel{ Body.x * InvInertiaDiag.x, Body.y * InvInertiaDiag.y, Body.z * InvInertiaDiag.z };
        return Orientation.Rotate(Accel);
    }
    void ApplyForceAtPoint(const Vec3& Force, const Vec3& Point) noexcept
    { ForceAccum += Force; TorqueAccum += Cross(Point - Position, Force); }
    void ApplyTorque(const Vec3& Torque) noexcept { TorqueAccum += Torque; }
    void Integrate(float Dt) noexcept
    {
        ForceAccum += Gravity * Mass;
        LinearVelocity += ForceAccum * (Dt / Mass);
        if (LinearDamping > 0) LinearVelocity = LinearVelocity * std::exp(-LinearDamping * Dt);
        Position += LinearVelocity * Dt;
        AngularVelocity += WorldAngularAccel(TorqueAccum) * Dt;
        AngularVelocity = AngularVelocity * std::exp(-AngularDamping * Dt);
        const Quat Spin{ AngularVelocity.x, AngularVelocity.y, AngularVelocity.z, 0.0f };
        const Quat Delta = QuatMul(Spin, Orientation);
        Orientation = QuatNormalize(Quat{ Orientation.x + 0.5f * Dt * Delta.x, Orientation.y + 0.5f * Dt * Delta.y,
                                          Orientation.z + 0.5f * Dt * Delta.z, Orientation.w + 0.5f * Dt * Delta.w });
        ForceAccum = Vec3{}; TorqueAccum = Vec3{};
    }
    [[nodiscard]] ChassisState State() const noexcept { return { Position, Orientation, LinearVelocity, AngularVelocity }; }
};

// The scripted drive, verbatim from DriveTelemetry.cpp: settle, full throttle, slalom, ramp launch, brake.
DriverInput InputAt(float Seconds) noexcept
{
    DriverInput Input{};
    if (Seconds < 1.0f) return Input;
    Input.Throttle = 1.0f;
    if (Seconds >= 2.5f && Seconds < 6.5f) Input.Steer = 0.14f * std::sin(2.0f * 3.14159265f * (Seconds - 2.5f) / 2.2f);
    if (Seconds > 9.0f) { Input.Throttle = 0.0f; Input.Brake = 1.0f; }
    return Input;
}

//------------------------------------------------------------------------------------------------------------------------ the level
// One SceneStructure mesh per (span, material) pair.  Spans 0..4 are the body and four wheels and are DYNAMIC —
//    the author emits them in object-local space so the live world transform places them; span 5 is the course and
//    is already world space.  That partition is DriveSceneAuthor's own instance-order contract, not an invention here.
struct Part
{
    uint32_t Span = 0u, Material = 0u;
    std::vector<VertexRecord> Corners;
    std::vector<uint32_t>     Order;
    bool Dynamic = false;
};

std::vector<Part> SlicePartsByMaterial(const DC::DriveSceneAuthor& Author)
{
    const auto& Triangles = Author.QueryTriangles();
    const auto& Normals   = Author.QueryCornerNormals();
    const auto& Spans     = Author.QuerySpans();
    std::vector<Part> Parts;
    for (uint32_t S = 0; S < Spans.size(); ++S)
    {
        const auto& Span = Spans[S];
        for (uint32_t T = Span.FirstTriangle; T < Span.FirstTriangle + Span.TriangleCount; ++T)
        {
            uint32_t Material = 0u;
            std::memcpy(&Material, &Triangles[T].MaterialSlot, sizeof(uint32_t));
            Part* Target = nullptr;
            for (auto& Candidate : Parts)
                if (Candidate.Span == S && Candidate.Material == Material) { Target = &Candidate; break; }
            if (!Target) { Parts.push_back(Part{ S, Material, {}, {}, Span.Dynamic }); Target = &Parts.back(); }

            const TriangleIndex& Tri = Triangles[T];
            const float Position[3][3] = {
                { Tri.VertexAlphaX, Tri.VertexAlphaY, Tri.VertexAlphaZ },
                { Tri.VertexBetaX,  Tri.VertexBetaY,  Tri.VertexBetaZ  },
                { Tri.VertexGammaX, Tri.VertexGammaY, Tri.VertexGammaZ } };
            const float Texture[3][2] = {
                { Tri.TextureAlphaU, Tri.TextureAlphaV },
                { Tri.TextureBetaU,  Tri.TextureBetaV  },
                { Tri.TextureGammaU, Tri.TextureGammaV } };
            for (unsigned K = 0; K < 3u; ++K)
            {
                VertexRecord V{};
                V.SpatialLocation = { Position[K][0], Position[K][1], Position[K][2] };
                const size_t Corner = static_cast<size_t>(T) * 3u + K;
                V.NormalDirection = Corner < Normals.size() ? Normals[Corner] : Vector3{ 0.0f, 0.0f, 1.0f };
                V.TextureCoordinateU = Texture[K][0];
                V.TextureCoordinateV = Texture[K][1];
                Target->Order.push_back(static_cast<uint32_t>(Target->Corners.size()));
                Target->Corners.push_back(V);
            }
        }
    }
    return Parts;
}

// A world matrix from a solver pose. Column-major 4x4 the way SceneStructure's Matrix4x4 stores it.
Matrix4x4 PoseMatrix(const Quat& Rotation, const Vec3& Translation) noexcept
{
    const float X = Rotation.x, Y = Rotation.y, Z = Rotation.z, W = Rotation.w;
    Matrix4x4 M;
    M.Columns[0][0] = 1.0f - 2.0f * (Y * Y + Z * Z); M.Columns[1][0] = 2.0f * (X * Y - Z * W);        M.Columns[2][0] = 2.0f * (X * Z + Y * W);        M.Columns[3][0] = Translation.x;
    M.Columns[0][1] = 2.0f * (X * Y + Z * W);        M.Columns[1][1] = 1.0f - 2.0f * (X * X + Z * Z); M.Columns[2][1] = 2.0f * (Y * Z - X * W);        M.Columns[3][1] = Translation.y;
    M.Columns[0][2] = 2.0f * (X * Z - Y * W);        M.Columns[1][2] = 2.0f * (Y * Z + X * W);        M.Columns[2][2] = 1.0f - 2.0f * (X * X + Y * Y); M.Columns[3][2] = Translation.z;
    M.Columns[0][3] = 0.0f;                          M.Columns[1][3] = 0.0f;                          M.Columns[2][3] = 0.0f;                          M.Columns[3][3] = 1.0f;
    return M;
}

} // namespace

int main(int ArgumentCount, char** ArgumentValues)
{
    std::string FramesOut = "frames";
    std::string CameraName = "chase";
    uint32_t Width = 480u, Height = 270u, Fps = 20u;
    float Seconds = 12.0f, SunHour = 15.0f, Freeze = 0.0f;
    float OrbitPeriod = 6.0f, OrbitRadius = 8.0f, OrbitHeight = 2.2f;

    for (int I = 1; I < ArgumentCount; ++I)
    {
        const std::string A = ArgumentValues[I];
        auto Next = [&](const char* What) -> const char* {
            if (I + 1 >= ArgumentCount) { std::fprintf(stderr, "%s needs a value\n", What); std::exit(2); }
            return ArgumentValues[++I]; };
        if      (A == "--frames-out") FramesOut  = Next("--frames-out");
        else if (A == "--camera")     CameraName = Next("--camera");
        else if (A == "--width")      Width      = static_cast<uint32_t>(std::atoi(Next("--width")));
        else if (A == "--height")     Height     = static_cast<uint32_t>(std::atoi(Next("--height")));
        else if (A == "--fps")        Fps        = static_cast<uint32_t>(std::atoi(Next("--fps")));
        else if (A == "--seconds")    Seconds    = static_cast<float>(std::atof(Next("--seconds")));
        else if (A == "--sun")        SunHour    = static_cast<float>(std::atof(Next("--sun")));
        else if (A == "--freeze")       Freeze      = static_cast<float>(std::atof(Next("--freeze")));
        else if (A == "--orbit-period") OrbitPeriod = static_cast<float>(std::atof(Next("--orbit-period")));
        else if (A == "--orbit-radius") OrbitRadius = static_cast<float>(std::atof(Next("--orbit-radius")));
        else if (A == "--orbit-height") OrbitHeight = static_cast<float>(std::atof(Next("--orbit-height")));
        else { std::fprintf(stderr, "unknown argument %s\n", A.c_str()); return 2; }
    }

    std::printf("================================================================================\n");
    std::printf("     PROJECT-DRIVE — THE CAR DRIVEN, ENGINE VISIBILITY RASTER, REAL SKY          \n");
    std::printf("================================================================================\n");

    // 1 ── the app's own level
    DC::DriveSceneAuthor Author;
    Author.Construct();
    Check(!Author.QueryTriangles().empty(), "DriveSceneAuthor produced the level");
    Check(Author.QuerySpans().size() >= 6u, "the level carries the body, four wheels and the course spans");
    const std::vector<Part> Parts = SlicePartsByMaterial(Author);
    Check(!Parts.empty(), "the level sliced into span/material parts");
    std::printf("[drive-scene] level: %zu triangles, %zu materials, %zu spans, %zu parts\n",
                Author.QueryTriangles().size(), Author.QueryMaterials().size(), Author.QuerySpans().size(), Parts.size());

    // 2 ── the real vehicle, exactly as DriveTelemetry stands it up
    VehicleGeometry Geometry;
    VehicleSolverConfiguration Configuration;
    Configuration.ActiveScheme = DrivingScheme::PacejkaDrivetrain;
    ApplyGeometry(Configuration, Geometry);
    Configuration.Aero.Enabled = true;

    MockChassis Chassis;
    Chassis.Position = { 0.0f, 0.0f, 0.42f };
    Chassis.Mass = Configuration.ChassisMass;
    Chassis.InvInertiaDiag = Geometry.InvInertia();

    VehicleSolver Solver;
    VehicleSolver::Hooks Hooks;
    Hooks.ReadChassis       = [&] { return Chassis.State(); };
    Hooks.ApplyForceAtPoint = [&](const Vec3& Force, const Vec3& Point) { Chassis.ApplyForceAtPoint(Force, Point); };
    Hooks.ApplyTorque       = [&](const Vec3& Torque) { Chassis.ApplyTorque(Torque); };
    Hooks.Ground            = [](const Vec3& Point, float& GroundZ, Vec3& Normal)
    {
        GroundZ = DC::CourseHeight(Point.x, Point.y);
        float Nx, Ny, Nz; DC::CourseNormal(Point.x, Point.y, Nx, Ny, Nz);
        Normal = Vec3{ Nx, Ny, Nz };
        return true;
    };
    Solver.Build(Configuration, Hooks, Chassis.State());

    // 3 ── the real sky and the shipped raster
    auto Sky = std::make_unique<Frontier::ProjectZero::CelestialSequence>();
    Sky->Prepare();
    Sky->Observation.LocalHours = SunHour;
    for (auto Entity : { Frontier::ProjectZero::CelestialEntity::Atmosphere, Frontier::ProjectZero::CelestialEntity::Sun,
                         Frontier::ProjectZero::CelestialEntity::Sky,        Frontier::ProjectZero::CelestialEntity::Stars,
                         Frontier::ProjectZero::CelestialEntity::Moons })
        Sky->Shown[static_cast<uint32_t>(Entity)] = true;
    Frontier::CelestialBudget Budget;
    Budget.AtmosphereSamples = 16u;
    Budget.AtmosphereLightSamples = 6u;
    auto Raster = std::make_unique<VisibilityRaster>();

    DC::ChaseCameraSolver Chase;
    Chase.AssignAspectRatio(static_cast<float>(Width) / static_cast<float>(Height));

    // 4 ── step the solver at its fixed rate, render on the frame cadence
    const float Dt = 1.0f / 240.0f;
    const int   Steps = static_cast<int>(Seconds / Dt);
    const int   Stride = static_cast<int>((1.0f / static_cast<float>(Fps)) / Dt);
    std::vector<unsigned char> Pixels(static_cast<size_t>(Width) * Height * 4u);
    std::vector<unsigned char> Rgb(static_cast<size_t>(Width) * Height * 3u);
    uint32_t Written = 0u;
    float PeakSpeed = 0.0f, PeakDownforce = 0.0f;
    unsigned NonBlack = 0u;

    for (int S = 0; S <= Steps; ++S)
    {
        const float T = static_cast<float>(S) * Dt;
        // A frozen run is still a REAL run: the physics is stepped up to the freeze moment and then held, so the
        //    orbit sheets show the car in a pose the solver produced rather than one placed by hand.
        const bool Frozen = Freeze > 0.0f && T > Freeze;
        if (!Frozen)
        {
            Solver.AssignInput(InputAt(T));
            Solver.Step(Dt);
            Chassis.Integrate(Dt);
        }
        const auto& Telemetry = Solver.Telemetry();
        PeakSpeed = std::max(PeakSpeed, Telemetry.SpeedMetresPerSecond);
        PeakDownforce = std::max(PeakDownforce, Telemetry.Aero.TotalDownforce_N);

        if (S % Stride != 0) continue;

        // The level, re-registered with this step's poses. Cheap: the Drive level is a few thousand triangles.
        auto Level = std::make_unique<SceneStructure>();
        std::vector<uint32_t> Slot(Author.QueryMaterials().size(), 0u);
        for (size_t M = 0; M < Author.QueryMaterials().size(); ++M) Slot[M] = Level->RegisterMaterial(Author.QueryMaterials()[M]);

        const Matrix4x4 Identity;
        const Matrix4x4 Body = PoseMatrix(Chassis.Orientation, Chassis.Position);
        for (const Part& P : Parts)
        {
            GeometryStructure Mesh;
            Mesh.AppendVertices(P.Corners.data(), P.Corners.size());
            Mesh.AppendIndices(P.Order.data(), P.Order.size());
            Matrix4x4 World = Identity;
            if (P.Span == 0u) World = Body;                                   // the shell
            else if (P.Span >= 1u && P.Span <= 4u)                            // the four wheels
            {
                const uint32_t Wheel = P.Span - 1u;
                if (Wheel < Telemetry.WheelCount)
                {
                    const auto& W = Telemetry.Wheels[Wheel];
                    World = PoseMatrix(W.HubRotation, W.HubPosition);  // the solver's own hub pose, steer yaw included
                }
                else World = Body;
            }
            const uint32_t First = Level->RegisterInstance(Mesh, World, Slot[P.Material], 0u);
            const uint32_t Place = Level->RegisterPlacement(Author.QuerySpans()[P.Span].Name, 0xFFFFFFFFu, World, World);
            Level->AttachInstances(Place, First, 1u);
            Level->AssignPlacementDynamic(Place, P.Dynamic);
        }
        Level->AssignName("Drive");
        Level->Finalise();

        // The app's own chase camera, fed the chassis pose the physics produced.
        const Vec3 Forward = Chassis.Orientation.Rotate({ 1.0f, 0.0f, 0.0f });
        Chase.AdvanceChase({ Chassis.Position.x, Chassis.Position.y, Chassis.Position.z },
                           { Forward.x, Forward.y, Forward.z }, Telemetry.SpeedMetresPerSecond,
                           static_cast<float>(Stride) * Dt);
        CameraProjection* Active = &Chase;
        CameraProjection Fixed;
        Fixed.AssignAspectRatio(static_cast<float>(Width) / static_cast<float>(Height));
        if (CameraName == "orbit")
        {
            // The eye circles the car's own position at a fixed radius and aims back at it.
            const float Azimuth = 6.28318531f * (T - Freeze) / (OrbitPeriod > 0.0f ? OrbitPeriod : 6.0f);
            const float EyeX = Chassis.Position.x + OrbitRadius * std::sin(Azimuth);
            const float EyeY = Chassis.Position.y + OrbitRadius * std::cos(Azimuth);
            const float EyeZ = Chassis.Position.z + OrbitHeight;
            Fixed.AssignSpatialLocation({ EyeX, EyeY, EyeZ });
            Fixed.AssignOrientationEuler(-std::atan2(OrbitHeight - 0.45f, OrbitRadius),
                                         std::atan2(Chassis.Position.x - EyeX, Chassis.Position.y - EyeY), 0.0f);
            Fixed.AssignFieldOfView(38.0f);
            Active = &Fixed;
        }
        else if (CameraName == "trackside")
        {
            // A fixed marshal post beside the ramp, so the launch reads as motion through frame, not a locked chase.
            Fixed.AssignSpatialLocation({ 26.0f, -19.0f, 3.4f });
            Fixed.AssignOrientationEuler(-std::atan2(3.4f - 0.8f, 20.0f),
                                         std::atan2(Chassis.Position.x - 26.0f, Chassis.Position.y + 19.0f), 0.0f);
            Fixed.AssignFieldOfView(42.0f);
            Active = &Fixed;
        }

        const Vector3 E = Active->QuerySpatialLocation(), F = Active->QueryForwardVector();
        const Vector3 R = Active->QueryRightVector(),     U = Active->QueryUpwardVector();
        const float Eye[3] = { E.x, E.y, E.z }, Fw[3] = { F.x, F.y, F.z };
        const float Rt[3] = { R.x, R.y, R.z }, Up[3] = { U.x, U.y, U.z };

        Sky->Tick(static_cast<float>(Stride) * Dt, Eye, 0.0f);
        Sky->ApplyTo(*Raster, Budget);

        double MeanLuminance = 0.0;
        if (!Raster->Render(*Level, Eye, Fw, Rt, Up, Active->QueryFieldOfViewRadians(),
                            Width, Height, Pixels.data(), MeanLuminance))
        { std::fprintf(stderr, "[drive-scene] raster refused frame %u\n", Written); return 1; }
        if (MeanLuminance > 0.0) ++NonBlack;

        for (size_t I = 0, O = 0; I + 3 < Pixels.size(); I += 4, O += 3)
        { Rgb[O] = Pixels[I]; Rgb[O + 1] = Pixels[I + 1]; Rgb[O + 2] = Pixels[I + 2]; }
        char Path[512];
        std::snprintf(Path, sizeof(Path), "%s/frame_%04u.png", FramesOut.c_str(), Written);
        if (!stbi_write_png(Path, static_cast<int>(Width), static_cast<int>(Height), 3, Rgb.data(), static_cast<int>(Width) * 3))
        { std::fprintf(stderr, "[drive-scene] cannot write %s\n", Path); return 1; }
        ++Written;
    }

    std::printf("[drive-scene] camera '%s': %u frames at %u fps, %ux%u\n", CameraName.c_str(), Written, Fps, Width, Height);
    std::printf("[drive-scene] run: peak speed %.2f m/s (%.1f km/h), peak aero downforce %.0f N, final X %.2f m\n",
                static_cast<double>(PeakSpeed), static_cast<double>(PeakSpeed) * 3.6,
                static_cast<double>(PeakDownforce), static_cast<double>(Chassis.Position.x));
    Check(Written > 8u, "the sequence carries more than eight frames");
    Check(NonBlack == Written, "every frame carries light");
    Check(PeakSpeed > (Freeze > 0.0f ? 2.0f : 10.0f), "the vehicle actually drove");
    Check(Freeze > 0.0f || Chassis.Position.x > 20.0f, "the vehicle travelled down the course");
    std::printf("[drive-scene] %u gates passed\n", g_Checks);
    return 0;
}
