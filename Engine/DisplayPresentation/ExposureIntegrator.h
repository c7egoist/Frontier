//============================================================================================================================================
//                                                       EXPOSUREINTEGRATOR.H
//============================================================================================================================================
// 🧩 Exposure — Manual by default (a fixed tone-map scalar), with an Adaptive frame-metered mode kept for A/B.
//
//    Manual is the default because a moving exposure makes the ReSTIR estimate unjudgeable: when the tone map
//    chases the frame, a dolly in or out reads as the SCENE getting brighter or darker, and no accumulation or
//    reservoir behaviour can be separated from the gain riding on top of it. Adaptive stays available behind the
//    --adaptive flag so the two can be compared on the same scene.
//
//    Named …Integrator because it advances a differential equation over time (CLAUDE.md §2.7): the adapted
//    luminance chases the measured one, and that chase IS the phenomenon. A Solver would be wrong — nothing
//    here is a constraint to satisfy.
//
//    🔴 The measurement is a LOG mean, never a linear one. A linear average is dominated by whatever is
//    brightest, so a luminaire entering frame would drag the mean up by orders of magnitude and black out the
//    whole image. Human brightness perception is roughly logarithmic, and so is this.
//
//    The adaptation is deliberately ASYMMETRIC. Adapting to bright is fast — the iris closes in under a second,
//    and a viewer expects a bright doorway to resolve almost immediately. Adapting to dark is slow, because
//    that is what it is: walking into a dark room, everything is black and then gradually is not. Symmetric
//    rates feel wrong in both directions at once.

#pragma once

#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                     CONFIGURATION
//------------------------------------------------------------------------------------------------------------------------

enum class ExposureModeCategory : uint32_t
{
    Manual    = 0u,   // the fixed value — reproduces every pre-A6b image exactly
    Adaptive  = 1u,   // measured from the frame and eased over time
    Celestial = 2u,   // 🔴 P4/F3: driven by the SUN'S ELEVATION and nothing else
};

struct ExposureConfiguration
{
    // 🔴 Manual FIRST. Adaptive frame metering moves with the framing by construction — dolly toward a bright
    //    wall and the meter follows the wall — so it is the wrong default for diagnosing the renderer itself.
    ExposureModeCategory Mode = ExposureModeCategory::Manual;

    float ManualExposure   = 1.05f;    // [-]   used in Manual mode; also the value Adaptive starts from

    // ── Celestial exposure ──────────────────────────────────────────────────────────────────────────────────
    // 🔴 THE F3 FIX, STATED AS A MODE. The reported failure was "exposure keeps changing when camera angle
    //    changes, especially when sun hasn't changed". Adaptive does that BY CONSTRUCTION — it meters the frame,
    //    so turning to face a bright wall is indistinguishable from the wall getting brighter. Manual does not
    //    drift, but it also cannot follow a day-night cycle, so a scene correctly exposed at noon is unreadable
    //    at dusk.
    //
    //    Celestial is the third option and the right one outdoors: the gain comes from the SUN'S ELEVATION,
    //    which is a property of the world clock, not of where anyone is looking. Point the camera anywhere you
    //    like — the exposure does not move. Let an hour pass and it tracks the sky exactly as a real camera on
    //    manual-but-metered-for-daylight would.
    //
    //    The value is supplied by CelestialSolver::SolveCelestialEv100, whose signature takes an angle and
    //    settings and has no way to reach a camera. That is deliberate: the guarantee is structural rather than
    //    a promise to be careful.
    float CelestialGain    = 1.0f;     // [-]   set each frame from the solver in Celestial mode

    // ⚠️ EASED, AND THE REASON IS MEASURED. At realtime the curve's steepest point is 0.015 EV/s — far below the
    //    ~0.1 EV/s at which flicker becomes noticeable — so easing is unnecessary for a normal day. But under a
    //    60x time-lapse (`--time-rate 60`) the same curve reaches 0.91 EV/s at the horizon, which visibly
    //    pumps. A 4-second time constant on the GAIN removes that without touching the curve itself.
    //
    //    🔴 THIS DOES NOT REOPEN F3. The eased quantity is still a function of sun elevation alone; easing adds
    //    a dependence on TIME, never on the camera. Turning on the spot still cannot change the exposure,
    //    because nothing the camera does enters the input.
    float CelestialEaseSeconds = 4.0f;  // [s] 0 disables easing entirely
    float KeyValue         = 0.18f;    // [-]   the mid-grey a correctly exposed scene should average to
    float BrightenSeconds  = 0.40f;    // [s]   time constant when the scene gets BRIGHTER (iris closes fast)
    float DarkenSeconds    = 2.20f;    // [s]   and when it gets DARKER (dark adaptation is genuinely slow)

    // Bounds on the exposure itself. Without a ceiling, a nearly black frame drives exposure toward infinity
    //    and amplifies pure noise into a grey blizzard; without a floor, a blown frame drives it to zero
    //    and the image never recovers. These bounds exist to stop divergence on a degenerate frame, not to
    //    express taste.
    float MinimumExposure  = 1.0e-10f;   // [-]
    float MaximumExposure  = 4000.0f;    // [-]

    // 🔴 Numerical epsilon ONLY, and it has to be tiny. The metering decision lives in the histogram, where
    //    it is a percentile of the frame and has no absolute value in it; this is left doing the one job it
    //    should ever have had: keeping log() finite.
    float LuminanceFloor   = 1.0e-6f;  // [cd/m²]

    // ── Dark adaptation ─────────────────────────────────────────────────────────────────────────────────────
    // 🔴 An exposure of Key/L renders EVERY scene at the same mid-grey. That is not what eyes do: below roughly
    //    the luminance of a dim interior the retina switches from cone to rod vision and stops compensating
    //    fully, so a dark scene genuinely looks darker, not merely bluer.
    //
    //    So the target grey itself falls with the adapted luminance, as a power law below the photopic level
    //    and not at all above it. At and above PhotopicLuminance the key is exactly KeyValue, so every image
    //    made before this existed is reproduced unchanged — the curve only does anything in the dark.
    float PhotopicLuminance = 5.0f;    // [cd/m²] at and above this the eye is fully light-adapted
    float ScotopicExponent  = 0.30f;   // [-]     0 = no dark adaptation at all, 1 = night renders as day

    // ── Colour at low light ─────────────────────────────────────────────────────────────────────────────────
    // 🔴 Cones stop responding before rods do, so below about 3 cd/m² colour drains out of what you see and by
    //    0.003 it is gone entirely. The tone map mixes toward grey by the ramp below, in LOG luminance, because
    //    that span is three orders of magnitude and a linear ramp would spend almost all of itself in the top
    //    decade and switch colour off like a light.
    float ScotopicCeiling   = 3.0f;    // [cd/m²] at and above this, colour is complete
    float ScotopicFloor     = 0.003f;  // [cd/m²] at and below this, vision is achromatic
};

//------------------------------------------------------------------------------------------------------------------------
//                                                      INTEGRATOR
//------------------------------------------------------------------------------------------------------------------------

class ExposureIntegrator
{
public:
    void AssignConfiguration(const ExposureConfiguration& Value) noexcept { Config = Value; }
    [[nodiscard]] const ExposureConfiguration& QueryConfiguration() const noexcept { return Config; }

    // The frame's measured average log luminance, as produced by the reduction pass. Supplying it separately
    //    from Advance keeps this testable without a GPU: the whole adaptation curve is exercised by feeding a
    //    sequence of measurements.
    void ObserveLuminance(float AverageLogLuminance) noexcept;

    // What the adaptation is actually chasing: the frame reading, in Adaptive mode.
    [[nodiscard]] float QueryObservedLuminance() const noexcept { return ObservedLuminance; }

    // Ease the adapted value toward the observed one. Δτ is the frame time.
    void Advance(float DeltaSeconds) noexcept;

    // What the tone map should use this frame. This is the ONLY value the renderer reads, so Manual and
    //    Adaptive cannot diverge into two code paths.
    [[nodiscard]] float QueryExposure() const noexcept;

    // The adapted scene luminance, for display.
    [[nodiscard]] float QueryAdaptedLuminance() const noexcept { return AdaptedLuminance; }

    // How much colour the eye still has at the adapted level: 1 in bright scenes, 0 in near-black ones.
    //    The tone map mixes toward grey by this. Always 1 in Manual mode.
    [[nodiscard]] float QueryColourSaturation() const noexcept;

    // Supply this frame's celestial gain, computed by the solver from the sun's elevation. Separate from
    //    Advance so the whole mode is testable with no GPU and no clock.
    void ObserveCelestialGain(float Gain) noexcept { Config.CelestialGain = Gain; }

    // The eased value actually used, for display and for tests.
    [[nodiscard]] float QueryCelestialEasedGain() const noexcept { return CelestialEasedGain; }

    // Jump straight to the measurement, with no easing. For a camera cut or a scene load, where easing would
    //    show the viewer several seconds of the previous scene's exposure.
    void Snap() noexcept { AdaptedLuminance = ObservedLuminance; }

    // Exposure that would render a scene of the given luminance at the key value for that luminance.
    [[nodiscard]] static float ExposureForLuminance(float Luminance, const ExposureConfiguration& Config) noexcept;

    // The mid-grey a scene of this luminance should be rendered to. Constant in daylight, falling in the dark.
    //    Exposed separately because it is the one part of the curve with a claim worth asserting on its own.
    [[nodiscard]] static float KeyForLuminance(float Luminance, const ExposureConfiguration& Config) noexcept;

private:
    ExposureConfiguration Config{};
    float ObservedLuminance = 0.18f;   // [cd/m²] the most recent frame reading — what the adaptation chases
    float AdaptedLuminance  = 0.18f;   // [cd/m²] what the eye currently believes
    float CelestialEasedGain = -1.0f;  // [-]     eased celestial gain; negative means "not yet initialised"
};

} // namespace Frontier
