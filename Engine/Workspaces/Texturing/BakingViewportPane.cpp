/*==========================================================================================================================================
                                                        BAKINGVIEWPORTPANE.CPP
==========================================================================================================================================*/
// 🧊 Implementation of BakingViewportPane: toolbar selectors, 3D / 2D / Split viewports, 2D SDF section view & Quick Bake Overlay.

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Texturing/BakingViewportPane.h"

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

[[nodiscard]] bool PointInsideRect(Rectangle2D Rect, Point2D Cursor) noexcept
{
    return Cursor.X >= Rect.X && Cursor.X <= Rect.Right() && Cursor.Y >= Rect.Y && Cursor.Y <= Rect.Bottom();
}

[[nodiscard]] const char* QueryLayoutLabel(BakerViewportLayout Layout) noexcept
{
    switch (Layout)
    {
        case BakerViewportLayout::ThreeDOnly: return "3D Mesh Only";
        case BakerViewportLayout::TwoDOnly:   return "2D Map Only";
        case BakerViewportLayout::SplitView:  return "3D + 2D Split";
        default:                              return "3D Mesh Only";
    }
}

[[nodiscard]] const char* QueryAxisLabel(VolumeSectionAxis Axis) noexcept
{
    switch (Axis)
    {
        case VolumeSectionAxis::AxisZ: return "Z";
        case VolumeSectionAxis::AxisY: return "Y";
        case VolumeSectionAxis::AxisX: return "X";
        default:                       return "Z";
    }
}

} // namespace

BakingViewportPane::~BakingViewportPane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void BakingViewportPane::AttachSession(BakingWorkspaceSession* TargetSession) noexcept
{
    Session            = TargetSession;
    StudyDropdownOpen  = false;
    LayoutDropdownOpen = false;
    QuickOverlayOpen   = false;
    SheetScrollY       = 0.0f;
}

void BakingViewportPane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##BakingViewportCanvas",
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

void BakingViewportPane::SetQuickOverlayOpen(bool Open) noexcept
{
    QuickOverlayOpen = Open;
    if (Open)
    {
        StudyDropdownOpen  = false;
        LayoutDropdownOpen = false;
        if (QuickOverlayAnchor.X <= 1.0f && QuickOverlayAnchor.Y <= 1.0f && LastCanvasBounds.Width > 20.0f)
        {
            QuickOverlayAnchor = {
                LastCanvasBounds.X + LastCanvasBounds.Width * 0.5f,
                LastCanvasBounds.Y + LastCanvasBounds.Height * 0.42f,
            };
        }
    }
}

bool BakingViewportPane::QueryQuickOverlayOpen() const noexcept
{
    return QuickOverlayOpen;
}

bool BakingViewportPane::QueryAnyOverlayOpen() const noexcept
{
    return StudyDropdownOpen || LayoutDropdownOpen || QuickOverlayOpen;
}

void BakingViewportPane::CloseAllOverlays() noexcept
{
    StudyDropdownOpen  = false;
    LayoutDropdownOpen = false;
    QuickOverlayOpen   = false;
}

void BakingViewportPane::RenderInspectedTwoDPreview(PixelSpace& Surface, Rectangle2D PreviewArea) const noexcept
{
    if (Session == nullptr)
    {
        return;
    }

    const TexturingThemeColors Theme = QueryTexturingThemeColors();

    const float Side = std::max(80.0f, std::min(PreviewArea.Width, PreviewArea.Height) - 36.0f);
    const Rectangle2D CanvasBox{
        PreviewArea.X + (PreviewArea.Width - Side) * 0.5f,
        PreviewArea.Y + (PreviewArea.Height - Side) * 0.5f,
        Side,
        Side,
    };

    Surface.FillRectangle(CanvasBox, ColorRgba{ 19u, 20u, 24u, 255u }, 14.0f);
    Surface.StrokeRectangle(CanvasBox, Theme.BorderStrong, 14.0f, 1.0f);

    const BakerTargetDescriptor& TargetDesc = BakingWorkspaceSession::QueryTargetDescriptor(Session->InspectedTarget);
    const float Cx = CanvasBox.X + CanvasBox.Width * 0.5f;
    const float Cy = CanvasBox.Y + CanvasBox.Height * 0.5f;

    if (Session->InspectedTarget == BakerTargetId::VolumeSdf)
    {
        if (Session->VolumeSdfBaked)
        {
            const float MaxR  = CanvasBox.Width * 0.40f;
            const float Shift = (Session->SectionDepthNormalized - 0.5f) * 0.25f * MaxR;
            Surface.FillCircle({ Cx, Cy + Shift }, MaxR * 1.02f, ColorRgba{ 36u, 64u, 108u, 255u });
            Surface.FillCircle({ Cx, Cy + Shift }, MaxR * 0.80f, ColorRgba{ 58u, 102u, 158u, 255u });
            Surface.FillCircle({ Cx, Cy + Shift }, MaxR * 0.56f, ColorRgba{ 239u, 244u, 207u, 255u });
            Surface.FillCircle({ Cx, Cy + Shift }, MaxR * 0.46f, ColorRgba{ 168u, 74u, 46u, 255u });
            char SectionCap[64];
            std::snprintf(
                SectionCap,
                sizeof(SectionCap),
                "%u³ SDF · %s %.2f",
                Session->VolumeGridDim,
                QueryAxisLabel(Session->SectionAxis),
                Session->SectionDepthNormalized);
            Surface.TextCentered(
                { CanvasBox.X + 12.0f, CanvasBox.Bottom() - 32.0f, CanvasBox.Width - 24.0f, 20.0f },
                11.0f,
                Theme.TextPrimary,
                SectionCap);
        }
        else
        {
            Surface.TextCentered(CanvasBox, 12.0f, Theme.TextMuted, "Click 'Bake Selected Maps' to compute 3D Volume SDF");
        }
    }
    else if (Session->QueryTargetReady(Session->InspectedTarget))
    {
        const float Pad = 22.0f;
        const Rectangle2D InnerTex{ CanvasBox.X + Pad, CanvasBox.Y + Pad, CanvasBox.Width - Pad * 2.0f, CanvasBox.Height - Pad * 2.0f };
        const ColorRgba OriginCol = (Session->InspectedTarget == BakerTargetId::TangentNormal)
            ? ColorRgba{ 122u, 130u, 238u, 255u }
            : ((Session->InspectedTarget == BakerTargetId::Curvature)
                ? ColorRgba{ 102u, 118u, 128u, 255u }
                : ColorRgba{ 176u, 180u, 188u, 255u });
        Surface.FillRectangle(InnerTex, OriginCol, 8.0f);
        Surface.FillCircle({ Cx, Cy }, InnerTex.Width * 0.32f, ColorRgba{ 220u, 224u, 232u, 140u });
        char ReadyText[96];
        std::snprintf(ReadyText, sizeof(ReadyText), "%s (%ux%u)", TargetDesc.Label, Session->TargetResolutionPx, Session->TargetResolutionPx);
        Surface.TextCentered(
            { CanvasBox.X + 12.0f, CanvasBox.Bottom() - 32.0f, CanvasBox.Width - 24.0f, 20.0f },
            11.0f,
            Theme.TextPrimary,
            ReadyText);
    }
    else
    {
        Surface.TextCentered(CanvasBox, 12.0f, Theme.TextMuted, "Select channels & click 'Bake Selected Maps'");
    }
}

void BakingViewportPane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    (void)DeltaSeconds;
    if (Session == nullptr || Bounds.Width < 120.0f || Bounds.Height < 120.0f)
    {
        return;
    }

    const TexturingThemeColors Theme     = QueryTexturingThemeColors();
    const Point2D              Cursor    { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed   = Input.PrimaryPointer.Pressed;
    const bool                 OverlayUp = QueryAnyOverlayOpen();

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, Theme.PaneBackground, 0.0f);

    // Top toolbar
    constexpr float   ToolbarH = 46.0f;
    const Rectangle2D ToolbarBounds{ Bounds.X, Bounds.Y, Bounds.Width, ToolbarH };
    Surface.FillRectangle(ToolbarBounds, Theme.PaneBackground, 0.0f);
    Surface.StrokeLine({ ToolbarBounds.X, ToolbarBounds.Bottom() }, { ToolbarBounds.Right(), ToolbarBounds.Bottom() }, Theme.BorderSubtle, 1.0f);

    float                CurX = ToolbarBounds.X + 12.0f;
    const float          BtnY = ToolbarBounds.Y + 8.0f;
    const float          BtnH = 30.0f;
    const ControlPointer Ptr  = OverlayUp ? ControlPointer{} : Input.PrimaryPointer;

    // 1. Study Selector
    const BakerStudyDescriptor& ActiveStudy = Session->QueryActiveStudyDescriptor();
    const float StudyW = std::min(220.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Medium, 10.5f, ActiveStudy.Label) + 46.0f);
    if (ConstructDropdownBarRow(
            Surface,
            CurX,
            BtnY,
            StudyW,
            {},
            ActiveStudy.Label,
            StudyDropdownOpen,
            Theme,
            Ptr,
            LastStudyAnchor,
            ControlIcon::Count,
            OptionalTooltip::FromTitled("Study Asset", "Switch built-in High/Low geometry study pair.")))
    {
        StudyDropdownOpen  = !StudyDropdownOpen;
        LayoutDropdownOpen = false;
        QuickOverlayOpen   = false;
    }
    CurX += StudyW + 8.0f;

    // 2. View Layout Selector
    const char* LayoutLabel = QueryLayoutLabel(Session->ViewportLayout);
    const float LayoutW     = std::min(148.0f, WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Medium, 10.5f, LayoutLabel) + 42.0f);
    if (ConstructDropdownBarRow(
            Surface,
            CurX,
            BtnY,
            LayoutW,
            {},
            LayoutLabel,
            LayoutDropdownOpen,
            Theme,
            Ptr,
            LastLayoutAnchor,
            ControlIcon::Count,
            OptionalTooltip::FromTitled("Bake Viewport View", "Switch 3D Mesh Only, 2D Map Only, or 3D + 2D Split.")))
    {
        LayoutDropdownOpen = !LayoutDropdownOpen;
        StudyDropdownOpen  = false;
        QuickOverlayOpen   = false;
    }
    CurX += LayoutW + 8.0f;

    // 3. Low Mesh / High Mesh import buttons
    const float LowBtnW = 92.0f;
    if (CurX + LowBtnW < ToolbarBounds.Right() - 320.0f)
    {
        if (ConstructCapsuleButtonControl(
                Surface,
                { CurX, BtnY, LowBtnW, BtnH },
                "Low Mesh",
                Theme,
                Cursor,
                !OverlayUp && Pressed,
                !Session->CustomLowAssetLabel.empty(),
                false,
                ControlIcon::UploadImport,
                10.0f,
                15.0f,
                OptionalTooltip::FromTitled("Import Low Mesh", "Load custom low-poly .OBJ / .STL target asset.")))
        {
            Session->CustomLowAssetLabel = "Custom_Low.obj";
        }
        CurX += LowBtnW + 8.0f;
    }

    const float HighBtnW = 94.0f;
    if (CurX + HighBtnW < ToolbarBounds.Right() - 280.0f)
    {
        if (ConstructCapsuleButtonControl(
                Surface,
                { CurX, BtnY, HighBtnW, BtnH },
                "High Mesh",
                Theme,
                Cursor,
                !OverlayUp && Pressed,
                !Session->CustomHighAssetLabel.empty(),
                false,
                ControlIcon::UploadImport,
                10.0f,
                15.0f,
                OptionalTooltip::FromTitled("Import High Mesh", "Load custom high-poly .OBJ / .STL detail source.")))
        {
            Session->CustomHighAssetLabel = "Custom_High.obj";
        }
        CurX += HighBtnW + 8.0f;
    }

    // Right-side primary buttons (Bake Selected Maps + Send to Paint)
    const float       BakeW = 148.0f;
    const Rectangle2D BakeRect{ ToolbarBounds.Right() - 12.0f - BakeW, BtnY, BakeW, BtnH };
    if (ConstructCapsuleButtonControl(
            Surface,
            BakeRect,
            "Bake Selected Maps",
            Theme,
            Cursor,
            !OverlayUp && Pressed,
            false,
            true,
            ControlIcon::BakeBox,
            10.0f,
            15.0f,
            OptionalTooltip::FromTitled("Bake Selected Maps", "Execute GPU high-to-low surface and volume SDF bake.")))
    {
        Session->ExecuteBakeSimulation();
    }

    const float       SendW = 114.0f;
    const Rectangle2D SendRect{ BakeRect.X - 8.0f - SendW, BtnY, SendW, BtnH };
    if (SendRect.X > CurX + 10.0f)
    {
        if (ConstructCapsuleButtonControl(
                Surface,
                SendRect,
                "Send to Paint",
                Theme,
                Cursor,
                !OverlayUp && Pressed,
                Session->BridgedToPaint,
                false,
                ControlIcon::BrushTool,
                10.0f,
                15.0f,
                OptionalTooltip::FromTitled("Send to Paint", "Transfer baked AO, Curvature and Normals into Texture Paint.")))
        {
            Session->SendBakedTargetsToPaint();
        }
    }

    // GPU Ready indicator chip
    const float GpuChipW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Medium, 9.5f, Session->DeviceIndicatorText) + 28.0f;
    if (CurX + GpuChipW + 8.0f <= SendRect.X)
    {
        const Rectangle2D GpuRect{ CurX, BtnY + 3.0f, GpuChipW, 24.0f };
        Surface.FillRectangle(GpuRect, Theme.WellSurface, 12.0f);
        Surface.StrokeRectangle(GpuRect, Theme.BorderSubtle, 12.0f, 1.0f);
        Surface.FillCircle({ GpuRect.X + 11.0f, GpuRect.Y + 12.0f }, 3.5f, Theme.ReadyGreen);
        WorkspaceAppearance::ConstructTruncatedText(
            Surface,
            FontWeightClass::Medium,
            { GpuRect.X + 19.0f, GpuRect.Y + 6.0f },
            GpuRect.Width - 24.0f,
            9.5f,
            Theme.TextPrimary,
            Session->DeviceIndicatorText);
    }

    // Stage canvas below toolbar
    LastCanvasBounds = {
        Bounds.X,
        ToolbarBounds.Bottom(),
        Bounds.Width,
        std::max(1.0f, Bounds.Bottom() - ToolbarBounds.Bottom()),
    };
    Surface.PushClip(LastCanvasBounds);
    Surface.FillRectangle(LastCanvasBounds, ColorRgba{ 11u, 11u, 11u, 255u }, 0.0f);

    const BakerTargetDescriptor& InspectedDesc = BakingWorkspaceSession::QueryTargetDescriptor(Session->InspectedTarget);

    if (Session->ViewportLayout == BakerViewportLayout::ThreeDOnly)
    {
        const Rectangle2D Tag3D{ LastCanvasBounds.X + 14.0f, LastCanvasBounds.Y + 14.0f, 174.0f, 22.0f };
        Surface.FillRectangle(Tag3D, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(Tag3D, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(Tag3D, 9.0f, Theme.TextPrimary, "3D LOW-POLY + BAKED MAP");

        char StatusLine[128];
        std::snprintf(
            StatusLine,
            sizeof(StatusLine),
            "%s · Inspecting: %s",
            ActiveStudy.Label,
            InspectedDesc.Label);
        Surface.TextCentered(
            { LastCanvasBounds.X + 20.0f, LastCanvasBounds.Y + LastCanvasBounds.Height * 0.46f, LastCanvasBounds.Width - 40.0f, 24.0f },
            11.5f,
            Theme.TextMuted,
            StatusLine);
    }
    else if (Session->ViewportLayout == BakerViewportLayout::TwoDOnly)
    {
        char TagBuf[96];
        std::snprintf(TagBuf, sizeof(TagBuf), "INSPECTING: %s", InspectedDesc.Label);
        const float TagW = std::min(
            LastCanvasBounds.Width - 28.0f,
            WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::SemiBold, 9.0f, TagBuf) + 22.0f);
        const Rectangle2D Tag2D{ LastCanvasBounds.X + 14.0f, LastCanvasBounds.Y + 14.0f, TagW, 22.0f };
        Surface.FillRectangle(Tag2D, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(Tag2D, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(Tag2D, 9.0f, Theme.TextPrimary, TagBuf);

        RenderInspectedTwoDPreview(Surface, LastCanvasBounds);
    }
    else
    {
        const float       HalfW = LastCanvasBounds.Width * 0.5f;
        const Rectangle2D LeftPane { LastCanvasBounds.X, LastCanvasBounds.Y, HalfW, LastCanvasBounds.Height };
        const Rectangle2D RightPane{ LastCanvasBounds.X + HalfW, LastCanvasBounds.Y, LastCanvasBounds.Width - HalfW, LastCanvasBounds.Height };

        Surface.StrokeLine({ LeftPane.Right(), LeftPane.Y }, { LeftPane.Right(), LeftPane.Bottom() }, Theme.BorderSubtle, 1.0f);

        const Rectangle2D Tag3D{ LeftPane.X + 14.0f, LeftPane.Y + 14.0f, 174.0f, 22.0f };
        Surface.FillRectangle(Tag3D, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(Tag3D, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(Tag3D, 9.0f, Theme.TextPrimary, "3D LOW-POLY + BAKED MAP");

        Surface.TextCentered(LeftPane, 11.0f, Theme.TextMuted, ActiveStudy.Label);

        char TagBuf[96];
        std::snprintf(TagBuf, sizeof(TagBuf), "INSPECTING: %s", InspectedDesc.Label);
        const float TagW = std::min(
            RightPane.Width - 28.0f,
            WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::SemiBold, 9.0f, TagBuf) + 22.0f);
        const Rectangle2D Tag2D{ RightPane.X + 14.0f, RightPane.Y + 14.0f, TagW, 22.0f };
        Surface.FillRectangle(Tag2D, ColorRgba{ 22u, 24u, 28u, 225u }, 11.0f);
        Surface.StrokeRectangle(Tag2D, Theme.BorderSubtle, 11.0f, 1.0f);
        Surface.TextCentered(Tag2D, 9.0f, Theme.TextPrimary, TagBuf);

        RenderInspectedTwoDPreview(Surface, RightPane);
    }

    // Bottom HUD instruction chip
    const char* HudCaption = "Click any map on the left to inspect · Volume SDF exports binary/JSON .fvol + live slices";
    const float HudW = std::min(
        LastCanvasBounds.Width - 28.0f,
        WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 9.5f, HudCaption) + 28.0f);
    const Rectangle2D HudRect{ LastCanvasBounds.X + (LastCanvasBounds.Width - HudW) * 0.5f, LastCanvasBounds.Bottom() - 36.0f, HudW, 24.0f };
    Surface.FillRectangle(HudRect, ColorRgba{ 20u, 22u, 27u, 225u }, 12.0f);
    Surface.StrokeRectangle(HudRect, Theme.BorderSubtle, 12.0f, 1.0f);
    Surface.TextCentered(HudRect, 9.5f, Theme.TextMuted, HudCaption);

    // Quick overlay interactions (Right-click or Q inside canvas)
    if (PointInsideRect(LastCanvasBounds, Cursor))
    {
        if (Input.SecondaryPressed)
        {
            QuickOverlayAnchor = Cursor;
            SetQuickOverlayOpen(true);
        }
        else if (ImGui::GetCurrentContext() != nullptr && ImGui::IsKeyPressed(ImGuiKey_Q, false))
        {
            QuickOverlayAnchor = Cursor;
            SetQuickOverlayOpen(!QuickOverlayOpen);
        }
    }
    if (QuickOverlayOpen && Input.EscapePressed)
    {
        CloseAllOverlays();
    }

    Surface.PopClip();

    // Render top-level overlays (dropdown sheets + Quick Bake Menu) inside this pane's surface
    RenderTopLevelOverlays(Surface, Bounds, Input);

    Surface.PopClip();
}

void BakingViewportPane::RenderTopLevelOverlays(
    PixelSpace&             Surface,
    Rectangle2D             WorkspaceBounds,
    const PaneInputReading& Input) noexcept
{
    if (Session == nullptr || !QueryAnyOverlayOpen())
    {
        return;
    }

    const TexturingThemeColors Theme   = QueryTexturingThemeColors();
    const Point2D              Cursor  { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed = Input.PrimaryPointer.Pressed;

    if (StudyDropdownOpen)
    {
        const auto& Studies = BakingWorkspaceSession::QueryStudyRegistry();
        std::array<const char*, 5u> Labels{};
        for (std::size_t I = 0u; I < Studies.size(); ++I)
        {
            Labels[I] = Studies[I].Label;
        }
        const uint32_t ActiveIdx = static_cast<uint32_t>(Session->Study);
        RenderFittedDropdownSheet(
            Surface,
            LastStudyAnchor,
            WorkspaceBounds,
            Labels.data(),
            static_cast<uint32_t>(Labels.size()),
            ActiveIdx,
            StudyDropdownOpen,
            Input,
            [this, &Studies](uint32_t Picked)
            {
                if (Picked < Studies.size())
                {
                    Session->SelectStudy(Studies[Picked].Study);
                }
            },
            &SheetScrollY);
    }

    if (LayoutDropdownOpen)
    {
        static constexpr const char* LayoutLabels[3] { "3D Mesh Only", "2D Map Only", "3D + 2D Split" };
        const uint32_t ActiveIdx = static_cast<uint32_t>(Session->ViewportLayout);
        RenderFittedDropdownSheet(
            Surface,
            LastLayoutAnchor,
            WorkspaceBounds,
            LayoutLabels,
            3u,
            ActiveIdx,
            LayoutDropdownOpen,
            Input,
            [this](uint32_t Picked)
            {
                if (Picked < 3u)
                {
                    Session->ViewportLayout = static_cast<BakerViewportLayout>(Picked);
                }
            },
            &SheetScrollY);
    }

    if (QuickOverlayOpen)
    {
        constexpr float BoxW = 318.0f;
        constexpr float BoxH = 114.0f;
        const float X = std::clamp(QuickOverlayAnchor.X - BoxW * 0.5f, WorkspaceBounds.X + 12.0f, WorkspaceBounds.Right() - BoxW - 12.0f);
        const float Y = std::clamp(QuickOverlayAnchor.Y - BoxH * 0.5f, WorkspaceBounds.Y + 12.0f, WorkspaceBounds.Bottom() - BoxH - 12.0f);
        const Rectangle2D BoxRect{ X, Y, BoxW, BoxH };

        Surface.FillRectangle(BoxRect, Theme.NestedSurface, 12.0f);
        Surface.StrokeRectangle(BoxRect, Theme.BorderStrong, 12.0f, 1.0f);

        WorkspaceAppearance::ConstructTruncatedText(Surface, FontWeightClass::SemiBold, { X + 14.0f, Y + 10.0f }, 160.0f, 10.5f, Theme.TextPrimary, "Baking Quick Menu");
        WorkspaceAppearance::ConstructRightAlignedText(Surface, FontWeightClass::Regular, { X + BoxW - 12.0f, Y + 11.0f }, 9.0f, Theme.TextMuted, "Right-Click / Q / Esc");
        Surface.StrokeLine({ X + 12.0f, Y + 30.0f }, { X + BoxW - 12.0f, Y + 30.0f }, Theme.BorderSubtle, 1.0f);

        const std::array<uint32_t, 4u>    ResChoices {{ 256u, 512u, 1024u, 2048u }};
        const std::array<const char*, 4u> ResLabels  {{ "256px", "512px", "1024px", "2048px" }};
        const float ChipW = (BoxW - 24.0f - 18.0f) * 0.25f;
        for (std::size_t I = 0u; I < ResChoices.size(); ++I)
        {
            const Rectangle2D ChipRect{ X + 12.0f + static_cast<float>(I) * (ChipW + 6.0f), Y + 38.0f, ChipW, 24.0f };
            if (ConstructCapsuleButtonControl(
                    Surface,
                    ChipRect,
                    ResLabels[I],
                    Theme,
                    Cursor,
                    Pressed,
                    Session->TargetResolutionPx == ResChoices[I],
                    false,
                    ControlIcon::Count,
                    9.5f,
                    12.0f))
            {
                Session->AssignResolution(ResChoices[I]);
            }
        }

        const Rectangle2D QuickBakeRect{ X + 12.0f, Y + 72.0f, 168.0f, 28.0f };
        if (ConstructCapsuleButtonControl(Surface, QuickBakeRect, "Bake Selected Maps", Theme, Cursor, Pressed, false, true, ControlIcon::BakeBox, 10.0f, 14.0f))
        {
            Session->ExecuteBakeSimulation();
            QuickOverlayOpen = false;
        }
        const Rectangle2D QuickSendRect{ QuickBakeRect.Right() + 8.0f, Y + 72.0f, BoxW - 24.0f - 176.0f, 28.0f };
        if (ConstructCapsuleButtonControl(Surface, QuickSendRect, "Send to Paint", Theme, Cursor, Pressed, Session->BridgedToPaint, false, ControlIcon::BrushTool, 10.0f, 14.0f))
        {
            Session->SendBakedTargetsToPaint();
            QuickOverlayOpen = false;
        }

        if (Pressed && !PointInsideRect(BoxRect, Cursor))
        {
            QuickOverlayOpen = false;
        }
    }
}

} // namespace Frontier::Workspaces
