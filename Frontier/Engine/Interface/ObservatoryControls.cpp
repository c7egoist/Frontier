/*==========================================================================================================================================
                                                       OBSERVATORYCONTROLS.CPP
==========================================================================================================================================*/
// 🧩 The demo's observatory Inspector pages drawn with ImGui. Metrics are the narrow-column cascade (the Inspector column is
//    below the stylesheets' 520 px container breakpoint); text sizes are CSS em sizes converted to ImGui pixel heights.

#include "Engine/Interface/ObservatoryControls.h"

#include "Engine/Interface/InspectorControls.h"

#include <imgui_internal.h>

#include <algorithm>
#include <cfloat>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace Frontier
{

namespace
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    TYPE METRICS
//------------------------------------------------------------------------------------------------------------------------

// 📝 stb_truetype sizes a face by (ascent − descent); CSS sizes it by the em. DM Sans: hhea 992 / −310 over 1000 units.
constexpr float EmPixelHeight = 1.302f;   // [-] ImGui pixel height per CSS em
constexpr float EmAscent      = 0.992f;   // [-] baseline depth below the content-area top, per em
constexpr float PiSingle      = 3.14159265358979f;

[[nodiscard]] ImFont* ResolveFace(ImFont* Face) noexcept
{
    return Face != nullptr ? Face : ImGui::GetFont();
}

// 📝 The baseline of a CSS line box: content area (1.302 em) centred in LineHeight × Size, ascent below its top.
[[nodiscard]] float ResolveBaseline(float Top, float Size, float LineHeight) noexcept
{
    return Top + 0.5f * (LineHeight * Size - EmPixelHeight * Size) + EmAscent * Size;
}

[[nodiscard]] ImU32 FadeColour(ImU32 Colour, float Fade) noexcept
{
    const float Alpha = static_cast<float>((Colour >> IM_COL32_A_SHIFT) & 0xFF) * std::clamp(Fade, 0.0f, 1.0f);
    return (Colour & ~IM_COL32_A_MASK) | (static_cast<ImU32>(Alpha + 0.5f) << IM_COL32_A_SHIFT);
}

[[nodiscard]] ImU32 ResolveAlpha(ImU32 Rgb, float Alpha) noexcept
{
    return (Rgb & ~IM_COL32_A_MASK) | (static_cast<ImU32>(std::clamp(Alpha, 0.0f, 1.0f) * 255.0f + 0.5f) << IM_COL32_A_SHIFT);
}

// 📝 The digits SliderControl.js shows: the larger decimal count of Minimum and Step (SliderDigits).
[[nodiscard]] int ResolveSliderDigits(float Minimum, float Step) noexcept
{
    auto Places = [](float Quantity) {
        char Text[48]{};
        std::snprintf(Text, sizeof(Text), "%.6f", static_cast<double>(std::fabs(Quantity)));
        int Count = 0;
        const char* Point = std::strchr(Text, '.');
        if (Point == nullptr) return 0;
        int Last = 0;
        for (int Index = 1; Point[Index] != '\0'; ++Index)
        {
            if (Point[Index] != '0') Last = Index;
        }
        Count = Last;
        return Count;
    };
    return std::min(10, std::max(Places(Minimum), Places(Step)));
}

// 📝 SnapSlider: clamp onto Minimum + k·Step.
[[nodiscard]] float SnapSliderSetting(float Quantity, float Minimum, float Maximum, float Step) noexcept
{
    if (Step <= 0.0f) return std::clamp(Quantity, Minimum, Maximum);
    const float Snapped = Minimum + std::round((Quantity - Minimum) / Step) * Step;
    return std::clamp(Snapped, Minimum, Maximum);
}

void ConstructTooltipText(const char* Tooltip)
{
    if (Tooltip != nullptr && Tooltip[0] != '\0' && ImGui::IsItemHovered(ImGuiHoveredFlags_AllowWhenDisabled | ImGuiHoveredFlags_DelayShort))
    {
        ImGui::SetTooltip("%s", Tooltip);
    }
}

// 📝 A triangle fan from Centre (CentreColour) to an ellipse ring (RimColour): CSS radial gradients' linear stops.
void ConstructRadialFan(ImDrawList* DrawList, ImVec2 Centre, ImVec2 Radius, ImU32 CentreColour, ImU32 RimColour, int Segments = 48)
{
    if (Radius.x <= 0.5f || Radius.y <= 0.5f) return;
    const ImVec2 WhiteUv = DrawList->_Data->TexUvWhitePixel;
    DrawList->PrimReserve(Segments * 3, Segments + 1);
    const ImDrawIdx Base = static_cast<ImDrawIdx>(DrawList->_VtxCurrentIdx);
    DrawList->PrimWriteVtx(Centre, WhiteUv, CentreColour);
    for (int Segment = 0; Segment < Segments; ++Segment)
    {
        const float Angle = 2.0f * PiSingle * static_cast<float>(Segment) / static_cast<float>(Segments);
        DrawList->PrimWriteVtx(ImVec2(Centre.x + std::cos(Angle) * Radius.x, Centre.y + std::sin(Angle) * Radius.y), WhiteUv, RimColour);
    }
    for (int Segment = 0; Segment < Segments; ++Segment)
    {
        DrawList->PrimWriteIdx(Base);
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Base + 1 + Segment));
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Base + 1 + (Segment + 1) % Segments));
    }
}

void ConstructDashedSegment(ImDrawList* DrawList, ImVec2 From, ImVec2 To, ImU32 Colour, float Width, float DashOn, float DashOff)
{
    const ImVec2 Span(To.x - From.x, To.y - From.y);
    const float  Length = std::sqrt(Span.x * Span.x + Span.y * Span.y);
    if (Length <= 0.0f) return;
    if (DashOn <= 0.0f || DashOff <= 0.0f)
    {
        DrawList->AddLine(From, To, Colour, Width);
        return;
    }
    const ImVec2 Unit(Span.x / Length, Span.y / Length);
    for (float Offset = 0.0f; Offset < Length; Offset += DashOn + DashOff)
    {
        const float End = std::min(Length, Offset + DashOn);
        DrawList->AddLine(ImVec2(From.x + Unit.x * Offset, From.y + Unit.y * Offset), ImVec2(From.x + Unit.x * End, From.y + Unit.y * End), Colour,
                          Width);
    }
}

// 📝 A glyph run on a CSS baseline; code points the face lacks (↗, λ, ≈) fall back to the monospace face.
float ConstructGlyphRunOn(ImDrawList* DrawList, const EditorTypefaces* Faces, ImFont* Face, float Size, ImVec2 Baseline, ImU32 Colour, const char* Text,
                          float Tracking, bool Measure)
{
    if (Text == nullptr || Text[0] == '\0') return 0.0f;
    ImFont*     Primary     = ResolveFace(Face);
    ImFont*     Fallback    = ResolveFace(Faces != nullptr ? Faces->Monospace : nullptr);
    const float PixelHeight = EmPixelHeight * Size;
    const char* Glyph       = Text;
    const char* End         = Text + std::strlen(Text);
    float       Pen         = 0.0f;
    auto        FaceOf      = [&](unsigned int Codepoint) {
        return (Codepoint < 0x80u || Primary->IsGlyphInFont(static_cast<ImWchar>(Codepoint))) ? Primary : Fallback;
    };
    while (Glyph < End)
    {
        unsigned int Codepoint = 0;
        const int    Length    = ImTextCharFromUtf8(&Codepoint, Glyph, End);
        if (Length <= 0) break;
        ImFont*     RunFace = FaceOf(Codepoint);
        const char* RunEnd  = Glyph + Length;
        // 📝 Untracked runs of one face go out together, so the face's own spacing holds across the run.
        while (Tracking == 0.0f && RunEnd < End)
        {
            unsigned int Next      = 0;
            const int    NextBytes = ImTextCharFromUtf8(&Next, RunEnd, End);
            if (NextBytes <= 0 || FaceOf(Next) != RunFace) break;
            RunEnd += NextBytes;
        }
        if (!Measure && DrawList != nullptr)
        {
            ImFontBaked* Baked = RunFace == Primary ? nullptr : RunFace->GetFontBaked(PixelHeight);
            const float  Top   = Baseline.y - (Baked != nullptr ? Baked->Ascent : EmAscent * Size);
            DrawList->AddText(RunFace, PixelHeight, ImVec2(Baseline.x + Pen, Top), Colour, Glyph, RunEnd);
        }
        Pen += RunFace->CalcTextSizeA(PixelHeight, FLT_MAX, 0.0f, Glyph, RunEnd).x + Tracking;
        Glyph = RunEnd;
    }
    return Pen;
}

// 📝 Lucide strokes in a 24-unit box at Min with Extent pixels, stroke-width 1.6 (ConstructGlyph's default).
void ConstructTileGlyph(ImDrawList* DrawList, ObservatoryGlyph Glyph, ImVec2 Min, float Extent, ImU32 Colour)
{
    const float  Unit   = Extent / 24.0f;
    const float  Stroke = 1.6f * Unit;
    auto         At     = [&](float X, float Y) { return ImVec2(Min.x + X * Unit, Min.y + Y * Unit); };
    switch (Glyph)
    {
    case ObservatoryGlyph::Sun:
    {
        DrawList->AddCircle(At(12.0f, 12.0f), 4.0f * Unit, Colour, 24, Stroke);
        const float Rays[8][4] = {{12, 2, 12, 4},         {12, 20, 12, 22},       {4.93f, 4.93f, 6.34f, 6.34f}, {17.66f, 17.66f, 19.07f, 19.07f},
                                  {2, 12, 4, 12},         {20, 12, 22, 12},       {6.34f, 17.66f, 4.93f, 19.07f}, {19.07f, 4.93f, 17.66f, 6.34f}};
        for (const auto& Ray : Rays) DrawList->AddLine(At(Ray[0], Ray[1]), At(Ray[2], Ray[3]), Colour, Stroke);
        break;
    }
    case ObservatoryGlyph::Orbit:
    {
        // 📝 M19.1 4.9 A10 10 0 1 1 9.4 2.3: a 300° arc about the centre, then the two satellites and the hub.
        DrawList->PathArcTo(At(12.0f, 12.0f), 10.0f * Unit, -0.25f * PiSingle, 1.4167f * PiSingle, 40);
        DrawList->PathStroke(Colour, ImDrawFlags_None, Stroke);
        DrawList->AddCircle(At(19.0f, 5.0f), 2.0f * Unit, Colour, 16, Stroke);
        DrawList->AddCircle(At(5.0f, 19.0f), 2.0f * Unit, Colour, 16, Stroke);
        DrawList->AddCircle(At(12.0f, 12.0f), 3.0f * Unit, Colour, 20, Stroke);
        break;
    }
    }
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    THEMES
//------------------------------------------------------------------------------------------------------------------------

ObservatoryTheme ObservatoryTheme::ResolveCloud() noexcept
{
    // 📝 CloudInspector.css on its own (the cloud page's base, before its page rules).
    ObservatoryTheme Theme;
    Theme.PageFill            = ResolveCssColour(0x151915FF);
    Theme.Ink                 = ResolveCssColour(0xE5EDDAFF);
    Theme.Muted               = ResolveCssColour(0x8F9A88FF);
    Theme.Accent              = ResolveCssColour(0xD5E6A5FF);
    Theme.Eyebrow             = ResolveCssColour(0x8E988CFF);
    Theme.Subtitle            = Theme.Muted;
    Theme.CardHeading         = ResolveCssColour(0xDCE1D4FF);
    Theme.Index               = ResolveCssColour(0x7F8D78FF);
    Theme.Label               = ResolveCssColour(0x929B8BFF);
    Theme.ReadoutUnit         = ResolveCssColour(0x909985FF);
    Theme.Caption             = ResolveCssColour(0x8F9A88FF);
    Theme.ControlLabel        = ResolveCssColour(0x8F9A88FF);
    Theme.CardBorder          = ResolveCssColour(0xFFFFFF07);
    Theme.TabRailFill         = ResolveCssColour(0x1C201CFF);
    Theme.TabRailBorder       = ResolveCssColour(0xFFFFFF07);
    Theme.TabText             = ResolveCssColour(0x8F988AFF);
    Theme.TabSelectedFill     = ResolveCssColour(0x30382DFF);
    Theme.TabSelectedText     = ResolveCssColour(0xE0E9CDFF);
    Theme.TabSelectedRing     = ResolveCssColour(0xD5E6A512);
    Theme.TabHoverFill        = ResolveCssColour(0x2C3329FF);
    Theme.TabHoverText        = ResolveCssColour(0xEEF1E7FF);
    Theme.MetricFill          = ResolveCssColour(0x20251FFF);
    Theme.MetricBorder        = ResolveCssColour(0xFFFFFF05);
    Theme.MetricLeadFill      = ResolveCssColour(0xD5E6A5FF);
    Theme.MetricLeadInk       = ResolveCssColour(0x222C19FF);
    Theme.MetricLeadMuted     = ResolveCssColour(0x576443FF);
    Theme.TagFill             = ResolveCssColour(0xD5E6A50A);
    Theme.TagBorder           = ResolveCssColour(0xD5E6A51A);
    Theme.TagText             = ResolveCssColour(0xCCD9B7FF);
    Theme.ModeFill            = ResolveCssColour(0xD5E6A514);
    Theme.ModeBorder          = ResolveCssColour(0x56624855);
    Theme.ModeText            = ResolveCssColour(0xD5E6A5FF);
    Theme.ModeHoverFill       = ResolveCssColour(0xD5E6A524);
    Theme.NextFill            = ResolveCssColour(0xD5E6A50D);
    Theme.NextBorder          = ResolveCssColour(0xD5E6A522);
    Theme.NextText            = ResolveCssColour(0xCBD8B5FF);
    Theme.NextHoverFill       = ResolveCssColour(0xD5E6A51C);
    Theme.NextHoverBorder     = ResolveCssColour(0xD5E6A555);
    Theme.SliderRule          = ResolveCssColour(0xFFFFFF0A);
    Theme.SliderEmpty         = ResolveCssColour(0xFFFFFF12);
    Theme.ThumbRing           = ResolveCssColour(0x24281FFF);
    Theme.ThumbHalo           = ResolveCssColour(0xFFFFFF22);
    Theme.SliderNumber        = Theme.Ink;
    Theme.SliderUnit          = Theme.Muted;
    Theme.DataRowText         = ResolveCssColour(0xA2AC99FF);
    Theme.DataRowRule         = ResolveCssColour(0xFFFFFF0A);
    Theme.SelectFill          = ResolveCssColour(0x161C14FF);
    Theme.SelectBorder        = ResolveCssColour(0x414B3866);
    Theme.SelectText          = ResolveCssColour(0xD8E2CCFF);
    Theme.PresetFill          = Theme.MetricFill;
    Theme.PresetBorder        = Theme.TagBorder;
    Theme.PresetText          = Theme.TagText;
    Theme.PresetPressedFill   = Theme.TabSelectedFill;
    Theme.PresetPressedBorder = Theme.NextHoverBorder;
    Theme.PresetPressedText   = Theme.TabSelectedText;
    Theme.ToggleFill          = ResolveCssColour(0x12181066);
    Theme.ToggleBorder        = ResolveCssColour(0xFFFFFF09);
    Theme.ToggleText          = ResolveCssColour(0xABB7A0FF);
    Theme.ToggleCaption       = ResolveCssColour(0x8E9889FF);
    Theme.ToggleCaptionOn     = ResolveCssColour(0xD5E6A5FF);
    Theme.FooterText          = ResolveCssColour(0x697760FF);
    Theme.FooterRule          = ResolveCssColour(0xFFFFFF0A);
    Theme.AtlasFooterText     = ResolveCssColour(0x8E9A8AFF);
    Theme.AtlasFooterRule     = ResolveCssColour(0xFFFFFF0B);
    return Theme;
}

ObservatoryTheme ObservatoryTheme::ResolveSolar() noexcept
{
    // 📝 SunInspector.css over CloudInspector.css; its second block (the neutral olive page) wins where both set a rule.
    ObservatoryTheme Theme    = ResolveCloud();
    Theme.PageFill            = ResolveCssColour(0x191917FF);
    Theme.Ink                 = ResolveCssColour(0xE8E7DFFF);
    Theme.Muted               = ResolveCssColour(0x9A988EFF);
    Theme.Accent              = ResolveCssColour(0xE3D2A6FF);
    Theme.Eyebrow             = ResolveCssColour(0xA09680FF);
    Theme.Subtitle            = ResolveCssColour(0xA19786FF);
    Theme.CardHeading         = ResolveCssColour(0xE7DFCDFF);
    Theme.Index               = ResolveCssColour(0xA0967DFF);
    Theme.Label               = ResolveCssColour(0xAD9F83FF);
    Theme.ReadoutUnit         = ResolveCssColour(0xA09478FF);
    Theme.Caption             = ResolveCssColour(0xA3977EFF);
    Theme.ControlLabel        = ResolveCssColour(0xB3A58AFF);
    Theme.CardBorder          = ResolveCssColour(0xF0D99C09);
    Theme.TabRailFill         = 0;
    Theme.TabRailBorder       = 0;
    Theme.TabText             = ResolveCssColour(0xA79D87FF);
    Theme.TabSelectedFill     = ResolveCssColour(0x343329FF);
    Theme.TabSelectedText     = ResolveCssColour(0xE7DFC8FF);
    Theme.TabSelectedRing     = ResolveCssColour(0xE8C78B1A);
    Theme.TabHoverFill        = ResolveCssColour(0x352F24FF);
    Theme.TabHoverText        = ResolveCssColour(0xF4DFB9FF);
    Theme.MetricFill          = ResolveCssColour(0x262720FF);
    Theme.MetricLeadFill      = ResolveCssColour(0xD7DBB8FF);
    Theme.MetricLeadInk       = ResolveCssColour(0x292E20FF);
    Theme.MetricLeadMuted     = ResolveCssColour(0x626B51FF);
    Theme.TagFill             = ResolveCssColour(0xE8C78B0C);
    Theme.TagBorder           = ResolveCssColour(0xE8C78B28);
    Theme.TagText             = ResolveCssColour(0xE8C78BFF);
    Theme.ModeFill            = ResolveCssColour(0xE8C78B0B);   // .so-reset
    Theme.ModeBorder          = ResolveCssColour(0xE8C78B22);
    Theme.ModeText            = ResolveCssColour(0xD5BF95FF);
    Theme.ModeHoverFill       = ResolveCssColour(0xE8C78B1C);
    Theme.NextFill            = ResolveCssColour(0xE8C78B0C);
    Theme.NextBorder          = ResolveCssColour(0xE8C78B22);
    Theme.NextText            = ResolveCssColour(0xE8C78BFF);
    Theme.NextHoverFill       = ResolveCssColour(0xE8C78B20);
    Theme.NextHoverBorder     = ResolveCssColour(0xE8C78B55);
    Theme.SliderNumber        = Theme.Ink;
    Theme.SliderUnit          = Theme.Muted;
    Theme.DataRowText         = ResolveCssColour(0xB8AD96FF);
    Theme.DataRowRule         = ResolveCssColour(0xE8C78B10);
    Theme.SelectFill          = ResolveCssColour(0x211E17FF);
    Theme.SelectBorder        = ResolveCssColour(0xE8C78B22);
    Theme.SelectText          = ResolveCssColour(0xE9D7B6FF);
    Theme.PresetFill          = ResolveCssColour(0x25231CFF);
    Theme.PresetBorder        = ResolveCssColour(0xE8C78B12);
    Theme.PresetText          = ResolveCssColour(0xBBAE91FF);
    Theme.PresetPressedFill   = ResolveCssColour(0x4E3E23FF);
    Theme.PresetPressedBorder = ResolveCssColour(0xE8C78B44);
    Theme.PresetPressedText   = ResolveCssColour(0xF4D6A0FF);
    Theme.FooterText          = ResolveCssColour(0xA29473FF);
    Theme.FooterRule          = ResolveCssColour(0xE8C78B10);
    Theme.AtlasFooterText     = ResolveCssColour(0xAD9F83FF);
    Theme.AtlasFooterRule     = ResolveCssColour(0xE8C78B12);
    return Theme;
}

ObservatoryTheme ObservatoryTheme::ResolveAtmosphere() noexcept
{
    // 📝 AtmosphereInspector.css over CloudInspector.css.
    ObservatoryTheme Theme = ResolveCloud();
    Theme.Eyebrow          = ResolveCssColour(0x8C9783FF);
    Theme.Subtitle         = ResolveCssColour(0x9AA38FFF);
    Theme.ModeFill         = ResolveCssColour(0xD6E3A60C);
    Theme.ModeBorder       = ResolveCssColour(0xD6E3A626);
    Theme.ModeText         = ResolveCssColour(0xD6E3A6FF);
    Theme.TabRailFill      = 0;
    Theme.TabRailBorder    = 0;
    Theme.TabSelectedFill  = ResolveCssColour(0x343A2CFF);
    Theme.TabSelectedText  = ResolveCssColour(0xE0E9C7FF);
    Theme.TabSelectedRing  = 0;
    Theme.TabHoverFill     = ResolveCssColour(0x2A3125FF);
    Theme.TabHoverText     = ResolveCssColour(0xE0E9C7FF);
    Theme.CardBorder       = 0;
    Theme.Index            = ResolveCssColour(0x8C9A7DFF);
    Theme.CardHeading      = ResolveCssColour(0xDDE5D0FF);
    Theme.Caption          = ResolveCssColour(0x96A18BFF);
    Theme.TagFill          = ResolveCssColour(0xD6E3A608);
    Theme.TagText          = ResolveCssColour(0xC1D3A3FF);
    Theme.TagBorder        = ResolveCssColour(0xD6E3A620);
    Theme.Label            = ResolveCssColour(0x95A383FF);
    Theme.ReadoutUnit      = ResolveCssColour(0x95A383FF);
    Theme.MetricFill       = ResolveCssColour(0x252B21FF);
    Theme.MetricBorder     = 0;
    Theme.MetricLeadFill   = ResolveCssColour(0xD7E3ADFF);
    Theme.MetricLeadInk    = ResolveCssColour(0x2D3823FF);
    Theme.MetricLeadMuted  = ResolveCssColour(0x687951FF);
    Theme.ToggleFill       = ResolveCssColour(0x171D14FF);
    Theme.ToggleText       = ResolveCssColour(0xBCC9ABFF);
    Theme.ToggleBorder     = ResolveCssColour(0xD6E3A615);
    Theme.ToggleCaptionOn  = ResolveCssColour(0xD6E3A6FF);
    Theme.FooterText       = ResolveCssColour(0x7C8E69FF);
    Theme.FooterRule       = ResolveCssColour(0xD6E3A615);
    Theme.ControlLabel     = ResolveCssColour(0x9CAB8BFF);
    return Theme;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    OBSERVATORY PEN
//------------------------------------------------------------------------------------------------------------------------

ObservatoryPen::ObservatoryPen(ImDrawList* InDrawList, const EditorTypefaces* InFaces, ImVec2 InOrigin, float InScale, float InLogicalWidth,
                               float InLogicalHeight) noexcept
    : DrawList(InDrawList), Faces(InFaces), Origin(InOrigin), Scale(InScale), LogicalWidth(InLogicalWidth), LogicalHeight(InLogicalHeight)
{
}

ImVec2 ObservatoryPen::QueryScreen(ImVec2 Logical) const noexcept
{
    return ImVec2(Origin.x + Logical.x * Scale, Origin.y + Logical.y * Scale);
}

ImVec2 ObservatoryPen::QueryLogical(ImVec2 Screen) const noexcept
{
    return ImVec2((Screen.x - Origin.x) / Scale, (Screen.y - Origin.y) / Scale);
}

void ObservatoryPen::Line(ImVec2 From, ImVec2 To, ImU32 Colour, float Width, float DashOn, float DashOff) const
{
    if (DrawList == nullptr) return;
    ConstructDashedSegment(DrawList, QueryScreen(From), QueryScreen(To), Colour, std::max(0.5f, Width * Scale), DashOn * Scale, DashOff * Scale);
}

void ObservatoryPen::Path(const std::vector<ImVec2>& Points, ImU32 Colour, float Width, float DashOn, float DashOff) const
{
    if (DrawList == nullptr || Points.size() < 2) return;
    if (DashOn > 0.0f && DashOff > 0.0f)
    {
        for (size_t Index = 1; Index < Points.size(); ++Index) Line(Points[Index - 1], Points[Index], Colour, Width, DashOn, DashOff);
        return;
    }
    for (const ImVec2& Point : Points) DrawList->PathLineTo(QueryScreen(Point));
    DrawList->PathStroke(Colour, ImDrawFlags_None, std::max(0.5f, Width * Scale));
}

void ObservatoryPen::Circle(ImVec2 Centre, float Radius, ImU32 Fill, ImU32 Stroke) const
{
    Ellipse(Centre, Radius, Radius, Fill, Stroke);
}

void ObservatoryPen::Ellipse(ImVec2 Centre, float RadiusX, float RadiusY, ImU32 Fill, ImU32 Stroke) const
{
    if (DrawList == nullptr) return;
    const ImVec2 Screen = QueryScreen(Centre);
    const ImVec2 Radius(RadiusX * Scale, RadiusY * Scale);
    const int    Segments = std::clamp(static_cast<int>(std::max(Radius.x, Radius.y) * 0.9f), 16, 96);
    if (Fill != 0) DrawList->AddEllipseFilled(Screen, Radius, Fill, 0.0f, Segments);
    if (Stroke != 0) DrawList->AddEllipse(Screen, Radius, Stroke, 0.0f, Segments, 1.0f);
}

void ObservatoryPen::Text(ImVec2 Baseline, const char* Caption, ImU32 Colour, float Size, int Alignment) const
{
    if (DrawList == nullptr || Caption == nullptr || Caption[0] == '\0') return;
    ImFont*      Face    = Faces != nullptr ? Faces->Regular : nullptr;
    const float  CssSize = Size * Scale;
    const float  Advance = ConstructGlyphRunOn(nullptr, Faces, Face, CssSize, ImVec2(0.0f, 0.0f), 0, Caption, 0.0f, true);
    const ImVec2 Screen  = QueryScreen(Baseline);
    const float  Left    = Alignment < 0 ? Screen.x : (Alignment > 0 ? Screen.x - Advance : Screen.x - 0.5f * Advance);
    (void)ConstructGlyphRunOn(DrawList, Faces, Face, CssSize, ImVec2(Left, Screen.y), Colour, Caption, 0.0f, false);
}

void ObservatoryPen::Rect(ImVec2 Min, ImVec2 Size, ImU32 Fill, float Radius) const
{
    if (DrawList == nullptr) return;
    DrawList->AddRectFilled(QueryScreen(Min), QueryScreen(ImVec2(Min.x + Size.x, Min.y + Size.y)), Fill, Radius * Scale);
}

void ObservatoryPen::Glow(ImVec2 Centre, float Radius, ImU32 Rgb, float Alpha) const
{
    if (DrawList == nullptr) return;
    ConstructRadialFan(DrawList, QueryScreen(Centre), ImVec2(Radius * Scale, Radius * Scale), ResolveAlpha(Rgb, Alpha), ResolveAlpha(Rgb, 0.0f));
}

void ObservatoryPen::ShadedArea(const std::vector<ImVec2>& Curve, float Base, const std::vector<ImU32>& Colours) const
{
    if (DrawList == nullptr || Curve.size() < 2 || Colours.size() != Curve.size()) return;
    // 📝 One quad per curve step down to the baseline, so any curve shape fills exactly.
    const ImVec2 WhiteUv = DrawList->_Data->TexUvWhitePixel;
    const int    Steps   = static_cast<int>(Curve.size()) - 1;
    DrawList->PrimReserve(Steps * 6, Steps * 4);
    for (int Step = 0; Step < Steps; ++Step)
    {
        const ImDrawIdx Corner = static_cast<ImDrawIdx>(DrawList->_VtxCurrentIdx);
        DrawList->PrimWriteVtx(QueryScreen(ImVec2(Curve[Step].x, Base)), WhiteUv, Colours[Step]);
        DrawList->PrimWriteVtx(QueryScreen(Curve[Step]), WhiteUv, Colours[Step]);
        DrawList->PrimWriteVtx(QueryScreen(Curve[Step + 1]), WhiteUv, Colours[Step + 1]);
        DrawList->PrimWriteVtx(QueryScreen(ImVec2(Curve[Step + 1].x, Base)), WhiteUv, Colours[Step + 1]);
        DrawList->PrimWriteIdx(Corner);
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Corner + 1));
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Corner + 2));
        DrawList->PrimWriteIdx(Corner);
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Corner + 2));
        DrawList->PrimWriteIdx(static_cast<ImDrawIdx>(Corner + 3));
    }
}

void ObservatoryPen::GradientBar(ImVec2 Min, ImVec2 Size, const std::vector<ImU32>& Stops) const
{
    if (DrawList == nullptr || Stops.size() < 2) return;
    const ImVec2 ScreenMin = QueryScreen(Min);
    const ImVec2 ScreenMax = QueryScreen(ImVec2(Min.x + Size.x, Min.y + Size.y));
    const int    Segments  = static_cast<int>(Stops.size()) - 1;
    DrawList->PushClipRect(ScreenMin, ScreenMax, true);
    for (int Segment = 0; Segment < Segments; ++Segment)
    {
        const float Left  = ScreenMin.x + (ScreenMax.x - ScreenMin.x) * static_cast<float>(Segment) / static_cast<float>(Segments);
        const float Right = ScreenMin.x + (ScreenMax.x - ScreenMin.x) * static_cast<float>(Segment + 1) / static_cast<float>(Segments);
        DrawList->AddRectFilledMultiColor(ImVec2(Left, ScreenMin.y), ImVec2(Right + 0.5f, ScreenMax.y), Stops[Segment], Stops[Segment + 1],
                                          Stops[Segment + 1], Stops[Segment]);
    }
    DrawList->PopClipRect();
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    COLUMN
//------------------------------------------------------------------------------------------------------------------------

ObservatoryColumn::ObservatoryColumn(const ObservatoryTheme& InTheme, const EditorTypefaces& InFaces, float InScale)
    : Theme(InTheme), Faces(InFaces), DrawList(ImGui::GetWindowDrawList()), Scale(std::max(0.5f, InScale))
{
    // 📝 .native-environment: the page fill under the whole visible column, 20 px padding around the page.
    const ImVec2 WindowMin = ImGui::GetWindowPos();
    const ImVec2 WindowMax(WindowMin.x + ImGui::GetWindowWidth(), WindowMin.y + ImGui::GetWindowHeight());
    DrawList->AddRectFilled(WindowMin, WindowMax, Theme.PageFill);
    const ImVec2 Start = ImGui::GetCursorScreenPos();
    Left               = Start.x + PagePadding * Scale;
    Width              = std::max(120.0f * Scale, ImGui::GetContentRegionAvail().x - 2.0f * PagePadding * Scale);
    PageWidth          = Width;
    Cursor             = Start.y + PagePadding * Scale;
    Lowest             = Cursor;
}

ImVec2 ObservatoryColumn::Space(float CssHeight, float MarginTop, float MarginBase)
{
    Cursor += std::max(PendingMargin, MarginTop) * Scale;
    const ImVec2 Top(Left, Cursor);
    Cursor += CssHeight * Scale;
    PendingMargin = MarginBase;
    Lowest        = std::max(Lowest, Cursor);
    return Top;
}

void ObservatoryColumn::Finalize()
{
    const float Bottom = Cursor + (PendingMargin + PagePadding) * Scale;
    ImGui::SetCursorScreenPos(ImVec2(Left - PagePadding * Scale, Bottom));
    ImGui::Dummy(ImVec2(1.0f, 1.0f));
}

float ObservatoryColumn::ConstructGlyphRun(ImFont* Face, float Size, ImVec2 Baseline, ImU32 Colour, const char* Text, float Tracking) const
{
    return ConstructGlyphRunOn(DrawList, &Faces, Face, Size, Baseline, Colour, Text, Tracking, false);
}

float ObservatoryColumn::MeasureGlyphRun(ImFont* Face, float Size, const char* Text, float Tracking) const
{
    return ConstructGlyphRunOn(nullptr, &Faces, Face, Size, ImVec2(0.0f, 0.0f), 0, Text, Tracking, true);
}

float ObservatoryColumn::ConstructParagraph(ImFont* Face, float Size, float LineHeight, ImVec2 Min, float WrapWidth, ImU32 Colour,
                                            const char* Text, bool Measure) const
{
    if (Text == nullptr || Text[0] == '\0') return 0.0f;
    ImFont*     Primary     = ResolveFace(Face);
    const float PixelHeight = EmPixelHeight * Size;
    const float Leading     = LineHeight * Size;
    const char* LineStart   = Text;
    const char* End         = Text + std::strlen(Text);
    int         Lines       = 0;
    while (LineStart < End)
    {
        const char* LineEnd = Primary->CalcWordWrapPosition(PixelHeight, LineStart, End, WrapWidth);
        if (LineEnd <= LineStart) LineEnd = LineStart + 1;
        if (!Measure)
        {
            const std::string Line(LineStart, LineEnd);
            (void)ConstructGlyphRun(Primary, Size, ImVec2(Min.x, ResolveBaseline(Min.y + static_cast<float>(Lines) * Leading, Size, LineHeight)), Colour,
                                    Line.c_str());
        }
        ++Lines;
        LineStart = LineEnd;
        while (LineStart < End && (*LineStart == ' ' || *LineStart == '\n')) ++LineStart;
    }
    return static_cast<float>(Lines) * Leading;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    HEADER / TABS
//------------------------------------------------------------------------------------------------------------------------

bool ObservatoryColumn::ConstructHeader(const char* Id, const char* Eyebrow, const char* Title, const char* ActionLabel, const char* Subtitle,
                                        const char* ActionTooltip)
{
    const float S = Scale;
    // 📝 .co-eyebrow: 9 px, letter-spacing 1.7 px, margin-bottom 24 px.
    const ImVec2 EyebrowTop = Space(9.0f * 1.4f, 0.0f, 24.0f);
    (void)ConstructGlyphRun(Faces.Regular, 9.0f * S, ImVec2(EyebrowTop.x, ResolveBaseline(EyebrowTop.y, 9.0f * S, 1.4f)), Theme.Eyebrow, Eyebrow,
                            1.7f * S);

    // 📝 .co-title-line: h1 31 px / 1.15, weight 400, letter-spacing −1 px; the pill (.so-reset) margin-top 5 px, 28 px tall.
    const float  TitleLine = std::max(31.0f * 1.15f, 5.0f + 28.0f);
    const ImVec2 TitleTop  = Space(TitleLine, 0.0f, 0.0f);
    (void)ConstructGlyphRun(Faces.Regular, 31.0f * S, ImVec2(TitleTop.x, ResolveBaseline(TitleTop.y, 31.0f * S, 1.15f)), Theme.Ink, Title, -1.0f * S);
    bool Pressed = false;
    if (ActionLabel != nullptr)
    {
        const float  PillWidth = MeasureGlyphRun(Faces.Regular, 9.0f * S, ActionLabel) + 22.0f * S;
        const ImVec2 PillMin(TitleTop.x + Width - PillWidth, TitleTop.y + 5.0f * S);
        const ImVec2 PillMax(PillMin.x + PillWidth, PillMin.y + 28.0f * S);
        ImGui::SetCursorScreenPos(PillMin);
        ImGui::PushID(Id);
        Pressed = ImGui::InvisibleButton("##TitleAction", ImVec2(PillWidth, 28.0f * S));
        ImGui::PopID();
        ConstructTooltipText(ActionTooltip);
        const bool Hovered = ImGui::IsItemHovered();
        DrawList->AddRectFilled(PillMin, PillMax, Hovered ? Theme.ModeHoverFill : Theme.ModeFill, 22.0f * S);
        DrawList->AddRect(PillMin, PillMax, Theme.ModeBorder, 22.0f * S, ImDrawFlags_None, S);
        (void)ConstructGlyphRun(Faces.Regular, 9.0f * S,
                                ImVec2(PillMin.x + 11.0f * S, PillMin.y + 0.5f * (28.0f * S - EmPixelHeight * 9.0f * S) + EmAscent * 9.0f * S),
                                Theme.ModeText, ActionLabel);
    }

    // 📝 .co-subtitle: 10 px, margin-top 15 px; .co-header margin-bottom 20 px.
    const ImVec2 SubtitleTop = Space(10.0f * 1.4f, 15.0f, 20.0f);
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(SubtitleTop.x, ResolveBaseline(SubtitleTop.y, 10.0f * S, 1.4f)), Theme.Subtitle,
                            Subtitle, 0.1f * S);
    return Pressed;
}

bool ObservatoryColumn::ConstructTabs(const char* Id, const char* const* Labels, int Count, int& InOutSelected)
{
    if (Count <= 0) return false;
    const float  S       = Scale;
    const bool   Railed  = Theme.TabRailFill != 0;
    const float  Padding = Railed ? 4.0f : 0.0f;
    const float  TabTall = 31.0f;   // padding 9 px + 10 px × normal line height + 9 px, min-height 31 px
    const ImVec2 Top     = Space(TabTall + 2.0f * Padding + (Railed ? 2.0f : 0.0f), 0.0f, 19.0f);
    if (Railed)
    {
        const ImVec2 RailMax(Top.x + Width, Top.y + (TabTall + 2.0f * Padding + 2.0f) * S);
        DrawList->AddRectFilled(Top, RailMax, Theme.TabRailFill, 30.0f * S);
        DrawList->AddRect(Top, RailMax, Theme.TabRailBorder, 30.0f * S, ImDrawFlags_None, S);
    }
    const float Inset   = (Padding + (Railed ? 1.0f : 0.0f)) * S;
    const float Gap     = 3.0f * S;
    const float TabWide = (Width - 2.0f * Inset - Gap * static_cast<float>(Count - 1)) / static_cast<float>(Count);
    bool        Changed = false;
    ImGui::PushID(Id);
    for (int Index = 0; Index < Count; ++Index)
    {
        const ImVec2 TabMin(Top.x + Inset + static_cast<float>(Index) * (TabWide + Gap), Top.y + Inset);
        const ImVec2 TabMax(TabMin.x + TabWide, TabMin.y + TabTall * S);
        ImGui::SetCursorScreenPos(TabMin);
        ImGui::PushID(Index);
        if (ImGui::InvisibleButton("##Tab", ImVec2(TabWide, TabTall * S)) && InOutSelected != Index)
        {
            InOutSelected = Index;
            Changed       = true;
        }
        const bool Hovered  = ImGui::IsItemHovered();
        ImGui::PopID();
        const bool Selected = InOutSelected == Index;
        ImU32      Ink      = Theme.TabText;
        if (Selected)
        {
            DrawList->AddRectFilled(TabMin, TabMax, Theme.TabSelectedFill, 24.0f * S);
            if (Theme.TabSelectedRing != 0) DrawList->AddRect(TabMin, TabMax, Theme.TabSelectedRing, 24.0f * S, ImDrawFlags_None, S);
            Ink = Theme.TabSelectedText;
        }
        else if (Hovered)
        {
            DrawList->AddRectFilled(TabMin, TabMax, Theme.TabHoverFill, 24.0f * S);
            Ink = Theme.TabHoverText;
        }
        const float Advance = MeasureGlyphRun(Faces.Regular, 10.0f * S, Labels[Index]);
        (void)ConstructGlyphRun(Faces.Regular, 10.0f * S,
                                ImVec2(TabMin.x + 0.5f * (TabWide - Advance), TabMin.y + 0.5f * (TabTall * S - EmPixelHeight * 10.0f * S) + EmAscent * 10.0f * S),
                                Ink, Labels[Index]);
    }
    ImGui::PopID();
    return Changed;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    CARDS
//------------------------------------------------------------------------------------------------------------------------

void ObservatoryColumn::BeginCard(const ObservatoryCardLook& Look, const char* Heading, const char* Index)
{
    const float  S   = Scale;
    const ImVec2 Top = Space(0.0f, Look.MarginTop, 0.0f);
    CardScope    Scope;
    Scope.Look       = Look;
    Scope.Top        = Top.y;
    Scope.OuterLeft  = Left;
    Scope.OuterWidth = Width;
    Cards.push_back(Scope);
    DrawList->ChannelsSplit(2);
    DrawList->ChannelsSetCurrent(1);

    const float Border = (Look.Border != 0 || Look.TopRule != 0) ? 1.0f : 0.0f;
    const float Sides  = (Look.Border != 0 ? 1.0f : 0.0f) + Look.PaddingSide;
    Left += Sides * S;
    Width -= 2.0f * Sides * S;
    Cursor        = Top.y + (Border + Look.PaddingTop) * S;
    PendingMargin = 0.0f;

    if (Heading != nullptr || Index != nullptr)
    {
        // 📝 .co-card-heading: 12 px, space-between, margin-bottom 14 px; .co-index 8px/1.8, letter-spacing 1 px.
        const ImVec2 HeadingTop = Space(12.0f * 1.4f, 0.0f, 14.0f);
        if (Heading != nullptr)
        {
            (void)ConstructGlyphRun(Faces.Regular, 12.0f * S, ImVec2(HeadingTop.x, ResolveBaseline(HeadingTop.y, 12.0f * S, 1.4f)), Theme.CardHeading,
                                    Heading, -0.1f * S);
        }
        if (Index != nullptr)
        {
            const float Advance = MeasureGlyphRun(Faces.Regular, 8.0f * S, Index, 1.0f * S);
            (void)ConstructGlyphRun(Faces.Regular, 8.0f * S, ImVec2(HeadingTop.x + Width - Advance, ResolveBaseline(HeadingTop.y, 8.0f * S, 1.8f)),
                                    Theme.Index, Index, 1.0f * S);
        }
    }
}

ImVec2 ObservatoryColumn::QueryCardOrigin() const noexcept
{
    return Cards.empty() ? ImVec2(Left, Cursor) : ImVec2(Cards.back().OuterLeft, Cards.back().Top);
}

float ObservatoryColumn::QueryCardWidth() const noexcept
{
    return Cards.empty() ? Width : Cards.back().OuterWidth;
}

void ObservatoryColumn::EndCard()
{
    if (Cards.empty()) return;
    const CardScope Scope = Cards.back();
    Cards.pop_back();
    const ObservatoryCardLook& Look   = Scope.Look;
    const float                S      = Scale;
    const float                Border = (Look.Border != 0 || Look.TopRule != 0) ? 1.0f : 0.0f;
    const float                Bottom = Cursor + (PendingMargin + Look.PaddingBase + (Look.Border != 0 ? 1.0f : 0.0f)) * S;
    const ImVec2               Min(Scope.OuterLeft, Scope.Top);
    const ImVec2               Max(Scope.OuterLeft + Scope.OuterWidth, Bottom);
    (void)Border;

    DrawList->ChannelsSetCurrent(0);
    const float Rounding = Look.Radius * S;
    if (Look.Fill != 0)
    {
        const int VertexStart = DrawList->VtxBuffer.Size;
        DrawList->AddRectFilled(Min, Max, Look.Fill, Rounding);
        if (Look.FillEnd != 0)
        {
            // 📝 linear-gradient(125deg, Fill, FillEnd 65%): the gradient line through the centre at 125° (0° = up).
            const float  Angle = 125.0f * PiSingle / 180.0f;
            const ImVec2 Direction(std::sin(Angle), -std::cos(Angle));
            const ImVec2 Size(Max.x - Min.x, Max.y - Min.y);
            const float  Length = std::fabs(Size.x * Direction.x) + std::fabs(Size.y * Direction.y);
            const ImVec2 Centre(0.5f * (Min.x + Max.x), 0.5f * (Min.y + Max.y));
            const ImVec2 From(Centre.x - Direction.x * 0.5f * Length, Centre.y - Direction.y * 0.5f * Length);
            const ImVec2 To(From.x + Direction.x * 0.65f * Length, From.y + Direction.y * 0.65f * Length);
            ImGui::ShadeVertsLinearColorGradientKeepAlpha(DrawList, VertexStart, DrawList->VtxBuffer.Size, From, To, Look.Fill, Look.FillEnd);
        }
    }
    if (Look.Glow != 0)
    {
        // 📝 radial-gradient(ellipse at X% Y%, Glow, transparent Extent): the farthest-corner ellipse.
        const ImVec2 Size(Max.x - Min.x, Max.y - Min.y);
        const ImVec2 Centre(Min.x + Look.GlowCentre.x * Size.x, Min.y + Look.GlowCentre.y * Size.y);
        const float  FarX = std::max(Centre.x - Min.x, Max.x - Centre.x);
        const float  FarY = std::max(Centre.y - Min.y, Max.y - Centre.y);
        const ImVec2 Radius(FarX * 1.41421356f * Look.GlowExtent, FarY * 1.41421356f * Look.GlowExtent);
        DrawList->PushClipRect(Min, Max, true);
        ConstructRadialFan(DrawList, Centre, Radius, Look.Glow, ResolveAlpha(Look.Glow, 0.0f), 64);
        DrawList->PopClipRect();
    }
    if (Look.Border != 0)
    {
        DrawList->AddRect(ImVec2(Min.x + 0.5f * S, Min.y + 0.5f * S), ImVec2(Max.x - 0.5f * S, Max.y - 0.5f * S), Look.Border, Rounding,
                          ImDrawFlags_None, S);
    }
    else if (Look.TopRule != 0)
    {
        DrawList->AddLine(ImVec2(Min.x, Min.y + 0.5f * S), ImVec2(Max.x, Min.y + 0.5f * S), Look.TopRule, S);
    }
    DrawList->ChannelsMerge();

    Left          = Scope.OuterLeft;
    Width         = Scope.OuterWidth;
    Cursor        = Bottom;
    PendingMargin = Look.MarginBase;
    Lowest        = std::max(Lowest, Cursor);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    READOUTS / TAGS
//------------------------------------------------------------------------------------------------------------------------

float ObservatoryColumn::ConstructReadoutAt(ImVec2 Min, const char* Label, const char* Figure, const char* Unit, float FigureSize, float UnitSize,
                                            float FigureTracking, float FigureLineHeight, ImU32 Ink, ImU32 LabelColour, ImU32 UnitColour,
                                            float LabelSize, float LabelGap, bool UnitBeneath, float UnitGap)
{
    const float S      = Scale;
    float       Height = 0.0f;
    if (Label != nullptr && Label[0] != '\0')
    {
        (void)ConstructGlyphRun(Faces.Regular, LabelSize * S, ImVec2(Min.x, ResolveBaseline(Min.y, LabelSize * S, 1.4f)),
                                LabelColour != 0 ? LabelColour : Theme.Label, Label);
        Height += (LabelSize * 1.4f + LabelGap) * S;
    }
    const float FigureTop  = Min.y + Height;
    const float Baseline   = ResolveBaseline(FigureTop, FigureSize * S, FigureLineHeight);
    const float FigureWide = ConstructGlyphRun(Faces.Light, FigureSize * S, ImVec2(Min.x, Baseline), Ink != 0 ? Ink : Theme.Ink, Figure,
                                               FigureTracking * S);
    Height += FigureSize * FigureLineHeight * S;
    if (Unit != nullptr && Unit[0] != '\0')
    {
        if (UnitBeneath)
        {
            // 📝 The unit wraps onto its own line: the line box takes the readout's 14 px / 1.4 strut.
            const float LineTop = Min.y + Height + UnitGap * S;
            (void)ConstructGlyphRun(Faces.Regular, UnitSize * S, ImVec2(Min.x, ResolveBaseline(LineTop, 14.0f * S, 1.4f)),
                                    UnitColour != 0 ? UnitColour : Theme.ReadoutUnit, Unit);
            Height += (14.0f * 1.4f + UnitGap) * S;
        }
        else
        {
            (void)ConstructGlyphRun(Faces.Regular, UnitSize * S, ImVec2(Min.x + FigureWide + 4.0f * S, Baseline),
                                    UnitColour != 0 ? UnitColour : Theme.ReadoutUnit, Unit);
        }
    }
    return Height;
}

void ObservatoryColumn::ConstructReadout(const char* Label, const char* Figure, const char* Unit, float FigureSize, float UnitSize,
                                         float FigureTracking, float FigureLineHeight)
{
    const float LabelBlock = (Label != nullptr && Label[0] != '\0') ? 9.0f * 1.4f + 5.0f : 0.0f;
    const ImVec2 Top       = Space(LabelBlock + FigureSize * FigureLineHeight, 0.0f, 0.0f);
    (void)ConstructReadoutAt(Top, Label, Figure, Unit, FigureSize, UnitSize, FigureTracking, FigureLineHeight);
}

float ObservatoryColumn::MeasureTag(const char* Text, float FontSize, float PadX) const
{
    return MeasureGlyphRun(Faces.Regular, FontSize * Scale, Text) + (2.0f * PadX + 2.0f) * Scale;
}

ImVec2 ObservatoryColumn::ConstructTagAt(const char* Id, ImVec2 Min, const char* Text, bool Pressable, bool* Pressed, float FontSize, float PadX,
                                         float PadY, float MinHeight, ImU32 Fill, ImU32 TextColour, const char* Tooltip)
{
    const float  S    = Scale;
    const float  Wide = MeasureTag(Text, FontSize, PadX);
    const float  Tall = std::max(MinHeight, 2.0f * PadY + FontSize * (Pressable ? EmPixelHeight : 1.4f) + 2.0f) * S;
    const ImVec2 Max(Min.x + Wide, Min.y + Tall);
    bool         Hovered = false;
    if (Pressable)
    {
        ImGui::SetCursorScreenPos(Min);
        const bool Clicked = ImGui::InvisibleButton(Id, ImVec2(Wide, Tall));
        if (Pressed != nullptr) *Pressed = Clicked;
        Hovered = ImGui::IsItemHovered();
        ConstructTooltipText(Tooltip);
    }
    DrawList->AddRectFilled(Min, Max, Fill != 0 ? Fill : (Hovered ? Theme.ModeHoverFill : Theme.TagFill), 20.0f * S);
    DrawList->AddRect(Min, Max, Theme.TagBorder, 20.0f * S, ImDrawFlags_None, S);
    (void)ConstructGlyphRun(Faces.Regular, FontSize * S,
                            ImVec2(Min.x + (PadX + 1.0f) * S, Min.y + 0.5f * (Tall - EmPixelHeight * FontSize * S) + EmAscent * FontSize * S),
                            TextColour != 0 ? TextColour : Theme.TagText, Text);
    return ImVec2(Wide, Tall);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    METRICS / SWITCH TILES
//------------------------------------------------------------------------------------------------------------------------

void ObservatoryColumn::ConstructMetrics(const ObservatoryMetric* Metrics, int Count)
{
    if (Count <= 0) return;
    // 📝 .co-kpis (narrow): grid, gap 7 px, margin-bottom 12 px; each readout padding 13 px 10 px, radius 17 px; label 8 px,
    //    figure 24 px block (letter-spacing −1 px, line-height 1.25), the unit 8 px on the next line.
    const float  S        = Scale;
    const float  Content  = 8.0f * 1.4f + 5.0f + 24.0f * 1.25f + 14.0f * 1.4f;
    const float  TileTall = 1.0f + 13.0f + Content + 13.0f + 1.0f;
    const ImVec2 Top      = Space(TileTall, 0.0f, 12.0f);
    const float  Gap      = 7.0f * S;
    const float  TileWide = (Width - Gap * static_cast<float>(Count - 1)) / static_cast<float>(Count);
    for (int Index = 0; Index < Count; ++Index)
    {
        const bool   Lead = Index == Count - 1;
        const ImVec2 Min(Top.x + static_cast<float>(Index) * (TileWide + Gap), Top.y);
        const ImVec2 Max(Min.x + TileWide, Min.y + TileTall * S);
        DrawList->AddRectFilled(Min, Max, Lead ? Theme.MetricLeadFill : Theme.MetricFill, 17.0f * S);
        if (Theme.MetricBorder != 0 && !Lead) DrawList->AddRect(Min, Max, Theme.MetricBorder, 17.0f * S, ImDrawFlags_None, S);
        const ImU32 Ink   = Lead ? Theme.MetricLeadInk : Theme.Ink;
        const ImU32 Muted = Lead ? Theme.MetricLeadMuted : Theme.Label;
        const ImU32 Unit  = Lead ? Theme.MetricLeadMuted : Theme.ReadoutUnit;
        (void)ConstructReadoutAt(ImVec2(Min.x + 11.0f * S, Min.y + 14.0f * S), Metrics[Index].Label.c_str(), Metrics[Index].Figure.c_str(),
                                 Metrics[Index].Unit.c_str(), 24.0f, 8.0f, -1.0f, 1.25f, Ink, Muted, Unit, 8.0f, 5.0f, true, 0.0f);
    }
}

bool ObservatoryColumn::ConstructSwitchTiles(const char* Id, const ObservatorySwitchTile* Tiles, int Count, int Columns)
{
    if (Count <= 0) return false;
    // 📝 .ne-tiles: gap 9 px, margin-top 12 px; .ne-quick margin-bottom 16 px; tiles 106 px tall, radius 16 px, a 31 px
    //    symbol disc (on #69c884 / off #cc7673), the caption 10 px #c8c8c8, ON / OFF 8 px.
    const float S       = Scale;
    const int   Across  = std::max(1, Columns);
    const int   Rows    = (Count + Across - 1) / Across;
    const float Gap     = 9.0f * S;
    const float Tall    = 106.0f;
    const ImVec2 Top    = Space(Tall * static_cast<float>(Rows) + 9.0f * static_cast<float>(Rows - 1), 12.0f, 16.0f);
    const float TileWide = (Width - Gap * static_cast<float>(Across - 1)) / static_cast<float>(Across);
    bool        Flipped  = false;
    ImGui::PushID(Id);
    for (int Index = 0; Index < Count; ++Index)
    {
        const ObservatorySwitchTile& Tile = Tiles[Index];
        const int    Column = Index % Across;
        const int    Row    = Index / Across;
        const ImVec2 Min(Top.x + static_cast<float>(Column) * (TileWide + Gap), Top.y + static_cast<float>(Row) * (Tall * S + Gap));
        const ImVec2 Max(Min.x + TileWide, Min.y + Tall * S);
        const bool   Live   = Tile.Target != nullptr && !Tile.Pending;
        const bool   Lit    = Tile.Target != nullptr ? *Tile.Target : Tile.PendingReading;
        ImGui::SetCursorScreenPos(Min);
        ImGui::PushID(Index);
        if (!Live) ImGui::BeginDisabled();
        if (ImGui::InvisibleButton("##Tile", ImVec2(TileWide, Tall * S)) && Live)
        {
            *Tile.Target = !*Tile.Target;
            Flipped      = true;
        }
        if (!Live) ImGui::EndDisabled();
        ConstructTooltipText(Tile.Tooltip);
        const bool Hovered = Live && ImGui::IsItemHovered();
        ImGui::PopID();
        const float Fade = Live ? 1.0f : 0.55f;
        DrawList->AddRectFilled(Min, Max, FadeColour(Hovered ? ResolveCssColour(0x303030FF) : ResolveCssColour(0x202020FF), Fade), 16.0f * S);
        DrawList->AddRect(Min, Max, FadeColour(Hovered ? ResolveCssColour(0x777777FF) : (Lit ? ResolveCssColour(0x323232FF) : ResolveCssColour(0x493232FF)), Fade),
                          16.0f * S, ImDrawFlags_None, S);
        const ImVec2 Disc(0.5f * (Min.x + Max.x), Min.y + (1.0f + 13.0f + 15.5f) * S);
        DrawList->AddCircleFilled(Disc, 15.5f * S, FadeColour(Lit ? ResolveCssColour(0x69C884FF) : ResolveCssColour(0xCC7673FF), Fade), 40);
        ConstructTileGlyph(DrawList, Tile.Glyph, ImVec2(Disc.x - 9.0f * S, Disc.y - 9.0f * S), 18.0f * S,
                           FadeColour(Lit ? ResolveCssColour(0x16321EFF) : ResolveCssColour(0x371D1CFF), Fade));
        const float CaptionTop  = Min.y + (1.0f + 13.0f + 31.0f + 3.0f + 8.0f) * S;
        const float CaptionWide = MeasureGlyphRun(Faces.Regular, 10.0f * S, Tile.Caption);
        (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(Disc.x - 0.5f * CaptionWide, CaptionTop + EmAscent * 10.0f * S),
                                FadeColour(ResolveCssColour(0xC8C8C8FF), Fade), Tile.Caption);
        const char* Reading     = Tile.Target == nullptr && !Tile.Pending ? "UNAVAILABLE" : (Lit ? "ON" : "OFF");
        const float ReadingTop  = CaptionTop + (10.0f * EmPixelHeight + 8.0f) * S;
        const float ReadingWide = MeasureGlyphRun(Faces.Regular, 8.0f * S, Reading, 0.3f * S);
        (void)ConstructGlyphRun(Faces.Regular, 8.0f * S, ImVec2(Disc.x - 0.5f * ReadingWide, ReadingTop + EmAscent * 8.0f * S),
                                FadeColour(Lit ? ResolveCssColour(0x69C884FF) : ResolveCssColour(0xCC7673FF), Fade), Reading, 0.3f * S);
    }
    ImGui::PopID();
    return Flipped;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    SLIDERS
//------------------------------------------------------------------------------------------------------------------------

bool ObservatoryColumn::ConstructSlider(const char* Id, const char* Label, float& Quantity, float Minimum, float Maximum, float Step,
                                        const char* Unit, float DisplayScale, bool Enabled, const char* Tooltip)
{
    // 📝 .co-slider (narrow): border-top 1 px, padding 11 px 0 9 px; head (label 11 px, figure light 18 px + unit 9 px) 24 px,
    //    margin-bottom 10 px; the 14 px accent track filled to --slider-fill; a 17 px accent thumb in a 3 px ring.
    const float  S     = Scale;
    const ImVec2 Top   = Space(1.0f + 11.0f + 24.0f + 10.0f + 14.0f + 9.0f, 0.0f, 0.0f);
    const float  Fade  = Enabled ? 1.0f : 0.45f;
    bool         Moved = false;
    DrawList->AddLine(ImVec2(Top.x, Top.y + 0.5f * S), ImVec2(Top.x + Width, Top.y + 0.5f * S), Theme.SliderRule, S);

    const float HeadTop = Top.y + 12.0f * S;
    (void)ConstructGlyphRun(Faces.Regular, 11.0f * S, ImVec2(Top.x, ResolveBaseline(HeadTop + 0.5f * (24.0f - 11.0f * 1.4f) * S, 11.0f * S, 1.4f)),
                            FadeColour(Theme.ControlLabel, Fade), Label);

    // 📝 The figure: SliderDigits of Minimum × scale and Step × scale; the unit right-aligned after a 4 px gap.
    const int   Digits     = ResolveSliderDigits(Minimum * DisplayScale, Step * DisplayScale);
    char        Figure[48] = {};
    std::snprintf(Figure, sizeof(Figure), "%.*f", Digits, static_cast<double>(Quantity * DisplayScale));
    const float UnitWide   = MeasureGlyphRun(Faces.Regular, 9.0f * S, Unit);
    const float FigureWide = MeasureGlyphRun(Faces.Light, 18.0f * S, Figure);
    const float PillRight  = Top.x + Width - 5.0f * S;
    const float UnitLeft   = PillRight - UnitWide;
    const float FigureLeft = UnitLeft - (Unit != nullptr && Unit[0] != '\0' ? 4.0f * S : 0.0f) - FigureWide;
    const float Baseline   = HeadTop + 0.5f * (24.0f * S - EmPixelHeight * 18.0f * S) + EmAscent * 18.0f * S;

    ImGui::PushID(Id);
    const ImGuiID FigureId = ImGui::GetID("##Figure");
    const ImVec2  FigureMin(PillRight - std::max(78.0f * S, UnitWide + FigureWide + 12.0f * S), HeadTop);
    const ImVec2  FigureMax(PillRight + 4.0f * S, HeadTop + 24.0f * S);
    if (!Enabled) ImGui::BeginDisabled();
    bool Typing = ImGui::TempInputIsActive(FigureId);
    if (!Typing)
    {
        ImGui::SetCursorScreenPos(FigureMin);
        if (ImGui::InvisibleButton("##Figure", ImVec2(FigureMax.x - FigureMin.x, FigureMax.y - FigureMin.y)) && Enabled)
        {
            Typing = true;
        }
        ConstructTooltipText(Tooltip);
    }
    if (Typing && Enabled)
    {
        float Display        = Quantity * DisplayScale;
        float DisplayMinimum = Minimum * DisplayScale;
        float DisplayMaximum = Maximum * DisplayScale;
        char  Format[16]     = {};
        std::snprintf(Format, sizeof(Format), "%%.%df", Digits);
        ImGui::PushStyleColor(ImGuiCol_FrameBg, ResolveCssColour(0x00000000));
        ImGui::PushStyleColor(ImGuiCol_Text, Theme.SliderNumber);
        ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 9.0f * S);
        if (ImGui::TempInputScalar(ImRect(FigureMin, FigureMax), FigureId, "##FigureEntry", ImGuiDataType_Float, &Display, Format, &DisplayMinimum,
                                   &DisplayMaximum))
        {
            Quantity = SnapSliderSetting(Display / DisplayScale, Minimum, Maximum, Step);
            Moved    = true;
        }
        ImGui::PopStyleVar();
        ImGui::PopStyleColor(2);
        DrawList->AddRect(FigureMin, FigureMax, Theme.Accent, 9.0f * S, ImDrawFlags_None, S);
    }
    else
    {
        (void)ConstructGlyphRun(Faces.Light, 18.0f * S, ImVec2(FigureLeft, Baseline), FadeColour(Theme.SliderNumber, Fade), Figure);
    }
    (void)ConstructGlyphRun(Faces.Regular, 9.0f * S, ImVec2(UnitLeft, Baseline), FadeColour(Theme.SliderUnit, Fade), Unit);

    // 📝 The track: full width, 14 px; the thumb centre runs from 8.5 px to width − 8.5 px.
    const float  TrackTop = HeadTop + (24.0f + 10.0f) * S;
    const ImVec2 TrackMin(Top.x, TrackTop);
    const ImVec2 TrackMax(Top.x + Width, TrackTop + 14.0f * S);
    ImGui::SetCursorScreenPos(ImVec2(TrackMin.x, TrackMin.y - 3.0f * S));
    ImGui::InvisibleButton("##Track", ImVec2(Width, 20.0f * S));
    ConstructTooltipText(Tooltip);
    const float Travel = std::max(1.0f, Width - 17.0f * S);
    if (Enabled && ImGui::IsItemActive() && Maximum > Minimum)
    {
        const float Fraction = std::clamp((ImGui::GetIO().MousePos.x - (TrackMin.x + 8.5f * S)) / Travel, 0.0f, 1.0f);
        const float Snapped  = SnapSliderSetting(Minimum + Fraction * (Maximum - Minimum), Minimum, Maximum, Step);
        if (Snapped != Quantity)
        {
            Quantity = Snapped;
            Moved    = true;
        }
    }
    if (!Enabled) ImGui::EndDisabled();
    ImGui::PopID();

    const float Fill  = Maximum > Minimum ? std::clamp((Quantity - Minimum) / (Maximum - Minimum), 0.0f, 1.0f) : 0.0f;
    const float Split = TrackMin.x + Fill * Width;
    DrawList->AddRectFilled(TrackMin, TrackMax, FadeColour(Theme.SliderEmpty, Fade), 7.0f * S);
    if (Split > TrackMin.x + 0.5f)
    {
        DrawList->PushClipRect(TrackMin, ImVec2(Split, TrackMax.y), true);
        DrawList->AddRectFilled(TrackMin, TrackMax, FadeColour(Theme.Accent, Fade), 7.0f * S);
        DrawList->PopClipRect();
    }
    const ImVec2 Thumb(TrackMin.x + 8.5f * S + Fill * Travel, TrackMin.y + 7.0f * S);
    DrawList->AddCircleFilled(Thumb, 9.5f * S, FadeColour(Theme.ThumbHalo, Fade), 32);
    DrawList->AddCircleFilled(Thumb, 8.5f * S, FadeColour(Theme.ThumbRing, Fade), 32);
    DrawList->AddCircleFilled(Thumb, 5.5f * S, FadeColour(Theme.Accent, Fade), 32);
    return Moved;
}

bool ObservatoryColumn::ConstructSliderInteger(const char* Id, const char* Label, uint32_t& Quantity, uint32_t Minimum, uint32_t Maximum,
                                               const char* Unit, bool Enabled, const char* Tooltip)
{
    float Setting = static_cast<float>(Quantity);
    if (!ConstructSlider(Id, Label, Setting, static_cast<float>(Minimum), static_cast<float>(Maximum), 1.0f, Unit, 1.0f, Enabled, Tooltip))
    {
        return false;
    }
    const uint32_t Rounded = static_cast<uint32_t>(std::lround(std::clamp(Setting, static_cast<float>(Minimum), static_cast<float>(Maximum))));
    const bool     Moved   = Rounded != Quantity;
    Quantity               = Rounded;
    return Moved;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    CAPTIONS / PRESETS / SELECTS / ROWS
//------------------------------------------------------------------------------------------------------------------------

void ObservatoryColumn::ConstructCaption(const char* Text, float MarginTop, float MarginBase)
{
    // 📝 .co-caption: 10 px / 1.6.
    const float  Height = ConstructParagraph(Faces.Regular, 10.0f * Scale, 1.6f, QueryCursor(), Width, Theme.Caption, Text, true) / Scale;
    const ImVec2 Top    = Space(Height, MarginTop, MarginBase);
    (void)ConstructParagraph(Faces.Regular, 10.0f * Scale, 1.6f, Top, Width, Theme.Caption, Text);
}

int ObservatoryColumn::ConstructPresets(const char* Id, const char* const* Labels, int Count, int PressedIndex)
{
    if (Count <= 0) return -1;
    // 📝 .so-presets: grid of Count, gap 6 px, margin 12 px 0; .so-preset 34 px, radius 15 px, 10 px text.
    const float  S       = Scale;
    const ImVec2 Top     = Space(34.0f, 12.0f, 12.0f);
    const float  Gap     = 6.0f * S;
    const float  Wide    = (Width - Gap * static_cast<float>(Count - 1)) / static_cast<float>(Count);
    int          Chosen  = -1;
    ImGui::PushID(Id);
    for (int Index = 0; Index < Count; ++Index)
    {
        const ImVec2 Min(Top.x + static_cast<float>(Index) * (Wide + Gap), Top.y);
        const ImVec2 Max(Min.x + Wide, Min.y + 34.0f * S);
        ImGui::SetCursorScreenPos(Min);
        ImGui::PushID(Index);
        if (ImGui::InvisibleButton("##Preset", ImVec2(Wide, 34.0f * S))) Chosen = Index;
        const bool Hovered = ImGui::IsItemHovered();
        ImGui::PopID();
        const bool Pressed = Index == PressedIndex;
        DrawList->AddRectFilled(Min, Max, Pressed ? Theme.PresetPressedFill : (Hovered ? Theme.TabHoverFill : Theme.PresetFill), 15.0f * S);
        DrawList->AddRect(Min, Max, Pressed ? Theme.PresetPressedBorder : Theme.PresetBorder, 15.0f * S, ImDrawFlags_None, S);
        const float Advance = MeasureGlyphRun(Faces.Regular, 10.0f * S, Labels[Index]);
        (void)ConstructGlyphRun(Faces.Regular, 10.0f * S,
                                ImVec2(Min.x + 0.5f * (Wide - Advance), Min.y + 0.5f * (34.0f * S - EmPixelHeight * 10.0f * S) + EmAscent * 10.0f * S),
                                Pressed ? Theme.PresetPressedText : Theme.PresetText, Labels[Index]);
    }
    ImGui::PopID();
    return Chosen;
}

bool ObservatoryColumn::ConstructSelect(const char* Id, const char* Label, const char* const* Options, int Count, int& InOutIndex, bool Enabled,
                                        const char* Tooltip)
{
    // 📝 .co-card .ne-control (margin 12 px 0): the 10 px label (line 16 px, margin-bottom 9 px), then the 32 px select.
    const float  S    = Scale;
    const ImVec2 Top  = Space(16.0f + 9.0f + 32.0f, 12.0f, 12.0f);
    const float  Fade = Enabled ? 1.0f : 0.45f;
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(Top.x, ResolveBaseline(Top.y, 10.0f * S, 1.6f)), FadeColour(Theme.ControlLabel, Fade), Label);
    const ImVec2 FieldMin(Top.x, Top.y + 25.0f * S);
    const ImVec2 FieldMax(Top.x + Width, FieldMin.y + 32.0f * S);
    bool         Changed = false;
    ImGui::PushID(Id);
    ImGui::SetCursorScreenPos(FieldMin);
    if (!Enabled) ImGui::BeginDisabled();
    if (ImGui::InvisibleButton("##Select", ImVec2(Width, 32.0f * S)) && Enabled) ImGui::OpenPopup("##SelectOptions");
    if (!Enabled) ImGui::EndDisabled();
    ConstructTooltipText(Tooltip);
    DrawList->AddRectFilled(FieldMin, FieldMax, FadeColour(Theme.SelectFill, Fade), 12.0f * S);
    DrawList->AddRect(FieldMin, FieldMax, FadeColour(Theme.SelectBorder, Fade), 12.0f * S, ImDrawFlags_None, S);
    const char* Current = (InOutIndex >= 0 && InOutIndex < Count) ? Options[InOutIndex] : "";
    (void)ConstructGlyphRun(Faces.Regular, 11.0f * S,
                            ImVec2(FieldMin.x + 12.0f * S, FieldMin.y + 0.5f * (32.0f * S - EmPixelHeight * 11.0f * S) + EmAscent * 11.0f * S),
                            FadeColour(Theme.SelectText, Fade), Current);
    // 📝 The native select's chevron.
    const ImVec2 Chevron(FieldMax.x - 16.0f * S, 0.5f * (FieldMin.y + FieldMax.y));
    DrawList->AddLine(ImVec2(Chevron.x - 4.0f * S, Chevron.y - 2.0f * S), ImVec2(Chevron.x, Chevron.y + 2.0f * S), FadeColour(Theme.SelectText, Fade), 1.4f * S);
    DrawList->AddLine(ImVec2(Chevron.x, Chevron.y + 2.0f * S), ImVec2(Chevron.x + 4.0f * S, Chevron.y - 2.0f * S), FadeColour(Theme.SelectText, Fade), 1.4f * S);
    ImGui::SetNextWindowPos(ImVec2(FieldMin.x, FieldMax.y + 2.0f * S));
    ImGui::SetNextWindowSize(ImVec2(Width, 0.0f));
    ImGui::PushStyleColor(ImGuiCol_PopupBg, Theme.SelectFill);
    ImGui::PushStyleColor(ImGuiCol_Border, Theme.SelectBorder);
    ImGui::PushStyleVar(ImGuiStyleVar_PopupRounding, 12.0f * S);
    if (ImGui::BeginPopup("##SelectOptions"))
    {
        for (int Index = 0; Index < Count; ++Index)
        {
            ImGui::PushStyleColor(ImGuiCol_Text, Theme.SelectText);
            if (ImGui::Selectable(Options[Index], Index == InOutIndex) && Index != InOutIndex)
            {
                InOutIndex = Index;
                Changed    = true;
            }
            ImGui::PopStyleColor();
        }
        ImGui::EndPopup();
    }
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);
    ImGui::PopID();
    return Changed;
}

bool ObservatoryColumn::ConstructDateRow(const char* Id, const char* Label, std::string& InOutText, bool Enabled, const char* Tooltip)
{
    // 📝 .co-data-row: border-top 1 px, padding 11 px 0, 10 px label; .so-date 12 px field, padding 6 px, radius 9 px, ≤ 58 %.
    const float  S     = Scale;
    const float  Field = 6.0f + 12.0f * EmPixelHeight + 6.0f + 2.0f;
    const ImVec2 Top   = Space(1.0f + 11.0f + Field + 11.0f, 0.0f, 0.0f);
    const float  Fade  = Enabled ? 1.0f : 0.45f;
    DrawList->AddLine(ImVec2(Top.x, Top.y + 0.5f * S), ImVec2(Top.x + Width, Top.y + 0.5f * S), Theme.DataRowRule, S);
    const float RowMid = Top.y + (1.0f + 11.0f + 0.5f * Field) * S;
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(Top.x, RowMid - 0.5f * EmPixelHeight * 10.0f * S + EmAscent * 10.0f * S),
                            FadeColour(Theme.DataRowText, Fade), Label);
    const float  FieldWide = std::min(0.58f * Width, 120.0f * S);
    const ImVec2 FieldMin(Top.x + Width - FieldWide, RowMid - 0.5f * Field * S);
    const ImVec2 FieldMax(Top.x + Width, RowMid + 0.5f * Field * S);
    bool         Changed = false;
    ImGui::PushID(Id);
    ImGui::SetCursorScreenPos(ImVec2(FieldMin.x + 6.0f * S, FieldMin.y + 1.0f * S));
    if (!Enabled) ImGui::BeginDisabled();
    char Buffer[32] = {};
    std::snprintf(Buffer, sizeof(Buffer), "%s", InOutText.c_str());
    ImGui::PushStyleColor(ImGuiCol_FrameBg, ResolveCssColour(0x00000000));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ResolveCssColour(0x00000000));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ResolveCssColour(0x00000000));
    ImGui::PushStyleColor(ImGuiCol_Text, ResolveCssColour(0xE7D8B9FF));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(0.0f, 5.0f * S));
    // 📝 PushFont takes the size before the style's global font scales.
    const ImGuiStyle& Style = ImGui::GetStyle();
    ImGui::PushFont(Faces.Regular, 12.0f * EmPixelHeight * S / std::max(0.01f, Style.FontScaleMain * Style.FontScaleDpi));
    ImGui::SetNextItemWidth(FieldWide - 12.0f * S);
    if (ImGui::InputText("##Date", Buffer, sizeof(Buffer), ImGuiInputTextFlags_EnterReturnsTrue | ImGuiInputTextFlags_CharsScientific) && Enabled)
    {
        InOutText = Buffer;
        Changed   = true;
    }
    ImGui::PopFont();
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(4);
    if (!Enabled) ImGui::EndDisabled();
    ConstructTooltipText(Tooltip);
    ImGui::PopID();
    DrawList->AddRectFilled(FieldMin, FieldMax, FadeColour(ResolveCssColour(0x17161080), Fade), 9.0f * S);
    DrawList->AddRect(FieldMin, FieldMax, FadeColour(ResolveCssColour(0xE8C78B25), Fade), 9.0f * S, ImDrawFlags_None, S);
    return Changed;
}

bool ObservatoryColumn::ConstructTintRow(const char* Id, const char* Label, float (&InOutLinear)[3], bool Enabled, const char* Tooltip)
{
    // 📝 .so-tint-row: the pill (padding 8 px 12 px, ≥ 145 px, radius 999 px) with a 16 px dot, the sRGB hex and ↗.
    const float  S     = Scale;
    const float  Pill  = 8.0f + 11.0f * 1.4f + 8.0f + 2.0f;
    const ImVec2 Top   = Space(1.0f + 11.0f + Pill + 11.0f, 0.0f, 0.0f);
    const float  Fade  = Enabled ? 1.0f : 0.45f;
    DrawList->AddLine(ImVec2(Top.x, Top.y + 0.5f * S), ImVec2(Top.x + Width, Top.y + 0.5f * S), Theme.DataRowRule, S);
    const float RowMid = Top.y + (1.0f + 11.0f + 0.5f * Pill) * S;
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(Top.x, RowMid - 0.5f * EmPixelHeight * 10.0f * S + EmAscent * 10.0f * S),
                            FadeColour(Theme.DataRowText, Fade), Label);
    // 📝 Linear → sRGB the demo's way: channel^(1/2.2).
    int Channels[3] = {};
    for (int Channel = 0; Channel < 3; ++Channel)
    {
        Channels[Channel] = static_cast<int>(std::lround(std::pow(std::clamp(InOutLinear[Channel], 0.0f, 1.0f), 1.0f / 2.2f) * 255.0f));
    }
    char Hex[16] = {};
    std::snprintf(Hex, sizeof(Hex), "#%02X%02X%02X", Channels[0], Channels[1], Channels[2]);
    const float  PillWide = std::max(145.0f * S, MeasureGlyphRun(Faces.Regular, 11.0f * S, Hex) + (12.0f + 16.0f + 9.0f + 9.0f + 12.0f + 12.0f) * S);
    const ImVec2 PillMin(Top.x + Width - PillWide, RowMid - 0.5f * Pill * S);
    const ImVec2 PillMax(Top.x + Width, RowMid + 0.5f * Pill * S);
    bool         Changed = false;
    ImGui::PushID(Id);
    ImGui::SetCursorScreenPos(PillMin);
    if (!Enabled) ImGui::BeginDisabled();
    if (ImGui::InvisibleButton("##Tint", ImVec2(PillWide, Pill * S)) && Enabled) ImGui::OpenPopup("##TintPicker");
    if (!Enabled) ImGui::EndDisabled();
    ConstructTooltipText(Tooltip);
    if (ImGui::BeginPopup("##TintPicker"))
    {
        float Picked[3] = {static_cast<float>(Channels[0]) / 255.0f, static_cast<float>(Channels[1]) / 255.0f, static_cast<float>(Channels[2]) / 255.0f};
        if (ImGui::ColorPicker3("##TintColour", Picked, ImGuiColorEditFlags_NoSidePreview | ImGuiColorEditFlags_DisplayHex))
        {
            for (int Channel = 0; Channel < 3; ++Channel) InOutLinear[Channel] = std::pow(std::clamp(Picked[Channel], 0.0f, 1.0f), 2.2f);
            Changed = true;
        }
        ImGui::EndPopup();
    }
    ImGui::PopID();
    DrawList->AddRectFilled(PillMin, PillMax, FadeColour(Theme.TagFill, Fade), 999.0f);
    DrawList->AddRect(PillMin, PillMax, FadeColour(ResolveCssColour(0xE8C78B30), Fade), 999.0f, ImDrawFlags_None, S);
    const ImVec2 Dot(PillMin.x + (13.0f + 8.0f) * S, RowMid);
    DrawList->AddCircleFilled(Dot, 11.0f * S, FadeColour(ResolveCssColour(0xFFFFFF0A), Fade), 32);
    DrawList->AddCircleFilled(Dot, 8.0f * S, FadeColour(IM_COL32(Channels[0], Channels[1], Channels[2], 255), Fade), 32);
    const float TextBaseline = RowMid - 0.5f * EmPixelHeight * 11.0f * S + EmAscent * 11.0f * S;
    (void)ConstructGlyphRun(Faces.Regular, 11.0f * S, ImVec2(Dot.x + (8.0f + 9.0f) * S, TextBaseline), FadeColour(ResolveCssColour(0xE5D8BAFF), Fade), Hex);
    const float ArrowWide = MeasureGlyphRun(Faces.Regular, 11.0f * S, "\xE2\x86\x97");
    (void)ConstructGlyphRun(Faces.Regular, 11.0f * S, ImVec2(PillMax.x - 13.0f * S - ArrowWide, TextBaseline), FadeColour(ResolveCssColour(0xE5D8BAFF), Fade),
                            "\xE2\x86\x97");
    return Changed;
}

bool ObservatoryColumn::ConstructToggle(const char* Id, const char* Label, bool& InOutEnabled, bool Enabled, const char* Tooltip)
{
    // 📝 .co-toggle: space-between, padding 11 px 12 px, radius 12 px, margin-bottom 12 px, 11 px label, 10 px ON / OFF.
    const float  S    = Scale;
    const float  Tall = 1.0f + 11.0f + 11.0f * EmPixelHeight + 11.0f + 1.0f;
    const ImVec2 Top  = Space(Tall, 0.0f, 12.0f);
    const ImVec2 Max(Top.x + Width, Top.y + Tall * S);
    const float  Fade    = Enabled ? 1.0f : 0.45f;
    bool         Flipped = false;
    ImGui::PushID(Id);
    ImGui::SetCursorScreenPos(Top);
    if (!Enabled) ImGui::BeginDisabled();
    if (ImGui::InvisibleButton("##Toggle", ImVec2(Width, Tall * S)) && Enabled)
    {
        InOutEnabled = !InOutEnabled;
        Flipped      = true;
    }
    if (!Enabled) ImGui::EndDisabled();
    ConstructTooltipText(Tooltip);
    ImGui::PopID();
    DrawList->AddRectFilled(Top, Max, FadeColour(Theme.ToggleFill, Fade), 12.0f * S);
    DrawList->AddRect(Top, Max, FadeColour(Theme.ToggleBorder, Fade), 12.0f * S, ImDrawFlags_None, S);
    const float Mid = 0.5f * (Top.y + Max.y);
    (void)ConstructGlyphRun(Faces.Regular, 11.0f * S, ImVec2(Top.x + 13.0f * S, Mid - 0.5f * EmPixelHeight * 11.0f * S + EmAscent * 11.0f * S),
                            FadeColour(Theme.ToggleText, Fade), Label);
    const char* Reading = InOutEnabled ? "ON" : "OFF";
    const float Advance = MeasureGlyphRun(Faces.Regular, 10.0f * S, Reading);
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S, ImVec2(Max.x - 13.0f * S - Advance, Mid - 0.5f * EmPixelHeight * 10.0f * S + EmAscent * 10.0f * S),
                            FadeColour(InOutEnabled ? Theme.ToggleCaptionOn : Theme.ToggleCaption, Fade), Reading);
    return Flipped;
}

bool ObservatoryColumn::ConstructNextButton(const char* Id, const char* Label)
{
    // 📝 .co-next: full width, ≥ 42 px, radius 18 px, 10 px, margin 4 px 0 12 px.
    const float  S   = Scale;
    const ImVec2 Top = Space(42.0f, 4.0f, 12.0f);
    const ImVec2 Max(Top.x + Width, Top.y + 42.0f * S);
    ImGui::SetCursorScreenPos(Top);
    const bool Pressed = ImGui::InvisibleButton(Id, ImVec2(Width, 42.0f * S));
    const bool Hovered = ImGui::IsItemHovered();
    DrawList->AddRectFilled(Top, Max, Hovered ? Theme.NextHoverFill : Theme.NextFill, 18.0f * S);
    DrawList->AddRect(Top, Max, Hovered ? Theme.NextHoverBorder : Theme.NextBorder, 18.0f * S, ImDrawFlags_None, S);
    const float Advance = MeasureGlyphRun(Faces.Regular, 10.0f * S, Label);
    (void)ConstructGlyphRun(Faces.Regular, 10.0f * S,
                            ImVec2(Top.x + 0.5f * (Width - Advance), Top.y + 0.5f * (42.0f * S - EmPixelHeight * 10.0f * S) + EmAscent * 10.0f * S),
                            Theme.NextText, Label);
    return Pressed;
}

void ObservatoryColumn::ConstructAtlasFooter(const char* Leading, const char* Trailing, float FontSize, float PaddingTop, float PaddingBase)
{
    // 📝 .co-atlas-footer: border-top 1 px, space-between, letter-spacing .2 px.
    const float  S   = Scale;
    const ImVec2 Top = Space(1.0f + PaddingTop + FontSize * 1.4f + PaddingBase, 0.0f, 0.0f);
    DrawList->AddLine(ImVec2(Top.x, Top.y + 0.5f * S), ImVec2(Top.x + Width, Top.y + 0.5f * S), Theme.AtlasFooterRule, S);
    const float Baseline = ResolveBaseline(Top.y + (1.0f + PaddingTop) * S, FontSize * S, 1.4f);
    (void)ConstructGlyphRun(Faces.Regular, FontSize * S, ImVec2(Top.x, Baseline), Theme.AtlasFooterText, Leading, 0.2f * S);
    const float Advance = MeasureGlyphRun(Faces.Regular, FontSize * S, Trailing, 0.2f * S);
    (void)ConstructGlyphRun(Faces.Regular, FontSize * S, ImVec2(Top.x + Width - Advance, Baseline), Theme.AtlasFooterText, Trailing, 0.2f * S);
}

void ObservatoryColumn::ConstructFooter(const char* Leading, const char* Trailing)
{
    // 📝 .co-footer: border-top 1 px, padding 15 px 2 px 5 px, margin-top 17 px, 8 px, letter-spacing .6 px.
    const float  S   = Scale;
    const ImVec2 Top = Space(1.0f + 15.0f + 8.0f * 1.4f + 5.0f, 17.0f, 0.0f);
    DrawList->AddLine(ImVec2(Top.x, Top.y + 0.5f * S), ImVec2(Top.x + Width, Top.y + 0.5f * S), Theme.FooterRule, S);
    const float Baseline = ResolveBaseline(Top.y + 16.0f * S, 8.0f * S, 1.4f);
    (void)ConstructGlyphRun(Faces.Regular, 8.0f * S, ImVec2(Top.x + 2.0f * S, Baseline), Theme.FooterText, Leading, 0.6f * S);
    const float Advance = MeasureGlyphRun(Faces.Regular, 8.0f * S, Trailing, 0.6f * S);
    (void)ConstructGlyphRun(Faces.Regular, 8.0f * S, ImVec2(Top.x + Width - 2.0f * S - Advance, Baseline), Theme.FooterText, Trailing, 0.6f * S);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    DIAGRAMS
//------------------------------------------------------------------------------------------------------------------------

ObservatoryPen ObservatoryColumn::BeginDiagram(const char* Id, float LogicalWidth, float LogicalHeight, float MarginTop, float MarginBase,
                                               ObservatoryDiagramDrag* Drag, const char* Tooltip)
{
    const float  PenScale = Width / LogicalWidth;
    const ImVec2 Top      = Space(LogicalHeight * PenScale / Scale, MarginTop, MarginBase);
    if (Drag != nullptr)
    {
        *Drag = ObservatoryDiagramDrag{};
        ImGui::SetCursorScreenPos(Top);
        ImGui::SetNextItemAllowOverlap();
        ImGui::InvisibleButton(Id, ImVec2(Width, LogicalHeight * PenScale));
        ConstructTooltipText(Tooltip);
        if (ImGui::IsItemActive())
        {
            const ImGuiIO& IO = ImGui::GetIO();
            Drag->Engaged     = true;
            Drag->Start       = ImGui::IsItemActivated();
            Drag->Point       = ImVec2((IO.MousePos.x - Top.x) / PenScale, (IO.MousePos.y - Top.y) / PenScale);
            Drag->Delta       = ImVec2(IO.MouseDelta.x / PenScale, IO.MouseDelta.y / PenScale);
        }
    }
    return ObservatoryPen(DrawList, &Faces, Top, PenScale, LogicalWidth, LogicalHeight);
}

} // namespace Frontier
