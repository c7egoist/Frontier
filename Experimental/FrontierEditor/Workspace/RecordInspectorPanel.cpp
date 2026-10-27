/*==========================================================================================================================================
                                                          RECORDINSPECTORPANEL.CPP
==========================================================================================================================================*/
// 🧩 Inspector for the Outliner selection: identity, nesting and visibility of one scene record, read/write.

#include "Workspace/RecordInspectorPanel.h"

#include "Engine/Diagnostics/LogCategories.h"
#include "Engine/Diagnostics/LogStream.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Interface/StackRailControls.h"
#include "Engine/Scene/SceneDirectory.h"

#include <imgui.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace Frontier
{

namespace
{

using Theme = KitTheme;

// 📝 Same classification palette the Outliner presentation uses (SceneDirectoryPanelPresentation).
ImU32 ClassificationColour(RecordClassification Classification) noexcept
{
    switch (Classification)
    {
        case RecordClassification::Vehicle:      return KitInkHex(0x2fe6a7);
        case RecordClassification::Tyre:         return KitInkHex(0x63a8ff);
        case RecordClassification::Environment:  return KitInkHex(0x8fd14f);
        case RecordClassification::Geometry:     return KitInkHex(0xb18cff);
        case RecordClassification::Illumination: return KitInkHex(0xffb454);
        case RecordClassification::Camera:       return KitInkHex(0xff7ad9);
        case RecordClassification::Physics:      return KitInkHex(0xff6d6d);
        case RecordClassification::Interface:    return KitInkHex(0x9fd8e8);
        case RecordClassification::Content:      return KitInkHex(0xd8cf9f);
        case RecordClassification::Unclassified: return KitInkHex(0x5f6b64);
        case RecordClassification::Count:        break;
    }
    return KitInkHex(0x5f6b64);
}

void SectionCaption(const KitFaces& Faces, const char* Text)
{
    ImDrawList*  Ink = ImGui::GetWindowDrawList();
    const ImVec2 At  = ImGui::GetCursorScreenPos();
    KitDrawTracked(Ink, Faces.Medium, 10.5f, ImVec2(At.x + 2.0f, At.y + 6.0f), Theme::Faint, Text, 10.5f * 0.13f);
    ImGui::Dummy(ImVec2(ImGui::GetContentRegionAvail().x, 24.0f));
}

void LabelRow(const char* Label, const std::string& Text)
{
    ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Faint), "%s", Label);
    ImGui::SameLine(128.0f);
    ImGui::TextWrapped("%s", Text.c_str());
}

} // namespace

//----------------------------------------------------------------------------------------------------------------------
//                                                    INTERFACE RECORDING
//----------------------------------------------------------------------------------------------------------------------

void RecordInspectorPanel::ConstructInterface()
{
    const KitFaces              Faces   = ResolveKitFaces();
    const SceneInspectorSummary Summary = OutlinerPanel.QueryInspector();
    SceneDirectory&             Directory = SceneDirectory::Instance();

    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(14.0f, 12.0f));

    if (!Summary.HasSelection)
    {
        SectionCaption(Faces, "INSPECTOR");
        ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Muted), "No selection");
        ImGui::Spacing();
        ImGui::TextWrapped("Select a record in the Outliner to inspect its identity, nesting and visibility here.");
        ImGui::Spacing();
        LabelRow("Records", std::to_string(OutlinerPanel.QueryTotal()) + " in the scene directory");
        ImGui::PopStyleVar();
        return;
    }

    // Identity card -----------------------------------------------------------------------------------
    {
        ImDrawList*  Ink    = ImGui::GetWindowDrawList();
        const ImVec2 Origin = ImGui::GetCursorScreenPos();
        const float  Width  = ImGui::GetContentRegionAvail().x;
        KitPillSurface(Ink, Origin, ImVec2(Origin.x + Width, Origin.y + 58.0f), Theme::Surface2, Theme::Line, 10.0f);
        const ImU32 Colour = ClassificationColour(Summary.Classification);
        Ink->AddCircleFilled(ImVec2(Origin.x + 22.0f, Origin.y + 29.0f), 9.0f, Colour);
        Ink->AddCircle(ImVec2(Origin.x + 22.0f, Origin.y + 29.0f), 13.0f, Colour, 24, 1.5f);
        KitDrawText(Ink, Faces.SemiBold, 15.0f, ImVec2(Origin.x + 44.0f, Origin.y + 12.0f), Theme::Text,
                    Summary.Name.c_str());
        char Subline[128];
        std::snprintf(Subline, sizeof(Subline), "%s / #%llu", RecordClassificationName(Summary.Classification),
                      static_cast<unsigned long long>(Summary.Token.Value));
        KitDrawText(Ink, Faces.Regular, 11.0f, ImVec2(Origin.x + 44.0f, Origin.y + 33.0f), Theme::Muted, Subline);
        ImGui::Dummy(ImVec2(Width, 58.0f));
    }

    // Rename ------------------------------------------------------------------------------------------
    SectionCaption(Faces, "IDENTITY");
    if (RenameToken != Summary.Token)
    {
        RenameToken = Summary.Token;
        std::strncpy(RenameBuffer.data(), Summary.Name.c_str(), RenameBuffer.size() - 1);
        RenameBuffer[RenameBuffer.size() - 1] = '\0';
    }
    ImGui::SetNextItemWidth(ImGui::GetContentRegionAvail().x - 76.0f);
    const bool Entered = ImGui::InputText("##RecordName", RenameBuffer.data(), RenameBuffer.size(),
                                          ImGuiInputTextFlags_EnterReturnsTrue);
    ImGui::SameLine();
    const std::string Candidate(RenameBuffer.data());
    const bool        Renamed = Entered || (ImGui::Button("Rename") && Candidate != Summary.Name);
    if (Renamed && !Candidate.empty() && Candidate != Summary.Name)
    {
        if (Directory.ConfigureName(Summary.Token, Candidate))
        {
            if (const LogCategory* Interface = LogCategories().QueryByName("Interface"))
            {
                WriteLog(*Interface, LogSeverity::Info,
                         "Record renamed: '" + Summary.Name + "' -> '" + Candidate + "'", "RecordInspectorPanel.cpp");
            }
        }
    }
    if (ImGui::IsItemHovered())
    {
        ImGui::SetTooltip("Rename the selected record (Enter applies)");
    }
    LabelRow("Classification", std::string(RecordClassificationName(Summary.Classification)) + " (fixed at creation)");

    // Nesting -----------------------------------------------------------------------------------------
    SectionCaption(Faces, "NESTING");
    const RecordToken Parent = Directory.QueryParent(Summary.Token);
    ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Faint), "Up-link");
    ImGui::SameLine(128.0f);
    if (Parent.IsValid())
    {
        if (ImGui::SmallButton(Summary.ParentName.c_str()) && SelectRecord)
        {
            SelectRecord(Parent);
        }
        if (ImGui::IsItemHovered())
        {
            ImGui::SetTooltip("Select the up-link record");
        }
    }
    else
    {
        ImGui::TextUnformatted("Root record");
    }
    LabelRow("Depth tier", std::to_string(Summary.DepthTier));
    LabelRow("Down-links", std::to_string(Summary.ChildCount) + " direct");

    std::vector<RecordToken> Order;
    Directory.CopyRegistrationOrder(Order);
    bool AnyChild = false;
    for (const RecordToken Child : Order)
    {
        if (Directory.QueryParent(Child) != Summary.Token)
        {
            continue;
        }
        if (!AnyChild)
        {
            ImGui::Spacing();
            AnyChild = true;
        }
        ImGui::Bullet();
        ImGui::SameLine();
        const std::string ChildName = Directory.QueryName(Child);
        if (ImGui::SmallButton(ChildName.c_str()) && SelectRecord)
        {
            SelectRecord(Child);
        }
    }

    // Visibility --------------------------------------------------------------------------------------
    SectionCaption(Faces, "VISIBILITY");
    bool Visible = Directory.QueryVisible(Summary.Token);
    if (ImGui::Checkbox("Visible in Outliner", &Visible))
    {
        (void)Directory.ConfigureVisible(Summary.Token, Visible);
        if (const LogCategory* Interface = LogCategories().QueryByName("Interface"))
        {
            WriteLog(*Interface, LogSeverity::Info,
                     "Record '" + Summary.Name + (Visible ? "' shown" : "' hidden") + " in the Outliner",
                     "RecordInspectorPanel.cpp");
        }
    }
    ImGui::TextWrapped("Hidden records stay registered and simulated; the toggle is an Outliner presentation state.");

    ImGui::PopStyleVar();
}

} // namespace Frontier
