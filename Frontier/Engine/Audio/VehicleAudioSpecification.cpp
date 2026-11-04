/*==========================================================================================================================================
                                                VEHICLE AUDIO SPECIFICATION — PRESETS
                                     ------------------------------------------------------------------
                         Factory for the nine acoustic identities shown in the interactive exhibit.
==========================================================================================================================================*/

// 🧩 Vehicle audio specification presets: factory for the nine acoustic identities shown in the interactive exhibit.

#include "Engine/Audio/VehicleAudioSpecification.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                   HELPERS
//------------------------------------------------------------------------------------------------------------------------

static float LerpSmooth(float A, float B, float T) noexcept
{
    const float S = T * T * (3.0f - 2.0f * T);
    return A + S * (B - A);
}

float SampleTorque(const VehicleAudioSpecification& Spec, float Rpm) noexcept
{
    const auto& Pts = Spec.TorqueCurve;
    if (Pts.empty()) return 0;
    if (Rpm <= Pts.front().Rpm) return Pts.front().TorqueNm;
    if (Rpm >= Pts.back().Rpm) return Pts.back().TorqueNm;
    for (size_t I = 0; I + 1 < Pts.size(); ++I)
    {
        if (Rpm >= Pts[I].Rpm && Rpm <= Pts[I + 1].Rpm)
        {
            const float T = (Rpm - Pts[I].Rpm) / std::max(1.0f, Pts[I + 1].Rpm - Pts[I].Rpm);
            return LerpSmooth(Pts[I].TorqueNm, Pts[I + 1].TorqueNm, T);
        }
    }
    return Pts.back().TorqueNm;
}

float FiringFrequencyHz(const VehicleAudioSpecification& Spec, float Rpm) noexcept
{
    if (Spec.Cylinders == 0) return 0;
    return (Rpm / 60.0f) * (static_cast<float>(Spec.Cylinders) * 0.5f);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   PRESETS
//------------------------------------------------------------------------------------------------------------------------

std::vector<VehicleAudioSpecification> BuildVehicleAudioPresets()
{
    std::vector<VehicleAudioSpecification> Out;
    Out.reserve(9);

    auto AddHarmonics = [](VehicleAudioSpecification& S, std::initializer_list<HarmonicEntry> Hs) {
        S.Harmonics.assign(Hs.begin(), Hs.end());
    };

    // 1 — LaFerrari V12 NA + HY-KERS
    {
        VehicleAudioSpecification S;
        S.Id = "laferrari"; S.DisplayName = "Ferrari LaFerrari"; S.ShortLabel = "LaFerrari · 6.3 V12 NA + HY-KERS";
        S.Cylinders = 12; S.VAngleDeg = 65; S.DisplacementCc = 6262; S.IdleRpm = 950; S.RedlineRpm = 9250; S.LimiterRpm = 9500;
        S.CrankPlane = CrankPlaneKind::EvenFire; S.FiringOrder = {1,7,5,11,3,9,6,12,2,8,4,10};
        S.MassKg = 1585; S.DragCd = 0.32f; S.FrontalAreaM2 = 1.91f; S.WheelRadiusM = 0.335f; S.RollingCoeff = 0.011f; S.FinalDrive = 3.91f;
        S.GearRatios = {3.30f,2.19f,1.63f,1.29f,1.05f,0.86f,0.69f}; S.ShiftUpRpm = 8900; S.ShiftDownRpm = 4200;
        S.TorqueCurve = {{1000,420},{2500,580},{4000,660},{5500,700},{6750,700},{8000,640},{9250,560}};
        S.EngineInertia = 0.18f; S.Induction.Kind = InductionKind::NaturallyAspirated;
        AddHarmonics(S, {{0.5f,0.06f},{1.0f,0.12f},{1.5f,0.05f},{2.0f,0.22f},{3.0f,0.58f},{4.0f,0.32f},{5.0f,0.16f},{6.0f,1.00f},{7.0f,0.42f},{8.0f,0.28f},{9.0f,0.14f},{12.0f,0.52f}});
        S.ExhaustResHz = 92; S.IntakeResHz = 1450;
        S.Character = {1.00f,0.55f,0.18f,1.15f,0,0,0,0,0.28f};
        Out.push_back(std::move(S));
    }
    // 2 — GT-R NISMO V6 Twin-Turbo
    {
        VehicleAudioSpecification S;
        S.Id = "gtr"; S.DisplayName = "Nissan GT-R NISMO"; S.ShortLabel = "GT-R NISMO · 3.8 V6 Twin-Turbo";
        S.Cylinders = 6; S.VAngleDeg = 60; S.DisplacementCc = 3798; S.IdleRpm = 820; S.RedlineRpm = 7000; S.LimiterRpm = 7200;
        S.CrankPlane = CrankPlaneKind::EvenFire;
        S.MassKg = 1720; S.DragCd = 0.26f; S.FrontalAreaM2 = 2.02f; S.WheelRadiusM = 0.340f; S.RollingCoeff = 0.011f; S.FinalDrive = 3.70f;
        S.GearRatios = {4.06f,2.30f,1.54f,1.19f,1.00f,0.80f}; S.ShiftUpRpm = 6600; S.ShiftDownRpm = 3100;
        S.TorqueCurve = {{1000,300},{2500,480},{3200,652},{4500,652},{6000,600},{7000,520}};
        S.EngineInertia = 0.24f;
        S.Induction.Kind = InductionKind::Turbocharged; S.Induction.PeakBoostBar = 1.15f; S.Induction.TurboLagTau = 0.48f; S.Induction.TurboMaxRpm = 140000; S.Induction.TurboBladeCount = 11; S.Induction.WastegateBar = 1.15f;
        AddHarmonics(S, {{0.5f,0.08f},{1.0f,0.14f},{1.5f,0.26f},{2.0f,0.18f},{3.0f,1.00f},{4.0f,0.22f},{5.0f,0.11f},{6.0f,0.62f},{9.0f,0.20f}});
        S.ExhaustResHz = 78; S.IntakeResHz = 1250;
        S.Character = {0.92f,0.72f,0.32f,0.88f,0.90f,0,0,0,0};
        Out.push_back(std::move(S));
    }
    // 3 — Mustang GT V8 Crossplane
    {
        VehicleAudioSpecification S;
        S.Id = "mustang"; S.DisplayName = "Ford Mustang GT"; S.ShortLabel = "Mustang GT · 5.0 V8 Crossplane";
        S.Cylinders = 8; S.VAngleDeg = 90; S.DisplacementCc = 5038; S.IdleRpm = 750; S.RedlineRpm = 7400; S.LimiterRpm = 7600;
        S.CrankPlane = CrankPlaneKind::CrossPlane; S.FiringOrder = {1,5,4,8,6,3,7,2};
        S.MassKg = 1810; S.DragCd = 0.35f; S.FrontalAreaM2 = 2.18f; S.WheelRadiusM = 0.345f; S.RollingCoeff = 0.012f; S.FinalDrive = 3.55f;
        S.GearRatios = {4.23f,2.53f,1.67f,1.23f,1.00f,0.85f,0.65f}; S.ShiftUpRpm = 7100; S.ShiftDownRpm = 2800;
        S.TorqueCurve = {{1000,380},{2600,480},{3800,536},{4600,570},{5800,540},{7400,470}};
        S.EngineInertia = 0.32f; S.Induction.Kind = InductionKind::NaturallyAspirated;
        AddHarmonics(S, {{0.5f,0.34f},{1.0f,0.22f},{1.5f,0.36f},{2.0f,0.78f},{3.0f,0.18f},{4.0f,1.00f},{5.0f,0.14f},{6.0f,0.26f},{8.0f,0.52f}});
        S.ExhaustResHz = 68; S.IntakeResHz = 980;
        S.Character = {1.05f,0.38f,0.62f,0.72f,0,0,1.0f,0,0};
        Out.push_back(std::move(S));
    }
    // 4 — Agera RS V8 Twin-Turbo flat-plane
    {
        VehicleAudioSpecification S;
        S.Id = "agera"; S.DisplayName = "Koenigsegg Agera RS"; S.ShortLabel = "Agera RS · 5.0 V8 Twin-Turbo (FPC)";
        S.Cylinders = 8; S.VAngleDeg = 90; S.DisplacementCc = 5065; S.IdleRpm = 880; S.RedlineRpm = 8250; S.LimiterRpm = 8500;
        S.CrankPlane = CrankPlaneKind::EvenFire;
        S.MassKg = 1395; S.DragCd = 0.33f; S.FrontalAreaM2 = 1.68f; S.WheelRadiusM = 0.335f; S.RollingCoeff = 0.011f; S.FinalDrive = 3.64f;
        S.GearRatios = {3.45f,2.09f,1.47f,1.15f,0.96f,0.82f,0.69f}; S.ShiftUpRpm = 8000; S.ShiftDownRpm = 3600;
        S.TorqueCurve = {{1500,700},{2700,1100},{4100,1280},{5600,1350},{7000,1280},{8250,1150}};
        S.EngineInertia = 0.19f;
        S.Induction.Kind = InductionKind::Turbocharged; S.Induction.PeakBoostBar = 1.42f; S.Induction.TurboLagTau = 0.35f; S.Induction.TurboMaxRpm = 155000; S.Induction.TurboBladeCount = 12; S.Induction.AntiLag = true; S.Induction.WastegateBar = 1.42f;
        AddHarmonics(S, {{0.5f,0.04f},{1.0f,0.10f},{2.0f,0.42f},{4.0f,1.00f},{6.0f,0.18f},{8.0f,0.68f},{12.0f,0.22f}});
        S.ExhaustResHz = 74; S.IntakeResHz = 1320;
        S.Character = {0.95f,0.82f,0.28f,1.10f,1.05f,0,0,0,0};
        Out.push_back(std::move(S));
    }
    // 5 — 918 Spyder V8 flat-plane NA hybrid
    {
        VehicleAudioSpecification S;
        S.Id = "918"; S.DisplayName = "Porsche 918 Spyder"; S.ShortLabel = "918 Spyder · 4.6 V8 NA + Hybrid (FPC)";
        S.Cylinders = 8; S.VAngleDeg = 90; S.DisplacementCc = 4593; S.IdleRpm = 900; S.RedlineRpm = 9150; S.LimiterRpm = 9400;
        S.CrankPlane = CrankPlaneKind::EvenFire;
        S.MassKg = 1640; S.DragCd = 0.34f; S.FrontalAreaM2 = 1.79f; S.WheelRadiusM = 0.332f; S.RollingCoeff = 0.011f; S.FinalDrive = 3.75f;
        S.GearRatios = {3.91f,2.29f,1.58f,1.26f,1.03f,0.84f,0.67f}; S.ShiftUpRpm = 8800; S.ShiftDownRpm = 4000;
        S.TorqueCurve = {{1200,340},{3500,480},{5400,540},{6600,540},{8000,510},{9150,460}};
        S.EngineInertia = 0.15f; S.Induction.Kind = InductionKind::NaturallyAspirated;
        AddHarmonics(S, {{0.5f,0.03f},{1.0f,0.09f},{2.0f,0.38f},{4.0f,1.00f},{6.0f,0.16f},{8.0f,0.62f},{10.0f,0.18f}});
        S.ExhaustResHz = 102; S.IntakeResHz = 1680;
        S.Character = {0.98f,0.60f,0.12f,1.25f,0,0,0,0,0.35f};
        S.Electric.PolePairs = 5; S.Electric.BaseCarrierHz = 10500;
        Out.push_back(std::move(S));
    }
    // 6 — Taycan Turbo S electric
    {
        VehicleAudioSpecification S;
        S.Id = "taycan"; S.DisplayName = "Porsche Taycan Turbo S"; S.ShortLabel = "Taycan Turbo S · Dual-Motor Electric";
        S.Cylinders = 0; S.VAngleDeg = 0; S.DisplacementCc = 0; S.IdleRpm = 0; S.RedlineRpm = 16000; S.LimiterRpm = 16200;
        S.CrankPlane = CrankPlaneKind::Electric;
        S.MassKg = 2295; S.DragCd = 0.22f; S.FrontalAreaM2 = 2.33f; S.WheelRadiusM = 0.345f; S.RollingCoeff = 0.011f; S.FinalDrive = 8.05f;
        S.GearRatios = {8.05f, 11.10f}; S.ShiftUpRpm = 9000; S.ShiftDownRpm = 3500;
        S.TorqueCurve = {{0,1050},{2500,1050},{6000,900},{10000,600},{16000,380}};
        S.EngineInertia = 0.06f; S.Induction.Kind = InductionKind::ElectricDrive;
        S.Character = {0,0,0.02f,0,0,0,0,1.0f,0};
        S.Electric.PolePairs = 6; S.Electric.BaseCarrierHz = 8200; S.Electric.TwoSpeedShiftRpm = 8500;
        Out.push_back(std::move(S));
    }
    // 7 — Demon supercharged
    {
        VehicleAudioSpecification S;
        S.Id = "demon"; S.DisplayName = "Dodge Challenger SRT Demon"; S.ShortLabel = "Demon · 6.2 V8 Supercharged 2.7L";
        S.Cylinders = 8; S.VAngleDeg = 90; S.DisplacementCc = 6166; S.IdleRpm = 780; S.RedlineRpm = 6500; S.LimiterRpm = 6750;
        S.CrankPlane = CrankPlaneKind::CrossPlane;
        S.MassKg = 1940; S.DragCd = 0.36f; S.FrontalAreaM2 = 2.35f; S.WheelRadiusM = 0.355f; S.RollingCoeff = 0.013f; S.FinalDrive = 3.09f;
        S.GearRatios = {4.71f,3.14f,2.10f,1.67f,1.29f,1.00f,0.84f,0.67f}; S.ShiftUpRpm = 6200; S.ShiftDownRpm = 2800;
        S.TorqueCurve = {{1000,650},{2400,950},{3500,1044},{4500,1044},{5900,980},{6500,880}};
        S.EngineInertia = 0.36f;
        S.Induction.Kind = InductionKind::Supercharged; S.Induction.PeakBoostBar = 1.00f; S.Induction.SuperchargerRatio = 2.36f; S.Induction.RotorLobes = 3; S.Induction.SuperchargerLossNm = 38; S.Induction.TurboLagTau = 0.085f;
        AddHarmonics(S, {{0.5f,0.28f},{1.0f,0.18f},{1.5f,0.22f},{2.0f,0.68f},{3.0f,0.16f},{4.0f,1.00f},{6.0f,0.18f},{8.0f,0.42f}});
        S.ExhaustResHz = 62; S.IntakeResHz = 820;
        S.Character = {1.12f,0.88f,0.68f,0.78f,0,1.35f,0.45f,0,0};
        Out.push_back(std::move(S));
    }
    // 8 — Viper V10 NA
    {
        VehicleAudioSpecification S;
        S.Id = "viper"; S.DisplayName = "Dodge Viper ACR"; S.ShortLabel = "Viper ACR · 8.4 V10 NA";
        S.Cylinders = 10; S.VAngleDeg = 90; S.DisplacementCc = 8382; S.IdleRpm = 720; S.RedlineRpm = 6400; S.LimiterRpm = 6600;
        S.CrankPlane = CrankPlaneKind::OddFire;
        S.MassKg = 1556; S.DragCd = 0.37f; S.FrontalAreaM2 = 2.05f; S.WheelRadiusM = 0.342f; S.RollingCoeff = 0.011f; S.FinalDrive = 3.55f;
        S.GearRatios = {2.66f,1.78f,1.30f,1.00f,0.74f,0.50f}; S.ShiftUpRpm = 6100; S.ShiftDownRpm = 2500;
        S.TorqueCurve = {{1000,520},{2200,680},{3600,814},{4800,814},{5800,740},{6400,680}};
        S.EngineInertia = 0.38f; S.Induction.Kind = InductionKind::NaturallyAspirated;
        AddHarmonics(S, {{0.5f,0.18f},{1.0f,0.16f},{1.5f,0.12f},{2.0f,0.28f},{2.5f,0.52f},{3.0f,0.14f},{5.0f,1.00f},{6.0f,0.18f},{10.0f,0.62f},{15.0f,0.22f}});
        S.ExhaustResHz = 58; S.IntakeResHz = 880;
        S.Character = {1.08f,0.42f,0.74f,0.82f,0,0,0,0,0};
        Out.push_back(std::move(S));
    }
    // 9 — Challenger twincharged
    {
        VehicleAudioSpecification S;
        S.Id = "challenger"; S.DisplayName = "Dodge Challenger Hellcat · Twincharged"; S.ShortLabel = "Challenger · 6.2 V8 Twincharged (SC+Turbo)";
        S.Cylinders = 8; S.VAngleDeg = 90; S.DisplacementCc = 6166; S.IdleRpm = 790; S.RedlineRpm = 6500; S.LimiterRpm = 6750;
        S.CrankPlane = CrankPlaneKind::CrossPlane;
        S.MassKg = 2010; S.DragCd = 0.38f; S.FrontalAreaM2 = 2.35f; S.WheelRadiusM = 0.355f; S.RollingCoeff = 0.013f; S.FinalDrive = 3.09f;
        S.GearRatios = {4.71f,3.14f,2.10f,1.67f,1.29f,1.00f,0.84f,0.67f}; S.ShiftUpRpm = 6300; S.ShiftDownRpm = 2900;
        S.TorqueCurve = {{1000,680},{2100,980},{3200,1180},{4000,1240},{5200,1180},{6500,1020}};
        S.EngineInertia = 0.35f;
        S.Induction.Kind = InductionKind::Twincharged; S.Induction.PeakBoostBar = 1.65f; S.Induction.SuperchargerRatio = 2.10f; S.Induction.RotorLobes = 3; S.Induction.SuperchargerLossNm = 34; S.Induction.TurboLagTau = 0.42f; S.Induction.TurboMaxRpm = 145000; S.Induction.TurboBladeCount = 11; S.Induction.WastegateBar = 1.65f; S.Induction.CompoundBalance = 0.55f;
        AddHarmonics(S, {{0.5f,0.30f},{1.0f,0.20f},{1.5f,0.20f},{2.0f,0.72f},{4.0f,1.00f},{6.0f,0.20f},{8.0f,0.48f}});
        S.ExhaustResHz = 64; S.IntakeResHz = 910;
        S.Character = {1.08f,0.95f,0.62f,0.88f,0.88f,0.95f,0,0,0};
        Out.push_back(std::move(S));
    }

    return Out;
}

} // namespace Frontier
