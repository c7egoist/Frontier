/*==========================================================================================================================================
                                                   FOLDER INSPECTOR PANEL
==========================================================================================================================================*/
// 🧩 Source-mapped folder telemetry and organization controls, isolated from other Inspector domains.

#include "Engine/Interface/GlobalInspectorPresentationContext.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/SceneDirectory.h"

#if defined(FRONTIER_WITH_INTERFACE_SDK)
#include <imgui.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <string>
#include <vector>

namespace Frontier
{
namespace
{
ImU32 InspectorClassificationColour(RecordClassification Classification) noexcept
{
    switch (Classification)
    {
        case RecordClassification::Folder:       return KitInkHex(0xe8c27a);
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
} // namespace

void DrawFolderInspectorPanel(GlobalInspectorPresentationContext& Context)
{

            auto* Folder = static_cast<FolderRecord*>(Context.Descriptor->PayloadAddress);
            SceneDirectory& Directory = SceneDirectory::Instance();
            const RecordToken Selected = Context.Selected;
            const uint32_t ChildCount = Directory.QueryChildCount(Selected);
            const std::string ChildrenText = std::to_string(ChildCount);
            const std::string TotalText = std::to_string(Directory.QueryCount());
            const std::string LeafText = std::to_string(Directory.QueryCount() > ChildCount ? Directory.QueryCount() - ChildCount : 0);
            float Y = Context.BodyTop;
            Context.PresentSection(Y, "01 / DIRECTORY TELEMETRY", "Folder overview");
            const float Third = (Context.Width - 24.0f) / 3.0f;
            Context.PresentMetric(Context.Left + 2.0f, Y, "NESTED ITEMS", ChildrenText.c_str(), "records", Context.Accent);
            Context.PresentMetric(Context.Left + Third + 8.0f, Y, "SCENE TOTAL", TotalText.c_str(), "records", Context.Theme.Text);
            Context.PresentMetric(Context.Left + Third * 2.0f + 14.0f, Y, "OTHER ROWS", LeafText.c_str(), "records", Context.Theme.Text);
            Y += 54.0f;
            Context.PresentSection(Y, "02 / CONTENT DISTRIBUTION", "Scene composition");
            std::array<uint32_t, static_cast<size_t>(RecordClassification::Count)> Counts{};
            std::vector<RecordToken> Tokens;
            Directory.CopyRegistrationOrder(Tokens);
            for (const RecordToken Token : Tokens)
            {
                if (Directory.QueryParent(Token) != Selected) continue;
                const size_t Category = static_cast<size_t>(Directory.QueryClassification(Token));
                if (Category < Counts.size()) ++Counts[Category];
            }
            uint32_t Maximum = 1;
            for (const uint32_t Count : Counts) Maximum = std::max(Maximum, Count);
            for (size_t Index = 0; Index < Counts.size(); ++Index)
            {
                if (Counts[Index] == 0) continue;
                const char* CategoryName = RecordClassificationName(static_cast<RecordClassification>(Index));
                Context.PresentText(Context.Left + 2.0f, Y, 10.5f, Context.Theme.Muted, CategoryName);
                char CountLabel[24] = {};
                std::snprintf(CountLabel, sizeof(CountLabel), "%u", Counts[Index]);
                const float CountWidth = KitTextWidth(Context.Faces.Medium, 10.5f, CountLabel);
                Context.PresentText(Context.Right - CountWidth, Y, 10.5f, Context.Theme.Text, CountLabel, Context.Faces.Medium);
                const float BarY = Y + 16.0f;
                Context.Ink->AddRectFilled(ImVec2(Context.Left + 2.0f, BarY), ImVec2(Context.Right - 2.0f, BarY + 5.0f), Context.Theme.Surface2, 3.0f);
                Context.Ink->AddRectFilled(ImVec2(Context.Left + 2.0f, BarY),
                                   ImVec2(Context.Left + 2.0f + (Context.Width - 4.0f) * Counts[Index] / Maximum, BarY + 5.0f),
                                   InspectorClassificationColour(static_cast<RecordClassification>(Index)), 3.0f);
                Y += 31.0f;
            }
            Context.PresentSection(Y, "03 / ORGANIZATION", "Folder properties");
            Context.PositionControls(Y);
            ImGui::PushStyleColor(ImGuiCol_FrameBg, Context.Theme.Surface2);
            ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, Context.Theme.Surface3);
            ImGui::PushStyleColor(ImGuiCol_FrameBgActive, Context.Theme.Surface3);
            ImGui::PushStyleColor(ImGuiCol_Text, Context.Theme.TextVec4);
            ImGui::PushStyleColor(ImGuiCol_TextSelectedBg, Context.Theme.MintDim);
            ImGui::PushStyleColor(ImGuiCol_Button, Context.Theme.Surface2);
            ImGui::PushStyleColor(ImGuiCol_ButtonHovered, Context.Theme.Surface3);
            ImGui::PushStyleColor(ImGuiCol_ButtonActive, Context.Theme.Surface3);
            ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 7.0f);
            ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(9.0f, 7.0f));
            static std::array<char, 96> TitleBuffer{};
            std::snprintf(TitleBuffer.data(), TitleBuffer.size(), "%s", Folder->TitleText.c_str());
            ImGui::PushItemWidth(-1.0f);
            if (ImGui::InputTextWithHint("##FolderTitle", "Folder title", TitleBuffer.data(), TitleBuffer.size()))
            {
                Folder->TitleText = TitleBuffer.data();
                (void)Directory.ConfigureName(Selected, Folder->TitleText);
            }
            ImGui::PopItemWidth();
            if (ImGui::Button("+  Create subfolder"))
            {
                Context.QueueSubfolder(Selected, "New Folder");
            }
            Context.PresentCheckbox("Lock folder placement", &Folder->PlacementLockedEnabled);
            static std::array<char, 8> BadgeBuffer{};
            static std::array<char, 256> NotesBuffer{};
            std::snprintf(BadgeBuffer.data(), BadgeBuffer.size(), "%s", Folder->BadgeText.c_str());
            std::snprintf(NotesBuffer.data(), NotesBuffer.size(), "%s", Folder->NotesText.c_str());
            ImGui::PushItemWidth(-1.0f);
            if (ImGui::InputTextWithHint("##FolderBadge", "Badge code (DIR)", BadgeBuffer.data(), BadgeBuffer.size()))
                Folder->BadgeText = BadgeBuffer.data();
            if (ImGui::InputTextMultiline("##FolderNotes", NotesBuffer.data(), NotesBuffer.size(), ImVec2(-1.0f, 64.0f),
                                          ImGuiInputTextFlags_CtrlEnterForNewLine))
                Folder->NotesText = NotesBuffer.data();
            ImGui::PopItemWidth();
            const bool FolderVisible = Directory.QueryVisible(Selected);
            bool VisibilityCopy = FolderVisible;
            if (Context.PresentCheckbox("Folder visibility · applies to nested rows", &VisibilityCopy))
            {
                (void)Directory.ConfigureVisible(Selected, VisibilityCopy);
                uint32_t FolderDepth = 0;
                for (const SceneDirectoryRow& Row : Context.DirectoryPanel->QueryRows())
                    if (Row.Token == Selected) FolderDepth = Row.DepthTier;
                bool WithinSubtree = false;
                for (const SceneDirectoryRow& Row : Context.DirectoryPanel->QueryRows())
                {
                    if (Row.Token == Selected)
                    {
                        WithinSubtree = true;
                        continue;
                    }
                    if (!WithinSubtree || Row.DepthTier <= FolderDepth) break;
                    (void)Directory.ConfigureVisible(Row.Token, VisibilityCopy);
                }
            }
            if (ImGui::Button("Edit folder accent")) ImGui::OpenPopup("##FolderAccentPopup");
            if (ImGui::BeginPopup("##FolderAccentPopup"))
            {
                float Colour[3] = {float((Folder->AccentSpectrumHex >> 16) & 0xffu) / 255.0f,
                                  float((Folder->AccentSpectrumHex >> 8) & 0xffu) / 255.0f,
                                  float(Folder->AccentSpectrumHex & 0xffu) / 255.0f};
                if (ImGui::ColorPicker3("Accent", Colour))
                {
                    Folder->AccentSpectrumHex = (uint32_t(Colour[0] * 255.0f) << 16) |
                                                (uint32_t(Colour[1] * 255.0f) << 8) |
                                                uint32_t(Colour[2] * 255.0f);
                    Context.Descriptor->AccentHex = Folder->AccentSpectrumHex;
                    RecordInspectorRegistry::Instance().Register(*Context.Descriptor);
                }
                ImGui::EndPopup();
            }
            ImGui::PopStyleVar(2);
            ImGui::PopStyleColor(8);

}
} // namespace Frontier
#endif // FRONTIER_WITH_INTERFACE_SDK
