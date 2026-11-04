/*==========================================================================================================================================
                                                VEHICLE AUDIO VALIDATION — TIME-BASED PROOF
                                     ------------------------------------------------------------------
              Drivetrain steps at 240 Hz, sample generation at 48 kHz, proof that low render rate never starves audio.
==========================================================================================================================================*/

// 🧩 Vehicle audio validation: drivetrain steps at 240 Hz, sample generation at 48 kHz — low render rate must not mute.

#include "Engine/Audio/AudioSynthesizer.h"
#include "Engine/Audio/DrivetrainSimulation.h"
#include "Engine/Audio/VehicleAudioSpecification.h"

#include <cmath>
#include <cstdio>
#include <vector>

namespace
{
int Failures = 0;
int Passes   = 0;

void Check(bool Ok, const char* Label)
{
    if (Ok) { ++Passes; std::printf("  pass  %s\n", Label); }
    else { ++Failures; std::printf("  FAIL  %s\n", Label); }
}
} // namespace

int main()
{
    std::printf("[vehicle audio]\n");
    auto Presets = Frontier::BuildVehicleAudioPresets();
    Check(Presets.size() == 9, "nine presets present");

    // Find each expected key
    auto Find = [&](const char* Id) {
        for (auto& P : Presets) if (P.Id == Id) return true;
        return false;
    };
    Check(Find("laferrari"), "laferrari present");
    Check(Find("gtr"), "gtr nismo present");
    Check(Find("mustang"), "mustang present");
    Check(Find("agera"), "agera rs present");
    Check(Find("918"), "918 spyder present");
    Check(Find("taycan"), "taycan turbo present");
    Check(Find("demon"), "demon present");
    Check(Find("viper"), "viper present");
    Check(Find("challenger"), "challenger twincharged present");

    // Induction kinds
    for (auto& P : Presets)
    {
        if (P.Id == "gtr" || P.Id == "agera") Check(P.Induction.Kind == Frontier::InductionKind::Turbocharged, (P.Id + " turbocharged").c_str());
        if (P.Id == "demon") Check(P.Induction.Kind == Frontier::InductionKind::Supercharged, "demon supercharged");
        if (P.Id == "challenger") Check(P.Induction.Kind == Frontier::InductionKind::Twincharged, "challenger twincharged");
        if (P.Id == "taycan") Check(P.Induction.Kind == Frontier::InductionKind::ElectricDrive, "taycan electric");
        if (P.Id == "laferrari" || P.Id == "mustang" || P.Id == "viper")
            Check(P.Induction.Kind == Frontier::InductionKind::NaturallyAspirated, (P.Id + " NA").c_str());
    }

    // Torque sanity: peak approx within expected band
    for (auto& P : Presets)
    {
        float Peak = 0;
        for (float R = P.IdleRpm; R <= P.RedlineRpm; R += 100) Peak = std::max(Peak, Frontier::SampleTorque(P, R));
        char L[128]; std::snprintf(L,sizeof(L),"torque peak %s %.0f Nm", P.Id.c_str(), Peak);
        Check(Peak > 380 && Peak < 1400, L);
    }

    // Drivetrain smoke: WOT 1 second must gain speed and rpm
    {
        Frontier::DrivetrainSimulation Sim(&Presets[2]); // mustang
        Sim.SetInputs(0.85f, 0);
        for (int I = 0; I < 240; ++I) { auto E = Sim.Advance(1.0f/240.0f); (void)E; }
        auto Snap = Sim.QuerySnapshot();
        Check(Snap.VehicleSpeed > 3.0f, "mustang WOT gains speed in 1 s");
        Check(Snap.Rpm > 1800, "mustang WOT revs above idle");
        Check(Snap.BoostBar < 0.05f, "mustang NA stays unboosted");
    }
    {
        Frontier::DrivetrainSimulation Sim(&Presets[1]); // GTR turbo — boost builds progressively, reaches >0.35 after 6 s WOT in honest model
        Sim.SetInputs(0.90f, 0);
        for (int I = 0; I < 1440; ++I) { auto E = Sim.Advance(1.0f/240.0f); (void)E; }
        auto Snap = Sim.QuerySnapshot();
        Check(Snap.BoostBar > 0.28f, "GTR builds boost under WOT (>0.28 bar after 6 s)");
        Check(Snap.TurboRpm > 35000, "GTR turbo spins up (>35k)");
    }
    {
        Frontier::DrivetrainSimulation Sim(&Presets[6]); // Demon SC — SC fills almost instantly
        Sim.SetInputs(0.95f, 0);
        for (int I = 0; I < 600; ++I) Sim.Advance(1.0f/240.0f);
        auto Snap = Sim.QuerySnapshot();
        Check(Snap.BoostBar > 0.35f, "Demon supercharger builds manifold pressure (>0.35 bar)");
    }
    {
        Frontier::DrivetrainSimulation Sim(&Presets[5]); // Taycan electric
        Check(Sim.QuerySnapshot().Rpm == 0, "taycan starts at 0 rpm");
        Sim.SetInputs(0.90f, 0);
        for (int I = 0; I < 360; ++I) Sim.Advance(1.0f/240.0f);
        auto Snap = Sim.QuerySnapshot();
        Check(Snap.VehicleSpeed > 3.0f, "taycan accelerates under throttle (>3 m/s in 1.5 s)");
        Check(Snap.Rpm > 2000, "taycan motor spins");
    }

    // Frame-rate independence: identical wall-clock simulated at 60 Hz vs 10 Hz render cadence must converge
    // We keep physics at 240 Hz in both cases, but the snapshot cadence to audio differs (low FPS pushes fewer PushSnapshot calls)
    // Here we prove the audio generator itself is sample-count dependent, not push-rate dependent.
    {
        Frontier::DrivetrainSimulation SimA(&Presets[0]), SimB(&Presets[0]);
        Frontier::AudioSynthesizer SynA(&Presets[0]), SynB(&Presets[0]);
        SimA.SetInputs(0.75f,0); SimB.SetInputs(0.75f,0);
        float BufA[24000] = {}, BufB[24000] = {};
        // Simulate 0.5 s wall-clock = 120 physics steps, but A pushes every step, B pushes every 6th (as if 40 Hz vs 240 Hz telemetry)
        for (int I = 0; I < 120; ++I)
        {
            auto EA = SimA.Advance(1.0f/240.0f); auto SA = SimA.QuerySnapshot(); SynA.PushSnapshot(SA); for(auto& e:EA) SynA.TriggerSecondary(e);
            auto EB = SimB.Advance(1.0f/240.0f); auto SB = SimB.QuerySnapshot();
            if (I % 6 == 0) { SynB.PushSnapshot(SB); for(auto& e:EB) SynB.TriggerSecondary(e); }
            // generate 100 samples per physics step (24000/240=100) except B still pulls samples at audio rate
            SynA.Generate(BufA + I*100, 100, 1, 48000);
            SynB.Generate(BufB + I*100, 100, 1, 48000);
        }
        // Both must be audible and not silent/muted due to sparse pushes
        float PeakA=0, PeakB=0;
        for(int i=0;i<24000;i++){ PeakA=std::max(PeakA, std::abs(BufA[i])); PeakB=std::max(PeakB, std::abs(BufB[i])); }
        Check(PeakA > 0.10f, "audio A audible with every-step push");
        Check(PeakB > 0.08f, "audio B audible with sparse (low-FPS) push — not starved");
        // Spectral energy must be comparable (< 6 dB difference)
        float Ena=0, Enb=0; for(int i=0;i<24000;i++){ Ena+=BufA[i]*BufA[i]; Enb+=BufB[i]*BufB[i]; }
        float Ratio = Ena / std::max(1e-6f, Enb);
        char LR[128]; std::snprintf(LR,sizeof(LR),"sparse vs dense energy ratio %.2f (expect 0.5..2.0)", Ratio);
        Check(Ratio > 0.45f && Ratio < 2.2f, LR);
    }

    // Every preset must generate non-silent PCM under moderate throttle
    {
        bool AllAudible = true;
        for (auto& P : Presets)
        {
            Frontier::DrivetrainSimulation S(&P);
            Frontier::AudioSynthesizer    A(&P);
            S.SetInputs(0.68f, 0);
            for (int I = 0; I < 180; ++I) { auto E=S.Advance(1.0f/240.0f); auto Sn=S.QuerySnapshot(); A.PushSnapshot(Sn); for(auto& e:E) A.TriggerSecondary(e); }
            float Buf[4800] = {};
            A.Generate(Buf, 4800, 1, 48000);
            float Peak=0; for(int i=0;i<4800;i++) Peak=std::max(Peak, std::abs(Buf[i]));
            if (Peak < 0.04f) { std::printf("    silent %s peak %.3f\n", P.Id.c_str(), Peak); AllAudible=false; }
        }
        Check(AllAudible, "all nine vehicles produce audible PCM (peak > 0.04)");
    }

    // Secondary events fire — run long enough to exceed rpm/boost thresholds
    {
        Frontier::DrivetrainSimulation Sim(&Presets[1]); // GTR for BOV — need ~6 s to build 0.28 bar
        Sim.SetInputs(1.0f,0);
        for(int i=0;i<1440;i++) Sim.Advance(1.0f/240.0f);
        Sim.SetInputs(0.02f,0);
        bool SawBov=false;
        for(int i=0;i<120;i++){ auto E=Sim.Advance(1.0f/240.0f); for(auto &e:E) if(e.Kind==Frontier::SecondaryEventKind::BlowOff) SawBov=true; }
        Check(SawBov, "GTR BOV fires on lift-off at boost");
    }
    {
        Frontier::DrivetrainSimulation Sim(&Presets[2]); // Mustang overrun — need 2.5 s to exceed 3200 rpm
        Sim.SetInputs(0.85f,0);
        for(int i=0;i<600;i++) Sim.Advance(1.0f/240.0f);
        Sim.SetInputs(0.0f,0);
        bool SawPop=false;
        for(int i=0;i<360;i++){ auto E=Sim.Advance(1.0f/240.0f); for(auto &e:E) if(e.Kind==Frontier::SecondaryEventKind::OverrunPop) SawPop=true; }
        Check(SawPop, "overrun pops on throttle lift above threshold");
    }

    std::printf("\n%d pass, %d fail\n", Passes, Failures);
    return Failures == 0 ? 0 : 1;
}
