/*============================================================================================================================================
                                                          MATERIALSURFACEPANE.CPP
============================================================================================================================================*/
// 🧩 Implementation of MaterialSurfacePane matching HTML Shader Preview UI chrome without any embedded 3D viewport

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Texturing/MaterialSurfacePane.h"

#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/Controls/ControlTooltip.h"
#include "Engine/Workspaces/Texturing/TexturingPaneAppearance.h"

#include <imgui.h>

#include <algorithm>
#include <cstdio>

namespace Frontier::Workspaces
{

namespace
{

[[nodiscard]] ColorRgba ResolveBackdropCanvasColor(LightingBackdropStyle Backdrop, bool LightTheme) noexcept
{
    if (LightTheme)
    {
        switch (Backdrop)
        {
            case LightingBackdropStyle::ObsidianDark: return ColorRgba{ 28u, 30u, 35u, 255u };
            case LightingBackdropStyle::WarmGallery:  return ColorRgba{ 238u, 232u, 224u, 255u };
            case LightingBackdropStyle::NeutralSlate: return ColorRgba{ 222u, 226u, 233u, 255u };
            case LightingBackdropStyle::DaylightWhite:return ColorRgba{ 246u, 247u, 249u, 255u };
            case LightingBackdropStyle::StudioSoftbox:
            default:                                  return ColorRgba{ 232u, 234u, 238u, 255u };
        }
    }
    switch (Backdrop)
    {
        case LightingBackdropStyle::ObsidianDark:  return ColorRgba{ 12u, 13u, 16u, 255u };
        case LightingBackdropStyle::WarmGallery:   return ColorRgba{ 29u, 25u, 23u, 255u };
        case LightingBackdropStyle::NeutralSlate:  return ColorRgba{ 24u, 27u, 33u, 255u };
        case LightingBackdropStyle::DaylightWhite: return ColorRgba{ 228u, 231u, 236u, 255u };
        case LightingBackdropStyle::StudioSoftbox:
        default:                                   return ColorRgba{ 20u, 21u, 24u, 255u };
    }
}

[[nodiscard]] bool VerifyLightBackdrop(LightingBackdropStyle Backdrop, bool LightTheme) noexcept
{
    if (Backdrop == LightingBackdropStyle::DaylightWhite)
    {
        return true;
    }
    if (LightTheme && Backdrop != LightingBackdropStyle::ObsidianDark)
    {
        return true;
    }
    return false;
}

} // namespace

MaterialSurfacePane::~MaterialSurfacePane() noexcept
{
    WorkspaceAppearance::ReleasePanePointerOwnership(this);
}

void MaterialSurfacePane::AttachSession(MaterialWorkspaceSession* TargetSession) noexcept
{
    Session              = TargetSession;
    ShapeDropdownOpen    = false;
    BackdropDropdownOpen = false;
}

void MaterialSurfacePane::Render(
    PixelSpace&             Surface,
    Rectangle2D             Bounds,
    const PaneInputReading& Input,
    double                  DeltaSeconds)
{
    (void)DeltaSeconds;
    if (Session == nullptr || Bounds.Width < 40.0f || Bounds.Height < 40.0f)
    {
        return;
    }

    using namespace TexturingAppearance;
    const TexturingThemeColors Theme        = QueryTexturingThemeColors();
    const ColorRgba            CanvasBg     = ResolveBackdropCanvasColor(Session->BackdropStyle, Theme.LightSurface);
    const bool                 BrightBg     = VerifyLightBackdrop(Session->BackdropStyle, Theme.LightSurface);
    const ColorRgba            HeroPrimary  = BrightBg ? ColorRgba{ 22u, 24u, 28u, 255u } : ColorRgba{ 242u, 243u, 246u, 255u };
    const ColorRgba            HeroMuted    = BrightBg ? ColorRgba{ 88u, 92u, 102u, 255u } : ColorRgba{ 165u, 169u, 179u, 255u };
    const ColorRgba            HeroKicker   = BrightBg ? ColorRgba{ 95u, 100u, 110u, 255u } : ColorRgba{ 156u, 160u, 170u, 255u };
    const Point2D              Cursor       { Input.PrimaryPointer.X, Input.PrimaryPointer.Y };
    const bool                 Pressed      = Input.PrimaryPointer.Pressed;

    Surface.PushClip(Bounds);
    Surface.FillRectangle(Bounds, CanvasBg, 0.0f);

    // Top-left hero collection kicker + large display material title + subtitle
    const float MarginX = Bounds.X + 26.0f;
    const float MarginY = Bounds.Y + 24.0f;
    const float TitleMaxW = std::max(140.0f, Bounds.Width - 200.0f);

    WorkspaceAppearance::ConstructTruncatedText(
        Surface,
        FontWeightClass::Medium,
        { MarginX, MarginY },
        TitleMaxW,
        9.5f,
        HeroKicker,
        Session->CollectionKicker);
    WorkspaceAppearance::ConstructTruncatedText(
        Surface,
        FontWeightClass::Regular,
        { MarginX, MarginY + 20.0f },
        TitleMaxW,
        24.0f,
        HeroPrimary,
        Session->MaterialTitle);
    WorkspaceAppearance::ConstructTruncatedText(
        Surface,
        FontWeightClass::Regular,
        { MarginX, MarginY + 54.0f },
        TitleMaxW,
        10.5f,
        HeroMuted,
        Session->MaterialSubtitle);

    // Top-right Fullscreen capsule button
    const Rectangle2D FullscreenBtn{ Bounds.Right() - 122.0f, Bounds.Y + 20.0f, 96.0f, 28.0f };
    if (ConstructCapsuleButtonControl(
            Surface,
            FullscreenBtn,
            Session->FullscreenSurface ? "Exit Full" : "Fullscreen",
            Theme,
            Cursor,
            Pressed,
            Session->FullscreenSurface,
            false,
            Session->FullscreenSurface ? ControlIcon::LayoutSplit : ControlIcon::ExternalOpen,
            10.0f,
            14.0f,
            OptionalTooltip::FromTitled("Toggle Focus Surface", "Expand or restore the shader preview canvas area.")))
    {
        Session->FullscreenSurface = !Session->FullscreenSurface;
    }

    // Bottom-left overlay Zoom bar [- 62% +] + Reset view
    const float       BottomY  = Bounds.Bottom() - 48.0f;
    const Rectangle2D ZoomBar  { Bounds.X + 22.0f, BottomY, 92.0f, 28.0f };
    Surface.FillRectangle(ZoomBar, Theme.WellSurface, 14.0f);
    Surface.StrokeRectangle(ZoomBar, Theme.BorderSubtle, 14.0f, 1.0f);

    const Rectangle2D ZoomOutBtn{ ZoomBar.X + 2.0f, ZoomBar.Y + 2.0f, 24.0f, 24.0f };
    const Rectangle2D ZoomInBtn { ZoomBar.Right() - 26.0f, ZoomBar.Y + 2.0f, 24.0f, 24.0f };

    const bool ZoomOutHover = ZoomOutBtn.Contains(Cursor);
    const bool ZoomInHover  = ZoomInBtn.Contains(Cursor);
    if (ZoomOutHover)
    {
        Surface.FillRectangle(ZoomOutBtn, Theme.HoverSurface, 12.0f);
    }
    if (ZoomInHover)
    {
        Surface.FillRectangle(ZoomInBtn, Theme.HoverSurface, 12.0f);
    }
    WorkspaceAppearance::ConstructWeightedText(
        Surface, FontWeightClass::Medium, { ZoomOutBtn.X + 9.0f, ZoomOutBtn.Y + 6.0f }, 11.0f, ZoomOutHover ? Theme.TextPrimary : Theme.TextMuted, "-");
    char ZoomLabel[16] {};
    std::snprintf(ZoomLabel, sizeof(ZoomLabel), "%u%%", Session->ZoomScalePercent);
    const float ZoomTextW = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 10.5f, ZoomLabel);
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { ZoomBar.X + (ZoomBar.Width - ZoomTextW) * 0.5f, ZoomBar.Y + 7.5f },
        10.5f,
        Theme.TextPrimary,
        ZoomLabel);
    WorkspaceAppearance::ConstructWeightedText(
        Surface, FontWeightClass::Medium, { ZoomInBtn.X + 8.0f, ZoomInBtn.Y + 6.0f }, 11.0f, ZoomInHover ? Theme.TextPrimary : Theme.TextMuted, "+");

    if (Pressed && ZoomOutHover)
    {
        Session->ZoomScalePercent = static_cast<uint32_t>(std::max<int32_t>(15, static_cast<int32_t>(Session->ZoomScalePercent) - 8));
    }
    if (Pressed && ZoomInHover)
    {
        Session->ZoomScalePercent = static_cast<uint32_t>(std::min<int32_t>(250, static_cast<int32_t>(Session->ZoomScalePercent) + 8));
    }

    const Rectangle2D ResetBtn{ ZoomBar.Right() + 10.0f, BottomY, 76.0f, 28.0f };
    const bool ResetHover = ResetBtn.Contains(Cursor);
    if (ResetHover)
    {
        Surface.FillRectangle(ResetBtn, Theme.HoverSurface, 14.0f);
    }
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { ResetBtn.X + 10.0f, ResetBtn.Y + 7.5f },
        10.5f,
        ResetHover ? HeroPrimary : HeroMuted,
        "Reset view");
    if (Pressed && ResetHover)
    {
        Session->ResetViewControls();
    }

    // Bottom-right Geometry + Studio Lighting Backdrop dropdown triggers
    const auto& ShapeLabels    = MaterialWorkspaceSession::InspectPreviewShapeLabels();
    const auto& BackdropLabels = MaterialWorkspaceSession::InspectBackdropLabels();
    const uint32_t ShapeIdx    = static_cast<uint32_t>(Session->PreviewShape) % 5u;
    const uint32_t BackdropIdx = static_cast<uint32_t>(Session->BackdropStyle) % 5u;

    const float BackdropW = 134.0f;
    const float ShapeW    = 118.0f;
    const float BackdropX = Bounds.Right() - 22.0f - BackdropW;
    const float ShapeX    = BackdropX - 8.0f - ShapeW;

    Rectangle2D ShapeBtn {};
    Rectangle2D BackdropBtn {};
    if (ConstructDropdownBarRow(
            Surface, ShapeX, BottomY, ShapeW, "", ShapeLabels[ShapeIdx], ShapeDropdownOpen, Theme, Input.PrimaryPointer, ShapeBtn))
    {
        ShapeDropdownOpen    = !ShapeDropdownOpen;
        BackdropDropdownOpen = false;
    }
    if (ConstructDropdownBarRow(
            Surface, BackdropX, BottomY, BackdropW, "", BackdropLabels[BackdropIdx], BackdropDropdownOpen, Theme, Input.PrimaryPointer, BackdropBtn))
    {
        BackdropDropdownOpen = !BackdropDropdownOpen;
        ShapeDropdownOpen    = false;
    }

    // Center subtle placeholder notice confirming zero-viewport UI chrome parity
    const char* CanvasNote = "Material Shader Preview Canvas Chrome (Viewport Deferred)";
    const float NoteW      = WorkspaceAppearance::MeasureWeightedTextWidth(Surface, FontWeightClass::Regular, 10.0f, CanvasNote);
    WorkspaceAppearance::ConstructWeightedText(
        Surface,
        FontWeightClass::Regular,
        { Bounds.X + (Bounds.Width - NoteW) * 0.5f, Bounds.Y + Bounds.Height * 0.50f },
        10.0f,
        BrightBg ? ColorRgba{ 120u, 126u, 138u, 140u } : ColorRgba{ 160u, 166u, 178u, 90u },
        CanvasNote);

    RenderFittedDropdownSheet(
        Surface,
        ShapeBtn,
        Bounds,
        ShapeLabels.data(),
        static_cast<uint32_t>(ShapeLabels.size()),
        ShapeIdx,
        ShapeDropdownOpen,
        Input,
        [this](uint32_t Chosen)
        {
            Session->PreviewShape = static_cast<PreviewTargetShape>(Chosen % 5u);
            ++Session->RevisionCounter;
        });

    RenderFittedDropdownSheet(
        Surface,
        BackdropBtn,
        Bounds,
        BackdropLabels.data(),
        static_cast<uint32_t>(BackdropLabels.size()),
        BackdropIdx,
        BackdropDropdownOpen,
        Input,
        [this](uint32_t Chosen)
        {
            Session->BackdropStyle = static_cast<LightingBackdropStyle>(Chosen % 5u);
            ++Session->RevisionCounter;
        });

    Surface.PopClip();
    (void)ControlTooltip::PresentHoveredControlTooltip(
        Surface, { 0.0f, 0.0f, Bounds.Width, Bounds.Height }, Input.PrimaryPointer);
}

void MaterialSurfacePane::PresentInImGuiPane(double DeltaSeconds, float ScaleFactor)
{
    const float  SafeScale = std::max(0.25f, ScaleFactor);
    const ImVec2 WinPos    = ImGui::GetWindowPos();
    const ImVec2 WinSize   = ImGui::GetWindowSize();
    const ImVec2 CursorPos = ImGui::GetCursorScreenPos();
    const float  TopY      = CursorPos.y - ImGui::GetStyle().WindowPadding.y;
    const float  PaneH     = std::max(1.0f, (WinPos.y + WinSize.y) - TopY);

    ImGui::InvisibleButton(
        "##MaterialSurfacePaneCanvas",
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
