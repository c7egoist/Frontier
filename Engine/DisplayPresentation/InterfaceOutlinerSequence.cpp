//============================================================================================================================================
//                                                 INTERFACEOUTLINERSEQUENCE.CPP
//============================================================================================================================================

#include "InterfaceOutlinerSequence.h"

#include <algorithm>
#include <cmath>

namespace Frontier {

namespace {

// ASCII-folding substring test. Names in a scene tree are overwhelmingly ASCII, and a full Unicode case fold would
//    drag in a table for no practical gain here; a non-ASCII name still matches exactly, just not case-insensitively.
char Lower(char C) noexcept { return (C >= 'A' && C <= 'Z') ? static_cast<char>(C - 'A' + 'a') : C; }

bool ContainsFold(const char* Haystack, const char* Needle) noexcept
{
    if (!Needle || !Needle[0]) return true;
    for (uint32_t Start = 0u; Haystack[Start]; ++Start)
    {
        uint32_t I = 0u;
        while (Needle[I] && Haystack[Start + I] && Lower(Haystack[Start + I]) == Lower(Needle[I])) ++I;
        if (!Needle[I]) return true;
    }
    return false;
}

void CopyName(char* Destination, const char* Source) noexcept
{
    uint32_t I = 0u;
    if (Source)
        while (Source[I] && I < kOutlinerNameMax - 1u) { Destination[I] = Source[I]; ++I; }
    Destination[I] = '\0';
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                     CONSTRUCTION
//------------------------------------------------------------------------------------------------------------------------

void InterfaceOutlinerSequence::RegisterType(uint32_t Ordinal, const OutlinerTypeRecord& Type) noexcept
{
    if (Types.size() <= Ordinal) Types.resize(Ordinal + 1u);
    Types[Ordinal] = Type;
}

const OutlinerTypeRecord& InterfaceOutlinerSequence::QueryType(uint32_t Ordinal) const noexcept
{
    static const OutlinerTypeRecord Fallback{};
    return Ordinal < Types.size() ? Types[Ordinal] : Fallback;
}

uint32_t InterfaceOutlinerSequence::Construct(const char* Name, uint32_t TypeOrdinal, uint32_t Parent, uint32_t Payload) noexcept
{
    OutlinerRowRecord R{};
    CopyName(R.Name, Name);
    R.TypeOrdinal = TypeOrdinal;
    R.Parent      = Parent;
    R.Payload     = Payload;
    Rows.push_back(R);
    OrderDirty = true;
    return static_cast<uint32_t>(Rows.size() - 1u);
}

void InterfaceOutlinerSequence::Clear() noexcept
{
    Rows.clear(); Order.clear();
    Selected = kOutlinerNoRow; Renaming = kOutlinerNoRow;
    OrderDirty = true;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                   SEARCH AND FILTER
//------------------------------------------------------------------------------------------------------------------------

void InterfaceOutlinerSequence::ToggleTypeFilter(uint32_t TypeOrdinal) noexcept
{
    if (TypeOrdinal >= 32u) return;
    FilterMask ^= (1u << TypeOrdinal);
}

bool InterfaceOutlinerSequence::TypeFiltered(uint32_t TypeOrdinal) const noexcept
{
    return TypeOrdinal < 32u && (FilterMask & (1u << TypeOrdinal)) != 0u;
}

uint32_t InterfaceOutlinerSequence::FilterCount() const noexcept
{
    uint32_t Count = 0u;
    for (uint32_t Bit = 0u; Bit < 32u; ++Bit) if (FilterMask & (1u << Bit)) ++Count;
    return Count;
}

bool InterfaceOutlinerSequence::SelfMatches(const OutlinerRowRecord& R) const noexcept
{
    if (FilterMask != 0u && !TypeFiltered(R.TypeOrdinal)) return false;
    return ContainsFold(R.Name, Search.Text);
}

// A row survives if it OR any descendant matches. Without this a search hides the folders the hits live in, and the
//    results read as orphans at the wrong indent — the single most common way a tree search looks broken.
bool InterfaceOutlinerSequence::SubtreeMatches(uint32_t Ordinal) const noexcept
{
    if (SelfMatches(Rows[Ordinal])) return true;
    for (uint32_t I = 0u; I < Rows.size(); ++I)
        if (Rows[I].Parent == Ordinal && SubtreeMatches(I)) return true;
    return false;
}

// While a query is live every branch is treated as open: a hit inside a collapsed folder would otherwise be invisible
//    and read as a missing result.
bool InterfaceOutlinerSequence::AncestorsOpen(uint32_t Ordinal) const noexcept
{
    if (Search.Length > 0u) return true;
    uint32_t At = Rows[Ordinal].Parent;
    while (At != kOutlinerNoParent)
    {
        if (!Rows[At].Expanded && Rows[At].TwirlPhase <= 0.001f) return false;
        At = Rows[At].Parent;
    }
    return true;
}

// How much of a row's height survives its ancestors' twirl. A search forces every branch open, so the collapse
//    scale must ignore the twirl too — otherwise AncestorsOpen() admits the row and the phase immediately scales it
//    back to zero height, and the hit stays invisible for exactly the reason the search was meant to prevent.
float InterfaceOutlinerSequence::CollapseScale(uint32_t Ordinal) const noexcept
{
    if (Search.Length > 0u) return 1.0f;
    float Scale = 1.0f;
    uint32_t At = Rows[Ordinal].Parent;
    while (At != kOutlinerNoParent) { Scale *= Rows[At].TwirlPhase; At = Rows[At].Parent; }
    return Scale;
}

void InterfaceOutlinerSequence::RebuildOrder() const noexcept
{
    Order.clear();
    Order.reserve(Rows.size());

    // Depth-first, parents before children, preserving construction order among siblings.
    struct Walker
    {
        std::vector<OutlinerRowRecord>& Rows;
        std::vector<uint32_t>&          Order;
        void Descend(uint32_t Parent, uint32_t Depth)
        {
            for (uint32_t I = 0u; I < Rows.size(); ++I)
            {
                if (Rows[I].Parent != Parent) continue;
                Rows[I].Depth = Depth;
                Order.push_back(I);
                Descend(I, Depth + 1u);
            }
        }
    } W{ Rows, Order };
    W.Descend(kOutlinerNoParent, 0u);

    OrderDirty = false;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                       RENAME
//------------------------------------------------------------------------------------------------------------------------

void InterfaceOutlinerSequence::BeginRename(uint32_t Ordinal) noexcept
{
    if (Ordinal >= Rows.size()) return;
    Renaming = Ordinal;
    Rename.Begin(Rows[Ordinal].Name);
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        FRAME
//------------------------------------------------------------------------------------------------------------------------

void InterfaceOutlinerSequence::Advance(float DeltaSeconds) noexcept
{
    Search.Advance(DeltaSeconds);
    Rename.Advance(DeltaSeconds);

    const float Step = (kTwirlSeconds > 0.0f) ? DeltaSeconds / kTwirlSeconds : 1.0f;
    for (OutlinerRowRecord& R : Rows)
    {
        const float Target = R.Expanded ? 1.0f : 0.0f;
        if (R.TwirlPhase < Target) R.TwirlPhase = std::min(Target, R.TwirlPhase + Step);
        else if (R.TwirlPhase > Target) R.TwirlPhase = std::max(Target, R.TwirlPhase - Step);
    }

    // A commit or cancel resolves in the frame after the host observed it.
    if (Renaming != kOutlinerNoRow && !Rename.Active)
    {
        if (Rename.Committed) CopyName(Rows[Renaming].Name, Rename.Text);
        Rename.Committed = false; Rename.Cancelled = false;
        Renaming = kOutlinerNoRow;
    }
}

float InterfaceOutlinerSequence::QueryContentHeight() const noexcept
{
    if (OrderDirty) RebuildOrder();
    float Height = 0.0f;
    for (uint32_t Index : Order)
    {
        if (!SubtreeMatches(Index) || !AncestorsOpen(Index)) continue;
        Height += kRowHeight * CollapseScale(Index);
    }
    return Height;
}

uint32_t InterfaceOutlinerSequence::Record(PixelSpace& Surface, const PlaneExtent& Extent,
                                           const ControlPointer& Pointer, float Opacity) noexcept
{
    if (OrderDirty) RebuildOrder();

    uint32_t Touched = kOutlinerNoRow;
    VisibleCount = 0u;
    MatchCount   = 0u;
    for (const OutlinerRowRecord& R : Rows)
        if (SelfMatches(R) && !QueryType(R.TypeOrdinal).Container) ++MatchCount;

    Surface.PushClip(Extent);
    // Rows are laid out from the scrolled origin and clipped to the pane. Everything below — hit testing, the
    //    twirl, the selection bar — then follows for free, because they all read RowExtent.
    const float Origin = Extent.MinimumY - ScrollY;
    float Y = Origin;

    for (uint32_t Index : Order)
    {
        const OutlinerRowRecord& R = Rows[Index];
        if (!SubtreeMatches(Index) || !AncestorsOpen(Index)) continue;

        // A closing branch scales its descendants' height to zero rather than dropping them, so the rows slide
        //    up under the parent instead of disappearing in one frame.
        const float Scale = CollapseScale(Index);
        const float RowH  = kRowHeight * Scale;
        if (RowH < 0.5f) continue;

        const PlaneExtent RowExtent = Spanning(Extent.MinimumX, Y, Extent.Width(), RowH);
        ++VisibleCount;

        if (Y + RowH >= Extent.MinimumY && Y <= Extent.MaximumY)
        {
            const bool Hovered  = ControlKit::Over(RowExtent, Pointer);
            const bool IsChosen = (Index == Selected);
            const float RowOpacity = Opacity * Scale;   // fades as it collapses

            if (IsChosen)
            {
                Surface.FillRectangle(RowExtent, ControlKit::Faded(ControlKit::Palette().Selected, RowOpacity), 0.0f);
                Surface.FillRectangle(Spanning(RowExtent.MinimumX, Y, 2.0f, RowH),
                                      ControlKit::Faded(ControlKit::Palette().Primary, RowOpacity));
            }
            else if (Hovered)
            {
                ColorQuad Wash = ControlKit::Palette().Raised; Wash.Alpha *= 0.55f;
                Surface.FillRectangle(RowExtent, ControlKit::Faded(Wash, RowOpacity), 0.0f);
            }

            const float Cy    = Y + RowH * 0.5f;
            float       X     = Extent.MinimumX + 8.0f + static_cast<float>(R.Depth) * kIndent;
            const bool  Leaf  = [&]{ for (const OutlinerRowRecord& C : Rows) if (&C != &R && C.Parent == Index) return false; return true; }();

            // Twirl. The chevron rotation is the phase, so it turns with the same curve the rows slide on.
            if (!Leaf)
            {
                const PlaneExtent Twirl = Spanning(X, Cy - 8.0f, 16.0f, 16.0f);
                ControlKit::GlyphCentred(Surface, Twirl, 11.0f,
                    ControlKit::Faded(ControlKit::Palette().TextFaint, RowOpacity),
                    R.TwirlPhase > 0.5f ? ControlCentreIconCategory::ChevronDown : ControlCentreIconCategory::ChevronForward, 2.0f);
                if (ControlKit::Over(Twirl, Pointer) && Pointer.Released)
                {
                    Rows[Index].Expanded = !Rows[Index].Expanded;
                    Touched = Index;
                }
            }
            X += 16.0f + 8.0f;

            const OutlinerTypeRecord& Type = QueryType(R.TypeOrdinal);
            // A container's folder opens and closes with its own twirl, so the icon and the chevron never disagree.
            const ControlCentreIconCategory RowIcon =
                Type.Container ? (R.TwirlPhase > 0.5f ? ControlCentreIconCategory::FolderOpen
                                                      : ControlCentreIconCategory::FolderClosed)
                               : Type.Icon;
            ControlKit::GlyphCentred(Surface, Spanning(X, Cy - 8.0f, 16.0f, 16.0f), 13.0f,
                ControlKit::Faded(R.HasTint ? R.Tint : Type.Colour, RowOpacity), RowIcon, 1.9f);
            X += 16.0f + 8.0f;

            // Three state columns on the trailing edge; the name gets whatever is left.
            const float ColumnW = 22.0f;
            const uint32_t Columns = Type.Container ? 1u : 3u;
            const float NameRight = RowExtent.MaximumX - 8.0f - static_cast<float>(Columns) * ColumnW;

            if (Renaming == Index)
            {
                ControlKit::TextEntry(Surface, Spanning(X, Cy - 11.0f, std::max(NameRight - X, 40.0f), 22.0f),
                                      Rename, Pointer, 12.5f, RowOpacity);
            }
            else
            {
                const ColorQuad Ink = R.Locked ? ControlKit::Palette().TextFaint : ControlKit::Palette().Text;
                Surface.PushClip(Spanning(X, Y, std::max(NameRight - X, 0.0f), RowH));
                Surface.Text(X, Cy - 6.5f, ControlKit::Faded(Ink, RowOpacity), R.Name, 12.5f);
                Surface.PopClip();
            }

            float ColumnX = RowExtent.MaximumX - 8.0f - static_cast<float>(Columns) * ColumnW;
            const auto StateColumn = [&](ControlCentreIconCategory Icon, bool On, bool Dim) -> bool
            {
                const PlaneExtent Cell = Spanning(ColumnX, Cy - 11.0f, ColumnW, 22.0f);
                ColorQuad Ink = On ? (Dim ? ControlKit::Palette().Highlight : ControlKit::Palette().TextDim)
                                   : ControlKit::Palette().StrokeStrong;
                if (ControlKit::Over(Cell, Pointer)) Ink = ControlKit::Palette().Text;
                ControlKit::GlyphCentred(Surface, Cell, 13.0f, ControlKit::Faded(Ink, RowOpacity), Icon, 1.9f);
                ColumnX += ColumnW;
                return ControlKit::Over(Cell, Pointer) && Pointer.Released;
            };

            // Each column shows the state it IS, not the action it performs: an open padlock means editable, a
            //    struck-through eye means hidden. A column that showed the verb instead would invert on every
            //    click and be unreadable at a glance down a long tree.
            if (!Type.Container)
            {
                if (StateColumn(R.Locked ? ControlCentreIconCategory::LockClosed : ControlCentreIconCategory::LockOpen,
                                R.Locked, true))  { Rows[Index].Locked  = !R.Locked;  Touched = Index; }
                if (StateColumn(ControlCentreIconCategory::MotionActivity, R.Dynamic, true))
                                                  { Rows[Index].Dynamic = !R.Dynamic; Touched = Index; }
            }
            if (StateColumn(R.Visible ? ControlCentreIconCategory::EyeVisible : ControlCentreIconCategory::EyeHidden,
                            R.Visible, false))    { Rows[Index].Visible = !R.Visible; Touched = Index; }

            // Selection last, so a click that landed on a column above does not also move the selection.
            if (Hovered && Pointer.Released && Touched == kOutlinerNoRow)
            {
                Selected = Index;
                Touched  = Index;
            }
        }

        Y += RowH;
    }

    Surface.PopClip();
    return Touched;
}

} // namespace Frontier
