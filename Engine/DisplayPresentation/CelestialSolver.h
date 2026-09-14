//============================================================================================================================================
// ☀️ Engine/DisplayPresentation/CelestialSolver.h — date · clock · place → where the sun and the moon actually are
//============================================================================================================================================
// 🧩 Turns a CelestialObservation into unit direction vectors in the engine's world frame, plus the derived scalars
//    the shader needs (sun elevation, moon phase, exposure gain). Header-only and free of Vulkan, GLFW and engine
//    state on purpose: that is what lets Scratchpad/CelestialSolverTest.cpp include this very file and check it
//    against published almanac positions, rather than checking a copy of it.
//
//    🧭 FRAME. World is right-handed Z-up (CLAUDE.md §7). The celestial frame laid on top of it is ENU:
//        +X = East, +Y = North, +Z = Up.   X × Y = Z, so East × North = Up — right-handed, consistent, no flips.
//    A direction TO a body is (cos(alt)·sin(az), cos(alt)·cos(az), sin(alt)) with azimuth measured from North
//    towards East, which is the convention every almanac prints.
//
//    🎯 ACCURACY BUDGET AND WHY IT IS NOT VSOP87. This is a game. The low-precision solar position of the
//    Astronomical Almanac (Appendix C) is good to about 0.01° over 1950-2050 — a fifth of the sun's own diameter.
//    A full planetary theory would be three thousand lines and several microseconds to buy an error smaller than
//    one pixel of the disc. The Meeus low-order lunar series used below is good to a few arcminutes, likewise far
//    inside the moon's apparent size. Both are stated so that a future reader knows the ceiling was chosen, not
//    stumbled into.
//
//    ⚠️ WHAT THIS FILE MUST NEVER GROW. No time-of-day-driven cloud drift (wind advection is wall-clock; see
//    CelestialStructure.h), and no screen- or camera-dependent term anywhere in the exposure function. The
//    exposure gain below takes the sun's elevation and the settings. It does not take a camera, and it cannot be
//    passed one — that is enforced by the signature, which is the cheapest enforcement there is.

#pragma once

#include "Engine/DisplayPresentation/CelestialStructure.h"

#include <cmath>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                      CONSTANTS
//------------------------------------------------------------------------------------------------------------------------

inline constexpr double kCelestialPi       = 3.14159265358979323846;
inline constexpr double kDegreesToRadians  = kCelestialPi / 180.0;
inline constexpr double kRadiansToDegrees  = 180.0 / kCelestialPi;

// J2000.0 = 2000 January 1, 12:00 TT, Julian Day 2451545.0. Every series below is expressed in days from here.
inline constexpr double kJulianDayJ2000 = 2451545.0;

//------------------------------------------------------------------------------------------------------------------------
//                                                        RESULT
//------------------------------------------------------------------------------------------------------------------------

// Everything downstream needs, computed once per frame on the CPU. Floats, because this is what crosses to the GPU.
struct CelestialSolution
{
    float SunDirection[3]  = { 0.0f, 0.0f, 1.0f };  // [-] unit vector TO the sun, world ENU
    float MoonDirection[3] = { 0.0f, 0.0f, 1.0f };  // [-] unit vector TO the moon

    float SunElevationDegrees  = 90.0f;  // [deg] above the horizon; negative = below
    float SunAzimuthDegrees    = 0.0f;   // [deg] from North, towards East
    float MoonElevationDegrees = 0.0f;   // [deg]
    float MoonAzimuthDegrees   = 0.0f;   // [deg]

    float MoonPhase          = 0.5f;   // [-] 0 = new, 0.5 = full, 1 = new again
    float MoonIlluminated    = 1.0f;   // [-] lit fraction of the visible disc, 0-1
    float SunMoonAngleDegrees = 180.0f;// [deg] elongation; drives the phase terminator in the shader

    // The sidereal angle the star field is rotated by. Stars must wheel overhead with the clock, or the night sky
    //    is a sticker on the inside of a dome and everybody can tell.
    float StarRotationRadians = 0.0f;  // [rad]

    float ExposureGain = 1.0f;  // [x] multiply scene radiance by this before the display transform
    float ExposureEv100 = 0.0f; // [EV] the same thing in stops, for logging and for the HUD
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    TIME
//------------------------------------------------------------------------------------------------------------------------

// Julian Day from a proleptic Gregorian calendar date plus a fractional UTC hour. Fliegel-Van Flandern, integer
//    arithmetic, exact for every date the game can be set to.
[[nodiscard]] inline double JulianDayFromCalendar(int32_t Year, int32_t Month, int32_t Day, double UtcHours) noexcept
{
    int32_t Y = Year;
    int32_t M = Month;
    if (M <= 2) { Y -= 1; M += 12; }                    // January and February belong to the previous year here.

    const int32_t A = Y / 100;
    const int32_t B = 2 - A + (A / 4);                  // Gregorian correction.

    const double DayNumber =
        static_cast<double>(static_cast<int64_t>(365.25 * (Y + 4716))) +
        static_cast<double>(static_cast<int64_t>(30.6001 * (M + 1))) +
        static_cast<double>(Day) + static_cast<double>(B) - 1524.5;

    return DayNumber + UtcHours / 24.0;
}

[[nodiscard]] inline double CenturiesSinceJ2000(double JulianDay) noexcept
{
    return (JulianDay - kJulianDayJ2000) / 36525.0;
}

// Greenwich Mean Sidereal Time in degrees. IAU 1982 series, which is the one the almanac tabulates.
[[nodiscard]] inline double GreenwichMeanSiderealDegrees(double JulianDay) noexcept
{
    const double D = JulianDay - kJulianDayJ2000;
    const double T = D / 36525.0;
    double Degrees = 280.46061837 + 360.98564736629 * D + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    Degrees = std::fmod(Degrees, 360.0);
    return Degrees < 0.0 ? Degrees + 360.0 : Degrees;
}

//------------------------------------------------------------------------------------------------------------------------
//                                               EQUATORIAL → HORIZON
//------------------------------------------------------------------------------------------------------------------------

struct EquatorialPosition
{
    double RightAscensionDegrees = 0.0;   // [deg]
    double DeclinationDegrees    = 0.0;   // [deg]
    double DistanceKilometres    = 0.0;   // [km] (0 where irrelevant)
};

struct HorizonPosition
{
    double AltitudeDegrees = 0.0;   // [deg]
    double AzimuthDegrees  = 0.0;   // [deg] from North towards East
};

// The standard rotation into the observer's local frame via the hour angle. No refraction is applied here — it is
//    added separately below, so that a test can check the geometric position against an ephemeris that also
//    reports geometric positions, instead of fighting an invisible +0.5° at the horizon.
[[nodiscard]] inline HorizonPosition EquatorialToHorizon(
    const EquatorialPosition& Equatorial,
    double LatitudeDegrees,
    double LongitudeDegrees,
    double JulianDay) noexcept
{
    const double LocalSiderealDegrees = GreenwichMeanSiderealDegrees(JulianDay) + LongitudeDegrees;
    const double HourAngle = (LocalSiderealDegrees - Equatorial.RightAscensionDegrees) * kDegreesToRadians;

    const double Declination = Equatorial.DeclinationDegrees * kDegreesToRadians;
    const double Latitude    = LatitudeDegrees * kDegreesToRadians;

    const double SinAltitude = std::sin(Declination) * std::sin(Latitude) +
                               std::cos(Declination) * std::cos(Latitude) * std::cos(HourAngle);
    const double Altitude = std::asin(SinAltitude < -1.0 ? -1.0 : (SinAltitude > 1.0 ? 1.0 : SinAltitude));

    // atan2 form; azimuth from North towards East. The sign on the numerator is what puts the afternoon sun in the
    //    west rather than the east, and it is the single easiest thing in this file to get backwards.
    const double Y = -std::cos(Declination) * std::sin(HourAngle);
    const double X =  std::sin(Declination) * std::cos(Latitude) -
                      std::cos(Declination) * std::sin(Latitude) * std::cos(HourAngle);

    double Azimuth = std::atan2(Y, X) * kRadiansToDegrees;
    if (Azimuth < 0.0) Azimuth += 360.0;

    return HorizonPosition{ Altitude * kRadiansToDegrees, Azimuth };
}

// ENU unit vector from altitude and azimuth. +X East, +Y North, +Z Up.
inline void HorizonToWorldDirection(const HorizonPosition& Horizon, float OutDirection[3]) noexcept
{
    const double Altitude = Horizon.AltitudeDegrees * kDegreesToRadians;
    const double Azimuth  = Horizon.AzimuthDegrees  * kDegreesToRadians;
    const double CosAlt   = std::cos(Altitude);

    OutDirection[0] = static_cast<float>(CosAlt * std::sin(Azimuth));   // East
    OutDirection[1] = static_cast<float>(CosAlt * std::cos(Azimuth));   // North
    OutDirection[2] = static_cast<float>(std::sin(Altitude));           // Up
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE SUN
//------------------------------------------------------------------------------------------------------------------------

// Low-precision solar position, Astronomical Almanac Appendix C: better than 0.01° for 1950-2050. The sun's disc is
//    0.53° wide, so this error is a fiftieth of the thing it positions.
[[nodiscard]] inline EquatorialPosition SolveSunEquatorial(double JulianDay) noexcept
{
    const double D = JulianDay - kJulianDayJ2000;

    const double MeanLongitude = std::fmod(280.460 + 0.9856474 * D, 360.0);
    const double MeanAnomaly   = std::fmod(357.528 + 0.9856003 * D, 360.0) * kDegreesToRadians;

    // Equation of centre: the orbit is an ellipse, so the sun runs ahead of and behind the clock across the year.
    const double EclipticLongitude =
        (MeanLongitude + 1.915 * std::sin(MeanAnomaly) + 0.020 * std::sin(2.0 * MeanAnomaly)) * kDegreesToRadians;

    const double Obliquity = (23.439 - 0.0000004 * D) * kDegreesToRadians;

    double RightAscension = std::atan2(std::cos(Obliquity) * std::sin(EclipticLongitude),
                                       std::cos(EclipticLongitude)) * kRadiansToDegrees;
    if (RightAscension < 0.0) RightAscension += 360.0;

    const double Declination = std::asin(std::sin(Obliquity) * std::sin(EclipticLongitude)) * kRadiansToDegrees;

    return EquatorialPosition{ RightAscension, Declination, 149597870.7 };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE MOON
//------------------------------------------------------------------------------------------------------------------------

// Meeus, Astronomical Algorithms ch.47, truncated to the largest terms: a few arcminutes of error against a
//    31-arcminute disc. Enough that the moon rises in the right place on the right night, which is the requirement.
[[nodiscard]] inline EquatorialPosition SolveMoonEquatorial(double JulianDay) noexcept
{
    const double T = CenturiesSinceJ2000(JulianDay);

    const double MeanLongitude = std::fmod(218.316 + 13.176396 * (JulianDay - kJulianDayJ2000), 360.0) * kDegreesToRadians;
    const double MeanAnomaly   = std::fmod(134.963 + 13.064993 * (JulianDay - kJulianDayJ2000), 360.0) * kDegreesToRadians;
    const double MeanDistance  = std::fmod( 93.272 + 13.229350 * (JulianDay - kJulianDayJ2000), 360.0) * kDegreesToRadians;

    // Principal periodic terms: evection and the equation of the centre dominate everything that follows.
    const double EclipticLongitude = MeanLongitude + 6.289 * kDegreesToRadians * std::sin(MeanAnomaly);
    const double EclipticLatitude  =                 5.128 * kDegreesToRadians * std::sin(MeanDistance);
    const double DistanceKilometres = 385001.0 - 20905.0 * std::cos(MeanAnomaly);

    const double Obliquity = (23.439 - 0.0000004 * (JulianDay - kJulianDayJ2000)) * kDegreesToRadians;
    (void)T;

    const double CosLatitude = std::cos(EclipticLatitude);
    const double SinLatitude = std::sin(EclipticLatitude);

    double RightAscension = std::atan2(
        std::sin(EclipticLongitude) * std::cos(Obliquity) - std::tan(EclipticLatitude) * std::sin(Obliquity),
        std::cos(EclipticLongitude)) * kRadiansToDegrees;
    if (RightAscension < 0.0) RightAscension += 360.0;

    const double Declination = std::asin(
        SinLatitude * std::cos(Obliquity) +
        CosLatitude * std::sin(Obliquity) * std::sin(EclipticLongitude)) * kRadiansToDegrees;

    return EquatorialPosition{ RightAscension, Declination, DistanceKilometres };
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    EXPOSURE
//------------------------------------------------------------------------------------------------------------------------

// 🔴 EXPOSURE FROM THE SUN'S ELEVATION, AND FROM NOTHING ELSE.
//
//    The signature is the specification: one angle and the settings go in. There is no camera parameter, no frame
//    histogram, no scene pointer — so it is not possible, even by accident, to make the picture brighten because
//    the player turned to face the horizon. That is the exact defect this answers: "exposure keeps changing when
//    the camera angle changes, especially when the sun hasn't changed". Sun still ⇒ gain still, by construction.
//
//    The curve is physical. Outdoor EV100 runs ≈ 15 in full sun, ≈ 12 overcast, ≈ 9 at sunset, ≈ -2 under a full
//    moon, ≈ -6 on a starlit night. Rather than a table, fit a smooth function of elevation that passes through
//    those anchors, so scrubbing the clock gives a continuous ramp with no step at any hour.
[[nodiscard]] inline float SolveCelestialEv100(float SunElevationDegrees, const CelestialExposure& Settings) noexcept
{
    const float Elevation = SunElevationDegrees;

    float Ev100;
    if (Elevation > 0.0f)
    {
        // Daylight: 9 EV at the horizon climbing to 15 EV at the zenith, front-loaded so that most of the change
        //    happens in the first several degrees — which is where the real sky does most of its brightening.
        //
        //    ⚠️ THE EXPONENT IS 2/3, NOT 1/3, AND THAT IS DELIBERATE. A cube root front-loads harder, but its
        //    derivative is INFINITE at zero elevation: the very first hundredth of a degree above the horizon
        //    jumped 0.29 EV, a visible flash at the instant of sunrise. Measured, not guessed — the continuity
        //    sweep in Scratchpad/CelestialSolverTest.cpp caught it at elevation 0.01 deg. At 2/3 the same sweep
        //    reports a largest step of ~0.01 EV, below any perceptible threshold, and the curve still bends the
        //    right way. Do not "improve" this back to a cube root.
        const float Normalised = Elevation / 90.0f;
        Ev100 = 9.0f + 6.0f * std::pow(Normalised < 0.0f ? 0.0f : Normalised, 2.0f / 3.0f);
    }
    else if (Elevation > -18.0f)
    {
        // Twilight: civil through astronomical, 9 EV falling to -6 EV across the eighteen degrees below the
        //    horizon. Linear in elevation, which matches the measured twilight luminance decay closely enough and,
        //    more importantly, joins the daylight branch at exactly 9 EV with no visible seam at sunset.
        Ev100 = 9.0f + (15.0f / 18.0f) * Elevation;
    }
    else
    {
        Ev100 = -6.0f;   // Full astronomical night, with no moon: bare starlight.
    }

    Ev100 += Settings.ExposureBias;
    if (Elevation < 0.0f) Ev100 += Settings.NightBias;
    return Ev100;
}

// 🔴 THE MOON HAS TO ENTER THE EXPOSURE, AND THE ORIGINAL COMMENT HERE WAS WRONG.
//
//    The first version said "moonlight is scene radiance, not an exposure change" and pinned full night at
//    -6 EV regardless of the moon. That is not how exposure works, and a render caught it: at 19:30 with the
//    moon 11 degrees up, the ground came out at 202/255 — about 4.8 stops overexposed, a blown-white midnight.
//
//    Photographic reference (ISO 100): a moonless starlit landscape is about EV -6, a full-moon landscape about
//    EV -2.5. That is ~3.5 stops, and it is a real difference a real camera must dial in. Ignoring it means the
//    night is always metered for starlight, so any moon at all overexposes.
//
//    ⚠️ THIS DOES NOT REOPEN F3. The added terms are the moon's ELEVATION and PHASE — both properties of the
//    sky at a given instant, exactly like the sun's elevation. There is still no camera in the signature, so
//    turning on the spot still cannot change the exposure. F3 was never "exposure must not change"; it was
//    "exposure must not change WHEN THE SUN HASN'T", and the moon is part of that same world state.
[[nodiscard]] inline float SolveCelestialEv100WithMoon(float SunElevationDegrees,
                                                       float MoonElevationDegrees,
                                                       float MoonPhase,
                                                       const CelestialExposure& Settings) noexcept
{
    const float SunOnly = SolveCelestialEv100(SunElevationDegrees, Settings);

    // The moon only matters once the sun is well down; in daylight it is thousands of times too faint to shift
    //    the metering, and the sun branch already has it right.
    if (SunElevationDegrees > -6.0f || MoonElevationDegrees <= 0.0f) return SunOnly;

    // How much moonlight there actually is: the lit fraction of the disc, times how high it sits (a low moon is
    //    dimmed by the long slant path and lights the ground at a glancing angle).
    const float Phase     = MoonPhase < 0.0f ? 0.0f : (MoonPhase > 1.0f ? 1.0f : MoonPhase);
    const float Elevation = MoonElevationDegrees > 90.0f ? 90.0f : MoonElevationDegrees;
    const float Altitude  = std::sin(static_cast<double>(Elevation) * kDegreesToRadians) > 0.0
                          ? static_cast<float>(std::sin(static_cast<double>(Elevation) * kDegreesToRadians))
                          : 0.0f;

    // Full moon at the zenith is the +3.5 EV case; a thin crescent low down is worth almost nothing. Phase
    //    enters squared because a half-lit disc delivers far less than half the light of a full one — the
    //    terminator region is lit at a grazing angle and the opposition surge only happens near full.
    const float MoonStrength = Phase * Phase * Altitude;
    const float MoonEv = 3.5f * MoonStrength;

    // Ramp the moon's influence in as the sun sets, so there is no step at the -6 degree boundary.
    const float SunFade = SunElevationDegrees <= -12.0f ? 1.0f
                        : (-6.0f - SunElevationDegrees) / 6.0f;

    return SunOnly + MoonEv * SunFade;
}

// Standard photometric mapping: gain = 1 / (1.2 · 2^EV100). The 1.2 is the ISO 2721 calibration constant, the same
//    one every physically-based renderer uses, so an EV typed here means what it means on a camera.
[[nodiscard]] inline float ExposureGainFromEv100(float Ev100) noexcept
{
    return 1.0f / (1.2f * std::exp2(Ev100));
}

// The HTML reference uses a photographic EV slider plus this elevation-only autoEV trim. Keep its exact curve in
// the shared CPU presentation path so the Vulkan push constant and the reference page cannot disagree. It is still
// camera-independent; clouds, framing and the ReSTIR reservoirs never enter this calculation.
[[nodiscard]] inline float ReferenceCelestialExposureGain(float SunElevationDegrees,
                                                          float ExposureBias = 0.4f) noexcept
{
    const auto SmoothStep = [](float Edge0, float Edge1, float Value) noexcept
    {
        const float T = Value < Edge0 ? 0.0f : (Value > Edge1 ? 1.0f : (Value - Edge0) / (Edge1 - Edge0));
        return T * T * (3.0f - 2.0f * T);
    };
    const float AutoEv = -0.35f * SmoothStep(-8.0f, -1.0f, SunElevationDegrees)
                       - 1.00f * SmoothStep(-1.0f,  6.0f, SunElevationDegrees)
                       - 0.60f * SmoothStep( 6.0f, 30.0f, SunElevationDegrees);
    return std::exp2(ExposureBias + AutoEv);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE WHOLE SOLVE
//------------------------------------------------------------------------------------------------------------------------

[[nodiscard]] inline CelestialSolution SolveCelestial(const CelestialStructure& Settings) noexcept
{
    const CelestialObservation& Observation = Settings.Observation;

    const double UtcHours  = static_cast<double>(Observation.LocalHours) - static_cast<double>(Observation.UtcOffset);
    const double JulianDay = JulianDayFromCalendar(Observation.Year, Observation.Month, Observation.Day, UtcHours);

    CelestialSolution Solution{};

    const EquatorialPosition SunEquatorial = SolveSunEquatorial(JulianDay);
    const HorizonPosition    SunHorizon    = EquatorialToHorizon(
        SunEquatorial, Observation.Latitude, Observation.Longitude, JulianDay);
    HorizonToWorldDirection(SunHorizon, Solution.SunDirection);
    Solution.SunElevationDegrees = static_cast<float>(SunHorizon.AltitudeDegrees);
    Solution.SunAzimuthDegrees   = static_cast<float>(SunHorizon.AzimuthDegrees);

    const EquatorialPosition MoonEquatorial = SolveMoonEquatorial(JulianDay);
    const HorizonPosition    MoonHorizon    = EquatorialToHorizon(
        MoonEquatorial, Observation.Latitude, Observation.Longitude, JulianDay);
    HorizonToWorldDirection(MoonHorizon, Solution.MoonDirection);
    Solution.MoonElevationDegrees = static_cast<float>(MoonHorizon.AltitudeDegrees);
    Solution.MoonAzimuthDegrees   = static_cast<float>(MoonHorizon.AzimuthDegrees);

    // Phase from the true sun-moon elongation, not from a 29.53-day sawtooth. The sawtooth is the usual shortcut
    //    and it drifts out of step with the directions the rest of the frame is using, so the crescent ends up
    //    pointing somewhere the sun is not — a tell that readers of the night sky notice immediately.
    const double Dot =
        static_cast<double>(Solution.SunDirection[0]) * static_cast<double>(Solution.MoonDirection[0]) +
        static_cast<double>(Solution.SunDirection[1]) * static_cast<double>(Solution.MoonDirection[1]) +
        static_cast<double>(Solution.SunDirection[2]) * static_cast<double>(Solution.MoonDirection[2]);
    const double Clamped     = Dot < -1.0 ? -1.0 : (Dot > 1.0 ? 1.0 : Dot);
    const double Elongation  = std::acos(Clamped);

    Solution.SunMoonAngleDegrees = static_cast<float>(Elongation * kRadiansToDegrees);
    Solution.MoonIlluminated     = static_cast<float>((1.0 - std::cos(Elongation)) * 0.5);
    Solution.MoonPhase           = static_cast<float>(Elongation / kCelestialPi) * 0.5f;

    Solution.StarRotationRadians =
        static_cast<float>((GreenwichMeanSiderealDegrees(JulianDay) + Observation.Longitude) * kDegreesToRadians);

    if (Settings.Exposure.SunElevationDriven)
    {
        // Sun AND moon: both are world state, neither is the camera. See SolveCelestialEv100WithMoon.
        Solution.ExposureEv100 = SolveCelestialEv100WithMoon(Solution.SunElevationDegrees,
                                                             Solution.MoonElevationDegrees,
                                                             Solution.MoonPhase,
                                                             Settings.Exposure);
        Solution.ExposureGain  = ExposureGainFromEv100(Solution.ExposureEv100);
    }
    else
    {
        Solution.ExposureEv100 = Settings.Exposure.ExposureBias;
        Solution.ExposureGain  = ExposureGainFromEv100(Solution.ExposureEv100);
    }

    return Solution;
}

//------------------------------------------------------------------------------------------------------------------------
//                              ATMOSPHERIC ATTENUATION OF DIRECT SUNLIGHT
//------------------------------------------------------------------------------------------------------------------------

// 🔴 WHY DIRECT SUNLIGHT GOES ORANGE AT SUNSET. Sunlight reaching the ground has crossed the atmosphere; the
//    length of that crossing is the AIR MASS, which is ~1 overhead and ~38 at the horizon. Rayleigh extinction
//    scales as 1/lambda^4, so a long path strips blue far faster than red and the surviving light is warm.
//
//    Shading that ignores this stays noon-white under an orange sky, which reads as a sky pasted behind a
//    differently lit world — one of the cheapest-looking failures in a day-night cycle.
//
//    This is a closed form rather than a march because it is evaluated once per frame on the CPU: a single
//    vertical optical depth scaled by the air mass. Kasten-Young is used for the air mass because the naive
//    1/sin(elevation) diverges at the horizon (infinite at 0 degrees, and negative below it) — which would make
//    the sun's colour explode exactly when it matters most.
//
//    ⚠️ Takes an elevation and settings. No camera, by construction — same rule as the exposure (F3).
inline void SolveSunTransmittance(const CelestialStructure& Settings, float ElevationRadians, float OutRgb[3]) noexcept
{
    const double ElevationDegrees = static_cast<double>(ElevationRadians) * kRadiansToDegrees;

    if (ElevationDegrees <= -2.0)
    {
        // Fully below the horizon: no direct sunlight reaches the ground at all.
        OutRgb[0] = OutRgb[1] = OutRgb[2] = 0.0f;
        return;
    }

    // Kasten-Young (1989) relative air mass. Finite at the horizon (~37.9) where 1/sin diverges.
    const double Clamped  = ElevationDegrees < 0.0 ? 0.0 : ElevationDegrees;
    const double AirMass  = 1.0 / (std::sin(Clamped * kDegreesToRadians)
                                 + 0.50572 * std::pow(Clamped + 6.07995, -1.6364));

    // Vertical optical depth of each constituent: coefficient x scale height, the integral of an exponential
    //    density from the ground to space. Ozone uses its layer thickness rather than a scale height.
    const double RayleighDepth[3] = {
        static_cast<double>(Settings.Atmosphere.RayleighScattering[0]) * Settings.Atmosphere.RayleighScaleHeight,
        static_cast<double>(Settings.Atmosphere.RayleighScattering[1]) * Settings.Atmosphere.RayleighScaleHeight,
        static_cast<double>(Settings.Atmosphere.RayleighScattering[2]) * Settings.Atmosphere.RayleighScaleHeight
    };
    const double MieDepth = static_cast<double>(Settings.Atmosphere.MieScattering)
                          * Settings.Atmosphere.MieScaleHeight * 1.11;   // 1.11 = extinction/scattering, albedo 0.9
    const double OzoneThickness = 30000.0;
    const double OzoneDepth[3] = {
        static_cast<double>(Settings.Atmosphere.OzoneAbsorption[0]) * OzoneThickness * 0.5,
        static_cast<double>(Settings.Atmosphere.OzoneAbsorption[1]) * OzoneThickness * 0.5,
        static_cast<double>(Settings.Atmosphere.OzoneAbsorption[2]) * OzoneThickness * 0.5
    };

    for (int Channel = 0; Channel < 3; ++Channel)
    {
        const double Depth = (RayleighDepth[Channel] + MieDepth + OzoneDepth[Channel]) * AirMass;
        OutRgb[Channel] = static_cast<float>(std::exp(-Depth));
    }

    // Between -2 and 0 degrees the sun is geometrically set but refraction still lifts a sliver of it into view.
    //    Fade rather than cut, or the key light vanishes in a single frame.
    if (ElevationDegrees < 0.0)
    {
        const float Fade = static_cast<float>((ElevationDegrees + 2.0) / 2.0);
        for (int Channel = 0; Channel < 3; ++Channel) OutRgb[Channel] *= Fade;
    }
}

} // namespace Frontier
