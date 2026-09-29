//============================================================================================================================================
// SuperchargerValidation.cpp — unit checks for the belt-driven supercharger path in the Drivetrain.
//   Build: g++ -std=c++17 -O2 SuperchargerValidation.cpp Drivetrain.cpp -o super && ./super
//============================================================================================================================================

#include "Drivetrain.h"

#include <cmath>
#include <cstdio>

using namespace Frontier::Vehicle;

static int g_pass = 0, g_fail = 0;
static void Check(const char* name, bool ok, double got, double ref)
{
    std::printf("  [%s] %-58s got %10.3f  (ref %10.3f)\n", ok ? "PASS" : "FAIL", name, got, ref);
    if (ok) ++g_pass; else ++g_fail;
}

// Rev the engine in neutral at a given throttle for `secs`, return the final outputs.
static DrivetrainOutputs RevInNeutral(Drivetrain& dt, float throttle, float secs)
{
    const float h = 1.0f / 240.0f;
    DrivetrainInputs in; in.Throttle = throttle; in.GearIndex = 2 /*neutral*/; in.dt = h;
    DrivetrainOutputs out;
    for (int s = 0; s < int(secs / h); ++s) out = dt.Step(in);
    return out;
}

int main()
{
    std::printf("\n=== Belt-driven supercharger ===\n\n");

    // ---- 1. Naturally aspirated: no boost, no parasitic drag ----
    {
        Drivetrain dt; dt.SetInduction(InductionType::NaturallyAspirated); dt.Reset(700.0f);
        const auto o = RevInNeutral(dt, 1.0f, 1.0f);
        Check("NA boost multiplier is unity", std::fabs(o.BoostMultiplier - 1.0f) < 1e-4f, o.BoostMultiplier, 1.0);
        Check("NA has no parasitic drag", std::fabs(o.ParasiticDrag_Nm) < 1e-4f, o.ParasiticDrag_Nm, 0.0);
        Check("NA reports zero boost", std::fabs(o.BoostPressure_Bar) < 1e-4f, o.BoostPressure_Bar, 0.0);
    }

    // ---- 2. Supercharger produces boost + a torque multiplier + parasitic drag ----
    {
        Drivetrain dt; dt.SetInduction(InductionType::Supercharged);
        dt.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); dt.Reset(700.0f);
        const auto o = RevInNeutral(dt, 1.0f, 1.5f);
        Check("supercharger builds boost", o.BoostPressure_Bar > 0.2f, o.BoostPressure_Bar, 0.5);
        Check("boost gives a torque multiplier > 1", o.BoostMultiplier > 1.05f, o.BoostMultiplier, 1.2);
        Check("supercharger taxes the crank (parasitic drag > 0)", o.ParasiticDrag_Nm > 5.0f, o.ParasiticDrag_Nm, 40.0);
        Check("charger rpm = engine rpm x drive ratio (3.2)",
              std::fabs(o.TurboRPM - o.EngineRPM * 3.2f) < 0.01f * o.EngineRPM * 3.2f, o.TurboRPM, o.EngineRPM * 3.2);
    }

    // ---- 3. Boost is capped by the tune (base vs race octane ceiling) ----
    {
        Drivetrain base; base.SetInduction(InductionType::Supercharged);
        base.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); base.SetRaceTune(false); base.Reset(700.0f);
        const auto ob = RevInNeutral(base, 1.0f, 5.0f);

        Drivetrain race; race.SetInduction(InductionType::Supercharged);
        race.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); race.SetRaceTune(true); race.Reset(700.0f);
        const auto orr = RevInNeutral(race, 1.0f, 5.0f);

        Check("base tune caps boost at MaxBoost_Base (0.8 bar)", ob.BoostPressure_Bar <= 0.8f + 1e-3f, ob.BoostPressure_Bar, 0.8);
        Check("race tune allows more boost than base tune", orr.BoostPressure_Bar > ob.BoostPressure_Bar + 0.05f, orr.BoostPressure_Bar, ob.BoostPressure_Bar);
        Check("race tune caps boost at MaxBoost_Race (1.2 bar)", orr.BoostPressure_Bar <= 1.2f + 1e-3f, orr.BoostPressure_Bar, 1.2);
    }

    // ---- 4. Parasitic drag scales with throttle (bypass recirculates off-throttle) ----
    {
        Drivetrain hi; hi.SetInduction(InductionType::Supercharged);
        hi.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); hi.Reset(4000.0f);
        const auto ohi = RevInNeutral(hi, 1.0f, 0.05f);       // WOT

        Drivetrain lo; lo.SetInduction(InductionType::Supercharged);
        lo.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); lo.Reset(4000.0f);
        const auto olo = RevInNeutral(lo, 0.0f, 0.05f);       // closed throttle
        Check("full-throttle parasitic drag exceeds closed-throttle (bypass)", ohi.ParasiticDrag_Nm > olo.ParasiticDrag_Nm + 2.0f, ohi.ParasiticDrag_Nm, olo.ParasiticDrag_Nm);
    }

    // ---- 5. Supercharger has far less lag than the turbo (early boost after tip-in) ----
    {
        Drivetrain turbo; turbo.SetInduction(InductionType::Turbocharged); turbo.Reset(4000.0f);
        Drivetrain super; super.SetInduction(InductionType::Supercharged);
        super.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); super.Reset(4000.0f);
        const auto ot = RevInNeutral(turbo, 1.0f, 0.15f);
        const auto os = RevInNeutral(super, 1.0f, 0.15f);
        Check("supercharger boost leads the turbo shortly after tip-in", os.BoostPressure_Bar > ot.BoostPressure_Bar, os.BoostPressure_Bar, ot.BoostPressure_Bar);
    }

    // ---- 6. Supercharged engine makes more torque than NA at the same rpm ----
    {
        Drivetrain na; na.SetInduction(InductionType::NaturallyAspirated); na.Reset(700.0f);
        Drivetrain sc; sc.SetInduction(InductionType::Supercharged);
        sc.SetSupercharger(SuperchargerParameters::DefaultTwinScrew()); sc.Reset(700.0f);
        const auto ona = RevInNeutral(na, 1.0f, 1.0f);
        const auto osc = RevInNeutral(sc, 1.0f, 1.0f);
        // Compare peak torque potential (engine torque output field is net, before clutch); boosted should exceed NA.
        Check("supercharged engine torque exceeds NA at the same throttle", osc.EngineTorque_Nm > ona.EngineTorque_Nm, osc.EngineTorque_Nm, ona.EngineTorque_Nm);
    }

    std::printf("\n=== %d passed, %d failed ===\n\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
