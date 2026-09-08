#!/usr/bin/env bash
# The World Browser's geometry: a property row that fits inside its card, panes that scroll, and a window that is
#    dragged by its title bar rather than by whichever slider the pointer happened to be over.
#
#    All three were reported from hardware at once, and all three are structural rather than visual, so they are
#    guarded here rather than by looking at a screenshot.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
Fail=0

echo "[PanelLayout] row geometry and scrolling"
Binary="$(mktemp -u /tmp/PanelLayout.XXXXXX)"
if ! g++ -std=c++20 -O2 -Wall -Wextra -I Engine -I . \
     Scratchpad/PanelLayoutTest.cpp \
     Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
     Engine/DisplayPresentation/InterfaceOutlinerSequence.cpp \
     Engine/DisplayPresentation/ControlKit.cpp \
     Engine/DisplayPresentation/TextEntryState.cpp \
     Scratchpad/PanelLayoutLinkStub.cpp -o "$Binary" 2>/tmp/PanelLayout.build; then
    echo "  COMPILE FAILED"; sed 's/^/    /' /tmp/PanelLayout.build | head -25; exit 1
fi
"$Binary" || Fail=1
rm -f "$Binary"

echo
echo "[PanelLayout] design invariants"

# ── The window must be dragged by its chrome, not by its contents ────────────────────────────────────────────────
# 🔴 The panel paints its widgets straight into the window's draw list, so ImGui sees no items and treats the whole
# body as empty background. Pressing empty background is how a window is moved — which is why dragging a slider
# dragged the window with it, and why the widget was the thing that looked broken. Reserving the content region as
# one item is what stops it, and it must be an item rather than NoMove: NoMove would kill the title bar too and the
# panel could then never be moved at all.
grep -q 'ImGui::InvisibleButton("##PanelContent"' Engine/DisplayPresentation/PixelSpace.cpp \
    || { echo "  the panel body is unreserved again — dragging a slider would drag the window"; Fail=1; }
if grep -q 'ImGuiWindowFlags_NoMove' Engine/DisplayPresentation/PixelSpace.cpp; then
    echo "  the panel is NoMove — that fixes the slider by making the window immovable"; Fail=1
fi

# ⚠️ The reservation must not move the recording origin. An InvisibleButton advances the ImGui cursor, and the
# caller was already told where its content starts; leaving the cursor advanced would offset every widget by the
# height of the panel.
grep -c 'ImGui::SetCursorScreenPos(Origin);' Engine/DisplayPresentation/PixelSpace.cpp | grep -q '^2$' \
    || { echo "  the content reservation does not restore the cursor — the whole panel would be offset"; Fail=1; }

# 🔴 And the reservation must not make the panel deaf. IsWindowHovered reports "not hovered" the instant any
# ImGui item is ACTIVE, and the invisible button above becomes active on the very press the panel is trying to
# read — so gating the host's pointer on it killed every click and drag in the window. The content test has to
# survive an active item and then be decided geometrically.
grep -q 'ContentHovered = ImGui::IsWindowHovered(ImGuiHoveredFlags_ChildWindows' Engine/DisplayPresentation/PixelSpace.cpp \
    || { echo "  the content-hover test is gone"; Fail=1; }
grep -A3 'ContentHovered = ImGui::IsWindowHovered' Engine/DisplayPresentation/PixelSpace.cpp \
    | grep -q 'AllowWhenBlockedByActiveItem' \
    || { echo "  the content-hover test still blocks on an active item — every click would be discarded"; Fail=1; }
grep -q 'Mouse.x >= Origin.x && Mouse.x < Origin.x + Avail.x' Engine/DisplayPresentation/PixelSpace.cpp \
    || { echo "  the content test is not geometric, so it depends on ImGui's item state again"; Fail=1; }

# ── The slider must not read as a progress bar ───────────────────────────────────────────────────────────────────
# 🔴 Both the fill and the thumb were the accent colour, so every slider was a solid blue pill with an invisible
# blue-on-blue thumb. The mock is explicit: the filled side is dark and close to the track "so the thumb is what
# carries the eye". A slider says where a value SITS; a bar says how full something is.
if grep -qE 'K\.SliderFill\s*=\s*K\.Accent' Engine/DisplayPresentation/ControlKit.cpp; then
    echo "  the slider fill is the accent again — it would read as a progress bar"; Fail=1
fi
if grep -qE 'K\.SliderThumb\s*=\s*K\.Accent' Engine/DisplayPresentation/ControlKit.cpp; then
    echo "  the slider thumb is the accent again — invisible against its own fill"; Fail=1
fi
grep -q 'K.SliderFill   = Blend(P.ActiveBackground, P.TextMain' Engine/DisplayPresentation/ControlKit.cpp \
    || { echo "  the slider fill is no longer derived from the theme"; Fail=1; }

# 🔴 A GROOVE, not a bar. A fill flush with its track reads as a progress bar however it is coloured, because
# there is nothing for the knob to sit IN. The reference insets the fill on every side and lets the knob overhang
# the rail that leaves; that inset is the whole difference between a slider and a loading indicator.
grep -q 'const PlaneExtent Groove = Spanning(Track.MinimumX + Inset' Engine/DisplayPresentation/ControlKit.cpp \
    || { echo "  the slider fill is flush with its track again — it reads as a progress bar"; Fail=1; }
grep -q 'ColorQuad SliderTrack' Engine/DisplayPresentation/ControlKit.h \
    || { echo "  there is no separate rail colour, so the groove cannot be seen"; Fail=1; }
# Three tones, and the transition must carry all three or a theme change would drop one.
grep -q 'K.SliderTrack = Mix(From.SliderTrack, To.SliderTrack);' Engine/DisplayPresentation/ControlKit.cpp \
    || { echo "  the rail colour is not interpolated across a theme change"; Fail=1; }
# The mock is the authority for what the fill should look like.
grep -q 'background:#4a4a4a' References/WorldBrowser-Mock.html \
    || { echo "  the mock no longer specifies a dark slider fill"; Fail=1; }

# A panel narrower than a row cannot lay one out, so the minimum is enforced every frame rather than seeded once:
# a size restored from imgui.ini would otherwise bring back a window that was dragged too narrow last session.
grep -q 'ImGui::SetNextWindowSizeConstraints' Engine/DisplayPresentation/PixelSpace.cpp \
    || { echo "  there is no minimum panel size — the panel can be dragged narrower than its own content"; Fail=1; }
grep -q 'InterfaceScale, 620.0f, 260.0f' Projects/Project-Zero/Source/GameExecution.cpp \
    || { echo "  the World Browser no longer asks for a minimum size"; Fail=1; }

# ── One authority for the pill width ─────────────────────────────────────────────────────────────────────────────
# 🔴 The row reserved 104 px and the kit drew 118. Those 14 px are what put the slider's track across the pill's
# unit cell, and the compounding error is what pushed the slider off the card entirely.
grep -q 'float Width = ValuePillWidth, float UnitWidth = ValuePillUnitWidth' Engine/DisplayPresentation/ControlKit.h \
    || { echo "  ValuePill no longer takes its width — the drawn and reserved widths can drift again"; Fail=1; }
grep -q 'Geometry.PillWidth, Geometry.PillUnitWidth' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the property row draws a pill at some width other than the one it solved for"; Fail=1; }
# The mock is the authority for the number itself: .vpill is 104 px with a 36 px unit cell.
grep -q 'width:104px;height:30px' References/WorldBrowser-Mock.html \
    || { echo "  the mock's pill is no longer 104 px — the kit constant now describes nothing"; Fail=1; }
grep -q 'PropertyPillWidth = 104.0f, PropertyPillUnitWidth = 36.0f' Engine/DisplayPresentation/ControlKit.h \
    || { echo "  the property pill constants no longer match the mock"; Fail=1; }

# 🔴 ONE layout, consumed twice. The card backgrounds and the rows were positioned by two separate walks over the
# same list, each doing its own arithmetic, and they disagreed by the card's bottom padding — so every card was
# drawn 14 px into the top of the one below it. Two passes that must agree about geometry eventually will not.
grep -q 'PanelLayout SolvePanelLayout' Engine/DisplayPresentation/InterfaceBrowserSequence.h \
    || { echo "  the shared panel layout is gone — backgrounds and rows would drift apart again"; Fail=1; }
grep -q 'const PanelLayout Layout = SolvePanelLayout' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the properties pane no longer draws from the shared layout"; Fail=1; }
if grep -q 'float ScanY = Y; float ScanTop = Y;' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp; then
    echo "  the separate card-scanning pass is back — it is what caused the overlap"; Fail=1
fi

# ⚠️ Spacing is DERIVED from the tokens, not written at each site. Numbers chosen per call site are what made
# "nothing overlaps anything" impossible to state, let alone assert.
grep -q 'struct PanelSpacing' Engine/DisplayPresentation/InterfaceBrowserSequence.h \
    || { echo "  the spacing tokens are gone"; Fail=1; }
if grep -qE 'constexpr float k(RowGap|PropRowH|LabelW|SliderMinW|PillMinW)' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp; then
    echo "  loose spacing constants are back alongside PanelSpacing — there is one source or there are two"; Fail=1
fi
# The tokens are transcribed from the mock, which is the authority for them.
grep -q 'padding:14px 16px 16px;margin-bottom:12px' References/WorldBrowser-Mock.html \
    || { echo "  the mock's card padding changed — the tokens now describe nothing"; Fail=1; }

# ⚠️ Row widths are solved in ONE place, shared with the proof. Layout arithmetic inlined into the drawing code is
# arithmetic nothing can assert, which is how it drifted 14 px in the first place.
grep -q 'PropertyRowGeometry SolvePropertyRow' Engine/DisplayPresentation/InterfaceBrowserSequence.h \
    || { echo "  the row solver is gone — its geometry would no longer be assertable"; Fail=1; }


# ── Scrolling ────────────────────────────────────────────────────────────────────────────────────────────────────
# Both panes lay out from a scrolled origin and clip. Without the offset the rows below the fold are not merely
# hidden, they are unreachable.
grep -q 'const float Origin = Extent.MinimumY - ScrollY;' Engine/DisplayPresentation/InterfaceOutlinerSequence.cpp \
    || { echo "  the outliner does not lay out from a scrolled origin — it cannot scroll"; Fail=1; }
grep -q 'PropertyScroll' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the properties pane does not scroll"; Fail=1; }

# ⚠️ Re-clamped every frame with a zero wheel, not only when the wheel moves. Collapsing a branch or selecting a
# shorter object shrinks the content under a scrolled pane, and the rows would otherwise stay parked past the end
# of a list that no longer reaches them.
grep -q 'AdvanceScroll(TreeScroll, 0.0f' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the tree's scroll is not re-clamped against shrinking content"; Fail=1; }
grep -q 'AdvanceScroll(PropertyScroll, 0.0f' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the properties scroll is not re-clamped against shrinking content"; Fail=1; }

# The wheel goes to whichever pane the pointer is over. One shared offset moves the pane the user is not looking
# at, which reads as the panel losing its place.
grep -q 'ControlKit::Over(TreeArea, Pointer)' Engine/DisplayPresentation/InterfaceBrowserSequence.cpp \
    || { echo "  the wheel is not routed by which pane the pointer is over"; Fail=1; }

# And the host has to supply it at all — the panel sets NoScrollWithMouse, so ImGui will not.
grep -q 'BrowserPointer.Wheel    = Input.QueryMouseScrollDelta();' Projects/Project-Zero/Source/GameExecution.cpp \
    || { echo "  the browser is never given a wheel delta, so nothing can scroll"; Fail=1; }

[ "$Fail" = "0" ] && echo "  row geometry, pill authority, window drag and scrolling hold          PASS"

echo
if [ "$Fail" = "0" ]; then echo "[PanelLayout] OK"; exit 0; else echo "[PanelLayout] FAILED"; exit 1; fi
