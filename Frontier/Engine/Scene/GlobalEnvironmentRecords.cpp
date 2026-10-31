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
#include <cmath>

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

// 📝 Low-precision solar position for a given ordinal day, solar clock hour, latitude, longitude, and UTC offset.
//    Matches VehicleHMI's +X east, +Y north, +Z up frame.
void EvaluateEphemerisAngles(int32_t DayOfYear,
                             double  LocalHour,
                             double  LatitudeDegrees,
                             double  LongitudeDegrees,
                             double  UtcOffsetHours,
                             double& OutElevationDegrees,
                             double& OutAzimuthDegrees) noexcept
{
    const double ClampedDay     = std::clamp(static_cast<double>(DayOfYear), 1.0, 365.0);
    const double FractionalYear = (2.0 * PiConstant / 365.0) * (ClampedDay - 1.0 + (LocalHour - 12.0) / 24.0);
    const double EquationMinutes =
        229.18 * (0.000075 + 0.001868 * std::cos(FractionalYear) - 0.032077 * std::sin(FractionalYear) -
                  0.014615 * std::cos(2.0 * FractionalYear) - 0.040849 * std::sin(2.0 * FractionalYear));
    const double Declination =
        0.006918 - 0.399912 * std::cos(FractionalYear) + 0.070257 * std::sin(FractionalYear) -
        0.006758 * std::cos(2.0 * FractionalYear) + 0.000907 * std::sin(2.0 * FractionalYear) -
        0.002697 * std::cos(3.0 * FractionalYear) + 0.00148 * std::sin(3.0 * FractionalYear);

    const double TimeOffsetMinutes = EquationMinutes + 4.0 * LongitudeDegrees - 60.0 * UtcOffsetHours;
    const double TrueSolarMinutes  = LocalHour * 60.0 + TimeOffsetMinutes;
    const double HourAngleRadians  = ((TrueSolarMinutes / 4.0) - 180.0) * DegreesToRadians;
    const double LatitudeRadians   = LatitudeDegrees * DegreesToRadians;

    const double SinElevation =
        std::clamp(std::sin(LatitudeRadians) * std::sin(Declination) +
                       std::cos(LatitudeRadians) * std::cos(Declination) * std::cos(HourAngleRadians),
                   -1.0, 1.0);
    const double ElevationRadians = std::asin(SinElevation);
    OutElevationDegrees           = ElevationRadians * RadiansToDegrees;

    const double CosElevation = std::max(1.0e-5, std::cos(ElevationRadians));
    const double SinNorthAz   = -std::cos(Declination) * std::sin(HourAngleRadians) / CosElevation;
    const double CosNorthAz   = (std::sin(Declination) - std::sin(LatitudeRadians) * SinElevation) /
                              std::max(1.0e-5, std::cos(LatitudeRadians) * CosElevation);
    const double CompassDegrees = std::atan2(SinNorthAz, CosNorthAz) * RadiansToDegrees;   // Clockwise from +Y north
    double       EastCounterDeg = 90.0 - CompassDegrees;                                   // Counterclockwise from +X east
    while (EastCounterDeg > 180.0) EastCounterDeg -= 360.0;
    while (EastCounterDeg < -180.0) EastCounterDeg += 360.0;
    OutAzimuthDegrees = EastCounterDeg;
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
    AutomaticPlacementEnabled = false;
    DayCycleEnabled           = false;
}

void SunRecord::ResetDefaults() noexcept
{
    AzimuthDegrees            = 145.0;
    ElevationDegrees          = 38.0;
    SolarIlluminance          = 12.0;
    SunlightEnabled           = true;
    SolarDiscEnabled          = true;
    DayCycleEnabled           = false;
    AutomaticPlacementEnabled = false;
    TemperatureModeEnabled    = true;
    ColourTemperatureKelvin   = 5778.0;
    SolarRadiusDegrees        = 0.27;
    AureoleGlow               = 1.00;
}

void SunRecord::RecomputeFromEphemeris() noexcept
{
    AutomaticPlacementEnabled = true;
    EvaluateEphemerisAngles(CalendarDayOfYear, SolarClockHours, LatitudeDegrees, LongitudeDegrees, UtcOffsetHours,
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
        EvaluateEphemerisAngles(CalendarDayOfYear, SampleHour, LatitudeDegrees, LongitudeDegrees, UtcOffsetHours,
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
}

void LensFlareRecord::ApplyOpticalPreset(int32_t NewPresetIndex) noexcept
{
    PresetIndex = std::clamp(NewPresetIndex, 0, 4);
    switch (PresetIndex)
    {
        case 0:   // Cinematic
            GlobalIntensity         = 0.30;
            OpticalSpread           = 1.00;
            ChromaticSeparation     = 0.20;
            GhostCount              = 6;
            AperturePolygonSides    = 6;
            GhostBrightness         = 0.30;
            GhostSpacing            = 1.00;
            HaloRadius              = 0.22;
            HaloWidth               = 0.025;
            HaloBrightness          = 0.20;
            AnamorphicStreakEnabled = true;
            WarmStreakEnabled       = false;
            StarburstEnabled        = true;
            StreakGain              = 0.30;
            ApertureBlades          = 6;
            break;
        case 1:   // Anamorphic Prime
            GlobalIntensity         = 0.48;
            OpticalSpread           = 1.25;
            ChromaticSeparation     = 0.34;
            GhostCount              = 8;
            AperturePolygonSides    = 0;
            GhostBrightness         = 0.24;
            GhostSpacing            = 1.35;
            HaloRadius              = 0.28;
            HaloWidth               = 0.018;
            HaloBrightness          = 0.14;
            AnamorphicStreakEnabled = true;
            WarmStreakEnabled       = true;
            StarburstEnabled        = false;
            StreakGain              = 0.65;
            ApertureBlades          = 8;
            break;
        case 2:   // Clean Portrait
            GlobalIntensity         = 0.18;
            OpticalSpread           = 0.85;
            ChromaticSeparation     = 0.08;
            GhostCount              = 4;
            AperturePolygonSides    = 8;
            GhostBrightness         = 0.18;
            GhostSpacing            = 0.80;
            HaloRadius              = 0.18;
            HaloWidth               = 0.032;
            HaloBrightness          = 0.12;
            AnamorphicStreakEnabled = false;
            WarmStreakEnabled       = false;
            StarburstEnabled        = true;
            StreakGain              = 0.18;
            ApertureBlades          = 8;
            break;
        case 3:   // Solar Bloom
            GlobalIntensity         = 0.62;
            OpticalSpread           = 1.40;
            ChromaticSeparation     = 0.28;
            GhostCount              = 10;
            AperturePolygonSides    = 6;
            GhostBrightness         = 0.42;
            GhostSpacing            = 1.15;
            HaloRadius              = 0.34;
            HaloWidth               = 0.045;
            HaloBrightness          = 0.36;
            AnamorphicStreakEnabled = true;
            WarmStreakEnabled       = true;
            StarburstEnabled        = true;
            StreakGain              = 0.45;
            ApertureBlades          = 6;
            break;
        default:   // Custom layers retains current layer parameters
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
                             (1.7 + GhostSpacing * OpticalSpread));
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
    const double Carrier = 0.60 * std::sin(0.43 * Seconds) + 0.40 * std::sin(0.97 * Seconds + 1.1);
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
    Parameters.GroundAlbedo          = std::clamp(GroundAlbedoScalar, 0.0, 1.0);

    if (RebakeLut)
    {
        (void)OpticalDepthLut.Bake(Parameters, 96, 24, 32);
        ++LutRevision;
    }
}

SpectrumRgb AtmosphereRecord::EvaluateSolarTransmittance(double ElevationDegrees, double AzimuthDegrees) const noexcept
{
    (void)AzimuthDegrees;
    const double SinElevation = std::sin(ElevationDegrees * DegreesToRadians);
    if (OpticalDepthLut.Baked())
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
    const uint32_t      Steps = static_cast<uint32_t>(std::clamp(SkySampleBudget / 2, 8, 24));
    SpectrumRgb         Sky   = SingleScattering(Parameters, ObserverKm, ViewDir, SunDir, SolarIrradiance,
                                                 OpticalDepthLut.Baked() ? &OpticalDepthLut : nullptr, Steps);
    if (MultipleScatteringEnabled)
    {
        const SpectrumRgb Multi = MultipleScatteringApprox(Parameters, ObserverKm, ViewDir, SunDir, Sky, SolarIrradiance);
        Sky.R += Multi.R;
        Sky.G += Multi.G;
        Sky.B += Multi.B;
    }
    const double HorizonFactor = 1.0 + 0.25 * (HorizonGlow - 1.0) * std::exp(-std::abs(ViewElevationRadians) * 9.0);
    return {Sky.R * HorizonFactor, Sky.G * HorizonFactor, Sky.B * HorizonFactor};
}

} // namespace Frontier
