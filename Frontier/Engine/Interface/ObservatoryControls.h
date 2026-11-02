/*==========================================================================================================================================
                                                        OBSERVATORYCONTROLS.H
==========================================================================================================================================*/
// 🧩 The VehicleHMI demo's environment Inspector pages ("observatories") as ImGui controls, 1:1 with CloudInspector.css,
//    SunInspector.css, NativeEnvironment.css and SliderControl.css: the page header, section tabs, instrument cards,
//    readouts, metric tiles, quick switch tiles, observatory sliders, selects, presets, data rows, tags, the next button,
//    footers, and a pen that rasterizes the demo's canvas diagrams in their own logical coordinates.

#pragma once

#include <imgui.h>

#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

struct EditorTypefaces;

//------------------------------------------------------------------------------------------------------------------------
//                                                    COLOUR LITERALS
//------------------------------------------------------------------------------------------------------------------------

// 📝 A CSS #RRGGBBAA literal as an ImGui colour.
[[nodiscard]] constexpr ImU32 ResolveCssColour(uint32_t RedGreenBlueAlpha) noexcept
{
    return IM_COL32((RedGreenBlueAlpha >> 24) & 0xFF, (RedGreenBlueAlpha >> 16) & 0xFF, (RedGreenBlueAlpha >> 8) & 0xFF,
                    RedGreenBlueAlpha & 0xFF);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                    OBSERVATORY THEME
//------------------------------------------------------------------------------------------------------------------------

// 📝 One page's colours after the stylesheet cascade (CloudInspector.css first, then the page's own sheet).
struct ObservatoryTheme
{
    ImU32 PageFill            = 0;   // .native-environment background
    ImU32 Ink                 = 0;   // --co-ink
    ImU32 Muted               = 0;   // --co-muted
    ImU32 Accent              = 0;   // --co-accent
    ImU32 Eyebrow             = 0;   // .co-eyebrow
    ImU32 Subtitle            = 0;   // .co-subtitle
    ImU32 CardHeading         = 0;   // .co-card-heading
    ImU32 Index               = 0;   // .co-index
    ImU32 Label               = 0;   // .co-label
    ImU32 ReadoutUnit         = 0;   // .co-readout small
    ImU32 Caption             = 0;   // .co-caption
    ImU32 ControlLabel        = 0;   // .co-card .ne-control-label
    ImU32 CardBorder          = 0;   // .co-card border
    ImU32 TabRailFill         = 0;   // .co-tabs background (0: no rail)
    ImU32 TabRailBorder       = 0;
    ImU32 TabText             = 0;   // .co-tab
    ImU32 TabSelectedFill     = 0;   // .co-tab[aria-selected=true]
    ImU32 TabSelectedText     = 0;
    ImU32 TabSelectedRing     = 0;
    ImU32 TabHoverFill        = 0;   // .co-tab:hover
    ImU32 TabHoverText        = 0;
    ImU32 MetricFill          = 0;   // .co-kpis .co-readout
    ImU32 MetricBorder        = 0;
    ImU32 MetricLeadFill      = 0;   // .co-kpis .co-readout:last-child
    ImU32 MetricLeadInk       = 0;
    ImU32 MetricLeadMuted     = 0;
    ImU32 TagFill             = 0;   // .co-tag
    ImU32 TagBorder           = 0;
    ImU32 TagText             = 0;
    ImU32 ModeFill            = 0;   // the title-line action pill (.so-reset / .co-power)
    ImU32 ModeBorder          = 0;
    ImU32 ModeText            = 0;
    ImU32 ModeHoverFill       = 0;
    ImU32 NextFill            = 0;   // .co-next
    ImU32 NextBorder          = 0;
    ImU32 NextText            = 0;
    ImU32 NextHoverFill       = 0;
    ImU32 NextHoverBorder     = 0;
    ImU32 SliderRule          = 0;   // .co-slider border-top
    ImU32 SliderEmpty         = 0;   // the track past --slider-fill
    ImU32 ThumbRing           = 0;   // the thumb's 3 px border
    ImU32 ThumbHalo           = 0;   // the thumb's 1 px outer shadow
    ImU32 SliderNumber        = 0;   // .co-slider .ne-number
    ImU32 SliderUnit          = 0;   // .co-slider .ne-unit
    ImU32 DataRowText         = 0;   // .co-data-row
    ImU32 DataRowRule         = 0;
    ImU32 SelectFill          = 0;   // .co-card .ne-select
    ImU32 SelectBorder        = 0;
    ImU32 SelectText          = 0;
    ImU32 PresetFill          = 0;   // .so-preset
    ImU32 PresetBorder        = 0;
    ImU32 PresetText          = 0;
    ImU32 PresetPressedFill   = 0;   // .so-preset[aria-pressed=true]
    ImU32 PresetPressedBorder = 0;
    ImU32 PresetPressedText   = 0;
    ImU32 ToggleFill          = 0;   // .co-toggle
    ImU32 ToggleBorder        = 0;
    ImU32 ToggleText          = 0;
    ImU32 ToggleCaption       = 0;   // .co-toggle > span:last-child
    ImU32 ToggleCaptionOn     = 0;
    ImU32 FooterText          = 0;   // .co-footer
    ImU32 FooterRule          = 0;
    ImU32 AtlasFooterText     = 0;   // .co-atlas-footer
    ImU32 AtlasFooterRule     = 0;

    [[nodiscard]] static ObservatoryTheme ResolveSolar() noexcept;
    [[nodiscard]] static ObservatoryTheme ResolveCloud() noexcept;
    [[nodiscard]] static ObservatoryTheme ResolveAtmosphere() noexcept;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    CARD LOOK
//------------------------------------------------------------------------------------------------------------------------

// 📝 One `.co-card` after its page's `[data-instrument]` rule: fill (flat, or the 125° gradient to FillEnd at 65 %), an
//    optional radial glow ("radial-gradient(ellipse at X% Y%, Glow, transparent Extent)"), border, radius, padding.
struct ObservatoryCardLook
{
    ImU32  Fill         = 0;                    // 0: transparent
    ImU32  FillEnd      = 0;                    // 0: flat fill
    ImU32  Glow         = 0;                    // 0: no radial glow
    ImVec2 GlowCentre   = ImVec2(0.5f, 0.5f);   // [-] ellipse centre as a fraction of the card
    float  GlowExtent   = 0.7f;                 // [-] the transparent stop along the farthest-corner ellipse
    ImU32  Border       = 0;                    // 0: no border
    ImU32  TopRule      = 0;                    // a top border only (border-top), when Border is 0
    float  Radius       = 23.0f;                // [px]
    float  PaddingTop   = 18.0f;                // [px]
    float  PaddingSide  = 18.0f;                // [px]
    float  PaddingBase  = 18.0f;                // [px]
    float  MarginTop    = 0.0f;                 // [px]
    float  MarginBase   = 12.0f;                // [px]
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    METRIC TILE / QUICK SWITCH
//------------------------------------------------------------------------------------------------------------------------

// 📝 One `.co-kpis .co-readout`: label, figure, and the small caption beneath the figure.
struct ObservatoryMetric
{
    std::string Label{};
    std::string Figure{};
    std::string Unit{};
};

enum class ObservatoryGlyph : uint8_t
{
    Sun,     // Lucide "sun"
    Orbit,   // the demo's NativeOrbit mark
};

// 📝 One `.ne-tiles .ne-button`: a symbol disc, a caption and ON / OFF. A null Target is the demo's disabled tile
//    ("UNAVAILABLE"); Pending marks a tile whose switch has no native field yet (drawn disabled with its Tooltip).
struct ObservatorySwitchTile
{
    const char*      Caption = "";
    bool*            Target  = nullptr;
    ObservatoryGlyph Glyph   = ObservatoryGlyph::Sun;
    bool             Pending = false;
    bool             PendingReading = false;   // the demo's default reading while pending
    const char*      Tooltip = nullptr;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    OBSERVATORY PEN
//------------------------------------------------------------------------------------------------------------------------

// 📝 The demo's canvas `Pen` (NativeEnvironmentControls.js) over one diagram: logical W×H coordinates mapped onto the
//    diagram's screen rectangle; text sizes are logical canvas pixels, text sits on its alphabetic baseline.
class ObservatoryPen
{
  public:
    ObservatoryPen() = default;
    ObservatoryPen(ImDrawList* InDrawList, const EditorTypefaces* InFaces, ImVec2 InOrigin, float InScale, float InLogicalWidth,
                   float InLogicalHeight) noexcept;

    void Line(ImVec2 From, ImVec2 To, ImU32 Colour, float Width = 1.0f, float DashOn = 0.0f, float DashOff = 0.0f) const;
    void Path(const std::vector<ImVec2>& Points, ImU32 Colour, float Width = 1.0f, float DashOn = 0.0f, float DashOff = 0.0f) const;
    void Circle(ImVec2 Centre, float Radius, ImU32 Fill, ImU32 Stroke = 0) const;
    void Ellipse(ImVec2 Centre, float RadiusX, float RadiusY, ImU32 Fill, ImU32 Stroke = 0) const;
    void Text(ImVec2 Baseline, const char* Caption, ImU32 Colour, float Size = 10.0f, int Alignment = 0) const;   // -1 left, 0 centre, 1 right
    void Rect(ImVec2 Min, ImVec2 Size, ImU32 Fill, float Radius = 0.0f) const;
    // 📝 createRadialGradient(0 → R): rgba(Rgb, Alpha) at the centre fading to transparent at Radius.
    void Glow(ImVec2 Centre, float Radius, ImU32 Rgb, float Alpha) const;
    // 📝 The area between a curve and the baseline Base, coloured per curve point (the spectrum's gradient fill).
    void ShadedArea(const std::vector<ImVec2>& Curve, float Base, const std::vector<ImU32>& Colours) const;
    // 📝 A horizontal multi-stop gradient bar (`X.rect` with a createLinearGradient fill), square-ended.
    void GradientBar(ImVec2 Min, ImVec2 Size, const std::vector<ImU32>& Stops) const;

    [[nodiscard]] ImVec2 QueryScreen(ImVec2 Logical) const noexcept;
    [[nodiscard]] ImVec2 QueryLogical(ImVec2 Screen) const noexcept;
    [[nodiscard]] float  QueryScale() const noexcept { return Scale; }

  private:
    ImDrawList*            DrawList      = nullptr;
    const EditorTypefaces* Faces         = nullptr;
    ImVec2                 Origin        = ImVec2(0.0f, 0.0f);
    float                  Scale         = 1.0f;   // [screen px / logical px]
    float                  LogicalWidth  = 640.0f;
    float                  LogicalHeight = 420.0f;
};

// 📝 What the pointer did on an interactive diagram this frame, in logical coordinates (the demo's Drag event).
struct ObservatoryDiagramDrag
{
    bool   Engaged = false;   // the pointer is held on the diagram
    bool   Start   = false;   // pressed this frame
    ImVec2 Point   = ImVec2(0.0f, 0.0f);
    ImVec2 Delta   = ImVec2(0.0f, 0.0f);
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    OBSERVATORY COLUMN
//------------------------------------------------------------------------------------------------------------------------

// 📝 Lays one page down the Inspector column. Every metric is the CSS pixel value times Scale; vertical margins collapse
//    between neighbours the way block margins do, and never through a card's padding. Ids are ImGui ids, unique per page.
class ObservatoryColumn
{
  public:
    static constexpr float PagePadding = 20.0f;   // [px] .native-environment padding

    ObservatoryColumn(const ObservatoryTheme& InTheme, const EditorTypefaces& InFaces, float InScale);

    [[nodiscard]] const ObservatoryTheme& QueryTheme() const noexcept { return Theme; }
    [[nodiscard]] const EditorTypefaces&  QueryFaces() const noexcept { return Faces; }
    [[nodiscard]] float                   QueryScale() const noexcept { return Scale; }
    [[nodiscard]] float                   QueryWidth() const noexcept { return Width; }   // [screen px]
    [[nodiscard]] ImVec2                  QueryCursor() const noexcept { return ImVec2(Left, Cursor); }
    [[nodiscard]] ImDrawList*             QueryDrawList() const noexcept { return DrawList; }

    // 📝 Layout: Space reserves a block of CssHeight with CSS margins and returns its top-left in screen pixels.
    ImVec2 Space(float CssHeight, float MarginTop = 0.0f, float MarginBase = 0.0f);
    void   Finalize();

    // 📝 .co-header: eyebrow, the h1 title with its title-line pill (Reset ↗ / ON), the subtitle; true when the pill was
    //    pressed. A null ActionLabel leaves the pill out.
    bool ConstructHeader(const char* Id, const char* Eyebrow, const char* Title, const char* ActionLabel, const char* Subtitle,
                         const char* ActionTooltip = nullptr);
    // 📝 .co-tabs: equal pills; true when the selection changed.
    bool ConstructTabs(const char* Id, const char* const* Labels, int Count, int& InOutSelected);

    void BeginCard(const ObservatoryCardLook& Look, const char* Heading, const char* Index);
    void EndCard();
    // 📝 The open card's border-box top-left and width (for its absolutely positioned children).
    [[nodiscard]] ImVec2 QueryCardOrigin() const noexcept;
    [[nodiscard]] float  QueryCardWidth() const noexcept;
    // 📝 The container's content width in CSS pixels (the stylesheets' @container breakpoints).
    [[nodiscard]] float  QueryContainerWidth() const noexcept { return PageWidth / Scale; }

    // 📝 .co-readout as a block: label (9 px), figure (FigureSize, light) and its unit on the same baseline.
    void   ConstructReadout(const char* Label, const char* Figure, const char* Unit, float FigureSize = 31.0f, float UnitSize = 10.0f,
                            float FigureTracking = -1.3f, float FigureLineHeight = 1.25f);
    // 📝 The same readout drawn at Min without taking layout space; returns its height.
    float  ConstructReadoutAt(ImVec2 Min, const char* Label, const char* Figure, const char* Unit, float FigureSize, float UnitSize,
                              float FigureTracking, float FigureLineHeight, ImU32 Ink = 0, ImU32 LabelColour = 0, ImU32 UnitColour = 0,
                              float LabelSize = 9.0f, float LabelGap = 5.0f, bool UnitBeneath = false, float UnitGap = 0.0f);
    // 📝 .co-tag (or .so-mode when pressable) at Min; returns its size. Pressed reports a click.
    ImVec2 ConstructTagAt(const char* Id, ImVec2 Min, const char* Text, bool Pressable, bool* Pressed, float FontSize = 9.0f,
                          float PadX = 10.0f, float PadY = 6.0f, float MinHeight = 0.0f, ImU32 Fill = 0, ImU32 TextColour = 0,
                          const char* Tooltip = nullptr);
    [[nodiscard]] float MeasureTag(const char* Text, float FontSize = 9.0f, float PadX = 10.0f) const;

    // 📝 .co-kpis: equal tiles, the last one lit.
    void ConstructMetrics(const ObservatoryMetric* Metrics, int Count);
    // 📝 .ne-tiles (.ne-sun-quick: two columns); true when a switch flipped.
    bool ConstructSwitchTiles(const char* Id, const ObservatorySwitchTile* Tiles, int Count, int Columns);

    // 📝 .co-slider: label, editable figure and unit, the accent track. Quantity is the stored setting; the figure shows
    //    Quantity × DisplayScale. Disabled controls are pending a native field and show Tooltip.
    bool ConstructSlider(const char* Id, const char* Label, float& Quantity, float Minimum, float Maximum, float Step, const char* Unit,
                         float DisplayScale = 1.0f, bool Enabled = true, const char* Tooltip = nullptr);
    bool ConstructSliderInteger(const char* Id, const char* Label, uint32_t& Quantity, uint32_t Minimum, uint32_t Maximum,
                                const char* Unit, bool Enabled = true, const char* Tooltip = nullptr);

    void ConstructCaption(const char* Text, float MarginTop = 6.0f, float MarginBase = 13.0f);
    // 📝 .so-presets: equal buttons; returns the pressed index or -1.
    int  ConstructPresets(const char* Id, const char* const* Labels, int Count, int PressedIndex);
    // 📝 .ne-control with .ne-select; true when the choice changed.
    bool ConstructSelect(const char* Id, const char* Label, const char* const* Options, int Count, int& InOutIndex, bool Enabled = true,
                         const char* Tooltip = nullptr);
    // 📝 .co-data-row holding a text field (the calendar date); true when the text changed.
    bool ConstructDateRow(const char* Id, const char* Label, std::string& InOutText, bool Enabled = true, const char* Tooltip = nullptr);
    // 📝 .co-data-row.so-tint-row: label and the tint pill (dot, hex, ↗); true when the colour changed.
    bool ConstructTintRow(const char* Id, const char* Label, float (&InOutLinear)[3], bool Enabled = true, const char* Tooltip = nullptr);
    // 📝 .co-toggle: label and ON/OFF; true when flipped.
    bool ConstructToggle(const char* Id, const char* Label, bool& InOutEnabled, bool Enabled = true, const char* Tooltip = nullptr);
    // 📝 .co-next: the full-width link button.
    bool ConstructNextButton(const char* Id, const char* Label);
    // 📝 .co-atlas-footer and .co-footer.
    void ConstructAtlasFooter(const char* Leading, const char* Trailing, float FontSize = 8.0f, float PaddingTop = 12.0f, float PaddingBase = 12.0f);
    void ConstructFooter(const char* Leading, const char* Trailing);

    // 📝 .ne-diagram: a logical W×H canvas scaled to the current width; returns the pen. Drag (optional) reports the pointer.
    ObservatoryPen BeginDiagram(const char* Id, float LogicalWidth, float LogicalHeight, float MarginTop, float MarginBase,
                                ObservatoryDiagramDrag* Drag = nullptr, const char* Tooltip = nullptr);

    // 📝 A run of glyphs on a CSS baseline (font-size Size, letter-spacing Tracking); falls back to the monospace face for
    //    code points DM Sans lacks (↗, λ, ≈); returns the advance.
    float ConstructGlyphRun(ImFont* Face, float Size, ImVec2 Baseline, ImU32 Colour, const char* Text, float Tracking = 0.0f) const;
    [[nodiscard]] float MeasureGlyphRun(ImFont* Face, float Size, const char* Text, float Tracking = 0.0f) const;
    // 📝 Wrapped paragraph lines (font-size Size, line-height LineHeight × Size) from Min; returns the height.
    float ConstructParagraph(ImFont* Face, float Size, float LineHeight, ImVec2 Min, float WrapWidth, ImU32 Colour, const char* Text,
                             bool Measure = false) const;

  private:
    struct CardScope
    {
        ObservatoryCardLook Look{};
        float               Top        = 0.0f;
        float               OuterLeft  = 0.0f;
        float               OuterWidth = 0.0f;
    };

    const ObservatoryTheme& Theme;
    const EditorTypefaces&  Faces;
    ImDrawList*             DrawList      = nullptr;
    float                   Scale         = 1.0f;
    float                   Left          = 0.0f;
    float                   Width         = 0.0f;
    float                   PageWidth     = 0.0f;
    float                   Cursor        = 0.0f;
    float                   PendingMargin = 0.0f;
    float                   Lowest        = 0.0f;
    std::vector<CardScope>  Cards{};
};

} // namespace Frontier
