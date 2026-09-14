//============================================================================================================================================
//                                                      EXPOSUREINTEGRATOR.CPP
//============================================================================================================================================

#include "ExposureIntegrator.h"

#include <algorithm>
#include <cmath>

namespace Frontier {

void ExposureIntegrator::ObserveLuminance(float AverageLogLuminance) noexcept
{
    // The reduction pass reports a LOG mean; converting back here rather than there keeps the shader's job to
    //    one sum and keeps the exponential in the one place that also owns the clamping.
    const float Linear = std::exp(AverageLogLuminance);

    // A NaN would propagate into the adapted value and never leave — every subsequent frame would compare
    //    against it and stay NaN, so the screen would go black permanently rather than for one frame.
    ObservedLuminance = (std::isfinite(Linear) && Linear > Config.LuminanceFloor) ? Linear : Config.LuminanceFloor;
}

void ExposureIntegrator::Advance(float DeltaSeconds) noexcept
{
    if (DeltaSeconds <= 0.0f) return;

    // ── Celestial easing ────────────────────────────────────────────────────────────────────────────────────
    // Frame-rate independent, and in LOG space for the same reason the luminance adaptation is: the gain spans
    //    six orders of magnitude across a day, so a linear approach would stall and then snap.
    //
    //    🔴 Note what is NOT read here: nothing measured from the frame. The eased quantity is a function of the
    //    sun's elevation and elapsed time only, which is what keeps F3 fixed.
    {
        const float Target = std::max(Config.CelestialGain, Config.MinimumExposure);
        if (CelestialEasedGain < 0.0f || Config.CelestialEaseSeconds <= 1.0e-4f)
        {
            CelestialEasedGain = Target;   // first frame, or easing disabled: adopt immediately
        }
        else
        {
            const float Blend = 1.0f - std::exp(-DeltaSeconds / Config.CelestialEaseSeconds);
            const float LogNow    = std::log(std::max(CelestialEasedGain, Config.MinimumExposure));
            const float LogTarget = std::log(Target);
            CelestialEasedGain = std::exp(LogNow + (LogTarget - LogNow) * Blend);
        }
    }

    // Asymmetric: the direction of change picks the time constant. Brightening is the fast one because a viewer
    //    expects a bright doorway to resolve almost at once, while dark adaptation genuinely takes seconds.
    const bool  Brightening = ObservedLuminance > AdaptedLuminance;
    const float TimeConstant = Brightening ? Config.BrightenSeconds : Config.DarkenSeconds;

    // Exponential approach, framed so the result is INDEPENDENT OF FRAME RATE. The naive
    //    `Adapted += (Observed − Adapted) * Rate * Δτ` adapts faster at high frame rates, which means the look
    //    of a transition changes with the hardware it runs on. 1 − e^(−Δτ/τ) does not.
    const float Blend = (TimeConstant > 1.0e-4f)
                      ? 1.0f - std::exp(-DeltaSeconds / TimeConstant)
                      : 1.0f;

    // Interpolate in LOG space. In linear space a move from 0.001 to 1.0 spends almost all its time in the last
    //    few percent of the numeric range while the visible brightness barely moves, so the transition appears
    //    to stall and then snap.
    const float LogAdapted  = std::log(std::max(AdaptedLuminance,  Config.LuminanceFloor));
    const float LogObserved = std::log(std::max(ObservedLuminance, Config.LuminanceFloor));
    AdaptedLuminance = std::exp(LogAdapted + (LogObserved - LogAdapted) * Blend);
}

float ExposureIntegrator::KeyForLuminance(float Luminance, const ExposureConfiguration& Config) noexcept
{
    const float Safe = std::max(Luminance, Config.LuminanceFloor);
    if (Safe >= Config.PhotopicLuminance) return Config.KeyValue;   // full daylight adaptation, unchanged

    // A power law rather than a straight line, because perceived brightness follows the ratio of luminances,
    //    not their difference. With the exponent at 0 this returns the constant key and the whole feature is
    //    off, which is the identity switch back to the pre-A7c curve.
    const float Ratio = Safe / Config.PhotopicLuminance;
    return Config.KeyValue * std::pow(Ratio, Config.ScotopicExponent);
}

float ExposureIntegrator::ExposureForLuminance(float Luminance, const ExposureConfiguration& Config) noexcept
{
    const float Safe = std::max(Luminance, Config.LuminanceFloor);
    return std::clamp(KeyForLuminance(Safe, Config) / Safe, Config.MinimumExposure, Config.MaximumExposure);
}

float ExposureIntegrator::QueryColourSaturation() const noexcept
{
    // Manual mode is an identity switch for the whole adaptive path, and that has to include this: an image
    //    made before the curve existed must still be reproducible exactly.
    if (Config.Mode == ExposureModeCategory::Manual) return 1.0f;

    const float Floor   = std::max(Config.ScotopicFloor, 1.0e-9f);
    const float Ceiling = std::max(Config.ScotopicCeiling, Floor * 1.001f);
    const float Low     = std::log(Floor), High = std::log(Ceiling);
    const float Here    = std::log(std::max(AdaptedLuminance, 1.0e-9f));
    return std::clamp((Here - Low) / (High - Low), 0.0f, 1.0f);
}

float ExposureIntegrator::QueryExposure() const noexcept
{
    if (Config.Mode == ExposureModeCategory::Manual) return Config.ManualExposure;

    // 🔴 P4/F3. Celestial returns the solver's gain and reads NOTHING measured from the frame — not
    //    AdaptedLuminance, not ObservedLuminance. That omission is the entire fix: there is no frame-dependent
    //    term, so there is no mechanism by which turning the camera can change the exposure. A reviewer can
    //    confirm the property by reading this one branch, and the gate asserts the branch stays this shape.
    if (Config.Mode == ExposureModeCategory::Celestial)
    {
        const float Gain = CelestialEasedGain >= 0.0f ? CelestialEasedGain : Config.CelestialGain;
        return std::clamp(Gain, Config.MinimumExposure, Config.MaximumExposure);
    }

    return ExposureForLuminance(AdaptedLuminance, Config);
}

} // namespace Frontier
