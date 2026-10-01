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
//                            [--camera chase|trackside|orbit|wheel] [--wheel 0..3] [--sun 15.0]
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
#include "DriveWheelMesh.h"
#include "ControlVehicleWheelMesh.inl"
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

// --scenario kerb: drive up the pad and lean the car onto the kerb so the LEFT SHOULDER strikes its vertical
//    face. Nothing else in the course has a vertical surface, so this is the only way the sidewall contact
//    path gets exercised by the real vehicle rather than by a unit rig.
//
//    Geometry that sets the numbers: the kerb's inner face is at y = +3.20 m and the tyre's outer shoulder
//    sits at y = half-track 1.0475 + half-width 0.1979 = 1.245 m from the car's centreline. So the chassis
//    has to reach about y = 1.95 m for the shoulder to touch, and a gentle sustained left lean gets there
//    without the slalom's oscillation masking the moment of contact.
//    Steering is CLOSED-LOOP on lateral position. Open loop does not work here: a fixed 0.065 of steer held
//    for 3.5 s put the car at y = 22.5 m, nineteen metres past the kerb, because nothing was bringing it
//    back. A proportional term holds it against the face instead, which is what a driver leaning on a kerb
//    actually does, and makes the test independent of speed and of the exact steering ratio.
DriverInput KerbInputAt(float Seconds, float CurrentY) noexcept
{
    DriverInput Input{};
    if (Seconds < 0.8f) return Input;
    Input.Throttle = 0.35f;
    const float TargetY = DC::KerbConstants::CentreY - 1.21f;   // shoulder just inside the face
    const float Error = TargetY - CurrentY;
    Input.Steer = std::max(-0.09f, std::min(0.09f, 0.055f * Error));
    if (Seconds > 10.0f) { Input.Throttle = 0.0f; Input.Brake = 0.5f; }
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

//------------------------------------------------------------------------------------------------------------------------ the deforming tyre
// Rebuild one wheel's surface from the carcass the XPBD solver just resolved.
//
//    XPBDSoftTyre carries a ring x segment lattice of tread particles it integrates, constrains against the rim and
//    pushes out of the ground every substep. DriveWheelMesh.h's emitter takes exactly that lattice, so handing it the
//    live node positions instead of a rest cylinder is all it takes for the rendered tyre to be the simulated one:
//    the contact patch flattens where nodes are pressed into the pad, the shoulders bulge either side of it, and the
//    whole carcass shivers over the speed bumps. Nothing is scaled, faked or keyframed here.
//
//    Nodes are in WORLD space; the part is drawn under the hub's own pose matrix, so they come back to hub-local
//    first. That keeps the wheel a normal dynamic instance rather than a special case in the renderer.
// ── XPBD tyre diagnostics ───────────────────────────────────────────────────────────────────────────────────
// The carcass was visibly wobbling under a car that drove correctly, and a GIF is a poor instrument for telling
//    "the tyre is rolling over a bump" from "the tyre is ringing". These are the numbers that separate them.
//
//    RestSpeed is the one that matters. A settled tyre under steady load has nodes that are nearly stationary IN
//    THE HUB FRAME; a ringing one does not, however steady the hub is. Radial spread (max − min node radius)
//    says how out-of-round the carcass currently is, which is the wobble you actually see.
struct TyreDiagnostics
{
    float MaxSquash = 0.0f;     // [m]   peak |r − rest|
    float MeanRadius = 0.0f;    // [m]
    float RadialSpread = 0.0f;  // [m]   max r − min r : out-of-roundness
    // RADIAL speed, not hub-relative speed. Hub-relative speed is dominated by the wheel's own rotation -- a
    //    node at r = 0.5 m on a wheel rolling at 36 m/s is doing 36 m/s in the hub frame and is perfectly
    //    healthy. dr/dt is zero for rigid rotation AND for translation, so what is left is the carcass
    //    breathing: exactly the wobble. (Measured hub-relative first; the log showed it tracking road speed
    //    almost exactly, which is the giveaway that it was reading rotation.)
    float MaxRadialSpeed = 0.0f;   // [m/s]
    float RmsRadialSpeed = 0.0f;   // [m/s]
    uint32_t Contacts = 0u;
    float NormalLoad = 0.0f;    // [N]

    // ── is the out-of-roundness the CONTACT PATCH, or a standing wave? ──────────────────────────────────────
    // A loaded tyre is legitimately not round: it has a flat spot where it meets the road, and that flat spot
    // is most of the out-of-roundness in this log. It is not a defect. What WOULD be a defect is the carcass
    // ringing AWAY from the patch. So the patch is excluded and the remainder measured on its own.
    float OffPatchSpread = 0.0f;   // [m] max−min radius over nodes well away from the contact arc
    uint32_t DominantMode = 0u;    // [-] circumferential harmonic with the largest amplitude
    float DominantAmplitude = 0.0f;// [m] that harmonic's amplitude on the centre ring
    float RmsDeviation = 0.0f;     // [m] RMS |r − mean| over every node
    uint32_t Outliers = 0u;        // [-] nodes more than 10 mm off the mean radius
    float CrownRadius = 0.0f;      // [m] mean radius of the centre ring
    float ShoulderRadius = 0.0f;   // [m] mean radius of the two edge rings
    float RmsAboutCentroid = 0.0f; // [m] RMS |r − mean| measured about the node CENTROID, not the hub
    float CentroidOffset = 0.0f;   // [m] how far the centroid sits from the supplied hub position

    // ── LATERAL behaviour (along the spin axis) ─────────────────────────────────────────────────────────────
    // Reported symptom: the bulge appears to travel sideways and the carcass looks like it breathes in and out
    // across its width. Radial metrics cannot see that at all -- they project the axial component away by
    // construction -- so it needs its own measurement.
    float SectionWidth = 0.0f;     // [m] max − min axial extent, against the authored Width
    float RmsAxialDeviation = 0.0f;// [m] RMS |axial − rest axial| per node
    float MaxAxialDeviation = 0.0f;// [m]
};

TyreDiagnostics MeasureTyre(const XPBDSoftTyre& Tyre, const Vec3& HubPosition, const Vec3& HubVelocity,
                            const Quat& HubRotation)
{
    TyreDiagnostics D;
    const auto& Nodes = Tyre.Nodes();
    if (Nodes.empty()) return D;
    const float Rest = Tyre.Params().Radius;
    // The wheel's ACTUAL spin axis, not world +Y. Radius means "distance from the spin axis", so projecting
    //    onto a fixed axis measures the wrong quantity the moment the car yaws or the wheel steers -- and it
    //    manufactures scatter that grows exactly when the car starts turning. That is precisely what this
    //    function reported for several passes: ~13 mm of "carcass deformation" appearing at ~7 m/s, while the
    //    solver's own residuals showed every constraint family satisfied to under a millimetre. Two
    //    measurements of the same tyre disagreed by an order of magnitude, and the broken one was this.
    const Vec3 Axis = HubRotation.Rotate({0.0f, 1.0f, 0.0f}).Normalized();
    float MinR = 1e30f, MaxR = -1e30f, SumR = 0.0f, SumSq = 0.0f;
    for (const auto& N : Nodes)
    {
        const Vec3 Rel = N.Position - HubPosition;
        const Vec3 Radial = Rel - Axis * Dot(Rel, Axis);
        const float R = Radial.Length();
        MinR = std::min(MinR, R); MaxR = std::max(MaxR, R); SumR += R;
        D.MaxSquash = std::max(D.MaxSquash, std::fabs(Rest - R));
        const Vec3 RadialDir = (R > 1e-6f) ? Radial * (1.0f / R) : Vec3{0.0f, 0.0f, 1.0f};
        const float RadialSpeed = std::fabs(Dot(N.Velocity - HubVelocity, RadialDir));
        D.MaxRadialSpeed = std::max(D.MaxRadialSpeed, RadialSpeed);
        SumSq += RadialSpeed * RadialSpeed;
    }
    const float Count = static_cast<float>(Nodes.size());
    D.MeanRadius = SumR / Count;

    const uint32_t Segments = Tyre.Params().SegmentCount, Rings = Tyre.Params().RingCount;

    // Contact arc: the mean angular position of the nodes actually touching, then a generous band either side
    //    so the flat spot AND its shoulders are removed before the rest is measured.
    float Cx = 0.0f, Cy = 0.0f; uint32_t Touching = 0u;
    for (uint32_t r = 0; r < Rings; ++r)
        for (uint32_t sg = 0; sg < Segments; ++sg)
            if (Nodes[r * Segments + sg].InContact)
            {
                const float A = 6.28318531f * static_cast<float>(sg) / static_cast<float>(Segments);
                Cx += std::cos(A); Cy += std::sin(A); ++Touching;
            }
    if (Touching > 0u)
    {
        const float PatchAngle = std::atan2(Cy, Cx);
        float OffMin = 1e30f, OffMax = -1e30f;
        for (uint32_t r = 0; r < Rings; ++r)
            for (uint32_t sg = 0; sg < Segments; ++sg)
            {
                const float A = 6.28318531f * static_cast<float>(sg) / static_cast<float>(Segments);
                const float Delta = std::fabs(std::atan2(std::sin(A - PatchAngle), std::cos(A - PatchAngle)));
                if (Delta < 0.7854f) continue;             // exclude ±45° about the patch
                const Vec3 Rel2 = Nodes[r * Segments + sg].Position - HubPosition;
                const float Rr = (Rel2 - Axis * Dot(Rel2, Axis)).Length();
                OffMin = std::min(OffMin, Rr); OffMax = std::max(OffMax, Rr);
            }
        if (OffMax > OffMin) D.OffPatchSpread = OffMax - OffMin;
    }

    // Circumferential harmonics on the centre ring. A flat spot spreads energy broadly over low modes; a
    //    standing wave in the tread band is a sharp peak at one higher mode. This separates them.
    {
        const uint32_t Mid = (Rings / 2u) * Segments;
        for (uint32_t m = 2u; m <= 48u; ++m)   // up to mode 48: short-wavelength tread ripple lives well above 8
        {
            float Re = 0.0f, Im = 0.0f;
            for (uint32_t sg = 0; sg < Segments; ++sg)
            {
                const Vec3 Rel2 = Nodes[Mid + sg].Position - HubPosition;
                const float Rr = (Rel2 - Axis * Dot(Rel2, Axis)).Length();
                const float A = 6.28318531f * static_cast<float>(m) * static_cast<float>(sg) / static_cast<float>(Segments);
                Re += Rr * std::cos(A); Im += Rr * std::sin(A);
            }
            const float Amp = 2.0f * std::sqrt(Re * Re + Im * Im) / static_cast<float>(Segments);
            if (Amp > D.DominantAmplitude) { D.DominantAmplitude = Amp; D.DominantMode = m; }
        }
    }
    D.RadialSpread = MaxR - MinR;
    D.RmsRadialSpeed = std::sqrt(SumSq / Count);

    // Broad distortion or a few launched nodes? RMS says how much the WHOLE carcass is off; the outlier count
    //    says how many nodes carry it. A 60 mm spread with a 2 mm RMS and a handful of outliers is a few
    //    particles misbehaving, not a deformed tyre, and those are very different bugs.
    {
        float SumDev = 0.0f;
        for (const auto& N2 : Nodes)
        {
            const Vec3 Rel2 = N2.Position - HubPosition;
            const float Rr = (Rel2 - Axis * Dot(Rel2, Axis)).Length();
            const float Dv = Rr - D.MeanRadius;
            SumDev += Dv * Dv;
            if (std::fabs(Dv) > 0.010f) ++D.Outliers;
        }
        D.RmsDeviation = std::sqrt(SumDev / Count);
    }

    // Circumferential harmonics are computed on the CENTRE ring, and they stayed under 3 mm even out to mode
    //    48 while the whole-lattice RMS ran to 13 mm. So the deviation is not around the circumference at all
    //    -- it is ACROSS THE WIDTH. Crown against shoulders tests that directly.
    {
        auto RingMean = [&](uint32_t r)
        {
            float Sum = 0.0f;
            for (uint32_t sg = 0; sg < Segments; ++sg)
            {
                const Vec3 Rel2 = Nodes[r * Segments + sg].Position - HubPosition;
                Sum += (Rel2 - Axis * Dot(Rel2, Axis)).Length();
            }
            return Sum / static_cast<float>(Segments);
        };
        D.CrownRadius = RingMean(Rings / 2u);
        D.ShoulderRadius = 0.5f * (RingMean(0u) + RingMean(Rings - 1u));
    }

    // Everything above measures radius about the hub position the TELEMETRY reports, and VehicleSolver.h:188
    //    documents that as "rest hub, follows chassis" -- i.e. where the hub would be with the suspension at
    //    rest, not where the wheel centre actually is. Measuring a circle's radii about a point that is offset
    //    from its true centre by d manufactures an apparent variation of ±d and nothing else. So the same
    //    spread is recomputed about the lattice's OWN centroid; if that collapses, the scatter was never in
    //    the tyre, it was in the ruler.
    {
        Vec3 Centroid{0.0f, 0.0f, 0.0f};
        for (const auto& N2 : Nodes) Centroid += N2.Position;
        Centroid = Centroid * (1.0f / Count);
        D.CentroidOffset = (Centroid - HubPosition).Length();

        float SumR2 = 0.0f;
        std::vector<float> Radii; Radii.reserve(Nodes.size());
        for (const auto& N2 : Nodes)
        {
            const Vec3 Rel2 = N2.Position - Centroid;
            const float Rr = (Rel2 - Axis * Dot(Rel2, Axis)).Length();
            Radii.push_back(Rr); SumR2 += Rr;
        }
        const float MeanC = SumR2 / Count;
        float SumDev2 = 0.0f;
        for (float Rr : Radii) SumDev2 += (Rr - MeanC) * (Rr - MeanC);
        D.RmsAboutCentroid = std::sqrt(SumDev2 / Count);
    }

    // Axial: how far each node sits along the spin axis against where it is supposed to sit. TreadLocal.y is
    //    the authored rest offset for that ring, and the hub frame makes the two directly comparable.
    {
        float MinA = 1e30f, MaxA = -1e30f, SumA2 = 0.0f;
        for (const auto& N2 : Nodes)
        {
            const float Axial = Dot(N2.Position - HubPosition, Axis);
            MinA = std::min(MinA, Axial); MaxA = std::max(MaxA, Axial);
            const float Dev = Axial - N2.TreadLocal.y;
            SumA2 += Dev * Dev;
            D.MaxAxialDeviation = std::max(D.MaxAxialDeviation, std::fabs(Dev));
        }
        D.SectionWidth = MaxA - MinA;
        D.RmsAxialDeviation = std::sqrt(SumA2 / Count);
    }
    D.Contacts = Tyre.Reaction().ContactCount;
    D.NormalLoad = Tyre.Reaction().Force.z;
    return D;
}

// --debug-lattice: draw the solver's PARTICLES instead of the skin stretched over them. A skinned tyre hides
//    which nodes are misbehaving; markers do not. Node colour is by state, using material slots that already
//    exist so no new authoring is needed:
//        red  (MatTaillight) — in contact with the ground this substep
//        blue (MatHub)       — more than 10 mm off the rest radius, i.e. deformed
//        dark (MatTyre)      — at rest radius, doing nothing
//    Each marker is a 6-triangle octahedron; at 9x128 that is 1152 markers per wheel, which the raster eats.
bool g_DebugLattice = false;

void RebuildWheelParts(const XPBDSoftTyre& Tyre, const Quat& HubRotation, const Vec3& HubPosition,
                       uint32_t Span, std::vector<Part>& Parts)
{
    const auto& Nodes = Tyre.Nodes();
    const auto& Params = Tyre.Params();
    const uint32_t Rings = Params.RingCount, Segments = Params.SegmentCount;
    if (Nodes.size() < static_cast<size_t>(Rings) * Segments) return;

    const Quat Inverse{ -HubRotation.x, -HubRotation.y, -HubRotation.z, HubRotation.w };
    std::vector<float> Tread(static_cast<size_t>(Rings) * Segments * 3u, 0.0f);
    for (uint32_t N = 0; N < Rings * Segments; ++N)
    {
        const Vec3 Local = Inverse.Rotate(Nodes[N].Position - HubPosition);
        Tread[N * 3u + 0u] = Local.x; Tread[N * 3u + 1u] = Local.y; Tread[N * 3u + 2u] = Local.z;
    }

    DC::WheelTreadLattice Lattice;
    Lattice.RingCount = Rings; Lattice.SegmentCount = Segments; Lattice.Tread = Tread.data();
    Lattice.RimRadius = Params.RimRadius; Lattice.HalfWidth = 0.5f * Params.Width;
    Lattice.SpokeCount = DC::kDriveWheelSpokeCount;

    Part* ByMaterial[3] = { nullptr, nullptr, nullptr };
    const uint32_t Slots[3] = { DC::MatTyre, DC::MatHub, g_DebugLattice ? DC::MatTaillight : DC::MatBrake };
    for (unsigned K = 0; K < 3u; ++K)
    {
        Parts.push_back(Part{ Span, Slots[K], {}, {}, /*Dynamic=*/true });
        ByMaterial[K] = &Parts.back();
    }

    if (g_DebugLattice)
    {
        // Deviation is measured against the carcass's OWN mean radius, not the unloaded rest radius. A
        //    pressurised tyre sits uniformly larger than rest -- here +5.8 mm, which is exactly the
        //    120.7 N node pressure force over the 20 kN/m sidewall -- and that is correct, not deformation.
        //    Colouring against rest painted the entire tyre "deformed" and hid the thing worth seeing.
        // FRAME DISCIPLINE. Radius is measured from the hub-local Tread[] positions, where the spin axis
        //    really is {0,1,0}. The first version took (Position − HubPosition), which is a WORLD vector, and
        //    projected it onto the hub-local axis anyway. The two frames agree only while the car points
        //    along +X, so as it yawed the error rotated through the lattice and lit a band of markers that
        //    swept sideways across the tread and breathed in and out with the steering. That reads exactly
        //    like a bulge travelling laterally, and it was reported as one. It is not motion at all: measured
        //    properly the carcass holds its width to 0.02 mm and its crown-to-shoulder radius to 0.01 mm.
        //    Same class of bug as the one already fixed in MeasureTyre, in the other place it was copied to.
        auto LocalRadius = [&](uint32_t N)
        {
            const float X = Tread[N * 3u + 0u], Z = Tread[N * 3u + 2u];
            return std::sqrt(X * X + Z * Z);
        };
        float MeanR = 0.0f;
        for (uint32_t N = 0; N < Rings * Segments; ++N) MeanR += LocalRadius(N);
        MeanR /= static_cast<float>(Rings * Segments);
        const float Rest = MeanR;
        const float M = 0.012f;   // marker half-extent [m]
        const Vec3 Dir[6] = { { M,0,0}, {-M,0,0}, {0, M,0}, {0,-M,0}, {0,0, M}, {0,0,-M} };
        const int Face[8][3] = { {0,2,4},{2,1,4},{1,3,4},{3,0,4},{2,0,5},{1,2,5},{3,1,5},{0,3,5} };
        for (uint32_t N = 0; N < Rings * Segments; ++N)
        {
            const float Deviation = std::fabs(LocalRadius(N) - Rest);
            Part* Target = Nodes[N].InContact ? ByMaterial[2] : (Deviation > 0.010f ? ByMaterial[1] : ByMaterial[0]);
            const Vec3 C{ Tread[N * 3u + 0u], Tread[N * 3u + 1u], Tread[N * 3u + 2u] };   // hub-local
            for (const auto& F : Face)
            {
                const Vec3 P[3] = { C + Dir[F[0]], C + Dir[F[1]], C + Dir[F[2]] };
                const Vec3 E1 = P[1] - P[0], E2 = P[2] - P[0];
                Vec3 Nl = Cross(E1, E2); const float L = Nl.Length();
                if (L > 1e-12f) Nl = Nl * (1.0f / L);
                for (unsigned K = 0; K < 3u; ++K)
                {
                    VertexRecord V{};
                    V.SpatialLocation = { P[K].x, P[K].y, P[K].z };
                    V.NormalDirection = { Nl.x, Nl.y, Nl.z };
                    Target->Order.push_back(static_cast<uint32_t>(Target->Corners.size()));
                    Target->Corners.push_back(V);
                }
            }
        }
        return;   // markers INSTEAD of the skin: the point is to see the particles
    }

    DC::EmitWheelSurface(Lattice, DC::MatTyre, DC::MatHub, DC::MatBrake,
        [&](const float A[3], const float B[3], const float C[3],
            const float NA[3], const float NB[3], const float NC[3], uint32_t Slot)
        {
            // The TREAD only. The procedural hub cap and brake disc that EmitWheelSurface also draws are
            //    dropped here and replaced below by the authored RimFL mesh, so the animated wheel carries the
            //    same rim the static (ray-traced) level does. Leaving both in place would stack the authored
            //    rim on top of a procedural disc occupying the same millimetres.
            if (Slot != DC::MatTyre) return;
            Part* Target = ByMaterial[0u];
            const float* Corner[3] = { A, B, C };
            const float* Normal[3] = { NA, NB, NC };
            const float U[3][2] = { { 0.0f, 0.0f }, { 1.0f, 0.0f }, { 1.0f, 1.0f } };
            for (unsigned K = 0; K < 3u; ++K)
            {
                VertexRecord V{};
                V.SpatialLocation = { Corner[K][0], Corner[K][1], Corner[K][2] };
                V.NormalDirection = { Normal[K][0], Normal[K][1], Normal[K][2] };
                V.TextureCoordinateU = U[K][0];
                V.TextureCoordinateV = U[K][1];
                Target->Order.push_back(static_cast<uint32_t>(Target->Corners.size()));
                Target->Corners.push_back(V);
            }
        });

    // ── the authored rim, rigid inside the deforming carcass ────────────────────────────────────────────────
    // ControlVehicleWheelMesh is authored hub-local and this whole part is drawn under the hub's pose matrix,
    //    so the mesh drops straight in and spins and steers with the wheel for free. The rim is rigid on
    //    purpose: only the TYRE deforms, and it is the XPBD lattice above that does it.
    {
        using namespace Frontier::Drive::ControlVehicleWheelMesh;
        const float Scale = (kRimRadius > 1e-4f) ? (Params.RimRadius / kRimRadius) : 1.0f;
        for (uint32_t T = 0; T < kTriangleCount; ++T)
        {
            const uint32_t Family = kTriangleFamily[T];
            Part* Target = ByMaterial[Family == DC::MatHub ? 1u : (Family == DC::MatBrake ? 2u : 0u)];
            const uint32_t Index[3] = { kTriangles[T * 3u], kTriangles[T * 3u + 1u], kTriangles[T * 3u + 2u] };
            float Corner[3][3];
            for (unsigned K = 0; K < 3u; ++K)
                for (unsigned C = 0; C < 3u; ++C)
                    Corner[K][C] = kPositions[Index[K] * 3u + C] * Scale;
            const float Ex[3] = { Corner[1][0] - Corner[0][0], Corner[1][1] - Corner[0][1], Corner[1][2] - Corner[0][2] };
            const float Ey[3] = { Corner[2][0] - Corner[0][0], Corner[2][1] - Corner[0][1], Corner[2][2] - Corner[0][2] };
            float N[3] = { Ex[1] * Ey[2] - Ex[2] * Ey[1], Ex[2] * Ey[0] - Ex[0] * Ey[2], Ex[0] * Ey[1] - Ex[1] * Ey[0] };
            const float L = std::sqrt(N[0] * N[0] + N[1] * N[1] + N[2] * N[2]);
            if (L > 1e-12f) { N[0] /= L; N[1] /= L; N[2] /= L; }
            const float U[3][2] = { { 0.0f, 0.0f }, { 1.0f, 0.0f }, { 1.0f, 1.0f } };
            for (unsigned K = 0; K < 3u; ++K)
            {
                VertexRecord V{};
                V.SpatialLocation = { Corner[K][0], Corner[K][1], Corner[K][2] };
                V.NormalDirection = { N[0], N[1], N[2] };
                V.TextureCoordinateU = U[K][0];
                V.TextureCoordinateV = U[K][1];
                Target->Order.push_back(static_cast<uint32_t>(Target->Corners.size()));
                Target->Corners.push_back(V);
            }
        }
    }
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
    uint32_t    WheelIndex = 0u;                 // which tyre `--camera wheel` frames (0=FL, 1=FR, 2=RL, 3=RR)
    uint32_t Width = 480u, Height = 270u, Fps = 20u;
    float Seconds = 12.0f, SunHour = 15.0f, Freeze = 0.0f;
    bool  Still = false;   // one frozen pose for a material sheet; see the motion-gate note at the gates
    std::string TyreLog;   // --tyre-log <csv>: per-frame XPBD carcass diagnostics
    std::string Scenario = "default";   // --scenario kerb : lean onto the kerb and strike it side-on
    float Exposure = 1.05f;       // --exposure <v>      : matches MaterialLevelViewport's default exactly
    float TyreMu = -1.0f;         // --tyre-mu <v>       : override Coulomb μ (bench)
    float TreadAlpha = -1.0f;     // --tread-alpha <v>   : override tread tangential compliance (bench)
    uint32_t TyreSubsteps = 0u;   // --tyre-substeps <n> : override XPBD substeps (bench)
    bool  DebugLattice = false;   // --debug-lattice: draw the XPBD nodes themselves instead of the tyre skin
    float OrbitPeriod = 6.0f, OrbitRadius = 8.0f, OrbitHeight = 2.2f;

    for (int I = 1; I < ArgumentCount; ++I)
    {
        const std::string A = ArgumentValues[I];
        auto Next = [&](const char* What) -> const char* {
            if (I + 1 >= ArgumentCount) { std::fprintf(stderr, "%s needs a value\n", What); std::exit(2); }
            return ArgumentValues[++I]; };
        if      (A == "--frames-out") FramesOut  = Next("--frames-out");
        else if (A == "--camera")     CameraName = Next("--camera");
        else if (A == "--wheel")      WheelIndex = static_cast<uint32_t>(std::atoi(Next("--wheel")));
        else if (A == "--width")      Width      = static_cast<uint32_t>(std::atoi(Next("--width")));
        else if (A == "--height")     Height     = static_cast<uint32_t>(std::atoi(Next("--height")));
        else if (A == "--fps")        Fps        = static_cast<uint32_t>(std::atoi(Next("--fps")));
        else if (A == "--seconds")    Seconds    = static_cast<float>(std::atof(Next("--seconds")));
        else if (A == "--sun")        SunHour    = static_cast<float>(std::atof(Next("--sun")));
        else if (A == "--freeze")       Freeze      = static_cast<float>(std::atof(Next("--freeze")));
        else if (A == "--still")        Still       = true;
        else if (A == "--tyre-log")     TyreLog     = Next("--tyre-log");
        else if (A == "--scenario")     Scenario    = Next("--scenario");
        else if (A == "--exposure")     Exposure    = static_cast<float>(std::atof(Next("--exposure")));
        else if (A == "--tyre-mu")      TyreMu      = static_cast<float>(std::atof(Next("--tyre-mu")));
        else if (A == "--tread-alpha")  TreadAlpha  = static_cast<float>(std::atof(Next("--tread-alpha")));
        else if (A == "--tyre-substeps") TyreSubsteps = static_cast<uint32_t>(std::atoi(Next("--tyre-substeps")));
        else if (A == "--debug-lattice") { DebugLattice = true; g_DebugLattice = true; }
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
    // Everything that is NOT a wheel. Spans 1..4 are dropped here because they are re-skinned per frame from the
    //    solver's carcass; the author's rest wheels only exist so the exported DriveCourse.gltf has geometry.
    std::vector<Part> StaticParts;
    for (const Part& P : Parts) if (P.Span == 0u || P.Span > 4u) StaticParts.push_back(P);
    Check(!Parts.empty(), "the level sliced into span/material parts");
    std::printf("[drive-scene] level: %zu triangles, %zu materials, %zu spans, %zu parts\n",
                Author.QueryTriangles().size(), Author.QueryMaterials().size(), Author.QuerySpans().size(), Parts.size());

    // 2 ── the real vehicle, exactly as DriveTelemetry stands it up
    VehicleGeometry Geometry;
    VehicleSolverConfiguration Configuration;
    Configuration.ActiveScheme = DrivingScheme::PacejkaDrivetrain;
    ApplyGeometry(Configuration, Geometry);
    Configuration.Aero.Enabled = true;
    // Bench overrides, so a hypothesis about the carcass can be TESTED rather than argued about. Defaults are
    //    negative meaning "leave the calibrated value alone", so a normal run is bit-identical without them.
    if (TyreMu >= 0.0f)        Configuration.Tyre.FrictionCoefficient = TyreMu;
    if (TreadAlpha > 0.0f)     Configuration.Tyre.TreadTangentialCompliance = TreadAlpha;
    if (TyreSubsteps > 0u)     Configuration.TyreSubsteps = TyreSubsteps;

    MockChassis Chassis;
    // Resting CoM height from the geometry, never a literal — see DriveTelemetry.cpp for what a stale one costs.
    Chassis.Position = { 0.0f, 0.0f, Geometry.CoMHeight };
    Chassis.Mass = Configuration.ChassisMass;
    Chassis.InvInertiaDiag = Geometry.InvInertia();

    VehicleSolver Solver;
    VehicleSolver::Hooks Hooks;
    Hooks.ReadChassis       = [&] { return Chassis.State(); };
    Hooks.ApplyForceAtPoint = [&](const Vec3& Force, const Vec3& Point) { Chassis.ApplyForceAtPoint(Force, Point); };
    Hooks.ApplyTorque       = [&](const Vec3& Torque) { Chassis.ApplyTorque(Torque); };
    Hooks.Ground            = [](const Vec3& Point, Vec3& SurfacePoint, Vec3& Normal)
    {
        // The surface query, not a height. CourseSurface answers with the nearest point ON the course and its
        //    outward normal, so the kerb's vertical face can stop a tyre sideways instead of launching it.
        float Sx, Sy, Sz, Nx, Ny, Nz;
        DC::CourseSurface(Point.x, Point.y, Point.z, Sx, Sy, Sz, Nx, Ny, Nz);
        SurfacePoint = Vec3{ Sx, Sy, Sz };
        Normal       = Vec3{ Nx, Ny, Nz };
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

    // ── one shared transfer, explicitly ─────────────────────────────────────────────────────────────────────
    // VisibilityRaster.h:80 says the transfer "must agree" with the ReSTIR kernel's, and VisibilityRaster.cpp
    //    carries the scar of the last time it did not: "the same radiance reached the screen up to 49/255
    //    apart depending on which path drew it". The mirror never called AssignColourTransfer at all, so the
    //    raster ran on a default-constructed one (ACES, but exposure 1.0) while MaterialLevelViewport renders
    //    at exposure 1.05. Small, but it is exactly the drift the header warns about, and it is the reason a
    //    raster sheet sits slightly darker than the ray-traced sheet of the same scene. Now stated, not
    //    inherited -- and overridable so the two can be matched from the command line.
    {
        ColourTransfer Transfer;
        Transfer.ToneMap    = Frontier::ToneMapCategory::Aces;
        Transfer.Exposure   = Exposure;
        Transfer.Saturation = 1.0f;
        Raster->AssignColourTransfer(Transfer);
    }

    DC::ChaseCameraSolver Chase;
    Chase.AssignAspectRatio(static_cast<float>(Width) / static_cast<float>(Height));

    // 4 ── step the solver at its fixed rate, render on the frame cadence
    const float Dt = 1.0f / 240.0f;
    const int   Steps = static_cast<int>(Seconds / Dt);
    const int   Stride = static_cast<int>((1.0f / static_cast<float>(Fps)) / Dt);
    std::vector<unsigned char> Pixels(static_cast<size_t>(Width) * Height * 4u);
    std::vector<unsigned char> Rgb(static_cast<size_t>(Width) * Height * 3u);
    uint32_t Written = 0u;
    float PeakSpeed = 0.0f, PeakDownforce = 0.0f, PeakDeflection = 0.0f;
    float MinStrut = 1.0e9f, MaxStrut = -1.0e9f, RestStrut = 0.0f;
    uint32_t OnBumpStop = 0u, StrutSamples = 0u;
    uint32_t PeakContactNodes = 0u;
    unsigned NonBlack = 0u;

    // ── the carcass log ─────────────────────────────────────────────────────────────────────────────────────
    std::FILE* TyreLogFile = nullptr;
    float WorstSpread = 0.0f, WorstRms = 0.0f, WorstOffPatch = 0.0f;
    float PeakKerbLateral = 0.0f;   // [N] strongest −Y reaction seen on any wheel (the kerb pushing back)
    float PeakChassisY = 0.0f;      // [m] how far the car leaned toward the kerb
    Vec3  PrevHub[4]{};
    if (!TyreLog.empty())
    {
        TyreLogFile = std::fopen(TyreLog.c_str(), "wb");
        if (TyreLogFile != nullptr)
            std::fprintf(TyreLogFile,
                "time_s,wheel,speed_mps,max_squash_m,mean_radius_m,radial_spread_m,"
                "max_radial_speed_mps,rms_radial_speed_mps,contacts,normal_load_N,strut_m,"
                "offpatch_spread_m,dominant_mode,dominant_amp_m,rms_deviation_m,outliers,"
                "crown_radius_m,shoulder_radius_m,rms_about_centroid_m,centroid_offset_m,"
                "res_spoke_rms_m,res_shear_rms_m,res_hoop_rms_m,res_lateral_rms_m,res_diag_rms_m,res_contact_max_m,"
                "section_width_m,rms_axial_dev_m,max_axial_dev_m\n");
    }

    for (int S = 0; S <= Steps; ++S)
    {
        const float T = static_cast<float>(S) * Dt;
        // A frozen run is still a REAL run: the physics is stepped up to the freeze moment and then held, so the
        //    orbit sheets show the car in a pose the solver produced rather than one placed by hand.
        const bool Frozen = Freeze > 0.0f && T > Freeze;
        if (!Frozen)
        {
            Solver.AssignInput(Scenario == "kerb" ? KerbInputAt(T, Chassis.State().Position.y) : InputAt(T));
            Solver.Step(Dt);
            Chassis.Integrate(Dt);
        }
        const auto& Telemetry = Solver.Telemetry();
        PeakSpeed = std::max(PeakSpeed, Telemetry.SpeedMetresPerSecond);
        PeakChassisY = std::max(PeakChassisY, Chassis.State().Position.y);
        // A kerb strike is a reaction pointing back OFF the kerb, i.e. −Y. Tracked unconditionally: it was
        //    first written inside the --tyre-log block, so the gate measured nothing unless a CSV was asked
        //    for, and duly reported 0 N.
        for (uint32_t W = 0; W < 4u; ++W)
            PeakKerbLateral = std::max(PeakKerbLateral, -Solver.Tyres()[W].Reaction().Force.y);

        // ── XPBD carcass log ────────────────────────────────────────────────────────────────────────────────
        if (TyreLogFile != nullptr)
        {
            for (uint32_t W = 0; W < Telemetry.WheelCount && W < 4u; ++W)
            {
                const auto& WT = Telemetry.Wheels[W];
                // The telemetry carries no hub velocity, so difference the hub pose. This must be measured in
                //    the HUB frame: every node of a wheel doing 30 m/s is doing 30 m/s, which says nothing at
                //    all about whether the carcass is ringing.
                const Vec3 HubVel = (S > 0) ? (WT.HubPosition - PrevHub[W]) * (1.0f / Dt) : Vec3{0.0f, 0.0f, 0.0f};
                PrevHub[W] = WT.HubPosition;
                const TyreDiagnostics D = MeasureTyre(Solver.Tyres()[W], WT.HubPosition, HubVel, WT.HubRotation);
                const auto& Res = Solver.Tyres()[W].Residual();
                std::fprintf(TyreLogFile,
                    "%.5f,%u,%.4f,%.6f,%.6f,%.6f,%.6f,%.6f,%u,%.2f,%.6f,%.6f,%u,%.6f,%.6f,%u,%.6f,%.6f,%.6f,%.6f,"
                    "%.7f,%.7f,%.7f,%.7f,%.7f,%.7f,%.6f,%.6f,%.6f\n",
                    T, W, Telemetry.SpeedMetresPerSecond,
                    D.MaxSquash, D.MeanRadius, D.RadialSpread,
                    D.MaxRadialSpeed, D.RmsRadialSpeed, D.Contacts, D.NormalLoad, WT.StrutCompression,
                    D.OffPatchSpread, D.DominantMode, D.DominantAmplitude, D.RmsDeviation, D.Outliers, D.CrownRadius, D.ShoulderRadius,
                    D.RmsAboutCentroid, D.CentroidOffset,
                    Res.SpokeRms, Res.ShearRms, Res.HoopRms, Res.LateralRms, Res.DiagonalRms, Res.ContactMax,
                    D.SectionWidth, D.RmsAxialDeviation, D.MaxAxialDeviation);
                WorstSpread = std::max(WorstSpread, D.RadialSpread);
                WorstOffPatch = std::max(WorstOffPatch, D.OffPatchSpread);
                WorstRms    = std::max(WorstRms, D.RmsRadialSpeed);
            }
        }
        PeakDownforce = std::max(PeakDownforce, Telemetry.Aero.TotalDownforce_N);

        // Suspension envelope over the run: where it rides, how far it travels, and whether it is stuck on a stop.
        for (uint32_t W = 0; W < Telemetry.WheelCount && W < 4u; ++W)
        {
            const float Travel = Telemetry.Wheels[W].StrutCompression;
            MinStrut = std::min(MinStrut, Travel);
            MaxStrut = std::max(MaxStrut, Travel);
            if (Travel > Configuration.FrontStrut.MaxTravel) ++OnBumpStop;
            ++StrutSamples;
            if (T < 0.5f) RestStrut = Travel;
        }

        if (S % Stride != 0) continue;

        // The level, re-registered with this step's poses. Cheap: the Drive level is a few thousand triangles.
        auto Level = std::make_unique<SceneStructure>();
        std::vector<uint32_t> Slot(Author.QueryMaterials().size(), 0u);
        for (size_t M = 0; M < Author.QueryMaterials().size(); ++M) Slot[M] = Level->RegisterMaterial(Author.QueryMaterials()[M]);

        const Matrix4x4 Identity;
        const Matrix4x4 Body = PoseMatrix(Chassis.Orientation, Chassis.Position);

        // How far the carcass is off its own rest shape, this frame. Reported and gated below, so the sequence
        //    cannot quietly regress to a rigid cylinder without the proof failing.
        for (uint32_t Wheel = 0; Wheel < 4u && Wheel < Solver.Tyres().size(); ++Wheel)
        {
            const auto& Tyre = Solver.Tyres()[Wheel];
            if (Wheel >= Telemetry.WheelCount) continue;
            const Quat Inverse{ -Telemetry.Wheels[Wheel].HubRotation.x, -Telemetry.Wheels[Wheel].HubRotation.y,
                                -Telemetry.Wheels[Wheel].HubRotation.z,  Telemetry.Wheels[Wheel].HubRotation.w };
            for (const auto& Node : Tyre.Nodes())
            {
                // RADIAL squash, not total node travel: the belt also slips tangentially under drive and brake
                // torque, and that is real but it is not the carcass changing shape. What makes a tyre look like a
                // tyre is the tread losing radius where it is pressed into the ground, so that is what is measured.
                const Vec3 Local = Inverse.Rotate(Node.Position - Telemetry.Wheels[Wheel].HubPosition);
                const float Live = std::sqrt(Local.x * Local.x + Local.z * Local.z);
                const float Rest = std::sqrt(Node.TreadLocal.x * Node.TreadLocal.x + Node.TreadLocal.z * Node.TreadLocal.z);
                PeakDeflection = std::max(PeakDeflection, std::abs(Live - Rest));
            }
            PeakContactNodes = std::max(PeakContactNodes, Tyre.Reaction().ContactCount);
        }

        // The four wheels are re-skinned from the live XPBD carcass every frame; only the body and the course come
        //    from the authored (rest) geometry. Parts is rebuilt rather than mutated so the static slice stays pure.
        std::vector<Part> Frame(StaticParts);
        for (uint32_t Wheel = 0; Wheel < 4u && Wheel < Telemetry.WheelCount; ++Wheel)
        {
            const auto& W = Telemetry.Wheels[Wheel];
            if (Wheel < Solver.Tyres().size())
                RebuildWheelParts(Solver.Tyres()[Wheel], W.HubRotation, W.HubPosition, Wheel + 1u, Frame);
        }

        for (const Part& P : Frame)
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
        else if (CameraName == "wheel")
        {
            // Locked onto one tyre, close enough to read the carcass. The eye stays OUTBOARD of the car and sweeps
            //    an arc in the chassis frame rather than circling the hub, which would put it inside the bodywork;
            //    it aims low, at the contact patch, so what fills the frame is the XPBD lattice meeting the ground.
            const auto& W = Telemetry.Wheels[WheelIndex < Telemetry.WheelCount ? WheelIndex : 0u];
            const Vec3 Hub = W.HubPosition;
            const float Outboard = (WheelIndex % 2u == 0u) ? +1.0f : -1.0f;   // 0/2 are left wheels, 1/3 right
            const Vec3 Side = Chassis.Orientation.Rotate({ 0.0f, Outboard, 0.0f });
            const float Sweep = 1.22f * std::sin(6.28318531f * (T - Freeze) / (OrbitPeriod > 0.0f ? OrbitPeriod : 6.0f));
            const Vec3 Offset{ Side.x * std::cos(Sweep) + Forward.x * std::sin(Sweep),
                               Side.y * std::cos(Sweep) + Forward.y * std::sin(Sweep),
                               Side.z * std::cos(Sweep) + Forward.z * std::sin(Sweep) };
            const float EyeX = Hub.x + OrbitRadius * Offset.x;
            const float EyeY = Hub.y + OrbitRadius * Offset.y;
            const float EyeZ = Hub.z + OrbitHeight;
            const float AimZ = Hub.z - 0.26f;                        // aim low, at the patch rather than the hub
            const float Flat = std::sqrt((Hub.x - EyeX) * (Hub.x - EyeX) + (Hub.y - EyeY) * (Hub.y - EyeY));
            Fixed.AssignSpatialLocation({ EyeX, EyeY, EyeZ });
            Fixed.AssignOrientationEuler(-std::atan2(EyeZ - AimZ, Flat),
                                         std::atan2(Hub.x - EyeX, Hub.y - EyeY), 0.0f);
            Fixed.AssignFieldOfView(46.0f);
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
    std::printf("[drive-scene] tyre: peak radial squash %.1f mm (%.1f%% of the %.0f mm tread radius), peak %u nodes in contact\n",
                static_cast<double>(PeakDeflection) * 1000.0,
                100.0 * static_cast<double>(PeakDeflection) / static_cast<double>(Configuration.Tyre.Radius),
                static_cast<double>(Configuration.Tyre.Radius) * 1000.0, PeakContactNodes);
    Check(Written > 8u, "the sequence carries more than eight frames");
    Check(PeakDeflection > 0.002f, "the XPBD carcass visibly squashed (>2 mm of radial deflection)");

    const float StaticTarget = Configuration.FrontStrut.StaticCompression;
    const float BumpFraction = StrutSamples ? static_cast<float>(OnBumpStop) / static_cast<float>(StrutSamples) : 1.0f;
    std::printf("[drive-scene] strut: rest %.1f mm (solved %.1f mm), travelled %.1f..%.1f mm, %.1f%% on the bump stop\n",
                static_cast<double>(RestStrut) * 1000.0, static_cast<double>(StaticTarget) * 1000.0,
                static_cast<double>(MinStrut) * 1000.0, static_cast<double>(MaxStrut) * 1000.0,
                static_cast<double>(BumpFraction) * 100.0);
    Check(std::fabs(RestStrut - StaticTarget) < 0.005f,
          "the car settled onto the ride height its own springs solve for (within 5 mm)");
    Check(BumpFraction < 0.25f, "the struts are springing, not riding their bump stops");
    Check(PeakDeflection < 0.5f * Configuration.Tyre.Radius, "the squash stayed physical (under half the tread radius)");
    Check(PeakContactNodes > 0u, "tread nodes reached the ground and formed a contact patch");
    Check(NonBlack == Written, "every frame carries light");

    // The motion gates below only mean anything for a driven sequence.  A still sheet freezes the sim on the
    // first moments of the run to hold one pose, so there is no stroke and no distance to assert; claiming
    // those gates passed would be a lie, and asserting them would fail a render that is behaving correctly.
    // --still states that intent explicitly rather than letting a short --freeze quietly weaken the suite.
    if (TyreLogFile != nullptr)
    {
        std::fclose(TyreLogFile);
        // The ringing summary, printed so a run says whether the carcass was quiet without opening the CSV.
        //    RMS RADIAL node speed is the wobble metric: it is zero for rigid rotation and for translation, so a
        //    settled tyre reads near zero however fast the car is going.
        std::printf("[drive-scene] tyre log: out-of-roundness %.2f mm total, %.2f mm away from the contact patch; "
                    "worst RMS radial node speed %.1f mm/s -> %s\n",
                    WorstSpread * 1000.0f, WorstOffPatch * 1000.0f, WorstRms * 1000.0f, TyreLog.c_str());
    }

    if (Scenario == "kerb")
    {
        std::printf("[drive-scene] kerb: car leaned to y = %.2f m (face at %.2f m), peak lateral reaction %.0f N\n",
                    static_cast<double>(PeakChassisY),
                    static_cast<double>(DC::KerbConstants::CentreY),
                    static_cast<double>(PeakKerbLateral));
        // Reaching the kerb at all is the precondition; the lateral reaction is the thing being proven. A
        //    heightfield ground query cannot produce one no matter how hard the car leans, because its contact
        //    normal is always +Z -- so a non-trivial −Y reaction IS the surface-query path working.
        Check(PeakChassisY > 1.6f, "the car actually reached the kerb");
        Check(PeakKerbLateral > 200.0f, "the kerb pushed back SIDEWAYS on the tyre (lateral reaction > 200 N)");
    }

    if (Still)
    {
        std::printf("[drive-scene] skip  3 motion gates (--still: one frozen pose, nothing is meant to move)\n");
    }
    else
    {
        Check(MaxStrut - MinStrut > 0.02f, "the suspension actually moved (>20 mm of stroke over the run)");
        Check(PeakSpeed > (Freeze > 0.0f ? 2.0f : 10.0f), "the vehicle actually drove");
        Check(Freeze > 0.0f || Chassis.Position.x > 20.0f, "the vehicle travelled down the course");
    }
    std::printf("[drive-scene] %u gates passed\n", g_Checks);
    return 0;
}
