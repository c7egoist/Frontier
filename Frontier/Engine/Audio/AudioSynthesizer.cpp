/*==========================================================================================================================================
                                                  AUDIO SYNTHESIZER — GENERATION
                                     ------------------------------------------------------------------
                         Additive firing orders, induction whine and secondary bursts per sample.
==========================================================================================================================================*/

// 🧩 Audio synthesizer generation: additive firing orders, induction whine and secondary bursts per sample.

#include "Engine/Audio/AudioSynthesizer.h"

#include <algorithm>
#include <cmath>

namespace Frontier
{

namespace
{
constexpr float TwoPi = 6.28318530718f;

float FastTanh(float X) noexcept
{
    // cheap soft clip: tanh approx
    float X2 = X * X;
    return X * (27.0f + X2) / (27.0f + 9.0f * X2);
}
} // namespace

AudioSynthesizer::AudioSynthesizer(const VehicleAudioSpecification* Spec) noexcept
    : BoundSpec(Spec)
{
    Reset();
    if (Spec) Attach(Spec);
}

void AudioSynthesizer::Attach(const VehicleAudioSpecification* Spec) noexcept
{
    BoundSpec = Spec;
    Voices.clear();
    if (Spec == nullptr || Spec->IsElectric())
        return;
    Voices.reserve(Spec->Harmonics.size() * 2);
    for (const auto& H : Spec->Harmonics)
    {
        HarmonicVoice V;
        V.Order  = H.Order;
        V.Weight = H.Weight;
        V.Phase  = NextRand01() * TwoPi;
        // dominant orders get a detuned twin for width
        const int Copies = (H.Weight > 0.62f && H.Order >= 2.0f) ? 2 : 1;
        for (int C = 0; C < Copies; ++C)
        {
            HarmonicVoice W = V;
            W.Weight *= (Copies == 2 ? 0.58f : 1.0f);
            if (Copies == 2) W.Phase += (C == 0 ? -0.07f : 0.08f);
            Voices.push_back(W);
        }
    }
}

void AudioSynthesizer::Reset() noexcept
{
    CrankPhase = 0; TurboPhase = 0; SCPhase = 0; RumblePhase = 0; ElectricPhase = 0; CarrierPhase = 0;
    NoiseState = 0; SampleRateCache = 48000; IntakeGainCur = 0; TurboGainCur = 0; SCGainCur = 0;
    Current = {}; Target = {}; Bursts.clear();
    RandState = 2166136261u;
    for (auto& V : Voices) { V.Phase = NextRand01() * TwoPi; V.CurrentGain = 0; V.TargetGain = 0; }
}

void AudioSynthesizer::PushSnapshot(const DrivetrainSnapshot& Snap) noexcept
{
    Target = Snap;
}

void AudioSynthesizer::TriggerSecondary(const SecondaryEvent& Event) noexcept
{
    Burst B;
    B.Gain = Event.Intensity;
    switch (Event.Kind)
    {
        case SecondaryEventKind::OverrunPop:
            B.Duration = 0.085f + NextRand01() * 0.03f; // [s]
            B.Remaining = B.Duration;
            B.Frequency = 950.0f + NextRand01() * 900.0f; // [Hz]
            B.Phase = NextRand01() * TwoPi;
            B.Kind = 0;
            break;
        case SecondaryEventKind::BlowOff:
            B.Duration = 0.32f; B.Remaining = 0.32f;
            B.Frequency = 2800.0f + Event.BoostBar * 1200.0f;
            B.Phase = 0;
            B.Kind = 1;
            break;
        case SecondaryEventKind::LimiterCut:
            B.Duration = 0.012f; B.Remaining = 0.012f;
            B.Gain = 0.06f; B.Kind = 2; break;
        case SecondaryEventKind::GearShift:
            B.Duration = 0.14f; B.Remaining = 0.14f; B.Frequency = 52.0f; B.Kind = 3; B.Gain = 0.34f; break;
        default: return;
    }
    if (Bursts.size() < 8) Bursts.push_back(B);
}

float AudioSynthesizer::NextRand01() noexcept
{
    RandState = RandState * 1664525u + 1013904223u;
    return static_cast<float>((RandState >> 16) & 0x7fff) / 32767.0f;
}

void AudioSynthesizer::Generate(float* Output, uint32_t FrameCount, uint32_t Channels, float SampleRate) noexcept
{
    if (Output == nullptr || FrameCount == 0 || Channels == 0) return;
    SampleRateCache = SampleRate;

    // Slew snapshot toward target at ~ 18 Hz (audio-rate smoothing independent of UI FPS)
    const float SnapLerp = 1.0f - std::exp(-1.0f / (SampleRate * 0.055f)); // per-sample
    // Instead do per-block lerp for efficiency: approximate with a single lerp per Generate call
    const float BlockLerp = 1.0f - std::pow(1.0f - SnapLerp, static_cast<float>(FrameCount));
    auto LerpSnap = [&](float A, float B) { return A + (B - A) * BlockLerp; };
    Current.Rpm         = LerpSnap(Current.Rpm, Target.Rpm);
    Current.Throttle01  = LerpSnap(Current.Throttle01, Target.Throttle01);
    Current.Brake01     = LerpSnap(Current.Brake01, Target.Brake01);
    Current.BoostBar    = LerpSnap(Current.BoostBar, Target.BoostBar);
    Current.TurboRpm    = LerpSnap(Current.TurboRpm, Target.TurboRpm);
    Current.Load01      = LerpSnap(Current.Load01, Target.Load01);
    Current.VehicleSpeed = LerpSnap(Current.VehicleSpeed, Target.VehicleSpeed);
    // gear/shifting/limiter are discrete — snap directly
    Current.Gear     = Target.Gear;
    Current.Shifting = Target.Shifting;
    Current.Limiter  = Target.Limiter;

    const bool IsElectric = BoundSpec ? BoundSpec->IsElectric() : false;
    const float CrankHz   = std::max(4.0f, Current.Rpm / 60.0f);
    const float Dt        = 1.0f / std::max(8000.0f, SampleRate);

    // Precompute target gains for voices (throttle/load shaping)
    for (auto& V : Voices)
    {
        if (BoundSpec == nullptr) { V.TargetGain = 0; continue; }
        const float LoadShape = 0.55f + 0.45f * Current.Load01;
        const float ThrShape  = 0.62f + 0.38f * Current.Throttle01 + (Current.Throttle01 > 0.82f ? 0.12f : 0);
        float ScMask = 1.0f;
        if (BoundSpec->Induction.Kind == InductionKind::Turbocharged) ScMask = 1.0f - std::min(0.26f, Current.BoostBar * 0.14f);
        float LimDuck = Current.Limiter ? (0.42f + 0.20f * NextRand01()) : 1.0f;
        float Global  = BoundSpec->Character.Exhaust;
        if (Current.Shifting) Global *= 0.26f;
        V.TargetGain = V.Weight * LoadShape * ThrShape * ScMask * LimDuck * Global;
    }

    for (uint32_t Frame = 0; Frame < FrameCount; ++Frame)
    {
        // Advance crank integral
        CrankPhase += TwoPi * CrankHz * Dt;
        if (CrankPhase > TwoPi * 64) CrankPhase -= TwoPi * 64;

        // Smooth voice gains toward target at ~ 22 Hz
        for (auto& V : Voices)
        {
            constexpr float GainTau = 0.045f; // [s]
            const float Alpha = 1.0f - std::exp(-Dt / GainTau);
            V.CurrentGain += (V.TargetGain - V.CurrentGain) * Alpha;
            // per-voice phase advance at order * crank
            V.Phase += TwoPi * CrankHz * V.Order * Dt;
            if (V.Phase > TwoPi) V.Phase -= TwoPi * std::floor(V.Phase / TwoPi);
        }

        float Sample = 0;

        // Additive exhaust
        for (const auto& V : Voices)
        {
            // Use sine with mild saturation: saw-ish via harmonic enrichment already in weights
            Sample += std::sin(V.Phase) * V.CurrentGain;
        }
        // Even with many harmonics, keep energy bounded
        Sample *= 0.28f;

        // Sub rumble
        {
            RumblePhase += TwoPi * (18.0f + Current.Rpm * 0.009f) * Dt;
            const float Rumble = std::sin(RumblePhase) * 0.10f * (BoundSpec ? BoundSpec->Character.LowRumble : 0.3f)
                                 * (0.32f + 0.68f * (Current.Rpm < 3200 ? 1.0f : std::max(0.0f, 1.0f - (Current.Rpm - 3200) / 5000)));
            Sample += Rumble;
        }

        // Induction layers
        if (!IsElectric)
        {
            // Turbo whine: sawtooth approximated via sum of 3 harmonics
            if (BoundSpec && (BoundSpec->Induction.Kind == InductionKind::Turbocharged || BoundSpec->Induction.Kind == InductionKind::Twincharged))
            {
                const float TurboNorm = std::min(1.0f, Current.TurboRpm / std::max(1.0f, BoundSpec->Induction.TurboMaxRpm));
                const float WhistleHz = 620.0f + TurboNorm * 7600.0f + Current.BoostBar * 420.0f;
                TurboPhase += TwoPi * WhistleHz * Dt;
                const float WhistleGain = (0.06f + 0.72f * TurboNorm * Current.Throttle01 + 0.14f * Current.Load01) * (BoundSpec->Character.TurboHiss > 0 ? BoundSpec->Character.TurboHiss : 0.9f) * 0.11f;
                // Slew gain
                TurboGainCur += (WhistleGain - TurboGainCur) * (1.0f - std::exp(-Dt / 0.06f));
                Sample += (std::sin(TurboPhase) * 0.50f + std::sin(TurboPhase * 2.0f) * 0.24f + std::sin(TurboPhase * 3.0f) * 0.12f) * TurboGainCur;
                // Hiss (filtered noise) — simple one-pole
                const float White = NextRand01() * 2 - 1;
                NoiseState = NoiseState * 0.72f + White * 0.28f; // crude bandpass stand-in
                Sample += NoiseState * TurboGainCur * 0.18f;
            }
            // Supercharger whine: rotor lobe frequency
            if (BoundSpec && (BoundSpec->Induction.Kind == InductionKind::Supercharged || BoundSpec->Induction.Kind == InductionKind::Twincharged))
            {
                const float RotorHz = Current.Rpm / 60.0f * BoundSpec->Induction.SuperchargerRatio * static_cast<float>(BoundSpec->Induction.RotorLobes);
                SCPhase += TwoPi * RotorHz * Dt;
                const float ScGain = (0.08f + 0.68f * (Current.Rpm / 5000.0f) + 0.18f * Current.BoostBar) * (BoundSpec->Character.SuperWhine > 0 ? BoundSpec->Character.SuperWhine : 1.0f) * 0.11f * (Current.Throttle01 * 0.72f + 0.28f);
                SCGainCur += (ScGain - SCGainCur) * (1.0f - std::exp(-Dt / 0.05f));
                Sample += (std::sin(SCPhase) * 0.62f + std::sin(SCPhase * 2.007f) * 0.32f) * SCGainCur;
            }
            // Intake hiss: modulate filtered noise via throttle
            {
                const float IntakeTarget = (0.06f + 0.42f * Current.Throttle01 + 0.16f * Current.Load01) * (BoundSpec ? BoundSpec->Character.Intake : 0.5f) * (0.45f + Current.Rpm / std::max(1.0f, BoundSpec ? BoundSpec->RedlineRpm : 7000) * 0.55f);
                IntakeGainCur += (IntakeTarget * 0.085f - IntakeGainCur) * (1.0f - std::exp(-Dt / 0.08f));
                const float W = NextRand01() * 2 - 1;
                Sample += W * IntakeGainCur * 0.55f;
            }
        }
        else
        {
            // Electric: inverter + carrier
            const float RotorHz = std::max(0.0f, Current.Rpm / 60.0f);
            const uint32_t PP = BoundSpec ? BoundSpec->Electric.PolePairs : 6;
            const float ElecHz = RotorHz * static_cast<float>(PP);
            ElectricPhase += TwoPi * (180.0f + ElecHz) * Dt;
            CarrierPhase  += TwoPi * (8200.0f + ElecHz * 0.35f) * Dt;
            const float EGain = (0.03f + 0.55f * Current.Throttle01 + 0.18f * Current.Load01) * 0.13f + Current.VehicleSpeed * 0.0015f + (Current.Brake01 > 0.15f ? 0.06f + Current.Brake01 * 0.07f : 0);
            // FM: carrier modulates electric phase
            const float FM = std::sin(CarrierPhase) * 0.18f;
            Sample += std::sin(ElectricPhase + FM) * EGain + std::sin(ElectricPhase * 2.0f) * EGain * 0.22f;
        }

        // Wind: bandpassed noise ∝ v¹·⁴⁵
        {
            const float V = Current.VehicleSpeed;
            const float Wind = std::pow(std::min(1.0f, V / 42.0f), 1.45f) * 0.13f;
            const float Wn = NextRand01() * 2 - 1;
            // one-pole highish
            Sample += Wn * Wind * 0.12f;
        }

        // Bursts
        for (auto It = Bursts.begin(); It != Bursts.end(); )
        {
            const float Env = (It->Remaining / std::max(0.001f, It->Duration));
            const float Amp = It->Gain * std::pow(Env, 1.7f) * std::exp(-(It->Duration - It->Remaining) * 12.0f);
            float Bv = 0;
            if (It->Kind == 0) // pop: filtered noise + sine
            {
                It->Phase += TwoPi * It->Frequency * Dt;
                Bv = (std::sin(It->Phase) * 0.42f + (NextRand01()*2-1)*0.58f) * Amp * 0.62f;
            }
            else if (It->Kind == 1) // BOV: chirped hiss
            {
                It->Phase += TwoPi * (It->Frequency - (It->Duration - It->Remaining) * 6200.0f * 0.5f) * Dt;
                Bv = (std::sin(It->Phase) * 0.32f + (NextRand01()*2-1)*0.56f) * Amp * 0.55f;
            }
            else if (It->Kind == 2) // limiter tick
            {
                Bv = (NextRand01()*2-1) * Amp * 0.35f * std::pow(Env, 2.8f);
            }
            else if (It->Kind == 3) // shift thump: triangle-ish low
            {
                It->Phase += TwoPi * (52.0f + (It->Remaining/It->Duration)*18.0f) * Dt;
                // triangle approx via asin(sin)
                Bv = std::asin(std::sin(It->Phase)) * 0.636f * Amp * 0.52f;
            }
            Sample += Bv;
            It->Remaining -= Dt;
            if (It->Remaining <= 0) It = Bursts.erase(It);
            else ++It;
        }

        // Exhaust saturation and high shelf (soft)
        Sample = FastTanh(Sample * 1.15f) * 0.92f;

        // Master
        Sample *= Config.MasterGain;
        Sample = std::clamp(Sample, -1.0f, 1.0f);

        for (uint32_t Ch = 0; Ch < Channels; ++Ch)
            Output[Frame * Channels + Ch] = Sample;
    }
}

} // namespace Frontier
