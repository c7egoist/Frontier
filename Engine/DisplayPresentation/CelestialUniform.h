//============================================================================================================================================
// 📤 Engine/DisplayPresentation/CelestialUniform.h — the exact bytes the shader reads
//============================================================================================================================================
// 🧩 CelestialStructure is what a person edits; CelestialUniform is what the GPU sees. They are deliberately
//    different types. The editable struct has bools, doubles-worth of precision, and fields grouped for a human;
//    the uniform is std140-aligned, float-only, and grouped for the hardware. PackCelestialUniform is the one
//    place the two meet, so a layout mistake is a compile error in one file rather than a mystery in the sky.
//
//    ⚠️ std140 IS NOT C++ LAYOUT, AND THE TRAP IS vec3. In std140 a vec3 is aligned to 16 bytes and padded to 16
//    bytes, so `vec3 a; float b;` puts b at offset 16 on the CPU but the GPU also puts it at 16 — that one happens
//    to agree. What does NOT agree is an array: `float x[4]` is 16 bytes in C++ and 64 bytes in std140, because
//    every array element is padded to 16. There are therefore NO scalar arrays in this struct. Every vec3 is
//    written as an explicit vec4 with its trailing float given a job, which both removes the padding question and
//    stops four bytes per vector being wasted. Every static_assert below is load-bearing.
//
//    🔴 WHY A UNIFORM BUFFER AND NOT THE PUSH BLOCK. The push block has 7 spare uints — 28 bytes. The celestial
//    state below is 432 bytes (27 vec4s) and will not shrink. Pushing it is not an option; this was checked rather than
//    assumed. The buffer is written every frame from the CPU solve (F4: nothing is baked).

#pragma once

#include "Engine/DisplayPresentation/CelestialSolver.h"

#include <cstdint>
#include <cstring>

namespace Frontier {

// Local to the packer: the record ships angles in radians, the settings hold degrees.
inline constexpr float kDegreesToRadiansF = 0.01745329251994330f;

//------------------------------------------------------------------------------------------------------------------------
//                                                   THE GPU RECORD
//------------------------------------------------------------------------------------------------------------------------

// Mirrored by `CelestialRecord` in Engine/Shaders/ReSTIRViewport.slang. The field order here IS the field order
//    there; CheckCelestialSolver.sh compares the two field-by-field so they cannot drift.
struct alignas(16) CelestialUniform
{
    // ── Sun ───────────────────────────────────────────────────────────────────────────────────────────────────
    float SunDirectionAndCosRadius[4];   // xyz = unit direction TO the sun, w = cos(angular radius)
    float SunRadianceAndLimb[4];         // rgb = DISC radiance [W/m2/sr], w = limb darkening
    float SunIrradianceAndScale[4];      // rgb = top-of-atmosphere IRRADIANCE [W/m2], w = sky scale
    float SunTransmittance[4];           // rgb = atmospheric transmittance to the sun at ground level, w unused

    // ── Moon ──────────────────────────────────────────────────────────────────────────────────────────────────
    // The four flare vec4s are an ABI-preserving control bridge to the HTML reference lensFlare() shader.
    float FlareStreakAndFlags[4];        // x master, y halo radius (screen units), z streak, w legacy element bits
    float FlareGhostAndCount[4];         // w = reference ghost count; x..z retained for config compatibility
    float FlareBurstAndChroma[4];        // z = reference type (0 cinematic, 1 anamorphic, 2 starburst, 3 halo), w blades
    float FlareChromaAndFade[4];         // x chromatic, y occlusion fade, z/w reserved
    float MoonDirectionAndCosRadius[4];  // xyz = unit direction TO the moon, w = cos(angular radius)
    float MoonRadianceAndEarthshine[4];  // rgb = radiance, w = earthshine

    // ── Atmosphere ────────────────────────────────────────────────────────────────────────────────────────────
    float RayleighScatteringAndHeight[4];// rgb = 1/m at sea level (already scaled), w = scale height [m]
    float MieScatteringAndHeight[4];     // rgb = 1/m, w = scale height [m]
    float OzoneAbsorptionAndG[4];        // rgb = 1/m, w = Mie anisotropy g
    float GroundAlbedoAndPlanetRadius[4];// rgb = albedo, w = planet radius [m]
    float AtmosphereHeightAndFog[4];     // x = shell height [m], y = fog density [1/m],
                                         // z = fog height scale [m], w = fog sun scatter

    // ── Clouds ────────────────────────────────────────────────────────────────────────────────────────────────
    float CloudLayer[4];                 // x = coverage, y = density, z = base height [m], w = thickness [m]
    float CloudShape[4];                 // x = shape scale [m], y = detail, z = anvil, w = powder
    float CloudLighting[4];              // x = forward g, y = backward g, z = lobe mix, w = ambient scale
    float CloudAbsorptionAndWind[4];     // x = absorption [1/m], yz = wind drift offset [m], w = wind speed [m/s]
    float WindShear[4];                  // x = shear, y = veer [rad], z = gust, w = turbulence

    // ── Local volumes ─────────────────────────────────────────────────────────────────────────────────────────
    float LocalCloudCentreAndDensity[4]; // xyz = centre [m], w = density (0 = disabled)
    float LocalCloudExtentAndCoverage[4];// xyz = half-extents [m], w = coverage
    float LocalFogCentreAndDensity[4];   // xyz = centre [m], w = density [1/m] (0 = disabled)
    float LocalFogExtentAndG[4];         // xyz = half-extents [m], w = anisotropy

    // ── Night sky and exposure ────────────────────────────────────────────────────────────────────────────────
    float StarsAndRotation[4];           // x = brightness, y = density, z = size, w = sidereal rotation [rad]
    float ExposureAndFlags[4];           // x = exposure gain, y = EV100, z = sun elevation [deg],
                                         // w = feature bits, bit-packed as a float (see kCelestialFlag*)
    float MilkyWayAndMoonPhase[4];       // x = milky way strength, y = lit fraction, z = elongation [rad],
                                         // w = wall-clock seconds, for the wind (NOT the time of day)
};

// ⚠️ Feature bits travel in a float because a std140 uint next to floats invites a packing mistake for no gain;
//    the values are small integers and float-exact. Read on the GPU with `(uint(w) & kBit) != 0u`.
inline constexpr uint32_t kCelestialFlagEnabled    = 1u << 0u;
inline constexpr uint32_t kCelestialFlagFog        = 1u << 1u;
inline constexpr uint32_t kCelestialFlagLocalFog   = 1u << 2u;
inline constexpr uint32_t kCelestialFlagLocalCloud = 1u << 3u;
inline constexpr uint32_t kCelestialFlagMoon       = 1u << 4u;
inline constexpr uint32_t kCelestialFlagStars      = 1u << 5u;

//------------------------------------------------------------------------------------------------------------------------
//                                                  LAYOUT GUARANTEES
//------------------------------------------------------------------------------------------------------------------------

static_assert(sizeof(CelestialUniform) == 432, "the shader's CelestialRecord must be resized to match");
static_assert(alignof(CelestialUniform) == 16, "std140 requires 16-byte alignment");
static_assert(sizeof(CelestialUniform) % 16 == 0, "std140 pads the block to a multiple of 16");
static_assert(offsetof(CelestialUniform, SunRadianceAndLimb) == 16, "sun radiance moved");
static_assert(offsetof(CelestialUniform, MoonDirectionAndCosRadius) == 128, "moon block moved");
static_assert(offsetof(CelestialUniform, RayleighScatteringAndHeight) == 160, "atmosphere block moved");
static_assert(offsetof(CelestialUniform, CloudLayer) == 240, "cloud block moved");
static_assert(offsetof(CelestialUniform, LocalCloudCentreAndDensity) == 320, "local volume block moved");
static_assert(offsetof(CelestialUniform, StarsAndRotation) == 384, "night sky block moved");
static_assert(offsetof(CelestialUniform, ExposureAndFlags) == 400, "exposure moved");

//------------------------------------------------------------------------------------------------------------------------
//                                              BLACK-BODY COLOUR
//------------------------------------------------------------------------------------------------------------------------

// The sun's tint from its temperature. Planckian locus approximation (Kim et al. 2002 cubic in 1/T) followed by a
//    CIE xy → linear sRGB conversion, normalised so that luminance is 1 — the *Intensity* slider owns brightness
//    and this owns only hue, which is what keeps the two controls from fighting each other.
inline void BlackBodyLinearRgb(float TemperatureKelvin, float OutRgb[3]) noexcept
{
    const double T = TemperatureKelvin < 1667.0f ? 1667.0 : (TemperatureKelvin > 25000.0f ? 25000.0 : TemperatureKelvin);
    const double InverseT  = 1000.0 / T;
    const double InverseT2 = InverseT * InverseT;
    const double InverseT3 = InverseT2 * InverseT;

    double X;
    if (T < 4000.0) X = -0.2661239 * InverseT3 - 0.2343589 * InverseT2 + 0.8776956 * InverseT + 0.179910;
    else            X = -3.0258469 * InverseT3 + 2.1070379 * InverseT2 + 0.2226347 * InverseT + 0.240390;

    const double X2 = X * X, X3 = X2 * X;
    double Y;
    if      (T < 2222.0) Y = -1.1063814 * X3 - 1.34811020 * X2 + 2.18555832 * X - 0.20219683;
    else if (T < 4000.0) Y = -0.9549476 * X3 - 1.37418593 * X2 + 2.09137015 * X - 0.16748867;
    else                 Y =  3.0817580 * X3 - 5.87338670 * X2 + 3.75112997 * X - 0.37001483;

    // xyY (Y = 1) → XYZ → linear sRGB.
    const double CapitalY = 1.0;
    const double CapitalX = (X / (Y > 1e-6 ? Y : 1e-6)) * CapitalY;
    const double CapitalZ = ((1.0 - X - Y) / (Y > 1e-6 ? Y : 1e-6)) * CapitalY;

    double R =  3.2404542 * CapitalX - 1.5371385 * CapitalY - 0.4985314 * CapitalZ;
    double G = -0.9692660 * CapitalX + 1.8760108 * CapitalY + 0.0415560 * CapitalZ;
    double B =  0.0556434 * CapitalX - 0.2040259 * CapitalY + 1.0572252 * CapitalZ;

    R = R < 0.0 ? 0.0 : R;  G = G < 0.0 ? 0.0 : G;  B = B < 0.0 ? 0.0 : B;

    // Normalise to unit luminance so temperature changes hue without changing how bright the scene is.
    const double Luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const double Scale     = Luminance > 1e-6 ? 1.0 / Luminance : 1.0;

    OutRgb[0] = static_cast<float>(R * Scale);
    OutRgb[1] = static_cast<float>(G * Scale);
    OutRgb[2] = static_cast<float>(B * Scale);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    THE PACK
//------------------------------------------------------------------------------------------------------------------------

// `WallClockSeconds` is monotonic real time, NOT the time-of-day slider. Passing the clock here would make scrubbing
//    from dawn to dusk hurl the cloud field across the sky; the two clocks are separate on purpose and the parameter
//    name says so at every call site.
inline void PackCelestialUniform(
    const CelestialStructure& Settings,
    const CelestialSolution&  Solution,
    double                    WallClockSeconds,
    CelestialUniform&         Out) noexcept
{
    std::memset(&Out, 0, sizeof(Out));

    // ── Sun ───────────────────────────────────────────────────────────────────────────────────────────────────
    const float SunAngularRadius = Settings.Sun.AngularDiameterDegrees * 0.5f * static_cast<float>(kDegreesToRadians);
    Out.SunDirectionAndCosRadius[0] = Solution.SunDirection[0];
    Out.SunDirectionAndCosRadius[1] = Solution.SunDirection[1];
    Out.SunDirectionAndCosRadius[2] = Solution.SunDirection[2];
    Out.SunDirectionAndCosRadius[3] = std::cos(SunAngularRadius);

    float SunTint[3];
    BlackBodyLinearRgb(Settings.Sun.TemperatureKelvin, SunTint);

    // 🔴 RADIANCE AND IRRADIANCE ARE NOT THE SAME QUANTITY, AND CONFLATING THEM WAS A REAL BUG HERE.
    //
    //    The scattering integral is written for a top-of-atmosphere solar IRRADIANCE of 1, so everything it
    //    returns is in units of "per unit solar irradiance". The sun's disc, however, is drawn with a RADIANCE.
    //    The two are related by the disc's solid angle:  irradiance = radiance x solidAngle.
    //
    //    The first version used `Intensity` directly as the disc radiance while the sky used an implicit 1.0.
    //    Measured, that made the direct sun 1377x the zenith sky at 50 degrees elevation, where the true ratio is
    //    nearer 100-200x — which is exactly why the first scene render came out with a blown-white ground under
    //    a correctly-exposed sky. The sun was, in effect, being quoted in different units from its own sky.
    //
    //    Fixed by deriving both from one number. `Intensity` is the top-of-atmosphere irradiance; the disc
    //    radiance is that divided by the solid angle it covers, so a ray that lands on the disc and a surface
    //    that integrates the whole sun agree by construction — and changing the sun's ANGULAR SIZE now correctly
    //    keeps its total power constant instead of silently brightening the scene.
    const float SunAngularRadiusSquared = SunAngularRadius * SunAngularRadius;
    const float SunSolidAngle = 3.14159265358979f * SunAngularRadiusSquared;   // [sr] small-angle disc
    const float DiscRadianceScale = Settings.Sun.Intensity / (SunSolidAngle > 1e-12f ? SunSolidAngle : 1e-12f);

    for (int C = 0; C < 3; ++C) Out.SunRadianceAndLimb[C] = SunTint[C] * DiscRadianceScale;
    Out.SunRadianceAndLimb[3] = Settings.Sun.LimbDarkening;

    // The same light, as the irradiance the atmosphere and the surfaces are driven by. `w` scales the sky, so
    //    turning the sun up brightens the sky it lights rather than only the dot of the disc.
    for (int C = 0; C < 3; ++C) Out.SunIrradianceAndScale[C] = SunTint[C] * Settings.Sun.Intensity;
    Out.SunIrradianceAndScale[3] = Settings.Sun.Intensity;

    // 🔴 THE REDDENING OF DIRECT SUNLIGHT, COMPUTED ONCE PER FRAME ON THE CPU.
    //
    //    Sunlight reaching the ground has crossed the whole atmosphere, so it is attenuated — mildly and neutrally
    //    at noon, enormously and very redly at sunset, because the slant path is dozens of times longer and
    //    Rayleigh scattering removes blue far faster than red. This is why a sunset scene turns warm: the AIR is
    //    filtering the light. Without it the shading would stay noon-white while the sky went orange, which reads
    //    as a cheap sky pasted behind a differently-lit world.
    //
    //    It is a function of sun elevation alone, so it is computed once here rather than per-pixel in the
    //    kernel — and, like the exposure, it CANNOT depend on the camera, which keeps it clear of F3.
    {
        const float Elevation = std::asin(std::fmin(std::fmax(Out.SunDirectionAndCosRadius[2], -1.0f), 1.0f));
        float Transmittance[3];
        SolveSunTransmittance(Settings, Elevation, Transmittance);
        for (int C = 0; C < 3; ++C) Out.SunTransmittance[C] = Transmittance[C];
        Out.SunTransmittance[3] = 0.0f;
    }

    // ── Moon ──────────────────────────────────────────────────────────────────────────────────────────────────
    const float MoonAngularRadius = Settings.Moon.AngularDiameterDegrees * 0.5f * static_cast<float>(kDegreesToRadians);
    Out.MoonDirectionAndCosRadius[0] = Solution.MoonDirection[0];
    Out.MoonDirectionAndCosRadius[1] = Solution.MoonDirection[1];
    Out.MoonDirectionAndCosRadius[2] = Solution.MoonDirection[2];
    Out.MoonDirectionAndCosRadius[3] = std::cos(MoonAngularRadius);

    // The moon is sunlight, reflected: its radiance is the sun's scaled by the lunar albedo and the brightness
    //    slider. Deriving it rather than typing a number is what makes a daytime moon come out right for free —
    //    it is lit by the same sun, so it stays a plausible grey against a bright sky instead of a glowing decal.
    // 🔴 THE MOON IS A LIT SURFACE, NOT A LAMP — AND GETTING THIS WRONG MADE THE NIGHT BRIGHTER THAN THE DAY.
    //
    //    An earlier version wrote `albedo * brightness / solidAngle`, copying the SUN's radiance = irradiance /
    //    solidAngle rule. That rule is right for the sun, whose *irradiance* is the known quantity. It is wrong
    //    for the moon, whose known quantity is the sunlight FALLING ON IT. The moon is a diffuse sphere lit by
    //    the same solar irradiance E, so the radiance leaving it is the Lambertian result:
    //
    //        L_moon = E * albedo / pi
    //
    //    and radiance is conserved along a ray, so that is also what arrives here. Dividing by the solid angle
    //    instead inflated it by 1/(sa * pi) ~ 5000x; measured, the moon was delivering 0.192 of the sun's
    //    irradiance instead of ~2e-6, i.e. **96 000x too bright**, which rendered a blown-white midnight.
    //
    //    Sanity check against the world, which is the only real test: this gives a ground irradiance ratio of
    //    2.47e-6 versus the sun. Full moonlight is ~0.25 lux against ~120 000 lux of sunlight, a ratio of
    //    ~2.1e-6. So the physical form lands within 1.2x of reality with no tuning constant at all.
    for (int C = 0; C < 3; ++C)
        Out.MoonRadianceAndEarthshine[C] = Out.SunIrradianceAndScale[C]
                                         * (Settings.Moon.Albedo * Settings.Moon.Brightness / 3.14159265358979f);
    Out.MoonRadianceAndEarthshine[3] = Settings.Moon.Earthshine;

    // ── Atmosphere ────────────────────────────────────────────────────────────────────────────────────────────
    for (int C = 0; C < 3; ++C)
        Out.RayleighScatteringAndHeight[C] = Settings.Atmosphere.RayleighScattering[C] * Settings.Atmosphere.RayleighStrength;
    Out.RayleighScatteringAndHeight[3] = Settings.Atmosphere.RayleighScaleHeight;

    const float Mie = Settings.Atmosphere.MieScattering * Settings.Atmosphere.MieStrength;
    Out.MieScatteringAndHeight[0] = Mie;   // Mie scattering is achromatic — that is why haze is white, not blue.
    Out.MieScatteringAndHeight[1] = Mie;
    Out.MieScatteringAndHeight[2] = Mie;
    Out.MieScatteringAndHeight[3] = Settings.Atmosphere.MieScaleHeight;

    for (int C = 0; C < 3; ++C)
        Out.OzoneAbsorptionAndG[C] = Settings.Atmosphere.OzoneAbsorption[C] * Settings.Atmosphere.OzoneStrength;
    Out.OzoneAbsorptionAndG[3] = Settings.Atmosphere.MieAnisotropy;

    for (int C = 0; C < 3; ++C) Out.GroundAlbedoAndPlanetRadius[C] = Settings.Atmosphere.GroundAlbedo[C];
    Out.GroundAlbedoAndPlanetRadius[3] = Settings.Atmosphere.PlanetRadius;

    Out.AtmosphereHeightAndFog[0] = Settings.Atmosphere.AtmosphereHeight;
    Out.AtmosphereHeightAndFog[1] = Settings.AtmosphericFog.Enabled ? Settings.AtmosphericFog.Density : 0.0f;
    Out.AtmosphereHeightAndFog[2] = Settings.AtmosphericFog.HeightScale;
    Out.AtmosphereHeightAndFog[3] = Settings.AtmosphericFog.SunScatter;

    // ── Clouds ────────────────────────────────────────────────────────────────────────────────────────────────
    Out.CloudLayer[0] = Settings.Clouds.Coverage;
    Out.CloudLayer[1] = Settings.Clouds.Density;
    Out.CloudLayer[2] = Settings.Clouds.BaseHeight;
    Out.CloudLayer[3] = Settings.Clouds.Thickness;

    Out.CloudShape[0] = Settings.Clouds.ShapeScale;
    Out.CloudShape[1] = Settings.Clouds.DetailScale;
    Out.CloudShape[2] = Settings.Clouds.Anvil;
    Out.CloudShape[3] = Settings.Clouds.PowderScale;

    Out.CloudLighting[0] = Settings.Clouds.ForwardLobe;
    Out.CloudLighting[1] = Settings.Clouds.BackwardLobe;
    Out.CloudLighting[2] = Settings.Clouds.LobeMix;
    Out.CloudLighting[3] = Settings.Clouds.AmbientScale;

    // ⚠️ WIND DRIFT IS INTEGRATED ON THE CPU, IN METRES, FROM WALL TIME. The shader receives a position offset, not
    //    a time and a speed to multiply together. If the shader did the multiply, changing the wind speed slider
    //    would retroactively rewrite the whole history and the clouds would jump; here, changing the speed only
    //    changes the rate from this frame onward, which is what a person expects a speed slider to do.
    const double WindFromRadians = static_cast<double>(Settings.Wind.DirectionDegrees) * kDegreesToRadians;
    const double DriftDistance   = static_cast<double>(Settings.Wind.SpeedMetresPerSecond) * WallClockSeconds;
    Out.CloudAbsorptionAndWind[0] = Settings.Clouds.Absorption;
    Out.CloudAbsorptionAndWind[1] = static_cast<float>(-std::sin(WindFromRadians) * DriftDistance);  // blows TOWARDS
    Out.CloudAbsorptionAndWind[2] = static_cast<float>(-std::cos(WindFromRadians) * DriftDistance);
    Out.CloudAbsorptionAndWind[3] = Settings.Wind.SpeedMetresPerSecond;

    Out.WindShear[0] = Settings.Wind.Shear;
    Out.WindShear[1] = Settings.Wind.VeerDegrees * static_cast<float>(kDegreesToRadians);
    Out.WindShear[2] = Settings.Wind.Gust;
    Out.WindShear[3] = Settings.Wind.Turbulence;

    // ── Local volumes. A disabled volume ships density 0, so the shader needs no branch and no flag test. ──────
    for (int C = 0; C < 3; ++C) Out.LocalCloudCentreAndDensity[C] = Settings.LocalCloud.Centre[C];
    Out.LocalCloudCentreAndDensity[3] = Settings.LocalCloud.Enabled ? Settings.LocalCloud.Density : 0.0f;
    for (int C = 0; C < 3; ++C) Out.LocalCloudExtentAndCoverage[C] = Settings.LocalCloud.Extent[C];
    Out.LocalCloudExtentAndCoverage[3] = Settings.LocalCloud.Coverage;

    for (int C = 0; C < 3; ++C) Out.LocalFogCentreAndDensity[C] = Settings.LocalFog.Centre[C];
    Out.LocalFogCentreAndDensity[3] = Settings.LocalFog.Enabled ? Settings.LocalFog.Density : 0.0f;
    for (int C = 0; C < 3; ++C) Out.LocalFogExtentAndG[C] = Settings.LocalFog.Extent[C];
    Out.LocalFogExtentAndG[3] = Settings.LocalFog.Anisotropy;

    // ── Night sky ─────────────────────────────────────────────────────────────────────────────────────────────
    // ── Lens flare: exact HTML reference controls, ABI-preserving bridge ─────────────────────────────────────
    // The old custom angular flare is intentionally not packed anymore. The shader consumes the reference page's
    // screen-space weights and the existing settings only serve as a stable editor/CLI surface.
    {
        uint32_t Elements = Settings.LensFlare.ElementMask;
        if (!Settings.LensFlare.Enabled || Settings.LensFlare.Style == LensFlareStyleCategory::Off) Elements = 0u;

        const float Master = Elements == 0u ? 0.0f : Settings.LensFlare.Intensity;
        Out.FlareStreakAndFlags[0] = Master;
        Out.FlareStreakAndFlags[1] = Settings.LensFlare.HaloRadius;
        Out.FlareStreakAndFlags[2] = Settings.LensFlare.StreakIntensity;
        Out.FlareStreakAndFlags[3] = static_cast<float>(Elements);

        // The reference page's ghost loop owns its image spacing and disc shape. Count and chroma remain live
        // controls; the unused compatibility lanes make old records/layout checks remain byte-for-byte stable.
        Out.FlareGhostAndCount[0] = Settings.LensFlare.GhostIntensity;
        Out.FlareGhostAndCount[1] = Settings.LensFlare.GhostDispersal;
        Out.FlareGhostAndCount[2] = Settings.LensFlare.GhostSize * kDegreesToRadiansF;
        Out.FlareGhostAndCount[3] = static_cast<float>(Settings.LensFlare.GhostCount);

        float HtmlType = 0.0f; // Cinematic: ghosts + halo + streak + burst, as in the HTML default.
        if (Settings.LensFlare.Style == LensFlareStyleCategory::Clean) HtmlType = 2.0f;
        else if (Settings.LensFlare.Style == LensFlareStyleCategory::Custom)
        {
            if (Elements == LensFlareElementStreak) HtmlType = 1.0f;
            else if (Elements == LensFlareElementStarburst) HtmlType = 2.0f;
            else if (Elements == 0u) HtmlType = 0.0f;
        }
        Out.FlareBurstAndChroma[0] = Settings.LensFlare.StarburstIntensity;
        Out.FlareBurstAndChroma[1] = Settings.LensFlare.StarburstLength * kDegreesToRadiansF;
        Out.FlareBurstAndChroma[2] = HtmlType;
        Out.FlareBurstAndChroma[3] = static_cast<float>(Settings.LensFlare.StarburstBlades);

        Out.FlareChromaAndFade[0] = Settings.LensFlare.GhostChromatic;
        Out.FlareChromaAndFade[1] = Settings.LensFlare.OcclusionFade;
        Out.FlareChromaAndFade[2] = 0.0f;
        Out.FlareChromaAndFade[3] = 0.0f;
    }

    Out.StarsAndRotation[0] = Settings.Stars.Enabled ? Settings.Stars.Brightness : 0.0f;
    Out.StarsAndRotation[1] = Settings.Stars.Density;
    Out.StarsAndRotation[2] = Settings.Stars.SizeScale;
    Out.StarsAndRotation[3] = Solution.StarRotationRadians;

    // ── Exposure and flags ────────────────────────────────────────────────────────────────────────────────────
    uint32_t Flags = 0u;
    if (Settings.Enabled)                Flags |= kCelestialFlagEnabled;
    if (Settings.AtmosphericFog.Enabled) Flags |= kCelestialFlagFog;
    if (Settings.LocalFog.Enabled)       Flags |= kCelestialFlagLocalFog;
    if (Settings.LocalCloud.Enabled)     Flags |= kCelestialFlagLocalCloud;
    if (Settings.Moon.Enabled)           Flags |= kCelestialFlagMoon;
    if (Settings.Stars.Enabled)          Flags |= kCelestialFlagStars;

    Out.ExposureAndFlags[0] = Solution.ExposureGain;
    Out.ExposureAndFlags[1] = Solution.ExposureEv100;
    Out.ExposureAndFlags[2] = Solution.SunElevationDegrees;
    Out.ExposureAndFlags[3] = static_cast<float>(Flags);

    Out.MilkyWayAndMoonPhase[0] = Settings.Stars.Enabled ? Settings.Stars.MilkyWay : 0.0f;
    Out.MilkyWayAndMoonPhase[1] = Settings.Moon.Enabled ? Solution.MoonIlluminated : 0.0f;
    Out.MilkyWayAndMoonPhase[2] = Solution.SunMoonAngleDegrees * static_cast<float>(kDegreesToRadians);
    Out.MilkyWayAndMoonPhase[3] = static_cast<float>(WallClockSeconds);
}

} // namespace Frontier
