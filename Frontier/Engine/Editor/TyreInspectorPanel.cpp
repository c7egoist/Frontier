//============================================================================================================================================
//                                                      TYREINSPECTORPANEL.CPP
//============================================================================================================================================
// 📦 Draws the tyre's two editor surfaces from one property sheet: the quick strip in the shared Inspector, and
//    Tyre Forge, the dockable asset window that owns the tread layer sequence.

#include "TyreInspectorPanel.h"

#include "ControlPanel.h"
#include "EditorInstance.h"

#include "imgui.h"
#include "imgui_internal.h"

#include <cstdio>
#include <cstring>

namespace Frontier {

namespace {

//------------------------------------------------------------------------------------------------------------------------
//                                                        TOKENS
//------------------------------------------------------------------------------------------------------------------------
// The inspector's own seats, so the tyre page cannot drift from the pages beside it.

constexpr ImU32 kInset  = IM_COL32(26, 26, 26, 255);    // the card seat
constexpr ImU32 kStroke = IM_COL32(255, 255, 255, 13);  // rgba(255,255,255,.05)
constexpr ImU32 kText   = IM_COL32(240, 240, 240, 255);
constexpr ImU32 kDim    = IM_COL32(136, 136, 136, 255);
constexpr ImU32 kFaint  = IM_COL32(92, 92, 92, 255);
constexpr ImU32 kFigure = IM_COL32(255, 255, 255, 255);
constexpr ImU32 kFraction = IM_COL32(94, 94, 94, 255);  // the dimmed decimal of a display figure
constexpr ImU32 kSeated = IM_COL32(42, 42, 42, 255);

constexpr float kCardRadius = 18.0f;
constexpr float kCardPadX   = 17.0f;
constexpr float kBarW       = 3.0f;
constexpr float kBarH       = 13.0f;

//------------------------------------------------------------------------------------------------------------------------
//                                                       SHEET READS
//------------------------------------------------------------------------------------------------------------------------

/// 📦 The row tint as a draw colour, so a card's bar matches the glyph the outliner drew.
[[nodiscard]] ImU32 RowTint(const EditorInstance& Row, float Alpha = 1.0f) noexcept
{
    const int R = int(Row.Tint[0] * 255.0f + 0.5f);
    const int G = int(Row.Tint[1] * 255.0f + 0.5f);
    const int B = int(Row.Tint[2] * 255.0f + 0.5f);
    return IM_COL32(R, G, B, int(Alpha * 255.0f + 0.5f));
}

/// 📦 Splits a figure into its whole and fractional halves, the way the references print a display value.
/// note  The fraction is drawn dimmer, which is what makes a large figure readable at a glance.
void SplitFigure(float Value, uint32_t Decimals, char* Whole, size_t WholeSize, char* Fraction, size_t FractionSize) noexcept
{
    char Text[32];
    std::snprintf(Text, sizeof(Text), "%.*f", int(Decimals), double(Value));
    const char* Dot = std::strchr(Text, '.');
    if (Dot == nullptr)
    {
        std::snprintf(Whole, WholeSize, "%s", Text);
        Fraction[0] = '\0';
        return;
    }
    const size_t Lead = size_t(Dot - Text);
    std::snprintf(Whole, WholeSize, "%.*s", int(Lead), Text);
    std::snprintf(Fraction, FractionSize, "%s", Dot);
}

/// 📦 The group's headline property — the first slider, which is the figure the card is about.
[[nodiscard]] const EditorProperty* HeadlineOf(const EditorPropertyGroup& Group) noexcept
{
    for (uint32_t I = 0; I < Group.PropertyCount; ++I)
    {
        if (Group.Properties[I].Category == EditorPropertyCategory::Slider)
        {
            return &Group.Properties[I];
        }
    }
    return nullptr;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      ONE PROPERTY
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Draws one property as a labelled row: the label on the left, the widget filling the rest.
/// note  The widget comes from the property's own Category. Nothing here decides between a slider and a type-in —
///       that decision belongs to whoever filled the sheet, which is the prototype's finding carried into the engine.
void RecordProperty(ControlPanel& Controls, EditorProperty& Property, float LabelWidth) noexcept
{
    ImDrawList* Draw = ImGui::GetWindowDrawList();
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float  RowWidth = ImGui::GetContentRegionAvail().x;

    constexpr float RowHeight = 30.0f;
    Draw->AddText(ImVec2(Origin.x, Origin.y + (RowHeight - ImGui::GetFontSize()) * 0.5f), kDim, Property.Label);

    ImGui::SetCursorScreenPos(ImVec2(Origin.x + LabelWidth, Origin.y));
    ImGui::PushID(Property.Label);
    ImGui::BeginChild(Property.Label, ImVec2(ImGui::GetContentRegionAvail().x, RowHeight),
                      ImGuiChildFlags_None, ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);

    switch (Property.Category)
    {
    case EditorPropertyCategory::Slider:
        // The pill carries the figure; the track is withheld for a value that is discrete or rebuilds topology.
        Controls.SliderPill("##figure", &Property.Figure, Property.Minimum, Property.Maximum,
                            Property.Decimals, Property.Unit, Property.Hi, false, true);
        break;
    case EditorPropertyCategory::Switch:
        Controls.Switch("##switch", &Property.On);
        break;
    case EditorPropertyCategory::Select:
        Controls.DropDown("##select", &Property.Picked, Property.Options, Property.OptionCount);
        break;
    case EditorPropertyCategory::AxisVec3:
        Controls.AxisVec3("##axes", Property.Axes, Property.AxisStep, Property.Editable);
        break;
    case EditorPropertyCategory::Colour:
        Controls.ColourChip("##tint", Property.ColourTint);
        break;
    default:
        Controls.Readout(Property.Text);
        break;
    }

    ImGui::EndChild();
    ImGui::PopID();

    // The row is claimed with a real item: a bare cursor move does not grow the parent, and ImGui says so.
    ImGui::SetCursorScreenPos(Origin);
    ImGui::Dummy(ImVec2(RowWidth, RowHeight + 6.0f));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                        ONE CARD
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Draws one group as a card: a tint bar, the title, the headline figure, then a row per property.
/// out   the cursor is left below the card
float RecordCard(ControlPanel& Controls, EditorPropertyGroup& Group, ImU32 Tint, float Width) noexcept
{
    ImDrawList* Draw   = ImGui::GetWindowDrawList();
    const ImVec2 Origin = ImGui::GetCursorScreenPos();

    const EditorProperty* Headline = HeadlineOf(Group);
    const bool HasCaption = Group.Caption[0] != '\0';

    // The card's height has to be known before its seat is filled, so it is measured from what it will hold.
    //    The caption is MEASURED, not assumed: a two-line caption and a four-line caption are both common, and
    //    guessing one height for both is what put prose through the first slider.
    const float CaptionWrap = Width - kCardPadX * 2.0f;
    float CaptionHeight = 0.0f;
    if (HasCaption)
    {
        CaptionHeight = ImGui::GetFont()->CalcTextSizeA(11.0f, FLT_MAX, CaptionWrap, Group.Caption).y + 12.0f;
    }

    float Height = 14.0f + 17.0f;                                   // top pad + title line
    if (Headline != nullptr)  { Height += 46.0f; }                  // the display figure
    Height += CaptionHeight;
    Height += float(Group.PropertyCount) * 36.0f + 12.0f;

    Draw->AddRectFilled(Origin, ImVec2(Origin.x + Width, Origin.y + Height), kInset, kCardRadius);
    Draw->AddRect(Origin, ImVec2(Origin.x + Width, Origin.y + Height), kStroke, kCardRadius);

    // ① the tint bar and the title
    const float TitleY = Origin.y + 15.0f;
    Draw->AddRectFilled(ImVec2(Origin.x + kCardPadX, TitleY),
                        ImVec2(Origin.x + kCardPadX + kBarW, TitleY + kBarH), Tint, 1.5f);
    Draw->AddText(ImVec2(Origin.x + kCardPadX + kBarW + 9.0f, TitleY - 1.0f), kText, Group.Title);

    float Cursor = TitleY + 20.0f;

    // ② the display figure, whole bright and fraction dimmed
    if (Headline != nullptr)
    {
        char Whole[24] = {}, Fraction[16] = {};
        SplitFigure(Headline->Figure, Headline->Decimals, Whole, sizeof(Whole), Fraction, sizeof(Fraction));
        ImFont* Font = ImGui::GetFont();
        const float Size = 30.0f;
        const ImVec2 WholeSize = Font->CalcTextSizeA(Size, FLT_MAX, 0.0f, Whole);
        Draw->AddText(Font, Size, ImVec2(Origin.x + kCardPadX, Cursor), kFigure, Whole);
        float Pen = Origin.x + kCardPadX + WholeSize.x;
        if (Fraction[0] != '\0')
        {
            const ImVec2 FractionSize = Font->CalcTextSizeA(Size, FLT_MAX, 0.0f, Fraction);
            Draw->AddText(Font, Size, ImVec2(Pen, Cursor), kFraction, Fraction);
            Pen += FractionSize.x;
        }
        if (Headline->Unit[0] != '\0')
        {
            Draw->AddText(Font, 12.0f, ImVec2(Pen + 5.0f, Cursor + Size - 15.0f), kDim, Headline->Unit);
        }
        Cursor += 42.0f;
    }

    // ③ the caption, which is the card's one line of prose
    if (HasCaption)
    {
        Draw->AddText(ImGui::GetFont(), 11.0f, ImVec2(Origin.x + kCardPadX, Cursor), kDim,
                      Group.Caption, nullptr, CaptionWrap);
        Cursor += CaptionHeight;
    }

    // ④ the properties
    const float Inner = Width - kCardPadX * 2.0f;
    ImGui::SetCursorScreenPos(ImVec2(Origin.x + kCardPadX, Cursor));
    ImGui::PushID(Group.Title);
    ImGui::BeginChild("##card-rows", ImVec2(Inner, Height - (Cursor - Origin.y) - 8.0f),
                      ImGuiChildFlags_None, ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
    for (uint32_t I = 0; I < Group.PropertyCount; ++I)
    {
        ImGui::PushID(int(I));
        RecordProperty(Controls, Group.Properties[I], 86.0f);
        ImGui::PopID();
    }
    ImGui::EndChild();
    ImGui::PopID();

    // Claim the whole card, so the next card lands below it and the parent grows to hold both.
    ImGui::SetCursorScreenPos(Origin);
    ImGui::Dummy(ImVec2(Width, Height + 12.0f));
    return Height + 12.0f;
}

}   // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE QUICK STRIP
//------------------------------------------------------------------------------------------------------------------------

void RecordTyreInspector(ControlPanel& Controls, EditorInstance& Picked, EditorSheet& Sheet)
{
    const float Width = ImGui::GetContentRegionAvail().x - 28.0f;
    if (Width < 120.0f)
    {
        return;
    }

    ImVec2 Origin = ImGui::GetCursorScreenPos();
    Origin.x += 14.0f;
    Origin.y += 12.0f;
    ImGui::SetCursorScreenPos(Origin);

    const ImU32 Tint = RowTint(Picked);
    for (uint32_t I = 0; I < Sheet.GroupCount; ++I)
    {
        RecordCard(Controls, Sheet.Groups[I], Tint, Width);
    }

    ImGui::Dummy(ImVec2(Width, 8.0f));
}

//------------------------------------------------------------------------------------------------------------------------
//                                                      TYRE FORGE
//------------------------------------------------------------------------------------------------------------------------

void RecordTyreForgeWindow(ControlPanel& Controls, EditorSheet& Sheet, bool* Open)
{
    if (Open != nullptr && !*Open)
    {
        return;
    }

    ImGui::SetNextWindowSize(ImVec2(760.0f, 520.0f), ImGuiCond_FirstUseEver);
    ImGui::SetNextWindowPos(ImVec2(220.0f, 120.0f), ImGuiCond_FirstUseEver);
    if (!ImGui::Begin("Tyre Forge", Open, ImGuiWindowFlags_NoScrollbar))
    {
        ImGui::End();
        return;
    }

    ImDrawList* Draw = ImGui::GetWindowDrawList();
    const float Full = ImGui::GetContentRegionAvail().x;
    const float SequenceWidth = (Full > 620.0f) ? 300.0f : Full;   // one column once the dock is narrow

    // ① the layer sequence — group 0, one property per layer, read as cut order
    ImGui::BeginChild("sequence", ImVec2(SequenceWidth, 0.0f), ImGuiChildFlags_None,
                      ImGuiWindowFlags_NoScrollbar);
    {
        const ImVec2 At = ImGui::GetCursorScreenPos();
        Draw->AddText(ImGui::GetFont(), 10.0f, ImVec2(At.x + 4.0f, At.y + 4.0f), kDim, "LAYER SEQUENCE / CUT ORDER");
        ImGui::Dummy(ImVec2(0.0f, 22.0f));

        if (Sheet.GroupCount > 0)
        {
            EditorPropertyGroup& Sequence = Sheet.Groups[0];
            for (uint32_t I = 0; I < Sequence.PropertyCount; ++I)
            {
                EditorProperty& Layer = Sequence.Properties[I];
                const ImVec2 Row = ImGui::GetCursorScreenPos();
                const float  RowW = ImGui::GetContentRegionAvail().x - 6.0f;

                ImGui::PushID(int(I));
                ImGui::InvisibleButton("##layer", ImVec2(RowW, 42.0f));
                const bool Hot = ImGui::IsItemHovered();
                const bool Picked = Layer.On;
                if (Hot || Picked)
                {
                    Draw->AddRectFilled(Row, ImVec2(Row.x + RowW, Row.y + 42.0f),
                                        Picked ? IM_COL32(255, 255, 255, 23) : IM_COL32(255, 255, 255, 11), 7.0f);
                }
                if (Picked)
                {
                    Draw->AddRectFilled(ImVec2(Row.x, Row.y + 7.0f), ImVec2(Row.x + kBarW, Row.y + 35.0f),
                                        IM_COL32(0x5A, 0xA9, 0xFF, 255), 1.5f);
                }
                Draw->AddText(ImVec2(Row.x + 14.0f, Row.y + 7.0f), kText, Layer.Label);

                // depth in millimetres, right-aligned, and the depth bar beneath it
                char Depth[20];
                std::snprintf(Depth, sizeof(Depth), "%.1f mm", double(Layer.Figure));
                const ImVec2 DepthSize = ImGui::GetFont()->CalcTextSizeA(10.0f, FLT_MAX, 0.0f, Depth);
                Draw->AddText(ImGui::GetFont(), 10.0f, ImVec2(Row.x + RowW - DepthSize.x - 10.0f, Row.y + 9.0f),
                              kFaint, Depth);
                const float Fraction = (Layer.Maximum > Layer.Minimum)
                                     ? (Layer.Figure - Layer.Minimum) / (Layer.Maximum - Layer.Minimum) : 0.0f;
                Draw->AddRectFilled(ImVec2(Row.x + 14.0f, Row.y + 28.0f), ImVec2(Row.x + 62.0f, Row.y + 31.0f),
                                    IM_COL32(0, 0, 0, 255), 1.5f);
                Draw->AddRectFilled(ImVec2(Row.x + 14.0f, Row.y + 28.0f),
                                    ImVec2(Row.x + 14.0f + 48.0f * Fraction, Row.y + 31.0f),
                                    IM_COL32(74, 74, 74, 255), 1.5f);
                ImGui::PopID();
                ImGui::SetCursorScreenPos(Row);
                ImGui::Dummy(ImVec2(RowW, 44.0f));
            }
        }
    }
    ImGui::EndChild();

    // ② the picked layer's parameters — group 1 onward
    if (Full > 620.0f)
    {
        ImGui::SameLine();
        ImGui::BeginChild("parameters", ImVec2(0.0f, 0.0f));
        ImGui::Dummy(ImVec2(0.0f, 4.0f));
        const float Width = ImGui::GetContentRegionAvail().x - 16.0f;
        for (uint32_t I = 1; I < Sheet.GroupCount; ++I)
        {
            ImGui::SetCursorPosX(8.0f);
            RecordCard(Controls, Sheet.Groups[I], IM_COL32(0x5A, 0xA9, 0xFF, 255), Width);
        }
        ImGui::EndChild();
    }

    ImGui::End();
}

}   // namespace Frontier
