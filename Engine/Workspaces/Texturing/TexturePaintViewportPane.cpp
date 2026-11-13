/*==========================================================================================================================================
                                                    TEXTUREPAINTVIEWPORTPANE.CPP
==========================================================================================================================================*/
// 🖌️ Implementation of TexturePaintViewportPane: two-band header bar, 9-tool circular dock, 3D/2D UV viewport & Brush Inspector overlay.

#include "Engine/Workspaces/Texturing/TexturePaintViewportPane.h"

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

void AssignEditText(TextEditBuffer& Buf, std::string_view TextContent) noexcept
{
    const std::size_t CopyLen = std::min(TextContent.size(), static_cast<std::size_t>(TextEditBuffer::Capacity - 1u));
    for (std::size_t I = 0u; I < CopyLen; ++I)
    {
        Buf.Text[I] = TextContent[I];
    }
    Buf.Text[CopyLen]   = '\0';
    Buf.Length          = static_cast<uint32_t>(CopyLen);
    Buf.Caret           = Buf.Length;
    Buf.SelectionAnchor = Buf.Length;
}

[[nodiscard]] ControlIcon QueryIconForPaintTool(PaintToolCategory Tool) noexcept
{
    switch (Tool)
    {
        case PaintToolCategory::Brush:      return ControlIcon::BrushTool;
        case PaintToolCategory::Eraser:     return ControlIcon::EraserTool;
        case PaintToolCategory::Curve3D:    return ControlIcon::VectorCurve;
        case PaintToolCategory::Fill:       return ControlIcon::FillBucket;
        case PaintToolCategory::Gradient3D: return ControlIcon::PointGradient;
        case PaintToolCategory::Stamp:      return ControlIcon::StampTool;
        case PaintToolCategory::Text:       return ControlIcon::TextType;
        case PaintToolCategory::Sample:     return ControlIcon::PipetteDropper;
        case PaintToolCategory::Move:       return ControlIcon::MoveArrows;
        default:                            return ControlIcon::BrushTool;
    }
}

[[nodiscard]] const char* QueryToolLabel(PaintToolCategory Tool) noexcept
{
    switch (Tool)
    {
        case PaintToolCategory::Brush:      return "Brush";
        case PaintToolCategory::Eraser:     return "Eraser";
        case PaintToolCategory::Curve3D:    return "3D Curve";
        case PaintToolCategory::Fill:       return "Fill";
        case PaintToolCategory::Gradient3D: return "3D Gradient";
        case PaintToolCategory::Stamp:      return "Stamp";
        case PaintToolCategory::Text:       return "Text";
        case PaintToolCategory::Sample:     return "Sample";
        case PaintToolCategory::Move:       return "Move";
        default:                            return "Brush";
    }
}

[[nodiscard]] const char* QueryToolKeyHint(PaintToolCategory Tool) noexcept
{
    switch (Tool)
    {
        case PaintToolCategory::Brush:      return "B";
        case PaintToolCategory::Eraser:     return "E";
        case PaintToolCategory::Curve3D:    return "U";
        case PaintToolCategory::Fill:       return "G";
        case PaintToolCategory::Gradient3D: return "D";
        case PaintToolCategory::Stamp:      return "S";
        case PaintToolCategory::Text:       return "T";
        case PaintToolCategory::Sample:     return "I";
        case PaintToolCategory::Move:       return "V";
        default:                            return "B";
    }
}

[[nodiscard]] const char* QueryLayoutShortLabel(PaintViewportLayout Layout) noexcept
{
    switch (Layout)
    {
        case PaintViewportLayout::ThreeDOnly: return "View: 3D Mesh";
        case PaintViewportLayout::SplitView:  return "View: 3D + 2D UV";
        case PaintViewportLayout::TwoDOnly:   return "View: 2D UV Only";
        default:                              return "View: 3D Mesh";
    }
}

bool RenderCircularToolButton(
    PixelSpace&                 Surface,
    Rectangle2D                 Bounds,
    ControlIcon                 Icon,
    bool                        Active,
    const TexturingThemeColors& Theme,
    Point2D                     Cursor,
    bool                        Pressed,
    const OptionalTooltip&      Tooltip = {}) noexcept
{
    const bool Hovered = Bounds.Contains(Cursor);
    const ColorRgba Fill = Active
        ? ColorRgba{ 46u, 50u, 38u, 255u }
        : (Hovered ? Theme.HoverSurface : Theme.RaisedSurface);
    const ColorRgba Stroke = Active
        ? Theme.HighlightFill
        : (Hovered ? Theme.BorderStrong : Theme.BorderSubtle);
    const ColorRgba Ink = Active
        ? Theme.HighlightFill
        : (Hovered ? Theme.TextPrimary : Theme.TextMuted);

    Surface.FillRectangle(Bounds, Fill, Bounds.Height * 0.5f);
    Surface.StrokeRectangle(Bounds, Stroke, Bounds.Height * 0.5f, 1.0f);

    constexpr float IconSz = 13.0f;
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

} // namespace

TexturePaintViewportPane::~TexturePaintViewportPane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void TexturePaintViewportPane::AttachSession(TexturePaintSession* TargetSession) noexcept
{
    Session = TargetSession;
    CloseAllOverlays();
    DocNameBuffer = TextEditBuffer{};
    if (Session != nullptr)
    {
        AssignEditText(DocNameBuffer, Session->DocumentName);
    }
}

void TexturePaintViewportPane::CloseAllOverlays() noexcept
{
    MoreToolsSheetOpen  = false;
    ResolutionSheetOpen = false;
    ViewLayoutSheetOpen = false;
    SaveSheetOpen       = false;
    StudySubSheetOpen   = false;
    ChannelSubSheetOpen = false;
    BrushInspectorOpen  = false;
    ActiveBrushSliderId = -1;
}

void TexturePaintViewportPane::SetBrushInspectorOpen(bool Open) noexcept
{
    BrushInspectorOpen = Open;
    if (Open)
    {
        MoreToolsSheetOpen  = false;
        ResolutionSheetOpen = false;
        ViewLayoutSheetOpen = false;
        SaveSheetOpen       = false;
        if (BrushSheetAnchor.X <= 1.0f && BrushSheetAnchor.Y <= 1.0f && LastCanvasBounds.Width > 40.0f)
        {
            BrushSheetAnchor = {
                LastCanvasBounds.X + LastCanvasBounds.Width * 0.52f,
                LastCanvasBounds.Y + LastCanvasBounds.Height * 0.50f,
            };
        }
    }
}

void TexturePaintViewportPane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##TexturePaintViewportCanvas",
        ImVec2(std::max(1.0f, ImGui::GetContentRegionAvail().x), std::max(1.0f, ImGui::GetContentRegionAvail().y)),
        ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight);

    const Rectangle2D ScreenBounds { WinPos.x, TopY, WinSize.x, PaneH };
    const Rectangle2D LogicalBounds{ 0.0f, 0.0f, WinSize.x / SafeScale, PaneH / SafeScale };

    PixelSpace       Surface(ImGui::GetWindowDrawList(), { ScreenBounds.X, ScreenBounds.Y }, SafeScale);
    PaneInputReading Input = WorkspaceAppearance::CaptureImGuiPaneInput(ScreenBounds, SafeScale);
    WorkspaceAppearance::EnforcePanePointerOwnership(this, Input);

    Render(Surface, LogicalBounds, Input, DeltaSeconds);
    WorkspaceAppearance::UpdatePanePointerOwnership(this, ScreenBounds, SafeScale, Input, ActiveBrushSliderId >= 0);
}

void TexturePaintViewportPane::RenderUvCanvasPreview(PixelSpace& Surface, Rectangle2D PreviewArea) const noexcept
{
    if (Session == nullptr)
    {
        return;
    }

    const TexturingThemeColors Theme = QueryTexturingThemeColors();
    const float Side = std::max(90.0f, std::min(PreviewArea.Width, PreviewArea.Height) - 44.0f);
    const Rectangle2D Square{
        PreviewArea.X + (PreviewArea.Width - Side) * 0.5f,
        PreviewArea.Y + (PreviewArea.Height - Side) * 0.5f,
        Side,
        Side,
    };

    const PaintLayerEntry* Sel = Session->InspectSelectedLayer();
    const ColorRgba CanvasFill = (Sel != nullptr) ? Sel->PrimerTint : ColorRgba{ 168u, 174u, 182u, 255u };
    Surface.FillRectangle(Square, ColorRgba{ 24u, 26u, 32u, 255u }, 10.0f);
    Surface.FillRectangle({ Square.X + 8.0f, Square.Y + 8.0f, Square.Width - 16.0f, Square.Height - 16.0f }, CanvasFill.WithAlpha(210u), 6.0f);

    const ColorRgba GridInk{ 255u, 255u, 255u, 45u };
    for (int32_t I = 1; I < 4; ++I)
    {
        const float T = static_cast<float>(I) * 0.25f;
        Surface.StrokeLine({ Square.X + Square.Width * T, Square.Y + 8.0f }, { Square.X + Square.Width * T, Square.Bottom() - 8.0f }, GridInk, 1.0f);
        Surface.StrokeLine({ Square.X + 8.0f, Square.Y + Square.Height * T }, { Square.Right() - 8.0f, Square.Y + Square.Height * T }, GridInk, 1.0f);
    }
    Surface.StrokeRectangle(Square, Theme.BorderStrong, 10.0f, 1.0f);

    char UvMeta[64];
    std::snprintf(UvMeta, sizeof(UvMeta), "%ux%u UV · %u Islands", Session->ResolutionPx, Session->ResolutionPx, Session->QueryActiveStudyDescriptor().UvIslands);
    const float UvTagW = std::min(Square.Width - 20.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Medium, 9.5f, UvMeta) + 22.0f);
    const Rectangle2D UvTagRect{ Square.X + (Square.Width - UvTagW) * 0.5f, Square.Bottom() - 32.0f, UvTagW, 22.0f };
    Surface.FillRectangle(UvTagRect, ColorRgba{ 16u, 18u, 22u, 225u }, 11.0f);
    Surface.StrokeRectangle(UvTagRect, Theme.BorderSubtle, 11.0f, 1.0f);
    Surface.TextCentered(UvTagRect, 9.5f, Theme.TextPrimary, UvMeta);
}

void TexturePaintViewportPane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    if (Session == nullptr || Bounds.Width < 260.0f || Bounds.Height < 200.0f)
    {
        return;
    }

    const TexturingThemeColors Theme    = QueryTexturingThemeColors();
    const Point2D              Cursor   { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed  = Input.PrimaryPointer.Pressed;
    const bool                 SheetLock = MoreToolsSheetOpen || ResolutionSheetOpen || ViewLayoutSheetOpen || SaveSheetOpen || BrushInspectorOpen;

    if (!Input.PrimaryPointer.Down)
    {
        ActiveBrushSliderId = -1;
    }

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, ColorRgba{ 11u, 11u, 12u, 255u }, 0.0f);

    // ----------------------------------------------------------------- BAND 1: Title + Resolution Combo
    constexpr float   Band1H = 52.0f;
    constexpr float   Band2H = 44.0f;
    constexpr float   PadX   = 16.0f;
    const Rectangle2D Band1Rect{ Bounds.X, Bounds.Y, Bounds.Width, Band1H };
    const Rectangle2D Band2Rect{ Bounds.X, Bounds.Y + Band1H, Bounds.Width, Band2H };

    Surface.FillRectangle(Band1Rect, Theme.PaneBackground);
    Surface.FillRectangle(Band2Rect, Theme.PaneBackground);
    Surface.StrokeLine({ Band2Rect.X, Band2Rect.Bottom() }, { Band2Rect.Right(), Band2Rect.Bottom() }, Theme.BorderSubtle, 1.0f);

    const Rectangle2D ResComboRect{ Bounds.Right() - PadX - 186.0f, Band1Rect.Y + 10.0f, 186.0f, 32.0f };
    const Rectangle2D NameRect{ Bounds.X + PadX - 4.0f, Band1Rect.Y + 8.0f, std::max(140.0f, ResComboRect.X - (Bounds.X + PadX) - 18.0f), 34.0f };

    if (Pressed && !SheetLock)
    {
        if (NameRect.Contains(Cursor))
        {
            if (!DocNameBuffer.Active)
            {
                AssignEditText(DocNameBuffer, Session->DocumentName);
            }
            DocNameBuffer.Active = true;
        }
        else if (DocNameBuffer.Active)
        {
            if (DocNameBuffer.Length > 0u)
            {
                Session->DocumentName = std::string(DocNameBuffer.Text);
            }
            DocNameBuffer.Active = false;
        }
    }
    WorkspaceAppearance::ForwardInputToTextBuffer(DocNameBuffer, Input, DeltaSeconds);
    if (DocNameBuffer.Active)
    {
        Surface.FillRectangle(NameRect, Theme.WellSurface, 10.0f);
        Surface.StrokeRectangle(NameRect, Theme.AccentBorder, 10.0f, 1.0f);
        (void)TextInputField::Construct(Surface, { NameRect.X + 8.0f, NameRect.Y + 2.0f, NameRect.Width - 16.0f, NameRect.Height - 4.0f }, DocNameBuffer, Input.PrimaryPointer, 19.0f, 1.0f);
        if (DocNameBuffer.Finalized)
        {
            if (DocNameBuffer.Length > 0u) Session->DocumentName = std::string(DocNameBuffer.Text);
            DocNameBuffer.Active = false;
        }
    }
    else
    {
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::SemiBold, { Bounds.X + PadX, Band1Rect.Y + 13.0f }, NameRect.Width, 21.0f, Theme.TextPrimary, Session->DocumentName);
    }

    // Resolution selector capsule
    Surface.FillRectangle(ResComboRect, Theme.WellSurface, 16.0f);
    Surface.StrokeRectangle(ResComboRect, ResolutionSheetOpen ? Theme.AccentBorder : Theme.BorderSubtle, 16.0f, 1.0f);
    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Medium, { ResComboRect.X + 12.0f, ResComboRect.Y + 11.0f }, 8.5f, Theme.TextMuted, "RESOLUTION");
    char ResText[16];
    std::snprintf(ResText, sizeof(ResText), "%u", Session->ResolutionPx);
    const Rectangle2D ResBox{ ResComboRect.X + 80.0f, ResComboRect.Y + 5.0f, 44.0f, 22.0f };
    Surface.FillRectangle(ResBox, Theme.SectionSurface, 6.0f);
    Surface.StrokeRectangle(ResBox, Theme.BorderSubtle, 6.0f, 1.0f);
    Surface.TextCentered(ResBox, 10.0f, Theme.TextPrimary, ResText);
    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Medium, { ResBox.Right() + 7.0f, ResComboRect.Y + 11.0f }, 8.5f, Theme.TextMuted, "PX");
    VectorIconRepository::ConstructControl(
        Surface,
        ResolutionSheetOpen ? ControlIcon::ChevronUp : ControlIcon::ChevronDown,
        VectorIconPlacement{ ResComboRect.Right() - 20.0f, ResComboRect.Y + 10.5f, 11.0f, Theme.TextMuted, 1.8f });
    if (ResComboRect.Contains(Cursor) && Pressed && !BrushInspectorOpen)
    {
        ResolutionSheetOpen = !ResolutionSheetOpen;
        MoreToolsSheetOpen  = false;
        ViewLayoutSheetOpen = false;
        SaveSheetOpen       = false;
    }

    // ----------------------------------------------------------------- BAND 2: 9 Tools + More tools + View/Undo/Redo/Save/GPU/Export
    float CurX = Band2Rect.X + PadX;
    const float ToolBtnY = Band2Rect.Y + 7.0f;
    constexpr float ToolBtnSize = 28.0f;

    for (uint8_t I = 0u; I < static_cast<uint8_t>(PaintToolCategory::Count); ++I)
    {
        const PaintToolCategory Tool = static_cast<PaintToolCategory>(I);
        const Rectangle2D ToolRect{ CurX, ToolBtnY, ToolBtnSize, ToolBtnSize };
        if (ToolRect.Right() > Band2Rect.Right() - 280.0f)
        {
            break;
        }
        char TipTitle[48];
        std::snprintf(TipTitle, sizeof(TipTitle), "%s (%s)", QueryToolLabel(Tool), QueryToolKeyHint(Tool));
        if (RenderCircularToolButton(
                Surface,
                ToolRect,
                QueryIconForPaintTool(Tool),
                Session->ActiveTool == Tool,
                Theme,
                Cursor,
                !SheetLock && Pressed,
                OptionalTooltip::FromTitled(TipTitle, "Activate texture paint tool.")))
        {
            Session->SelectTool(Tool);
        }
        CurX += ToolBtnSize + 5.0f;
    }

    const Rectangle2D MoreBtnRect{ CurX + 4.0f, ToolBtnY, 92.0f, ToolBtnSize };
    if (MoreBtnRect.Right() < Band2Rect.Right() - 260.0f)
    {
        if (ConstructCapsuleButtonControl(
                Surface,
                MoreBtnRect,
                "More tools",
                Theme,
                Cursor,
                !BrushInspectorOpen && Pressed,
                MoreToolsSheetOpen,
                false,
                ControlIcon::PlusAdd,
                9.5f,
                14.0f))
        {
            MoreToolsSheetOpen  = !MoreToolsSheetOpen;
            ResolutionSheetOpen = false;
            ViewLayoutSheetOpen = false;
            SaveSheetOpen       = false;
        }
        CurX = MoreBtnRect.Right() + 8.0f;
    }

    // Right-hand controls (right to left)
    float RightX = Band2Rect.Right() - PadX;

    const float ExportW = 92.0f;
    const Rectangle2D ExportRect{ RightX - ExportW, ToolBtnY, ExportW, ToolBtnSize };
    if (ConstructCapsuleButtonControl(Surface, ExportRect, "Export PBR", Theme, Cursor, !SheetLock && Pressed, false, true, ControlIcon::DownloadExport, 9.5f, 14.0f))
    {
        Session->StatusBanner = "Exported PBR";
    }
    RightX = ExportRect.X - 6.0f;

    const float GpuChipW = 86.0f;
    if (RightX - GpuChipW > CurX + 10.0f)
    {
        const Rectangle2D GpuChip{ RightX - GpuChipW, ToolBtnY + 2.0f, GpuChipW, 24.0f };
        Surface.FillRectangle(GpuChip, Theme.WellSurface, 12.0f);
        Surface.StrokeRectangle(GpuChip, Theme.BorderSubtle, 12.0f, 1.0f);
        Surface.FillCircle({ GpuChip.X + 10.0f, GpuChip.Y + 12.0f }, 3.2f, Theme.ReadyGreen);
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Medium, { GpuChip.X + 17.0f, GpuChip.Y + 6.0f }, GpuChip.Width - 22.0f, 9.0f, Theme.TextPrimary, Session->StatusBanner);
        RightX = GpuChip.X - 6.0f;
    }

    const float SaveW = 66.0f;
    const Rectangle2D SaveRect{ RightX - SaveW, ToolBtnY, SaveW, ToolBtnSize };
    if (SaveRect.X > CurX + 10.0f)
    {
        if (ConstructCapsuleButtonControl(Surface, SaveRect, "Save", Theme, Cursor, !BrushInspectorOpen && Pressed, SaveSheetOpen, false, ControlIcon::SaveDisk, 9.5f, 14.0f))
        {
            SaveSheetOpen       = !SaveSheetOpen;
            MoreToolsSheetOpen  = false;
            ResolutionSheetOpen = false;
            ViewLayoutSheetOpen = false;
        }
        RightX = SaveRect.X - 6.0f;
    }

    const Rectangle2D RedoRect{ RightX - ToolBtnSize, ToolBtnY, ToolBtnSize, ToolBtnSize };
    const Rectangle2D UndoRect{ RedoRect.X - ToolBtnSize - 4.0f, ToolBtnY, ToolBtnSize, ToolBtnSize };
    if (UndoRect.X > CurX + 10.0f)
    {
        if (RenderCircularToolButton(Surface, UndoRect, ControlIcon::UndoArrow, Session->QueryUndoAvailable(), Theme, Cursor, !SheetLock && Pressed))
        {
            Session->ApplyUndo();
        }
        if (RenderCircularToolButton(Surface, RedoRect, ControlIcon::RedoArrow, Session->QueryRedoAvailable(), Theme, Cursor, !SheetLock && Pressed))
        {
            Session->ApplyRedo();
        }
        RightX = UndoRect.X - 6.0f;
    }

    const char* ViewShort = QueryLayoutShortLabel(Session->ViewportLayout);
    const float ViewW     = std::min(150.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Medium, 9.2f, ViewShort) + 34.0f);
    Rectangle2D ViewBtnAnchor{ RightX - ViewW, ToolBtnY, ViewW, ToolBtnSize };
    if (ViewBtnAnchor.X > CurX + 4.0f)
    {
        if (ConstructCapsuleButtonControl(Surface, ViewBtnAnchor, ViewShort, Theme, Cursor, !BrushInspectorOpen && Pressed, ViewLayoutSheetOpen, false, ControlIcon::LayoutSplit, 9.2f, 14.0f))
        {
            ViewLayoutSheetOpen = !ViewLayoutSheetOpen;
            MoreToolsSheetOpen  = false;
            ResolutionSheetOpen = false;
            SaveSheetOpen       = false;
        }
    }

    // ----------------------------------------------------------------- CANVAS STAGE (3D / Split / 2D UV)
    LastCanvasBounds = {
        Bounds.X,
        Band2Rect.Bottom(),
        Bounds.Width,
        std::max(40.0f, Bounds.Bottom() - Band2Rect.Bottom()),
    };
    Surface.PushClip(LastCanvasBounds);
    Surface.FillRectangle(LastCanvasBounds, ColorRgba{ 11u, 11u, 11u, 255u }, 0.0f);

    const PaintStudyDescriptor& StudyDesc = Session->QueryActiveStudyDescriptor();
    const auto& ViewChannelNames          = TexturePaintSession::QueryViewChannelLabels();
    const char* ActiveChanName            = ViewChannelNames[std::min<std::size_t>(Session->ViewChannelIndex, ViewChannelNames.size() - 1u)];

    if (Session->ViewportLayout == PaintViewportLayout::ThreeDOnly)
    {
        char TopTag[96];
        std::snprintf(TopTag, sizeof(TopTag), "3D VIEWPORT · %s", ActiveChanName);
        const float TagW = std::min(LastCanvasBounds.Width - 28.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::SemiBold, 9.0f, TopTag) + 22.0f);
        const Rectangle2D TagR{ LastCanvasBounds.X + 14.0f, LastCanvasBounds.Y + 14.0f, TagW, 22.0f };
        Surface.FillRectangle(TagR, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(TagR, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(TagR, 9.0f, Theme.TextPrimary, TopTag);

        char StudyCaption[128];
        std::snprintf(StudyCaption, sizeof(StudyCaption), "%s · %u Parts · %u UV Islands", StudyDesc.Label, StudyDesc.PartCount, StudyDesc.UvIslands);
        Surface.TextCentered(LastCanvasBounds, 11.5f, Theme.TextMuted, StudyCaption);
    }
    else if (Session->ViewportLayout == PaintViewportLayout::TwoDOnly)
    {
        const Rectangle2D TagR{ LastCanvasBounds.X + 14.0f, LastCanvasBounds.Y + 14.0f, 120.0f, 22.0f };
        Surface.FillRectangle(TagR, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(TagR, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(TagR, 9.0f, Theme.TextPrimary, "2D UV VIEWPORT");

        RenderUvCanvasPreview(Surface, LastCanvasBounds);
    }
    else
    {
        const float       HalfW = LastCanvasBounds.Width * 0.5f;
        const Rectangle2D LeftPane { LastCanvasBounds.X, LastCanvasBounds.Y, HalfW, LastCanvasBounds.Height };
        const Rectangle2D RightPane{ LastCanvasBounds.X + HalfW, LastCanvasBounds.Y, LastCanvasBounds.Width - HalfW, LastCanvasBounds.Height };

        Surface.StrokeLine({ LeftPane.Right(), LeftPane.Y }, { LeftPane.Right(), LeftPane.Bottom() }, Theme.BorderSubtle, 1.0f);
        const Rectangle2D TagL{ LeftPane.X + 14.0f, LeftPane.Y + 14.0f, 108.0f, 22.0f };
        Surface.FillRectangle(TagL, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(TagL, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(TagL, 9.0f, Theme.TextPrimary, "3D VIEWPORT");
        Surface.TextCentered(LeftPane, 11.0f, Theme.TextMuted, StudyDesc.Label);

        const Rectangle2D TagR{ RightPane.X + 14.0f, RightPane.Y + 14.0f, 120.0f, 22.0f };
        Surface.FillRectangle(TagR, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(TagR, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(TagR, 9.0f, Theme.TextPrimary, "2D UV VIEWPORT");
        RenderUvCanvasPreview(Surface, RightPane);
    }

    // Bottom shortcut HUD bar
    char HudText[160];
    std::snprintf(
        HudText,
        sizeof(HudText),
        "%s · %dpx · Drag to paint · Right-Click / Q Brush Inspector · [ / ] Size · Shift Straight Line",
        QueryToolLabel(Session->ActiveTool),
        Session->Brush.PixelRadius);
    const float HudW = std::min(LastCanvasBounds.Width - 28.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.5f, HudText) + 28.0f);
    const Rectangle2D HudRect{ LastCanvasBounds.X + (LastCanvasBounds.Width - HudW) * 0.5f, LastCanvasBounds.Bottom() - 36.0f, HudW, 24.0f };
    Surface.FillRectangle(HudRect, ColorRgba{ 20u, 22u, 27u, 225u }, 12.0f);
    Surface.StrokeRectangle(HudRect, Theme.BorderSubtle, 12.0f, 1.0f);
    Surface.TextCentered(HudRect, 9.5f, Theme.TextMuted, HudText);

    // Canvas Right-Click / Q -> Brush Inspector
    if (LastCanvasBounds.Contains(Cursor) && !MoreToolsSheetOpen && !ResolutionSheetOpen && !ViewLayoutSheetOpen && !SaveSheetOpen)
    {
        if (Input.SecondaryPressed)
        {
            BrushSheetAnchor = Cursor;
            SetBrushInspectorOpen(true);
        }
        else if (ImGui::GetCurrentContext() != nullptr && ImGui::IsKeyPressed(ImGuiKey_Q, false))
        {
            BrushSheetAnchor = Cursor;
            SetBrushInspectorOpen(!BrushInspectorOpen);
        }
    }
    if (BrushInspectorOpen && Input.EscapePressed)
    {
        CloseAllOverlays();
    }

    Surface.PopClip();

    // ----------------------------------------------------------------- DROPDOWNS & OVERLAY SHEETS
    if (ResolutionSheetOpen)
    {
        static constexpr const char* ResOpts[4] { "512 x 512", "1024 x 1024", "2048 x 2048", "4096 x 4096" };
        static constexpr uint32_t    ResVals[4] { 512u, 1024u, 2048u, 4096u };
        uint32_t SelRes = 0u;
        for (uint32_t I = 0u; I < 4u; ++I)
        {
            if (ResVals[I] == Session->ResolutionPx) SelRes = I;
        }
        RenderFittedDropdownSheet(
            Surface,
            ResComboRect,
            Bounds,
            ResOpts,
            4u,
            SelRes,
            ResolutionSheetOpen,
            Input,
            [this](uint32_t Picked)
            {
                static constexpr uint32_t Vals[4] { 512u, 1024u, 2048u, 4096u };
                if (Picked < 4u) Session->AssignResolution(Vals[Picked]);
            },
            &SheetScrollY);
    }

    if (ViewLayoutSheetOpen)
    {
        static constexpr const char* LayoutOpts[3] { "3D Mesh", "3D + 2D UV", "2D UV Only" };
        RenderFittedDropdownSheet(
            Surface,
            ViewBtnAnchor,
            Bounds,
            LayoutOpts,
            3u,
            static_cast<uint32_t>(Session->ViewportLayout),
            ViewLayoutSheetOpen,
            Input,
            [this](uint32_t Picked)
            {
                if (Picked < 3u) Session->ViewportLayout = static_cast<PaintViewportLayout>(Picked);
            },
            &SheetScrollY);
    }

    if (SaveSheetOpen)
    {
        static constexpr const char* SaveOpts[5] {
            "Save Paint Project (.paint.json)",
            "Export Base Color PNG",
            "Export Normal PNG",
            "Export All PBR Maps",
            "Open Paint Project...",
        };
        RenderFittedDropdownSheet(
            Surface,
            SaveRect,
            Bounds,
            SaveOpts,
            5u,
            99u,
            SaveSheetOpen,
            Input,
            [this](uint32_t Picked)
            {
                if (Picked < 5u) Session->StatusBanner = "Saved OK";
            },
            &SheetScrollY);
    }

    if (MoreToolsSheetOpen)
    {
        constexpr float SheetW = 248.0f;
        constexpr float SheetH = 194.0f;
        const Rectangle2D SheetRect{
            std::clamp(MoreBtnRect.X, Bounds.X + 8.0f, Bounds.Right() - SheetW - 8.0f),
            MoreBtnRect.Bottom() + 6.0f,
            SheetW,
            SheetH,
        };
        Surface.FillRectangle(SheetRect, Theme.NestedSurface, 12.0f);
        Surface.StrokeRectangle(SheetRect, Theme.BorderStrong, 12.0f, 1.0f);

        float Sy = SheetRect.Y + 10.0f;
        if (ConstructCapsuleButtonControl(Surface, { SheetRect.X + 10.0f, Sy, SheetW - 20.0f, 26.0f }, "Brush / Tool (Q)", Theme, Cursor, Pressed, false, true, ControlIcon::BrushTool, 9.8f, 13.0f))
        {
            SetBrushInspectorOpen(true);
        }
        Sy += 34.0f;

        Rectangle2D StudyDropBtn{};
        if (ConstructDropdownBarRow(Surface, SheetRect.X + 10.0f, Sy, SheetW - 20.0f, "Study Mesh", StudyDesc.Label, StudySubSheetOpen, Theme, Input.PrimaryPointer, StudyDropBtn))
        {
            StudySubSheetOpen   = !StudySubSheetOpen;
            ChannelSubSheetOpen = false;
        }
        Sy += 54.0f;

        Rectangle2D ChanDropBtn{};
        if (ConstructDropdownBarRow(Surface, SheetRect.X + 10.0f, Sy, SheetW - 20.0f, "Display Channel", ActiveChanName, ChannelSubSheetOpen, Theme, Input.PrimaryPointer, ChanDropBtn))
        {
            ChannelSubSheetOpen = !ChannelSubSheetOpen;
            StudySubSheetOpen   = false;
        }
        Sy += 54.0f;

        ConstructSwitchControlRow(Surface, SheetRect.X + 10.0f, Sy, SheetW - 20.0f, "Mesh Wireframe Overlay", Session->WireframeOverlay, Theme, Input.PrimaryPointer);

        if (StudySubSheetOpen)
        {
            const auto& Studies = TexturePaintSession::QueryStudyRegistry();
            std::array<const char*, 5u> Names{};
            for (std::size_t I = 0u; I < Studies.size(); ++I) Names[I] = Studies[I].Label;
            RenderFittedDropdownSheet(
                Surface,
                StudyDropBtn,
                Bounds,
                Names.data(),
                5u,
                static_cast<uint32_t>(Session->Study),
                StudySubSheetOpen,
                Input,
                [this, &Studies](uint32_t Picked) { if (Picked < Studies.size()) Session->SelectStudy(Studies[Picked].Asset); },
                &SheetScrollY);
        }
        if (ChannelSubSheetOpen)
        {
            RenderFittedDropdownSheet(
                Surface,
                ChanDropBtn,
                Bounds,
                ViewChannelNames.data(),
                static_cast<uint32_t>(ViewChannelNames.size()),
                Session->ViewChannelIndex,
                ChannelSubSheetOpen,
                Input,
                [this](uint32_t Picked) { Session->ViewChannelIndex = Picked; },
                &SheetScrollY);
        }

        if (Pressed && !SheetRect.Contains(Cursor) && !MoreBtnRect.Contains(Cursor) && !StudySubSheetOpen && !ChannelSubSheetOpen)
        {
            MoreToolsSheetOpen = false;
        }
    }

    if (BrushInspectorOpen)
    {
        RenderBrushInspectorSheet(Surface, Bounds, Input);
    }

    Surface.PopClip();
}

void TexturePaintViewportPane::RenderBrushInspectorSheet(
    PixelSpace&             Surface,
    Rectangle2D             WorkspaceBounds,
    const PaneInputReading& Input) noexcept
{
    if (Session == nullptr)
    {
        return;
    }

    const TexturingThemeColors Theme   = QueryTexturingThemeColors();
    const Point2D              Cursor  { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed = Input.PrimaryPointer.Pressed;

    const float BoxW = std::min(358.0f, WorkspaceBounds.Width - 24.0f);
    const float BoxH = std::min(568.0f, WorkspaceBounds.Height - 24.0f);
    const float X    = std::clamp(BrushSheetAnchor.X - BoxW * 0.5f, WorkspaceBounds.X + 12.0f, WorkspaceBounds.Right() - BoxW - 12.0f);
    const float Y    = std::clamp(BrushSheetAnchor.Y - BoxH * 0.5f, WorkspaceBounds.Y + 12.0f, WorkspaceBounds.Bottom() - BoxH - 12.0f);
    const Rectangle2D SheetRect{ X, Y, BoxW, BoxH };

    Surface.FillRectangle(SheetRect, Theme.NestedSurface, 14.0f);
    Surface.StrokeRectangle(SheetRect, Theme.BorderStrong, 14.0f, 1.0f);

    // Header
    WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { X + 14.0f, Y + 12.0f }, 12.5f, Theme.TextPrimary, "Brush Inspector");
    const Rectangle2D CloseBtn{ SheetRect.Right() - 32.0f, Y + 8.0f, 24.0f, 24.0f };
    if (RenderCircularToolButton(Surface, CloseBtn, ControlIcon::CloseCross, false, Theme, Cursor, Pressed))
    {
        BrushInspectorOpen = false;
        return;
    }

    const Rectangle2D ShortcutTag{ CloseBtn.X - 30.0f, Y + 11.0f, 22.0f, 18.0f };
    Surface.FillRectangle(ShortcutTag, Theme.WellSurface, 6.0f);
    Surface.StrokeRectangle(ShortcutTag, Theme.BorderSubtle, 6.0f, 1.0f);
    Surface.TextCentered(ShortcutTag, 9.0f, Theme.TextMuted, QueryToolKeyHint(Session->ActiveTool));

    // 7 Tool Tabs ("Brush", "Erase", "Fill", "Stamp", "Pick", "Move", "Text")
    static constexpr const char* ToolTabLabels[7] { "Brush", "Erase", "Fill", "Stamp", "Pick", "Move", "Text" };
    const float                  TabGap = 4.0f;
    const float                  TabW   = (BoxW - 28.0f - TabGap * 6.0f) / 7.0f;
    const float                  TabY   = Y + 40.0f;
    for (uint32_t I = 0u; I < 7u; ++I)
    {
        const Rectangle2D TRect{ X + 14.0f + static_cast<float>(I) * (TabW + TabGap), TabY, TabW, 24.0f };
        if (ConstructCapsuleButtonControl(
                Surface,
                TRect,
                ToolTabLabels[I],
                Theme,
                Cursor,
                Pressed,
                static_cast<uint32_t>(Session->InspectorTab) == I,
                false,
                ControlIcon::Count,
                8.8f,
                12.0f))
        {
            Session->InspectorTab = static_cast<BrushInspectorTab>(I);
            switch (Session->InspectorTab)
            {
                case BrushInspectorTab::Brush: Session->ActiveTool = PaintToolCategory::Brush;  break;
                case BrushInspectorTab::Erase: Session->ActiveTool = PaintToolCategory::Eraser; break;
                case BrushInspectorTab::Fill:  Session->ActiveTool = PaintToolCategory::Fill;   break;
                case BrushInspectorTab::Stamp: Session->ActiveTool = PaintToolCategory::Stamp;  break;
                case BrushInspectorTab::Pick:  Session->ActiveTool = PaintToolCategory::Sample; break;
                case BrushInspectorTab::Move:  Session->ActiveTool = PaintToolCategory::Move;   break;
                case BrushInspectorTab::Text:  Session->ActiveTool = PaintToolCategory::Text;   break;
                default: break;
            }
        }
    }

    float BodyTop = TabY + 32.0f;

    // 3 Sub-tabs when Brush is active
    if (Session->InspectorTab == BrushInspectorTab::Brush)
    {
        static constexpr const char* SubTabLabels[3] { "Tip & PBR", "Colour Dynamics", "Curves" };
        uint32_t ChosenSub = static_cast<uint32_t>(Session->InspectorSubTab);
        if (ConstructSegmentedCapsuleRow(Surface, X + 14.0f, BodyTop, BoxW - 28.0f, {}, SubTabLabels, 3u, ChosenSub, ChosenSub, Theme, Input.PrimaryPointer))
        {
            Session->InspectorSubTab = static_cast<BrushDetailSubTab>(ChosenSub);
            BrushScrollY             = 0.0f;
        }
        BodyTop += 38.0f;
    }

    Surface.StrokeLine({ X + 12.0f, BodyTop }, { SheetRect.Right() - 12.0f, BodyTop }, Theme.BorderSubtle, 1.0f);
    BodyTop += 6.0f;

    // Scrollable Inspector Body
    const Rectangle2D ScrollRect{ X + 4.0f, BodyTop, BoxW - 8.0f, std::max(40.0f, SheetRect.Bottom() - 10.0f - BodyTop) };
    if (ScrollRect.Contains(Cursor) && std::abs(Input.WheelDeltaY) > 0.01f)
    {
        BrushScrollY = std::clamp(BrushScrollY - Input.WheelDeltaY * 28.0f, 0.0f, MaxBrushScrollY);
    }

    Surface.PushClip(ScrollRect);
    const float InnerX = X + 14.0f;
    const float InnerW = BoxW - 28.0f;
    float       CurY   = BodyTop + 4.0f - BrushScrollY;

    auto RenderScalarRow = [&](int32_t Key, const char* Label, float MinVal, float MaxVal, const char* Unit, const char* Fmt, float& Scalar)
    {
        float Norm = std::clamp((Scalar - MinVal) / std::max(0.0001f, MaxVal - MinVal), 0.0f, 1.0f);
        bool  Drag = (ActiveBrushSliderId == Key);
        char  NumBuf[32];
        std::snprintf(NumBuf, sizeof(NumBuf), Fmt, Scalar);
        if (ConstructSliderReadoutRow(Surface, InnerX, CurY, InnerW, Label, NumBuf, Unit, Norm, Theme, Input.PrimaryPointer, Drag))
        {
            Scalar = std::clamp(MinVal + Norm * (MaxVal - MinVal), MinVal, MaxVal);
        }
        if (Drag) ActiveBrushSliderId = Key;
        CurY += 50.0f;
    };

    const auto& ChRegistry = TexturePaintSession::QueryChannelRegistry();

    if (Session->InspectorTab == BrushInspectorTab::Brush)
    {
        if (Session->InspectorSubTab == BrushDetailSubTab::TipAndPbr)
        {
            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Paint PBR Channels");
            CurY += 16.0f;

            std::vector<RemovableChipEntry> ActiveChips{};
            std::vector<PaintSurfaceChannel> ChipKeys{};
            for (std::size_t I = 0u; I < TexturePaintSession::ChannelCount; ++I)
            {
                if (Session->Brush.PaintChannels[I])
                {
                    ActiveChips.push_back(RemovableChipEntry{ ChRegistry[I].Label, Session->Brush.InkColor, true });
                    ChipKeys.push_back(ChRegistry[I].Key);
                }
            }
            const RemovableChipOutcome ChipOut = ConstructRemovableChannelChips(
                Surface, InnerX, CurY, InnerW, ActiveChips, {}, false, Theme, Cursor, Pressed);
            if (ChipOut.RemovedIndex >= 0 && static_cast<std::size_t>(ChipOut.RemovedIndex) < ChipKeys.size())
            {
                Session->Brush.PaintChannels[static_cast<std::size_t>(ChipKeys[static_cast<std::size_t>(ChipOut.RemovedIndex)])] = false;
            }
            CurY += ChipOut.ConsumedHeight + 10.0f;

            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Brush Tip Shape");
            CurY += 16.0f;
            static constexpr std::array<const char*, 6u> TipLabels {{ "Round", "Chisel", "Chalk", "Splatter", "Sponge", "Custom Img" }};
            const ChipStripOutcome TipOut = ConstructWrappedChipStrip(
                Surface, InnerX, CurY, InnerW, TipLabels, static_cast<int32_t>(Session->Brush.TipShape), Theme, Cursor, Pressed, 22.0f, 9.2f);
            if (TipOut.ClickedIndex >= 0 && TipOut.ClickedIndex < 6)
            {
                Session->Brush.TipShape = static_cast<BrushTipShape>(TipOut.ClickedIndex);
            }
            CurY += TipOut.ConsumedHeight + 10.0f;

            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Ink Color");
            CurY += 16.0f;
            const auto& Swatches = TexturePaintSession::QueryBrushQuickSwatches();
            for (std::size_t I = 0u; I < Swatches.size(); ++I)
            {
                const float SwX = InnerX + static_cast<float>(I) * 26.0f;
                const Point2D SwCtr{ SwX + 10.0f, CurY + 10.0f };
                const bool Match = (Swatches[I] == Session->Brush.InkColor);
                Surface.FillCircle(SwCtr, 9.5f, Swatches[I]);
                Surface.StrokeCircle(SwCtr, Match ? 11.5f : 9.5f, Match ? Theme.HighlightFill : Theme.BorderStrong, Match ? 1.8f : 1.0f);
                if (Rectangle2D{ SwX, CurY, 20.0f, 20.0f }.Contains(Cursor) && Pressed)
                {
                    Session->Brush.InkColor = Swatches[I];
                }
            }
            CurY += 28.0f;

            RenderScalarRow(301, "Brush Size", 0.03f, 0.90f, "m", "%.2f", Session->Brush.SizeMeters);
            Session->Brush.PixelRadius = static_cast<int32_t>(std::round(Session->Brush.SizeMeters * 110.0f));
            RenderScalarRow(302, "Opacity",       0.05f,   1.00f, "",  "%.2f", Session->Brush.Opacity);
            RenderScalarRow(303, "Flow",          0.05f,   1.00f, "",  "%.2f", Session->Brush.DeliveryRate);
            RenderScalarRow(304, "Hardness",      0.05f,   0.98f, "",  "%.2f", Session->Brush.Hardness);
            RenderScalarRow(305, "Tip Angle",   -180.0f, 180.0f, "°",  "%.0f", Session->Brush.TipAngleDeg);
            RenderScalarRow(306, "Tip Roundness", 0.15f,   1.00f, "",  "%.2f", Session->Brush.TipRoundness);
            RenderScalarRow(307, "Roughness",     0.02f,   1.00f, "",  "%.2f", Session->Brush.Roughness);
            RenderScalarRow(308, "Metalness",     0.00f,   1.00f, "",  "%.2f", Session->Brush.Metalness);
            RenderScalarRow(309, "Height Relief", -1.00f,  1.00f, "",  "%.2f", Session->Brush.HeightRelief);
        }
        else if (Session->InspectorSubTab == BrushDetailSubTab::ColourDynamics)
        {
            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Stroke & Lazy Mouse");
            CurY += 16.0f;
            RenderScalarRow(321, "Spacing",    0.06f, 1.00f, "", "%.2f", Session->Brush.Spacing);
            RenderScalarRow(322, "Stabilizer", 0.00f, 0.85f, "", "%.2f", Session->Brush.Stabilizer);
            ConstructSwitchControlRow(Surface, InnerX, CurY, InnerW, "Follow Stroke Direction", Session->Brush.FollowStrokeDirection, Theme, Input.PrimaryPointer);
            CurY += 34.0f;

            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Tip Jitter & Scatter");
            CurY += 16.0f;
            RenderScalarRow(323, "Size Jitter",      0.00f,   0.90f, "",  "%.2f", Session->Brush.SizeJitter);
            RenderScalarRow(324, "Angle Jitter",     0.00f, 180.0f, "°",  "%.0f", Session->Brush.AngleJitterDeg);
            RenderScalarRow(325, "Position Scatter", 0.00f,   1.50f, "r",  "%.2f", Session->Brush.PositionScatter);
            RenderScalarRow(326, "Flow Jitter",      0.00f,   0.80f, "",  "%.2f", Session->Brush.DeliveryJitter);

            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::SemiBold, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Colour Dynamics");
            CurY += 16.0f;
            RenderScalarRow(327, "Opacity Jitter",    0.00f, 0.95f, "", "%.2f", Session->Brush.OpacityJitter);
            RenderScalarRow(328, "Hue Jitter",        0.00f, 1.00f, "", "%.2f", Session->Brush.HueJitter);
            RenderScalarRow(329, "Saturation Jitter", 0.00f, 0.80f, "", "%.2f", Session->Brush.SatJitter);
            RenderScalarRow(330, "Value Jitter",      0.00f, 0.80f, "", "%.2f", Session->Brush.LightnessJitter);
            ConstructSwitchControlRow(Surface, InnerX, CurY, InnerW, "Hue Shift Over Stroke Curve", Session->Brush.HueShiftOverStroke, Theme, Input.PrimaryPointer);
            CurY += 34.0f;
        }
        else
        {
            WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Response Curve Target");
            CurY += 16.0f;
            static constexpr std::array<const char*, 4u> CurveLabels {{ "Tip Falloff", "Size", "Opacity", "Hue Shift" }};
            const ChipStripOutcome COut = ConstructWrappedChipStrip(
                Surface, InnerX, CurY, InnerW, CurveLabels, static_cast<int32_t>(Session->Brush.ActiveCurve), Theme, Cursor, Pressed, 22.0f, 9.2f);
            if (COut.ClickedIndex >= 0 && COut.ClickedIndex < 4)
            {
                Session->Brush.ActiveCurve = static_cast<BrushResponseCurve>(COut.ClickedIndex);
            }
            CurY += COut.ConsumedHeight + 12.0f;

            // Interactive Curve Graph Box
            const Rectangle2D CurvePlotRect{ InnerX, CurY, InnerW, 180.0f };
            Surface.FillRectangle(CurvePlotRect, Theme.WellSurface, 12.0f);
            Surface.StrokeRectangle(CurvePlotRect, Theme.BorderSubtle, 12.0f, 1.0f);
            for (int32_t G = 1; G < 4; ++G)
            {
                const float F = static_cast<float>(G) * 0.25f;
                Surface.StrokeLine({ CurvePlotRect.X + CurvePlotRect.Width * F, CurvePlotRect.Y + 8.0f }, { CurvePlotRect.X + CurvePlotRect.Width * F, CurvePlotRect.Bottom() - 8.0f }, ColorRgba{ 255u, 255u, 255u, 18u }, 1.0f);
                Surface.StrokeLine({ CurvePlotRect.X + 8.0f, CurvePlotRect.Y + CurvePlotRect.Height * F }, { CurvePlotRect.Right() - 8.0f, CurvePlotRect.Y + CurvePlotRect.Height * F }, ColorRgba{ 255u, 255u, 255u, 18u }, 1.0f);
            }

            const auto& Pts = Session->Brush.Curves[static_cast<std::size_t>(Session->Brush.ActiveCurve)];
            for (std::size_t I = 0u; I + 1u < Pts.size(); ++I)
            {
                const Point2D P0{ CurvePlotRect.X + 12.0f + Pts[I].X * (CurvePlotRect.Width - 24.0f), CurvePlotRect.Bottom() - 12.0f - Pts[I].Y * (CurvePlotRect.Height - 24.0f) };
                const Point2D P1{ CurvePlotRect.X + 12.0f + Pts[I + 1u].X * (CurvePlotRect.Width - 24.0f), CurvePlotRect.Bottom() - 12.0f - Pts[I + 1u].Y * (CurvePlotRect.Height - 24.0f) };
                Surface.StrokeLine(P0, P1, Theme.HighlightFill, 2.2f);
            }
            for (const auto& Pt : Pts)
            {
                const Point2D Ctr{ CurvePlotRect.X + 12.0f + Pt.X * (CurvePlotRect.Width - 24.0f), CurvePlotRect.Bottom() - 12.0f - Pt.Y * (CurvePlotRect.Height - 24.0f) };
                Surface.FillCircle(Ctr, 5.0f, Theme.HighlightFill);
                Surface.StrokeCircle(Ctr, 5.0f, Theme.HighlightInk, 1.2f);
            }
            CurY += CurvePlotRect.Height + 12.0f;
            WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, InnerW, 9.2f, Theme.TextMuted, "Drag points · Click add · Right-click delete");
            CurY += 20.0f;
        }
    }
    else if (Session->InspectorTab == BrushInspectorTab::Erase)
    {
        RenderScalarRow(341, "Eraser Size", 0.03f, 0.90f, "m", "%.2f", Session->Brush.SizeMeters);
        RenderScalarRow(342, "Opacity",     0.05f, 1.00f, "",  "%.2f", Session->Brush.Opacity);
        RenderScalarRow(343, "Flow",        0.05f, 1.00f, "",  "%.2f", Session->Brush.DeliveryRate);
        RenderScalarRow(344, "Hardness",    0.05f, 0.98f, "",  "%.2f", Session->Brush.Hardness);
        RenderScalarRow(345, "Stabilizer",  0.00f, 0.85f, "",  "%.2f", Session->Brush.Stabilizer);
    }
    else if (Session->InspectorTab == BrushInspectorTab::Fill)
    {
        WorkspaceAppearance::ConstructWeightedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, 9.8f, Theme.TextMuted, "Flood Fill Scope");
        CurY += 16.0f;
        static constexpr std::array<const char*, 3u> ScopeLabels {{ "Mesh Part", "UV Island", "Whole Mesh" }};
        const ChipStripOutcome ScOut = ConstructWrappedChipStrip(Surface, InnerX, CurY, InnerW, ScopeLabels, static_cast<int32_t>(Session->Brush.FillScope), Theme, Cursor, Pressed, 22.0f, 9.2f);
        if (ScOut.ClickedIndex >= 0 && ScOut.ClickedIndex < 3) Session->Brush.FillScope = static_cast<PaintFillScope>(ScOut.ClickedIndex);
        CurY += ScOut.ConsumedHeight + 10.0f;
        RenderScalarRow(351, "Opacity",       0.05f, 1.00f, "", "%.2f", Session->Brush.Opacity);
        RenderScalarRow(352, "Roughness",     0.02f, 1.00f, "", "%.2f", Session->Brush.Roughness);
        RenderScalarRow(353, "Metalness",     0.00f, 1.00f, "", "%.2f", Session->Brush.Metalness);
        RenderScalarRow(354, "Height Relief", -1.00f, 1.00f, "", "%.2f", Session->Brush.HeightRelief);
    }
    else if (Session->InspectorTab == BrushInspectorTab::Stamp)
    {
        static constexpr std::array<const char*, 2u> PlaceTargets {{ "On Active Layer", "New Stamp Layer" }};
        const ChipStripOutcome POut = ConstructWrappedChipStrip(Surface, InnerX, CurY, InnerW, PlaceTargets, Session->Brush.StampNewLayerTarget ? 1 : 0, Theme, Cursor, Pressed, 22.0f, 9.2f);
        if (POut.ClickedIndex >= 0) Session->Brush.StampNewLayerTarget = (POut.ClickedIndex == 1);
        CurY += POut.ConsumedHeight + 10.0f;
        RenderScalarRow(361, "Stamp Scale",   0.04f,   1.20f, "",  "%.2f", Session->Brush.StampScale);
        RenderScalarRow(362, "Rotation",   -180.0f, 180.0f, "°",  "%.0f", Session->Brush.StampRotationDeg);
        RenderScalarRow(363, "Opacity",       0.05f,   1.00f, "",  "%.2f", Session->Brush.StampOpacity);
        RenderScalarRow(364, "Relief Height",-1.00f,   1.00f, "",  "%.2f", Session->Brush.StampHeightGain);
    }
    else if (Session->InspectorTab == BrushInspectorTab::Pick)
    {
        char HexBuf[16];
        FormatHexLower(Session->Brush.InkColor, HexBuf, sizeof(HexBuf));
        char SubBuf[64];
        std::snprintf(SubBuf, sizeof(SubBuf), "ROUGH %.2f · METAL %.2f", Session->Brush.Roughness, Session->Brush.Metalness);
        CurY += ConstructSubjectHeadingBlock(Surface, InnerX, CurY, InnerW, ControlIcon::PipetteDropper, HexBuf, SubBuf, Theme) + 12.0f;
        if (ConstructCapsuleButtonControl(Surface, { InnerX, CurY, InnerW, 28.0f }, "Paint with Sampled Color", Theme, Cursor, Pressed, false, true, ControlIcon::BrushTool, 9.8f, 14.0f))
        {
            Session->SelectTool(PaintToolCategory::Brush);
            BrushInspectorOpen = false;
        }
        CurY += 36.0f;
    }
    else if (Session->InspectorTab == BrushInspectorTab::Move)
    {
        if (ConstructCapsuleButtonControl(Surface, { InnerX, CurY, InnerW, 28.0f }, "+ Place Stamp at UV Center", Theme, Cursor, Pressed, false, true, ControlIcon::StampTool, 9.8f, 14.0f))
        {
            Session->AddStampToSelectedLayer(false);
        }
        CurY += 38.0f;
    }
    else
    {
        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::Regular, { InnerX, CurY }, InnerW, 9.8f, Theme.TextMuted, "Click mesh or UV to stamp PBR text");
        CurY += 18.0f;
        RenderScalarRow(381, "Text Scale",     0.05f, 1.20f, "",  "%.2f", Session->Brush.TextScale);
        RenderScalarRow(382, "Rotation",    -180.0f, 180.0f, "°", "%.0f", Session->Brush.TextRotationDeg);
        RenderScalarRow(383, "Letter Space",  -6.0f,  36.0f, "px","%.1f", Session->Brush.TextLetterSpacingPx);
        RenderScalarRow(384, "Line Height",   0.75f,  2.20f, "x", "%.2f", Session->Brush.TextLineHeight);
        if (ConstructCapsuleButtonControl(Surface, { InnerX, CurY, InnerW, 28.0f }, "+ Stamp Text at UV Center", Theme, Cursor, Pressed, false, true, ControlIcon::TextType, 9.8f, 14.0f))
        {
            Session->AddStampToSelectedLayer(true);
        }
        CurY += 36.0f;
    }

    const float ContentBottom = CurY + BrushScrollY + 12.0f;
    MaxBrushScrollY           = std::max(0.0f, ContentBottom - ScrollRect.Bottom());
    BrushScrollY              = std::clamp(BrushScrollY, 0.0f, MaxBrushScrollY);

    Surface.PopClip();

    if (Pressed && !SheetRect.Contains(Cursor))
    {
        BrushInspectorOpen = false;
    }
}

} // namespace Frontier::Workspaces
