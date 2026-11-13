/*==========================================================================================================================================
                                                    TEXTUREPAINTLAYERSTACKPANE.CPP
==========================================================================================================================================*/
// 🗂️ Implementation of TexturePaintLayerStackPane: top Add Layer sheet, stat filters, search, layer stack rows, mask sub-rows & KPI bar.

#include "Engine/Workspaces/Texturing/TexturePaintLayerStackPane.h"

#include "Engine/Components/Controls/ControlAppearance.h"
#include "Engine/Workspaces/Texturing/TexturingPaneAppearance.h"

#include <imgui.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

namespace Frontier::Workspaces
{

using namespace TexturingAppearance;

namespace
{

[[nodiscard]] std::string FormatTwoDigits(std::size_t Count) noexcept
{
    char Buf[16];
    std::snprintf(Buf, sizeof(Buf), "%02zu", Count);
    return std::string(Buf);
}

[[nodiscard]] std::string ToLowerAscii(std::string_view S) noexcept
{
    std::string Out(S);
    for (char& C : Out)
    {
        if (C >= 'A' && C <= 'Z')
        {
            C = static_cast<char>(C + ('a' - 'A'));
        }
    }
    return Out;
}

[[nodiscard]] ControlIcon QueryIconForLayerCategory(PaintLayerCategory Category) noexcept
{
    switch (Category)
    {
        case PaintLayerCategory::Fill:     return ControlIcon::FillBucket;
        case PaintLayerCategory::Material: return ControlIcon::MaterialSphere;
        case PaintLayerCategory::Stamp:    return ControlIcon::StampTool;
        case PaintLayerCategory::Text:     return ControlIcon::TextType;
        case PaintLayerCategory::WearGen:  return ControlIcon::SparklesAntiAliasing;
        case PaintLayerCategory::Folder:   return ControlIcon::FolderOpen;
        case PaintLayerCategory::Paint:
        default:                           return ControlIcon::BrushTool;
    }
}

bool RenderToolIconButton(
    PixelSpace&                 Surface,
    Rectangle2D                 Bounds,
    ControlIcon                 Icon,
    bool                        Enabled,
    bool                        Highlighted,
    bool                        DangerTint,
    const TexturingThemeColors& Theme,
    Point2D                     Cursor,
    bool                        Pressed,
    const OptionalTooltip&      Tooltip = {}) noexcept
{
    const bool      Hovered = Enabled && Bounds.Contains(Cursor);
    ColorRgba Fill = Highlighted
        ? Theme.HighlightFill
        : (Hovered ? Theme.HoverSurface : Theme.RaisedSurface);
    if (!Enabled)
    {
        Fill.Alpha = 115u;
    }
    const ColorRgba Stroke = Highlighted
        ? Theme.HighlightFill
        : (Hovered ? (DangerTint ? Theme.DangerInk : Theme.BorderStrong) : Theme.BorderSubtle);
    const ColorRgba Ink = Highlighted
        ? Theme.HighlightInk
        : (DangerTint && Hovered ? Theme.DangerInk : (Enabled ? Theme.TextPrimary : Theme.TextFaint));

    Surface.FillRectangle(Bounds, Fill, Bounds.Height * 0.5f);
    Surface.StrokeRectangle(Bounds, Stroke, Bounds.Height * 0.5f, 1.0f);
    const float IconSz = std::min(14.0f, Bounds.Height * 0.52f);
    VectorIconRepository::ConstructControl(
        Surface,
        Icon,
        VectorIconPlacement{
            Bounds.X + (Bounds.Width - IconSz) * 0.5f,
            Bounds.Y + (Bounds.Height - IconSz) * 0.5f,
            IconSz,
            Ink,
            1.7f });

    if (Hovered && Tooltip.Enabled)
    {
        ControlAppearance::RecordHoveredTooltip(Bounds, Tooltip);
    }
    return Hovered && Pressed;
}

void RenderLayerThumbnail(
    PixelSpace&                 Surface,
    Rectangle2D                 ThumbRect,
    const PaintLayerEntry&      Layer,
    const TexturingThemeColors& Theme) noexcept
{
    Surface.FillRectangle(ThumbRect, Theme.LightSurface ? Theme.NestedSurface : ColorRgba{ 16u, 18u, 22u, 255u }, 6.0f);
    Surface.StrokeRectangle(ThumbRect, Theme.BorderSubtle, 6.0f, 1.0f);

    if (Layer.Category == PaintLayerCategory::Fill || Layer.Category == PaintLayerCategory::Material)
    {
        Surface.FillRectangle(
            { ThumbRect.X + 4.0f, ThumbRect.Y + 4.0f, ThumbRect.Width - 8.0f, ThumbRect.Height - 8.0f },
            Layer.PrimerTint,
            4.0f);
        return;
    }

    if (Layer.Category == PaintLayerCategory::Paint)
    {
        Surface.FillCircle(
            { ThumbRect.X + ThumbRect.Width * 0.44f, ThumbRect.Y + ThumbRect.Height * 0.48f },
            6.5f,
            Layer.PrimerTint);
        Surface.FillCircle(
            { ThumbRect.X + ThumbRect.Width * 0.68f, ThumbRect.Y + ThumbRect.Height * 0.62f },
            4.0f,
            Layer.PrimerTint);
        return;
    }

    VectorIconRepository::ConstructControl(
        Surface,
        QueryIconForLayerCategory(Layer.Category),
        VectorIconPlacement{
            ThumbRect.X + 8.0f,
            ThumbRect.Y + 8.0f,
            16.0f,
            Layer.Category == PaintLayerCategory::Folder ? Theme.HighlightFill : Layer.PrimerTint,
            1.6f });
}

} // namespace

TexturePaintLayerStackPane::~TexturePaintLayerStackPane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void TexturePaintLayerStackPane::AttachSession(TexturePaintSession* TargetSession) noexcept
{
    Session           = TargetSession;
    AddLayerSheetOpen = false;
    ScrollOffsetY     = 0.0f;
    SearchBuffer      = TextEditBuffer{};
}

void TexturePaintLayerStackPane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##TexturePaintLayerStackCanvas",
        ImVec2(std::max(1.0f, ImGui::GetContentRegionAvail().x), std::max(1.0f, ImGui::GetContentRegionAvail().y)),
        ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight);

    const Rectangle2D ScreenBounds { WinPos.x, TopY, WinSize.x, PaneH };
    const Rectangle2D LogicalBounds{ 0.0f, 0.0f, WinSize.x / SafeScale, PaneH / SafeScale };

    PixelSpace       Surface(ImGui::GetWindowDrawList(), { ScreenBounds.X, ScreenBounds.Y }, SafeScale);
    PaneInputReading Input = WorkspaceAppearance::CaptureImGuiPaneInput(ScreenBounds, SafeScale);
    WorkspaceAppearance::EnforcePanePointerOwnership(this, Input);

    Render(Surface, LogicalBounds, Input, DeltaSeconds);
    WorkspaceAppearance::UpdatePanePointerOwnership(this, ScreenBounds, SafeScale, Input, false);
}

void TexturePaintLayerStackPane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    if (Session == nullptr || Bounds.Width < 140.0f || Bounds.Height < 180.0f)
    {
        return;
    }

    const TexturingThemeColors Theme   = QueryTexturingThemeColors();
    const Point2D              Cursor  { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed = Input.PrimaryPointer.Pressed;

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, Theme.PaneBackground, 0.0f);
    Surface.StrokeLine({ Bounds.Right(), Bounds.Y }, { Bounds.Right(), Bounds.Bottom() }, Theme.BorderSubtle, 1.0f);

    constexpr float PadX  = 12.0f;
    const float     LeftX = Bounds.X + PadX;
    const float     InnerW = Bounds.Width - PadX * 2.0f;
    float           CurY  = Bounds.Y + 12.0f;

    // 1. Heading Row ("Layers  2 / 32" +Folder +Add)
    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { LeftX, CurY + 4.0f }, 15.0f, Theme.TextPrimary, "Layers");

    const std::string CountLabel = std::to_string(Session->Layers.size()) + " / " + std::to_string(TexturePaintSession::MaxLayerCount);
    const float       TitleW     = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::SemiBold, 15.0f, "Layers");
    const float       CountW     = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.8f, CountLabel) + 14.0f;
    const Rectangle2D CountRect{ LeftX + TitleW + 8.0f, CurY + 5.0f, CountW, 20.0f };
    Surface.FillRectangle(CountRect, Theme.RaisedSurface, 10.0f);
    Surface.StrokeRectangle(CountRect, Theme.BorderSubtle, 10.0f, 1.0f);
    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { CountRect.X + 7.0f, CountRect.Y + 4.0f }, 9.8f, Theme.TextMuted, CountLabel);

    const Rectangle2D AddBtnRect   { Bounds.Right() - PadX - 28.0f, CurY, 28.0f, 28.0f };
    const Rectangle2D FolderBtnRect{ AddBtnRect.X - 34.0f, CurY, 28.0f, 28.0f };
    if (RenderToolIconButton(
            Surface,
            FolderBtnRect,
            ControlIcon::FolderPlus,
            Session->Layers.size() < TexturePaintSession::MaxLayerCount,
            false,
            false,
            Theme,
            Cursor,
            Pressed && !AddLayerSheetOpen,
            OptionalTooltip::FromTitled("New Layer Folder", "Add an organizational layer folder group.")))
    {
        Session->AddLayer(PaintLayerCategory::Folder);
    }
    if (RenderToolIconButton(
            Surface,
            AddBtnRect,
            ControlIcon::PlusAdd,
            Session->Layers.size() < TexturePaintSession::MaxLayerCount,
            AddLayerSheetOpen,
            false,
            Theme,
            Cursor,
            Pressed,
            OptionalTooltip::FromTitled("Add Layer", "Create Paint, Fill, Material, Stamp, Text, Wear Gen, or Folder layer.")))
    {
        AddLayerSheetOpen = !AddLayerSheetOpen;
    }
    CurY += 36.0f;

    // 2. Visible (02) / Hidden (00) Filter Tiles
    const std::size_t VisCount = Session->CountVisibleLayers();
    const std::size_t HidCount = Session->CountHiddenLayers();
    const float       HalfStatW = (InnerW - 8.0f) * 0.5f;
    const Rectangle2D VisTile{ LeftX, CurY, HalfStatW, 50.0f };
    const Rectangle2D HidTile{ LeftX + HalfStatW + 8.0f, CurY, HalfStatW, 50.0f };

    auto RenderFilterTile = [&](Rectangle2D BoxRect, PaintFilterTab TargetFilter, const char* Title, std::size_t Qty, bool Dimmed)
    {
        const bool Active  = Session->LayerFilter == TargetFilter;
        const bool Hovered = BoxRect.Contains(Cursor) && !AddLayerSheetOpen;
        Surface.FillRectangle(BoxRect, Active ? Theme.AccentSoft : (Hovered ? Theme.HoverSurface : Theme.SectionSurface), 14.0f);
        Surface.StrokeRectangle(BoxRect, Active ? Theme.AccentBorder : Theme.BorderSubtle, 14.0f, 1.0f);

        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { BoxRect.X + 12.0f, BoxRect.Y + 8.0f }, 9.2f, Theme.TextMuted, Title);
        WorkspaceAppearance::ConstructWeightedText(
            Surface,
            FontWeightClass::SemiBold,
            { BoxRect.X + 12.0f, BoxRect.Y + 23.0f },
            16.5f,
            Dimmed ? Theme.TextFaint : Theme.TextPrimary,
            FormatTwoDigits(Qty));
        if (Hovered && Pressed)
        {
            Session->LayerFilter = (Session->LayerFilter == TargetFilter) ? PaintFilterTab::AllLayers : TargetFilter;
        }
    };
    RenderFilterTile(VisTile, PaintFilterTab::VisibleOnly, "Visible", VisCount, false);
    RenderFilterTile(HidTile, PaintFilterTab::HiddenOnly,  "Hidden",  HidCount, HidCount == 0u);
    CurY += 58.0f;

    // 3. Search input ("Find a layer...")
    const Rectangle2D SearchRect{ LeftX, CurY, InnerW, 30.0f };
    Surface.FillRectangle(SearchRect, Theme.WellSurface, 15.0f);
    Surface.StrokeRectangle(SearchRect, SearchBuffer.Active ? Theme.AccentBorder : Theme.BorderSubtle, 15.0f, 1.0f);
    VectorIconRepository::ConstructControl(
        Surface,
        ControlIcon::SearchGlass,
        VectorIconPlacement{ SearchRect.X + 10.0f, SearchRect.Y + 8.5f, 12.5f, Theme.TextMuted, 1.7f });

    if (Pressed && !AddLayerSheetOpen)
    {
        SearchBuffer.Active = SearchRect.Contains(Cursor);
    }
    WorkspaceAppearance::ForwardInputToTextBuffer(SearchBuffer, Input, DeltaSeconds);
    const Rectangle2D SearchFieldRect{ SearchRect.X + 26.0f, SearchRect.Y + 2.0f, SearchRect.Width - 34.0f, SearchRect.Height - 4.0f };
    (void)TextInputField::Construct(Surface, SearchFieldRect, SearchBuffer, Input.PrimaryPointer, 11.0f, 1.0f);
    if (SearchBuffer.Length == 0u && !SearchBuffer.Active)
    {
        WorkspaceAppearance::ConstructWeightedText(
            Surface, FontWeightClass::Regular, { SearchRect.X + 30.0f, SearchRect.Y + 8.0f }, 10.5f, Theme.TextFaint, "Find a layer...");
    }
    Session->SearchQuery = std::string(SearchBuffer.Text);
    CurY += 40.0f;

    // 4. Bottom Fixed Stack Reserve (5-button toolbar + Base Mesh subtitle + 3-KPI footer + Pane Status Footer)
    constexpr float PaneFooterH    = 26.0f;
    constexpr float KpiFooterH     = 52.0f;
    constexpr float AssetSubH      = 22.0f;
    constexpr float ToolbarH       = 42.0f;
    const float     BottomReserveY = Bounds.Bottom() - PaneFooterH - KpiFooterH - AssetSubH - ToolbarH;

    // Layer List Scroll Area
    const Rectangle2D ListViewport{ Bounds.X, CurY, Bounds.Width, std::max(40.0f, BottomReserveY - CurY) };
    if (ListViewport.Contains(Cursor) && !AddLayerSheetOpen && std::abs(Input.WheelDeltaY) > 0.01f)
    {
        ScrollOffsetY = std::clamp(ScrollOffsetY - Input.WheelDeltaY * 28.0f, 0.0f, MaxScrollY);
    }

    Surface.PushClip(ListViewport);
    float             RowY       = ListViewport.Y - ScrollOffsetY;
    const std::string QueryLower = ToLowerAscii(Session->SearchQuery);

    for (int32_t Idx = static_cast<int32_t>(Session->Layers.size()) - 1; Idx >= 0; --Idx)
    {
        PaintLayerEntry& Layer = Session->Layers[static_cast<std::size_t>(Idx)];
        if (Session->LayerFilter == PaintFilterTab::VisibleOnly && !Layer.Visible) continue;
        if (Session->LayerFilter == PaintFilterTab::HiddenOnly  &&  Layer.Visible) continue;
        if (!QueryLower.empty() && ToLowerAscii(Layer.Name).find(QueryLower) == std::string::npos) continue;

        const bool        Selected   = Layer.Id == Session->SelectedLayerId;
        const bool        MaskAttached    = Layer.Mask.Attached;
        const float       RowH       = MaskAttached ? 78.0f : 56.0f;
        const Rectangle2D RowRect{ LeftX, RowY, InnerW, RowH };
        const bool        RowHovered = RowRect.Contains(Cursor) && ListViewport.Contains(Cursor) && !AddLayerSheetOpen;

        const ColorRgba RowBg = Selected
            ? (Theme.LightSurface ? Theme.AccentSoft : StudioRowSelected)
            : (RowHovered ? (Theme.LightSurface ? Theme.HoverSurface : StudioRowHover) : (Theme.LightSurface ? Theme.SectionSurface : StudioRowFill));
        const ColorRgba RowStroke = Selected ? Theme.AccentBorder : Theme.BorderSubtle;

        Surface.FillRectangle(RowRect, RowBg, 14.0f);
        Surface.StrokeRectangle(RowRect, RowStroke, 14.0f, Selected ? 1.4f : 1.0f);

        // Leading 6-dot drag grip
        VectorIconRepository::ConstructControl(
            Surface, ControlIcon::DragGrip, VectorIconPlacement{ RowRect.X + 6.0f, RowRect.Y + 21.0f, 12.0f, Theme.TextFaint, 1.5f });

        // Layer thumbnail
        const Rectangle2D ThumbRect{ RowRect.X + 20.0f, RowRect.Y + 11.0f, 34.0f, 34.0f };
        RenderLayerThumbnail(Surface, ThumbRect, Layer, Theme);

        // Trailing Eye & Lock & Opacity Tag
        const Rectangle2D LockRect{ RowRect.Right() - 28.0f, RowRect.Y + 17.0f, 20.0f, 20.0f };
        const Rectangle2D EyeRect { LockRect.X - 24.0f,      RowRect.Y + 17.0f, 20.0f, 20.0f };

        char OpText[16];
        std::snprintf(OpText, sizeof(OpText), "%d%%", static_cast<int>(Layer.Opacity * 100.0f + 0.5f));
        const float       OpW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 8.8f, OpText) + 12.0f;
        const Rectangle2D OpTagRect{ EyeRect.X - OpW - 4.0f, RowRect.Y + 19.0f, OpW, 17.0f };
        Surface.FillRectangle(OpTagRect, Theme.WellSurface, 8.5f);
        Surface.StrokeRectangle(OpTagRect, Theme.BorderSubtle, 8.5f, 1.0f);
        Surface.TextCentered(OpTagRect, 8.5f, Theme.TextMuted, OpText);

        VectorIconRepository::ConstructControl(
            Surface,
            Layer.Visible ? ControlIcon::EyeVisible : ControlIcon::EyeHidden,
            VectorIconPlacement{ EyeRect.X + 3.0f, EyeRect.Y + 3.0f, 14.0f, Layer.Visible ? Theme.TextPrimary : Theme.TextFaint, 1.7f });
        VectorIconRepository::ConstructControl(
            Surface,
            Layer.Locked ? ControlIcon::LockClosed : ControlIcon::LockOpen,
            VectorIconPlacement{ LockRect.X + 3.0f, LockRect.Y + 3.0f, 13.5f, Layer.Locked ? Theme.CautionWarm : Theme.TextFaint, 1.7f });

        // Title & Subtitle
        const float TextX    = ThumbRect.Right() + 9.0f;
        const float TextMaxW = std::max(36.0f, OpTagRect.X - TextX - 6.0f);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::SemiBold, { TextX, RowRect.Y + 12.0f }, TextMaxW, 11.2f, Theme.TextPrimary, Layer.Name);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { TextX, RowRect.Y + 30.0f }, TextMaxW, 8.5f, Theme.TextMuted, Layer.FormatSubtitle());

        // Optional attached mask sub-strip
        if (MaskAttached)
        {
            const Rectangle2D MaskStrip{ RowRect.X + 20.0f, RowRect.Y + 51.0f, RowRect.Width - 28.0f, 20.0f };
            Surface.FillRectangle(MaskStrip, Layer.Mask.EditingMask ? Theme.AccentSoft : Theme.WellSurface, 6.0f);
            Surface.StrokeRectangle(MaskStrip, Layer.Mask.EditingMask ? Theme.AccentBorder : Theme.BorderSubtle, 6.0f, 1.0f);
            VectorIconRepository::ConstructControl(
                Surface, ControlIcon::MaskCutout, VectorIconPlacement{ MaskStrip.X + 6.0f, MaskStrip.Y + 4.0f, 12.0f, Theme.HighlightFill, 1.6f });
            WorkspaceAppearance::ConstructTruncatedText(
                Surface,
                FontWeightClass::Regular,
                { MaskStrip.X + 22.0f, MaskStrip.Y + 4.0f },
                MaskStrip.Width - 30.0f,
                9.0f,
                Theme.TextPrimary,
                Layer.Mask.EditingMask ? "Mask · Painting" : (Layer.Mask.Enabled ? "Layer Mask (ON)" : "Layer Mask (OFF)"));
            if (MaskStrip.Contains(Cursor) && Pressed && !AddLayerSheetOpen)
            {
                Session->SelectedLayerId  = Layer.Id;
                Layer.Mask.EditingMask    = !Layer.Mask.EditingMask;
            }
        }

        if (RowHovered && Pressed)
        {
            if (EyeRect.Contains(Cursor))
            {
                Session->PushUndoSnapshot();
                Layer.Visible = !Layer.Visible;
            }
            else if (LockRect.Contains(Cursor))
            {
                Session->PushUndoSnapshot();
                Layer.Locked = !Layer.Locked;
            }
            else
            {
                Session->SelectedLayerId = Layer.Id;
            }
        }

        RowY += RowH + 6.0f;
    }

    const float ContentBottom = RowY + ScrollOffsetY + 6.0f;
    MaxScrollY                = std::max(0.0f, ContentBottom - ListViewport.Bottom());
    ScrollOffsetY             = std::clamp(ScrollOffsetY, 0.0f, MaxScrollY);
    Surface.PopClip();

    // 5. Bottom 5-button layer toolbar (Up | Down | Duplicate | Mask | Delete)
    const Rectangle2D ToolbarRect{ LeftX, BottomReserveY + 6.0f, InnerW, 30.0f };
    const float       BtnW = (InnerW - 24.0f) / 5.0f;
    const PaintLayerEntry* SelLayer = Session->InspectSelectedLayer();
    const bool             AllowUp    = Session->QueryMovableUp();
    const bool             AllowDown  = Session->QueryMovableDown();
    const bool             AllowDuplicate   = SelLayer != nullptr && Session->Layers.size() < TexturePaintSession::MaxLayerCount;
    const bool             MaskAttached  = SelLayer != nullptr && SelLayer->Mask.Attached;
    const bool             AllowDelete   = Session->Layers.size() > 1u;

    if (RenderToolIconButton(Surface, { ToolbarRect.X, ToolbarRect.Y, BtnW, 28.0f }, ControlIcon::ChevronUp, AllowUp, false, false, Theme, Cursor, Pressed && !AddLayerSheetOpen, OptionalTooltip::FromTitled("Move Layer Up", "Raise selected layer order.")))
    {
        Session->MoveSelectedLayerUp();
    }
    if (RenderToolIconButton(Surface, { ToolbarRect.X + (BtnW + 6.0f), ToolbarRect.Y, BtnW, 28.0f }, ControlIcon::ChevronDown, AllowDown, false, false, Theme, Cursor, Pressed && !AddLayerSheetOpen, OptionalTooltip::FromTitled("Move Layer Down", "Lower selected layer order.")))
    {
        Session->MoveSelectedLayerDown();
    }
    if (RenderToolIconButton(Surface, { ToolbarRect.X + (BtnW + 6.0f) * 2.0f, ToolbarRect.Y, BtnW, 28.0f }, ControlIcon::CopyDuplicate, AllowDuplicate, false, false, Theme, Cursor, Pressed && !AddLayerSheetOpen, OptionalTooltip::FromTitled("Duplicate Layer", "Clone active layer above current position.")))
    {
        Session->DuplicateSelectedLayer();
    }
    if (RenderToolIconButton(Surface, { ToolbarRect.X + (BtnW + 6.0f) * 3.0f, ToolbarRect.Y, BtnW, 28.0f }, ControlIcon::MaskCutout, SelLayer != nullptr, MaskAttached, false, Theme, Cursor, Pressed && !AddLayerSheetOpen, OptionalTooltip::FromTitled("Layer Mask", "Attach white mask or toggle mask painting.")))
    {
        Session->ToggleOrCreateMaskOnSelectedLayer();
    }
    if (RenderToolIconButton(Surface, { ToolbarRect.X + (BtnW + 6.0f) * 4.0f, ToolbarRect.Y, BtnW, 28.0f }, ControlIcon::TrashDelete, AllowDelete, false, true, Theme, Cursor, Pressed && !AddLayerSheetOpen, OptionalTooltip::FromTitled("Delete Layer", "Remove active layer from stack.")))
    {
        Session->DeleteSelectedLayer();
    }

    // 6. Base Mesh caption + 3-KPI footer + Pane Status Footer
    const PaintStudyDescriptor& StudyDesc = Session->QueryActiveStudyDescriptor();
    char UnderlayCaption[64];
    std::snprintf(UnderlayCaption, sizeof(UnderlayCaption), "Base Mesh · %s", StudyDesc.Label);
    WorkspaceAppearance::ConstructTruncatedText(
        Surface, FontWeightClass::Regular, { LeftX, ToolbarRect.Bottom() + 5.0f }, InnerW, 9.5f, Theme.TextMuted, UnderlayCaption);

    const float KpiY     = Bounds.Bottom() - PaneFooterH - KpiFooterH;
    const float KpiCellW = (InnerW - 12.0f) / 3.0f;
    char        TotalBuf[16];
    char        VisBuf[16];
    std::snprintf(TotalBuf, sizeof(TotalBuf), "%zu", Session->Layers.size());
    std::snprintf(VisBuf,   sizeof(VisBuf),   "%zu", VisCount);

    const std::array<std::pair<const char*, const char*>, 3u> FooterStats {{
        { "LAYERS",  TotalBuf },
        { "VISIBLE", VisBuf   },
        { "ENGINE",  "WebGL2" },
    }};
    for (std::size_t I = 0u; I < 3u; ++I)
    {
        const Rectangle2D Cell{ LeftX + static_cast<float>(I) * (KpiCellW + 6.0f), KpiY, KpiCellW, 42.0f };
        Surface.FillRectangle(Cell, Theme.SectionSurface, 10.0f);
        Surface.StrokeRectangle(Cell, Theme.BorderSubtle, 10.0f, 1.0f);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { Cell.X + 8.0f, Cell.Y + 6.0f }, Cell.Width - 16.0f, 7.8f, Theme.TextMuted, FooterStats[I].first);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::SemiBold, { Cell.X + 8.0f, Cell.Y + 19.0f }, Cell.Width - 16.0f, 12.0f, Theme.TextPrimary, FooterStats[I].second);
    }

    const Rectangle2D StatusFooter{ Bounds.X, Bounds.Bottom() - PaneFooterH, Bounds.Width, PaneFooterH };
    ConstructPaneStatusFooter(Surface, StatusFooter, "All 22 PBR Channels", "3D + UV", Theme);

    // 7. "+ Add Layer" Floating Overlay Sheet
    if (AddLayerSheetOpen)
    {
        struct AddChoice
        {
            const char*        Label;
            PaintLayerCategory Category;
            ControlIcon        Icon;
        };
        static constexpr std::array<AddChoice, 7u> Choices {{
            { "+ Paint",    PaintLayerCategory::Paint,    ControlIcon::BrushTool            },
            { "+ Fill",     PaintLayerCategory::Fill,     ControlIcon::FillBucket           },
            { "+ Material", PaintLayerCategory::Material, ControlIcon::MaterialSphere       },
            { "+ Stamp",    PaintLayerCategory::Stamp,    ControlIcon::StampTool            },
            { "+ Text",     PaintLayerCategory::Text,     ControlIcon::TextType             },
            { "+ Wear Gen", PaintLayerCategory::WearGen,  ControlIcon::SparklesAntiAliasing },
            { "+ Folder",   PaintLayerCategory::Folder,   ControlIcon::FolderPlus           },
        }};

        const float SheetW = std::min(InnerW, 184.0f);
        const float SheetH = static_cast<float>(Choices.size()) * 28.0f + 14.0f;
        const Rectangle2D SheetRect{
            std::clamp(AddBtnRect.Right() - SheetW, Bounds.X + 8.0f, Bounds.Right() - SheetW - 8.0f),
            AddBtnRect.Bottom() + 6.0f,
            SheetW,
            SheetH,
        };
        Surface.FillRectangle(SheetRect, Theme.NestedSurface, 12.0f);
        Surface.StrokeRectangle(SheetRect, Theme.BorderStrong, 12.0f, 1.0f);

        for (std::size_t I = 0u; I < Choices.size(); ++I)
        {
            const Rectangle2D RowB{ SheetRect.X + 6.0f, SheetRect.Y + 7.0f + static_cast<float>(I) * 28.0f, SheetW - 12.0f, 24.0f };
            const bool        Hover = RowB.Contains(Cursor);
            if (Hover)
            {
                Surface.FillRectangle(RowB, Theme.HoverSurface, 7.0f);
            }
            VectorIconRepository::ConstructControl(
                Surface, Choices[I].Icon, VectorIconPlacement{ RowB.X + 8.0f, RowB.Y + 5.5f, 13.0f, Theme.TextPrimary, 1.7f });
            WorkspaceAppearance::ConstructTruncatedText(
                Surface, FontWeightClass::Regular, { RowB.X + 27.0f, RowB.Y + 5.5f }, RowB.Width - 34.0f, 10.2f, Theme.TextPrimary, Choices[I].Label);
            if (Hover && Pressed)
            {
                Session->AddLayer(Choices[I].Category);
                AddLayerSheetOpen = false;
            }
        }
        if (Pressed && !SheetRect.Contains(Cursor) && !AddBtnRect.Contains(Cursor))
        {
            AddLayerSheetOpen = false;
        }
    }

    Surface.PopClip();
}

} // namespace Frontier::Workspaces
