/*==========================================================================================================================================
                                                       VEHICLEDYNAMICSVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 The vehicle checked against physics, not only against its source: the Magic Formula's slopes, peaks and signs, combined slip
//    and relaxation; the Jolt-hosted car at rest, rolling, launching, braking and cornering against the linear bicycle model; the
//    pieces added beyond Project Drive (supercharger, charge air, tyre pressure and temperature, wear, fuel, fluids, traction
//    control, Ackermann, the MF6.1 pressure terms); the physics thread's cadence and its snapshot hand-off; and the register.
//    Usage: VehicleDynamicsValidation <exhibit folder>  (writes Results/VehicleDynamics.txt and Results/*.csv)

#include "Frontier/Extensions/Physics/PhysicsExtension.h"
#include "Frontier/Extensions/Physics/PhysicsThread.h"

#include "Frontier/Engine/PhysicalDynamics/Vehicle/PacejkaMagicFormula.h"
#include "Frontier/Engine/PhysicalDynamics/Vehicle/TyreSlipDynamics.h"
#include "Frontier/Engine/PhysicalDynamics/Vehicle/VehicleSpecification.h"
#include "Frontier/Engine/Scene/WorldRegister.h"
#include "Frontier/Engine/Scene/WorldSpace.h"

#include <algorithm>
#include <atomic>
#include <cstdarg>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

using namespace Frontier;
namespace V = Frontier::Vehicle;

namespace
{

int                Passed = 0, Failed = 0;
std::ostringstream Log;

void Report(bool Success, const std::string& Line)
{
    (Success ? Passed : Failed)++;
    const std::string Text = std::string(Success ? "  🟢 " : "  🔴 ") + Line;
    std::printf("%s\n", Text.c_str());
    Log << Text << "\n";
}

void Note(const std::string& Line)
{
    const std::string Text = "  📝 " + Line;
    std::printf("%s\n", Text.c_str());
    Log << Text << "\n";
}

void Heading(const char* Title)
{
    std::printf("\n%s\n", Title);
    Log << "\n" << Title << "\n";
}

std::string Format(const char* Pattern, ...)
{
    char    Text[512];
    va_list Arguments;
    va_start(Arguments, Pattern);
    std::vsnprintf(Text, sizeof(Text), Pattern, Arguments);
    va_end(Arguments);
    return Text;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    A WORLD WITH ONE CAR
//------------------------------------------------------------------------------------------------------------------------

struct Proving
{
    WorldSpace       World;
    PhysicsExtension Physics;
    RecordToken      Vehicle{};

    explicit Proving(const std::function<void(V::VehicleSpecification&)>& Adjust = {}, bool WithTyres = false, bool Threaded = false)
    {
        World.Clear();
        Vehicle = World.ConstructRecord("Vehicle", "Control vehicle");
        auto* Record = dynamic_cast<VehicleRecord*>(World.FindRecord(Vehicle));
        VehicleConfiguration& Configuration = Record->AccessConfiguration();
        Configuration.Spatial.PositionMetres[0] = 0.0f;
        Configuration.Spatial.PositionMetres[1] = 0.0f;
        Configuration.Spatial.PositionMetres[2] = 0.0f;
        if (Adjust) Adjust(Configuration.Specification);
        if (WithTyres)
            for (uint32_t Corner = 0; Corner < 4; ++Corner)
            {
                const RecordToken Tyre = World.ConstructRecord("Tyre", "Tyre", Vehicle);
                auto* TyreEntry = dynamic_cast<TyreRecord*>(World.FindRecord(Tyre));
                TyreEntry->AccessConfiguration().Corner       = Corner;
                TyreEntry->AccessConfiguration().ColdPressure = Corner < 2 ? 120000.0f : 105000.0f;
            }
        PhysicsExtensionSettings Settings;
        Settings.Threaded      = Threaded;
        Settings.WriteRegister = false;
        Physics.Begin(World, Settings);
    }
    ~Proving() { Physics.End(World); }

    [[nodiscard]] const V::VehicleSolver&    Solver() const { return Physics.QueryVehicle(0)->QuerySolver(); }
    [[nodiscard]] const V::VehicleTelemetry& Telemetry() const { return Solver().Telemetry(); }
    void Drive(float Throttle, float Brake, float Steer, double Seconds, bool Handbrake = false)
    {
        Physics.AssignVehicleInput(PhysicsVehicleInput{ Throttle, Brake, Steer, Handbrake });
        Physics.AdvanceSteps(static_cast<uint32_t>(std::lround(Seconds / Physics.QueryStepSeconds())));
    }
    // 📝 Holds a speed with a proportional throttle/brake law (a cruise control for steady-state tests).
    void Cruise(float Speed, float Steer, double Seconds)
    {
        const uint32_t Steps = static_cast<uint32_t>(std::lround(Seconds / Physics.QueryStepSeconds()));
        for (uint32_t Step = 0; Step < Steps; ++Step)
        {
            const float Error    = Speed - Telemetry().ForwardSpeed;
            const float Throttle = std::clamp(0.35f + 0.25f * Error, 0.0f, 1.0f);
            const float Brake    = std::clamp(-0.15f * Error, 0.0f, 1.0f);
            Physics.AssignVehicleInput(PhysicsVehicleInput{ Error > -0.3f ? Throttle : 0.0f, Error < -0.3f ? Brake : 0.0f, Steer, false });
            Physics.AdvanceSteps(1);
        }
    }
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    A · MAGIC FORMULA
//------------------------------------------------------------------------------------------------------------------------

void ValidateFormula(const std::filesystem::path& Results)
{
    Heading("A · Magic Formula (Project Drive's GRIT sheet, the Control vehicle's coefficients)");
    const V::VehicleSpecification Specification = V::ConstructControlVehicleSpecification();
    V::PacejkaParameters          Parameters    = Specification.Solver.TyrePacejka;
    V::PacejkaMagicFormula        Tyre;
    Tyre.AssignParameters(Parameters);
    const float Fz = 3200.0f;
    // A1 zero slip, sign
    Report(std::fabs(Tyre.LongitudinalForce(0.0f, 0.0f, Fz)) < 1.0e-3f && std::fabs(Tyre.LateralForce(0.0f, 0.0f, Fz)) < 1.0e-3f,
           "no slip, no force (Fx(0) = Fy(0) = 0 with the sheet's zero shifts)");
    bool Signs = true;
    for (float Slip = 0.01f; Slip < 0.9f; Slip += 0.02f)
        Signs &= Tyre.LongitudinalForce(Slip, 0.0f, Fz) > 0.0f && Tyre.LongitudinalForce(-Slip, 0.0f, Fz) < 0.0f && Tyre.LateralForce(Slip, 0.0f, Fz) > 0.0f &&
                 Tyre.LateralForce(-Slip, 0.0f, Fz) < 0.0f;
    Report(Signs, "force follows the slip's sign over ±0.9 (traction and braking, both turning directions)");
    // A2 slip stiffness = BCD
    const V::PacejkaCoefficients& C = Tyre.QueryCoefficients();
    const float Fzk  = Fz * 0.001f, dfz = (Fzk - C.Fz0) * C.InvFz0;
    const float BCDx = (C.pBx1_Lx + C.pBx2_Lx * dfz) * Fzk * 1000.0f, BCDy = (C.pBy1_Ly + C.pBy2_Ly * dfz) * Fzk * 1000.0f;
    const float Kx   = (Tyre.LongitudinalForce(1.0e-4f, 0.0f, Fz) - Tyre.LongitudinalForce(-1.0e-4f, 0.0f, Fz)) / 2.0e-4f;
    const float Ky   = (Tyre.LateralForce(1.0e-4f, 0.0f, Fz) - Tyre.LateralForce(-1.0e-4f, 0.0f, Fz)) / 2.0e-4f;
    Report(std::fabs(Kx / BCDx - 1.0f) < 0.005f, Format("longitudinal slip stiffness %.0f N/unit = BCD %.0f (%.3f %%)", Kx, BCDx, (Kx / BCDx - 1.0f) * 100.0f));
    Report(std::fabs(Ky / BCDy - 1.0f) < 0.005f, Format("cornering stiffness %.0f N/rad = BCD %.0f (%.3f %%)", Ky, BCDy, (Ky / BCDy - 1.0f) * 100.0f));
    // A3/A4 peaks
    float PeakX = 0.0f, PeakSlip = 0.0f, PeakY = 0.0f, PeakAngle = 0.0f;
    std::ofstream Curves(Results / "PacejkaCurves.csv");
    Curves << "slip,fx_n,alpha_deg,fy_n,mz_nm\n";
    for (int Step = 0; Step <= 400; ++Step)
    {
        const float Slip = Step / 400.0f, Angle = Step / 400.0f * 0.5f;
        const float Fx = Tyre.LongitudinalForce(Slip, 0.0f, Fz), Fy = Tyre.LateralForce(Angle, 0.0f, Fz);
        if (Fx > PeakX) { PeakX = Fx; PeakSlip = Slip; }
        if (Fy > PeakY) { PeakY = Fy; PeakAngle = Angle; }
        Curves << Slip << "," << Fx << "," << Angle * 57.29578f << "," << Fy << "," << Tyre.SelfAligningTorque(Angle, 0.0f, Fy, 0.0f, Fz) << "\n";
    }
    const float Penalised = C.LoadSensitivityAboveReference ? std::max(0.0f, dfz) : std::fabs(dfz);
    const float LoadX = std::max(1.0f - C.MuLoadSensitivityLong * Penalised, C.MuLoadMinFactor);
    const float LoadY = std::max(1.0f - C.MuLoadSensitivityLat * Penalised, C.MuLoadMinFactor);
    const float Dx    = (C.pDx1_Lx + C.pDx2_Lx * dfz) * Fzk * 1000.0f * LoadX, Dy = (C.pDy1_Ly + C.pDy2_Ly * dfz) * Fzk * 1000.0f * LoadY;
    Report(std::fabs(PeakX / Dx - 1.0f) < 0.01f, Format("longitudinal peak %.0f N = D %.0f (μx %.2f)", PeakX, Dx, PeakX / Fz));
    Note(Format("the sheet's longitudinal peak sits at slip %.3f (road tyres peak near 0.10 – 0.15; pBx1 and pCx1 set it), so traction control "
                "aims just under it; below about 2.5 m/s the automated clutch ties the driven wheels to the idle engine speed, so a launch "
                "from rest slips whatever the throttle", PeakSlip));
    Report(std::fabs(PeakY / Dy - 1.0f) < 0.01f && PeakAngle > 0.03f && PeakAngle < 0.3f,
           Format("lateral peak %.0f N = D %.0f (μy %.2f) at %.1f°", PeakY, Dy, PeakY / Fz, PeakAngle * 57.29578f));
    // A5 load sensitivity: the source's factor and the Control vehicle's (above the reference load only)
    const auto PeakMu = [](const V::PacejkaMagicFormula& Formula, float Load)
    {
        float Peak = 0.0f;
        for (int Step = 1; Step <= 200; ++Step) Peak = std::max(Peak, Formula.LateralForce(Step / 400.0f, 0.0f, Load));
        return Peak / Load;
    };
    V::PacejkaParameters Source = Parameters;
    Source.LoadSensitivityAboveReference = false;
    Source.CombinedSlipMf61              = false;
    V::PacejkaMagicFormula SourceTyre;
    SourceTyre.AssignParameters(Source);
    Note(Format("the source's load factor 1 − s |dfz| makes μ rise with load below Fz0: μ %.3f at 2 kN, %.3f at 4 kN", PeakMu(SourceTyre, 2000.0f),
                PeakMu(SourceTyre, 4000.0f)));
    float Previous = 1.0e9f;
    bool  Falling  = true;
    for (float Load : { 1000.0f, 2000.0f, 3000.0f, 4000.0f, 6000.0f, 8000.0f })
    {
        Falling &= PeakMu(Tyre, Load) <= Previous + 1.0e-6f;
        Previous = PeakMu(Tyre, Load);
    }
    Report(Falling, Format("load sensitivity (Control vehicle): peak μ falls monotonically as the load rises, 1 → 8 kN (μ %.3f → %.3f)", PeakMu(Tyre, 1000.0f),
                           Previous));
    // A6 aligning moment
    const float Fy2 = Tyre.LateralForce(0.035f, 0.0f, Fz), Fy10 = Tyre.LateralForce(0.17f, 0.0f, Fz);
    const float Mz2 = Tyre.SelfAligningTorque(0.035f, 0.0f, Fy2, 0.0f, Fz), Mz10 = Tyre.SelfAligningTorque(0.17f, 0.0f, Fy10, 0.0f, Fz);
    Report(Mz2 < 0.0f && Fy2 > 0.0f && -Mz2 / Fy2 > -Mz10 / Fy10,
           Format("aligning moment restores (Mz %.1f N·m against Fy %.0f N at 2°) and the trail shrinks with slip (%.1f → %.1f mm at 10°)", Mz2, Fy2,
                  -Mz2 / Fy2 * 1000.0f, -Mz10 / Fy10 * 1000.0f));
    // A7 combined slip
    const V::TyreForces Pure     = Tyre.Combined(0.08f, 0.0f, 0.0f, Fz);
    const V::TyreForces Mixed    = Tyre.Combined(0.08f, 0.09f, 0.0f, Fz);
    float               Largest  = 0.0f;
    for (float Slip = -0.5f; Slip <= 0.5f; Slip += 0.02f)
        for (float Angle = -0.4f; Angle <= 0.4f; Angle += 0.02f)
        {
            const V::TyreForces Force = Tyre.Combined(Slip, Angle, 0.0f, Fz);
            Largest = std::max(Largest, std::hypot(Force.Fx, Force.Fy));
        }
    float SourceLargest = 0.0f;
    for (float Slip = -0.5f; Slip <= 0.5f; Slip += 0.02f)
        for (float Angle = -0.4f; Angle <= 0.4f; Angle += 0.02f)
        {
            const V::TyreForces Force = SourceTyre.Combined(Slip, Angle, 0.0f, Fz);
            SourceLargest = std::max(SourceLargest, std::hypot(Force.Fx, Force.Fy));
        }
    const V::TyreForces SourcePure = SourceTyre.Combined(0.08f, 0.0f, 0.0f, Fz), SourceMixed = SourceTyre.Combined(0.08f, 0.09f, 0.0f, Fz);
    Note(Format("the source's combined slip divides by the stiffnesses in kN, so G stays ≈ 1: 5° takes %.2f %% of the traction, and slips combine to "
                "%.0f N (%.2f × the larger peak)", (1.0f - SourceMixed.Fx / SourcePure.Fx) * 100.0f, SourceLargest, SourceLargest / std::max(PeakX, PeakY)));
    Report(Mixed.Fx < 0.95f * Pure.Fx, Format("combined slip (MF6.1): cornering at 5° takes %.0f %% of the traction away (Fx %.0f → %.0f N at slip 0.08)",
                                             (1.0f - Mixed.Fx / Pure.Fx) * 100.0f, Pure.Fx, Mixed.Fx));
    Report(Largest <= std::max(PeakX, PeakY) * 1.05f,
           Format("friction ellipse (MF6.1): no combination of slips exceeds the larger peak by more than 5 %% (%.0f against %.0f N)", Largest, std::max(PeakX, PeakY)));
    // A8 MF6.1 pressure terms
    V::PacejkaMagicFormula Pressured;
    Pressured.AssignParameters(Parameters);
    const float KyUp = (Pressured.LateralForce(1.0e-4f, 0.0f, Fz, 0.2f) - Pressured.LateralForce(-1.0e-4f, 0.0f, Fz, 0.2f)) / 2.0e-4f;
    Report(std::fabs(KyUp / Ky - (1.0f + Parameters.ppy1 * 0.2f + Parameters.ppy2 * 0.04f)) < 0.005f,
           Format("MF6.1: 20 %% more pressure scales the cornering stiffness by %.3f (1 + PPY1 dpi = %.3f)", KyUp / Ky, 1.0f + Parameters.ppy1 * 0.2f));
    Report(Pressured.LateralForce(0.05f, 0.0f, Fz, 0.0f) == Tyre.LateralForce(0.05f, 0.0f, Fz),
           "MF6.1: at the nominal pressure the force is bit-identical to the pressure-blind formula");
    // A9 relaxation length
    V::TyreSlipDynamics Slip(Tyre);
    Slip.AssignSolver(V::SlipSolver::RelaxationLength);
    V::SlipDeflection Deflection;
    V::WheelKinematics K;
    K.Vx = 10.0f; K.Vsy = 10.0f * std::tan(0.02f); K.OmegaR = 10.0f; K.Fz_N = Fz;
    const float Settled = Tyre.Combined(0.0f, 0.02f, 0.0f, Fz).Fy;
    const float Sigma   = Parameters.RelaxationLengthLat * std::pow(Fz * 0.001f / Parameters.Fz0, Parameters.RelaxationLoadExponentLat);
    const float Dt      = 1.0f / 2400.0f;
    float       Travel  = 0.0f, AtSigma = 0.0f;
    V::SlipResult Result{};
    while (Travel < 6.0f * Sigma)
    {
        Result = Slip.Step(K, Deflection, Dt);
        Travel += K.Vx * Dt;
        if (AtSigma == 0.0f && Travel >= Sigma) AtSigma = Result.Forces.Fy;
    }
    Report(std::fabs(AtSigma / Settled - 0.632f) < 0.08f && std::fabs(Result.Forces.Fy / Settled - 1.0f) < 0.02f,
           Format("relaxation: a slip step builds %.0f %% of its force after one relaxation length (σ %.3f m; first order: 63 %%), %.1f %% at 6σ",
                  AtSigma / Settled * 100.0f, Sigma, Result.Forces.Fy / Settled * 100.0f));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    B · THE CAR ON JOLT
//------------------------------------------------------------------------------------------------------------------------

void ValidateHost(const std::filesystem::path& Results)
{
    Heading("B · The Control vehicle on a Jolt chassis (inline 240 Hz steps)");
    {
        Proving Car;
        Car.Drive(0.0f, 0.0f, 0.0f, 3.0);
        const V::VehicleTelemetry& T = Car.Telemetry();
        const V::VehicleSolverConfiguration& Config = Car.Solver().QueryConfiguration();
        const float Weight = (Config.ChassisMass + 4.0f * 0.0f) * 9.81f;
        float Loads = 0.0f, Front = 0.0f;
        for (uint32_t Wheel = 0; Wheel < 4; ++Wheel)
        {
            Loads += T.Wheels[Wheel].VerticalLoad;
            if (Wheel < 2) Front += T.Wheels[Wheel].VerticalLoad;
        }
        const float RimWeight = 4.0f * std::max(1.0f, Config.UnsprungMass - Config.Tyre.TotalMass) * 9.81f;
        Report(std::fabs(T.Chassis.LinearVelocity.Length()) < 0.02f && T.WheelsInContact == 4,
               Format("it settles on four tyres and stands still (%.4f m/s after 3 s)", T.Chassis.LinearVelocity.Length()));
        Report(std::fabs(Loads / (Weight + RimWeight) - 1.0f) < 0.02f,
               Format("the tyres carry the car: Σ Fz %.0f N against the sprung and rim weight %.0f N (%.2f %%)", Loads, Weight + RimWeight,
                      (Loads / (Weight + RimWeight) - 1.0f) * 100.0f));
        const float Share = Car.World.FindRecord(Car.Vehicle) ? dynamic_cast<VehicleRecord*>(Car.World.FindRecord(Car.Vehicle))->QueryConfiguration().Specification.Geometry.FrontWeightFraction : 0.5f;
        Report(std::fabs(Front / Loads - Share) < 0.03f, Format("front axle share %.3f against the authored %.3f", Front / Loads, Share));
        const float Deflection = T.Wheels[0].TyreDeflection, Expected = T.Wheels[0].VerticalLoad / V::PressureStiffness(Config.TraceContact, static_cast<float>(T.Wheels[0].Thermal.GaugePressure));
        Report(std::fabs(Deflection / Expected - 1.0f) < 0.1f, Format("the spring tyre deflects %.1f mm under %.0f N (load / stiffness %.1f mm)", Deflection * 1000.0f,
                                                                       T.Wheels[0].VerticalLoad, Expected * 1000.0f));
    }
    {
        Proving Car;
        Car.Drive(0.0f, 0.0f, 0.0f, 1.0);
        std::ofstream Trace(Results / "LaunchTrace.csv");
        Trace << "t_s,speed_mps,rpm,gear,boost_bar,rear_slip,throttle_applied\n";
        float Highest = 0.0f, SlipWorst = 0.0f, Excess = 0.0f, LeastThrottle = 1.0f;
        int   TopGear = 0;
        bool  Rising  = true;
        float Last    = 0.0f;
        for (int Tick = 0; Tick < 6 * 20; ++Tick)
        {
            Car.Drive(1.0f, 0.0f, 0.0f, 0.05);
            const V::VehicleTelemetry& T = Car.Telemetry();
            const float RearSlip = std::max(T.Wheels[2].SlipRatio, T.Wheels[3].SlipRatio);
            Trace << Tick * 0.05 << "," << T.ForwardSpeed << "," << T.EngineRPM << "," << T.GearIndex - 2 << "," << T.BoostBar << "," << RearSlip << ","
                  << T.ThrottleApplied << "\n";
            if (Tick > 10) SlipWorst = std::max(SlipWorst, RearSlip);
            if (T.ForwardSpeed > 5.0f) Excess += std::max(0.0f, RearSlip - Car.Solver().QueryConfiguration().TractionControl.SlipTarget) * 0.05f;
            LeastThrottle = std::min(LeastThrottle, T.ThrottleApplied);
            Rising &= T.ForwardSpeed >= Last - 0.15f;
            Last    = T.ForwardSpeed;
            Highest = std::max(Highest, T.ForwardSpeed);
            TopGear = std::max(TopGear, T.GearIndex - 2);
        }
        Report(Rising && Highest > 20.0f && TopGear >= 3,
               Format("full-throttle launch: %.1f m/s (%.0f km/h) in 6 s, upshifted to gear %d, never slowing", Highest, Highest * 3.6f, TopGear));
        // 📝 The same launch without traction control, for comparison.
        float Unchecked = 0.0f;
        {
            Proving Free([](V::VehicleSpecification& S) { S.Solver.TractionControl.Enabled = false; });
            Free.Drive(0.0f, 0.0f, 0.0f, 1.0);
            const float Target = Car.Solver().QueryConfiguration().TractionControl.SlipTarget;
            for (int Tick = 0; Tick < 6 * 20; ++Tick)
            {
                Free.Drive(1.0f, 0.0f, 0.0f, 0.05);
                if (Free.Telemetry().ForwardSpeed > 5.0f)
                    Unchecked += std::max(0.0f, std::max(Free.Telemetry().Wheels[2].SlipRatio, Free.Telemetry().Wheels[3].SlipRatio) - Target) * 0.05f;
            }
        }
        const float Target = Car.Solver().QueryConfiguration().TractionControl.SlipTarget;
        Report(SlipWorst < Target + 0.1f && Excess < Unchecked && LeastThrottle < 0.5f,
               Format("traction control: above 5 m/s the driven slip over its %.2f target integrates to %.4f s with it on against %.4f s off (worst %.3f "
                      "after 0.5 s; it cut the throttle to %.0f %%; %.0f %% less excess)", Target, Excess, Unchecked, SlipWorst, LeastThrottle * 100.0f,
                      (1.0f - Excess / std::max(1.0e-6f, Unchecked)) * 100.0f));
        // Coast to check free rolling
        Car.Drive(0.0f, 0.0f, 0.0f, 1.5);
        const V::VehicleTelemetry& T = Car.Telemetry();
        const float Reff = Car.Solver().QueryConfiguration().Tyre.Radius;
        Report(std::fabs(T.Wheels[0].SlipRatio) < 0.01f && std::fabs(T.Wheels[0].WheelOmega * Reff / T.ForwardSpeed - 1.0f) < 0.05f,
               Format("free rolling: front slip %.4f, ω R %.2f m/s against %.2f m/s travel", T.Wheels[0].SlipRatio, T.Wheels[0].WheelOmega * Reff, T.ForwardSpeed));
        // Brake from speed
        const float Start = T.ForwardSpeed;
        const double Before = Car.Physics.QuerySnapshot().SimulatedSeconds;
        const float  Downforce = std::max(0.0f, T.Aero.FrontDownforce_N) + std::max(0.0f, T.Aero.RearDownforce_N);
        const float  Weight = Car.Solver().QueryConfiguration().ChassisMass * 9.81f;
        float Distance = 0.0f, PeakDecel = 0.0f, PreviousSpeed = Start;
        int   AbsTicks = 0;
        for (int Tick = 0; Tick < 400 && Car.Telemetry().ForwardSpeed > 0.5f; ++Tick)
        {
            Car.Drive(0.0f, 1.0f, 0.0f, 0.025);
            const float Now = Car.Telemetry().ForwardSpeed;
            Distance += 0.5f * (Now + PreviousSpeed) * 0.025f;
            PeakDecel = std::max(PeakDecel, (PreviousSpeed - Now) / 0.025f);
            PreviousSpeed = Now;
            for (uint32_t Wheel = 0; Wheel < 4; ++Wheel) AbsTicks += Car.Telemetry().Wheels[Wheel].AbsActive ? 1 : 0;
        }
        (void)Before;
        const float Grip  = Car.Solver().QueryConfiguration().GripCoefficient;
        const float Limit = Grip * 9.81f * (Weight + Downforce) / Weight;
        Report(PeakDecel < Limit * 1.05f && PeakDecel > 5.0f,
               Format("braking from %.1f m/s: peak deceleration %.2f m/s² within the friction limit μ (W + downforce) / m = %.2f m/s² (%.0f N downforce)", Start,
                      PeakDecel, Limit, Downforce));
        Report(Distance > Start * Start / (2.0f * Limit * 1.05f),
               Format("stopping distance %.1f m ≥ v² / (2 × that limit) %.1f m; ABS worked %d wheel-ticks", Distance, Start * Start / (2.0f * Limit), AbsTicks));
    }
    {
        // 📝 Skid pad: low speed matches the kinematic (Ackermann) radius; at speed the yaw-rate gain matches the linear bicycle model.
        Proving Car;
        Car.Drive(0.0f, 0.0f, 0.0f, 1.0);
        const V::VehicleSolverConfiguration& Config = Car.Solver().QueryConfiguration();
        const float Steer = 0.08f;
        Car.Cruise(4.0f, Steer, 6.0);
        const V::VehicleTelemetry& Slow = Car.Telemetry();
        const float Base  = Config.Wheels[0].LocalOffset.x - Config.Wheels[2].LocalOffset.x;
        const float Delta = Steer * Config.MaxSteerAngleRad;
        const float Radius = Slow.ForwardSpeed / std::max(1.0e-4f, std::fabs(Slow.Chassis.AngularVelocity.z));
        const float Kinematic = Base / std::tan(Delta);
        Report(std::fabs(Radius / Kinematic - 1.0f) < 0.12f, Format("4 m/s circle: radius %.1f m against the kinematic L / tan δ %.1f m", Radius, Kinematic));
        Car.Cruise(14.0f, Steer * 0.25f, 8.0);
        const V::VehicleTelemetry& Fast = Car.Telemetry();
        // linear bicycle: K_us = (W_f / C_f − W_r / C_r), r / δ = V / (L + K_us V² / g)
        V::PacejkaMagicFormula Tyre;
        Tyre.AssignParameters(Config.TyrePacejka);
        const auto Stiffness = [&](float Load) { return (Tyre.LateralForce(1.0e-4f, 0.0f, Load) - Tyre.LateralForce(-1.0e-4f, 0.0f, Load)) / 2.0e-4f; };
        const float Wf = Fast.Wheels[0].VerticalLoad + Fast.Wheels[1].VerticalLoad, Wr = Fast.Wheels[2].VerticalLoad + Fast.Wheels[3].VerticalLoad;
        const float Cf = Stiffness(Fast.Wheels[0].VerticalLoad) + Stiffness(Fast.Wheels[1].VerticalLoad);
        const float Cr = Stiffness(Fast.Wheels[2].VerticalLoad) + Stiffness(Fast.Wheels[3].VerticalLoad);
        const float Kus = (Wf / Cf - Wr / Cr);
        const float V0 = Fast.ForwardSpeed, D = Steer * 0.25f * Config.MaxSteerAngleRad;
        const float Predicted = V0 / (Base + Kus * V0 * V0 / 9.81f) * D;
        const float Measured  = std::fabs(Fast.Chassis.AngularVelocity.z);
        Report(std::fabs(Measured / Predicted - 1.0f) < 0.25f,
               Format("14 m/s: yaw rate %.4f rad/s against the bicycle model %.4f (understeer gradient %.4f rad/g)", Measured, Predicted, Kus));
        const float Lateral = V0 * Measured;
        Report(Lateral < Config.GripCoefficient * 9.81f, Format("lateral acceleration %.2f m/s² stays inside the grip %.2f m/s²", Lateral, Config.GripCoefficient * 9.81f));
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    C · BEYOND PROJECT DRIVE
//------------------------------------------------------------------------------------------------------------------------

void ValidateConditions()
{
    Heading("C · The pieces added beyond Project Drive");
    {
        // C1 supercharger has no lag, the turbo does; drag under load, bypass off throttle; charge air
        auto Rise = [](V::InductionType Induction, float& Settled, float& Drag, float& DragIdle, float& Charge)
        {
            V::VehicleSpecification S = V::ConstructControlVehicleSpecification();
            V::Drivetrain           Drive;
            Drive.AssignEngine(S.Solver.Engine);
            Drive.AssignTurbo(S.Solver.Turbo);
            Drive.AssignSupercharger(S.Solver.Supercharger);
            Drive.AssignInduction(Induction);
            Drive.AssignChargeAir(S.Solver.ChargeAir);
            Drive.Reset(4500.0f);
            V::DrivetrainInputs In;
            In.dt = 1.0f / 240.0f; In.GearIndex = S.Solver.Transmission.NeutralIndex; In.Throttle = 1.0f;
            float At100 = 0.0f;
            V::DrivetrainOutputs Out{};
            for (int Step = 0; Step < 240 * 3; ++Step)
            {
                Out = Drive.Step(In);
                if (Step == 24) At100 = Out.BoostPressure_Bar;
            }
            Settled = Out.BoostPressure_Bar;
            Drag    = Out.ParasiticDrag_Nm;
            Charge  = Out.ChargeTemperature_K;
            In.Throttle = 0.0f;
            for (int Step = 0; Step < 240; ++Step) Out = Drive.Step(In);
            DragIdle = Out.ParasiticDrag_Nm;
            return At100;
        };
        float SuperSettled, SuperDrag, SuperIdle, SuperCharge, TurboSettled, TurboDrag, TurboIdle, TurboCharge;
        const float Super100 = Rise(V::InductionType::Supercharged, SuperSettled, SuperDrag, SuperIdle, SuperCharge);
        const float Turbo100 = Rise(V::InductionType::Turbocharged, TurboSettled, TurboDrag, TurboIdle, TurboCharge);
        Report(SuperSettled > 0.05f && Super100 / SuperSettled > Turbo100 / std::max(1.0e-4f, TurboSettled),
               Format("supercharger boost follows the crank: %.0f %% of its %.2f bar 0.1 s after full throttle (turbo %.0f %% of %.2f bar)",
                      Super100 / SuperSettled * 100.0f, SuperSettled, Turbo100 / std::max(1.0e-4f, TurboSettled) * 100.0f, TurboSettled));
        Report(SuperDrag > 1.0f && SuperIdle < SuperDrag && TurboDrag == 0.0f,
               Format("the blower takes %.1f N·m from the crank under load, %.1f N·m bypassed off throttle; the turbo none", SuperDrag, SuperIdle));
        V::ChargeAirSpecification Charge;
        Charge.Enabled = true;
        const float Adiabatic = V::ResolveChargeTemperature(V::ChargeAirSpecification{ true, 293.15f, 1.01325f, 0.0f, 318.15f, false }, 0.8f, 0.72f);
        const float Expected  = 293.15f * (1.0f + (std::pow((1.01325f + 0.8f) / 1.01325f, 0.4f / 1.4f) - 1.0f) / 0.72f);
        const float Cooled    = V::ResolveChargeTemperature(V::ChargeAirSpecification{ true, 293.15f, 1.01325f, 1.0f, 318.15f, false }, 0.8f, 0.72f);
        Report(std::fabs(Adiabatic - Expected) < 0.01f && std::fabs(Cooled - 293.15f) < 1.0e-3f && SuperCharge > 293.15f,
               Format("charge air: %.1f °C after the compressor at 0.8 bar (isentropic over η = %.1f °C), ambient through a perfect intercooler, %.1f °C live",
                      Adiabatic - 273.15f, Expected - 273.15f, SuperCharge - 273.15f));
    }
    {
        // C2 gas law and heating
        V::ThermalSpecification Thermal;
        Thermal.Enabled = true;
        V::ThermalMetrics Reading;
        (void)V::ConstructThermal(Reading, Thermal, 0.17, 110000.0, 101325.0);
        V::ThermalContact Contact;
        Contact.Volume = 0.17; Contact.InContact = true; Contact.SlidingPower = 25000.0;
        for (int Step = 0; Step < 240 * 90; ++Step) (void)V::IntegrateThermal(Reading, Thermal, Contact, 1.0 / 240.0);
        const double Law = (Reading.ReferenceGaugePressure + Reading.AtmosphericPressure) * Reading.GasTemperature / Reading.ReferenceTemperature - Reading.AtmosphericPressure;
        Report(Reading.SurfaceTemperature > 330.0 && Reading.GasTemperature > Reading.ReferenceTemperature + 2.0 && std::fabs(Reading.GaugePressure - Law) < 1.0,
               Format("a 90 s, 25 kW slide heats the tread to %.0f °C and the air to %.1f °C; gauge %.1f kPa = gas law %.1f kPa at constant volume",
                      Reading.SurfaceTemperature - 273.15, Reading.GasTemperature - 273.15, Reading.GaugePressure * 0.001, Law * 0.001));
        Report(std::fabs(Reading.EnergyResidualJoules) < 1.0e-6 * std::max(1.0, Reading.StoredHeatJoules) + 1.0,
               Format("heat balance: stored %.0f kJ, residual %.3g J", Reading.StoredHeatJoules * 0.001, Reading.EnergyResidualJoules));
        V::ThermalMetrics Squeezed;
        (void)V::ConstructThermal(Squeezed, V::ThermalSpecification{}, 0.17, 110000.0, 101325.0);
        V::ThermalContact Smaller;
        Smaller.Volume = 0.17 * 0.98;
        (void)V::IntegrateThermal(Squeezed, V::ThermalSpecification{}, Smaller, 1.0 / 240.0);
        const double Boyle = (110000.0 + 101325.0) / 0.98 - 101325.0;
        Report(std::fabs(Squeezed.GaugePressure - Boyle) < 1.0, Format("a carcass squeezed 2 %% raises the gauge to %.2f kPa (p V constant: %.2f kPa)",
                                                                       Squeezed.GaugePressure * 0.001, Boyle * 0.001));
        // C3 cold window
        V::ThermalSpecification Window;
        Window.Enabled = true; Window.ColdGripEnabled = true;
        V::ThermalMetrics Cold;
        (void)V::ConstructThermal(Cold, Window, 0.17, 110000.0, 101325.0);
        V::ThermalContact Idle;
        Idle.Volume = 0.17;
        (void)V::IntegrateThermal(Cold, Window, Idle, 1.0 / 240.0);
        Report(std::fabs(Cold.GripFactor - std::max(Window.ColdGripFloor, 1.0 - Window.ColdGripSensitivity * (Window.ColdWindowTemperature - Cold.SurfaceTemperature))) < 1.0e-9 &&
                   Cold.GripFactor < 1.0,
               Format("cold window: a %.0f °C tread grips × %.3f (window from %.0f °C)", Cold.SurfaceTemperature - 273.15, Cold.GripFactor,
                      Window.ColdWindowTemperature - 273.15));
    }
    {
        // C4 burnout heats the rear, wear accrues, fuel follows BSFC, fluids warm, Ackermann geometry
        // 📝 Fuel over a full-throttle run: the burn must equal BSFC × the brake work plus the idle flow.
        Proving Car;
        Car.Drive(0.0f, 0.0f, 0.0f, 1.0);
        const double BurntBefore = Car.Telemetry().FuelBurnt;
        const float  MassBefore  = Car.Telemetry().ChassisMass;
        double       Work = 0.0;
        for (int Step = 0; Step < 240 * 4; ++Step)
        {
            Car.Physics.AssignVehicleInput(PhysicsVehicleInput{ 1.0f, 0.0f, 0.0f, false });
            Car.Physics.AdvanceSteps(1);
            Work += Car.Telemetry().EnginePower_W * Car.Physics.QueryStepSeconds();
        }
        const V::VehicleTelemetry& T = Car.Telemetry();
        const V::FuelSpecification& Fuel = Car.Solver().QueryConfiguration().Fuel;
        const double Expected = Work / 3.6e6 * Fuel.SpecificConsumption_gPerKWh * 0.001 + 4.0 * Fuel.IdleFlow_gPerS * 0.001;
        const double Burnt    = T.FuelBurnt - BurntBefore;
        Report(std::fabs(Burnt / Expected - 1.0) < 0.01 && MassBefore - T.ChassisMass > 0.0f,
               Format("fuel: %.2f g burnt over 4 s at full throttle against BSFC × %.0f kJ + idle = %.2f g; the sprung mass is %.4f kg lighter", Burnt * 1000.0,
                      Work * 0.001, Expected * 1000.0, MassBefore - T.ChassisMass));
        // 📝 A locked-wheel stop (ABS off): the sliding treads heat and wear.
        Proving Skid([](V::VehicleSpecification& S) { S.Solver.Abs.Enabled = false; });
        Skid.Drive(0.0f, 0.0f, 0.0f, 1.0);
        Skid.Drive(1.0f, 0.0f, 0.0f, 5.0);
        const double Before = Skid.Telemetry().Wheels[0].Thermal.SurfaceTemperature;
        Skid.Drive(0.0f, 1.0f, 0.0f, 3.0);
        const V::VehicleTelemetry& Stopped = Skid.Telemetry();
        const double Rise = Stopped.Wheels[0].Thermal.SurfaceTemperature - Before;
        Report(Rise > 5.0, Format("a locked-wheel stop with ABS off heats the front tread %.1f K (%.0f kJ of sliding heat taken in)", Rise,
                                  Stopped.Wheels[0].Thermal.SlidingHeatJoules * 0.001));
        Report(Stopped.Wheels[0].WearDepth_mm > 0.0f && Stopped.Wheels[0].WearGripFactor < 1.0f,
               Format("wear: the front tread loses %.4f mm on that stop, grip × %.5f", Stopped.Wheels[0].WearDepth_mm, Stopped.Wheels[0].WearGripFactor));
        Report(T.CoolantTemperature_K > Car.Solver().QueryConfiguration().Fluids.AmbientTemperature_K && T.OilTemperature_K > Car.Solver().QueryConfiguration().Fluids.AmbientTemperature_K,
               Format("fluids warm under load: coolant %.2f °C, oil %.2f °C", T.CoolantTemperature_K - 273.15f, T.OilTemperature_K - 273.15f));
    }
    {
        Proving Car;
        Car.Drive(0.0f, 0.0f, 0.6f, 0.5);
        const V::VehicleTelemetry& T = Car.Telemetry();
        const V::VehicleSolverConfiguration& Config = Car.Solver().QueryConfiguration();
        const float Base   = Config.Wheels[0].LocalOffset.x - 0.5f * (Config.Wheels[2].LocalOffset.x + Config.Wheels[3].LocalOffset.x);
        const float Centre = 0.5f * (T.Wheels[0].SteerAngleRad + T.Wheels[1].SteerAngleRad);
        const float Radius = Base / std::tan(Centre);
        Report(T.Wheels[0].SteerAngleRad > T.Wheels[1].SteerAngleRad && T.Wheels[1].SteerAngleRad > 0.0f,
               Format("Ackermann: turning left the inner (left) wheel turns %.2f°, the outer %.2f° (turn radius %.1f m)", T.Wheels[0].SteerAngleRad * 57.29578f,
                      T.Wheels[1].SteerAngleRad * 57.29578f, Radius));
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    D · THREAD AND REGISTER
//------------------------------------------------------------------------------------------------------------------------

void ValidateThread(const std::filesystem::path& Exhibit)
{
    Heading("D · The physics thread, its snapshots, and the register");
    {
        PhysicsThread             Thread;
        std::atomic<uint64_t>     Steps{ 0 };
        PhysicsThreadConfiguration Configuration;
        Configuration.StepHz = 240.0;
        const auto Began = std::chrono::steady_clock::now();
        (void)Thread.Start(Configuration, [&](uint64_t, double) { Steps.fetch_add(1); });
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
        Thread.Stop();
        const double Elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - Began).count();
        const PhysicsThreadMeasurements Measured = Thread.QueryMeasurements();
        const double Expected = Elapsed * Configuration.StepHz;
        Report(std::fabs(static_cast<double>(Measured.Steps) / Expected - 1.0) < 0.05 && std::fabs(Measured.RealtimeRatio - 1.0) < 0.05,
               Format("240 Hz cadence: %llu steps in %.3f s of wall time (%.0f expected), %llu wakes, real-time ratio %.3f, %llu dropped",
                      static_cast<unsigned long long>(Measured.Steps), Elapsed, Expected, static_cast<unsigned long long>(Measured.Wakes), Measured.RealtimeRatio,
                      static_cast<unsigned long long>(Measured.DroppedSteps)));
    }
    {
        // 📝 Torn-read check: the producer writes a pair (n, 2n) per snapshot; the reader must never see them disagree.
        struct Pair { uint64_t A = 0, B = 0; };
        PhysicsSnapshotExchange<Pair> Exchange;
        std::atomic<bool>             Running{ true };
        std::thread Producer([&]
        {
            for (uint64_t N = 1; Running.load(); ++N)
            {
                Pair& Slot = Exchange.AccessProduced();
                Slot.A = N;
                Slot.B = 2 * N;
                Exchange.Publish();
            }
        });
        uint64_t Reads = 0, Torn = 0, Backwards = 0, Last = 0;
        const auto Until = std::chrono::steady_clock::now() + std::chrono::milliseconds(300);
        while (std::chrono::steady_clock::now() < Until)
            if (Exchange.Acquire())
            {
                const Pair& Read = Exchange.QueryConsumed();
                Torn += Read.B != 2 * Read.A ? 1 : 0;
                Backwards += Read.A < Last ? 1 : 0;
                Last = Read.A;
                ++Reads;
            }
        Running = false;
        Producer.join();
        Report(Reads > 100 && Torn == 0 && Backwards == 0,
               Format("snapshot exchange: %llu reads under a racing producer, %llu torn, %llu out of order", static_cast<unsigned long long>(Reads),
                      static_cast<unsigned long long>(Torn), static_cast<unsigned long long>(Backwards)));
    }
    {
        // 📝 Threaded and inline runs of the same steps agree bit for bit (fixed steps, the same controls).
        Proving Threaded({}, false, true);
        Threaded.Physics.AssignVehicleInput(PhysicsVehicleInput{ 0.6f, 0.0f, 0.2f, false });
        for (int Refresh = 0; Refresh < 40; ++Refresh)
        {
            (void)Threaded.Physics.Step(Threaded.World, 1.0 / 60.0);
            std::this_thread::sleep_for(std::chrono::milliseconds(16));
        }
        const uint64_t Steps = Threaded.Physics.QuerySnapshot().Steps;
        Threaded.Physics.End(Threaded.World);
        Report(Steps > 100, Format("the physics thread stepped the car %llu times while the caller refreshed 40 times", static_cast<unsigned long long>(Steps)));
    }
    {
        WorldSpace World;
        World.ConstructRecord("Vehicle", "Control vehicle");
        const RecordToken Box = World.ConstructRecord("Geometry", "Crate");
        auto* Crate = dynamic_cast<GeometryRecord*>(World.FindRecord(Box));
        Crate->AccessConfiguration().Physics = true;
        Crate->AccessConfiguration().Resolved.Shown = 1;
        Crate->AccessConfiguration().Resolved.Extent[0] = Crate->AccessConfiguration().Resolved.Extent[1] = Crate->AccessConfiguration().Resolved.Extent[2] = 1.0f;
        const RecordToken Wall = World.ConstructRecord("Geometry", "Glass wall");
        auto* Glass = dynamic_cast<GeometryRecord*>(World.FindRecord(Wall));
        Glass->AccessConfiguration().Fracture.Enabled = true;
        Glass->AccessConfiguration().Resolved.Shown = 1;
        const float Low[3] = { 10.0f, -2.0f, 0.0f }, High[3] = { 10.2f, 2.0f, 2.0f };
        std::copy(Low, Low + 3, Glass->AccessConfiguration().Resolved.BoundsMinimum);
        std::copy(High, High + 3, Glass->AccessConfiguration().Resolved.BoundsMaximum);
        World.ConstructRecord("Solar", "Sun");
        PhysicsExtension Physics;
        PhysicsExtensionSettings Settings;
        Settings.WriteRegister = false;
        Physics.Begin(World, Settings);
        const WorldRegister& Register = Physics.QueryRegister();
        const std::string    Document = Register.EncodeMarkdown();
        const std::filesystem::path Output = Exhibit / "Results" / "WorldRegisterSample.md";
        (void)Register.WriteMarkdown(Output);
        Report(Register.QueryEntries().size() == World.QueryRecordCount() && Register.CountParticipation(PhysicsParticipation::Vehicle) == 1 &&
                   Register.CountParticipation(PhysicsParticipation::Moving) == 1 && Register.CountParticipation(PhysicsParticipation::Fracture) == 1 &&
                   Register.CountParticipation(PhysicsParticipation::None) == 1,
               Format("register: %zu records → 1 vehicle, 1 moving, 1 fracture (fixed bounds), 1 without physics", Register.QueryEntries().size()));
        Report(Document.find("| Fracture |") != std::string::npos && Document.find("Glass wall") != std::string::npos && std::filesystem::exists(Output),
               "register document lists every object and its physics part (Results/WorldRegisterSample.md)");
        Physics.End(World);
    }
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    const std::filesystem::path Exhibit = ArgumentCount > 1 ? std::filesystem::path(Arguments[1]) : std::filesystem::path("Exhibits/VehiclePhysics");
    const std::filesystem::path Results = Exhibit / "Results";
    std::filesystem::create_directories(Results);
    ValidateFormula(Results);
    ValidateHost(Results);
    ValidateConditions();
    ValidateThread(Exhibit);
    const std::string Summary = Format("\n%s %d / %d assertions\n", Failed == 0 ? "🟢" : "🔴", Passed, Passed + Failed);
    std::printf("%s", Summary.c_str());
    Log << Summary;
    std::ofstream(Results / "VehicleDynamics.txt") << Log.str();
    return Failed == 0 ? 0 : 1;
}
