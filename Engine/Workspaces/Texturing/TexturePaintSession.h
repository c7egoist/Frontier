/*==========================================================================================================================================
                                                          TEXTUREPAINTSESSION.H
==========================================================================================================================================*/
// 🎨 Authoring session for Frontier Texture Paint Studio: 22 PBR channels, layer stack, undo/redo, brush dynamics, curves & masks.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/PixelSpace.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class PaintSurfaceChannel : uint8_t
{
    Albedo         = 0,
    Roughness      = 1,
    Metalness      = 2,
    Height         = 3,
    NormalStrength = 4,
    Occlusion      = 5,
    Opacity        = 6,
    Emissive       = 7,
    GlowPower      = 8,
    Clearcoat      = 9,
    CoatRough      = 10,
    Sheen          = 11,
    SheenRough     = 12,
    Specular       = 13,
    Anisotropy     = 14,
    Iridescence    = 15,
    IridFilm       = 16,
    Transmission   = 17,
    Subsurface     = 18,
    SpecColour     = 19,
    SheenColour    = 20,
    SubsurfTint    = 21,
    Count          = 22,
};

enum class PaintStudyAsset : uint8_t
{
    UtahTeapot = 0,
    ShaderBall = 1,
    ChamferBox = 2,
    UvSphere   = 3,
    TorusKnot  = 4,
    Count      = 5,
};

enum class PaintViewportLayout : uint8_t
{
    ThreeDOnly = 0,
    SplitView  = 1,
    TwoDOnly   = 2,
    Count      = 3,
};

enum class PaintToolCategory : uint8_t
{
    Brush      = 0,
    Eraser     = 1,
    Curve3D    = 2,
    Fill       = 3,
    Gradient3D = 4,
    Stamp      = 5,
    Text       = 6,
    Sample     = 7,
    Move       = 8,
    Count      = 9,
};

enum class PaintLayerCategory : uint8_t
{
    Paint   = 0,
    Fill    = 1,
    Material = 2,
    Stamp   = 3,
    Text    = 4,
    WearGen = 5,
    Folder  = 6,
    Count   = 7,
};

enum class PaintBlendMethod : uint8_t
{
    Normal      = 0,
    Multiply    = 1,
    Screen      = 2,
    Overlay     = 3,
    Add         = 4,
    SoftLight   = 5,
    Darken      = 6,
    Lighten     = 7,
    ColorDodge  = 8,
    HeightBlend = 9,
    Count       = 10,
};

enum class PaintFilterTab : uint8_t
{
    AllLayers  = 0,
    VisibleOnly = 1,
    HiddenOnly  = 2,
    Count       = 3,
};

enum class BrushInspectorTab : uint8_t
{
    Brush = 0,
    Erase = 1,
    Fill  = 2,
    Stamp = 3,
    Pick  = 4,
    Move  = 5,
    Text  = 6,
    Count = 7,
};

enum class BrushDetailSubTab : uint8_t
{
    TipAndPbr      = 0,
    ColourDynamics = 1,
    Curves         = 2,
    Count          = 3,
};

enum class BrushTipShape : uint8_t
{
    Round       = 0,
    Chisel      = 1,
    Chalk       = 2,
    Splatter    = 3,
    Sponge      = 4,
    CustomImage = 5,
    Count       = 6,
};

enum class BrushResponseCurve : uint8_t
{
    TipFalloff        = 0,
    SizeOverStroke    = 1,
    OpacityOverStroke = 2,
    HueShiftOverStroke = 3,
    Count             = 4,
};

enum class PaintMaskGenerator : uint8_t
{
    None           = 0,
    EdgeWear       = 1,
    CreviceDirt    = 2,
    TopDust        = 3,
    TriplanarGrunge = 4,
    Count          = 5,
};

enum class PaintFillScope : uint8_t
{
    AssetPart  = 0,
    UvIsland   = 1,
    WholeStudy = 2,
    Count      = 3,
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct PaintChannelDescriptor
{
    PaintSurfaceChannel Key          = PaintSurfaceChannel::Albedo;
    const char*         Label        = "Albedo";
    const char*         ShortTag     = "Al";
    float               DefaultMin   = 0.0f;
    float               DefaultMax   = 1.0f;
    float               DefaultScalar = 0.5f;
    bool                ColorChannel = false;
};

struct PaintStudyDescriptor
{
    PaintStudyAsset Asset     = PaintStudyAsset::UtahTeapot;
    const char*     Label     = "Utah Teapot";
    uint32_t        PartCount = 4u;
    uint32_t        UvIslands = 32u;
};

struct PaintStampPlacement
{
    uint32_t    Id           = 1u;
    std::string Name         = "Stamp Decal";
    bool        Visible      = true;
    bool        ThreeDProj   = false;
    float       U            = 0.50f;
    float       V            = 0.50f;
    float       Scale        = 0.28f;
    float       RotationDeg  = 0.0f;
    float       Opacity      = 1.0f;
    float       HeightGain   = 0.50f;
    ColorRgba   TintColor    { 255u, 255u, 255u, 255u };
};

struct PaintMaskConfig
{
    bool               Attached         = false;
    bool               EditingMask      = false;
    bool               Enabled          = true;
    bool               Invert           = false;
    float              Opacity          = 1.0f;
    PaintMaskGenerator Generator        = PaintMaskGenerator::None;
    float              Threshold        = 0.48f;
    float              Softness         = 0.16f;
    int32_t            FeatherRadiusPx  = 0;
    uint8_t            FillBrightness   = 255u;
};

struct PaintLayerEntry
{
    static constexpr std::size_t ChannelCount = static_cast<std::size_t>(PaintSurfaceChannel::Count);

    uint32_t           Id               = 1u;
    uint32_t           FolderOwnerId   = 0u;
    bool               FolderExpanded   = true;
    PaintLayerCategory Category         = PaintLayerCategory::Paint;
    std::string        Name             = "Hand Painted Layer";
    bool               Visible          = true;
    bool               Locked           = false;
    float              Opacity          = 1.0f;
    PaintBlendMethod   BlendMethod      = PaintBlendMethod::Normal;
    int32_t            PartFilter       = -1; // -1 = All Parts

    std::array<bool, ChannelCount>  ActiveChannels   {};
    std::array<float, ChannelCount> ChannelScalars   {};
    ColorRgba                       PrimerTint         { 239u, 244u, 207u, 255u };
    PaintSurfaceChannel             InspectedChannel = PaintSurfaceChannel::Albedo;

    uint32_t           PresetIndex      = 0u; // Fill pattern / Material preset / Wear preset
    PaintMaskGenerator WearPreset       = PaintMaskGenerator::EdgeWear;
    float              GrainScale       = 8.0f;
    float              GrainContrast    = 0.10f;
    std::string        TextContent      = "FRONTIER";
    float              TextFontSizePx   = 72.0f;

    std::vector<PaintStampPlacement> Stamps          {};
    uint32_t                         SelectedStampId = 0u;
    PaintMaskConfig                  Mask            {};

    [[nodiscard]] std::size_t CountActiveChannels() const noexcept;
    [[nodiscard]] std::string FormatSubtitle() const;
};

struct PaintCurvePoint
{
    float X = 0.0f;
    float Y = 1.0f;
};

struct PaintBrushProfile
{
    static constexpr std::size_t ChannelCount = static_cast<std::size_t>(PaintSurfaceChannel::Count);

    BrushTipShape                  TipShape               = BrushTipShape::Round;
    ColorRgba                      InkColor               { 239u, 244u, 207u, 255u };
    float                          SizeMeters             = 0.22f;
    int32_t                        PixelRadius            = 24;
    float                          Opacity                = 1.0f;
    float                          DeliveryRate           = 0.85f;
    float                          Hardness               = 0.72f;
    float                          TipAngleDeg            = 0.0f;
    float                          TipRoundness           = 1.0f;
    float                          Roughness              = 0.35f;
    float                          Metalness              = 0.0f;
    float                          HeightRelief           = 0.0f;

    float                          Spacing                = 0.22f;
    float                          Stabilizer             = 0.25f;
    bool                           FollowStrokeDirection  = false;
    float                          SizeJitter             = 0.0f;
    float                          AngleJitterDeg         = 0.0f;
    float                          PositionScatter        = 0.0f;
    float                          DeliveryJitter         = 0.0f;
    uint32_t                       ColourDynamicRule      = 0u;
    uint32_t                       RampPresetIndex        = 0u;
    int32_t                        GradientSpanDabs       = 48;
    uint32_t                       GradientWrapStyle      = 0u;
    uint32_t                       OpacityDynamicRule     = 0u;
    float                          OpacityJitter          = 0.0f;
    float                          MinOpacityFloor        = 0.10f;
    float                          HueJitter              = 0.0f;
    float                          SatJitter              = 0.0f;
    float                          LightnessJitter        = 0.0f;
    bool                           HueShiftOverStroke     = false;

    BrushResponseCurve             ActiveCurve            = BrushResponseCurve::TipFalloff;
    std::array<std::vector<PaintCurvePoint>, 4u> Curves   {};

    std::array<bool, ChannelCount> PaintChannels          {};
    std::array<bool, ChannelCount> EraseChannels          {};
    std::array<bool, ChannelCount> FillChannels           {};

    PaintFillScope                 FillScope              = PaintFillScope::AssetPart;
    bool                           StampNewLayerTarget    = false;
    std::string                    ActiveStampName        = "Industrial Warning";
    float                          StampScale             = 0.32f;
    float                          StampRotationDeg       = 0.0f;
    float                          StampOpacity           = 1.0f;
    float                          StampHeightGain        = 0.45f;
    ColorRgba                      StampTint              { 255u, 255u, 255u, 255u };

    bool                           TextAddToActiveLayer   = false;
    std::string                    TextContent            = "FRONTIER";
    uint32_t                       TextFontIndex          = 0u;
    uint32_t                       TextWeight             = 700u;
    bool                           TextItalic             = false;
    uint32_t                       TextAlignment          = 1u; // 0=Left, 1=Center, 2=Right
    float                          TextScale              = 0.34f;
    float                          TextRotationDeg        = 0.0f;
    int32_t                        TextFontSizePx         = 72;
    float                          TextLetterSpacingPx    = 2.0f;
    float                          TextLineHeight         = 1.15f;
    float                          TextOutlineWidthPx     = 0.0f;

    bool                           Curve3DClosed          = false;
    float                          Curve3DSmoothness      = 0.50f;
    uint32_t                       Curve3DPointCount      = 0u;
    bool                           GradientLivePreview    = true;
    float                          GradientGlobalSpread   = 1.0f;
    uint32_t                       GradientPointCount     = 3u;
};

struct PaintDocumentSnapshot
{
    std::vector<PaintLayerEntry> Layers          {};
    uint32_t                     SelectedLayerId = 0u;
    uint32_t                     NextLayerId     = 1u;
    uint32_t                     ResolutionPx    = 512u;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  SESSION SPECIFICATION
//------------------------------------------------------------------------------------------------------------------------

struct TexturePaintSession
{
    static constexpr std::size_t ChannelCount    = static_cast<std::size_t>(PaintSurfaceChannel::Count);
    static constexpr std::size_t MaxLayerCount   = 32u;

    std::string                  DocumentName        = "Teapot Paint";
    uint32_t                     ResolutionPx        = 512u;
    PaintStudyAsset              Study               = PaintStudyAsset::UtahTeapot;
    PaintViewportLayout          ViewportLayout      = PaintViewportLayout::ThreeDOnly;
    uint32_t                     ViewChannelIndex    = 0u; // 0 = Lit (Full 19-CH PBR)
    PaintToolCategory            ActiveTool          = PaintToolCategory::Brush;
    BrushInspectorTab            InspectorTab        = BrushInspectorTab::Brush;
    BrushDetailSubTab            InspectorSubTab     = BrushDetailSubTab::TipAndPbr;
    bool                         WireframeOverlay    = false;
    PaintFilterTab               LayerFilter         = PaintFilterTab::AllLayers;
    std::string                  SearchQuery         {};

    std::vector<PaintLayerEntry> Layers              {};
    uint32_t                     SelectedLayerId     = 2u;
    uint32_t                     NextLayerId         = 3u;
    uint32_t                     NextStampId         = 1u;

    PaintBrushProfile            Brush               {};
    std::string                  StatusBanner        = "WebGL2 GPU";

    std::vector<PaintDocumentSnapshot> UndoHistory   {};
    std::vector<PaintDocumentSnapshot> RedoHistory   {};

    TexturePaintSession() noexcept;

    void ResetDefaults() noexcept;
    void SelectTool(PaintToolCategory Tool) noexcept;
    void SelectStudy(PaintStudyAsset NextStudy) noexcept;
    void AssignResolution(uint32_t NextResPx) noexcept;

    void AddLayer(PaintLayerCategory Category) noexcept;
    void DuplicateSelectedLayer() noexcept;
    void DeleteSelectedLayer() noexcept;
    bool MoveSelectedLayerUp() noexcept;
    bool MoveSelectedLayerDown() noexcept;
    void ToggleOrCreateMaskOnSelectedLayer() noexcept;

    void AddChannelToSelectedLayer(PaintSurfaceChannel Channel) noexcept;
    void RemoveChannelFromSelectedLayer(PaintSurfaceChannel Channel) noexcept;
    void AddStampToSelectedLayer(bool TextStampMode) noexcept;
    void RemoveStampFromSelectedLayer(uint32_t StampId) noexcept;

    void PushUndoSnapshot() noexcept;
    bool ApplyUndo() noexcept;
    bool ApplyRedo() noexcept;

    [[nodiscard]] PaintLayerEntry*       AccessSelectedLayer() noexcept;
    [[nodiscard]] const PaintLayerEntry* InspectSelectedLayer() const noexcept;
    [[nodiscard]] int32_t                FindLayerVectorIndex(uint32_t LayerId) const noexcept;
    [[nodiscard]] std::size_t            CountVisibleLayers() const noexcept;
    [[nodiscard]] std::size_t            CountHiddenLayers() const noexcept;
    [[nodiscard]] bool                   QueryMovableUp() const noexcept;
    [[nodiscard]] bool                   QueryMovableDown() const noexcept;
    [[nodiscard]] bool                   QueryUndoAvailable() const noexcept { return !UndoHistory.empty(); }
    [[nodiscard]] bool                   QueryRedoAvailable() const noexcept { return !RedoHistory.empty(); }
    [[nodiscard]] const PaintStudyDescriptor& QueryActiveStudyDescriptor() const noexcept;

    [[nodiscard]] static const std::array<PaintChannelDescriptor, ChannelCount>& QueryChannelRegistry() noexcept;
    [[nodiscard]] static const PaintChannelDescriptor& QueryChannelDescriptor(PaintSurfaceChannel Channel) noexcept;
    [[nodiscard]] static const std::array<PaintStudyDescriptor, 5u>& QueryStudyRegistry() noexcept;
    [[nodiscard]] static const std::array<const char*, 23u>& QueryViewChannelLabels() noexcept;
    [[nodiscard]] static const std::array<const char*, 10u>& QueryBlendMethodLabels() noexcept;
    [[nodiscard]] static const std::array<ColorRgba, 8u>& QueryBrushQuickSwatches() noexcept;
};

} // namespace Frontier::Workspaces
