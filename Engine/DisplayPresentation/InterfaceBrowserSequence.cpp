//============================================================================================================================================
//                                                  INTERFACEBROWSERSEQUENCE.CPP
//============================================================================================================================================

#include "InterfaceBrowserSequence.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace Frontier {

namespace {

constexpr float kPadX        = 20.0f;
constexpr float kCardRadius  = 18.0f;
// ⚠️ Spacing is NOT written out here any more. Every gap, pad and row height comes from PanelSpacing, which is
//    transcribed from References/WorldBrowser-Mock.html, and the layout is derived from those rather than
//    assembled from numbers chosen at each site. That is what makes "nothing overlaps anything" a property the
//    proof can state, instead of something that happened to be true.
constexpr float kSwatch      = 22.0f;
constexpr float kDoubleClick = 0.35f;   // [s] window for the rename gesture

// Palette for the container tint picker, matching the mock.
const ColorQuad kTintPalette[] = {
    { 0.788f, 0.635f, 0.294f, 1.0f }, { 0.937f, 0.325f, 0.314f, 1.0f },
    { 0.961f, 0.620f, 0.043f, 1.0f }, { 0.133f, 0.773f, 0.369f, 1.0f },
    { 0.231f, 0.510f, 0.965f, 1.0f }, { 0.545f, 0.361f, 0.965f, 1.0f },
    { 0.925f, 0.282f, 0.600f, 1.0f }, { 0.604f, 0.627f, 0.651f, 1.0f },
};
constexpr uint32_t kTintCount = sizeof(kTintPalette) / sizeof(kTintPalette[0]);

void FormatValue(char* Out, uint32_t Capacity, float Value, uint32_t Decimals) noexcept
{
    switch (Decimals)
    {
        case 0u:  std::snprintf(Out, Capacity, "%.0f", Value); break;
        case 1u:  std::snprintf(Out, Capacity, "%.1f", Value); break;
        case 3u:  std::snprintf(Out, Capacity, "%.3f", Value); break;
        default:  std::snprintf(Out, Capacity, "%.2f", Value); break;
    }
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    ROW GEOMETRY
//------------------------------------------------------------------------------------------------------------------------

float QueryPropertyRowHeight(PropertyKindCategory Kind) noexcept
{
    using S = PanelSpacing;
    switch (Kind)
    {
        case PropertyKindCategory::Notes:  return S::LabelHeight + S::LabelGap + S::NotesHeight;
        // 🔴 Two lines for the controls that need WIDTH. A slider beside a 76 px label in a pane this narrow had
        //    about forty pixels left, which is a control nobody can aim at — it is why the widths had to be
        //    negotiated at all. Given the whole row it is three hundred, which is what the reference shows.
        case PropertyKindCategory::Slider:
        case PropertyKindCategory::Vector: return S::LabelHeight + S::LabelGap + S::ControlHeight;
        // Everything else is small and reads better beside its label than under it.
        default:                           return S::ControlHeight;
    }
}

PropertyRowGeometry SolvePropertyRow(float InnerX, float InnerWidth, PropertyKindCategory Kind) noexcept
{
    using S = PanelSpacing;
    PropertyRowGeometry Out{};
    const float Right = InnerX + InnerWidth;

    Out.LabelAbove = (Kind == PropertyKindCategory::Slider) || (Kind == PropertyKindCategory::Vector)
                  || (Kind == PropertyKindCategory::Notes);
    Out.LabelX     = InnerX;
    Out.LabelY     = 0.0f;

    if (!Out.LabelAbove)
    {
        // Beside: the label takes what it needs and the control sits at the trailing edge.
        Out.LabelWidth = std::max(InnerWidth * 0.45f, 40.0f);
        Out.ControlY   = 0.0f;
        Out.PillWidth  = std::min(ControlKit::PropertyPillWidth, std::max(Right - (InnerX + Out.LabelWidth + 12.0f), 40.0f));
        Out.PillX      = Right - Out.PillWidth;
        Out.SliderVisible = false;
        Out.SliderWidth   = 0.0f;
        Out.SliderX       = Out.PillX;
        Out.PillUnitWidth = std::min(ControlKit::PropertyPillUnitWidth, Out.PillWidth * 0.4f);
        return Out;
    }

    Out.LabelWidth = InnerWidth;
    Out.ControlY   = S::LabelHeight + S::LabelGap;

    // ⚠️ Slider FIRST, pill last, which is the reference's order and not the mock's. With the label above, the
    //    numbers no longer form a column down the panel — that was the mock's reason for leading with the pill —
    //    and putting the pill at the trailing edge gives every row the same right margin instead of a ragged one.
    Out.PillWidth = ControlKit::PropertyPillWidth;
    if (Out.PillWidth > InnerWidth * 0.5f) Out.PillWidth = std::max(InnerWidth * 0.5f, 40.0f);
    Out.PillX     = Right - Out.PillWidth;

    Out.SliderX     = InnerX;
    Out.SliderWidth = std::max(Out.PillX - 12.0f - InnerX, 0.0f);
    // A slider narrower than its own thumb cannot express a position, so below that it is dropped and the pill
    //    keeps the room. A readable number beats a control nobody can aim at.
    Out.SliderVisible = Out.SliderWidth >= ControlKit::SliderThumb + 6.0f;
    if (!Out.SliderVisible)
    {
        Out.SliderWidth = 0.0f;
        Out.PillWidth   = std::min(ControlKit::PropertyPillWidth, InnerWidth);
        Out.PillX       = Right - Out.PillWidth;
    }

    Out.PillUnitWidth = std::min(ControlKit::PropertyPillUnitWidth, Out.PillWidth * 0.4f);
    return Out;
}

PanelLayout SolvePanelLayout(const std::vector<PropertyRowRecord>& Rows, float CardX, float CardWidth,
                             float TopY) noexcept
{
    using S = PanelSpacing;
    PanelLayout Out{};
    float Y = TopY;

    uint32_t Index = 0u;
    while (Index < Rows.size())
    {
        // A card runs from a Heading to the row before the next one. A list that does not start with a Heading
        //    still gets a card, because the rows have to live inside something.
        const bool HasHeading = Rows[Index].Kind == PropertyKindCategory::Heading;
        const float CardTop = Y;
        float Inner = CardTop + S::CardPadTop;
        if (HasHeading)
        {
            Inner += S::HeadingHeight + S::HeadingGap;
            ++Index;
        }

        uint32_t First = Index;
        for (; Index < Rows.size() && Rows[Index].Kind != PropertyKindCategory::Heading; ++Index)
        {
            const float Height = QueryPropertyRowHeight(Rows[Index].Kind);
            // ⚠️ The gap belongs BETWEEN rows, not after every row. Adding it after the last one and then adding
            //    the card's bottom padding on top is how the old layout ended up 14 px taller than the space it
            //    had reserved, which is precisely the overlap.
            if (Index > First) Inner += S::RowGap;
            Out.Rows.push_back({ Spanning(CardX + S::CardPadSide, Inner,
                                          std::max(CardWidth - S::CardPadSide * 2.0f, 1.0f), Height), Index });
            Inner += Height;
        }

        const float CardBottom = Inner + S::CardPadBottom;
        Out.Cards.push_back({ PlaneExtent{ CardX, CardTop, CardX + CardWidth, CardBottom }, kOutlinerNoRow });
        Y = CardBottom + S::CardGap;
    }

    // The trailing gap is not content, so it does not count toward how far the pane can scroll.
    Out.Height = Rows.empty() ? 0.0f : std::max(Y - S::CardGap - TopY, 0.0f);
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        INPUT
//------------------------------------------------------------------------------------------------------------------------

bool InterfaceBrowserSequence::EditingText() const noexcept
{
    // No row-count condition here. An empty tree can still have its search field focused, and reporting "not
    //    editing" would hand those keystrokes to the camera.
    InterfaceOutlinerSequence& Mutable = const_cast<InterfaceOutlinerSequence&>(Tree);
    return Mutable.RenameEntry().Active || Mutable.SearchEntry().Active;
}

// GLFW key codes, spelled out rather than included: this header must not depend on the window backend.
namespace {
constexpr uint32_t kKeyEnter = 257u, kKeyEscape = 256u, kKeyBackspace = 259u, kKeyDelete = 261u;
constexpr uint32_t kKeyRight = 262u, kKeyLeft = 263u, kKeyEnd = 269u, kKeyHome = 268u, kKeyA = 65u;
}

bool InterfaceBrowserSequence::RecordKey(uint32_t Key, bool Shift, bool Control) noexcept
{
    TextEntryState* Entry = nullptr;
    if (Tree.RenameEntry().Active)      Entry = &Tree.RenameEntry();
    else if (Tree.SearchEntry().Active) Entry = &Tree.SearchEntry();
    if (!Entry) return false;

    switch (Key)
    {
        case kKeyEnter:     Entry->Commit();               return true;
        case kKeyEscape:    Entry->Cancel();               return true;
        case kKeyBackspace: Entry->Backspace();            return true;
        case kKeyDelete:    Entry->Delete();               return true;
        case kKeyLeft:      Entry->MoveCaret(-1, Shift);   return true;
        case kKeyRight:     Entry->MoveCaret( 1, Shift);   return true;
        case kKeyHome:      Entry->MoveHome(Shift);        return true;
        case kKeyEnd:       Entry->MoveEnd(Shift);         return true;
        case kKeyA:         if (Control) { Entry->SelectAll(); return true; } return false;
        default:            return false;
    }
}

bool InterfaceBrowserSequence::RecordCharacter(uint32_t Codepoint) noexcept
{
    TextEntryState* Entry = nullptr;
    if (Tree.RenameEntry().Active)      Entry = &Tree.RenameEntry();
    else if (Tree.SearchEntry().Active) Entry = &Tree.SearchEntry();
    if (!Entry || Codepoint < 0x20u) return false;

    // UTF-8 encode; the entry stores bytes and steps its caret by character.
    char Bytes[5] = {};
    if (Codepoint < 0x80u) { Bytes[0] = static_cast<char>(Codepoint); }
    else if (Codepoint < 0x800u)
    {
        Bytes[0] = static_cast<char>(0xC0u | (Codepoint >> 6));
        Bytes[1] = static_cast<char>(0x80u | (Codepoint & 0x3Fu));
    }
    else
    {
        Bytes[0] = static_cast<char>(0xE0u | (Codepoint >> 12));
        Bytes[1] = static_cast<char>(0x80u | ((Codepoint >> 6) & 0x3Fu));
        Bytes[2] = static_cast<char>(0x80u | (Codepoint & 0x3Fu));
    }
    Entry->Insert(Bytes);
    return true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        FRAME
//------------------------------------------------------------------------------------------------------------------------

void InterfaceBrowserSequence::Advance(float DeltaSeconds) noexcept
{
    Tree.Advance(DeltaSeconds);
    if (DoubleClickTimer > 0.0f) DoubleClickTimer -= DeltaSeconds;

    const float Target = Mode == OutlinerLayoutMode::TreeOnly       ? 1.0f
                       : Mode == OutlinerLayoutMode::PropertiesOnly ? 0.0f
                                                                    : 0.54f;
    const float Step = (kSplitSeconds > 0.0f) ? DeltaSeconds / kSplitSeconds : 1.0f;
    if (SplitNow < Target)      SplitNow = std::min(Target, SplitNow + Step);
    else if (SplitNow > Target) SplitNow = std::max(Target, SplitNow - Step);
}

void InterfaceBrowserSequence::Record(PixelSpace& Surface, const PlaneExtent& Extent,
                                      const ControlPointer& Pointer, float Opacity) noexcept
{
    Surface.FillRectangle(Extent, ControlKit::Faded(ControlKit::Palette().Panel, Opacity), 0.0f);

    const PlaneExtent Header = Spanning(Extent.MinimumX, Extent.MinimumY, Extent.Width(), kHeaderHeight);
    RecordHeader(Surface, Header, Pointer, Opacity);

    const float BodyTop    = Extent.MinimumY + kHeaderHeight;
    const float BodyBottom = Extent.MaximumY - kFooterHeight;
    const float SplitX     = Extent.MinimumX + Extent.Width() * SplitNow;

    // ── Tree side ────────────────────────────────────────────────────────────────────────────────────────────────
    if (SplitNow > 0.01f)
    {
        const float Fade = std::min(1.0f, SplitNow / 0.2f) * Opacity;   // fades out as it collapses
        const PlaneExtent Side = PlaneExtent{ Extent.MinimumX, BodyTop, SplitX, BodyBottom };

        ControlKit::TextLeading(Surface, Spanning(Side.MinimumX + kPadX, BodyTop + 10.0f, 200.0f, 18.0f), 0.0f,
                                ControlKit::Faded(ControlKit::Palette().TextFaint, Fade), "OUTLINER", 10.0f);

        const PlaneExtent SearchRow = Spanning(Side.MinimumX, BodyTop + 30.0f, Side.Width(), 34.0f);
        RecordSearchRow(Surface, SearchRow, Pointer, Fade);

        // Active filters become removable chips on their own row, so adding one never reflows the search field.
        float ChipY = SearchRow.MaximumY + 8.0f;
        float ChipX = Side.MinimumX + kPadX;
        const uint32_t Filters = Tree.FilterCount();
        if (Filters > 0u)
        {
            for (uint32_t T = 0u; T < 32u; ++T)
            {
                if (!Tree.TypeFiltered(T)) continue;
                const char* Label = Tree.QueryType(T).Label;
                const float W = ControlKit::ChipWidth(Surface, Label) + 18.0f;
                const PlaneExtent Chip = Spanning(ChipX, ChipY, W, 26.0f);
                Surface.FillRectangle(Chip, ControlKit::Faded(ControlKit::Palette().Primary, Fade), 13.0f);
                ControlKit::TextLeading(Surface, Chip, 11.0f, ControlKit::Faded(ControlKit::Palette().PrimaryInk, Fade), Label, 11.0f);
                const PlaneExtent Cross = Spanning(Chip.MaximumX - 20.0f, ChipY + 4.0f, 17.0f, 17.0f);
                ControlKit::GlyphCentred(Surface, Cross, 9.0f, ControlKit::Faded(ControlKit::Palette().PrimaryInk, Fade),
                                         ControlCentreIconCategory::CloseCross, 2.2f);
                if (ControlKit::Over(Cross, Pointer) && Pointer.Released) Tree.ToggleTypeFilter(T);
                ChipX += W + 7.0f;
            }
            ChipY += 26.0f + 8.0f;
        }

        const PlaneExtent TreeArea = PlaneExtent{ Side.MinimumX + 12.0f, ChipY, Side.MaximumX - 6.0f, BodyBottom };

        // The wheel is applied BEFORE the tree draws, against the height the previous frame measured. Applying
        //    it after would show one frame at the old offset every time the wheel moved, which on a trackpad is
        //    a continuous judder rather than a single missed frame.
        if (Pointer.Wheel != 0.0f && Pointer.Enabled && ControlKit::Over(TreeArea, Pointer))
            TreeScroll = ControlKit::AdvanceScroll(TreeScroll, Pointer.Wheel, Tree.QueryContentHeight(), TreeArea.Height());
        // Re-clamped every frame, not only when the wheel moves: collapsing a branch shortens the content under
        //    a scrolled pane, and without this the rows would stay parked below the last of them.
        TreeScroll = ControlKit::AdvanceScroll(TreeScroll, 0.0f, Tree.QueryContentHeight(), TreeArea.Height());
        Tree.AssignScroll(TreeScroll);

        const uint32_t Touched = Tree.Record(Surface, TreeArea, Pointer, Fade);
        ControlKit::ScrollIndicator(Surface, TreeArea, TreeScroll, Tree.QueryContentHeight(), Fade);

        // Double click renames. Tracked here rather than in the outliner so the gesture policy lives with the host
        //    that owns the clock.
        if (Touched != kOutlinerNoRow && Pointer.Released)
        {
            if (DoubleClickRow == Touched && DoubleClickTimer > 0.0f)
            {
                Tree.BeginRename(Touched);
                DoubleClickTimer = 0.0f;
                DoubleClickRow   = kOutlinerNoRow;
            }
            else
            {
                DoubleClickRow   = Touched;
                DoubleClickTimer = kDoubleClick;
            }
        }
    }

    // ── Divider ──────────────────────────────────────────────────────────────────────────────────────────────────
    if (SplitNow > 0.01f && SplitNow < 0.99f)
        Surface.FillRectangle(Spanning(SplitX, BodyTop, 1.0f, BodyBottom - BodyTop),
                              ControlKit::Faded(ControlKit::Palette().Stroke, Opacity));

    // ── Properties side ──────────────────────────────────────────────────────────────────────────────────────────
    if (SplitNow < 0.99f)
    {
        const float Fade = std::min(1.0f, (1.0f - SplitNow) / 0.2f) * Opacity;
        RecordProperties(Surface, PlaneExtent{ SplitX + 1.0f, BodyTop, Extent.MaximumX, BodyBottom }, Pointer, Fade);
    }

    // ── Footer ───────────────────────────────────────────────────────────────────────────────────────────────────
    const float FooterY = Extent.MaximumY - kFooterHeight;
    Surface.FillRectangle(Spanning(Extent.MinimumX, FooterY, Extent.Width(), 1.0f),
                          ControlKit::Faded(ControlKit::Palette().Stroke, Opacity));
    char Foot[96];
    const uint32_t Selected = Tree.QuerySelection();
    std::snprintf(Foot, sizeof(Foot), "%s", Selected == kOutlinerNoRow ? "nothing selected" : "1 selected");
    ControlKit::TextLeading(Surface, Spanning(Extent.MinimumX + kPadX, FooterY, 200.0f, kFooterHeight), 0.0f,
                            ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity), Foot, 11.5f);

    if (Tree.SearchEntry().Length > 0u || Tree.FilterCount() > 0u)
    {
        char Hits[64];
        std::snprintf(Hits, sizeof(Hits), "%u matched", Tree.QueryMatchCount());
        ControlKit::TextLeading(Surface, Spanning(Extent.MinimumX + kPadX + 110.0f, FooterY, 160.0f, kFooterHeight), 0.0f,
                                ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity), Hits, 11.5f);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       HEADER
//------------------------------------------------------------------------------------------------------------------------

void InterfaceBrowserSequence::RecordHeader(PixelSpace& Surface, const PlaneExtent& Extent,
                                            const ControlPointer& Pointer, float Opacity) noexcept
{
    Surface.FillRectangle(Spanning(Extent.MinimumX, Extent.MaximumY - 1.0f, Extent.Width(), 1.0f),
                          ControlKit::Faded(ControlKit::Palette().Stroke, Opacity));

    // In properties-only mode the header names the selected object, since the tree that would otherwise say so
    //    is not on screen.
    const uint32_t Selected = Tree.QuerySelection();
    const bool     NameIt   = (Mode == OutlinerLayoutMode::PropertiesOnly) && Selected != kOutlinerNoRow;
    const char*    Title    = NameIt ? Tree.QueryRow(Selected).Name : HeaderTitle;
    const char*    Sub      = NameIt ? Tree.QueryType(Tree.QueryRow(Selected).TypeOrdinal).Label : HeaderSubtitle;

    ControlKit::TextLeading(Surface, Spanning(Extent.MinimumX + kPadX, Extent.MinimumY + 10.0f, 240.0f, 18.0f), 0.0f,
                            ControlKit::Faded(ControlKit::Palette().Text, Opacity), Title, 14.0f);
    ControlKit::TextLeading(Surface, Spanning(Extent.MinimumX + kPadX, Extent.MinimumY + 30.0f, 240.0f, 14.0f), 0.0f,
                            ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity), Sub, 11.0f);

    // Three layout buttons on the trailing edge.
    // The three modes read as what they DO to the layout: a left panel, a split, a right panel. Gear and sliders
    //    were placeholders and said nothing about layout at all.
    const ControlCentreIconCategory Icons[3] = {
        ControlCentreIconCategory::LayoutPanelLeft,   // tree only
        ControlCentreIconCategory::LayoutSplit,       // split
        ControlCentreIconCategory::LayoutPanelRight,  // properties only
    };
    float X = Extent.MaximumX - kPadX - 16.0f;
    for (int I = 2; I >= 0; --I)
    {
        const PlaneExtent Cell = Spanning(X - 14.0f, Extent.MinimumY + 14.0f, 28.0f, 28.0f);
        const bool Active = static_cast<uint32_t>(I) == static_cast<uint32_t>(Mode);
        Surface.FillRectangle(Cell, ControlKit::Faded(Active ? ControlKit::Palette().Primary
                                                             : ControlKit::Palette().Raised, Opacity), 14.0f);
        ControlKit::GlyphCentred(Surface, Cell, 13.0f,
            ControlKit::Faded(Active ? ControlKit::Palette().PrimaryInk : ControlKit::Palette().TextDim, Opacity),
            Icons[I], 2.0f);
        if (ControlKit::Over(Cell, Pointer) && Pointer.Released) Mode = static_cast<OutlinerLayoutMode>(I);
        X -= 34.0f;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     SEARCH ROW
//------------------------------------------------------------------------------------------------------------------------

void InterfaceBrowserSequence::RecordSearchRow(PixelSpace& Surface, const PlaneExtent& Extent,
                                               const ControlPointer& Pointer, float Opacity) noexcept
{
    // Search and the filter dropdown share the line; the dropdown is fixed width so the field absorbs any resize.
    const float MenuW  = 132.0f;
    const PlaneExtent Field = Spanning(Extent.MinimumX + kPadX, Extent.MinimumY,
                                       Extent.Width() - kPadX * 2.0f - MenuW - 8.0f, Extent.Height());
    const PlaneExtent Menu  = Spanning(Field.MaximumX + 8.0f, Extent.MinimumY, MenuW, Extent.Height());

    ControlKit::GlyphCentred(Surface, Spanning(Field.MinimumX + 4.0f, Field.MinimumY + 9.0f, 16.0f, 16.0f), 12.0f,
                             ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity),
                             ControlCentreIconCategory::SearchGlass, 2.0f);

    const PlaneExtent Inner = Spanning(Field.MinimumX + 24.0f, Field.MinimumY, Field.Width() - 30.0f, Field.Height());
    if (Tree.SearchEntry().Active || Tree.SearchEntry().Length > 0u)
    {
        ControlKit::TextEntry(Surface, Field, Tree.SearchEntry(), Pointer, 12.5f, Opacity);
    }
    else
    {
        Surface.FillRectangle(Field, ControlKit::Faded(ControlKit::Palette().Field, Opacity), Field.Height() * 0.5f);
        ControlKit::OutlineRounded(Surface, Field, ControlKit::Faded(ControlKit::Palette().Stroke, Opacity), Field.Height() * 0.5f);
        ControlKit::TextLeading(Surface, Inner, 0.0f, ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity),
                                "Search objects…", 12.5f);
    }
    if (ControlKit::Over(Field, Pointer) && Pointer.Released && !Tree.SearchEntry().Active)
    {
        // Re-entering an existing query puts the caret at the end rather than selecting all: a search is refined
        //    far more often than it is replaced, and select-all would discard it on the next keystroke.
        TextEntryState& Entry = Tree.SearchEntry();
        Entry.Begin(Entry.Text);
        Entry.MoveEnd(false);
    }

    // Filter dropdown.
    const uint32_t Filters = Tree.FilterCount();
    char Label[32];
    if (Filters == 0u)      std::snprintf(Label, sizeof(Label), "All types");
    else if (Filters == 1u) std::snprintf(Label, sizeof(Label), "1 type");
    else                    std::snprintf(Label, sizeof(Label), "%u types", Filters);

    if (ControlKit::Dropdown(Surface, Menu, Label, MenuOpen, Pointer, Opacity).Clicked) MenuOpen = !MenuOpen;

    if (MenuOpen)
    {
        // Only registered types appear, so the menu can never offer a filter that matches nothing.
        const char* Names[16]; uint32_t Ordinals[16]; uint32_t Count = 0u;
        for (uint32_t T = 0u; T < 16u && Count < 16u; ++T)
        {
            const OutlinerTypeRecord& Type = Tree.QueryType(T);
            if (!Type.Label || !Type.Label[0] || Type.Container) continue;
            Names[Count] = Type.Label; Ordinals[Count] = T; ++Count;
        }
        uint32_t Chosen = 0xFFFFFFFFu;
        ControlKit::DropdownMenu(Surface, Menu, Names, Count, 0xFFFFFFFFu, Pointer, Chosen, Opacity);
        if (Chosen != 0xFFFFFFFFu && Chosen < Count)
        {
            Tree.ToggleTypeFilter(Ordinals[Chosen]);
            MenuOpen = false;
        }
        else if (Pointer.Released && !ControlKit::Over(Menu, Pointer)
                 && !ControlKit::Over(ControlKit::DropdownMenuExtent(Menu, Count), Pointer))
        {
            MenuOpen = false;
        }
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     PROPERTIES
//------------------------------------------------------------------------------------------------------------------------

void InterfaceBrowserSequence::RecordProperties(PixelSpace& Surface, const PlaneExtent& Extent,
                                                const ControlPointer& Pointer, float Opacity) noexcept
{
    const uint32_t Selected = Tree.QuerySelection();
    if (Selected == kOutlinerNoRow)
    {
        ControlKit::TextCentred(Surface, Extent, ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity),
                                "Select an object to see its properties", 12.0f);
        return;
    }

    Properties.clear();                       // capacity is retained, so no allocation after the first frame
    if (Builder_) Builder_(Selected, Properties);
    if (Properties.empty()) return;

    if (Pointer.Wheel != 0.0f && Pointer.Enabled && ControlKit::Over(Extent, Pointer))
        PropertyScroll = ControlKit::AdvanceScroll(PropertyScroll, Pointer.Wheel, PropertyContentHeight, Extent.Height());
    // Selecting a shorter object shrinks the content under a scrolled pane, so this is re-clamped every frame.
    PropertyScroll = ControlKit::AdvanceScroll(PropertyScroll, 0.0f, PropertyContentHeight, Extent.Height());

    Surface.PushClip(Extent);

    const float CardX = Extent.MinimumX + 18.0f;
    const float CardW = std::max(Extent.Width() - 36.0f, 120.0f);

    if (Pointer.Wheel != 0.0f && Pointer.Enabled && ControlKit::Over(Extent, Pointer))
        PropertyScroll = ControlKit::AdvanceScroll(PropertyScroll, Pointer.Wheel, PropertyContentHeight, Extent.Height());
    // Selecting a shorter object shrinks the content under a scrolled pane, so this is re-clamped every frame.
    PropertyScroll = ControlKit::AdvanceScroll(PropertyScroll, 0.0f, PropertyContentHeight, Extent.Height());

    // 🔴 ONE layout, consumed twice. The backgrounds and the rows used to be placed by two separate walks doing
    //    their own arithmetic, and they disagreed by exactly the card's bottom padding — so every card was drawn
    //    14 px into the top of the one below it.
    const PanelLayout Layout = SolvePanelLayout(Properties, CardX, CardW,
                                                Extent.MinimumY + 14.0f - PropertyScroll);
    PropertyContentHeight = Layout.Height + 28.0f;

    for (const PanelPlacement& Card : Layout.Cards)
        Surface.FillRectangle(Card.Extent, ControlKit::Faded(ControlKit::Palette().Inset, Opacity), kCardRadius);

    // Headings sit in the padding their card reserved for them, so they cannot collide with the first row.
    {
        uint32_t CardIndex = 0u;
        for (uint32_t Index = 0u; Index < Properties.size(); ++Index)
        {
            if (Properties[Index].Kind != PropertyKindCategory::Heading) continue;
            if (CardIndex >= Layout.Cards.size()) break;
            const PlaneExtent& Card = Layout.Cards[CardIndex++].Extent;
            ControlKit::TextLeading(Surface,
                Spanning(Card.MinimumX + PanelSpacing::CardPadSide, Card.MinimumY + PanelSpacing::CardPadTop,
                         std::max(Card.Width() - PanelSpacing::CardPadSide * 2.0f, 1.0f), PanelSpacing::HeadingHeight),
                0.0f, ControlKit::Faded(ControlKit::Palette().TextFaint, Opacity), Properties[Index].Label, 10.5f);
        }
    }

    for (const PanelPlacement& Placement : Layout.Rows)
    {
        const uint32_t Index = Placement.Row;
        PropertyRowRecord& R = Properties[Index];

        const PlaneExtent Row = Placement.Extent;
        const float Y     = Row.MinimumY;
        const float RowH  = Row.Height();
        const float InnerX = Row.MinimumX;
        const float InnerW = Row.Width();

        // Rows entirely outside the pane are laid out but not drawn: the layout has to stay complete so the
        //    scroll extent is right, while the drawing has no reason to touch what is off screen.
        if (Row.MaximumY < Extent.MinimumY || Y > Extent.MaximumY) continue;

        const PropertyRowGeometry Geometry = SolvePropertyRow(InnerX, InnerW, R.Kind);

        if (R.Kind != PropertyKindCategory::Notes || true)
            ControlKit::TextLeading(Surface,
                Spanning(Geometry.LabelX, Y + Geometry.LabelY, Geometry.LabelWidth,
                         Geometry.LabelAbove ? PanelSpacing::LabelHeight : RowH),
                0.0f, ControlKit::Faded(ControlKit::Palette().TextDim, Opacity), R.Label, 12.0f);

        const float ControlY = Y + Geometry.ControlY;
        const float ControlX = Geometry.PillX;
        const float ControlW = Geometry.PillWidth;
        (void)ControlW;

        switch (R.Kind)
        {
            case PropertyKindCategory::Slider:
            {
                // Slider then pill, on the line under the label, matching the reference editor.
                char Number[32];
                FormatValue(Number, sizeof(Number), R.Value ? *R.Value : 0.0f, R.Decimals);
                // Drawn at the width the row reserved for it — the same number on both sides, which is the
                //    whole reason ValuePill takes one.
                ControlKit::ValuePill(Surface, Geometry.PillX, ControlY, Number, R.Unit, Opacity,
                                      Geometry.PillWidth, Geometry.PillUnitWidth);
                if (!Geometry.SliderVisible) break;

                const PlaneExtent Track = Spanning(Geometry.SliderX, ControlY, Geometry.SliderWidth,
                                                   PanelSpacing::ControlHeight);

                float Out = R.Value ? *R.Value : 0.0f;
                const bool Dragging = (DragRow == Index);
                const ControlHit Hit = ControlKit::Slider(Surface, Track, R.Minimum, R.Maximum, Out,
                                                          Dragging, Pointer, Out, false, false, Opacity);
                if (!R.ReadOnly && R.Value)
                {
                    if (Hit.Hovered && Pointer.Pressed) DragRow = Index;
                    if (DragRow == Index)               *R.Value = Out;
                }
                if (Pointer.Released && DragRow == Index) DragRow = kOutlinerNoRow;
                break;
            }

            case PropertyKindCategory::Switch:
            {
                const float SwitchY = ControlY + (PanelSpacing::ControlHeight - ControlKit::SwitchHeight) * 0.5f;
                const ControlHit Hit = ControlKit::Switch(Surface, ControlX, SwitchY, R.Flag && *R.Flag, Pointer, Opacity);
                if (Hit.Clicked && R.Flag && !R.ReadOnly) *R.Flag = !*R.Flag;
                break;
            }

            case PropertyKindCategory::Vector:
            {
                // Three axis pills: a coloured letter cell leading the number, X / Y / Z.
                static const char* Axis[3]  = { "X", "Y", "Z" };
                static const ColorQuad Ink[3] = { { 0.937f, 0.325f, 0.314f, 1.0f },
                                                  { 0.412f, 0.816f, 0.427f, 1.0f },
                                                  { 0.357f, 0.549f, 1.0f,   1.0f } };
                const float Gap  = 6.0f;
                const float Each = (ControlW - Gap * 2.0f) / 3.0f;
                for (uint32_t A = 0u; A < 3u; ++A)
                {
                    const PlaneExtent Cell = Spanning(ControlX + static_cast<float>(A) * (Each + Gap),
                                                      Y + (RowH - 30.0f) * 0.5f, Each, 30.0f);
                    Surface.FillRectangle(Cell, ControlKit::Faded(ControlKit::Palette().Field, Opacity), 15.0f);
                    Surface.FillRectangle(Spanning(Cell.MinimumX, Cell.MinimumY, 26.0f, 30.0f),
                                          ControlKit::Faded(ControlKit::Palette().Inset, Opacity), 15.0f);
                    ControlKit::OutlineRounded(Surface, Cell, ControlKit::Faded(ControlKit::Palette().Stroke, Opacity), 15.0f);
                    ControlKit::TextCentred(Surface, Spanning(Cell.MinimumX, Cell.MinimumY, 26.0f, 30.0f),
                                            ControlKit::Faded(Ink[A], Opacity), Axis[A], 11.0f);
                    char Number[32];
                    FormatValue(Number, sizeof(Number), R.Vector3 ? R.Vector3[A] : 0.0f, 2u);
                    ControlKit::TextLeading(Surface, Spanning(Cell.MinimumX + 26.0f, Cell.MinimumY, Cell.Width() - 26.0f, 30.0f),
                                            8.0f, ControlKit::Faded(R.ReadOnly ? ControlKit::Palette().TextFaint
                                                                               : ControlKit::Palette().Text, Opacity),
                                            Number, 12.0f);
                }
                break;
            }

            case PropertyKindCategory::Readout:
                ControlKit::TextLeading(Surface, Spanning(ControlX, Y, ControlW, RowH), 0.0f,
                                        ControlKit::Faded(ControlKit::Palette().TextDim, Opacity), R.Text, 11.5f);
                break;

            case PropertyKindCategory::Tint:
            {
                float SwatchX = ControlX;
                // A "none" swatch first: a container that has been tinted must be able to go back to its type colour.
                const PlaneExtent None = Spanning(SwatchX, Y + (RowH - kSwatch) * 0.5f, kSwatch, kSwatch);
                ControlKit::OutlineCircle(Surface, None.MinimumX + kSwatch * 0.5f, None.MinimumY + kSwatch * 0.5f,
                                          kSwatch * 0.5f, ControlKit::Faded(ControlKit::Palette().StrokeStrong, Opacity), 1.0f);
                if (R.HasTint && !*R.HasTint)
                    ControlKit::OutlineCircle(Surface, None.MinimumX + kSwatch * 0.5f, None.MinimumY + kSwatch * 0.5f,
                                              kSwatch * 0.5f + 2.0f, ControlKit::Faded(ControlKit::Palette().Text, Opacity), 2.0f);
                if (ControlKit::Over(None, Pointer) && Pointer.Released && R.HasTint) *R.HasTint = false;
                SwatchX += kSwatch + 8.0f;

                for (uint32_t C = 0u; C < kTintCount; ++C)
                {
                    const PlaneExtent Cell = Spanning(SwatchX, Y + (RowH - kSwatch) * 0.5f, kSwatch, kSwatch);
                    const bool Chosen = R.HasTint && *R.HasTint && R.Tint
                                     && std::fabs(R.Tint->Red   - kTintPalette[C].Red)   < 0.01f
                                     && std::fabs(R.Tint->Green - kTintPalette[C].Green) < 0.01f
                                     && std::fabs(R.Tint->Blue  - kTintPalette[C].Blue)  < 0.01f;
                    ControlKit::Swatch(Surface, Cell.MinimumX + kSwatch * 0.5f, Cell.MinimumY + kSwatch * 0.5f,
                                       kTintPalette[C], Chosen, true, Pointer, Opacity);
                    if (ControlKit::Over(Cell, Pointer) && Pointer.Released && R.Tint && R.HasTint)
                    {
                        *R.Tint = kTintPalette[C];
                        *R.HasTint = true;
                    }
                    SwatchX += kSwatch + 8.0f;
                    if (SwatchX + kSwatch > Row.MaximumX) break;
                }
                break;
            }

            case PropertyKindCategory::Notes:
            {
                const PlaneExtent Box = Spanning(InnerX, Y, InnerW, RowH - 6.0f);
                Surface.FillRectangle(Box, ControlKit::Faded(ControlKit::Palette().Field, Opacity), 12.0f);
                ControlKit::OutlineRounded(Surface, Box, ControlKit::Faded(ControlKit::Palette().Stroke, Opacity), 12.0f);
                ControlKit::TextLeading(Surface, Spanning(Box.MinimumX, Box.MinimumY + 6.0f, Box.Width(), 18.0f), 12.0f,
                                        ControlKit::Faded(R.Text && R.Text[0] ? ControlKit::Palette().Text
                                                                              : ControlKit::Palette().TextFaint, Opacity),
                                        R.Text && R.Text[0] ? R.Text : "Notes…", 12.0f);
                break;
            }

            case PropertyKindCategory::Heading: break;   // handled above
        }

    }

    ControlKit::ScrollIndicator(Surface, Extent, PropertyScroll, PropertyContentHeight, Opacity);

    Surface.PopClip();
}

} // namespace Frontier
