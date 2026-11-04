/*==========================================================================================================================================
                                                      AUDIO SYNTHESIZER — SAMPLE GENERATOR
                                     ------------------------------------------------------------------
                 Additive engine harmonics, forced-induction whine and secondary layers. Sample-rate driven.
==========================================================================================================================================*/

// 🧩 Audio synthesizer: additive engine harmonics, forced-induction whine and secondary layers. Sample-rate driven.

#pragma once

#include "Engine/Audio/DrivetrainSimulation.h"
#include "Engine/Audio/VehicleAudioSpecification.h"

#include <array>
#include <cstdint>
#include <vector>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                   SYNTH STATE
//------------------------------------------------------------------------------------------------------------------------

struct AudioSynthesizerState
{
    float MasterGain   = 0.92f; // [0..1]
    bool  EnableLimiter = true;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                AUDIO SYNTHESIZER
//------------------------------------------------------------------------------------------------------------------------

// Fills PCM at the audio device's sample rate. All phase accumulators advance per sample, so a stalled
// render thread cannot starve audio — only the 240 Hz drivetrain snapshot drives frequency targets.
class AudioSynthesizer
{
  public:
    explicit AudioSynthesizer(const VehicleAudioSpecification* Spec = nullptr) noexcept;

    void Attach(const VehicleAudioSpecification* Spec) noexcept;
    void Configure(AudioSynthesizerState S) noexcept { Config = S; }

    // Snapshot from DrivetrainSimulation::QuerySnapshot() — call at the fixed 240 Hz cadence.
    void PushSnapshot(const DrivetrainSnapshot& Snap) noexcept;

    // Secondary trigger: call once per popped event from DrivetrainSimulation::Advance().
    void TriggerSecondary(const SecondaryEvent& Event) noexcept;

    // Generate interleaved or mono PCM. Buffer is float [-1..1]. Phase is continuous across calls.
    void Generate(float* Output, uint32_t FrameCount, uint32_t Channels, float SampleRate) noexcept;

    void Reset() noexcept;

  private:
    struct HarmonicVoice
    {
        float Order  = 0;
        float Weight = 0;
        float Phase  = 0;   // [rad]
        float TargetGain = 0;
        float CurrentGain = 0;
    };

    struct Burst
    {
        float Remaining = 0; // [s]
        float Duration  = 0; // [s]
        float Gain      = 0;
        float Frequency = 0; // [Hz]
        float Phase     = 0;
        int   Kind      = 0; // 0 pop, 1 bov, 2 limiter tick
    };

    const VehicleAudioSpecification* BoundSpec = nullptr;
    AudioSynthesizerState            Config;

    // Snapshot follower (slewed per sample toward target)
    DrivetrainSnapshot Current{};
    DrivetrainSnapshot Target{};

    std::vector<HarmonicVoice> Voices;
    std::vector<Burst>         Bursts;

    float CrankPhase   = 0; // [rad] crank integral
    float TurboPhase   = 0; // [rad]
    float SCPhase      = 0; // [rad]
    float RumblePhase  = 0;
    float ElectricPhase = 0;
    float CarrierPhase  = 0;
    float NoiseState    = 0; // for filtered noise approximation
    float SampleRateCache = 48000;

    float IntakeGainCur  = 0;
    float TurboGainCur   = 0;
    float SCGainCur      = 0;

    uint32_t RandState = 2166136261u;
    float    NextRand01() noexcept;
};

} // namespace Frontier
