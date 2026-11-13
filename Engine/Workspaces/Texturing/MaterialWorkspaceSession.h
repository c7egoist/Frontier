/*============================================================================================================================================
                                                        MATERIALWORKSPACESESSION.H
============================================================================================================================================*/
// 🧩 Authoring session for Frontier Material Studio: multilayer PBR strata, 29-channel schema, procedural fields & pattern overlay

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Controls/TextInputField.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/MaterialSpace/SurfaceMaterial.h"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace Frontier
{
class ContentBrowserPanel;
}

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class MaterialChannelSlot : uint8_t
{
    Colour               = 0,
    Roughness            = 1,
    Metallic             = 2,
    Normal               = 3,
    MicroNormal          = 4,
    HeightRelief         = 5,
    AmbientOcclusion     = 6,
    Opacity              = 7,
    BlendMask            = 8,
    DielectricIOR        = 9,
    Specular             = 10,
    SpecularColour       = 11,
    Clearcoat            = 12,
    CoatRoughness        = 13,
    CoatIOR              = 14,
    CoatNormal           = 15,
    Sheen                = 16,
    SheenRoughness       = 17,
    SheenColour          = 18,
    Anisotropy           = 19,
    AnisotropyAngle      = 20,
    Iridescence          = 21,
    IridescenceIOR       = 22,
    IridescenceThickness = 23,
    Transmission         = 24,
    ThicknessSss         = 25,
    AttenuationColour    = 26,
    Emissive             = 27,
    EmissiveStrength     = 28,
    Count                = 29,
};

enum class MaterialStrataModel : uint8_t
{
    Surface   = 0,
    Clearcoat = 1,
    Flakes    = 2,
    Detail    = 3,
};

enum class ChannelSourceMode : uint8_t
{
    ConstantScalar  = 0,
    ProceduralField = 1,
    LinearGradient  = 2,
    RadialGradient  = 3,
    ConicGradient   = 4,
    ImageTile       = 5,
    ActivePattern   = 6,
};

enum class FieldProcedureVariant : uint8_t
{
    PerlinNoise        = 0,
    CamoSmooth         = 1,
    Checkerboard       = 2,
    VoronoiCells       = 3,
    ConcentricRings    = 4,
    DirectionalStripes = 5,
};

enum class PreviewTargetShape : uint8_t
{
    ShaderBall  = 0,
    Sphere      = 1,
    DrapedCloth = 2,
    ChamferBox  = 3,
    Plane       = 4,
};

enum class LightingBackdropStyle : uint8_t
{
    StudioSoftbox = 0,
    ObsidianDark  = 1,
    WarmGallery   = 2,
    NeutralSlate  = 3,
    DaylightWhite = 4,
};

enum class PatternProjectionMode : uint8_t
{
    UVProjection    = 0,
    TriplanarSpatial = 1,
    Cylindrical     = 2,
};

enum class PatternTileRepeatMode : uint8_t
{
    BothXY = 0,
    XOnly  = 1,
    YOnly  = 2,
    Single = 3,
};

enum class MaterialInspectorTab : uint8_t
{
    Properties = 0,
    LayerStack = 1,
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct MaterialChannelDescriptor
{
    MaterialChannelSlot Slot          = MaterialChannelSlot::Colour;
    const char*         Caption       = "";
    const char*         Subtitle      = "";
    const char*         GroupCategory = "albedo";
    ColorRgba           DotTint       { 158u, 162u, 170u, 255u };
    bool                ColourTyped   = false;
    float               MinRange      = 0.0f;
    float               MaxRange      = 1.0f;
    float               DefaultScalar = 0.5f;
};

struct ChannelSourceSettings
{
    ChannelSourceMode     Mode         = ChannelSourceMode::ConstantScalar;
    FieldProcedureVariant Procedure    = FieldProcedureVariant::PerlinNoise;
    ColorRgba             StopPrimary  { 52u, 95u, 66u, 255u };
    ColorRgba             StopSecondary{ 239u, 244u, 207u, 255u };
    float                 FieldScale   = 6.0f;
    float                 Contrast     = 1.0f;
    float                 ScalarReading = 0.5f;
    bool                  DirectOverride = false;
    std::string           ImageTileName{};
};

struct MaterialStrataLayer
{
    uint32_t                         Identity   = 1u;
    std::string                      Name       = "Paint body";
    MaterialStrataModel              Model      = MaterialStrataModel::Surface;
    bool                             Enabled    = true;
    float                            LayerWeight = 1.0f;
    std::vector<MaterialChannelSlot> Channels   {};
    std::array<ChannelSourceSettings, static_cast<std::size_t>(MaterialChannelSlot::Count)> ChannelSources {};
};

struct AttachedPatternOverlay
{
    bool                  Attached         = false;
    uint32_t              PresetIndex      = 0u;
    std::string           Name             = "Kente Weave";
    std::string           SourceGroup      = "African Patterns";
    float                 Repeats          = 3.0f;
    float                 RotationDegrees  = 0.0f;
    PatternProjectionMode Projection       = PatternProjectionMode::UVProjection;
    PatternTileRepeatMode TileRepeatAxes   = PatternTileRepeatMode::BothXY;
    float                 BeadworkRelief   = 0.0f;
    std::array<bool, 8u>  EnabledMasks     { true, true, true, true, true, true, true, true };
};

struct MaterialRegistryPreset
{
    const char*           Identifier          = "";
    const char*           CollectionKicker    = "01 / PAINT COLLECTION";
    const char*           DisplayName         = "Racing Green";
    const char*           Subtitle            = "A classic, with another dimension.";
    const char*           CategoryTitle       = "MULTILAYER METALLIC";
    ColorRgba             PrimaryAlbedo       { 52u, 95u, 66u, 255u };
    float                 Roughness           = 0.24f;
    float                 Metalness           = 0.87f;
    float                 DielectricIOR       = 1.50f;
    float                 PaintRoughness      = 0.40f;
    float                 PaintDepth          = 0.30f;
    float                 ClearcoatWeight     = 0.85f;
    float                 ClearcoatGloss      = 0.65f;
    float                 FlakeDensity        = 0.64f;
    float                 FlakeFrequency      = 28.0f;
    float                 FlakeTilt           = 0.22f;
    bool                  MetalScratches      = false;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  MATERIAL WORKSPACE SESSION
//------------------------------------------------------------------------------------------------------------------------

class MaterialWorkspaceSession
{
public:
    MaterialWorkspaceSession();

    void AttachContentBrowserPanel(ContentBrowserPanel* Panel) noexcept { BoundBrowserPanel = Panel; }
    [[nodiscard]] ContentBrowserPanel* QueryBrowserPanel() const noexcept { return BoundBrowserPanel; }

    void LoadRegistryPreset(uint32_t PresetIndex);
    void ApplyExternalPatternDocument(std::string_view PatternName, std::string_view GroupTitle, float Repeats = 3.0f);
    void ClearAttachedPattern();

    void AddDetailStrataLayer();
    void ActivateOrAddClearcoatLayer();
    void RemoveStrataLayer(uint32_t LayerIdentity);
    void MoveStrataLayer(uint32_t LayerIdentity, int32_t DeltaDirection);
    void ReorderStrataLayerToIndex(uint32_t LayerIdentity, std::size_t TargetIndex);

    void AddChannelToSelectedLayer(MaterialChannelSlot Channel);
    void RemoveChannelFromSelectedLayer(MaterialChannelSlot Channel);
    void SelectStrataLayer(uint32_t LayerIdentity);
    void SelectPatternLayer() noexcept;
    void SelectInspectedChannel(MaterialChannelSlot Channel);
    void ApplyDetailFieldPreset(FieldProcedureVariant Procedure, ColorRgba StopA, ColorRgba StopB);

    void ApplyPrimaryAlbedoColor(ColorRgba Rgba);
    void ApplyInspectedChannelColor(ColorRgba Rgba);
    void ResetViewControls() noexcept;
    void SyncPhysicalSurfaceParameters() noexcept;

    [[nodiscard]] std::string                  BuildExportTomlSummary() const;
    [[nodiscard]] MaterialStrataLayer*         AccessSelectedLayer() noexcept;
    [[nodiscard]] const MaterialStrataLayer*   InspectSelectedLayer() const noexcept;
    [[nodiscard]] uint32_t                     QueryEnabledLayerCount() const noexcept;
    [[nodiscard]] uint32_t                     QueryTotalLayerRowCount() const noexcept;
    [[nodiscard]] bool                         VerifyLayerRemovable(const MaterialStrataLayer& Layer) const noexcept;
    [[nodiscard]] std::vector<MaterialChannelSlot> QueryAvailableChannelsForSelectedLayer() const;

    static const MaterialChannelDescriptor&           InspectChannelSpec(MaterialChannelSlot Slot) noexcept;
    static const std::vector<MaterialRegistryPreset>& InspectPresetRegistry() noexcept;
    static const std::array<const char*, 5u>&         InspectPreviewShapeLabels() noexcept;
    static const std::array<const char*, 5u>&         InspectBackdropLabels() noexcept;
    static const std::array<const char*, 7u>&         InspectSourceModeLabels() noexcept;
    static const std::array<const char*, 6u>&         InspectFieldProcedureLabels() noexcept;
    static const std::array<const char*, 6u>&         InspectPatternDirectoryLabels() noexcept;

public:
    static constexpr uint32_t PatternLayerReservedId = 0xFFFFFFFFu;

    uint32_t                     ActivePresetIndex     = 0u;
    std::string                  CollectionKicker      = "01 / PAINT COLLECTION";
    std::string                  MaterialTitle         = "Racing Green";
    std::string                  MaterialSubtitle      = "A classic, with another dimension.";
    std::string                  MaterialCategory      = "MULTILAYER METALLIC";

    ColorRgba                    PrimaryAlbedo         { 52u, 95u, 66u, 255u };
    float                        Roughness             = 0.24f;
    float                        Metalness             = 0.87f;
    float                        DielectricIOR         = 1.50f;
    float                        PaintRoughness        = 0.40f;
    float                        PaintDepth            = 0.30f;
    float                        ClearcoatWeight       = 0.85f;
    float                        ClearcoatRoughness    = 0.08f;
    float                        ClearcoatIOR          = 1.50f;
    float                        ClearcoatGloss        = 0.65f;
    float                        OrangePeelRelief      = 0.04f;
    float                        FlakeDensity          = 0.64f;
    float                        FlakeFrequency        = 28.0f;
    float                        FlakeTilt             = 0.22f;
    ColorRgba                    FlakeSecondaryTint    { 239u, 244u, 207u, 255u };
    bool                         MetalScratches        = false;

    PreviewTargetShape           PreviewShape          = PreviewTargetShape::ShaderBall;
    LightingBackdropStyle        BackdropStyle         = LightingBackdropStyle::StudioSoftbox;
    MaterialInspectorTab         ActiveInspectorTab    = MaterialInspectorTab::Properties;
    bool                         FullscreenSurface     = false;
    uint32_t                     ZoomScalePercent      = 62u;

    bool                         AutoRotateTurntable   = false;
    float                        LightAzimuthDegrees   = -37.0f;
    float                        ExposureEV            = 1.22f;

    std::vector<MaterialStrataLayer> StrataLayers      {};
    uint32_t                     SelectedLayerId       = 3u;
    MaterialChannelSlot          InspectedChannel      = MaterialChannelSlot::Colour;
    AttachedPatternOverlay       PatternOverlay        {};

    TextEditBuffer               LayerNameEditBuffer   {};
    uint32_t                     LayerEditIdentitySync = 0u;
    std::string                  StatusBannerText      = "Drag channels to scrub";
    uint64_t                     RevisionCounter       = 1u;

    MaterialSpace::SurfaceMaterial PhysicalMaterial {};

private:
    void InitializeDefaultChannelSources(MaterialStrataLayer& Layer);
    void SyncLayerNameEditBuffer() noexcept;

    uint32_t             NextLayerIdentity = 10u;
    ContentBrowserPanel* BoundBrowserPanel = nullptr;
};

} // namespace Frontier::Workspaces
