/*============================================================================================================================================
                                                         MATERIALINSPECTORPANE.CPP
============================================================================================================================================*/
// 🧩 Implementation of MaterialInspectorPane (Properties & Layer Stack tabs, 29 PBR channel chips, optical sliders & pattern controls)

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Texturing/MaterialInspectorPane.h"

#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/Controls/ControlTooltip.h"
#include "Engine/Components/Controls/DropdownSelector.h"
#include "Engine/Workspaces/Texturing/TexturingPaneAppearance.h"

#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace Frontier::Workspaces
{

namespace
{

constexpr std::array<ColorRgba, 16u> StudioQuickSwatches {{
    { 52u,  95u,  66u,  255u }, // Racing Green
    { 239u, 244u, 207u, 255u }, // Studio Cream
    { 212u, 168u, 90u,  255u }, // Brushed Brass
    { 43u,  87u,  154u, 255u }, // Cobalt Pearl
    { 178u, 96u,  64u,  255u }, // Terracotta
    { 158u, 42u,  47u,  255u }, // Carmine Lacquer
    { 88u,  118u, 178u, 255u }, // Anodized Titanium
    { 20u,  22u,  26u,  255u }, // Obsidian Ink
    { 68u,  73u,  82u,  255u }, // Slate Alcantara
    { 214u, 184u, 124u, 255u }, // Champagne Gold
    { 121u, 189u, 143u, 255u }, // Sage Moss
    { 95u,  148u, 188u, 255u }, // Arctic Blue
    { 194u, 120u, 85u,  255u }, // Burnished Copper
    { 138u, 108u, 168u, 255u }, // Amethyst Violet
    { 225u, 227u, 232u, 255u }, // Frost White
    { 31u,  36u,  41u,  255u }, // Graphite Carbon
}};

[[nodiscard]] ControlIcon IconForStrataModel(MaterialStrataModel Model) noexcept
{
    switch (Model)
    {
        case MaterialStrataModel::Clearcoat: return ControlIcon::SparklesAntiAliasing;
        case MaterialStrataModel::Flakes:    return ControlIcon::LayoutGrid;
        case MaterialStrataModel::Detail:    return ControlIcon::LayersSlabs;
        case MaterialStrataModel::Surface:
        default:                             return ControlIcon::MaterialSphere;
    }
}

[[nodiscard]] const char* UpperModelCaption(MaterialStrataModel Model) noexcept
{
    switch (Model)
    {
        case MaterialStrataModel::Clearcoat: return "COAT";
        case MaterialStrataModel::Flakes:    return "FLAKES";
        case MaterialStrataModel::Detail:    return "DETAIL";
        case MaterialStrataModel::Surface:
        default:                             return "SURFACE";
    }
}

} // namespace

MaterialInspectorPane::~MaterialInspectorPane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void MaterialInspectorPane::AttachSession(MaterialWorkspaceSession* TargetSession) noexcept
{
    Session = TargetSession;
    ScrollOffsetY = 0.0f;
    ActiveSliderId = -1;
    DraggingLayerIdentity = 0u;
    DraggingLayerActive = false;
    CloseAllSheets();
}

void MaterialInspectorPane::CloseAllSheets() noexcept
{
    ActiveDropdown     = OpenDropdownVariant::None;
    ActiveSwatchTarget = MaterialSwatchTarget::None;
}

void MaterialInspectorPane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    (void)DeltaSeconds;
    if (Session == nullptr || Bounds.Width < 180.0f || Bounds.Height < 200.0f)
    {
        return;
    }

    using namespace TexturingAppearance;
    const TexturingThemeColors Theme   = QueryTexturingThemeColors();
    const Point2D              Cursor  { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed = Input.PrimaryPointer.Pressed;

    // When a dropdown/swatch sheet is open, isolate clicks onto the overlay only so background controls don't fire beneath
    const bool OverlayOpen = (ActiveDropdown != OpenDropdownVariant::None || ActiveSwatchTarget != MaterialSwatchTarget::None);
    PaneInputReading BodyInput = Input;
    if (OverlayOpen)
    {
        BodyInput.PrimaryPointer.Pressed  = false;
        BodyInput.PrimaryPointer.Down     = false;
        BodyInput.PrimaryPointer.Released = false;
    }
    const Point2D BodyCursor  { BodyInput.PrimaryPointer.X, BodyInput.PrimaryPointer.Y };
    const bool    BodyPressed = BodyInput.PrimaryPointer.Pressed;

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, Theme.PaneBackground, 0.0f);
    Surface.StrokeLine({ Bounds.X, Bounds.Y }, { Bounds.X, Bounds.Bottom() }, Theme.BorderSubtle, 1.0f);

    const float PadX   = 14.0f;
    const float LeftX  = Bounds.X + PadX;
    const float InnerW = std::max(120.0f, Bounds.Width - PadX * 2.0f);
    float       CurY   = Bounds.Y + 12.0f;

    // 1. Top Heading Bar ("Material Inspector" / "LOOK-DEV PBR")
    CurY += ConstructPaneHeadingBar(Surface, LeftX, CurY, InnerW, "Material Inspector", "LOOK-DEV PBR", Theme);
    CurY += 8.0f;

    const bool                 PatternSelected = (Session->SelectedLayerId == MaterialWorkspaceSession::PatternLayerReservedId && Session->PatternOverlay.Attached);
    const MaterialStrataLayer* ActiveLayer     = PatternSelected ? nullptr : Session->InspectSelectedLayer();

    const std::string SubjectTitle = PatternSelected
        ? Session->PatternOverlay.Name
        : (Session->MaterialTitle + " · " + (ActiveLayer != nullptr ? ActiveLayer->Name : std::string("Surface")));
    const std::string SubjectSub = PatternSelected
        ? "TILEABLE PATTERN LAYER INSPECTOR"
        : (std::string(UpperModelCaption(ActiveLayer != nullptr ? ActiveLayer->Model : MaterialStrataModel::Surface)) +
           " STRATA · " + Session->MaterialCategory);

    CurY += ConstructSubjectHeadingBlock(
        Surface,
        LeftX,
        CurY,
        InnerW,
        PatternSelected ? ControlIcon::PatternTile : ControlIcon::MaterialSphere,
        SubjectTitle,
        SubjectSub,
        Theme);
    CurY += 8.0f;

    // 2. KPI Metric Trio (Roughness highlighted in #EFF4CF Studio cream, Metalness, Strata/Tile)
    char RoughStr[16] {}, MetalStr[16] {}, StrataStr[16] {}, StrataSub[32] {};
    std::snprintf(RoughStr, sizeof(RoughStr), "%.2f", Session->Roughness);
    std::snprintf(MetalStr, sizeof(MetalStr), "%u%%", static_cast<uint32_t>(std::round(Session->Metalness * 100.0f)));
    if (PatternSelected)
    {
        std::snprintf(StrataStr, sizeof(StrataStr), "%.1fx", Session->PatternOverlay.Repeats);
        std::snprintf(StrataSub, sizeof(StrataSub), "UV TILE");
    }
    else
    {
        const uint32_t EnabledCnt = Session->QueryEnabledLayerCount();
        const uint32_t TotalCnt   = static_cast<uint32_t>(Session->StrataLayers.size());
        const uint32_t ChCnt      = ActiveLayer != nullptr ? static_cast<uint32_t>(ActiveLayer->Channels.size()) : 0u;
        std::snprintf(StrataStr, sizeof(StrataStr), "%u/%u", EnabledCnt, TotalCnt);
        std::snprintf(StrataSub, sizeof(StrataSub), "%u ch", ChCnt);
    }

    const std::array<MetricTileReading, 3u> Metrics {{
        { "Roughness", RoughStr,  "Microfacet", true  },
        { "Metalness", MetalStr,  "Conductor",  false },
        { PatternSelected ? "Tile" : "Strata", StrataStr, StrataSub, false },
    }};
    CurY += ConstructMetricTrioTiles(Surface, LeftX, CurY, InnerW, Metrics, Theme);
    CurY += 10.0f;

    // 3. Two-Tab Bar: [ Properties | Layer Stack (N) ]
    constexpr float TabBarH = 30.0f;
    const float     HalfW   = InnerW * 0.5f;
    const Rectangle2D PropTabR  { LeftX, CurY, HalfW, TabBarH };
    const Rectangle2D StackTabR { LeftX + HalfW, CurY, HalfW, TabBarH };
    Surface.StrokeLine({ LeftX, CurY + TabBarH }, { LeftX + InnerW, CurY + TabBarH }, Theme.BorderSubtle, 1.0f);

    const bool PropActive  = (Session->ActiveInspectorTab == MaterialInspectorTab::Properties);
    const bool StackActive = (Session->ActiveInspectorTab == MaterialInspectorTab::LayerStack);

    const float PropLabelW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 10.5f, "Properties");
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { PropTabR.X + (HalfW - PropLabelW) * 0.5f, PropTabR.Y + 7.0f },
        10.5f,
        PropActive || PropTabR.Contains(BodyCursor) ? Theme.TextPrimary : Theme.TextMuted,
        "Properties");
    if (PropActive)
    {
        Surface.StrokeLine({ PropTabR.X, PropTabR.Bottom() }, { PropTabR.Right(), PropTabR.Bottom() }, Theme.TextPrimary, 1.5f);
    }

    char CountText[16] {};
    std::snprintf(CountText, sizeof(CountText), "%u", Session->QueryTotalLayerRowCount());
    const float StackTextW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 10.5f, "Layer Stack");
    const float TagW       = std::max(18.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 8.5f, CountText) + 10.0f);
    const float StackStartX = StackTabR.X + (HalfW - (StackTextW + 6.0f + TagW)) * 0.5f;
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { StackStartX, StackTabR.Y + 7.0f },
        10.5f,
        StackActive || StackTabR.Contains(BodyCursor) ? Theme.TextPrimary : Theme.TextMuted,
        "Layer Stack");
    const Rectangle2D CountTagR{ StackStartX + StackTextW + 6.0f, StackTabR.Y + 6.0f, TagW, 17.0f };
    Surface.FillRectangle(CountTagR, Theme.WellSurface, 8.5f);
    Surface.StrokeRectangle(CountTagR, Theme.BorderSubtle, 8.5f, 1.0f);
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { CountTagR.X + (TagW - WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 8.5f, CountText)) * 0.5f, CountTagR.Y + 3.0f },
        8.5f,
        StackActive ? Theme.TextPrimary : Theme.TextMuted,
        CountText);
    if (StackActive)
    {
        Surface.StrokeLine({ StackTabR.X, StackTabR.Bottom() }, { StackTabR.Right(), StackTabR.Bottom() }, Theme.TextPrimary, 1.5f);
    }

    if (BodyPressed && PropTabR.Contains(BodyCursor))
    {
        Session->ActiveInspectorTab = MaterialInspectorTab::Properties;
        ScrollOffsetY               = 0.0f;
        CloseAllSheets();
    }
    else if (BodyPressed && StackTabR.Contains(BodyCursor))
    {
        Session->ActiveInspectorTab = MaterialInspectorTab::LayerStack;
        ScrollOffsetY               = 0.0f;
        CloseAllSheets();
    }
    CurY += TabBarH + 8.0f;

    // 4. Scroll Region between tabs and bottom status footer
    constexpr float FooterH = 24.0f;
    const Rectangle2D ScrollRect{ Bounds.X, CurY, Bounds.Width, std::max(40.0f, (Bounds.Bottom() - FooterH) - CurY) };

    // Deferred sheet anchor tracking
    Rectangle2D CapturedAddChannelBtn   {};
    Rectangle2D CapturedChSelectBtn     {};
    Rectangle2D CapturedChSourceBtn     {};
    Rectangle2D CapturedProcedureBtn    {};
    Rectangle2D CapturedPatternBtn      {};
    Rectangle2D CapturedGeometryBtn     {};
    Rectangle2D CapturedChSwatchBtn     {};
    Rectangle2D CapturedAlbedoSwatchBtn {};
    Rectangle2D CapturedStopASwatchBtn  {};
    Rectangle2D CapturedStopBSwatchBtn  {};
    Rectangle2D CapturedFlakeTintBtn    {};

    // Compute exact wheel scroll BEFORE rendering body
    if (!OverlayOpen && ScrollRect.Contains(Cursor) && std::abs(Input.WheelDeltaY) > 1.0e-4f)
    {
        ScrollOffsetY = ControlAppearance::AdvanceScrollOffset(ScrollOffsetY, Input.WheelDeltaY * 28.0f, CachedContentHeight, ScrollRect.Height);
    }
    if (!BodyInput.PrimaryPointer.Down)
    {
        ActiveSliderId      = -1;
        DraggingLayerActive = false;
    }

    Surface.PushClip(ScrollRect);
    float StackY = ScrollRect.Y + 4.0f - ScrollOffsetY;
    const float ScrollStartTop = StackY;

    auto BeginSlider = [this, &BodyInput](int32_t SliderId, bool& OutDragging)
    {
        OutDragging = (ActiveSliderId == SliderId);
        return &OutDragging;
    };

    int32_t NextSliderId = 100;

    if (Session->ActiveInspectorTab == MaterialInspectorTab::Properties)
    {
        // Routine to construct Tileable Pattern Texture section
        auto ConstructPatternSection = [&](bool OpenDefault)
        {
            const auto& Pat        = Session->PatternOverlay;
            const char* RightLabel = Pat.Attached ? Pat.Name.c_str() : "NONE";

            const float HeaderH = 36.0f;
            float BodyH = 0.0f;
            if (PatternSectionExpanded)
            {
                BodyH = 12.0f + 48.0f + 34.0f; // Apply Pattern dropdown + 2 operation buttons
                if (Pat.Attached)
                {
                    BodyH += 52.0f * 2.0f; // Repeats, Rotation
                    BodyH += 54.0f * 2.0f; // Projection, Tile Axes
                    BodyH += 78.0f;        // Pattern PBR Channels
                    BodyH += 52.0f;        // Beadwork Relief
                }
                else
                {
                    BodyH += 34.0f;
                }
            }
            const Rectangle2D SecRect{ LeftX, StackY, InnerW, HeaderH + BodyH };
            BeginSectionContainer(Surface, SecRect, Theme, 18.0f);

            const Rectangle2D HeadRect{ LeftX + 12.0f, StackY + 10.0f, InnerW - 24.0f, 20.0f };
            if (ConstructSectionHeaderRow(
                    Surface, HeadRect, ControlIcon::PatternTile, "Tileable Pattern Texture", RightLabel, PatternSectionExpanded, Theme, BodyCursor, BodyPressed))
            {
                PatternSectionExpanded = !PatternSectionExpanded;
            }
            if (!PatternSectionExpanded && OpenDefault && Pat.Attached)
            {
                PatternSectionExpanded = true;
            }

            if (PatternSectionExpanded)
            {
                float InnerY = StackY + HeaderH + 6.0f;
                const float Sx = LeftX + 12.0f;
                const float Sw = InnerW - 24.0f;

                const auto& PatLabels = MaterialWorkspaceSession::InspectPatternDirectoryLabels();
                const uint32_t PatIdx = Pat.PresetIndex % static_cast<uint32_t>(PatLabels.size());
                if (ConstructDropdownBarRow(
                        Surface,
                        Sx,
                        InnerY,
                        Sw,
                        "Apply Pattern",
                        PatLabels[PatIdx],
                        ActiveDropdown == OpenDropdownVariant::PatternPreset,
                        Theme,
                        BodyInput.PrimaryPointer,
                        CapturedPatternBtn))
                {
                    ActiveDropdown       = (ActiveDropdown == OpenDropdownVariant::PatternPreset) ? OpenDropdownVariant::None : OpenDropdownVariant::PatternPreset;
                    ActiveDropdownAnchor = CapturedPatternBtn;
                    ActiveSwatchTarget   = MaterialSwatchTarget::None;
                }
                InnerY += 52.0f;

                const float BtnHalfW = (Sw - 6.0f) * 0.5f;
                if (ConstructCapsuleButtonControl(
                        Surface,
                        { Sx, InnerY, BtnHalfW, 28.0f },
                        "+ Tile Selected",
                        Theme,
                        BodyCursor,
                        BodyPressed,
                        false,
                        false,
                        ControlIcon::ImageTile,
                        9.5f))
                {
                    Session->ApplyExternalPatternDocument(PatLabels[PatIdx], "Pattern Studio", 3.0f);
                }
                if (ConstructCapsuleButtonControl(
                        Surface,
                        { Sx + BtnHalfW + 6.0f, InnerY, BtnHalfW, 28.0f },
                        Pat.Attached ? "Clear Pattern" : "Apply African",
                        Theme,
                        BodyCursor,
                        BodyPressed,
                        false,
                        false,
                        Pat.Attached ? ControlIcon::CloseCross : ControlIcon::LayoutGrid,
                        9.5f))
                {
                    if (Pat.Attached)
                    {
                        Session->ClearAttachedPattern();
                    }
                    else
                    {
                        Session->ApplyExternalPatternDocument(PatLabels[0], "African Patterns", 3.0f);
                    }
                }
                InnerY += 36.0f;

                if (Pat.Attached)
                {
                    auto& ModPat = Session->PatternOverlay;
                    float RepNorm = std::clamp((ModPat.Repeats - 0.5f) / 15.5f, 0.0f, 1.0f);
                    char  RepBuf[16] {};
                    std::snprintf(RepBuf, sizeof(RepBuf), "%.2f", ModPat.Repeats);
                    bool DraggingRep = false;
                    BeginSlider(NextSliderId, DraggingRep);
                    if (ConstructSliderReadoutRow(Surface, Sx, InnerY, Sw, "Tile Repeats", RepBuf, "x", RepNorm, Theme, BodyInput.PrimaryPointer, DraggingRep))
                    {
                        ActiveSliderId   = NextSliderId;
                        ModPat.Repeats   = 0.5f + RepNorm * 15.5f;
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                    InnerY += 52.0f;

                    float RotNorm = std::clamp((ModPat.RotationDegrees + 180.0f) / 360.0f, 0.0f, 1.0f);
                    char  RotBuf[16] {};
                    std::snprintf(RotBuf, sizeof(RotBuf), "%.0f", ModPat.RotationDegrees);
                    bool DraggingRot = false;
                    BeginSlider(NextSliderId, DraggingRot);
                    if (ConstructSliderReadoutRow(Surface, Sx, InnerY, Sw, "Pattern Rotation", RotBuf, "deg", RotNorm, Theme, BodyInput.PrimaryPointer, DraggingRot))
                    {
                        ActiveSliderId         = NextSliderId;
                        ModPat.RotationDegrees = -180.0f + RotNorm * 360.0f;
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                    InnerY += 52.0f;

                    static constexpr const char* ProjOpts[3] { "UV Map", "Triplanar", "Cylinder" };
                    uint32_t ProjChoice = static_cast<uint32_t>(ModPat.Projection);
                    if (ConstructSegmentedCapsuleRow(Surface, Sx, InnerY, Sw, "Projection", ProjOpts, 3u, ProjChoice, ProjChoice, Theme, BodyInput.PrimaryPointer))
                    {
                        ModPat.Projection = static_cast<PatternProjectionMode>(ProjChoice % 3u);
                        ++Session->RevisionCounter;
                    }
                    InnerY += 54.0f;

                    static constexpr const char* AxesOpts[4] { "Both XY", "X Only", "Y Only", "Single" };
                    uint32_t AxesChoice = static_cast<uint32_t>(ModPat.TileRepeatAxes);
                    if (ConstructSegmentedCapsuleRow(Surface, Sx, InnerY, Sw, "Tile Axes", AxesOpts, 4u, AxesChoice, AxesChoice, Theme, BodyInput.PrimaryPointer))
                    {
                        ModPat.TileRepeatAxes = static_cast<PatternTileRepeatMode>(AxesChoice % 4u);
                        ++Session->RevisionCounter;
                    }
                    InnerY += 54.0f;

                    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { Sx, InnerY }, 10.5f, Theme.TextMuted, "Pattern PBR Channels");
                    InnerY += 16.0f;
                    static constexpr const char* PatMaskLabels[8] { "Albedo", "Roughness", "Metalness", "Height", "Normal", "AO", "Coat", "Sheen" };
                    float Mx = Sx;
                    float My = InnerY;
                    for (uint32_t Idx = 0u; Idx < 8u; ++Idx)
                    {
                        const float W = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.0f, PatMaskLabels[Idx]) + 18.0f;
                        if (Mx > Sx && Mx + W > Sx + Sw)
                        {
                            Mx = Sx;
                            My += 26.0f;
                        }
                        const Rectangle2D ChipR{ Mx, My, W, 22.0f };
                        const bool Active = ModPat.EnabledMasks[Idx];
                        if (ConstructCapsuleButtonControl(Surface, ChipR, PatMaskLabels[Idx], Theme, BodyCursor, BodyPressed, Active, false, ControlIcon::Count, 9.0f))
                        {
                            ModPat.EnabledMasks[Idx] = !ModPat.EnabledMasks[Idx];
                            ++Session->RevisionCounter;
                        }
                        Mx += W + 5.0f;
                    }
                    InnerY = My + 30.0f;

                    float BeadNorm = std::clamp(ModPat.BeadworkRelief / 0.012f, 0.0f, 1.0f);
                    char  BeadBuf[16] {};
                    std::snprintf(BeadBuf, sizeof(BeadBuf), "%.4f", ModPat.BeadworkRelief);
                    bool DraggingBead = false;
                    BeginSlider(NextSliderId, DraggingBead);
                    if (ConstructSliderReadoutRow(Surface, Sx, InnerY, Sw, "Beadwork Relief", BeadBuf, "-", BeadNorm, Theme, BodyInput.PrimaryPointer, DraggingBead))
                    {
                        ActiveSliderId        = NextSliderId;
                        ModPat.BeadworkRelief = BeadNorm * 0.012f;
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                }
                else
                {
                    WorkspaceAppearance::ConstructTruncatedText(
                        Surface,
                        FontWeightClass::Regular,
                        { Sx, InnerY + 4.0f },
                        Sw,
                        9.2f,
                        Theme.TextFaint,
                        "Select a pattern or click 'Tile on Material' from Pattern Studio.");
                }
            }
            StackY += SecRect.Height + 10.0f;
        };

        if (PatternSelected)
        {
            ConstructPatternSection(true);
        }

        // Layer Inspector section (when MaterialStrataLayer selected)
        if (MaterialStrataLayer* SelLayer = Session->AccessSelectedLayer())
        {
            Session->LayerNameEditBuffer.Active = Session->LayerNameEditBuffer.Active && (Session->ActiveInspectorTab == MaterialInspectorTab::Properties);

            std::vector<RemovableChipEntry> ActiveChips {};
            ActiveChips.reserve(SelLayer->Channels.size());
            for (const MaterialChannelSlot Ch : SelLayer->Channels)
            {
                const auto& Spec = MaterialWorkspaceSession::InspectChannelSpec(Ch);
                ActiveChips.push_back(RemovableChipEntry{
                    Spec.Caption,
                    Spec.DotTint,
                    Ch == Session->InspectedChannel,
                });
            }

            const std::vector<MaterialChannelSlot> AvailChannels = Session->QueryAvailableChannelsForSelectedLayer();
            char AddChBtnLabel[32] {};
            std::snprintf(AddChBtnLabel, sizeof(AddChBtnLabel), "+ Channel (%u)", static_cast<uint32_t>(AvailChannels.size()));

            // Measure wrapped chip height accurately on initial layout sweep
            const float ChipWrapMeasureW = InnerW - 24.0f;
            float TempX = 0.0f;
            float TempH = 22.0f;
            for (const auto& C : ActiveChips)
            {
                const float CW = std::min(ChipWrapMeasureW, 18.0f + WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.0f, C.Label) + 18.0f);
                if (TempX > 0.0f && TempX + CW > ChipWrapMeasureW + 0.5f)
                {
                    TempX = 0.0f;
                    TempH += 27.0f;
                }
                TempX += CW + 5.0f;
            }
            if (!AvailChannels.empty())
            {
                const float AW = std::min(ChipWrapMeasureW, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.2f, AddChBtnLabel) + 28.0f);
                if (TempX > 0.0f && TempX + AW > ChipWrapMeasureW + 0.5f)
                {
                    TempH += 27.0f;
                }
            }

            const auto& ActiveChSpec = MaterialWorkspaceSession::InspectChannelSpec(Session->InspectedChannel);
            auto&       ActiveChSrc  = SelLayer->ChannelSources[static_cast<std::size_t>(Session->InspectedChannel)];

            float ExtraBodyH = 0.0f;
            if (LayerInspectorExpanded)
            {
                ExtraBodyH += 50.0f;             // Layer Name
                ExtraBodyH += 34.0f;             // Layer Enabled
                ExtraBodyH += 22.0f + TempH;     // Layer PBR Channels + chips
                if (SelLayer->Model == MaterialStrataModel::Detail || SelLayer->Model == MaterialStrataModel::Flakes)
                {
                    ExtraBodyH += 52.0f;         // Layer Fraction / Weight
                }
                ExtraBodyH += 52.0f;             // Inspect Channel Field dropdown
                ExtraBodyH += ActiveChSpec.ColourTyped ? 38.0f : 52.0f; // Colour swatch OR Scalar slider
                ExtraBodyH += 52.0f;             // Channel Source dropdown
                if (ActiveChSrc.Mode == ChannelSourceMode::ProceduralField)
                {
                    ExtraBodyH += 52.0f + 52.0f + 78.0f + 32.0f; // Procedure + Scale + StopA/StopB + DirectOverride
                }
                else if (ActiveChSrc.Mode == ChannelSourceMode::LinearGradient ||
                         ActiveChSrc.Mode == ChannelSourceMode::RadialGradient ||
                         ActiveChSrc.Mode == ChannelSourceMode::ConicGradient)
                {
                    ExtraBodyH += 52.0f + 78.0f + 32.0f;
                }
                else if (ActiveChSrc.Mode != ChannelSourceMode::ConstantScalar)
                {
                    ExtraBodyH += 38.0f;
                }
                ExtraBodyH += 20.0f;
            }

            const float       HeadH   = 38.0f;
            const Rectangle2D SecRect { LeftX, StackY, InnerW, HeadH + ExtraBodyH };
            BeginSectionContainer(Surface, SecRect, Theme, 18.0f);

            const std::string LayerTitle = "Layer Inspector: " + SelLayer->Name;
            if (ConstructSectionHeaderRow(
                    Surface,
                    { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f },
                    ControlIcon::LayersSlabs,
                    LayerTitle,
                    UpperModelCaption(SelLayer->Model),
                    LayerInspectorExpanded,
                    Theme,
                    BodyCursor,
                    BodyPressed))
            {
                LayerInspectorExpanded = !LayerInspectorExpanded;
            }

            if (LayerInspectorExpanded)
            {
                float       Iy = StackY + HeadH + 2.0f;
                const float Ix = LeftX + 12.0f;
                const float Iw = InnerW - 24.0f;

                if (Session->LayerNameEditBuffer.Active)
                {
                    WorkspaceAppearance::ForwardInputToTextBuffer(Session->LayerNameEditBuffer, BodyInput, DeltaSeconds);
                }
                if (ConstructTextEditRow(Surface, Ix, Iy, Iw, "Layer Name", Session->LayerNameEditBuffer, BodyInput, Theme) ||
                    Session->LayerNameEditBuffer.Active)
                {
                    if (Session->LayerNameEditBuffer.Length > 0u)
                    {
                        SelLayer->Name = Session->LayerNameEditBuffer.Text;
                        ++Session->RevisionCounter;
                    }
                    Session->LayerNameEditBuffer.Finalized = false;
                }
                Iy += 52.0f;

                if (ConstructSwitchControlRow(Surface, Ix, Iy, Iw, "Layer Enabled", SelLayer->Enabled, Theme, BodyInput.PrimaryPointer))
                {
                    Session->SyncPhysicalSurfaceParameters();
                    ++Session->RevisionCounter;
                }
                Iy += 34.0f;

                WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { Ix, Iy }, 10.5f, Theme.TextMuted, "Layer PBR Channels");
                Iy += 17.0f;
                const RemovableChipOutcome ChipRes = ConstructRemovableChannelChips(
                    Surface,
                    Ix,
                    Iy,
                    Iw,
                    ActiveChips,
                    AvailChannels.empty() ? "" : AddChBtnLabel,
                    ActiveDropdown == OpenDropdownVariant::AddChannel,
                    Theme,
                    BodyCursor,
                    BodyPressed);
                if (ChipRes.RemovedIndex >= 0 && static_cast<std::size_t>(ChipRes.RemovedIndex) < SelLayer->Channels.size())
                {
                    Session->RemoveChannelFromSelectedLayer(SelLayer->Channels[static_cast<std::size_t>(ChipRes.RemovedIndex)]);
                }
                else if (ChipRes.SelectedIndex >= 0 && static_cast<std::size_t>(ChipRes.SelectedIndex) < SelLayer->Channels.size())
                {
                    Session->SelectInspectedChannel(SelLayer->Channels[static_cast<std::size_t>(ChipRes.SelectedIndex)]);
                }
                else if (ChipRes.AddTriggerClicked && !AvailChannels.empty())
                {
                    CapturedAddChannelBtn = ChipRes.AddTriggerBounds;
                    ActiveDropdown        = (ActiveDropdown == OpenDropdownVariant::AddChannel) ? OpenDropdownVariant::None : OpenDropdownVariant::AddChannel;
                    ActiveDropdownAnchor  = CapturedAddChannelBtn;
                    ActiveSwatchTarget    = MaterialSwatchTarget::None;
                    DropdownScrollY       = 0.0f;
                }
                Iy += ChipRes.ConsumedHeight + 10.0f;

                if (SelLayer->Model == MaterialStrataModel::Detail || SelLayer->Model == MaterialStrataModel::Flakes)
                {
                    float WNorm = std::clamp(SelLayer->LayerWeight, 0.0f, 1.0f);
                    char  WBuf[16] {};
                    std::snprintf(WBuf, sizeof(WBuf), "%.2f", SelLayer->LayerWeight);
                    bool DragW = false;
                    BeginSlider(NextSliderId, DragW);
                    if (ConstructSliderReadoutRow(Surface, Ix, Iy, Iw, "Layer Fraction", WBuf, "-", WNorm, Theme, BodyInput.PrimaryPointer, DragW))
                    {
                        ActiveSliderId       = NextSliderId;
                        SelLayer->LayerWeight = WNorm;
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                    Iy += 52.0f;
                }

                const std::string ChDisp = std::string("Ch: ") + ActiveChSpec.Caption;
                if (ConstructDropdownBarRow(
                        Surface,
                        Ix,
                        Iy,
                        Iw,
                        "Inspect Channel Field",
                        ChDisp,
                        ActiveDropdown == OpenDropdownVariant::InspectedChannel,
                        Theme,
                        BodyInput.PrimaryPointer,
                        CapturedChSelectBtn))
                {
                    ActiveDropdown       = (ActiveDropdown == OpenDropdownVariant::InspectedChannel) ? OpenDropdownVariant::None : OpenDropdownVariant::InspectedChannel;
                    ActiveDropdownAnchor = CapturedChSelectBtn;
                    ActiveSwatchTarget   = MaterialSwatchTarget::None;
                    DropdownScrollY      = 0.0f;
                }
                Iy += 52.0f;

                if (ActiveChSpec.ColourTyped)
                {
                    const ColorRgba ActiveCol = (Session->InspectedChannel == MaterialChannelSlot::Colour && SelLayer->Model == MaterialStrataModel::Surface)
                        ? Session->PrimaryAlbedo
                        : ActiveChSrc.StopPrimary;
                    char HexBuf[16] {};
                    FormatHexLower(ActiveCol, HexBuf, sizeof(HexBuf));
                    if (ConstructColourSwatchRow(
                            Surface,
                            Ix,
                            Iy,
                            Iw,
                            "Colour Reading",
                            HexBuf,
                            ActiveCol,
                            Theme,
                            BodyInput.PrimaryPointer,
                            CapturedChSwatchBtn))
                    {
                        ActiveSwatchTarget = (ActiveSwatchTarget == MaterialSwatchTarget::InspectedChannel) ? MaterialSwatchTarget::None : MaterialSwatchTarget::InspectedChannel;
                        ActiveSwatchAnchor = CapturedChSwatchBtn;
                        ActiveDropdown     = OpenDropdownVariant::None;
                    }
                    Iy += 38.0f;
                }
                else
                {
                    const float Span = std::max(1.0e-3f, ActiveChSpec.MaxRange - ActiveChSpec.MinRange);
                    float Norm = std::clamp((ActiveChSrc.ScalarReading - ActiveChSpec.MinRange) / Span, 0.0f, 1.0f);
                    char NumBuf[16] {};
                    std::snprintf(NumBuf, sizeof(NumBuf), "%.2f", ActiveChSrc.ScalarReading);
                    bool DragCh = false;
                    BeginSlider(NextSliderId, DragCh);
                    if (ConstructSliderReadoutRow(Surface, Ix, Iy, Iw, ActiveChSpec.Caption, NumBuf, "-", Norm, Theme, BodyInput.PrimaryPointer, DragCh))
                    {
                        ActiveSliderId            = NextSliderId;
                        ActiveChSrc.ScalarReading = ActiveChSpec.MinRange + Norm * Span;
                        if (Session->InspectedChannel == MaterialChannelSlot::Roughness)
                        {
                            Session->Roughness = ActiveChSrc.ScalarReading;
                        }
                        else if (Session->InspectedChannel == MaterialChannelSlot::Metallic)
                        {
                            Session->Metalness = ActiveChSrc.ScalarReading;
                        }
                        else if (Session->InspectedChannel == MaterialChannelSlot::DielectricIOR)
                        {
                            Session->DielectricIOR = ActiveChSrc.ScalarReading;
                        }
                        Session->SyncPhysicalSurfaceParameters();
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                    Iy += 52.0f;
                }

                const auto& SrcLabels = MaterialWorkspaceSession::InspectSourceModeLabels();
                const uint32_t SrcIdx = static_cast<uint32_t>(ActiveChSrc.Mode) % static_cast<uint32_t>(SrcLabels.size());
                const std::string SrcDisp = std::string("Src: ") + SrcLabels[SrcIdx];
                if (ConstructDropdownBarRow(
                        Surface,
                        Ix,
                        Iy,
                        Iw,
                        "Channel Source",
                        SrcDisp,
                        ActiveDropdown == OpenDropdownVariant::ChannelSource,
                        Theme,
                        BodyInput.PrimaryPointer,
                        CapturedChSourceBtn))
                {
                    ActiveDropdown       = (ActiveDropdown == OpenDropdownVariant::ChannelSource) ? OpenDropdownVariant::None : OpenDropdownVariant::ChannelSource;
                    ActiveDropdownAnchor = CapturedChSourceBtn;
                    ActiveSwatchTarget   = MaterialSwatchTarget::None;
                }
                Iy += 52.0f;

                if (ActiveChSrc.Mode == ChannelSourceMode::ProceduralField)
                {
                    const auto& ProcLabels = MaterialWorkspaceSession::InspectFieldProcedureLabels();
                    const uint32_t ProcIdx = static_cast<uint32_t>(ActiveChSrc.Procedure) % static_cast<uint32_t>(ProcLabels.size());
                    if (ConstructDropdownBarRow(
                            Surface,
                            Ix,
                            Iy,
                            Iw,
                            "Generator Procedure",
                            ProcLabels[ProcIdx],
                            ActiveDropdown == OpenDropdownVariant::FieldProcedure,
                            Theme,
                            BodyInput.PrimaryPointer,
                            CapturedProcedureBtn))
                    {
                        ActiveDropdown       = (ActiveDropdown == OpenDropdownVariant::FieldProcedure) ? OpenDropdownVariant::None : OpenDropdownVariant::FieldProcedure;
                        ActiveDropdownAnchor = CapturedProcedureBtn;
                        ActiveSwatchTarget   = MaterialSwatchTarget::None;
                    }
                    Iy += 52.0f;
                }

                if (ActiveChSrc.Mode == ChannelSourceMode::ProceduralField ||
                    ActiveChSrc.Mode == ChannelSourceMode::LinearGradient ||
                    ActiveChSrc.Mode == ChannelSourceMode::RadialGradient ||
                    ActiveChSrc.Mode == ChannelSourceMode::ConicGradient)
                {
                    float ScaleNorm = std::clamp((ActiveChSrc.FieldScale - 0.5f) / 31.5f, 0.0f, 1.0f);
                    char ScaleBuf[16] {};
                    std::snprintf(ScaleBuf, sizeof(ScaleBuf), "%.1f", ActiveChSrc.FieldScale);
                    bool DragScale = false;
                    BeginSlider(NextSliderId, DragScale);
                    if (ConstructSliderReadoutRow(Surface, Ix, Iy, Iw, "Field Scale", ScaleBuf, "x", ScaleNorm, Theme, BodyInput.PrimaryPointer, DragScale))
                    {
                        ActiveSliderId         = NextSliderId;
                        ActiveChSrc.FieldScale = 0.5f + ScaleNorm * 31.5f;
                        ++Session->RevisionCounter;
                    }
                    ++NextSliderId;
                    Iy += 52.0f;

                    char HexA[16] {}, HexB[16] {};
                    FormatHexLower(ActiveChSrc.StopPrimary, HexA, sizeof(HexA));
                    FormatHexLower(ActiveChSrc.StopSecondary, HexB, sizeof(HexB));
                    if (ConstructColourSwatchRow(Surface, Ix, Iy, Iw, "Stop A (Low)", HexA, ActiveChSrc.StopPrimary, Theme, BodyInput.PrimaryPointer, CapturedStopASwatchBtn))
                    {
                        ActiveSwatchTarget = (ActiveSwatchTarget == MaterialSwatchTarget::GradientStopA) ? MaterialSwatchTarget::None : MaterialSwatchTarget::GradientStopA;
                        ActiveSwatchAnchor = CapturedStopASwatchBtn;
                        ActiveDropdown     = OpenDropdownVariant::None;
                    }
                    Iy += 38.0f;
                    if (ConstructColourSwatchRow(Surface, Ix, Iy, Iw, "Stop B (High)", HexB, ActiveChSrc.StopSecondary, Theme, BodyInput.PrimaryPointer, CapturedStopBSwatchBtn))
                    {
                        ActiveSwatchTarget = (ActiveSwatchTarget == MaterialSwatchTarget::GradientStopB) ? MaterialSwatchTarget::None : MaterialSwatchTarget::GradientStopB;
                        ActiveSwatchAnchor = CapturedStopBSwatchBtn;
                        ActiveDropdown     = OpenDropdownVariant::None;
                    }
                    Iy += 38.0f;
                    (void)ConstructSwitchControlRow(Surface, Ix, Iy, Iw, "Direct Scalar Override", ActiveChSrc.DirectOverride, Theme, BodyInput.PrimaryPointer);
                }
                else if (ActiveChSrc.Mode == ChannelSourceMode::ImageTile || ActiveChSrc.Mode == ChannelSourceMode::ActivePattern)
                {
                    (void)ConstructSwitchControlRow(Surface, Ix, Iy, Iw, "Direct Scalar Override", ActiveChSrc.DirectOverride, Theme, BodyInput.PrimaryPointer);
                }
            }
            StackY += SecRect.Height + 10.0f;
        }

        // Model-specific optical sections (Surface Albedo & Microfacet + Finish Controls, Clearcoat, Flakes, Detail)
        const MaterialStrataModel SelModel = ActiveLayer != nullptr ? ActiveLayer->Model : MaterialStrataModel::Surface;
        if (ActiveLayer == nullptr || SelModel == MaterialStrataModel::Surface)
        {
            // Surface Albedo & Microfacet
            const float SurfBodyH = SurfaceSectionExpanded ? (38.0f + 52.0f * 3.0f + 8.0f) : 0.0f;
            const Rectangle2D SurfSec{ LeftX, StackY, InnerW, 38.0f + SurfBodyH };
            BeginSectionContainer(Surface, SurfSec, Theme, 18.0f);
            if (ConstructSectionHeaderRow(
                    Surface,
                    { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f },
                    ControlIcon::MaterialSphere,
                    "Surface Albedo & Microfacet",
                    Session->MaterialCategory,
                    SurfaceSectionExpanded,
                    Theme,
                    BodyCursor,
                    BodyPressed))
            {
                SurfaceSectionExpanded = !SurfaceSectionExpanded;
            }

            if (SurfaceSectionExpanded)
            {
                float Sy = StackY + 40.0f;
                const float Sx = LeftX + 12.0f;
                const float Sw = InnerW - 24.0f;
                char AlbedoHex[16] {};
                FormatHexLower(Session->PrimaryAlbedo, AlbedoHex, sizeof(AlbedoHex));
                if (ConstructColourSwatchRow(
                        Surface, Sx, Sy, Sw, "Base Albedo", AlbedoHex, Session->PrimaryAlbedo, Theme, BodyInput.PrimaryPointer, CapturedAlbedoSwatchBtn))
                {
                    ActiveSwatchTarget = (ActiveSwatchTarget == MaterialSwatchTarget::PrimaryAlbedo) ? MaterialSwatchTarget::None : MaterialSwatchTarget::PrimaryAlbedo;
                    ActiveSwatchAnchor = CapturedAlbedoSwatchBtn;
                    ActiveDropdown     = OpenDropdownVariant::None;
                }
                Sy += 38.0f;

                float RoughNorm = std::clamp((Session->Roughness - 0.02f) / 0.98f, 0.0f, 1.0f);
                char  RoughBuf[16] {};
                std::snprintf(RoughBuf, sizeof(RoughBuf), "%.2f", Session->Roughness);
                bool DragRough = false;
                BeginSlider(NextSliderId, DragRough);
                if (ConstructSliderReadoutRow(Surface, Sx, Sy, Sw, "Roughness", RoughBuf, "-", RoughNorm, Theme, BodyInput.PrimaryPointer, DragRough))
                {
                    ActiveSliderId     = NextSliderId;
                    Session->Roughness = 0.02f + RoughNorm * 0.98f;
                    Session->SyncPhysicalSurfaceParameters();
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
                Sy += 52.0f;

                float MetalNorm = std::clamp(Session->Metalness, 0.0f, 1.0f);
                char  MetalBuf[16] {};
                std::snprintf(MetalBuf, sizeof(MetalBuf), "%.2f", Session->Metalness);
                bool DragMetal = false;
                BeginSlider(NextSliderId, DragMetal);
                if (ConstructSliderReadoutRow(Surface, Sx, Sy, Sw, "Metalness", MetalBuf, "-", MetalNorm, Theme, BodyInput.PrimaryPointer, DragMetal))
                {
                    ActiveSliderId     = NextSliderId;
                    Session->Metalness = MetalNorm;
                    Session->SyncPhysicalSurfaceParameters();
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
                Sy += 52.0f;

                float IorNorm = std::clamp((Session->DielectricIOR - 1.0f) / 1.8f, 0.0f, 1.0f);
                char  IorBuf[16] {};
                std::snprintf(IorBuf, sizeof(IorBuf), "%.2f", Session->DielectricIOR);
                bool DragIor = false;
                BeginSlider(NextSliderId, DragIor);
                if (ConstructSliderReadoutRow(Surface, Sx, Sy, Sw, "Specular / IOR", IorBuf, "-", IorNorm, Theme, BodyInput.PrimaryPointer, DragIor))
                {
                    ActiveSliderId         = NextSliderId;
                    Session->DielectricIOR = 1.0f + IorNorm * 1.8f;
                    Session->SyncPhysicalSurfaceParameters();
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
            }
            StackY += SurfSec.Height + 10.0f;

            // Finish Controls (exact match to 03-HTML-material-props-scrolled.png)
            const float FinBodyH = FinishSectionExpanded ? (52.0f * 3.0f + 34.0f + 8.0f) : 0.0f;
            const Rectangle2D FinSec{ LeftX, StackY, InnerW, 38.0f + FinBodyH };
            BeginSectionContainer(Surface, FinSec, Theme, 18.0f);
            if (ConstructSectionHeaderRow(
                    Surface,
                    { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f },
                    ControlIcon::SlidersQuality,
                    "Finish Controls",
                    "",
                    FinishSectionExpanded,
                    Theme,
                    BodyCursor,
                    BodyPressed))
            {
                FinishSectionExpanded = !FinishSectionExpanded;
            }

            if (FinishSectionExpanded)
            {
                float Fy = StackY + 40.0f;
                const float Fx = LeftX + 12.0f;
                const float Fw = InnerW - 24.0f;

                float PRNorm = std::clamp((Session->PaintRoughness - 0.02f) / 0.98f, 0.0f, 1.0f);
                char  PRBuf[16] {};
                std::snprintf(PRBuf, sizeof(PRBuf), "%.2f", Session->PaintRoughness);
                bool DragPR = false;
                BeginSlider(NextSliderId, DragPR);
                if (ConstructSliderReadoutRow(Surface, Fx, Fy, Fw, "Paint roughness", PRBuf, "-", PRNorm, Theme, BodyInput.PrimaryPointer, DragPR))
                {
                    ActiveSliderId          = NextSliderId;
                    Session->PaintRoughness = 0.02f + PRNorm * 0.98f;
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
                Fy += 52.0f;

                float PDNorm = std::clamp(Session->PaintDepth, 0.0f, 1.0f);
                char  PDBuf[16] {};
                std::snprintf(PDBuf, sizeof(PDBuf), "%.2f", Session->PaintDepth);
                bool DragPD = false;
                BeginSlider(NextSliderId, DragPD);
                if (ConstructSliderReadoutRow(Surface, Fx, Fy, Fw, "Paint depth", PDBuf, "-", PDNorm, Theme, BodyInput.PrimaryPointer, DragPD))
                {
                    ActiveSliderId      = NextSliderId;
                    Session->PaintDepth = PDNorm;
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
                Fy += 52.0f;

                float CGNorm = std::clamp(Session->ClearcoatGloss, 0.0f, 1.0f);
                char  CGBuf[16] {};
                std::snprintf(CGBuf, sizeof(CGBuf), "%.2f", Session->ClearcoatGloss);
                bool DragCG = false;
                BeginSlider(NextSliderId, DragCG);
                if (ConstructSliderReadoutRow(Surface, Fx, Fy, Fw, "Clearcoat gloss", CGBuf, "-", CGNorm, Theme, BodyInput.PrimaryPointer, DragCG))
                {
                    ActiveSliderId          = NextSliderId;
                    Session->ClearcoatGloss = CGNorm;
                    ++Session->RevisionCounter;
                }
                ++NextSliderId;
                Fy += 52.0f;

                if (ConstructSwitchControlRow(Surface, Fx, Fy, Fw, "Metal Micro-Scratches", Session->MetalScratches, Theme, BodyInput.PrimaryPointer))
                {
                    ++Session->RevisionCounter;
                }
            }
            StackY += FinSec.Height + 10.0f;
        }
        else if (SelModel == MaterialStrataModel::Clearcoat)
        {
            const Rectangle2D CoatSec{ LeftX, StackY, InnerW, 38.0f + 52.0f * 4.0f + 8.0f };
            BeginSectionContainer(Surface, CoatSec, Theme, 18.0f);
            ConstructSectionHeaderRow(Surface, { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f }, ControlIcon::SparklesAntiAliasing, "Clearcoat Optical Properties", "LACQUER", true, Theme, BodyCursor, false);

            float Cy = StackY + 40.0f;
            const float Cx = LeftX + 12.0f;
            const float Cw = InnerW - 24.0f;

            float WNorm = std::clamp(Session->ClearcoatWeight, 0.0f, 1.0f);
            char  WBuf[16] {};
            std::snprintf(WBuf, sizeof(WBuf), "%.2f", Session->ClearcoatWeight);
            bool DragW = false;
            BeginSlider(NextSliderId, DragW);
            if (ConstructSliderReadoutRow(Surface, Cx, Cy, Cw, "Clearcoat Weight", WBuf, "-", WNorm, Theme, BodyInput.PrimaryPointer, DragW))
            {
                ActiveSliderId           = NextSliderId;
                Session->ClearcoatWeight = WNorm;
                Session->SyncPhysicalSurfaceParameters();
            }
            ++NextSliderId;
            Cy += 52.0f;

            float RNorm = std::clamp((Session->ClearcoatRoughness - 0.01f) / 0.99f, 0.0f, 1.0f);
            char  RBuf[16] {};
            std::snprintf(RBuf, sizeof(RBuf), "%.2f", Session->ClearcoatRoughness);
            bool DragR = false;
            BeginSlider(NextSliderId, DragR);
            if (ConstructSliderReadoutRow(Surface, Cx, Cy, Cw, "Coat Roughness", RBuf, "-", RNorm, Theme, BodyInput.PrimaryPointer, DragR))
            {
                ActiveSliderId              = NextSliderId;
                Session->ClearcoatRoughness = 0.01f + RNorm * 0.99f;
                Session->SyncPhysicalSurfaceParameters();
            }
            ++NextSliderId;
            Cy += 52.0f;

            float INorm = std::clamp((Session->ClearcoatIOR - 1.0f) / 1.5f, 0.0f, 1.0f);
            char  IBuf[16] {};
            std::snprintf(IBuf, sizeof(IBuf), "%.2f", Session->ClearcoatIOR);
            bool DragI = false;
            BeginSlider(NextSliderId, DragI);
            if (ConstructSliderReadoutRow(Surface, Cx, Cy, Cw, "Coat IOR", IBuf, "-", INorm, Theme, BodyInput.PrimaryPointer, DragI))
            {
                ActiveSliderId        = NextSliderId;
                Session->ClearcoatIOR = 1.0f + INorm * 1.5f;
                Session->SyncPhysicalSurfaceParameters();
            }
            ++NextSliderId;
            Cy += 52.0f;

            float ONorm = std::clamp(Session->OrangePeelRelief, 0.0f, 1.0f);
            char  OBuf[16] {};
            std::snprintf(OBuf, sizeof(OBuf), "%.2f", Session->OrangePeelRelief);
            bool DragO = false;
            BeginSlider(NextSliderId, DragO);
            if (ConstructSliderReadoutRow(Surface, Cx, Cy, Cw, "Orange Peel Relief", OBuf, "-", ONorm, Theme, BodyInput.PrimaryPointer, DragO))
            {
                ActiveSliderId            = NextSliderId;
                Session->OrangePeelRelief = ONorm;
            }
            ++NextSliderId;
            StackY += CoatSec.Height + 10.0f;
        }
        else if (SelModel == MaterialStrataModel::Flakes)
        {
            const Rectangle2D FlSec{ LeftX, StackY, InnerW, 38.0f + 52.0f * 3.0f + 42.0f };
            BeginSectionContainer(Surface, FlSec, Theme, 18.0f);
            ConstructSectionHeaderRow(Surface, { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f }, ControlIcon::LayoutGrid, "Metallic Flake Dispersion", "GLINT", true, Theme, BodyCursor, false);

            float Fly = StackY + 40.0f;
            const float Flx = LeftX + 12.0f;
            const float Flw = InnerW - 24.0f;

            float DNorm = std::clamp(Session->FlakeDensity, 0.0f, 1.0f);
            char  DBuf[16] {};
            std::snprintf(DBuf, sizeof(DBuf), "%.2f", Session->FlakeDensity);
            bool DragD = false;
            BeginSlider(NextSliderId, DragD);
            if (ConstructSliderReadoutRow(Surface, Flx, Fly, Flw, "Flake Density", DBuf, "-", DNorm, Theme, BodyInput.PrimaryPointer, DragD))
            {
                ActiveSliderId        = NextSliderId;
                Session->FlakeDensity = DNorm;
                Session->SyncPhysicalSurfaceParameters();
            }
            ++NextSliderId;
            Fly += 52.0f;

            float FNorm = std::clamp((Session->FlakeFrequency - 4.0f) / 116.0f, 0.0f, 1.0f);
            char  FBuf[16] {};
            std::snprintf(FBuf, sizeof(FBuf), "%.0f", Session->FlakeFrequency);
            bool DragF = false;
            BeginSlider(NextSliderId, DragF);
            if (ConstructSliderReadoutRow(Surface, Flx, Fly, Flw, "Flake Frequency", FBuf, "-", FNorm, Theme, BodyInput.PrimaryPointer, DragF))
            {
                ActiveSliderId          = NextSliderId;
                Session->FlakeFrequency = 4.0f + FNorm * 116.0f;
            }
            ++NextSliderId;
            Fly += 52.0f;

            float TNorm = std::clamp(Session->FlakeTilt, 0.0f, 1.0f);
            char  TBuf[16] {};
            std::snprintf(TBuf, sizeof(TBuf), "%.2f", Session->FlakeTilt);
            bool DragT = false;
            BeginSlider(NextSliderId, DragT);
            if (ConstructSliderReadoutRow(Surface, Flx, Fly, Flw, "Flake Tilt", TBuf, "-", TNorm, Theme, BodyInput.PrimaryPointer, DragT))
            {
                ActiveSliderId     = NextSliderId;
                Session->FlakeTilt = TNorm;
            }
            ++NextSliderId;
            Fly += 52.0f;

            char FlakeHex[16] {};
            FormatHexLower(Session->FlakeSecondaryTint, FlakeHex, sizeof(FlakeHex));
            if (ConstructColourSwatchRow(Surface, Flx, Fly, Flw, "Flake Tint Swatch", FlakeHex, Session->FlakeSecondaryTint, Theme, BodyInput.PrimaryPointer, CapturedFlakeTintBtn))
            {
                ActiveSwatchTarget = (ActiveSwatchTarget == MaterialSwatchTarget::FlakeSecondaryTint) ? MaterialSwatchTarget::None : MaterialSwatchTarget::FlakeSecondaryTint;
                ActiveSwatchAnchor = CapturedFlakeTintBtn;
                ActiveDropdown     = OpenDropdownVariant::None;
            }
            StackY += FlSec.Height + 10.0f;
        }
        else
        {
            const Rectangle2D DetSec{ LeftX, StackY, InnerW, 118.0f };
            BeginSectionContainer(Surface, DetSec, Theme, 18.0f);
            ConstructSectionHeaderRow(Surface, { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f }, ControlIcon::SlidersQuality, "Detail Strata Presets", "FIELD", true, Theme, BodyCursor, false);

            const float Dx = LeftX + 12.0f;
            const float Dw = (InnerW - 30.0f) * 0.5f;
            if (ConstructCapsuleButtonControl(Surface, { Dx, StackY + 42.0f, Dw, 28.0f }, "Fractal Scuffs", Theme, BodyCursor, BodyPressed, false, false, ControlIcon::NoiseWave, 9.5f))
            {
                Session->ApplyDetailFieldPreset(FieldProcedureVariant::PerlinNoise, { 20u, 22u, 26u, 255u }, { 201u, 184u, 155u, 255u });
            }
            if (ConstructCapsuleButtonControl(Surface, { Dx + Dw + 6.0f, StackY + 42.0f, Dw, 28.0f }, "Camo Patches", Theme, BodyCursor, BodyPressed, false, false, ControlIcon::SparklesAntiAliasing, 9.5f))
            {
                Session->ApplyDetailFieldPreset(FieldProcedureVariant::CamoSmooth, { 52u, 74u, 48u, 255u }, { 166u, 142u, 98u, 255u });
            }
            if (ConstructCapsuleButtonControl(Surface, { Dx, StackY + 76.0f, Dw, 28.0f }, "Voronoi Cells", Theme, BodyCursor, BodyPressed, false, false, ControlIcon::LayoutGrid, 9.5f))
            {
                Session->ApplyDetailFieldPreset(FieldProcedureVariant::VoronoiCells, { 34u, 37u, 43u, 255u }, { 216u, 170u, 91u, 255u });
            }
            if (ConstructCapsuleButtonControl(Surface, { Dx + Dw + 6.0f, StackY + 76.0f, Dw, 28.0f }, "Directional Grain", Theme, BodyCursor, BodyPressed, false, false, ControlIcon::SlidersQuality, 9.5f))
            {
                Session->ApplyDetailFieldPreset(FieldProcedureVariant::DirectionalStripes, { 26u, 29u, 34u, 255u }, { 162u, 171u, 184u, 255u });
            }
            StackY += DetSec.Height + 10.0f;
        }

        if (!PatternSelected)
        {
            ConstructPatternSection(false);
        }

        // Lighting & Turntable section (matches Turntable Lighting collapsed by default)
        const float LightBodyH = LightingSectionExpanded ? (34.0f + 52.0f * 2.0f + 8.0f) : 0.0f;
        const Rectangle2D LightSec{ LeftX, StackY, InnerW, 38.0f + LightBodyH };
        BeginSectionContainer(Surface, LightSec, Theme, 18.0f);
        if (ConstructSectionHeaderRow(
                Surface,
                { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f },
                ControlIcon::SunIllumination,
                "Lighting & Turntable",
                "",
                LightingSectionExpanded,
                Theme,
                BodyCursor,
                BodyPressed))
        {
            LightingSectionExpanded = !LightingSectionExpanded;
        }
        if (LightingSectionExpanded)
        {
            float Ly = StackY + 40.0f;
            const float Lx = LeftX + 12.0f;
            const float Lw = InnerW - 24.0f;

            (void)ConstructSwitchControlRow(Surface, Lx, Ly, Lw, "Auto-Rotate Turntable", Session->AutoRotateTurntable, Theme, BodyInput.PrimaryPointer);
            Ly += 34.0f;

            float AzNorm = std::clamp((Session->LightAzimuthDegrees + 180.0f) / 360.0f, 0.0f, 1.0f);
            char  AzBuf[16] {};
            std::snprintf(AzBuf, sizeof(AzBuf), "%.0f", Session->LightAzimuthDegrees);
            bool DragAz = false;
            BeginSlider(NextSliderId, DragAz);
            if (ConstructSliderReadoutRow(Surface, Lx, Ly, Lw, "Key Light Azimuth", AzBuf, "deg", AzNorm, Theme, BodyInput.PrimaryPointer, DragAz))
            {
                ActiveSliderId               = NextSliderId;
                Session->LightAzimuthDegrees = -180.0f + AzNorm * 360.0f;
            }
            ++NextSliderId;
            Ly += 52.0f;

            float EvNorm = std::clamp((Session->ExposureEV - 0.4f) / 1.8f, 0.0f, 1.0f);
            char  EvBuf[16] {};
            std::snprintf(EvBuf, sizeof(EvBuf), "%.2f", Session->ExposureEV);
            bool DragEv = false;
            BeginSlider(NextSliderId, DragEv);
            if (ConstructSliderReadoutRow(Surface, Lx, Ly, Lw, "Exposure", EvBuf, "EV", EvNorm, Theme, BodyInput.PrimaryPointer, DragEv))
            {
                ActiveSliderId      = NextSliderId;
                Session->ExposureEV = 0.4f + EvNorm * 1.8f;
            }
            ++NextSliderId;
        }
        StackY += LightSec.Height + 10.0f;

        // Export & Paint Bridge
        const float ExpBodyH = ExportSectionExpanded ? 78.0f : 0.0f;
        const Rectangle2D ExpSec{ LeftX, StackY, InnerW, 38.0f + ExpBodyH };
        BeginSectionContainer(Surface, ExpSec, Theme, 18.0f);
        if (ConstructSectionHeaderRow(
                Surface,
                { LeftX + 12.0f, StackY + 11.0f, InnerW - 24.0f, 20.0f },
                ControlIcon::DownloadExport,
                "Export & Paint Bridge",
                "",
                ExportSectionExpanded,
                Theme,
                BodyCursor,
                BodyPressed))
        {
            ExportSectionExpanded = !ExportSectionExpanded;
        }
        if (ExportSectionExpanded)
        {
            const float Ex = LeftX + 12.0f;
            const float Ew = (InnerW - 30.0f) * 0.5f;
            if (ConstructCapsuleButtonControl(Surface, { Ex, StackY + 42.0f, Ew, 28.0f }, ".material TOML", Theme, BodyCursor, BodyPressed, true, false, ControlIcon::DownloadExport, 9.5f))
            {
                Session->StatusBannerText = "Exported .material TOML (" + std::to_string(Session->BuildExportTomlSummary().size()) + "B)";
                if (OperationCallback)
                {
                    OperationCallback("export.toml");
                }
            }
            if (ConstructCapsuleButtonControl(Surface, { Ex + Ew + 6.0f, StackY + 42.0f, Ew, 28.0f }, "JSON / JS", Theme, BodyCursor, BodyPressed, false, false, ControlIcon::DownloadExport, 9.5f))
            {
                Session->StatusBannerText = "Exported Material JSON + spec";
                if (OperationCallback)
                {
                    OperationCallback("export.json");
                }
            }
            if (ConstructCapsuleButtonControl(Surface, { Ex, StackY + 76.0f, InnerW - 24.0f, 28.0f }, "Use in Texture Paint", Theme, BodyCursor, BodyPressed, false, true, ControlIcon::ChevronForward, 9.5f))
            {
                Session->StatusBannerText = "Sent " + Session->MaterialTitle + " to Texture Paint";
                if (OperationCallback)
                {
                    OperationCallback("bridge.paint");
                }
            }
        }
        StackY += ExpSec.Height + 12.0f;
    }
    else
    {
        // TAB 1: Layer Stack (exact parity with 02-HTML-material-layers-tab.png!)
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { LeftX, StackY + 2.0f }, 12.0f, Theme.TextPrimary, "Material Scene & Strata");
        WorkspaceAppearance::ConstructRightAlignedText(Surface, FontWeightClass::Medium, { LeftX + InnerW, StackY + 4.0f }, 8.2f, Theme.TextMuted, "LOOK-DEV STAGE");
        StackY += 28.0f;

        char StackHeading[48] {};
        std::snprintf(StackHeading, sizeof(StackHeading), "Material Layer Stack (%u)", Session->QueryTotalLayerRowCount());
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { LeftX, StackY }, 10.5f, Theme.TextMuted, StackHeading);
        StackY += 18.0f;

        const std::array<const char*, 3u> AddStripLabels {{
            "+ Detail Layer",
            "+ Coat",
            Session->PatternOverlay.Attached ? "Inspect Pattern" : "+ Tile Pattern",
        }};
        const ChipStripOutcome AddOutcome = ConstructWrappedChipStrip(
            Surface, LeftX, StackY, InnerW, AddStripLabels, -1, Theme, BodyCursor, BodyPressed, 24.0f, 8.8f);
        if (AddOutcome.ClickedIndex == 0)
        {
            Session->AddDetailStrataLayer();
        }
        else if (AddOutcome.ClickedIndex == 1)
        {
            Session->ActivateOrAddClearcoatLayer();
        }
        else if (AddOutcome.ClickedIndex == 2)
        {
            if (Session->PatternOverlay.Attached)
            {
                Session->SelectPatternLayer();
            }
            else
            {
                Session->ApplyExternalPatternDocument("Kente Weave", "African Patterns", 3.0f);
            }
        }
        StackY += AddOutcome.ConsumedHeight + 12.0f;

        // Optional attached Tileable Pattern top row
        if (Session->PatternOverlay.Attached)
        {
            const bool        IsSelPat = (Session->SelectedLayerId == MaterialWorkspaceSession::PatternLayerReservedId);
            const Rectangle2D PatRowR  { LeftX, StackY, InnerW, 44.0f };
            const bool        Hover    = PatRowR.Contains(BodyCursor);
            Surface.FillRectangle(PatRowR, IsSelPat ? StudioRowSelected : (Hover ? StudioRowHover : StudioRowFill), 12.0f);
            Surface.StrokeRectangle(PatRowR, IsSelPat ? Theme.HighlightFill : Theme.BorderSubtle, 12.0f, IsSelPat ? 1.4f : 1.0f);

            const Rectangle2D ThumbR{ PatRowR.X + 8.0f, PatRowR.Y + 7.0f, 30.0f, 30.0f };
            Surface.FillRectangle(ThumbR, Theme.AccentSoft, 8.0f);
            VectorIconRepository::ConstructControl(Surface, ControlIcon::PatternTile, VectorIconPlacement{ ThumbR.X + 7.0f, ThumbR.Y + 7.0f, 16.0f, Theme.TextPrimary, 1.6f });

            char PatSub[64] {};
            std::snprintf(PatSub, sizeof(PatSub), "PATTERN · %.1fx · UV", Session->PatternOverlay.Repeats);
            WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { ThumbR.Right() + 10.0f, PatRowR.Y + 8.0f }, PatRowR.Width - 88.0f, 11.0f, Theme.TextPrimary, Session->PatternOverlay.Name);
            WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { ThumbR.Right() + 10.0f, PatRowR.Y + 24.0f }, PatRowR.Width - 88.0f, 8.2f, Theme.TextMuted, PatSub);

            const Rectangle2D TrashR{ PatRowR.Right() - 32.0f, PatRowR.Y + 11.0f, 22.0f, 22.0f };
            const bool TrashHover = TrashR.Contains(BodyCursor);
            if (TrashHover)
            {
                Surface.FillRectangle(TrashR, Theme.DangerSoft, 6.0f);
            }
            VectorIconRepository::ConstructControl(Surface, ControlIcon::TrashDelete, VectorIconPlacement{ TrashR.X + 5.0f, TrashR.Y + 5.0f, 12.0f, TrashHover ? Theme.DangerInk : Theme.TextMuted, 1.7f });

            if (BodyPressed)
            {
                if (TrashHover)
                {
                    Session->ClearAttachedPattern();
                }
                else if (Hover)
                {
                    Session->SelectPatternLayer();
                }
            }
            StackY += 52.0f;
        }

        // Reorderable Strata Layers (Clearcoat, Metallic flakes, Paint body, ...)
        struct PendingDragReorder
        {
            bool        Accepted  = false;
            uint32_t    Identity  = 0u;
            std::size_t TargetIdx = 0u;
        } DragReorder {};

        const auto LayersSnapshot = Session->StrataLayers;
        for (std::size_t LayerIdx = 0u; LayerIdx < LayersSnapshot.size(); ++LayerIdx)
        {
            const auto& Layer      = LayersSnapshot[LayerIdx];
            const bool  IsSel      = (Session->SelectedLayerId == Layer.Identity);
            const bool  Removable  = Session->VerifyLayerRemovable(Layer);
            const Rectangle2D RowR { LeftX, StackY, InnerW, 46.0f };
            const bool  RowHover   = RowR.Contains(BodyCursor);

            ColorRgba RowFill   = IsSel ? StudioRowSelected : (RowHover ? StudioRowHover : StudioRowFill);
            ColorRgba RowStroke = IsSel ? Theme.HighlightFill : Theme.BorderSubtle;
            if (!Layer.Enabled)
            {
                RowFill.Alpha = 155u;
            }
            Surface.FillRectangle(RowR, RowFill, 12.0f);
            Surface.StrokeRectangle(RowR, RowStroke, 12.0f, IsSel ? 1.4f : 1.0f);

            // Drag grip handle
            const Rectangle2D GripR{ RowR.X + 6.0f, RowR.Y + 8.0f, 18.0f, 30.0f };
            VectorIconRepository::ConstructControl(
                Surface,
                ControlIcon::DragGrip,
                VectorIconPlacement{ GripR.X + 2.0f, GripR.Y + 8.0f, 13.0f, GripR.Contains(BodyCursor) ? Theme.TextPrimary : Theme.TextFaint, 1.6f });
            if (BodyPressed && GripR.Contains(BodyCursor))
            {
                DraggingLayerIdentity = Layer.Identity;
                DragStartCursorY      = BodyCursor.Y;
                DraggingLayerActive   = true;
            }
            if (DraggingLayerActive && DraggingLayerIdentity == Layer.Identity && BodyInput.PrimaryPointer.Down)
            {
                if (BodyCursor.Y < RowR.Y - 12.0f && LayerIdx > 0u)
                {
                    DragReorder = { true, Layer.Identity, LayerIdx - 1u };
                }
                else if (BodyCursor.Y > RowR.Bottom() + 12.0f && LayerIdx + 1u < LayersSnapshot.size())
                {
                    DragReorder = { true, Layer.Identity, LayerIdx + 1u };
                }
            }

            // Icon tile
            const Rectangle2D IconTileR{ GripR.Right() + 2.0f, RowR.Y + 8.0f, 30.0f, 30.0f };
            Surface.FillRectangle(IconTileR, Theme.WellSurface, 9.0f);
            Surface.StrokeRectangle(IconTileR, Theme.BorderSubtle, 9.0f, 1.0f);
            VectorIconRepository::ConstructControl(
                Surface,
                IconForStrataModel(Layer.Model),
                VectorIconPlacement{ IconTileR.X + 7.0f, IconTileR.Y + 7.0f, 15.0f, Layer.Enabled ? Theme.TextPrimary : Theme.TextFaint, 1.6f });

            // Title + meta
            char LayerSub[48] {};
            std::snprintf(LayerSub, sizeof(LayerSub), "%s · %u ch", UpperModelCaption(Layer.Model), static_cast<uint32_t>(Layer.Channels.size()));
            const float ToolbarReserve = Removable ? 84.0f : 62.0f;
            const float CopyW         = std::max(40.0f, RowR.Width - (IconTileR.Right() - RowR.X) - 10.0f - ToolbarReserve);
            WorkspaceAppearance::ConstructTruncatedText(
                Surface, FontWeightClass::Regular, { IconTileR.Right() + 9.0f, RowR.Y + 8.0f }, CopyW, 11.2f, Layer.Enabled ? Theme.TextPrimary : Theme.TextMuted, Layer.Name);
            WorkspaceAppearance::ConstructTruncatedText(
                Surface, FontWeightClass::Regular, { IconTileR.Right() + 9.0f, RowR.Y + 25.0f }, CopyW, 8.2f, Theme.TextMuted, LayerSub);

            // Reorder Up / Down + Visibility + Optional Trash
            float BtnCursorRight = RowR.Right() - 8.0f;
            Rectangle2D TrashBtn {};
            if (Removable)
            {
                TrashBtn = Rectangle2D{ BtnCursorRight - 22.0f, RowR.Y + 12.0f, 22.0f, 22.0f };
                BtnCursorRight -= 24.0f;
                const bool Th = TrashBtn.Contains(BodyCursor);
                if (Th) Surface.FillRectangle(TrashBtn, Theme.DangerSoft, 6.0f);
                VectorIconRepository::ConstructControl(Surface, ControlIcon::TrashDelete, VectorIconPlacement{ TrashBtn.X + 5.0f, TrashBtn.Y + 5.0f, 12.0f, Th ? Theme.DangerInk : Theme.TextMuted, 1.7f });
            }

            const Rectangle2D EyeBtn{ BtnCursorRight - 22.0f, RowR.Y + 12.0f, 22.0f, 22.0f };
            BtnCursorRight -= 24.0f;
            Surface.FillRectangle(EyeBtn, EyeBtn.Contains(BodyCursor) ? Theme.HoverSurface : Theme.WellSurface, 11.0f);
            VectorIconRepository::ConstructControl(
                Surface,
                Layer.Enabled ? ControlIcon::EyeVisible : ControlIcon::EyeHidden,
                VectorIconPlacement{ EyeBtn.X + 5.0f, EyeBtn.Y + 5.0f, 12.0f, Layer.Enabled ? Theme.HighlightFill : Theme.TextFaint, 1.7f });

            const Rectangle2D DownBtn{ BtnCursorRight - 18.0f, RowR.Y + 13.0f, 18.0f, 20.0f };
            const Rectangle2D UpBtn  { DownBtn.X - 18.0f, RowR.Y + 13.0f, 18.0f, 20.0f };
            VectorIconRepository::ConstructControl(Surface, ControlIcon::ChevronDown, VectorIconPlacement{ DownBtn.X + 3.0f, DownBtn.Y + 4.0f, 12.0f, DownBtn.Contains(BodyCursor) ? Theme.TextPrimary : Theme.TextFaint, 1.7f });
            VectorIconRepository::ConstructControl(Surface, ControlIcon::ChevronUp, VectorIconPlacement{ UpBtn.X + 3.0f, UpBtn.Y + 4.0f, 12.0f, UpBtn.Contains(BodyCursor) ? Theme.TextPrimary : Theme.TextFaint, 1.7f });

            bool ConsumedRowClick = false;
            if (BodyPressed)
            {
                if (Removable && TrashBtn.Contains(BodyCursor))
                {
                    Session->RemoveStrataLayer(Layer.Identity);
                    ConsumedRowClick = true;
                }
                else if (EyeBtn.Contains(BodyCursor))
                {
                    for (auto& MutableLayer : Session->StrataLayers)
                    {
                        if (MutableLayer.Identity == Layer.Identity)
                        {
                            MutableLayer.Enabled = !MutableLayer.Enabled;
                            break;
                        }
                    }
                    Session->SyncPhysicalSurfaceParameters();
                    ++Session->RevisionCounter;
                    ConsumedRowClick = true;
                }
                else if (UpBtn.Contains(BodyCursor))
                {
                    Session->MoveStrataLayer(Layer.Identity, +1);
                    ConsumedRowClick = true;
                }
                else if (DownBtn.Contains(BodyCursor))
                {
                    Session->MoveStrataLayer(Layer.Identity, -1);
                    ConsumedRowClick = true;
                }
                else if (RowHover && !GripR.Contains(BodyCursor))
                {
                    Session->SelectStrataLayer(Layer.Identity);
                    ConsumedRowClick = true;
                }
            }
            (void)ConsumedRowClick;
            StackY += 50.0f;

            // Clickable PBR channel pills underneath each strata layer (matching 02-HTML-material-layers-tab.png!)
            if (!Layer.Channels.empty())
            {
                float Cx = LeftX + 10.0f;
                float Cy = StackY;
                const float StripMaxRight = LeftX + InnerW;
                for (const MaterialChannelSlot Ch : Layer.Channels)
                {
                    const auto& Spec  = MaterialWorkspaceSession::InspectChannelSpec(Ch);
                    const float ChipW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 8.5f, Spec.Caption) + 14.0f;
                    if (Cx > LeftX + 10.0f && (Cx + ChipW) > StripMaxRight)
                    {
                        Cx = LeftX + 10.0f;
                        Cy += 22.0f;
                    }
                    const Rectangle2D ChR{ Cx, Cy, ChipW, 19.0f };
                    const bool IsCur = IsSel && (Session->InspectedChannel == Ch);
                    const bool Hover = ChR.Contains(BodyCursor);

                    Surface.FillRectangle(ChR, IsCur ? Theme.AccentSoft : (Hover ? Theme.HoverSurface : Theme.WellSurface), 4.0f);
                    Surface.StrokeRectangle(ChR, IsCur ? Theme.AccentBorder : Theme.BorderSubtle, 4.0f, 1.0f);
                    WorkspaceAppearance::ConstructWeightedText(
                        Surface, FontWeightClass::Regular, { ChR.X + 7.0f, ChR.Y + 4.0f }, 8.5f, IsCur || Hover ? Theme.TextPrimary : Theme.TextMuted, Spec.Caption);
                    if (BodyPressed && Hover)
                    {
                        Session->SelectStrataLayer(Layer.Identity);
                        Session->SelectInspectedChannel(Ch);
                    }
                    Cx += ChipW + 4.0f;
                }
                StackY = Cy + 27.0f;
            }
        }

        if (DragReorder.Accepted)
        {
            Session->ReorderStrataLayerToIndex(DragReorder.Identity, DragReorder.TargetIdx);
        }

        StackY += 6.0f;
        const auto& ShapeLabels = MaterialWorkspaceSession::InspectPreviewShapeLabels();
        const uint32_t ShapeIdx = static_cast<uint32_t>(Session->PreviewShape) % static_cast<uint32_t>(ShapeLabels.size());
        const std::string GeometryLabel = std::string("Mesh: ") + ShapeLabels[ShapeIdx];
        if (ConstructDropdownBarRow(
                Surface,
                LeftX,
                StackY,
                InnerW,
                "Preview Mesh Geometry",
                GeometryLabel,
                ActiveDropdown == OpenDropdownVariant::PreviewGeometry,
                Theme,
                BodyInput.PrimaryPointer,
                CapturedGeometryBtn))
        {
            ActiveDropdown       = (ActiveDropdown == OpenDropdownVariant::PreviewGeometry) ? OpenDropdownVariant::None : OpenDropdownVariant::PreviewGeometry;
            ActiveDropdownAnchor = CapturedGeometryBtn;
            ActiveSwatchTarget   = MaterialSwatchTarget::None;
            DropdownScrollY      = 0.0f;
        }
        StackY += 54.0f;

        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { LeftX, StackY }, 10.5f, Theme.TextMuted, "Studio Lighting Backdrop");
        StackY += 17.0f;
        const auto& BackLabels = MaterialWorkspaceSession::InspectBackdropLabels();
        const ChipStripOutcome BackRes = ConstructWrappedChipStrip(
            Surface,
            LeftX,
            StackY,
            InnerW,
            BackLabels,
            static_cast<int32_t>(Session->BackdropStyle),
            Theme,
            BodyCursor,
            BodyPressed,
            24.0f,
            8.8f);
        if (BackRes.ClickedIndex >= 0)
        {
            Session->BackdropStyle = static_cast<LightingBackdropStyle>(BackRes.ClickedIndex % 5);
            ++Session->RevisionCounter;
        }
        StackY += BackRes.ConsumedHeight + 10.0f;

        const std::array<const char*, 2u> BrowserChips {{ "Materials (8)", "Patterns (6)" }};
        const ChipStripOutcome JumpRes = ConstructWrappedChipStrip(
            Surface, LeftX, StackY, InnerW, BrowserChips, -1, Theme, BodyCursor, BodyPressed, 24.0f, 9.2f);
        if (JumpRes.ClickedIndex >= 0 && Session->QueryBrowserPanel() != nullptr)
        {
            (void)Session->QueryBrowserPanel()->ActivateCategory(
                JumpRes.ClickedIndex == 0 ? ContentCategory::Materials : ContentCategory::Colours);
        }
        StackY += JumpRes.ConsumedHeight + 12.0f;
    }

    CachedContentHeight = std::max(ScrollRect.Height, StackY - ScrollStartTop + 12.0f);
    ScrollOffsetY       = std::clamp(ScrollOffsetY, 0.0f, std::max(0.0f, CachedContentHeight - ScrollRect.Height));
    WorkspaceAppearance::ConstructVerticalScrollIndicator(Surface, ScrollRect, CachedContentHeight, ScrollOffsetY, Cursor);
    Surface.PopClip();

    // 5. Pinned Bottom Footer ("Drag channels to scrub" | "Frontier Shading")
    const Rectangle2D FooterR{ Bounds.X, Bounds.Bottom() - FooterH, Bounds.Width, FooterH };
    ConstructPaneStatusFooter(Surface, FooterR, Session->StatusBannerText, "Frontier Shading", Theme, false);

    // 6. Overlay Option & Swatch Picker Sheets (rendered OUTSIDE scroll clip at top z-order)
    if (ActiveDropdown == OpenDropdownVariant::AddChannel)
    {
        const std::vector<MaterialChannelSlot> Avail = Session->QueryAvailableChannelsForSelectedLayer();
        if (Avail.empty())
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
        else
        {
            std::vector<const char*> Labels {};
            Labels.reserve(Avail.size());
            for (const MaterialChannelSlot S : Avail)
            {
                Labels.push_back(MaterialWorkspaceSession::InspectChannelSpec(S).Caption);
            }
            bool OpenBoolPtr = true;
            RenderFittedDropdownSheet(
                Surface,
                ActiveDropdownAnchor,
                Bounds,
                Labels.data(),
                static_cast<uint32_t>(Labels.size()),
                0u,
                OpenBoolPtr,
                Input,
                [this, &Avail](uint32_t Chosen)
                {
                    if (Chosen < Avail.size())
                    {
                        Session->AddChannelToSelectedLayer(Avail[Chosen]);
                    }
                },
                &DropdownScrollY);
            if (!OpenBoolPtr)
            {
                ActiveDropdown = OpenDropdownVariant::None;
            }
        }
    }
    else if (ActiveDropdown == OpenDropdownVariant::InspectedChannel)
    {
        if (const MaterialStrataLayer* SelLayer = Session->InspectSelectedLayer())
        {
            std::vector<const char*> Labels {};
            uint32_t SelIdx = 0u;
            for (std::size_t Idx = 0u; Idx < SelLayer->Channels.size(); ++Idx)
            {
                if (SelLayer->Channels[Idx] == Session->InspectedChannel)
                {
                    SelIdx = static_cast<uint32_t>(Idx);
                }
                Labels.push_back(MaterialWorkspaceSession::InspectChannelSpec(SelLayer->Channels[Idx]).Caption);
            }
            bool OpenBoolPtr = true;
            RenderFittedDropdownSheet(
                Surface,
                ActiveDropdownAnchor,
                Bounds,
                Labels.data(),
                static_cast<uint32_t>(Labels.size()),
                SelIdx,
                OpenBoolPtr,
                Input,
                [this, SelLayer](uint32_t Chosen)
                {
                    if (Chosen < SelLayer->Channels.size())
                    {
                        Session->SelectInspectedChannel(SelLayer->Channels[Chosen]);
                    }
                },
                &DropdownScrollY);
            if (!OpenBoolPtr)
            {
                ActiveDropdown = OpenDropdownVariant::None;
            }
        }
        else
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
    }
    else if (ActiveDropdown == OpenDropdownVariant::ChannelSource)
    {
        if (MaterialStrataLayer* SelLayer = Session->AccessSelectedLayer())
        {
            auto& ActiveSrc = SelLayer->ChannelSources[static_cast<std::size_t>(Session->InspectedChannel)];
            const auto& SrcLabels = MaterialWorkspaceSession::InspectSourceModeLabels();
            bool OpenBoolPtr = true;
            RenderFittedDropdownSheet(
                Surface,
                ActiveDropdownAnchor,
                Bounds,
                SrcLabels.data(),
                static_cast<uint32_t>(SrcLabels.size()),
                static_cast<uint32_t>(ActiveSrc.Mode),
                OpenBoolPtr,
                Input,
                [this, &ActiveSrc](uint32_t Chosen)
                {
                    ActiveSrc.Mode = static_cast<ChannelSourceMode>(Chosen % 7u);
                    ++Session->RevisionCounter;
                });
            if (!OpenBoolPtr)
            {
                ActiveDropdown = OpenDropdownVariant::None;
            }
        }
        else
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
    }
    else if (ActiveDropdown == OpenDropdownVariant::FieldProcedure)
    {
        if (MaterialStrataLayer* SelLayer = Session->AccessSelectedLayer())
        {
            auto& ActiveSrc = SelLayer->ChannelSources[static_cast<std::size_t>(Session->InspectedChannel)];
            const auto& ProcLabels = MaterialWorkspaceSession::InspectFieldProcedureLabels();
            bool OpenBoolPtr = true;
            RenderFittedDropdownSheet(
                Surface,
                ActiveDropdownAnchor,
                Bounds,
                ProcLabels.data(),
                static_cast<uint32_t>(ProcLabels.size()),
                static_cast<uint32_t>(ActiveSrc.Procedure),
                OpenBoolPtr,
                Input,
                [this, &ActiveSrc](uint32_t Chosen)
                {
                    ActiveSrc.Procedure = static_cast<FieldProcedureVariant>(Chosen % 6u);
                    ++Session->RevisionCounter;
                });
            if (!OpenBoolPtr)
            {
                ActiveDropdown = OpenDropdownVariant::None;
            }
        }
        else
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
    }
    else if (ActiveDropdown == OpenDropdownVariant::PatternPreset)
    {
        const auto& PatLabels = MaterialWorkspaceSession::InspectPatternDirectoryLabels();
        bool OpenBoolPtr = true;
        RenderFittedDropdownSheet(
            Surface,
            ActiveDropdownAnchor,
            Bounds,
            PatLabels.data(),
            static_cast<uint32_t>(PatLabels.size()),
            Session->PatternOverlay.PresetIndex,
            OpenBoolPtr,
            Input,
            [this, &PatLabels](uint32_t Chosen)
            {
                Session->PatternOverlay.PresetIndex = Chosen % static_cast<uint32_t>(PatLabels.size());
                Session->ApplyExternalPatternDocument(PatLabels[Session->PatternOverlay.PresetIndex], "Pattern Studio", Session->PatternOverlay.Repeats);
            });
        if (!OpenBoolPtr)
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
    }
    else if (ActiveDropdown == OpenDropdownVariant::PreviewGeometry)
    {
        const auto& ShapeLabels = MaterialWorkspaceSession::InspectPreviewShapeLabels();
        bool OpenBoolPtr = true;
        RenderFittedDropdownSheet(
            Surface,
            ActiveDropdownAnchor,
            Bounds,
            ShapeLabels.data(),
            static_cast<uint32_t>(ShapeLabels.size()),
            static_cast<uint32_t>(Session->PreviewShape),
            OpenBoolPtr,
            Input,
            [this](uint32_t Chosen)
            {
                Session->PreviewShape = static_cast<PreviewTargetShape>(Chosen % 5u);
                ++Session->RevisionCounter;
            });
        if (!OpenBoolPtr)
        {
            ActiveDropdown = OpenDropdownVariant::None;
        }
    }

    // Quick Swatch Sheet for any Material colour row
    if (ActiveSwatchTarget != MaterialSwatchTarget::None)
    {
        constexpr float SheetW = 204.0f;
        constexpr float SheetH = 128.0f;
        float Sx = std::clamp(ActiveSwatchAnchor.X, Bounds.X + 8.0f, Bounds.Right() - SheetW - 8.0f);
        float Sy = ActiveSwatchAnchor.Bottom() + 4.0f;
        if (Sy + SheetH > Bounds.Bottom() - 8.0f)
        {
            Sy = std::max(Bounds.Y + 8.0f, ActiveSwatchAnchor.Y - SheetH - 4.0f);
        }
        const Rectangle2D SwatchSheet{ Sx, Sy, SheetW, SheetH };
        Surface.FillRectangle(SwatchSheet, Theme.NestedSurface, 14.0f);
        Surface.StrokeRectangle(SwatchSheet, Theme.BorderStrong, 14.0f, 1.0f);
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { SwatchSheet.X + 12.0f, SwatchSheet.Y + 9.0f }, 9.5f, Theme.TextMuted, "Studio PBR Swatches");

        for (std::size_t Idx = 0u; Idx < StudioQuickSwatches.size(); ++Idx)
        {
            const uint32_t Col = static_cast<uint32_t>(Idx % 8u);
            const uint32_t Row = static_cast<uint32_t>(Idx / 8u);
            const Point2D  Ctr { SwatchSheet.X + 20.0f + static_cast<float>(Col) * 23.0f, SwatchSheet.Y + 42.0f + static_cast<float>(Row) * 26.0f };
            const Rectangle2D HitR{ Ctr.X - 10.0f, Ctr.Y - 10.0f, 20.0f, 20.0f };
            Surface.FillCircle(Ctr, 8.5f, StudioQuickSwatches[Idx]);
            if (HitR.Contains(Cursor))
            {
                Surface.StrokeCircle(Ctr, 10.0f, Theme.HighlightFill, 1.5f);
            }
            else
            {
                Surface.StrokeCircle(Ctr, 8.5f, ColorRgba{ 255u, 255u, 255u, 60u }, 1.0f);
            }
            if (Pressed && HitR.Contains(Cursor))
            {
                const ColorRgba ChosenCol = StudioQuickSwatches[Idx];
                if (ActiveSwatchTarget == MaterialSwatchTarget::PrimaryAlbedo)
                {
                    Session->ApplyPrimaryAlbedoColor(ChosenCol);
                }
                else if (ActiveSwatchTarget == MaterialSwatchTarget::InspectedChannel)
                {
                    Session->ApplyInspectedChannelColor(ChosenCol);
                }
                else if (ActiveSwatchTarget == MaterialSwatchTarget::FlakeSecondaryTint)
                {
                    Session->FlakeSecondaryTint = ChosenCol;
                }
                else if (MaterialStrataLayer* SelLayer = Session->AccessSelectedLayer())
                {
                    auto& Src = SelLayer->ChannelSources[static_cast<std::size_t>(Session->InspectedChannel)];
                    if (ActiveSwatchTarget == MaterialSwatchTarget::GradientStopA)
                    {
                        Src.StopPrimary = ChosenCol;
                    }
                    else if (ActiveSwatchTarget == MaterialSwatchTarget::GradientStopB)
                    {
                        Src.StopSecondary = ChosenCol;
                    }
                }
                ++Session->RevisionCounter;
                ActiveSwatchTarget = MaterialSwatchTarget::None;
                break;
            }
        }
        if (Pressed && !SwatchSheet.Contains(Cursor) && !ActiveSwatchAnchor.Contains(Cursor))
        {
            ActiveSwatchTarget = MaterialSwatchTarget::None;
        }
    }

    Surface.PopClip();
    (void)ControlTooltip::PresentHoveredControlTooltip(
        Surface, { 0.0f, 0.0f, Bounds.Width, Bounds.Height }, Input.PrimaryPointer);
}

void MaterialInspectorPane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##MaterialInspectorPaneCanvas",
        ImVec2(std::max(1.0f, ImGui::GetContentRegionAvail().x), std::max(1.0f, ImGui::GetContentRegionAvail().y)),
        ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight);

    const Rectangle2D ScreenBounds { WinPos.x, TopY, WinSize.x, PaneH };
    const Rectangle2D LogicalBounds{ 0.0f, 0.0f, WinSize.x / SafeScale, PaneH / SafeScale };

    PixelSpace       Surface(ImGui::GetWindowDrawList(), { ScreenBounds.X, ScreenBounds.Y }, SafeScale);
    PaneInputReading Input = WorkspaceAppearance::CaptureImGuiPaneInput(ScreenBounds, SafeScale);
    WorkspaceAppearance::EnforcePanePointerOwnership(this, Input);

    if (Session != nullptr)
    {
        const Point2D PhysicalCursor{
            ScreenBounds.X + Input.PrimaryPointer.X * SafeScale,
            ScreenBounds.Y + Input.PrimaryPointer.Y * SafeScale,
        };
        if (ContentBrowserPanel* Browser = Session->QueryBrowserPanel())
        {
            if (Browser->QueryBlocksPointerAt(PhysicalCursor))
            {
                WorkspaceAppearance::SuppressPanePointerInput(Input);
            }
        }
    }

    Render(Surface, LogicalBounds, Input, DeltaSeconds);
    WorkspaceAppearance::UpdatePanePointerOwnership(this, ScreenBounds, SafeScale, Input, false);
}

} // namespace Frontier::Workspaces
