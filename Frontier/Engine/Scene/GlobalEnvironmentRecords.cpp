/*==========================================================================================================================================
                                                     GLOBAL ENVIRONMENT RECORDS
                                     ------------------------------------------------------------------
                 Portable Engine constructors, ephemeris/Planck/optical-axis/cloud-envelope/wind/atmosphere math,
                      and automatic SceneDirectory + RecordInspectorRegistry registration.
==========================================================================================================================================*/
// 🧩 Global Engine scene records for Folders, Sun, Lens Flare, Clouds, Wind, and Atmosphere with live observatory models.

#include "Engine/Scene/GlobalEnvironmentRecords.h"

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/SceneDirectory.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>

namespace Frontier
{

namespace
{

constexpr double PiConstant       = 3.14159265358979323846;
constexpr double DegreesToRadians = PiConstant / 180.0;
constexpr double RadiansToDegrees = 180.0 / PiConstant;

void BindDirectoryMetadata(RecordToken Token, const std::string& DisplayName, RecordToken Enclosure)
{
#if defined(FRONTIER_EDITOR_PROFILE) || defined(FRONTIER_DEVELOPMENT_PROFILE)
    SceneDirectory& Directory = SceneDirectory::Instance();
    (void)Directory.ConfigureName(Token, DisplayName);
    if (Enclosure.IsValid())
    {
        (void)Directory.ConfigureParent(Token, Enclosure);
    }
#else
    (void)Token;
    (void)DisplayName;
    (void)Enclosure;
#endif
}

void BindInspector(RecordInspectorDescriptor Descriptor)
{
#if defined(FRONTIER_EDITOR_PROFILE) || defined(FRONTIER_DEVELOPMENT_PROFILE)
    RecordInspectorRegistry::Instance().Register(std::move(Descriptor));
#else
    (void)Descriptor;
#endif
}

// 📝 Direct C++ port of VehicleHMI/CelestialSolver.js solar calculations. This is a low-precision visual solver,
//    not a navigation ephemeris. Coordinate convention is +X east, +Y north, +Z up.
struct EclipticVector
{
    double X = 0.0;
    double Y = 0.0;
    double Z = 0.0;
};

EclipticVector SolveOrbitalPosition(double NodeDegrees, double InclinationDegrees, double PerihelionDegrees,
                                    double SemiMajorAxis, double Eccentricity, double MeanAnomalyDegrees) noexcept
{
    auto Mod360 = [](double Value) noexcept {
        Value = std::fmod(Value, 360.0);
        return Value < 0.0 ? Value + 360.0 : Value;
    };
    const double MeanAnomaly = Mod360(MeanAnomalyDegrees) * DegreesToRadians;
    double       EccentricAnomaly = MeanAnomaly;
    for (int32_t Iteration = 0; Iteration < 6; ++Iteration)
    {
        EccentricAnomaly -= (EccentricAnomaly - Eccentricity * std::sin(EccentricAnomaly) - MeanAnomaly) /
                            (1.0 - Eccentricity * std::cos(EccentricAnomaly));
    }
    const double OrbitalX = SemiMajorAxis * (std::cos(EccentricAnomaly) - Eccentricity);
    const double OrbitalY = SemiMajorAxis * std::sqrt(1.0 - Eccentricity * Eccentricity) * std::sin(EccentricAnomaly);
    const double TrueAnomaly = std::atan2(OrbitalY, OrbitalX);
    const double Distance = std::hypot(OrbitalX, OrbitalY);
    const double Node = NodeDegrees * DegreesToRadians;
    const double Inclination = InclinationDegrees * DegreesToRadians;
    const double Argument = PerihelionDegrees * DegreesToRadians;
    return {
        Distance * (std::cos(Node) * std::cos(TrueAnomaly + Argument) -
                    std::sin(Node) * std::sin(TrueAnomaly + Argument) * std::cos(Inclination)),
        Distance * (std::sin(Node) * std::cos(TrueAnomaly + Argument) +
                    std::cos(Node) * std::sin(TrueAnomaly + Argument) * std::cos(Inclination)),
        Distance * std::sin(TrueAnomaly + Argument) * std::sin(Inclination)};
}

bool ParseCivilDate(const std::string& Text, std::chrono::year_month_day& Date) noexcept
{
    int Year = 0, Month = 0, Day = 0;
    if (Text.size() != 10 || Text[4] != '-' || Text[7] != '-' ||
        std::sscanf(Text.c_str(), "%4d-%2d-%2d", &Year, &Month, &Day) != 3)
    {
        return false;
    }
    Date = std::chrono::year{Year} / std::chrono::month{static_cast<unsigned>(Month)} /
           std::chrono::day{static_cast<unsigned>(Day)};
    return Date.ok();
}

std::chrono::year_month_day SafeCivilDate(const std::string& Text) noexcept
{
    std::chrono::year_month_day Date{};
    if (ParseCivilDate(Text, Date)) return Date;
    return std::chrono::year{2026} / std::chrono::October / std::chrono::day{20};
}

void EvaluateSolarAngles(const std::string& CalendarDateIso, double LocalHour, double LatitudeDegrees,
                         double LongitudeDegrees, double UtcOffsetHours, double& OutElevationDegrees,
                         double& OutAzimuthDegrees) noexcept
{
    const auto Date = SafeCivilDate(CalendarDateIso);
    const auto Days = std::chrono::sys_days{Date}.time_since_epoch().count();
    const double JulianDay = static_cast<double>(Days) + 2440587.5 + (LocalHour - UtcOffsetHours) / 24.0;
    const double DaysSinceEpoch = JulianDay - 2451543.5;
    const EclipticVector Sun = SolveOrbitalPosition(
        0.0, 0.0, 282.9404 + 4.70935e-5 * DaysSinceEpoch, 1.0,
        0.016709 - 1.151e-9 * DaysSinceEpoch, 356.047 + 0.9856002585 * DaysSinceEpoch);
    const double Obliquity = (23.4393 - 3.563e-7 * (JulianDay - 2451543.5)) * DegreesToRadians;
    const double EquatorialX = Sun.X;
    const double EquatorialY = Sun.Y * std::cos(Obliquity) - Sun.Z * std::sin(Obliquity);
    const double EquatorialZ = Sun.Y * std::sin(Obliquity) + Sun.Z * std::cos(Obliquity);
    const double RightAscension = std::atan2(EquatorialY, EquatorialX);
    const double Declination = std::atan2(EquatorialZ, std::hypot(EquatorialX, EquatorialY));
    double LocalSiderealDegrees = std::fmod(280.46061837 + 360.98564736629 * (JulianDay - 2451545.0) +
                                            LongitudeDegrees, 360.0);
    if (LocalSiderealDegrees < 0.0) LocalSiderealDegrees += 360.0;
    const double HourAngle = LocalSiderealDegrees * DegreesToRadians - RightAscension;
    const double Latitude = LatitudeDegrees * DegreesToRadians;
    const double East = -std::cos(Declination) * std::sin(HourAngle);
    const double North = std::sin(Declination) * std::cos(Latitude) -
                         std::cos(Declination) * std::cos(HourAngle) * std::sin(Latitude);
    const double Up = std::sin(Declination) * std::sin(Latitude) +
                      std::cos(Declination) * std::cos(HourAngle) * std::cos(Latitude);
    OutElevationDegrees = std::asin(std::clamp(Up, -1.0, 1.0)) * RadiansToDegrees;
    OutAzimuthDegrees = std::atan2(North, East) * RadiansToDegrees;
    while (OutAzimuthDegrees > 180.0) OutAzimuthDegrees -= 360.0;
    while (OutAzimuthDegrees < -180.0) OutAzimuthDegrees += 360.0;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    FOLDER RECORD
//------------------------------------------------------------------------------------------------------------------------

FolderRecord::FolderRecord(std::string FolderTitle,
                           std::string BadgeCode,
                           uint32_t    AccentHex,
                           RecordToken Enclosure)
    : RecordEntry(RecordClassification::Folder)
    , TitleText(FolderTitle)
    , BadgeText(std::move(BadgeCode))
    , NotesText("Scene organization container — groups related Outliner records and controls subtree visibility.")
    , AccentSpectrumHex(AccentHex)
{
    BindDirectoryMetadata(Token(), FolderTitle, Enclosure);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::Folder;
    Descriptor.Eyebrow          = "OUTLINER / FOLDER";
    Descriptor.Subtitle         = "Directory enclosure · telemetry & subtree visibility.";
    Descriptor.AccentHex        = AccentSpectrumHex;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      SUN RECORD
//------------------------------------------------------------------------------------------------------------------------

SunRecord::SunRecord(RecordToken Enclosure)
    : RecordEntry(RecordClassification::Environment)
{
    BindDirectoryMetadata(Token(), "Sun", Enclosure);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::Sun;
    Descriptor.Eyebrow          = "ENVIRONMENT / 02";
    Descriptor.Subtitle         = "Directional light / position & colour.";
    Descriptor.AccentHex        = 0xe8c27au;
    Descriptor.ActivationTarget = &SunlightEnabled;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
}

void SunRecord::ApplyLightingPreset(int32_t PresetIndex) noexcept
{
    if (PresetIndex < 0 || PresetIndex > 3) return;
    // 📝 Exact VehicleHMI InspectorPages.js LightingPresets table.
    switch (PresetIndex)
    {
        case 0:   // Noon
            ElevationDegrees = 64.0;
            AzimuthDegrees   = 145.0;
            SolarIlluminance = 12.0;
            break;
        case 1:   // Golden
            ElevationDegrees = 10.0;
            AzimuthDegrees   = 160.0;
            SolarIlluminance = 12.0;
            break;
        case 2:   // Dusk
            ElevationDegrees = 1.5;
            AzimuthDegrees   = 172.0;
            SolarIlluminance = 12.0;
            break;
        case 3:   // Night
            ElevationDegrees = -14.0;
            AzimuthDegrees   = 172.0;
            SolarIlluminance = 12.0;
            break;
        default:
            break;
    }
    LightingPresetIndex       = PresetIndex;
    AutomaticPlacementEnabled = false;
    DayCycleEnabled           = false;
}

void SunRecord::ResetDefaults() noexcept
{
    // Source parity: the VehicleHMI Reset action changes only these seven values.
    ElevationDegrees        = 38.0;
    AzimuthDegrees          = 145.0;
    SolarIlluminance        = 12.0;
    ColourTemperatureKelvin = 5778.0;
    SolarRadiusDegrees      = 0.27;
    AureoleGlow             = 1.0;
    DayCycleEnabled         = false;
    AutomaticPlacementEnabled = false;
    TemperatureModeEnabled  = true;
}

bool SunRecord::SetInspectorValue(SunInspectorValue Property, double Value) noexcept
{
    if (!std::isfinite(Value)) return false;
    double* Target = nullptr;
    double Minimum = 0.0;
    double Maximum = 0.0;
    switch (Property)
    {
        case SunInspectorValue::Azimuth:           Target = &AzimuthDegrees;          Minimum = -180.0; Maximum = 180.0; break;
        case SunInspectorValue::Elevation:         Target = &ElevationDegrees;        Minimum = -90.0;  Maximum = 90.0;  break;
        case SunInspectorValue::SolarIlluminance:  Target = &SolarIlluminance;        Minimum = 0.0;    Maximum = 60.0;  break;
        case SunInspectorValue::ColourTemperature: Target = &ColourTemperatureKelvin; Minimum = 2000.0; Maximum = 10000.0; break;
        case SunInspectorValue::SolarRadius:       Target = &SolarRadiusDegrees;      Minimum = 0.05;   Maximum = 2.0;   break;
        case SunInspectorValue::AureoleGlow:       Target = &AureoleGlow;             Minimum = 0.0;    Maximum = 3.0;   break;
        case SunInspectorValue::SolarTime:         Target = &SolarClockHours;         Minimum = 0.0;    Maximum = 24.0;  break;
        case SunInspectorValue::DayDuration:       Target = &CycleDurationHours;     Minimum = 0.01;   Maximum = 24.0;  break;
        case SunInspectorValue::Latitude:          Target = &LatitudeDegrees;         Minimum = -90.0;  Maximum = 90.0;  break;
        case SunInspectorValue::Longitude:         Target = &LongitudeDegrees;        Minimum = -180.0; Maximum = 180.0; break;
        case SunInspectorValue::TimeZone:          Target = &UtcOffsetHours;          Minimum = -12.0;  Maximum = 14.0;  break;
        default: return false;
    }
    *Target = std::clamp(Value, Minimum, Maximum);
    if (Property == SunInspectorValue::Azimuth || Property == SunInspectorValue::Elevation)
    {
        AutomaticPlacementEnabled = false;
        DayCycleEnabled = false;
    }
    else if (Property == SunInspectorValue::SolarTime || Property == SunInspectorValue::Latitude ||
             Property == SunInspectorValue::Longitude || Property == SunInspectorValue::TimeZone)
    {
        AutomaticPlacementEnabled = true;
        RecomputeFromEphemeris();
    }
    else if (Property == SunInspectorValue::ColourTemperature)
    {
        TemperatureModeEnabled = true;
    }
    return true;
}

void SunRecord::SetCalendarDate(const std::string& IsoDate)
{
    std::chrono::year_month_day Parsed{};
    if (!ParseCivilDate(IsoDate, Parsed)) return;
    CalendarDateIso = IsoDate;
    AutomaticPlacementEnabled = true;
    RecomputeFromEphemeris();
}

void SunRecord::SetCustomTint(double Red, double Green, double Blue) noexcept
{
    CustomTintRed = std::clamp(Red, 0.0, 1.0);
    CustomTintGreen = std::clamp(Green, 0.0, 1.0);
    CustomTintBlue = std::clamp(Blue, 0.0, 1.0);
    TemperatureModeEnabled = false;
}

void SunRecord::RecomputeFromEphemeris() noexcept
{
    AutomaticPlacementEnabled = true;
    EvaluateSolarAngles(CalendarDateIso, SolarClockHours, LatitudeDegrees, LongitudeDegrees, UtcOffsetHours,
                        ElevationDegrees, AzimuthDegrees);
}

SpatialVector SunRecord::EvaluateDirectionVector() const noexcept
{
    const double α = AzimuthDegrees * DegreesToRadians;
    const double θ = ElevationDegrees * DegreesToRadians;
    return {std::cos(θ) * std::cos(α), std::cos(θ) * std::sin(α), std::sin(θ)};
}

DailySolarCurveSummary SunRecord::EvaluateDailyElevationCurve() const noexcept
{
    DailySolarCurveSummary Summary{};
    for (size_t Index = 0; Index < Summary.ElevationSamplesDegrees.size(); ++Index)
    {
        const double SampleHour = static_cast<double>(Index) * 0.25;
        double       Elev       = 0.0;
        double       Azim       = 0.0;
        EvaluateSolarAngles(CalendarDateIso, SampleHour, LatitudeDegrees, LongitudeDegrees, UtcOffsetHours,
                            Elev, Azim);
        Summary.ElevationSamplesDegrees[Index] = Elev;
    }

    for (size_t Index = 1; Index < Summary.ElevationSamplesDegrees.size(); ++Index)
    {
        const double Previous = Summary.ElevationSamplesDegrees[Index - 1];
        const double Current  = Summary.ElevationSamplesDegrees[Index];
        constexpr double StepHours = 0.25;
        if (Previous >= 0.0 && Current >= 0.0)
        {
            Summary.DaylightSpanHours += StepHours;
        }
        else if ((Previous < 0.0) != (Current < 0.0))
        {
            const double Fraction     = -Previous / (Current - Previous);
            const double CrossingHour = (static_cast<double>(Index - 1) + Fraction) * StepHours;
            if (Previous < 0.0)
            {
                if (Summary.SunriseHour < 0.0) Summary.SunriseHour = CrossingHour;
                Summary.DaylightSpanHours += (1.0 - Fraction) * StepHours;
            }
            else
            {
                if (Summary.SunsetHour < 0.0) Summary.SunsetHour = CrossingHour;
                Summary.DaylightSpanHours += Fraction * StepHours;
            }
        }
    }
    return Summary;
}

SpectrumRgb SunRecord::EvaluateTintRgb() const noexcept
{
    if (!TemperatureModeEnabled)
    {
        return {std::clamp(CustomTintRed, 0.0, 1.0),
                std::clamp(CustomTintGreen, 0.0, 1.0),
                std::clamp(CustomTintBlue, 0.0, 1.0)};
    }

    // 📝 Tanner Helland / blackbody chromaticity approximation over [2000..10000 K].
    const double ScaledKelvin = std::clamp(ColourTemperatureKelvin, 2000.0, 10000.0) / 100.0;
    double       Red          = 1.0;
    double       Green        = 1.0;
    double       Blue         = 1.0;
    if (ScaledKelvin <= 66.0)
    {
        Red   = 1.0;
        Green = std::clamp((99.4708025861 * std::log(ScaledKelvin) - 161.1195681661) / 255.0, 0.0, 1.0);
        Blue  = ScaledKelvin <= 19.0
                    ? 0.0
                    : std::clamp((138.5177312231 * std::log(ScaledKelvin - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
    }
    else
    {
        Red   = std::clamp((329.698727446 * std::pow(ScaledKelvin - 60.0, -0.1332047592)) / 255.0, 0.0, 1.0);
        Green = std::clamp((288.1221695283 * std::pow(ScaledKelvin - 60.0, -0.0755148492)) / 255.0, 0.0, 1.0);
        Blue  = 1.0;
    }
    return {Red, Green, Blue};
}

void SunRecord::EvaluatePlanckSpectrum(std::array<double, 65>& NormalizedSamples,
                                       double&                 WienPeakNanometres) const noexcept
{
    const double ClampedKelvin = std::clamp(ColourTemperatureKelvin, 2000.0, 10000.0);
    WienPeakNanometres         = 2.897771955e6 / ClampedKelvin;   // [nm] - Wien displacement peak
    double PeakRadiance        = 1.0e-30;
    for (size_t Index = 0; Index < NormalizedSamples.size(); ++Index)
    {
        const double WavelengthMetres = (380.0 + (static_cast<double>(Index) / 64.0) * 400.0) * 1.0e-9;
        const double Exponent         = 0.01438776877 / (WavelengthMetres * ClampedKelvin);
        const double SpectralDensity  =
            1.0 / (std::pow(WavelengthMetres, 5.0) * std::expm1(std::min(Exponent, 80.0)));
        NormalizedSamples[Index] = SpectralDensity;
        PeakRadiance             = std::max(PeakRadiance, SpectralDensity);
    }
    for (double& Sample : NormalizedSamples)
    {
        Sample /= PeakRadiance;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  LENS FLARE RECORD
//------------------------------------------------------------------------------------------------------------------------

LensFlareRecord::LensFlareRecord(RecordToken EnclosingSunToken)
    : RecordEntry(RecordClassification::Environment)
{
    BindDirectoryMetadata(Token(), "Lens Flare", EnclosingSunToken);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::LensFlare;
    Descriptor.Eyebrow          = "ENVIRONMENT / CAMERA OPTICS";
    Descriptor.Subtitle         = "Reflections, diffraction, and light across the sensor.";
    Descriptor.AccentHex        = 0xc3afd2u;
    Descriptor.ActivationTarget = &FlareEnabled;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
    if (EnclosingSunToken.IsValid())
    {
        const auto SunInspector = RecordInspectorRegistry::Instance().Query(EnclosingSunToken);
        if (SunInspector.has_value() && SunInspector->Domain == GlobalInspectorDomain::Sun &&
            SunInspector->PayloadAddress != nullptr)
        {
            static_cast<SunRecord*>(SunInspector->PayloadAddress)->LinkedLensFlareToken = Token();
        }
    }
}

void LensFlareRecord::ApplyOpticalPreset(int32_t NewPresetIndex) noexcept
{
    PresetIndex = std::clamp(NewPresetIndex, 0, 4);
    // Exact NativeFlarePresets mapping. Global intensity, spread and chromatic separation are deliberately untouched.
    switch (PresetIndex)
    {
        case 0: // Cinematic
            AnamorphicStreakEnabled = true; WarmStreakEnabled = false; StarburstEnabled = true;
            CustomRayPairs = 8; GhostCount = 6; GhostBrightness = 0.35; AperturePolygonSides = 0;
            GhostSpacing = 1.0; HaloBrightness = 0.5; StreakGain = 1.0;
            break;
        case 1: // Anamorphic
            AnamorphicStreakEnabled = true; WarmStreakEnabled = false; StarburstEnabled = false;
            CustomRayPairs = 2; GhostCount = 4; GhostBrightness = 0.30; AperturePolygonSides = 0;
            GhostSpacing = 1.0; HaloBrightness = 0.2; StreakGain = 1.5;
            break;
        case 2: // Starburst
            AnamorphicStreakEnabled = false; WarmStreakEnabled = false; StarburstEnabled = true;
            CustomRayPairs = 8; GhostCount = 3; GhostBrightness = 0.20; AperturePolygonSides = 0;
            GhostSpacing = 1.0; HaloBrightness = 0.1; StreakGain = 0.0;
            break;
        case 3: // Halo
            AnamorphicStreakEnabled = false; WarmStreakEnabled = false; StarburstEnabled = false;
            CustomRayPairs = 6; GhostCount = 0; GhostBrightness = 0.0; AperturePolygonSides = 0;
            GhostSpacing = 1.0; HaloBrightness = 1.0; StreakGain = 0.0;
            break;
        default: // Custom layers retains the authored parameters.
            break;
    }
}

void LensFlareRecord::ResetPreviewSource() noexcept
{
    PreviewSourceU = 0.28;
    PreviewSourceV = 0.43;
}

std::vector<std::pair<double, double>> LensFlareRecord::EvaluateSensorGhostCentres() const
{
    // 📝 Exact optical-axis law from VehicleHMI NativeFlarePanel.js FlareGhostLayout.
    const int32_t ClampedCount = std::clamp(GhostCount, 0, 24);
    std::vector<std::pair<double, double>> Centres;
    Centres.reserve(static_cast<size_t>(ClampedCount));
    for (int32_t Index = 0; Index < ClampedCount; ++Index)
    {
        const double AxisScale =
            1.0 - (0.6 + (static_cast<double>(Index + 1) / static_cast<double>(ClampedCount)) *
                             (1.7 + GhostSpacing));
        const double SensorU = 0.5 + (PreviewSourceU - 0.5) * AxisScale;
        const double SensorV = 0.5 + (PreviewSourceV - 0.5) * AxisScale;
        Centres.emplace_back(SensorU, SensorV);
    }
    return Centres;
}

int32_t LensFlareRecord::QueryEffectiveRayPairs() const noexcept
{
    const int32_t SourceCount = (PresetIndex == 4) ? CustomRayPairs : ApertureBlades;
    return std::clamp(SourceCount, 2, 12);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                 CLOUD LAYER RECORD
//------------------------------------------------------------------------------------------------------------------------

CloudLayerRecord::CloudLayerRecord(RecordToken Enclosure)
    : RecordEntry(RecordClassification::Environment)
{
    SynchronizeCloudParameters();
    BindDirectoryMetadata(Token(), "Clouds", Enclosure);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::Clouds;
    Descriptor.Eyebrow          = "ENVIRONMENT / 01";
    Descriptor.Subtitle         = "Density field / shape & illumination.";
    Descriptor.AccentHex        = 0xa8d89au;
    Descriptor.ActivationTarget = &CloudLayerEnabled;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
}

void CloudLayerRecord::SynchronizeCloudParameters() noexcept
{
    BaseAltitudeMetres           = std::clamp(BaseAltitudeMetres, 100.0, CeilingAltitudeMetres);
    Parameters.BaseHeightM       = BaseAltitudeMetres;
    Parameters.TopHeightM        = QueryEffectiveTopMetres();
    Parameters.Coverage          = std::clamp(CoverageFraction, 0.0, 1.0);
    Parameters.DensityScale      = std::clamp(DensityMultiplier, 0.0, 4.0);
    Parameters.PhaseG            = std::clamp(ForwardAnisotropy, -0.8, 0.8);
    Parameters.ExtinctionPerM    = 0.008 + 0.016 * std::clamp(LightAbsorption, 0.0, 1.0);
}

const char* CloudLayerRecord::FormationLabel(int32_t Index) noexcept
{
    static constexpr const char* Labels[6] = {
        "Stratus", "Stratocumulus", "Cumulus", "Cumulonimbus", "Altostratus", "Cirrus"
    };
    return (Index >= 0 && Index < 6) ? Labels[Index] : "Custom";
}

double CloudLayerRecord::QueryEffectiveTopMetres() const noexcept
{
    return std::min(CeilingAltitudeMetres, BaseAltitudeMetres + LayerThicknessMetres);
}

double CloudLayerRecord::QueryRenderedDepthMetres() const noexcept
{
    return std::max(0.0, QueryEffectiveTopMetres() - BaseAltitudeMetres);
}

bool CloudLayerRecord::QueryCeilingClipped() const noexcept
{
    return (BaseAltitudeMetres + LayerThicknessMetres) > CeilingAltitudeMetres + 0.5;
}

int32_t CloudLayerRecord::QuerySkyMarchBudget() const noexcept
{
    // 📝 Exact CloudSkySamples formula from VehicleHMI CloudSettings.js.
    const double DepthScale = std::max(1.0, QueryRenderedDepthMetres() / 1200.0);
    const int32_t Samples   = static_cast<int32_t>(std::ceil(static_cast<double>(PrimaryMarchSteps) * DepthScale));
    return std::clamp(Samples, 8, 96);
}

double CloudLayerRecord::QueryPixelShareFraction() const noexcept
{
    const double ClampedPercent = static_cast<double>(std::clamp(TargetResolutionPercent, 25, 100));
    return (ClampedPercent * ClampedPercent) / 10000.0;
}

double CloudLayerRecord::EvaluateVerticalEnvelope(double NormalizedHeight) const noexcept
{
    const double Height = std::clamp(NormalizedHeight, 0.0, 1.0);
    const double BottomRamp = std::clamp(Height / 0.14, 0.0, 1.0);
    double TopRamp          = 1.0;
    switch (FormationIndex)
    {
        case 0:   // Stratus: flat low sheet
            TopRamp = std::clamp((0.48 - Height) / 0.26, 0.0, 1.0);
            break;
        case 1:   // Stratocumulus: rounded low deck
            TopRamp = std::clamp((0.68 - Height) / 0.30, 0.0, 1.0);
            break;
        case 2:   // Cumulus: classic convective dome
            TopRamp = std::clamp((0.92 - Height) / 0.42, 0.0, 1.0);
            break;
        case 3:   // Cumulonimbus: tall tower + upper anvil
        {
            const double Core  = std::clamp((0.98 - Height) / 0.22, 0.0, 1.0);
            const double Anvil = AnvilShaping * std::exp(-std::pow((Height - 0.84) / 0.11, 2.0));
            return std::clamp(BottomRamp * std::max(Core * 0.78, Anvil), 0.0, 1.0);
        }
        case 4:   // Altostratus: mid-altitude band
            return std::clamp(std::exp(-std::pow((Height - 0.52) / 0.28, 2.0)), 0.0, 1.0);
        case 5:   // Cirrus: thin high-altitudewisps
            return std::clamp(0.55 * std::exp(-std::pow((Height - 0.78) / 0.14, 2.0)), 0.0, 1.0);
        default:
            TopRamp = 1.0 - Height;
            break;
    }
    const double AnvilBoost = 1.0 + 0.35 * AnvilShaping * std::exp(-std::pow((Height - 0.78) / 0.16, 2.0));
    return std::clamp(BottomRamp * TopRamp * AnvilBoost, 0.0, 1.0);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  WIND FIELD RECORD
//------------------------------------------------------------------------------------------------------------------------

WindFieldRecord::WindFieldRecord(RecordToken Enclosure)
    : RecordEntry(RecordClassification::Environment)
{
    BindDirectoryMetadata(Token(), "Wind", Enclosure);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::Wind;
    Descriptor.Eyebrow          = "FORCEFIELD / SHARED WEATHER FORCE";
    Descriptor.Subtitle         = "Flow bearing, gust envelope, altitude shear & linked receivers.";
    Descriptor.AccentHex        = 0xa7f3d0u;
    Descriptor.ActivationTarget = &WindFieldEnabled;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
}

void WindFieldRecord::ResetReferenceFlow() noexcept
{
    // 📝 Home key reference from WIND_CARDS.md: north-source (180 travel -> 0 meteorological FROM) 7 m/s.
    BaseSpeedMps         = 7.0;
    TravelBearingDegrees = 180.0;
}

double WindFieldRecord::QueryMeteorologicalSourceDegrees() const noexcept
{
    double Source = std::fmod(TravelBearingDegrees + 180.0, 360.0);
    if (Source < 0.0) Source += 360.0;
    return Source;
}

double WindFieldRecord::EvaluateTwoSineGustFactor(double Seconds) const noexcept
{
    // Source port of WindGustFactor: fixed-settings two-sine speed envelope; it does not own a clock.
    const double Carrier = 0.65 * std::sin(Seconds) + 0.35 * std::sin(Seconds * 2.17);
    return 1.0 + GustStrength * Carrier;
}

void WindFieldRecord::EvaluateAltitudeVector(double  AltitudeMetres,
                                             double& OutSpeedMps,
                                             double& OutBearingDegrees) const noexcept
{
    const double ClampedKm = std::max(0.0, AltitudeMetres) / 1000.0;
    OutSpeedMps            = BaseSpeedMps * (1.0 + AltitudeShearPerKm * ClampedKm);
    OutBearingDegrees      = std::fmod(TravelBearingDegrees + AltitudeVeerDegreesPerKm * ClampedKm, 360.0);
    if (OutBearingDegrees < 0.0) OutBearingDegrees += 360.0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  ATMOSPHERE RECORD
//------------------------------------------------------------------------------------------------------------------------

AtmosphereRecord::AtmosphereRecord(RecordToken Enclosure)
    : RecordEntry(RecordClassification::Environment)
{
    SynchronizeAtmosphereParameters(true);
    BindDirectoryMetadata(Token(), "Atmosphere", Enclosure);

    RecordInspectorDescriptor Descriptor;
    Descriptor.Token            = Token();
    Descriptor.Domain           = GlobalInspectorDomain::Atmosphere;
    Descriptor.Eyebrow          = "ENVIRONMENT / 03";
    Descriptor.Subtitle         = "Scattering, density & the visible sky.";
    Descriptor.AccentHex        = 0x99aafau;
    Descriptor.ActivationTarget = &AtmosphereEnabled;
    Descriptor.PayloadAddress   = this;
    BindInspector(std::move(Descriptor));
}

void AtmosphereRecord::SynchronizeAtmosphereParameters(bool RebakeLut)
{
    Parameters.RayleighScattering    = {5.802e-3 * RayleighMultiplier,
                                        13.558e-3 * RayleighMultiplier,
                                        33.100e-3 * RayleighMultiplier};
    Parameters.RayleighScaleHeightKm = std::clamp(RayleighScaleHeightMetres, 1000.0, 16000.0) / 1000.0;
    Parameters.MieScattering         = 3.996e-3 * MieMultiplier;
    Parameters.MieAbsorption         = 4.400e-3 * MieMultiplier;
    Parameters.MieScaleHeightKm      = std::clamp(MieScaleHeightMetres, 500.0, 8000.0) / 1000.0;
    Parameters.MiePhaseG             = std::clamp(MieAnisotropyG, -0.95, 0.95);
    Parameters.OzoneAbsorption       = {0.650e-3 * OzoneMultiplier,
                                        1.881e-3 * OzoneMultiplier,
                                        0.085e-3 * OzoneMultiplier};
    for (double& Channel : GroundAlbedoRgb) Channel = std::clamp(Channel, 0.0, 1.0);
    for (double& Channel : SkyTintRgb) Channel = std::clamp(Channel, 0.0, 1.0);
    SkyBrightnessScale = std::clamp(SkyBrightnessScale, 0.0, 3.0);
    HorizonGlow = std::clamp(HorizonGlow, 0.0, 3.0);
    WhiteLine = std::clamp(WhiteLine, 0.0, 3.0);
    SkySampleBudget = std::clamp(SkySampleBudget, 8, 64);
    GroundAlbedoScalar = std::clamp(GroundAlbedoRgb[0] * 0.2126 + GroundAlbedoRgb[1] * 0.7152 +
                                        GroundAlbedoRgb[2] * 0.0722,
                                    0.0, 1.0);
    Parameters.GroundAlbedo = GroundAlbedoScalar;

    if (RebakeLut)
    {
        (void)OpticalDepthLut.Bake(Parameters, 96, 24, 32);
        ++LutRevision;
    }
}

SpectrumRgb AtmosphereRecord::EvaluateSolarTransmittance(double ElevationDegrees, double AzimuthDegrees) const noexcept
{
    (void)AzimuthDegrees;
    if (!AirMassEnabled) return {1.0, 1.0, 1.0};
    const double SinElevation = std::sin(ElevationDegrees * DegreesToRadians);
    if (UseBakedAtmosphere && OpticalDepthLut.Baked())
    {
        return OpticalDepthLut.Sample(Parameters, Parameters.GroundRadiusKm + 0.05, SinElevation);
    }
    return TransmittanceToTop(Parameters, Parameters.GroundRadiusKm + 0.05, SinElevation, 32);
}

SpectrumRgb AtmosphereRecord::SampleSkyPanorama(double ViewAzimuthRadians,
                                                double ViewElevationRadians,
                                                double SunElevationDegrees,
                                                double SunAzimuthDegrees) const noexcept
{
    if (!AtmosphereEnabled)
    {
        return {0.0, 0.0, 0.0};
    }

    const SpatialVector ObserverKm{0.0, 0.0, Parameters.GroundRadiusKm + 0.05};
    const SpatialVector ViewDir{std::cos(ViewElevationRadians) * std::cos(ViewAzimuthRadians),
                                std::cos(ViewElevationRadians) * std::sin(ViewAzimuthRadians),
                                std::sin(ViewElevationRadians)};
    const double        SunElevRad = SunElevationDegrees * DegreesToRadians;
    const double        SunAzimRad = SunAzimuthDegrees * DegreesToRadians;
    const SpatialVector SunDir{std::cos(SunElevRad) * std::cos(SunAzimRad),
                               std::cos(SunElevRad) * std::sin(SunAzimRad),
                               std::sin(SunElevRad)};
    const SpectrumRgb   SolarIrradiance{16.0, 16.0, 16.0};
    const uint32_t      Steps = static_cast<uint32_t>(std::clamp(SkySampleBudget, 8, 64));
    const TransmittanceLut* ActiveLut = UseBakedAtmosphere && OpticalDepthLut.Baked() ? &OpticalDepthLut : nullptr;
    SpectrumRgb Sky = SingleScattering(Parameters, ObserverKm, ViewDir, SunDir, SolarIrradiance, ActiveLut, Steps);
    if (MultipleScatteringEnabled)
    {
        const SpectrumRgb Multi = MultipleScatteringApprox(Parameters, ObserverKm, ViewDir, SunDir, Sky, SolarIrradiance);
        Sky.R += Multi.R;
        Sky.G += Multi.G;
        Sky.B += Multi.B;
    }
    const double HorizonFactor = 1.0 + 0.25 * (HorizonGlow - 1.0) * std::exp(-std::abs(ViewElevationRadians) * 9.0);
    const double Brightness = std::clamp(SkyBrightnessScale, 0.0, 3.0) * HorizonFactor;
    return {Sky.R * Brightness * SkyTintRgb[0], Sky.G * Brightness * SkyTintRgb[1], Sky.B * Brightness * SkyTintRgb[2]};
}

} // namespace Frontier
