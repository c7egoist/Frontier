//============================================================================================================================================
// 📦 Frontier/PhysicalDynamics/Vehicle/PacejkaTyreModel.cpp — Pacejka MF6.1 behind the modular TyreModel seam
//============================================================================================================================================
// See PacejkaTyreModel.h. The adapter converts TyreModelInputs (hub kinematics + contact) into the
//   WheelKinematics the Pacejka slip solver expects, runs the validated MF6.1 evaluator, and maps the result
//   back onto TyreModelOutputs. Vertical load Fz is taken from the contact reading (strut + tyre radial
//   spring) so the Pacejka path stays consistent with the rest of the vehicle layer.

#include "PacejkaTyreModel.h"

#include <algorithm>
#include <cmath>

namespace Frontier::Vehicle {

namespace {
//--------------------------------------------------------------------------------------------------------------------
// Wheel forward/lateral axes in world from the hub rotation + contact normal.
//--------------------------------------------------------------------------------------------------------------------
void WheelAxes(const Quat& HubRotation, const Vec3& ContactNormal, Vec3& OutForward, Vec3& OutLateral) noexcept
{
    const Vec3 WorldUp{0.0f, 0.0f, 1.0f};
    Vec3 Normal = (ContactNormal.LengthSq() > 1.0e-6f) ? ContactNormal.Normalized() : WorldUp;
    Vec3 RawForward = HubRotation.Rotate({1.0f, 0.0f, 0.0f});
    OutForward = (RawForward - Normal * Dot(RawForward, Normal)).Normalized();
    OutLateral = Cross(Normal, OutForward).Normalized();
}
} // namespace

//--------------------------------------------------------------------------------------------------------------------
PacejkaTyreModel::PacejkaTyreModel() noexcept : TyreModel(TyreModelKind::Pacejka)
{
    // Prepare() (→ coefficient cache) must run before the first force evaluation; defaults mirror Phase-1.
    Formula.AssignParameters(PacejkaParameters{});
}

void PacejkaTyreModel::AssignSpecification(const std::vector<std::pair<std::string, float>>& Parameters) noexcept
{
    for (const auto& Pair : Parameters)
    {
        const std::string& Key = Pair.first;
        const float Value = Pair.second;
        if (Key == "EffectiveRadius_m") EffectiveRadius = Value;
        // Every other key is forwarded to the Pacejka parameter sheet by name where it matches.
        else if (Key == "Fz0") { auto P = Formula.QueryParameters(); P.Fz0 = Value; Formula.AssignParameters(P); }
        else if (Key == "Lx") { auto P = Formula.QueryParameters(); P.Lx = Value; Formula.AssignParameters(P); }
        else if (Key == "Ly") { auto P = Formula.QueryParameters(); P.Ly = Value; Formula.AssignParameters(P); }
        else if (Key == "Ltr") { auto P = Formula.QueryParameters(); P.Ltr = Value; Formula.AssignParameters(P); }
        else if (Key == "MuLoadSensitivityLong") { auto P = Formula.QueryParameters(); P.MuLoadSensitivityLong = Value; Formula.AssignParameters(P); }
        else if (Key == "MuLoadSensitivityLat") { auto P = Formula.QueryParameters(); P.MuLoadSensitivityLat = Value; Formula.AssignParameters(P); }
        else if (Key == "MuLoadMinFactor") { auto P = Formula.QueryParameters(); P.MuLoadMinFactor = Value; Formula.AssignParameters(P); }
        else if (Key == "RelaxationLengthLong") { auto P = Formula.QueryParameters(); P.RelaxationLengthLong = Value; Formula.AssignParameters(P); }
        else if (Key == "RelaxationLengthLat") { auto P = Formula.QueryParameters(); P.RelaxationLengthLat = Value; Formula.AssignParameters(P); }
        // Unrecognised keys are silently ignored so one TOML can serve every tyre model.
    }
}

//--------------------------------------------------------------------------------------------------------------------
void PacejkaTyreModel::Reset() noexcept
{
    State = SlipState{};
}

//--------------------------------------------------------------------------------------------------------------------
TyreModelOutputs PacejkaTyreModel::Step(const TyreModelInputs& Inputs) noexcept
{
    TyreModelOutputs Out{};
    if (Inputs.DeltaTau <= 0.0f || Inputs.Tyre == nullptr) return Out;

    const float Radius = (EffectiveRadius > 1.0e-4f) ? EffectiveRadius : Inputs.Tyre->Radius;

    // Wheel axes in world.
    Vec3 Forward{}, Lateral{};
    WheelAxes(Inputs.HubRotation, (Inputs.Contact != nullptr) ? Inputs.Contact->Normal : Vec3{0,0,1}, Forward, Lateral);

    // Vertical load: contact reading first (strut + tyre radial spring), then a radial-spring estimate.
    float Fz_N = 0.0f;
    if (Inputs.Contact != nullptr && Inputs.Contact->HitCount > 0u)
        Fz_N = Inputs.Contact->Reaction.SupportReaction.Length();
    if (Fz_N <= 0.0f)
    {
        const float Deflection = (Inputs.Contact != nullptr) ? std::max(0.0f, Inputs.Contact->Deflection) : 0.0f;
        Fz_N = 250000.0f * Deflection; // [N] nominal carcass radial spring (matches TraceContactTyre default)
    }

    // Slip kinematics at the patch.
    const float ForwardVel = Dot(Inputs.HubLinearVelocity, Forward);
    const float LateralVel = Dot(Inputs.HubLinearVelocity, Lateral);
    const float SurfaceSpeed = Inputs.SpinRate * Radius;
    const WheelKinematics K{
        ForwardVel,      // Vx [m/s] hub longitudinal velocity
        LateralVel,      // Vsy [m/s] lateral slip velocity
        SurfaceSpeed,    // OmegaR [m/s] wheel spin surface speed
        Inputs.CamberRad,// [rad]
        Fz_N,            // [N] vertical load
    };

    // Run the validated slip solver. RelaxationLength is the default (zero-speed stable).
    const SlipResult Result = Slip.Step(K, State, Inputs.DeltaTau);

    // Map to wheel-frame outputs.
    Out.Fx = Result.Forces.Fx;             // [N] longitudinal
    Out.Fy = Result.Forces.Fy;             // [N] lateral
    Out.Fz = Fz_N;                         // [N] vertical load
    Out.SpinTorqueNm = -Result.Forces.Fx * Radius; // [N·m] ground reaction on the spin
    Out.SelfAligningTorqueNm = Result.Forces.Mz;   // [N·m]
    Out.SlipRatio = Result.Kappa;
    Out.SlipAngleRad = Result.AlphaRad;
    Out.Deflection = (Inputs.Contact != nullptr) ? Inputs.Contact->Deflection : 0.0f;
    Out.ContactNormal = (Inputs.Contact != nullptr) ? Inputs.Contact->Normal : Vec3{0,0,1};
    Out.ContactPatch = (Inputs.Contact != nullptr) ? Inputs.Contact->Reaction.PatchCentre : Inputs.HubPosition;
    Out.ContactCount = (Inputs.Contact != nullptr) ? Inputs.Contact->HitCount : 0u;
    Out.InContact = Out.ContactCount > 0u && Fz_N > 1.0f;
    return Out;
}

} // namespace Frontier::Vehicle
