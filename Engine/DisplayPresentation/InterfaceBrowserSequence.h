//============================================================================================================================================
//                                                   INTERFACEBROWSERSEQUENCE.H
//============================================================================================================================================
// 🧩 The World Browser panel: an outliner on one side, the selected row's properties on the other, on ONE page.
//    Replaces the ImGui inspector that used to hold the scene and render settings. The notch Control Centre is a
//    different thing entirely and is untouched.
//
//    One page, three modes. Either side can take the whole card, animated by a single split fraction. There is no
//    separate properties screen to navigate to and back from — the earlier slide made the same content reachable
//    two ways, one of which needed a back button.
//
//    Engine ⇄ project seam. This draws rows, cards, sliders and toggles. It does not know what a sun is, and it
//    holds no scene state: the project supplies the property rows for the selected object each frame through
//    PropertyBuilder, and reads back edits through the same records. Nothing here includes Projects/.
//
//    Property rows are DECLARED, not drawn by the project. The project appends a description — label, kind,
//    range, target pointer — and this decides layout, hit-testing and how a value is committed. That keeps every
//    panel in the build consistent, and keeps the project free of pixel arithmetic.

#pragma once

#include "ControlKit.h"
#include "InterfaceOutlinerSequence.h"
#include "PixelSpace.h"

#include <cstdint>
#include <functional>
#include <vector>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                    PROPERTY ROWS
//------------------------------------------------------------------------------------------------------------------------

enum class PropertyKindCategory : uint32_t
{
    Heading = 0,   // a card title; starts a new card
    Slider  = 1,   // label + value pill + kit slider
    Switch  = 2,   // label + 46 × 26 switch
    Vector  = 3,   // label + three axis pills, X / Y / Z
    Readout = 4,   // label + right-aligned static text
    Tint    = 5,   // label + the swatch row (containers only)
    Notes   = 6,   // a full-width multi-line field
};

// One declared row. Targets are raw pointers into the project's own state: the browser writes through them
//    directly, so there is no copy-back step to forget.
struct PropertyRowRecord
{
    PropertyKindCategory Kind    = PropertyKindCategory::Readout;
    const char*          Label   = "";
    const char*          Unit    = "";
    const char*          Text    = "";      // Readout / Heading
    float*               Value   = nullptr; // Slider
    float*               Vector3 = nullptr; // Vector — three consecutive floats
    bool*                Flag    = nullptr; // Switch
    ColorQuad*           Tint    = nullptr; // Tint
    bool*                HasTint = nullptr;
    float                Minimum = 0.0f;
    float                Maximum = 1.0f;
    uint32_t             Decimals = 2u;
    bool                 ReadOnly = false;  // locked rows show values but refuse edits
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    ROW GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

// The negotiated widths of one property row: label, value pill, slider. Pure arithmetic and a free function, so
//    the proof can assert it at any pane width without a device, a window or an ImGui context.
//
//    🔴 It exists because the previous version did not negotiate at all. It reserved 104 px for a pill the kit
//    drew at 118, then forced the slider to a 90 px minimum measured from wherever that left off. On a panel
//    narrower than about 380 px the result was a track painted across the pill's unit cell and a slider running
//    off the card, off the window and past the edge of the screen — a control that cannot be grabbed, on a row
//    whose number is covered up.
struct PropertyRowGeometry
{
    float LabelX        = 0.0f;   // [px]
    float LabelY        = 0.0f;   // [px] relative to the row's top
    float LabelWidth    = 0.0f;   // [px]
    float ControlY      = 0.0f;   // [px] relative to the row's top
    float PillX         = 0.0f;   // [px]
    float PillWidth     = 0.0f;   // [px]
    float PillUnitWidth = 0.0f;   // [px]
    float SliderX       = 0.0f;   // [px]
    float SliderWidth   = 0.0f;   // [px]
    bool  SliderVisible = true;   // false when the row is too narrow for a slider to mean anything
    bool  LabelAbove    = true;   // the control owns the full width on its own line
};

// InnerX / InnerWidth are the card's content box: everything this returns lies inside it.
[[nodiscard]] PropertyRowGeometry SolvePropertyRow(float InnerX, float InnerWidth, PropertyKindCategory Kind) noexcept;

// The height one row of this kind occupies, including the label line when it has one.
[[nodiscard]] float QueryPropertyRowHeight(PropertyKindCategory Kind) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                    PANEL LAYOUT
//------------------------------------------------------------------------------------------------------------------------

// 🔴 ONE layout, consumed twice. The card backgrounds and the rows used to be positioned by two separate walks
//    over the same list, each doing its own arithmetic — and they disagreed: a card was drawn 14 px taller than
//    the space it had claimed, so every card overlapped the top of the one below it. Two passes that must agree
//    about geometry will eventually not, so there is now one pass and both consumers read its output.
struct PanelPlacement
{
    PlaneExtent Extent{};              // where it goes
    uint32_t    Row = 0xFFFFFFFFu;     // index into the property list, or kOutlinerNoRow for a card background
};

struct PanelLayout
{
    std::vector<PanelPlacement> Cards;   // one per Heading, in order
    std::vector<PanelPlacement> Rows;    // one per non-Heading row, in order
    float Height = 0.0f;                 // [px] total, so the pane knows how far it can scroll
};

// Spacing is DERIVED from the tokens below rather than written out at each site, which is what makes it
//    possible to state — and then assert — that nothing overlaps anything.
//    They come from References/WorldBrowser-Mock.html: .pcard{padding:14px 16px 16px;margin-bottom:12px},
//    h4{margin-bottom:12px}, .prow{min-height:30px;margin-bottom:10px}.
struct PanelSpacing
{
    static constexpr float CardPadTop    = 14.0f;
    static constexpr float CardPadSide   = 16.0f;
    static constexpr float CardPadBottom = 16.0f;
    static constexpr float CardGap       = 12.0f;
    static constexpr float HeadingHeight = 14.0f;
    static constexpr float HeadingGap    = 12.0f;
    static constexpr float RowGap        = 10.0f;
    static constexpr float ControlHeight = 30.0f;
    static constexpr float LabelHeight   = 15.0f;
    static constexpr float LabelGap      = 5.0f;
    static constexpr float NotesHeight   = 72.0f;
};

[[nodiscard]] PanelLayout SolvePanelLayout(const std::vector<PropertyRowRecord>& Rows,
                                           float CardX, float CardWidth, float TopY) noexcept;

//------------------------------------------------------------------------------------------------------------------------
//                                                       SEQUENCE
//------------------------------------------------------------------------------------------------------------------------

class InterfaceBrowserSequence
{
public:
    // The project fills the row list for whichever outliner row is selected. Called once per frame; the browser
    //    never caches it, so the project can rebuild it freely as selection changes.
    using PropertyBuilder = std::function<void(uint32_t RowOrdinal, std::vector<PropertyRowRecord>& Rows)>;

    [[nodiscard]] InterfaceOutlinerSequence& Outliner() noexcept { return Tree; }

    void AssignTitle(const char* Title, const char* Subtitle) noexcept { HeaderTitle = Title; HeaderSubtitle = Subtitle; }
    void AssignPropertyBuilder(PropertyBuilder Builder) noexcept { Builder_ = std::move(Builder); }

    [[nodiscard]] OutlinerLayoutMode QueryLayoutMode() const noexcept { return Mode; }
    void AssignLayoutMode(OutlinerLayoutMode Value) noexcept { Mode = Value; }

    // Feed one keystroke to whichever text field currently has focus. Returns true when the browser consumed it,
    //    so the host can keep it away from the camera — a WASD fly-through that also types into a rename field is
    //    the classic bug here.
    bool RecordKey(uint32_t Key, bool Shift, bool Control) noexcept;
    bool RecordCharacter(uint32_t Codepoint) noexcept;
    [[nodiscard]] bool EditingText() const noexcept;

    void Advance(float DeltaSeconds) noexcept;
    void Record(PixelSpace& Surface, const PlaneExtent& Extent, const ControlPointer& Pointer, float Opacity = 1.0f) noexcept;

    static constexpr float kHeaderHeight = 56.0f;
    static constexpr float kFooterHeight = 40.0f;
    static constexpr float kSplitSeconds = 0.32f;

private:
    void RecordHeader    (PixelSpace& Surface, const PlaneExtent& Extent, const ControlPointer& Pointer, float Opacity) noexcept;
    void RecordSearchRow (PixelSpace& Surface, const PlaneExtent& Extent, const ControlPointer& Pointer, float Opacity) noexcept;
    void RecordProperties(PixelSpace& Surface, const PlaneExtent& Extent, const ControlPointer& Pointer, float Opacity) noexcept;

    InterfaceOutlinerSequence      Tree;
    std::vector<PropertyRowRecord> Properties;   // rebuilt each frame, capacity retained so the loop never allocates
    PropertyBuilder                Builder_;

    const char* HeaderTitle    = "World Browser";
    const char* HeaderSubtitle = "";

    OutlinerLayoutMode Mode      = OutlinerLayoutMode::Split;
    float              SplitNow  = 0.54f;   // animated toward the mode's target fraction
    bool               MenuOpen  = false;   // the type-filter dropdown
    uint32_t           DragRow   = kOutlinerNoRow;  // slider being dragged, index into Properties
    // ⚠️ One offset per pane, and the wheel goes to whichever the pointer is over. A single shared offset moves
    //    the pane the user is not looking at, which reads as the panel losing its place.
    float              TreeScroll            = 0.0f;
    float              PropertyScroll        = 0.0f;
    float              PropertyContentHeight = 0.0f;
    uint32_t           DragAxis  = 0u;
    float              DoubleClickTimer = 0.0f;
    uint32_t           DoubleClickRow   = kOutlinerNoRow;
};

} // namespace Frontier
