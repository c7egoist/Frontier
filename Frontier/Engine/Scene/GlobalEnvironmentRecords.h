/*==========================================================================================================================================
                                                     GLOBAL ENVIRONMENT RECORDS
                                     ------------------------------------------------------------------
                 Engine-wide scene records shared across all Frontier projects: Folder, Sun, Lens Flare,
                      Clouds, Wind, and Atmosphere — auto-registering in Outliner and Inspector.
==========================================================================================================================================*/
// 🧩 Global Engine scene records for Folders, Sun, Lens Flare, Clouds, Wind, and Atmosphere with live observatory models.

#pragma once

#include "Engine/Rendering/AtmosphereModel.h"
#include "Engine/Rendering/CloudField.h"
#include "Engine/Rendering/LensFlareModel.h"
#include "Engine/Scene/RecordEntry.h"

#include <array>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    FOLDER RECORD
//------------------------------------------------------------------------------------------------------------------------

// 📝 Organizational Outliner container shared across every Frontier project. Constructing a FolderRecord registers it
//    under RecordClassification::Folder in SceneDirectory and binds the global Folder Inspector descriptor.
class FolderRecord final : public RecordEntry
{
  public:
    explicit FolderRecord(std::string FolderTitle = "Folder",
                          std::string BadgeCode   = "DIR",
                          uint32_t    AccentHex   = 0xe8c27au,
                          RecordToken Enclosure   = {});

    std::string TitleText;                              // [text] - Editable Outliner title
    std::string BadgeText;                              // [text] - Compact 3-4 character folder code
    std::string NotesText;                              // [text] - Authored summary shown in Folder Inspector
    uint32_t    AccentSpectrumHex       = 0xe8c27au;    // [rgb]  - Folder pocket & telemetry bar accent
    bool        PlacementLockedEnabled  = false;        // [-]    - Locks accidental relocation of nested entries
};

//------------------------------------------------------------------------------------------------------------------------
//                                                      SUN RECORD
//------------------------------------------------------------------------------------------------------------------------

enum class SunInspectorValue : uint8_t
{
    Azimuth,
    Elevation,
    SolarIlluminance,
    ColourTemperature,
    SolarRadius,
    AureoleGlow,
    SolarTime,
    DayDuration,
    Latitude,
    Longitude,
    TimeZone
};

struct DailySolarCurveSummary
{
    std::array<double, 97> ElevationSamplesDegrees{};   // [deg] - 15-minute samples across 00:00..24:00
    double                 SunriseHour      = -1.0;     // [h]   - Geometric 0-deg crossing (< 0 if polar)
    double                 SunsetHour       = -1.0;     // [h]   - Geometric 0-deg crossing (< 0 if polar)
    double                 DaylightSpanHours = 0.0;     // [h]   - Integrated hours above geometric horizon
};

class SunRecord final : public RecordEntry
{
  public:
    explicit SunRecord(RecordToken Enclosure = {});

    double      AzimuthDegrees            = 145.0;      // [deg] - Counterclockwise from +X east (VehicleHMI Noon)
    double      ElevationDegrees          = 38.0;       // [deg] - Above geometric horizon; negative below
    double      SolarIlluminance          = 12.0;       // [-]   - Directional solar illuminance multiplier
    bool        SunlightEnabled           = true;       // [-]   - Sunlight quick-toggle tile
    bool        SolarDiscEnabled          = true;       // [-]   - Finite solar disc quick-toggle tile
    bool        DayCycleEnabled           = false;      // [-]   - Animated day-cycle quick-toggle tile
    bool        AutomaticPlacementEnabled = false;      // [-]   - Ephemeris-driven vs manual placement
    bool        TemperatureModeEnabled    = true;       // [-]   - Planck Kelvin tint vs explicit RGB tint
    double      ColourTemperatureKelvin   = 5778.0;     // [K]   - Photospheric blackbody reference
    double      CustomTintRed             = 1.00;       // [0-1] - Explicit RGB source tint R
    double      CustomTintGreen           = 0.96;       // [0-1] - Explicit RGB source tint G
    double      CustomTintBlue            = 0.90;       // [0-1] - Explicit RGB source tint B
    double      SolarRadiusDegrees        = 0.27;       // [deg] - Half-angle; angular diameter = 2 * radius
    double      AureoleGlow               = 1.00;       // [-]   - Circumsolar aureole gain
    double      SolarClockHours           = 12.0;       // [h]   - VehicleHMI SunTime; local clock [0..24]
    double      CycleDurationHours        = 6.0;        // [h]   - VehicleHMI DayDuration; real hours per solar day
    double      LatitudeDegrees           = -26.18;     // [deg] - Observer latitude
    double      LongitudeDegrees          = 28.32;      // [deg] - Observer longitude
    double      UtcOffsetHours            = 2.0;        // [h]   - Civil timezone offset from UTC
    std::string CalendarDateIso           = "2026-10-20"; // [date] - VehicleHMI SkyDate; ISO civil date
    int32_t     LightingPresetIndex       = 0;          // [idx] - 0 Noon, 1 Golden, 2 Dusk, 3 Night
    RecordToken LinkedLensFlareToken;                   // [-]   - Optional nested LensFlareRecord for navigation

    int32_t     ActiveSectionIndex        = 0;          // [idx] - 0 Overview, 1 Daylight, 2 Light & colour, 3 Disc

    void ApplyLightingPreset(int32_t PresetIndex) noexcept;
    void ResetDefaults() noexcept;
    [[nodiscard]] bool SetInspectorValue(SunInspectorValue Property, double Value) noexcept;
    void SetCalendarDate(const std::string& IsoDate);
    void SetCustomTint(double Red, double Green, double Blue) noexcept;
    void RecomputeFromEphemeris() noexcept;

    [[nodiscard]] SpatialVector          EvaluateDirectionVector() const noexcept;
    [[nodiscard]] DailySolarCurveSummary EvaluateDailyElevationCurve() const noexcept;
    [[nodiscard]] SpectrumRgb            EvaluateTintRgb() const noexcept;
    void EvaluatePlanckSpectrum(std::array<double, 65>& NormalizedSamples, double& WienPeakNanometres) const noexcept;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  LENS FLARE RECORD
//------------------------------------------------------------------------------------------------------------------------

class LensFlareRecord final : public RecordEntry
{
  public:
    explicit LensFlareRecord(RecordToken EnclosingSunToken = {});

    bool    FlareEnabled            = true;     // [-]   - Scene lens-flare activation switch
    int32_t PresetIndex             = 0;        // [idx] - 0 Cinematic, 1 Anamorphic, 2 Clean, 3 Bloom, 4 Custom
    double  PreviewSourceU          = 0.28;     // [0-1] - Authoring preview light sensor U
    double  PreviewSourceV          = 0.43;     // [0-1] - Authoring preview light sensor V
    double  GlobalIntensity         = 0.30;     // [-]   - Composite optical gain
    double  OpticalSpread           = 1.00;     // [-]   - Axial dispersion scale
    double  ChromaticSeparation     = 0.20;     // [0-1] - Spectral fringe offset
    int32_t GhostCount              = 6;        // [ct]  - Reflected sensor-axis elements [0..24]
    int32_t AperturePolygonSides    = 6;        // [ct]  - 0 Round, 6 Hexagon, 8 Octagon
    double  GhostBrightness         = 0.30;     // [-]   - Internal reflection gain
    double  GhostSpacing            = 1.00;     // [-]   - Inter-element optical spacing
    double  HaloRadius              = 0.22;     // [0-1] - Annular ring radius in aspect-corrected UV
    double  HaloWidth               = 0.025;    // [0-1] - Radial response half-width
    double  HaloBrightness          = 0.20;     // [-]   - Annular ring gain
    bool    AnamorphicStreakEnabled = true;     // [-]   - Horizontal cyan/cool cylindrical streak
    bool    WarmStreakEnabled       = false;    // [-]   - Rotatable warm secondary streak
    bool    StarburstEnabled        = true;     // [-]   - Aperture diffraction starburst
    double  StreakRotationDegrees   = 0.0;      // [deg] - Warm streak & starburst rotation [0..360]
    int32_t CustomRayPairs          = 6;        // [ct]  - Custom diffraction ray pairs [2..12]
    double  StreakGain              = 0.30;     // [-]   - Diffraction & streak intensity
    int32_t ApertureBlades          = 6;        // [ct]  - Legacy preset blade count [2..12]

    int32_t ActiveSectionIndex      = 0;        // [idx] - 0 Compose, 1 Ghosts, 2 Halo, 3 Rays & streaks

    void ApplyOpticalPreset(int32_t NewPresetIndex) noexcept;
    void ResetPreviewSource() noexcept;

    [[nodiscard]] std::vector<std::pair<double, double>> EvaluateSensorGhostCentres() const;
    [[nodiscard]] int32_t                                QueryEffectiveRayPairs() const noexcept;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                 CLOUD LAYER RECORD
//------------------------------------------------------------------------------------------------------------------------

class CloudLayerRecord final : public RecordEntry
{
  public:
    explicit CloudLayerRecord(RecordToken Enclosure = {});

    CloudParameters Parameters{};                       // [-]   - Portable FBM & Beer-Lambert march parameters
    bool            CloudLayerEnabled       = true;     // [-]   - Global volumetric cloud switch
    int32_t         FormationIndex          = 2;        // [idx] - Stratus, Stratocumulus, Cumulus, Cumulonimbus, Altostratus, Cirrus
    double          CoverageFraction        = 0.55;     // [0-1] - Requested horizontal cloud cover
    double          DensityMultiplier       = 1.00;     // [-]   - Shaped density multiplier [0..4]
    double          BaseAltitudeMetres      = 1500.0;   // [m]   - World-Z cloud base
    double          LayerThicknessMetres    = 1200.0;   // [m]   - Requested vertical slab thickness
    double          CeilingAltitudeMetres   = 14000.0;  // [m]   - Upper clipping ceiling
    double          FeatureScale            = 1.00;     // [-]   - Macro FBM lattice scale [0.2..3]
    double          AnvilShaping            = 0.50;     // [0-1] - Upper-troposphere anvil overhang
    double          EdgeErosion             = 0.30;     // [0-1] - High-frequency billow erosion
    double          ForwardAnisotropy       = 0.35;     // [-]   - Henyey-Greenstein phase g [-0.8..0.8]
    double          LightAbsorption         = 0.15;     // [0-1] - Extinction absorption fraction
    double          PowderResponse          = 0.45;     // [0-1] - Dark-edge Beer-Powder term
    int32_t         SunShadowTaps           = 2;        // [ct]  - Secondary sun-march taps [0..4]
    int32_t         TargetResolutionPercent = 35;       // [%]   - Quarter/half/full trace resolution [25..100]
    int32_t         PrimaryMarchSteps       = 12;       // [ct]  - Base primary raymarch steps [8..64]
    bool            GroundShadowsEnabled    = true;     // [-]   - Projected terrain cloud-shadow map
    double          ShadowStrength          = 0.65;     // [0-1] - Ground shadow optical attenuation
    double          ShadowSoftnessMetres    = 35.0;     // [m]   - Filter kernel radius
    double          ShadowDistanceMetres    = 6000.0;   // [m]   - Shadow projection extent
    bool            FollowSharedWindEnabled = true;     // [-]   - Couple advection to WindFieldRecord
    bool            StormLightningEnabled   = false;    // [-]   - Localized storm flash coupling
    RecordToken     LinkedWindToken;                    // [-]   - Optional WindFieldRecord for navigation

    int32_t         ActiveSectionIndex      = 0;        // [idx] - 0 Overview, 1 Formation, 2 Rendering, 3 Weather

    void SynchronizeCloudParameters() noexcept;

    [[nodiscard]] static const char* FormationLabel(int32_t Index) noexcept;
    [[nodiscard]] double             QueryEffectiveTopMetres() const noexcept;
    [[nodiscard]] double             QueryRenderedDepthMetres() const noexcept;
    [[nodiscard]] bool               QueryCeilingClipped() const noexcept;
    [[nodiscard]] int32_t            QuerySkyMarchBudget() const noexcept;
    [[nodiscard]] double             QueryPixelShareFraction() const noexcept;
    [[nodiscard]] double             EvaluateVerticalEnvelope(double NormalizedHeight) const noexcept;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  WIND FIELD RECORD
//------------------------------------------------------------------------------------------------------------------------

class WindFieldRecord final : public RecordEntry
{
  public:
    explicit WindFieldRecord(RecordToken Enclosure = {});

    bool    WindFieldEnabled           = true;   // [-]      - Shared weather forcefield switch
    double  BaseSpeedMps               = 7.0;    // [m/s]    - Sea-level steady wind speed [0..40]
    double  TravelBearingDegrees       = 90.0;   // [deg]    - Direction air travels toward [0..360]
    double  GustStrength               = 0.25;   // [0-1]    - Two-sine gust envelope amplitude
    double  TurbulenceAmplitude        = 0.15;   // [0-1]    - Tri-axial perturbation amplitude
    double  AltitudeShearPerKm         = 0.15;   // [1/km]   - Steady speed gain per km altitude [0..2]
    double  AltitudeVeerDegreesPerKm   = 8.0;    // [deg/km] - Steady bearing turn per km [-60..60]
    bool    CloudsFollowEnabled        = true;   // [-]      - Global clouds linked to shared wind
    bool    LocalCloudFollowEnabled    = true;   // [-]      - Bounded local cloud density linked
    bool    LocalFogFollowEnabled      = true;   // [-]      - Local volumetric fog linked
    bool    PrecipitationFollowEnabled = true;   // [-]      - GPU precipitation particles linked
    double  PrecipitationDrift         = 0.65;   // [0-1]    - Falling-particle wind coupling gain

    int32_t ActiveSectionIndex         = 0;      // [idx]    - 0 Flow, 1 Variability, 2 Altitude, 3 Receivers

    void ResetReferenceFlow() noexcept;

    [[nodiscard]] double QueryMeteorologicalSourceDegrees() const noexcept;
    [[nodiscard]] double EvaluateTwoSineGustFactor(double Seconds) const noexcept;
    void EvaluateAltitudeVector(double AltitudeMetres, double& OutSpeedMps, double& OutBearingDegrees) const noexcept;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  ATMOSPHERE RECORD
//------------------------------------------------------------------------------------------------------------------------

class AtmosphereRecord final : public RecordEntry
{
  public:
    explicit AtmosphereRecord(RecordToken Enclosure = {});

    AtmosphereParameters Parameters{};                         // [-]   - Physical Rayleigh/Mie/Ozone Earth model
    TransmittanceLut     OpticalDepthLut{};                    // [-]   - Baked 128x32 horizon-stretched LUT
    bool                 AtmosphereEnabled           = true;   // [-]   - Global sky & aerial scattering switch
    double               RayleighMultiplier          = 1.00;   // [-]   - Molecular scattering multiplier [0..3]
    double               MieMultiplier               = 1.00;   // [-]   - Aerosol scattering/absorption multiplier [0..6]
    double               OzoneMultiplier             = 1.00;   // [-]   - Stratospheric Chappuis band multiplier [0..4]
    double               RayleighScaleHeightMetres   = 8000.0; // [m]   - Molecular exponential scale height [1000..16000]
    double               MieScaleHeightMetres        = 1200.0; // [m]   - Aerosol exponential scale height [500..8000]
    double               MieAnisotropyG              = 0.80;   // [-]   - Aerosol forward phase asymmetry [-0.95..0.95]
    bool                 MultipleScatteringEnabled   = true;   // [-]   - Second-order isotropic scattering term
    bool                 AirMassEnabled              = true;   // [-]   - Spherical optical air-mass integration
    bool                 CivilTwilightLineEnabled    = true;   // [-]   - Horizon twilight band gate
    double               GroundAlbedoScalar          = 0.30;   // [0-1] - Planetary diffuse ground reflectance
    double               HorizonGlow                 = 1.00;   // [-]   - Horizon scattering accent [0..3]
    int32_t              SkySampleBudget             = 40;     // [ct]  - View-ray integration steps [8..64]
    bool                 AerialPerspectiveEnabled    = true;   // [-]   - Distance aerial perspective medium
    double               AerialStartMetres           = 100.0;  // [m]   - Near-camera aerial perspective offset
    uint32_t             LutRevision                 = 0;      // [ct]  - Incremented on every LUT rebake

    int32_t              ActiveSectionIndex          = 0;      // [idx] - 0 Overview, 1 Medium, 2 Light response, 3 Baking

    void SynchronizeAtmosphereParameters(bool RebakeLut = true);

    [[nodiscard]] SpectrumRgb EvaluateSolarTransmittance(double ElevationDegrees, double AzimuthDegrees) const noexcept;
    [[nodiscard]] SpectrumRgb SampleSkyPanorama(double ViewAzimuthRadians,
                                                double ViewElevationRadians,
                                                double SunElevationDegrees,
                                                double SunAzimuthDegrees) const noexcept;
};

} // namespace Frontier
