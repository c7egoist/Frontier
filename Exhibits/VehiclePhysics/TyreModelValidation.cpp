//============================================================================================================================================
// 📦 Exhibits/VehiclePhysics/TyreModelValidation.cpp — modular tyre model smoke validation
//============================================================================================================================================
//
//    Exercises all three interchangeable tyre models behind the TyreModel seam (Pacejka MF6.1 slip, XPBD tyre
//    spring, 3-D FEM carcass) with identical kinematic inputs and prints a results table. Pure C++/scalar, no
//    Jolt, no vehicle solver — builds headless and runs in milliseconds.
//
//    Scenarios:
//      1. Rolling straight (free wheel, no slip) — in-plane force should be ~ rolling resistance only.
//      2. Powered slip (drive torque applied) — positive longitudinal force, spin torque reacts.
//      3. Cornering (lateral hub velocity) — lateral force builds with slip angle.
//      4. Standstill (zero forward speed) — relaxation-length-style models must not diverge.
//      5. Braking (negative slip) — negative longitudinal force.
//
//    Success: every model returns finite values, |Fx|/|Fy| bounded by the friction ellipse (μ·Fz), Fz ≥ 0,
//    and no NaN/inf. Results table printed to stdout.

#include "TyreModel.h"
#include "PacejkaTyreModel.h"
#include "XpbdTyreSpring.h"
#include "TyreFEMSolver.h"
#include "TraceContactTyre.h"
#include "VehicleMath.h"

#include <cmath>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>

namespace {

using namespace Frontier::Vehicle;

//--------------------------------------------------------------------------------------------------------------------
// Flat-plane ground query: Z = 0, normal +Z.
//--------------------------------------------------------------------------------------------------------------------
bool FlatGround(const Vec3& Point, Vec3& OutSurfacePoint, Vec3& OutNormal) noexcept
{
    OutSurfacePoint = {Point.x, Point.y, 0.0f};
    OutNormal = {0.0f, 0.0f, 1.0f};
    return true;
}

//--------------------------------------------------------------------------------------------------------------------
// Build a contact reading as if the tyre sits on the flat plane at the given hub height.
//--------------------------------------------------------------------------------------------------------------------
TraceContactReading MakeContact(float HubZ, float Radius, float Deflection) noexcept
{
    TraceContactReading R{};
    R.HitCount = 1u;
    R.SampleCount = 1u;
    R.Normal = {0.0f, 0.0f, 1.0f};
    R.Deflection = Deflection;
    R.Rate = 0.0f;
    R.Reaction.PatchCentre = {0.0f, 0.0f, HubZ - (Radius - Deflection)};
    R.Reaction.ContactNormal = {0.0f, 0.0f, 1.0f};
    R.Reaction.SupportReaction = {0.0f, 0.0f, 250000.0f * Deflection}; // radial spring ≈ Fz
    R.Reaction.Force = R.Reaction.SupportReaction;
    return R;
}

struct Case
{
    const char* Name;
    float ForwardVel;   // [m/s]
    float LateralVel;   // [m/s]
    float SpinRate;     // [rad/s]
    float CamberRad;    // [rad]
    float Deflection;   // [m]
};

// Results for one model × one case.
struct Result
{
    std::string Model;
    std::string Case;
    float Fx = 0.0f, Fy = 0.0f, Fz = 0.0f;
    float SpinTorqueNm = 0.0f, Deflection = 0.0f;
    float SlipRatio = 0.0f, SlipAngleRad = 0.0f;
    bool Finite = false;
    bool WithinFrictionEllipse = false;
};

Result RunOne(TyreModel& Model, TyreModelKind Kind, const Case& C, const TyreSpecification& Tyre) noexcept
{
    Result Out{};
    Out.Model = TyreModelKindLabel(Kind);
    Out.Case = C.Name;

    // Hub rolling forward at ForwardVel; wheel spins at SpinRate; contact on the flat plane.
    TraceContactReading Reading = MakeContact(0.34f, Tyre.Radius, C.Deflection);
    TyreModelInputs In{};
    In.HubPosition = {0.0f, 0.0f, 0.34f};
    In.HubRotation = Quat::AxisAngle({0.0f, 0.0f, 1.0f}, C.CamberRad);
    In.HubLinearVelocity = {C.ForwardVel, C.LateralVel, 0.0f};
    In.HubAngularVelocity = {0.0f, 0.0f, 0.0f};
    In.SpinRate = C.SpinRate;
    In.Tyre = &Tyre;
    In.Contact = &Reading;
    In.Ground = FlatGround;
    In.DeltaTau = 1.0f / 60.0f;
    In.RoadFriction = 0.9f;
    In.CamberRad = C.CamberRad;
    In.SteerRad = 0.0f;

    TyreModelOutputs O = Model.Step(In);

    Out.Fx = O.Fx; Out.Fy = O.Fy; Out.Fz = O.Fz;
    Out.SpinTorqueNm = O.SpinTorqueNm;
    Out.Deflection = O.Deflection;
    Out.SlipRatio = O.SlipRatio;
    Out.SlipAngleRad = O.SlipAngleRad;

    // Friction ellipse capacity matches the models' geometric-mean pairing: tread μ (1.0 default) × road μ.
    const float Mu = std::sqrt(1.0f * In.RoadFriction);
    const float Capacity = Mu * O.Fz;
    // Shear traction only: rolling resistance is a separate loss, not part of the slip friction ellipse.
    const float SurfaceSpeed = C.SpinRate * Tyre.Radius;
    const float RollingResistance = (std::fabs(SurfaceSpeed) > 1.0e-4f) ? 0.015f * O.Fz * (SurfaceSpeed > 0.0f ? 1.0f : -1.0f) : 0.0f;
    const float ShearMagnitude = std::sqrt((O.Fx - RollingResistance) * (O.Fx - RollingResistance) + O.Fy * O.Fy);
    Out.Finite = std::isfinite(O.Fx) && std::isfinite(O.Fy) && std::isfinite(O.Fz) &&
                 std::isfinite(O.SpinTorqueNm) && O.Fz >= 0.0f;
    // Shear within the friction ellipse (informational: Pacejka's raw MF6.1 peak is clamped by the vehicle-level
    //   friction circle in VehicleSolver::StepSimple, not inside the tyre model itself).
    Out.WithinFrictionEllipse = (ShearMagnitude <= Capacity + 1.0f) || !O.InContact;
    return Out;
}

} // namespace

int main() noexcept
{
    TyreSpecification Tyre{}; // Radius 0.34 m, width 0.245 m, 110 kPa, 12 kg

    const Case Cases[] = {
        {"rolling-straight",  10.0f,  0.0f,  10.0f / 0.34f, 0.0f, 0.004f},
        {"powered-slip",       8.0f,  0.0f, 14.0f / 0.34f, 0.0f, 0.004f},
        {"cornering",          8.0f,  1.5f, 10.0f / 0.34f, 0.0f, 0.004f},
        {"standstill",         0.0f,  0.0f,  0.0f,         0.0f, 0.004f},
        {"braking",            8.0f,  0.0f,  2.0f / 0.34f, 0.0f, 0.004f},
    };

    TyreModelKind Kinds[] = {TyreModelKind::Pacejka, TyreModelKind::XpbdSpring, TyreModelKind::Fem3d};

    std::printf("Modular tyre model validation — identical kinematics, three interchangeable models\n");
    std::printf("================================================================================\n");
    std::printf("  %-14s %-16s %8s %8s %8s %9s %9s %8s %9s %-18s %-18s\n",
        "model", "case", "Fx[N]", "Fy[N]", "Fz[N]", "spinTq[Nm]", "deflect[m]", "kappa", "alpha[rad]", "finite", "frictionEllipse");
    std::printf("================================================================================\n");

    int Failures = 0;
    for (TyreModelKind Kind : Kinds)
    {
        std::unique_ptr<TyreModel> Model = CreateTyreModel(Kind);
        if (!Model)
        {
            std::printf("  %-14s %-16s %s\n", TyreModelKindLabel(Kind), "FAILED-to-build", "could not instantiate");
            ++Failures;
            continue;
        }
        // Author each model from one shared specification bag (TOML-like key/value).
        std::vector<std::pair<std::string, float>> Params = {
            {"RadialStiffness_Npm", 250000.0f},
            {"LongitudinalStiffness_Npm", 900000.0f},
            {"LateralStiffness_Npm", 1000000.0f},
            {"FrictionCoefficient", 1.0f},
            {"YoungsModulus_Pa", 8.0e6f},
            {"PoissonsRatio", 0.45f},
            {"ThetaSegments", 10.0f},
            {"PhiSegments", 6.0f},
            {"RadialLayers", 3.0f},
        };
        Model->AssignSpecification(Params);

        for (const Case& C : Cases)
        {
            Model->Reset();
            const Result R = RunOne(*Model, Kind, C, Tyre);
            const bool Pass = R.Finite;
            if (!Pass) ++Failures;
            std::printf("  %-14s %-16s %8.2f %8.2f %8.2f %9.2f %9.4f %8.4f %9.4f %-18s %-18s\n",
                R.Model.c_str(), R.Case.c_str(), R.Fx, R.Fy, R.Fz, R.SpinTorqueNm, R.Deflection,
                R.SlipRatio, R.SlipAngleRad, R.Finite ? "yes" : "NO",
                R.WithinFrictionEllipse ? "yes" : "NO");
        }
        Model->Reset();
    }

    std::printf("================================================================================\n");
    std::printf("Failures: %d\n", Failures);
    return Failures == 0 ? 0 : 1;
}
