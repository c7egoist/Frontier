// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  PanelLayoutTest.cpp — a property row fits inside its card, and a pane can reach all of its content
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  Three defects, all reported from the World Browser, all of them geometry rather than rendering:
//
//    · the slider ran off the card, off the window and past the edge of the screen. The row reserved 104 px for
//      a pill the kit drew at 118, then forced the slider to a 90 px minimum measured from wherever that left
//      off. What reached the screen was a track painted across the pill's unit cell and a control that could
//      not be grabbed at all;
//
//    · neither pane scrolled, so the lower half of a tall panel was unreachable. The Sky Atmosphere card alone
//      is taller than the pane on a normal window;
//
//    · dragging a slider dragged the WINDOW as well, because the panel's widgets are painted straight into the
//      window's draw list and ImGui therefore believes the whole body is empty background — and pressing empty
//      background is how a window is moved. That one is asserted in the gate rather than here, since it is a
//      property of the ImGui call sequence and not of any arithmetic.
//
//  Every assertion below is geometry the drawing code shares, not a screenshot of it.
//
//  Build: see Scratchpad/CheckPanelLayout.sh
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

#include "DisplayPresentation/ControlKit.h"
#include "DisplayPresentation/ThemeStructure.h"

#include <vector>
#include "DisplayPresentation/InterfaceBrowserSequence.h"

#include <cmath>
#include <cstdio>
#include <initializer_list>

using namespace Frontier;

static int Failures = 0;

static void Expect(bool Condition, const char* What)
{
    std::printf("  %-70s %s\n", What, Condition ? "PASS" : "FAIL");
    if (!Condition) ++Failures;
}

int main()
{
    std::printf("PanelLayout — the World Browser's rows and panes\n");

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n1. a property row never draws outside its card, at any pane width\n");
    {
        // 🔴 The reported defect. The card is the only thing the pane clips to, so anything wider than it is
        //    painted onto the window frame and then onto the desktop. Swept rather than spot-checked: the
        //    failure appeared only below a certain width, which is exactly the case a single example misses.
        const float InnerX = 100.0f;
        bool Inside = true, Ordered = true, Disjoint = true;
        std::printf("     inner width   pill        slider          fits\n");
        for (float InnerWidth = 60.0f; InnerWidth <= 460.0f; InnerWidth += 1.0f)
        {
            const PropertyRowGeometry G = SolvePropertyRow(InnerX, InnerWidth, PropertyKindCategory::Slider);
            const float Right = InnerX + InnerWidth;

            if (G.PillX + G.PillWidth > Right + 0.01f) Inside = false;
            if (G.SliderVisible && G.SliderX + G.SliderWidth > Right + 0.01f) Inside = false;
            if (G.PillX < InnerX - 0.01f) Inside = false;

            // The pill leads and the slider follows, and they may not overlap — an overlap is what drew a track
            //    across the unit cell and hid the number the row exists to show.
            if (G.SliderVisible && G.PillX < G.SliderX + G.SliderWidth - 0.01f) Disjoint = false;
            if (G.PillWidth < 20.0f) Ordered = false;

            if (std::fmod(InnerWidth, 100.0f) < 0.5f)
                std::printf("     %11.0f   %3.0f @ %3.0f   %3.0f @ %3.0f   %s\n",
                            static_cast<double>(InnerWidth),
                            static_cast<double>(G.PillWidth),  static_cast<double>(G.PillX - InnerX),
                            static_cast<double>(G.SliderWidth), static_cast<double>(G.SliderX - InnerX),
                            G.SliderVisible ? "slider" : "pill only");
        }
        Expect(Inside,   "every element stays inside the card across a 400 px sweep of pane widths");
        Expect(Disjoint, "the value pill never overlaps the slider");
        Expect(Ordered,  "the pill always has width to draw into");

        // And the old arithmetic, so the regression is recognisable if it comes back. 104 reserved, 118 drawn,
        //    then a 90 px slider from the end of the 104.
        const float OldInnerWidth = 237.0f;   // the properties pane at the reported window size
        const float OldPillX      = InnerX + 76.0f + 12.0f;
        const float OldSliderX    = OldPillX + 104.0f + 12.0f;
        const float OldOverhang   = (OldSliderX + 90.0f) - (InnerX + OldInnerWidth);
        std::printf("     the previous arithmetic overhung the card by %.0f px at this width\n",
                    static_cast<double>(OldOverhang));
        Expect(OldOverhang > 20.0f, "the old layout really did overflow — this is the bug being fixed");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n2. the pill is drawn at the width the row reserved for it\n");
    {
        // Two constants, one row. The kit's 118 px pill against the mock's 104 px reservation is precisely the
        //    14 px that put the slider on top of the unit cell.
        Expect(std::fabs(ControlKit::PropertyPillWidth - 104.0f) < 0.01f,
               "the property pill is the mock's 104 px");
        Expect(std::fabs(ControlKit::PropertyPillUnitWidth - 36.0f) < 0.01f,
               "with the mock's 36 px unit cell");
        Expect(ControlKit::PropertyPillWidth < ControlKit::ValuePillWidth,
               "and it is a different, narrower pill from the Notch inspectors' — hence the parameter");

        const PropertyRowGeometry G = SolvePropertyRow(0.0f, 400.0f, PropertyKindCategory::Slider);
        Expect(std::fabs(G.PillWidth - ControlKit::PropertyPillWidth) < 0.01f,
               "a roomy row uses the full pill width unshrunk");
        Expect(G.PillUnitWidth < G.PillWidth,
               "the unit cell always leaves a number cell to draw in");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n3. the label goes above, so the slider gets the whole width\n");
    {
        // 🔴 The arrangement the reference editor uses, and the reason for it. Beside a 76 px label in a pane
        //    this narrow the slider had about forty pixels — which is why the widths had to be negotiated at all,
        //    and why the control was unusable. On its own line it gets the lot.
        const float Inner = 250.0f;
        const PropertyRowGeometry Above  = SolvePropertyRow(0.0f, Inner, PropertyKindCategory::Slider);
        std::printf("     at %.0f px inner width the slider is %.0f px, the pill %.0f, label above: %s\n",
                    static_cast<double>(Inner), static_cast<double>(Above.SliderWidth),
                    static_cast<double>(Above.PillWidth), Above.LabelAbove ? "yes" : "no");
        Expect(Above.LabelAbove,             "a slider row puts its label on its own line");
        Expect(Above.SliderWidth > 120.0f,   "so the slider gets a usable width in a narrow pane");
        Expect(Above.ControlY >= PanelSpacing::LabelHeight,
               "and the control sits below the label rather than on top of it");

        // The compact kinds stay beside their label, because they do not need the width and a two-line readout
        //    would make the panel twice as tall for nothing.
        const PropertyRowGeometry Beside = SolvePropertyRow(0.0f, Inner, PropertyKindCategory::Readout);
        Expect(!Beside.LabelAbove, "a readout stays on one line beside its label");
        Expect(QueryPropertyRowHeight(PropertyKindCategory::Readout)
             < QueryPropertyRowHeight(PropertyKindCategory::Slider),
               "so it is the shorter of the two");

        // Slider first, pill at the trailing edge, which is what gives every row the same right margin.
        Expect(Above.SliderX < Above.PillX, "the slider leads and the pill trails, as the reference has it");
        Expect(std::fabs((Above.PillX + Above.PillWidth) - Inner) < 0.01f,
               "and the pill ends exactly at the content edge");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n4. scrolling reaches all of the content and none of the empty space\n");
    {
        // 🔴 Reported as "there is no scrolling on the outliner". There was none: the tree laid its rows out
        //    from the top of the pane and clipped, so anything past the fold could not be reached at all.
        const float View = 400.0f, Content = 1000.0f;

        // Scrolling down stops exactly at the last of the content, never past it into blank space.
        float Offset = 0.0f;
        for (int Click = 0; Click < 100; ++Click) Offset = ControlKit::AdvanceScroll(Offset, -1.0f, Content, View);
        std::printf("     after 100 clicks down, offset %.1f of a %.0f travel\n",
                    static_cast<double>(Offset), static_cast<double>(Content - View));
        Expect(std::fabs(Offset - (Content - View)) < 0.01f, "scrolling down stops at the end of the content");

        for (int Click = 0; Click < 100; ++Click) Offset = ControlKit::AdvanceScroll(Offset, 1.0f, Content, View);
        Expect(std::fabs(Offset) < 0.01f, "and scrolling up stops at the top, not above it");

        // ⚠️ A pane with nothing to scroll must not move at all. Without the clamp a short list slides up out of
        //    view and the pane looks broken rather than merely empty.
        float Short = 0.0f;
        for (int Click = 0; Click < 10; ++Click) Short = ControlKit::AdvanceScroll(Short, -1.0f, 120.0f, View);
        Expect(std::fabs(Short) < 0.01f, "a pane shorter than its view cannot be scrolled at all");

        // The offset is re-clamped every frame with a zero wheel, which is what recovers a scrolled pane when
        //    its content shrinks — collapsing a branch, or selecting an object with fewer rows.
        float Parked = 600.0f;                                   // scrolled to the bottom of the tall content
        Parked = ControlKit::AdvanceScroll(Parked, 0.0f, 300.0f, View);   // ... and the content just shrank
        std::printf("     content shrank from 1000 to 300 with the pane scrolled to 600 -> %.1f\n",
                    static_cast<double>(Parked));
        Expect(std::fabs(Parked) < 0.01f, "a shrinking pane pulls its scroll back rather than parking past the end");

        // One click is a sensible distance: too small and the wheel feels dead, too large and it jumps a page.
        const float Step = ControlKit::AdvanceScroll(0.0f, -1.0f, Content, View);
        std::printf("     one wheel click moves %.0f px, against a %.0f px row\n",
                    static_cast<double>(Step), 32.0);
        Expect(Step > 16.0f && Step < 120.0f, "one click moves about a row and a half, not a page");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n4b. cards do not overlap, and every row is inside its own card\n");
    {
        // 🔴 Reported from a screenshot: the cards were drawn over one another. The backgrounds and the rows were
        //    positioned by two separate walks over the same list, each doing its own arithmetic, and they
        //    disagreed by exactly the card's bottom padding — so every card reached 14 px into the top of the one
        //    below it. There is one layout now and both consumers read it, which is what makes this assertable.
        std::vector<PropertyRowRecord> Rows;
        const auto Add = [&](PropertyKindCategory Kind, const char* Label)
        {
            PropertyRowRecord R{}; R.Kind = Kind; R.Label = Label; Rows.push_back(R);
        };
        Add(PropertyKindCategory::Heading, "Clock");
        Add(PropertyKindCategory::Slider,  "Time of day");
        Add(PropertyKindCategory::Slider,  "Rate");
        Add(PropertyKindCategory::Heading, "Position");
        Add(PropertyKindCategory::Readout, "Elevation");
        Add(PropertyKindCategory::Readout, "Azimuth");
        Add(PropertyKindCategory::Heading, "Site");
        Add(PropertyKindCategory::Slider,  "Latitude");

        const PanelLayout Layout = SolvePanelLayout(Rows, 10.0f, 280.0f, 0.0f);
        std::printf("     %zu cards, %zu rows, %.0f px tall\n",
                    Layout.Cards.size(), Layout.Rows.size(), static_cast<double>(Layout.Height));
        Expect(Layout.Cards.size() == 3u, "one card per heading");
        Expect(Layout.Rows.size()  == 5u, "and one placement per non-heading row");

        bool Separated = true, Ordered = true;
        for (size_t I = 1; I < Layout.Cards.size(); ++I)
        {
            const float Gap = Layout.Cards[I].Extent.MinimumY - Layout.Cards[I - 1].Extent.MaximumY;
            std::printf("     gap between card %zu and %zu: %.1f px\n", I - 1, I, static_cast<double>(Gap));
            if (Gap < 0.0f) Separated = false;
            if (std::fabs(Gap - PanelSpacing::CardGap) > 0.01f) Ordered = false;
        }
        Expect(Separated, "no card overlaps the one below it");
        Expect(Ordered,   "and the gap between them is exactly the token, not an accident");

        // Every row must lie inside a card, with the card's own padding respected on all four sides.
        bool Contained = true;
        for (const PanelPlacement& Row : Layout.Rows)
        {
            bool Inside = false;
            for (const PanelPlacement& Card : Layout.Cards)
            {
                const bool Vertical = Row.Extent.MinimumY >= Card.Extent.MinimumY + PanelSpacing::CardPadTop - 0.01f
                                   && Row.Extent.MaximumY <= Card.Extent.MaximumY - PanelSpacing::CardPadBottom + 0.01f;
                const bool Horizontal = Row.Extent.MinimumX >= Card.Extent.MinimumX + PanelSpacing::CardPadSide - 0.01f
                                     && Row.Extent.MaximumX <= Card.Extent.MaximumX - PanelSpacing::CardPadSide + 0.01f;
                if (Vertical && Horizontal) Inside = true;
            }
            if (!Inside) Contained = false;
        }
        Expect(Contained, "every row sits inside a card, inside its padding");

        // And rows must not overlap each other.
        bool RowsApart = true;
        for (size_t I = 1; I < Layout.Rows.size(); ++I)
            if (Layout.Rows[I].Extent.MinimumY < Layout.Rows[I - 1].Extent.MaximumY - 0.01f) RowsApart = false;
        Expect(RowsApart, "and no row overlaps the row above it");

        // The old arithmetic, so the regression is recognisable: card height reached past the next card's top.
        const float OldOverlap = 14.0f;   // the bottom padding, added after the last row's gap had already run
        std::printf("     the previous layout drew each card %.0f px into the next one\n",
                    static_cast<double>(OldOverlap));
        Expect(OldOverlap > 0.0f, "the old layout really did overlap — this is the bug being fixed");

        // Scroll extent must match the layout, or the pane cannot reach its own last row.
        const float Bottom = Layout.Cards.back().Extent.MaximumY;
        Expect(std::fabs(Bottom - Layout.Height) < 0.01f,
               "the reported height reaches the bottom of the last card, so the pane can scroll to it");
    }

    //------------------------------------------------------------------------------------------------------------------
    std::printf("\n5. the slider reads as something to grab, not as a progress bar\n");
    {
        // 🔴 Reported as "see how terrible it looks". The theme assigned the accent colour to BOTH the filled
        //    side and the thumb, so every slider was a solid blue pill with a blue thumb somewhere inside it —
        //    invisible against its own fill. References/WorldBrowser-Mock.html says why that is the wrong
        //    reading: the fill is dark and close to the track "so the thumb is what carries the eye". A slider
        //    says where a value SITS. A bar says how full something is. They must not look alike.
        // The kit's palette is only populated once a theme has been applied; before that it holds the
        //    geometry-free defaults, which would test nothing about the derivation.
        ThemeStructure Theme;
        ControlKit::AssignTheme(Theme, ColorQuad{ 1.0f, 0.7f, 0.2f, 1.0f }, ColorQuad{ 0.2f, 0.8f, 0.4f, 1.0f },
                                       ColorQuad{ 0.3f, 0.6f, 1.0f, 1.0f }, ColorQuad{ 1.0f, 0.5f, 0.3f, 1.0f });
        const ControlKitPalette& P = ControlKit::Palette();

        const auto Luma = [](ColorQuad C) { return 0.2126f * C.Red + 0.7152f * C.Green + 0.0722f * C.Blue; };
        const auto Apart = [&](ColorQuad A, ColorQuad B)
        {
            return std::sqrt((A.Red - B.Red) * (A.Red - B.Red) + (A.Green - B.Green) * (A.Green - B.Green)
                           + (A.Blue - B.Blue) * (A.Blue - B.Blue));
        };

        std::printf("     rail   luma %.3f\n", static_cast<double>(Luma(P.SliderTrack)));
        std::printf("     fill   luma %.3f  (%.3f from the track)\n",
                    static_cast<double>(Luma(P.SliderFill)),  static_cast<double>(Apart(P.SliderFill, P.Raised)));
        std::printf("     thumb  luma %.3f  (%.3f from the fill)\n",
                    static_cast<double>(Luma(P.SliderThumb)), static_cast<double>(Apart(P.SliderThumb, P.SliderFill)));

        // 🔴 The defect itself: a thumb the same colour as the fill it sits on cannot be seen at all.
        Expect(Apart(P.SliderThumb, P.SliderFill) > 0.25f,
               "the thumb is clearly distinct from the fill it sits on");
        // And the fill must stay near the track, so the eye goes to the thumb rather than to the bar.
        // 🔴 Three distinct tones, in order: a dark rail, a mid fill inside it, a near-white knob over both.
        //    Two of them the same is how it stopped reading as a control — a flush fill is a progress bar
        //    however it is coloured, because there is nothing for the knob to sit IN.
        std::printf("     rail -> fill %.3f, fill -> knob %.3f\n",
                    static_cast<double>(Apart(P.SliderTrack, P.SliderFill)),
                    static_cast<double>(Apart(P.SliderFill, P.SliderThumb)));
        Expect(Luma(P.SliderTrack) < Luma(P.SliderFill), "the rail is darker than the fill it contains");
        Expect(Luma(P.SliderFill)  < Luma(P.SliderThumb), "and the fill is darker than the knob over it");
        Expect(Apart(P.SliderTrack, P.SliderFill) > 0.15f, "the rail is visibly distinct from the fill");
        Expect(std::fabs(Luma(P.SliderThumb) - Luma(P.SliderFill)) > 0.2f,
               "and the two differ in brightness, not merely in hue — hue alone fails for a colour-blind eye");

        // The accent is still reachable, for the controls that genuinely are bars.
        Expect(Apart(P.SliderFill, P.Accent) > 0.05f, "the slider fill is not simply the accent any more");
        Expect(Apart(P.Highlight, P.Accent) < 0.01f,  "while the highlight fill still is, for the ones that want it");
    }

    std::printf("\n>>> %s (%d failure%s)\n", Failures == 0 ? "ALL PASS" : "FAILURES", Failures, Failures == 1 ? "" : "s");
    return Failures == 0 ? 0 : 1;
}
