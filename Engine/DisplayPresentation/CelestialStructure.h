//============================================================================================================================================
// 📦 Engine/DisplayPresentation/CelestialStructure.h — every celestial property, in one place, with its slider metadata
//============================================================================================================================================
// 🧩 The single source of truth for sun · sky · clouds · fog · moon · stars. Nothing else declares a celestial
//    default; the ephemeris reads this, the UBO packer reads this, the TOML loader writes this, and (P8) a slider
//    panel is a projection of the metadata below rather than a second list that can disagree with it.
//
//    ⚠️ WHY THE METADATA LIVES NEXT TO THE FIELD. A separate table of "here are the sliders" is a copy, and copies
//    drift: a field gets a new default and the slider keeps the old range, or a field is added and no control ever
//    appears. `CelestialProperty` below binds name · unit · range · default to the field's own address, so a
//    control cannot exist for a field that is gone, and a field cannot be added without declaring how it is edited.
//    CheckCelestialRecord.sh asserts every float field in the struct appears exactly once in the property table.
//
//    Units are stated on every field and are SI unless marked. Angles are degrees in the interface (that is what a
//    person types) and converted to radians at the point of use, never stored half-converted.
//
// Naming: `Structure` per CLAUDE.md §2 — this is a topology/settings representation, not an algorithm.

#pragma once

#include <cstddef>
#include <cstdint>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                  OBSERVATION (where and when)
//------------------------------------------------------------------------------------------------------------------------

// The clock and the place. Everything celestial is derived from these six numbers plus the wall clock — there is no
//    "sun direction" setting, because a hand-set sun direction and a date that disagree is a bug waiting to be filed.
struct CelestialObservation
{
    int32_t Year  = 2026;      // [y]
    int32_t Month = 9;         // [1-12]
    int32_t Day   = 13;        // [1-31]

    float LocalHours = 12.0f;  // [h]   local clock time, 0-24, fractional
    float UtcOffset  = 2.0f;   // [h]   +2 = SAST (the user's timezone)
    float Latitude   = -26.19f;// [deg] +N  (Benoni, Gauteng)
    float Longitude  = 28.32f; // [deg] +E
};

//------------------------------------------------------------------------------------------------------------------------
//                                                      THE SUN
//------------------------------------------------------------------------------------------------------------------------

struct CelestialSun
{
    // ⚠️ ANGULAR DIAMETER, not radius. The sun is 0.53° across as seen from Earth; the shader halves it. Stated in
    //    diameter because that is the number an astronomer or an artist quotes, and the halving is done once, in
    //    one place, where it can be checked.
    float AngularDiameterDegrees = 0.53f;   // [deg]
    float Intensity              = 22.0f;   // [x]   radiance multiplier for the disc and the light
    float TemperatureKelvin      = 5800.0f; // [K]   black-body tint; 5800 K is the photosphere
    float LimbDarkening          = 0.45f;   // [-]   0 = flat disc, 1 = fully dark limb (0.45 ≈ solar visible band)
};

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE ATMOSPHERE
//------------------------------------------------------------------------------------------------------------------------

// Hillaire 2020 parameterisation. The Rayleigh triple is the 680/550/440 nm set — the ratio between the channels is
//    why the sky is blue and the sunset is red, so those are physics and the *Strength* multipliers are the taste.
struct CelestialAtmosphere
{
    float RayleighScattering[3] = { 5.8e-6f, 13.5e-6f, 33.1e-6f };  // [1/m] at sea level
    float MieScattering         = 21.0e-6f;                          // [1/m]
    float OzoneAbsorption[3]    = { 0.65e-6f, 1.881e-6f, 0.085e-6f };// [1/m] Chappuis band — keeps twilight blue

    float RayleighStrength = 1.0f;      // [x]
    float MieStrength      = 1.0f;      // [x]  haze
    float OzoneStrength    = 1.2f;      // [x]

    float RayleighScaleHeight = 8000.0f;  // [m]   molecular e-folding height
    float MieScaleHeight      = 1200.0f;  // [m]   aerosols hug the ground
    float MieAnisotropy       = 0.78f;    // [-]   Henyey-Greenstein g: the forward glow around the sun

    float PlanetRadius     = 6371000.0f;  // [m]   Earth mean radius
    float AtmosphereHeight = 100000.0f;   // [m]   Kármán line; top of the modelled shell

    float GroundAlbedo[3] = { 0.30f, 0.30f, 0.30f };   // [-] feeds the multiple-scattering LUT
};

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE CLOUDS
//------------------------------------------------------------------------------------------------------------------------

struct CelestialClouds
{
    float Coverage   = 0.45f;    // [-]   0 = clear, 1 = overcast
    float Density    = 1.0f;     // [x]
    float BaseHeight = 1500.0f;  // [m]   above the ground plane
    float Thickness  = 900.0f;   // [m]
    float ShapeScale = 1400.0f;  // [m]   wavelength of the base Perlin-Worley shape
    float DetailScale = 0.6f;    // [-]   Worley erosion strength
    float Anvil      = 0.3f;     // [-]   upper-level shear/spread

    // Lighting (Schneider/Guerrilla): dual-lobe HG + Beer-powder. Defaults are the reference panel's.
    float ForwardLobe  = 0.80f;  // [-]   g1, forward scattering
    float BackwardLobe = 0.30f;  // [-]   g2, backscatter
    float LobeMix      = 0.30f;  // [-]   blend between the two lobes
    float Absorption   = 0.05f;  // [1/m]
    float AmbientScale = 0.90f;  // [x]   sky contribution to the in-scatter
    float PowderScale  = 0.60f;  // [-]   dark-edge term
};

// A box-bounded local cloud volume — the "local clouds" of the brief. Sits in world space, independent of the layer.
struct CelestialLocalCloud
{
    bool  Enabled   = false;
    float Centre[3] = { 40.0f, -160.0f, 120.0f };   // [m]
    float Extent[3] = { 90.0f,   70.0f,  35.0f };   // [m] half-extents
    float Density   = 1.2f;                          // [x]
    float Coverage  = 0.30f;                         // [-]
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       THE FOG
//------------------------------------------------------------------------------------------------------------------------

// Atmospheric (aerial-perspective) fog: the whole-world haze that makes distance readable.
struct CelestialAtmosphericFog
{
    bool  Enabled     = true;
    float Density     = 7.0e-5f;   // [1/m] extinction at the reference height
    float HeightScale = 1200.0f;   // [m]   e-folding height of the fog column
    float SunScatter  = 0.70f;     // [-]   how much sunlight forward-scatters into the fog
};

// Local fog: a box-bounded ground volume — valley mist, a fogged room.
struct CelestialLocalFog
{
    bool  Enabled   = false;
    float Centre[3] = {  6.0f,  -14.0f,  2.5f };   // [m]
    float Extent[3] = { 18.0f,   18.0f,  4.0f };   // [m] half-extents
    float Density   = 0.011f;                       // [1/m]
    float Anisotropy = 0.45f;                       // [-] HG g for the fog phase function
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  THE MOON AND THE STARS
//------------------------------------------------------------------------------------------------------------------------

struct CelestialMoon
{
    bool  Enabled                = true;
    float AngularDiameterDegrees = 0.52f;   // [deg]
    float Brightness             = 1.6f;    // [x]
    float Albedo                 = 0.12f;   // [-]  the Moon is dark rock; 0.12 is the Bond albedo
    float Earthshine             = 0.02f;   // [x]  the ashen glow on the unlit limb
};

struct CelestialStars
{
    bool  Enabled    = true;
    float Brightness = 1.0f;    // [x]
    float Density    = 1.0f;    // [x]
    float SizeScale  = 1.0f;    // [x]
    float MilkyWay   = 1.0f;    // [x]
    // ⚠️ NOT a "hide in daylight" switch. Stars are always in the sky; they vanish at noon because the sky's own
    //    radiance is four orders of magnitude above them, which the physical model produces for free. A visibility
    //    flag here would be a lie that also breaks the "moon and stars can show during the day" requirement — a
    //    bright moon at 3pm is real, and it must come out of the radiance comparison, not out of a special case.
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       THE WIND
//------------------------------------------------------------------------------------------------------------------------

// ⚠️ The wind drives the cloud field on WALL time, never on time-of-day. Scrubbing the clock from 06:00 to 18:00
//    must not translate the clouds by twelve hours of drift — that was a real, reported bug in an earlier attempt
//    at this feature ("scrubbing the time slider teleports clouds kilometres per minute").
struct CelestialWind
{
    float SpeedMetresPerSecond = 4.2f;    // [m/s]
    float DirectionDegrees     = 214.0f;  // [deg] the direction the wind comes FROM (meteorological convention)
    float Shear                = 0.6f;    // [-]   speed gain with altitude
    float VeerDegrees          = 18.0f;   // [deg] direction rotation with altitude
    float Gust                 = 0.25f;   // [-]
    float Turbulence           = 0.2f;    // [-]
};

//------------------------------------------------------------------------------------------------------------------------
//                                                      EXPOSURE
//------------------------------------------------------------------------------------------------------------------------

// 🔴 THE RULE THAT KILLS THE OLDEST COMPLAINT. Celestial exposure is a function of the SUN'S ELEVATION and nothing
//    else. Not of what is on screen, not of where the camera points. Turning to face the bright horizon, or away to
//    the dark zenith, must not change the gain by one bit — otherwise the user sees "the exposure keeps changing
//    when the camera angle changes, even when the sun hasn't moved", which is exactly the report this design answers.
//    Frame metering still exists (ExposureIntegrator, --adaptive) for A/B, but it is NOT the celestial default.
struct CelestialExposure
{
    bool  SunElevationDriven = true;    // [-]   the default: gain from the sun's altitude alone
    float ExposureBias       = 0.4f;    // [EV]  artistic offset applied on top (the reference panel's pp_ev)
    float NightBias          = 0.0f;    // [EV]  extra lift below the horizon, for legibility
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    THE WHOLE THING
//------------------------------------------------------------------------------------------------------------------------

struct CelestialStructure
{
    bool Enabled = true;   // [-] master switch: off = the pre-celestial black-miss renderer, byte for byte

    CelestialObservation    Observation{};
    CelestialSun            Sun{};
    CelestialAtmosphere     Atmosphere{};
    CelestialClouds         Clouds{};
    CelestialLocalCloud     LocalCloud{};
    CelestialAtmosphericFog AtmosphericFog{};
    CelestialLocalFog       LocalFog{};
    CelestialMoon           Moon{};
    CelestialStars          Stars{};
    CelestialWind           Wind{};
    CelestialExposure       Exposure{};
};

//------------------------------------------------------------------------------------------------------------------------
//                                              THE PROPERTY TABLE (the "sliders")
//------------------------------------------------------------------------------------------------------------------------

enum class CelestialPropertyKind : uint8_t { Real = 0u, Switch = 1u };

// One editable property: what it is called, what it means, and what a legal value looks like. `Offset` is the
//    field's byte offset inside CelestialStructure, so an editor reaches the field without a switch statement and
//    a renamed field breaks the build rather than silently editing the wrong thing.
struct CelestialProperty
{
    const char*           Path;      // "sun.intensity" — the TOML key and the panel label, one string
    const char*           Unit;      // "deg", "m", "x", "" …
    CelestialPropertyKind Kind;
    size_t                Offset;    // [B] offsetof into CelestialStructure
    float                 Minimum;   // slider bounds; advisory for TOML (out-of-range is clamped and warned)
    float                 Maximum;
    const char*           Summary;
};

#define FRONTIER_CELESTIAL_REAL(PathText, UnitText, Field, Lo, Hi, SummaryText) \
    CelestialProperty{ PathText, UnitText, CelestialPropertyKind::Real, offsetof(CelestialStructure, Field), Lo, Hi, SummaryText }
#define FRONTIER_CELESTIAL_SWITCH(PathText, Field, SummaryText) \
    CelestialProperty{ PathText, "", CelestialPropertyKind::Switch, offsetof(CelestialStructure, Field), 0.0f, 1.0f, SummaryText }

// The table. Order is the order a panel would present them; grouping follows the structs above.
inline constexpr CelestialProperty kCelestialProperties[] =
{
    FRONTIER_CELESTIAL_SWITCH("celestial.enabled", Enabled, "master switch for the whole celestial system"),

    FRONTIER_CELESTIAL_REAL("time.hours",     "h",   Observation.LocalHours, 0.0f, 24.0f, "local clock time"),
    FRONTIER_CELESTIAL_REAL("time.utcOffset", "h",   Observation.UtcOffset, -12.0f, 14.0f, "timezone offset from UTC"),
    FRONTIER_CELESTIAL_REAL("site.latitude",  "deg", Observation.Latitude,  -90.0f, 90.0f, "observer latitude, +N"),
    FRONTIER_CELESTIAL_REAL("site.longitude", "deg", Observation.Longitude,-180.0f, 180.0f, "observer longitude, +E"),

    FRONTIER_CELESTIAL_REAL("sun.angularDiameter", "deg", Sun.AngularDiameterDegrees, 0.05f, 5.0f,  "apparent size of the disc"),
    FRONTIER_CELESTIAL_REAL("sun.intensity",       "x",   Sun.Intensity,              0.0f, 200.0f, "radiance multiplier"),
    FRONTIER_CELESTIAL_REAL("sun.temperature",     "K",   Sun.TemperatureKelvin,   1000.0f, 12000.0f, "black-body tint"),
    FRONTIER_CELESTIAL_REAL("sun.limbDarkening",   "-",   Sun.LimbDarkening,          0.0f, 1.0f,   "edge falloff across the disc"),

    FRONTIER_CELESTIAL_REAL("atmosphere.rayleigh",    "x", Atmosphere.RayleighStrength, 0.0f, 4.0f,  "blue-sky scattering"),
    FRONTIER_CELESTIAL_REAL("atmosphere.mie",         "x", Atmosphere.MieStrength,      0.0f, 8.0f,  "haze"),
    FRONTIER_CELESTIAL_REAL("atmosphere.ozone",       "x", Atmosphere.OzoneStrength,    0.0f, 4.0f,  "keeps twilight blue"),
    FRONTIER_CELESTIAL_REAL("atmosphere.mieG",        "-", Atmosphere.MieAnisotropy,   -0.9f, 0.95f, "forward glow around the sun"),
    FRONTIER_CELESTIAL_REAL("atmosphere.planetRadius","m", Atmosphere.PlanetRadius, 1.0e5f, 2.0e7f,  "planet radius"),
    FRONTIER_CELESTIAL_REAL("atmosphere.height",      "m", Atmosphere.AtmosphereHeight, 1.0e4f, 2.0e5f, "top of the shell"),

    FRONTIER_CELESTIAL_REAL("clouds.coverage",   "-", Clouds.Coverage,    0.0f, 1.0f,    "clear to overcast"),
    FRONTIER_CELESTIAL_REAL("clouds.density",    "x", Clouds.Density,     0.0f, 4.0f,    "optical thickness"),
    FRONTIER_CELESTIAL_REAL("clouds.baseHeight", "m", Clouds.BaseHeight,  0.0f, 12000.0f,"cloud base above ground"),
    FRONTIER_CELESTIAL_REAL("clouds.thickness",  "m", Clouds.Thickness,  10.0f, 8000.0f, "vertical extent"),
    FRONTIER_CELESTIAL_REAL("clouds.shapeScale", "m", Clouds.ShapeScale, 50.0f, 10000.0f,"size of the puffs"),
    FRONTIER_CELESTIAL_REAL("clouds.detail",     "-", Clouds.DetailScale, 0.0f, 1.0f,    "edge erosion"),
    FRONTIER_CELESTIAL_REAL("clouds.anvil",      "-", Clouds.Anvil,       0.0f, 1.0f,    "upper-level spread"),
    FRONTIER_CELESTIAL_REAL("clouds.powder",     "-", Clouds.PowderScale, 0.0f, 1.0f,    "dark-edge term"),

    FRONTIER_CELESTIAL_SWITCH("localCloud.enabled",  LocalCloud.Enabled, "box-bounded local cloud volume"),
    FRONTIER_CELESTIAL_REAL("localCloud.density", "x", LocalCloud.Density,  0.0f, 8.0f, "local volume density"),
    FRONTIER_CELESTIAL_REAL("localCloud.coverage","-", LocalCloud.Coverage, 0.0f, 1.0f, "local volume coverage"),

    FRONTIER_CELESTIAL_SWITCH("fog.enabled", AtmosphericFog.Enabled, "whole-world aerial perspective"),
    FRONTIER_CELESTIAL_REAL("fog.density",     "1/m", AtmosphericFog.Density,     0.0f, 0.01f,  "extinction per metre"),
    FRONTIER_CELESTIAL_REAL("fog.heightScale", "m",   AtmosphericFog.HeightScale, 1.0f, 20000.0f,"fog column e-folding height"),
    FRONTIER_CELESTIAL_REAL("fog.sunScatter",  "-",   AtmosphericFog.SunScatter,  0.0f, 1.0f,   "forward scatter of sunlight"),

    FRONTIER_CELESTIAL_SWITCH("localFog.enabled", LocalFog.Enabled, "box-bounded ground fog"),
    FRONTIER_CELESTIAL_REAL("localFog.density",    "1/m", LocalFog.Density,    0.0f, 1.0f,  "local fog extinction"),
    FRONTIER_CELESTIAL_REAL("localFog.anisotropy", "-",   LocalFog.Anisotropy,-0.9f, 0.9f,  "fog phase function g"),

    FRONTIER_CELESTIAL_SWITCH("moon.enabled", Moon.Enabled, "draw and light from the moon"),
    FRONTIER_CELESTIAL_REAL("moon.angularDiameter","deg", Moon.AngularDiameterDegrees, 0.05f, 5.0f, "apparent size"),
    FRONTIER_CELESTIAL_REAL("moon.brightness",     "x",   Moon.Brightness,   0.0f, 20.0f, "radiance multiplier"),
    FRONTIER_CELESTIAL_REAL("moon.albedo",         "-",   Moon.Albedo,       0.0f, 1.0f,  "surface reflectance"),
    FRONTIER_CELESTIAL_REAL("moon.earthshine",     "x",   Moon.Earthshine,   0.0f, 1.0f,  "ashen glow on the dark limb"),

    FRONTIER_CELESTIAL_SWITCH("stars.enabled", Stars.Enabled, "draw the star field"),
    FRONTIER_CELESTIAL_REAL("stars.brightness","x", Stars.Brightness, 0.0f, 20.0f, "radiance multiplier"),
    FRONTIER_CELESTIAL_REAL("stars.density",   "x", Stars.Density,    0.0f, 4.0f,  "how many are drawn"),
    FRONTIER_CELESTIAL_REAL("stars.size",      "x", Stars.SizeScale,  0.0f, 8.0f,  "point size"),
    FRONTIER_CELESTIAL_REAL("stars.milkyWay",  "x", Stars.MilkyWay,   0.0f, 4.0f,  "galactic band strength"),

    FRONTIER_CELESTIAL_REAL("wind.speed",      "m/s", Wind.SpeedMetresPerSecond, 0.0f, 60.0f,  "surface wind speed"),
    FRONTIER_CELESTIAL_REAL("wind.direction",  "deg", Wind.DirectionDegrees,     0.0f, 360.0f, "direction the wind comes FROM"),
    FRONTIER_CELESTIAL_REAL("wind.shear",      "-",   Wind.Shear,                0.0f, 4.0f,   "speed gain with altitude"),
    FRONTIER_CELESTIAL_REAL("wind.veer",       "deg", Wind.VeerDegrees,        -90.0f, 90.0f,  "direction rotation with altitude"),
    FRONTIER_CELESTIAL_REAL("wind.gust",       "-",   Wind.Gust,                 0.0f, 2.0f,   "gust amplitude"),
    FRONTIER_CELESTIAL_REAL("wind.turbulence", "-",   Wind.Turbulence,           0.0f, 2.0f,   "small-scale swirl"),

    FRONTIER_CELESTIAL_SWITCH("exposure.sunElevationDriven", Exposure.SunElevationDriven,
                              "gain from the sun's altitude alone, never from the framing"),
    FRONTIER_CELESTIAL_REAL("exposure.bias",      "EV", Exposure.ExposureBias, -8.0f, 8.0f, "artistic offset"),
    FRONTIER_CELESTIAL_REAL("exposure.nightBias", "EV", Exposure.NightBias,    -8.0f, 8.0f, "extra lift after dark"),
};

inline constexpr size_t kCelestialPropertyCount = sizeof(kCelestialProperties) / sizeof(kCelestialProperties[0]);

// Typed access. These are the ONLY way an editor or loader should touch a property, so bounds and kind are always
//    honoured; reaching into the struct by offset from elsewhere defeats the point of the table.
[[nodiscard]] inline float ReadCelestialReal(const CelestialStructure& S, const CelestialProperty& P) noexcept
{
    return *reinterpret_cast<const float*>(reinterpret_cast<const unsigned char*>(&S) + P.Offset);
}

[[nodiscard]] inline bool ReadCelestialSwitch(const CelestialStructure& S, const CelestialProperty& P) noexcept
{
    return *reinterpret_cast<const bool*>(reinterpret_cast<const unsigned char*>(&S) + P.Offset);
}

// Clamped on write, deliberately: a TOML file is hand-edited and a typo should produce a usable scene plus a
//    warning, not a NaN that propagates into the LUTs and blanks the sky.
inline void WriteCelestialReal(CelestialStructure& S, const CelestialProperty& P, float Value) noexcept
{
    const float Clamped = Value < P.Minimum ? P.Minimum : (Value > P.Maximum ? P.Maximum : Value);
    *reinterpret_cast<float*>(reinterpret_cast<unsigned char*>(&S) + P.Offset) = Clamped;
}

inline void WriteCelestialSwitch(CelestialStructure& S, const CelestialProperty& P, bool Value) noexcept
{
    *reinterpret_cast<bool*>(reinterpret_cast<unsigned char*>(&S) + P.Offset) = Value;
}

} // namespace Frontier
