/*==========================================================================================================================================
                                                                TABSTRIP.CPP
==========================================================================================================================================*/
// 🧩 .co-tabs: the equal section pills under the page header.

#include "Engine/Interface/Controls/TabStrip.h"

#include "Engine/Interface/Controls/ControlColumn.h"
#include "Engine/Interface/Controls/GlyphRun.h"
#include "Engine/Interface/InspectorControls.h"

#include <imgui_internal.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace Frontier
{

//------------------------------------------------------------------------------------------------------------------------
//                                                    TAB STRIP
//------------------------------------------------------------------------------------------------------------------------

bool TabStrip::Construct(ControlColumn& Column, const char* Id, const char* const* Labels, int Count, int& InOutSelected)
{
    const ControlTheme&    Theme    = Column.QueryTheme();
    const EditorTypefaces& Faces    = Column.QueryFaces();
    ImDrawList* const      DrawList = Column.QueryDrawList();
    const float            Scale    = Column.QueryScale();
    const float            Width    = Column.QueryWidth();
    if (Count <= 0) return false;
    const float  S       = Scale;
    const bool   Railed  = Theme.TabRailFill != 0;
    const float  Padding = Railed ? 4.0f : 0.0f;
    const float  TabTall = 31.0f;   // padding 9 px + 10 px × normal line height + 9 px, min-height 31 px
    const ImVec2 Top     = Column.Space(TabTall + 2.0f * Padding + (Railed ? 2.0f : 0.0f), 0.0f, 19.0f);
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
        const float Advance = GlyphRun::Measure(Column, Faces.Regular, 10.0f * S, Labels[Index]);
        (void)GlyphRun::Construct(Column, Faces.Regular, 10.0f * S,
                                ImVec2(TabMin.x + 0.5f * (TabWide - Advance), TabMin.y + 0.5f * (TabTall * S - GlyphRun::EmPixelHeight * 10.0f * S) + GlyphRun::EmAscent * 10.0f * S),
                                Ink, Labels[Index]);
    }
    ImGui::PopID();
    return Changed;
}

} // namespace Frontier
