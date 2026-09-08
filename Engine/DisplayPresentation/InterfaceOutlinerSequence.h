//============================================================================================================================================
//                                                  INTERFACEOUTLINERSEQUENCE.H
//============================================================================================================================================
// 🧩 A generic hierarchy browser: an ordered tree of rows with per-row state, search, type filtering, inline
//    rename and an animated twirl. Draws through ControlKit, so it inherits the kit's palette and every widget.
//
//    Engine ⇄ project seam. This knows a row has a name, a type ordinal, a parent, and the flags Visible /
//    Locked / Dynamic. It does NOT know that type 4 is a sun or that "dynamic" means a rigid body — the project
//    registers rows and supplies the type names, icons and property bodies. Nothing here includes Projects/.
//
//    Named …Sequence because it is a deterministic ordered execution over a row list; `Outliner`, `Browser` and
//    `View` are not authorized role suffixes (CLAUDE.md §2).
//
//    Why a flat array and not a node graph. The tree is rebuilt into a flat draw order every time the structure
//    changes, and rows address their parent by ordinal. That keeps the per-frame walk linear and cache-friendly,
//    keeps every row a trivially copyable record, and means no allocation happens while drawing — which the
//    render-loop rule requires.
//
//    Animation. A branch closing does not vanish: its subtree height is driven from the measured height to zero
//    over kTwirlSeconds, and the rows inside are clipped rather than skipped. Skipping them would make the
//    reopening animation have no height to grow into, and would also destroy an inline rename in progress.

#pragma once

#include "ControlKit.h"
#include "PixelSpace.h"

#include <cstdint>
#include <vector>

namespace Frontier {

//------------------------------------------------------------------------------------------------------------------------
//                                                        ROWS
//------------------------------------------------------------------------------------------------------------------------

inline constexpr uint32_t kOutlinerNoParent = 0xFFFFFFFFu;
inline constexpr uint32_t kOutlinerNoRow    = 0xFFFFFFFFu;
inline constexpr uint32_t kOutlinerNameMax  = 64u;

// One entry in the hierarchy. Trivially copyable: the whole tree is a std::vector of these.
struct OutlinerRowRecord
{
    char     Name[kOutlinerNameMax] = {};                 // [utf8] display name, NUL terminated
    uint32_t Parent      = kOutlinerNoParent;             // [idx]  ordinal of the parent row, or kOutlinerNoParent
    uint32_t TypeOrdinal = 0u;                            // [idx]  project-assigned; indexes the registered type table
    uint32_t Payload     = 0u;                            // [-]    project's own handle for whatever this row represents

    bool     Visible     = true;                          // [-] the eye column
    bool     Locked      = false;                         // [-] the padlock column; a locked row's values are read-only
    bool     Dynamic     = false;                         // [-] the motion column; project decides what it means
    bool     Expanded    = true;                          // [-] twirl state
    bool     HasTint     = false;                         // [-] true when Tint overrides the type colour
    ColorQuad Tint       = ColorQuad{ 0.0f, 0.0f, 0.0f, 1.0f };

    // Derived each rebuild — never set these by hand.
    uint32_t Depth       = 0u;                            // [-] indent level
    float    TwirlPhase  = 1.0f;                          // [0..1] 1 = fully open, 0 = fully closed
};

// A registered row type: what the project says this ordinal means.
struct OutlinerTypeRecord
{
    const char*               Label = "";                          // shown in the filter menu and the properties header
    ControlCentreIconCategory Icon  = ControlCentreIconCategory::SettingsGear;
    ColorQuad                 Colour{ 0.6f, 0.63f, 0.65f, 1.0f };
    bool                      Container = false;                   // folders: can hold children, offer a tint picker
};

//------------------------------------------------------------------------------------------------------------------------
//                                                    LAYOUT MODE
//------------------------------------------------------------------------------------------------------------------------

// One page, two collapsible sides — there is no separate properties screen to navigate to and back from.
enum class OutlinerLayoutMode : uint32_t { TreeOnly = 0, Split = 1, PropertiesOnly = 2 };

//------------------------------------------------------------------------------------------------------------------------
//                                                      SEQUENCE
//------------------------------------------------------------------------------------------------------------------------

class InterfaceOutlinerSequence
{
public:
    // ── Construction ─────────────────────────────────────────────────────────────────────────────────────────────────
    void     RegisterType(uint32_t Ordinal, const OutlinerTypeRecord& Type) noexcept;
    uint32_t Construct(const char* Name, uint32_t TypeOrdinal, uint32_t Parent, uint32_t Payload) noexcept;
    void     Clear() noexcept;

    // ── Query ────────────────────────────────────────────────────────────────────────────────────────────────────────
    [[nodiscard]] uint32_t                  QueryRowCount()  const noexcept { return static_cast<uint32_t>(Rows.size()); }
    [[nodiscard]] const OutlinerRowRecord&  QueryRow(uint32_t Ordinal) const noexcept { return Rows[Ordinal]; }
    [[nodiscard]] OutlinerRowRecord&        Row(uint32_t Ordinal) noexcept { return Rows[Ordinal]; }
    [[nodiscard]] uint32_t                  QuerySelection() const noexcept { return Selected; }
    [[nodiscard]] OutlinerLayoutMode        QueryLayoutMode() const noexcept { return LayoutMode; }
    [[nodiscard]] const OutlinerTypeRecord& QueryType(uint32_t Ordinal) const noexcept;
    [[nodiscard]] uint32_t                  QueryVisibleCount() const noexcept { return VisibleCount; }
    [[nodiscard]] uint32_t                  QueryMatchCount()   const noexcept { return MatchCount; }

    void AssignSelection(uint32_t Ordinal) noexcept { Selected = Ordinal; }
    void AssignLayoutMode(OutlinerLayoutMode Mode) noexcept { LayoutMode = Mode; }

    // ── Search and filter ────────────────────────────────────────────────────────────────────────────────────────────
    [[nodiscard]] TextEntryState& SearchEntry() noexcept { return Search; }
    void ToggleTypeFilter(uint32_t TypeOrdinal) noexcept;
    void ClearTypeFilters() noexcept { FilterMask = 0u; }
    [[nodiscard]] bool     TypeFiltered(uint32_t TypeOrdinal) const noexcept;
    [[nodiscard]] uint32_t FilterCount() const noexcept;

    // ── Rename ───────────────────────────────────────────────────────────────────────────────────────────────────────
    void BeginRename(uint32_t Ordinal) noexcept;
    [[nodiscard]] TextEntryState& RenameEntry() noexcept { return Rename; }
    [[nodiscard]] uint32_t        RenamingRow() const noexcept { return Renaming; }

    // ── Frame ────────────────────────────────────────────────────────────────────────────────────────────────────────
    // Advance drives the twirl animation and the caret blink; Record draws the tree and returns the row the pointer
    //    interacted with this frame (kOutlinerNoRow when none).
    void     Advance(float DeltaSeconds) noexcept;
    uint32_t Record(PixelSpace& Surface, const PlaneExtent& Extent, const ControlPointer& Pointer, float Opacity = 1.0f) noexcept;

    // ── Scrolling ────────────────────────────────────────────────────────────────────────────────────────────────
    // The offset is owned by the host, not by the tree: the host is what knows whether the pointer is over this
    //    pane or the properties one, and a wheel that scrolls both panes at once is worse than one that scrolls
    //    neither. The height to clamp against is QueryContentHeight below, which already walks the same rows
    //    under the same filter and collapse scales that Record lays out.
    void AssignScroll(float Value) noexcept { ScrollY = Value; }

    // Row geometry, exposed so a host can scroll to a row or place a context menu against it.
    [[nodiscard]] float QueryContentHeight() const noexcept;

    static constexpr float kRowHeight     = 32.0f;   // .row height
    static constexpr float kIndent        = 18.0f;   // per depth level
    static constexpr float kTwirlSeconds  = 0.26f;   // .kids height transition

private:
    [[nodiscard]] bool SelfMatches(const OutlinerRowRecord& R) const noexcept;
    [[nodiscard]] bool SubtreeMatches(uint32_t Ordinal) const noexcept;
    [[nodiscard]] bool  AncestorsOpen(uint32_t Ordinal) const noexcept;
    [[nodiscard]] float CollapseScale(uint32_t Ordinal) const noexcept;
    void RebuildOrder() const noexcept;

    // Mutable so the order can be rebuilt lazily from const query paths. The alternative — forcing every caller to
    //    remember a Finalise() step before asking a question — is exactly the kind of ordering trap that produces
    //    an empty tree with no error.
    mutable std::vector<OutlinerRowRecord>  Rows;
    mutable std::vector<uint32_t>           Order;          // draw order, parents before children
    std::vector<OutlinerTypeRecord> Types;

    TextEntryState Search;
    TextEntryState Rename;
    uint32_t       Renaming     = kOutlinerNoRow;
    uint32_t       Selected     = kOutlinerNoRow;
    uint32_t       FilterMask   = 0u;               // bit N = type ordinal N is in the filter
    uint32_t       VisibleCount = 0u;
    uint32_t       MatchCount   = 0u;
    OutlinerLayoutMode LayoutMode = OutlinerLayoutMode::Split;
    float              ScrollY       = 0.0f;   // [px] applied by Record, owned by the host
    mutable bool   OrderDirty   = true;
};

} // namespace Frontier
