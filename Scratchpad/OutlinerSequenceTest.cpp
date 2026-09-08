// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  OutlinerSequenceTest.cpp — text entry editing rules and outliner tree/search/twirl behaviour
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  Everything here is headless. Drawing needs a PixelSpace and a font, but the parts that are easy to get subtly
//  wrong — caret motion across multi-byte characters, selection replacement, search keeping ancestors, the twirl
//  reaching its endpoints — are pure logic and are proven directly.
//
//  Build:  see Scratchpad/CheckOutlinerSequence.sh

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

#include "DisplayPresentation/InterfaceOutlinerSequence.h"

#include <cstdio>
#include <cstring>

using namespace Frontier;

static int Failures = 0;

static void Expect(bool Condition, const char* What)
{
    std::printf("  %-70s %s\n", What, Condition ? "PASS" : "FAIL");
    if (!Condition) ++Failures;
}

int main()
{
    std::printf("Outliner + text entry — proof\n");

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n1. text entry: begin, type, commit\n");
    {
        TextEntryState E{};
        E.Begin("Tall Box");
        Expect(E.Active,                          "Begin activates the field");
        Expect(std::strcmp(E.Text, "Tall Box") == 0, "the initial value is loaded");
        Expect(E.HasSelection() && E.SelectionStart() == 0u && E.SelectionEnd() == 8u,
                                                  "Begin selects all, so typing replaces (the expected rename gesture)");

        E.Insert("Crate");
        Expect(std::strcmp(E.Text, "Crate") == 0, "typing over a full selection replaces the whole value");

        E.Commit();
        Expect(!E.Active && E.Committed,          "Commit closes the field and raises Committed");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n2. text entry: escape restores the original\n");
    {
        TextEntryState E{};
        E.Begin("Ceiling");
        E.Insert("wrong");
        E.Cancel();
        Expect(std::strcmp(E.Text, "Ceiling") == 0, "Escape reverts to the value Begin captured");
        Expect(!E.Active && E.Cancelled,            "and reports the cancel exactly once");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n3. text entry: an empty or blank name is refused\n");
    {
        // A blank name renders as an unclickable empty row — you could never select it again to fix it.
        TextEntryState E{};
        E.Begin("Floor");
        E.SelectAll(); E.DeleteSelection();
        Expect(E.Length == 0u, "the value can be emptied while editing");
        E.Commit();
        Expect(std::strcmp(E.Text, "Floor") == 0, "committing an empty name restores instead of accepting it");
        Expect(E.Cancelled && !E.Committed,       "and it reports as a cancel, not a commit");

        TextEntryState W{};
        W.Begin("Wall");
        W.SelectAll(); W.Insert("   ");
        W.Commit();
        Expect(std::strcmp(W.Text, "Wall") == 0,  "an all-whitespace name is refused the same way");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n4. text entry: caret moves by character, not by byte\n");
    {
        // "Sun°" — the degree sign is two bytes. A caret that steps one byte would split it and the next insert
        //    would produce mojibake.
        TextEntryState E{};
        E.Begin("Sun\u00B0");
        Expect(E.Length == 5u, "the four-character name occupies five bytes");

        E.MoveEnd(false);
        E.MoveCaret(-1, false);
        Expect(E.Caret == 3u, "stepping back from the end clears the whole two-byte character");

        E.MoveCaret(-1, false);
        Expect(E.Caret == 2u, "and single-byte characters still step one at a time");

        E.MoveHome(false);
        E.MoveCaret(1, false);
        Expect(E.Caret == 1u, "forward motion is symmetric");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n5. text entry: backspace over a multi-byte character\n");
    {
        TextEntryState E{};
        E.Begin("A\u00B0");
        E.MoveEnd(false);
        E.Backspace();
        Expect(std::strcmp(E.Text, "A") == 0 && E.Length == 1u,
               "one backspace removes the whole character, never half of it");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n6. text entry: arrow with a live selection collapses to the edge\n");
    {
        TextEntryState E{};
        E.Begin("Cornell");           // Begin selects all
        E.MoveCaret(-1, false);
        Expect(E.Caret == 0u && !E.HasSelection(), "left collapses to the start rather than moving from the end");

        E.SelectAll();
        E.MoveCaret(1, false);
        Expect(E.Caret == E.Length && !E.HasSelection(), "right collapses to the end");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n7. text entry: capacity is refused, not truncated mid-character\n");
    {
        TextEntryState E{};
        E.Begin("");
        char Long[TextEntryState::Capacity * 2];
        for (auto& C : Long) C = 'x';
        Long[sizeof(Long) - 1] = '\0';
        E.Insert(Long);
        Expect(E.Length == TextEntryState::Capacity - 1u, "the buffer fills to capacity and stops");
        Expect(E.Text[E.Length] == '\0',                  "and stays NUL terminated");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n8. outliner: construction order and depth\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(0u, OutlinerTypeRecord{ "Folder", ControlCentreIconCategory::SettingsGear, {}, true });
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh",   ControlCentreIconCategory::DisplayMonitor, {}, false });

        const uint32_t Geometry = O.Construct("Geometry", 0u, kOutlinerNoParent, 0u);
        const uint32_t Floor    = O.Construct("Floor",    1u, Geometry, 1u);
        const uint32_t Tall     = O.Construct("Tall Box", 1u, Geometry, 2u);
        Expect(O.QueryRowCount() == 3u, "three rows registered");

        PixelSpace* None = nullptr; (void)None;
        // Depth is derived on the first rebuild, which Record triggers; QueryContentHeight also forces it.
        (void)O.QueryContentHeight();
        Expect(O.QueryRow(Geometry).Depth == 0u, "a root row sits at depth 0");
        Expect(O.QueryRow(Floor).Depth == 1u && O.QueryRow(Tall).Depth == 1u, "children sit one level in");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n9. outliner: search keeps the ancestors of a hit\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(0u, OutlinerTypeRecord{ "Folder", ControlCentreIconCategory::SettingsGear, {}, true });
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh",   ControlCentreIconCategory::DisplayMonitor, {}, false });
        const uint32_t Geometry = O.Construct("Geometry", 0u, kOutlinerNoParent, 0u);
        O.Construct("Floor",    1u, Geometry, 1u);
        O.Construct("Tall Box", 1u, Geometry, 2u);
        const uint32_t Lighting = O.Construct("Lighting", 0u, kOutlinerNoParent, 0u);
        O.Construct("Ceiling Luminaire", 1u, Lighting, 3u);

        // Height is a proxy for "how many rows are drawn": every surviving row contributes one row height.
        const float All = O.QueryContentHeight();
        Expect(All == 5.0f * InterfaceOutlinerSequence::kRowHeight, "with no query every row is drawn");

        O.SearchEntry().Begin("box");
        const float Boxed = O.QueryContentHeight();
        Expect(Boxed == 2.0f * InterfaceOutlinerSequence::kRowHeight,
               "searching 'box' keeps the hit AND its folder, so the result is not an orphan");

        O.SearchEntry().Begin("ceiling");
        Expect(O.QueryContentHeight() == 2.0f * InterfaceOutlinerSequence::kRowHeight,
               "a hit in a different folder brings that folder instead");

        O.SearchEntry().Begin("zzz");
        Expect(O.QueryContentHeight() == 0.0f, "a query matching nothing draws nothing");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n10. outliner: a hit inside a collapsed branch is still shown\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(0u, OutlinerTypeRecord{ "Folder", ControlCentreIconCategory::SettingsGear, {}, true });
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh",   ControlCentreIconCategory::DisplayMonitor, {}, false });
        const uint32_t Geometry = O.Construct("Geometry", 0u, kOutlinerNoParent, 0u);
        O.Construct("Tall Box", 1u, Geometry, 1u);

        (void)O.QueryContentHeight();
        O.Row(Geometry).Expanded = false;
        O.Row(Geometry).TwirlPhase = 0.0f;
        Expect(O.QueryContentHeight() == 1.0f * InterfaceOutlinerSequence::kRowHeight,
               "collapsed: only the folder is drawn");

        O.SearchEntry().Begin("box");
        Expect(O.QueryContentHeight() > 1.0f * InterfaceOutlinerSequence::kRowHeight,
               "but a search forces the branch open, or the hit would be invisible");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n11. outliner: type filter, and its composition with search\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(0u, OutlinerTypeRecord{ "Folder", ControlCentreIconCategory::SettingsGear, {}, true });
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh",   ControlCentreIconCategory::DisplayMonitor, {}, false });
        O.RegisterType(2u, OutlinerTypeRecord{ "Light",  ControlCentreIconCategory::SunIllumination, {}, false });
        const uint32_t Geometry = O.Construct("Geometry", 0u, kOutlinerNoParent, 0u);
        O.Construct("Floor",    1u, Geometry, 1u);
        O.Construct("Tall Box", 1u, Geometry, 2u);
        const uint32_t Lighting = O.Construct("Lighting", 0u, kOutlinerNoParent, 0u);
        O.Construct("Key Light", 2u, Lighting, 3u);

        O.ToggleTypeFilter(2u);
        Expect(O.FilterCount() == 1u && O.TypeFiltered(2u), "the filter records the chosen type");
        Expect(O.QueryContentHeight() == 2.0f * InterfaceOutlinerSequence::kRowHeight,
               "filtering to Light keeps the light and its folder only");

        O.SearchEntry().Begin("floor");
        Expect(O.QueryContentHeight() == 0.0f,
               "search and filter compose — 'floor' is a Mesh, so the Light filter excludes it");

        O.ClearTypeFilters();
        Expect(O.QueryContentHeight() == 2.0f * InterfaceOutlinerSequence::kRowHeight,
               "clearing the filter brings the floor and its folder back");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n12. outliner: the twirl animates to its endpoints and settles\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(0u, OutlinerTypeRecord{ "Folder", ControlCentreIconCategory::SettingsGear, {}, true });
        const uint32_t Root = O.Construct("Geometry", 0u, kOutlinerNoParent, 0u);

        O.Row(Root).Expanded = false;
        float Elapsed = 0.0f;
        for (int Step = 0; Step < 200 && O.QueryRow(Root).TwirlPhase > 0.0f; ++Step)
        {
            O.Advance(1.0f / 60.0f);
            Elapsed += 1.0f / 60.0f;
        }
        Expect(O.QueryRow(Root).TwirlPhase == 0.0f, "closing reaches exactly zero rather than approaching it");
        Expect(Elapsed <= InterfaceOutlinerSequence::kTwirlSeconds + 0.02f, "and takes the configured duration");

        O.Row(Root).Expanded = true;
        for (int Step = 0; Step < 200 && O.QueryRow(Root).TwirlPhase < 1.0f; ++Step) O.Advance(1.0f / 60.0f);
        Expect(O.QueryRow(Root).TwirlPhase == 1.0f, "opening reaches exactly one, so the row height is stable when idle");

        // Idle frames must not drift the phase — a value that keeps creeping would re-upload the tree forever.
        O.Advance(1.0f / 60.0f);
        Expect(O.QueryRow(Root).TwirlPhase == 1.0f, "and an idle frame changes nothing");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n13. outliner: rename applies through Advance\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh", ControlCentreIconCategory::DisplayMonitor, {}, false });
        const uint32_t Box = O.Construct("Tall Box", 1u, kOutlinerNoParent, 0u);

        O.BeginRename(Box);
        Expect(O.RenamingRow() == Box && O.RenameEntry().Active, "rename opens on the requested row");
        O.RenameEntry().Insert("Crate");
        O.RenameEntry().Commit();
        O.Advance(1.0f / 60.0f);
        Expect(std::strcmp(O.QueryRow(Box).Name, "Crate") == 0, "the committed value reaches the row");
        Expect(O.RenamingRow() == kOutlinerNoRow, "and the rename closes");

        O.BeginRename(Box);
        O.RenameEntry().Insert("Discarded");
        O.RenameEntry().Cancel();
        O.Advance(1.0f / 60.0f);
        Expect(std::strcmp(O.QueryRow(Box).Name, "Crate") == 0, "a cancelled rename leaves the row untouched");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n14. outliner: a long name cannot overrun its row buffer\n");
    {
        InterfaceOutlinerSequence O;
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh", ControlCentreIconCategory::DisplayMonitor, {}, false });
        char Long[512];
        for (auto& C : Long) C = 'y';
        Long[sizeof(Long) - 1] = '\0';
        const uint32_t Row = O.Construct(Long, 1u, kOutlinerNoParent, 0u);
        Expect(std::strlen(O.QueryRow(Row).Name) == kOutlinerNameMax - 1u, "the name is clamped to the row capacity");
        Expect(O.QueryRow(Row).Name[kOutlinerNameMax - 1u] == '\0',        "and remains NUL terminated");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n15. text entry: re-focusing an existing value keeps it\n");
    {
        // Begin() is called with the field's OWN buffer when a search field is re-focused. If that copy were not
        //    self-assignment safe the query would be corrupted the moment it was clicked.
        TextEntryState E{};
        E.Begin("wall");
        E.Commit();
        E.Begin(E.Text);
        Expect(std::strcmp(E.Text, "wall") == 0, "re-focusing with the field's own buffer preserves the value");

        // And after MoveEnd the next keystroke appends rather than replacing — a search is refined more often
        //    than it is retyped.
        E.MoveEnd(false);
        E.Insert("s");
        Expect(std::strcmp(E.Text, "walls") == 0, "typing after a re-focus appends instead of replacing");
    }

    //------------------------------------------------------------------------------------------------------------
    std::printf("\n16. text entry: a stream of keystrokes, not a per-frame sample\n");
    {
        // Two characters can arrive between two frames. A state-sampled input would collapse them to one; the
        //    queue must preserve both, in order.
        TextEntryState E{};
        E.Begin("");
        const char* Typed = "Box";
        for (const char* C = Typed; *C; ++C) { const char One[2] = { *C, '\0' }; E.Insert(One); }
        Expect(std::strcmp(E.Text, "Box") == 0, "characters arrive in order and none are dropped");

        // Interleaving an edit key mid-stream behaves like a real field.
        E.MoveCaret(-1, false);
        E.Insert("-");
        Expect(std::strcmp(E.Text, "Bo-x") == 0, "an edit key applied mid-stream lands at the right offset");
    }

    //------------------------------------------------------------------------------------------------------------
    std::printf("\n17. outliner: renaming does not disturb the tree\n");
    {
        // The rename buffer is separate from the row, so a half-typed name must not be visible in the tree and
        //    must not survive a cancel.
        InterfaceOutlinerSequence O;
        O.RegisterType(1u, OutlinerTypeRecord{ "Mesh", ControlCentreIconCategory::DisplayMonitor, {}, false });
        const uint32_t A = O.Construct("Floor",    1u, kOutlinerNoParent, 0u);
        const uint32_t B = O.Construct("Tall Box", 1u, kOutlinerNoParent, 1u);

        O.BeginRename(B);
        O.RenameEntry().Insert("Crate");
        Expect(std::strcmp(O.QueryRow(B).Name, "Tall Box") == 0, "the row still shows its old name mid-edit");
        Expect(std::strcmp(O.QueryRow(A).Name, "Floor") == 0,    "and the sibling is untouched");

        O.RenameEntry().Commit();
        O.Advance(1.0f / 60.0f);
        Expect(std::strcmp(O.QueryRow(B).Name, "Crate") == 0, "the commit lands on the right row");
        Expect(std::strcmp(O.QueryRow(A).Name, "Floor") == 0, "and still only that row");
    }

    //------------------------------------------------------------------------------------------------------------
    std::printf("\n18. every icon the outliner names actually exists\n");
    {
        // Before these glyphs were authored the outliner borrowed DisplayMonitor for "visible" and ShieldInput
        //    for "locked". Both compiled, both drew, and both were wrong — a borrowed glyph is worse than a
        //    missing one because it looks deliberate. An out-of-range ordinal silently falls back to icon 0, so
        //    the only way to catch it is to assert the ordinal is in range and distinct.
        const ControlCentreIconCategory Used[] = {
            ControlCentreIconCategory::EyeVisible,   ControlCentreIconCategory::EyeHidden,
            ControlCentreIconCategory::LockClosed,   ControlCentreIconCategory::LockOpen,
            ControlCentreIconCategory::MotionActivity,
            ControlCentreIconCategory::FolderClosed, ControlCentreIconCategory::FolderOpen,
            ControlCentreIconCategory::CubeObject,   ControlCentreIconCategory::SearchGlass,
            ControlCentreIconCategory::CameraBody,
            ControlCentreIconCategory::LayoutSplit,  ControlCentreIconCategory::LayoutPanelLeft,
            ControlCentreIconCategory::LayoutPanelRight,
        };
        bool AllInRange = true, AllDistinct = true;
        for (uint32_t I = 0u; I < sizeof(Used) / sizeof(Used[0]); ++I)
        {
            if (static_cast<uint32_t>(Used[I]) >= static_cast<uint32_t>(ControlCentreIconCategory::Count)) AllInRange = false;
            for (uint32_t J = I + 1u; J < sizeof(Used) / sizeof(Used[0]); ++J)
                if (Used[I] == Used[J]) AllDistinct = false;
        }
        Expect(AllInRange,  "every icon the outliner uses is inside the table, not falling back to icon 0");
        Expect(AllDistinct, "and no two row states share a glyph, so a row cannot read ambiguously");

        // The eye and the padlock must differ between their two states, or the column shows nothing useful.
        Expect(ControlCentreIconCategory::EyeVisible != ControlCentreIconCategory::EyeHidden,
               "visible and hidden are different glyphs");
        Expect(ControlCentreIconCategory::LockClosed != ControlCentreIconCategory::LockOpen,
               "locked and editable are different glyphs");
    }

    std::printf("\n>>> %s (%d failure%s)\n", Failures == 0 ? "ALL PASS" : "FAILURES", Failures, Failures == 1 ? "" : "s");
    return Failures == 0 ? 0 : 1;
}
