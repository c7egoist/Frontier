/*==========================================================================================================================================
                                                        SCENE INSPECTOR PANEL
                                     ------------------------------------------------------------------
                 VehicleHMI-inspired global inspectors for Folder, Sun, Lens Flare, Clouds, Wind, and Atmosphere records.
==========================================================================================================================================*/
// 🧩 Reusable Engine Inspector rendering for global scene records and project-defined inspector callbacks.

#include "Engine/Interface/SceneInspectorPanel.h"
#include "Engine/Interface/GlobalInspectorPresentationContext.h"

#include "Engine/Interface/ControlKit.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Interface/StackRailControls.h"
#include "Engine/Scene/GlobalEnvironmentRecords.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/SceneDirectory.h"

#if defined(FRONTIER_WITH_INTERFACE_SDK)
#include <imgui.h>
#endif

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace Frontier
{

namespace
{

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                    PUBLIC FUNCTIONS
//------------------------------------------------------------------------------------------------------------------------

std::optional<SceneInspectorPanel::SubfolderRequest> SceneInspectorPanel::TakeSubfolderRequest()
{
    std::optional<SubfolderRequest> Request = std::move(PendingSubfolderRequest);
    PendingSubfolderRequest.reset();
    return Request;
}

void SceneInspectorPanel::ConstructInterface()
{
#if defined(FRONTIER_WITH_INTERFACE_SDK)
    const RecordToken Selected = BoundDirectoryPanel != nullptr ? BoundDirectoryPanel->QuerySelected() : RecordToken{};
    auto Descriptor = RecordInspectorRegistry::Instance().Query(Selected);
    const KitFaces Faces  = ResolveKitFaces();
    const KitTheme Theme  = ResolveKitTheme();
    ImDrawList* Ink       = ImGui::GetWindowDrawList();
    const ImVec2 Window   = ImGui::GetWindowPos();
    const ImVec2 Size     = ImGui::GetWindowSize();
    const float Left      = Window.x + 14.0f;
    const float Right     = Window.x + Size.x - 14.0f;
    const float Width     = std::max(100.0f, Right - Left);
    const auto Palette    = ControlKit::Palette();

    Ink->AddRectFilled(Window, ImVec2(Window.x + Size.x, Window.y + Size.y), Theme.PanelBg);
    Ink->AddRect(Window, ImVec2(Window.x + Size.x, Window.y + Size.y), Theme.PanelEdge);

    if (!Descriptor.has_value())
    {
        const char* Empty = "Select a scene record to inspect its live settings.";
        const float TextWidth = KitTextWidth(Faces.Regular, 12.5f, Empty);
        KitDrawText(Ink, Faces.Regular, 12.5f, ImVec2(Left + std::max(0.0f, (Width - TextWidth) * 0.5f), Window.y + 64.0f),
                    Theme.Faint, Empty);
        return;
    }

    const auto PresentText = [&](float X, float Y, float FontSize, ImU32 Colour, const char* Text, ImFont* Font = nullptr)
    {
        KitDrawText(Ink, Font != nullptr ? Font : Faces.Regular, FontSize, ImVec2(X, Y), Colour, Text);
    };
    const auto PresentSection = [&](float& Y, const char* Index, const char* Title)
    {
        Ink->AddRectFilled(ImVec2(Left, Y), ImVec2(Right, Y + 1.0f), Theme.LineSoft);
        Y += 12.0f;
        PresentText(Left, Y, 9.5f, Theme.Faint, Index, Faces.Medium);
        PresentText(Left, Y + 15.0f, 15.5f, Theme.Text, Title, Faces.Medium);
        Y += 38.0f;
    };
    const auto PresentMetric = [&](float X, float Y, const char* Label, const char* Value, const char* Unit, ImU32 Accent)
    {
        PresentText(X, Y, 9.0f, Theme.Faint, Label, Faces.Medium);
        PresentText(X, Y + 14.0f, 19.0f, Accent, Value, Faces.Light);
        const float ValueWidth = KitTextWidth(Faces.Light, 19.0f, Value);
        PresentText(X + ValueWidth + 5.0f, Y + 23.0f, 9.0f, Theme.Muted, Unit);
    };
    const auto PresentScalar = [&](const char* Label, double* Target, double Minimum, double Maximum,
                                const char* Format = "%.2f")
    {
        if (Target == nullptr) return false;
        char ControlLabel[96] = {};
        std::snprintf(ControlLabel, sizeof(ControlLabel), "%s##%s", Label, Label);
        ImGui::PushStyleColor(ImGuiCol_FrameBg, Theme.Surface2);
        ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, Theme.Surface3);
        ImGui::PushStyleColor(ImGuiCol_FrameBgActive, Theme.Surface3);
        ImGui::PushStyleColor(ImGuiCol_SliderGrab, Theme.Mint);
        ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, Theme.Mint);
        ImGui::PushStyleColor(ImGuiCol_Text, Theme.TextVec4);
        ImGui::SetNextItemWidth(-1.0f);
        const bool Changed = ImGui::SliderScalar(ControlLabel, ImGuiDataType_Double, Target, &Minimum, &Maximum, Format);
        ImGui::PopStyleColor(6);
        return Changed;
    };
    const auto PositionControls = [&](float Y)
    {
        ImGui::SetCursorScreenPos(ImVec2(Left, Y));
    };
    const auto PresentCheckbox = [&](const char* Label, bool* Target)
    {
        ImGui::PushStyleColor(ImGuiCol_CheckMark, Theme.Mint);
        ImGui::PushStyleColor(ImGuiCol_Text, Theme.TextVec4);
        const bool Changed = ImGui::Checkbox(Label, Target);
        ImGui::PopStyleColor(2);
        return Changed;
    };
    const auto PresentPill = [&](const char* Label, const char* Value, bool Active, const char* Id)
    {
        const ImVec2 At = ImGui::GetCursorScreenPos();
        const float PillWidth = ImGui::GetContentRegionAvail().x;
        const float PillHeight = 27.0f;
        const bool Clicked = ImGui::InvisibleButton(Id, ImVec2(PillWidth, PillHeight));
        const bool Hovered = ImGui::IsItemHovered();
        KitPillSurface(Ink, At, ImVec2(At.x + PillWidth, At.y + PillHeight),
                       Active ? Theme.MintDim : (Hovered ? Theme.Surface3 : Theme.Surface2),
                       Active ? KitInkWithAlpha(Theme.Mint, 0.36f) : Theme.Line, 999.0f);
        PresentText(At.x + 10.0f, At.y + 7.0f, 10.5f, Active ? Theme.Mint : Theme.Muted, Label, Faces.Medium);
        const float ValueWidth = KitTextWidth(Faces.Regular, 10.0f, Value);
        PresentText(At.x + PillWidth - 10.0f - ValueWidth, At.y + 8.0f, 10.0f, Theme.Text, Value);
        ImGui::Dummy(ImVec2(0.0f, 3.0f));
        return Clicked;
    };

    const ImU32 Accent = KitInkHex(Descriptor->AccentHex);
    const bool SolarOwnsHeader = Descriptor->Domain == GlobalInspectorDomain::Sun;
    if (SolarOwnsHeader)
    {
        ImGui::SetCursorScreenPos(ImVec2(Left, Window.y + 12.0f));
    }
    else
    {
        const float HeaderY = Window.y + 16.0f;
        const std::string TokenText = "RECORD / " + std::to_string(Selected.Value);
        const std::string DisplayName = SceneDirectory::Instance().QueryName(Selected);
        PresentText(Left, HeaderY, 9.0f, Accent, Descriptor->Eyebrow.c_str(), Faces.Medium);
        PresentText(Left, HeaderY + 14.0f, 21.0f, Theme.Text, DisplayName.c_str(), Faces.Light);
        PresentText(Left, HeaderY + 38.0f, 9.5f, Theme.Muted, Descriptor->Subtitle.c_str());
        PresentText(Right - KitTextWidth(Faces.Regular, 9.0f, TokenText.c_str()), HeaderY + 4.0f, 9.0f,
                    Theme.Faint, TokenText.c_str());

        ImGui::SetCursorScreenPos(ImVec2(Left, Window.y + 65.0f));
        if (Descriptor->ActivationTarget != nullptr)
        {
            PresentCheckbox("Enabled in scene", Descriptor->ActivationTarget);
            ImGui::Dummy(ImVec2(0.0f, 6.0f));
        }
    }

    const float BodyTop = ImGui::GetCursorScreenPos().y;
    ImGui::SetCursorScreenPos(ImVec2(Left, BodyTop));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 7.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(7.0f, 5.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, Theme.TextVec4);

    GlobalInspectorPresentationContext PresentationContext;
    PresentationContext.Selected = Selected;
    PresentationContext.Descriptor = &*Descriptor;
    PresentationContext.DirectoryPanel = BoundDirectoryPanel;
    PresentationContext.Ink = Ink;
    PresentationContext.Theme = Theme;
    PresentationContext.Faces = Faces;
    PresentationContext.Left = Left;
    PresentationContext.Right = Right;
    PresentationContext.Width = Width;
    PresentationContext.BodyTop = BodyTop;
    PresentationContext.Accent = Accent;
    PresentationContext.ReferenceSunElevationDegrees = ReferenceSunElevationDegrees;
    PresentationContext.ReferenceSunAzimuthDegrees = ReferenceSunAzimuthDegrees;
    PresentationContext.PresentSection = PresentSection;
    PresentationContext.PresentMetric = PresentMetric;
    PresentationContext.PresentTextPrimitive = PresentText;
    PresentationContext.PresentScalar = PresentScalar;
    PresentationContext.PositionControls = PositionControls;
    PresentationContext.PresentCheckbox = PresentCheckbox;
    PresentationContext.PresentPill = PresentPill;
    PresentationContext.QueueSubfolder = [this](RecordToken Token, std::string Title) {
        PendingSubfolderRequest = SubfolderRequest{Token, std::move(Title)};
    };

    switch (Descriptor->Domain)
    {
        case GlobalInspectorDomain::Folder:
            DrawFolderInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::Sun:
            DrawSolarInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::LensFlare:
            DrawLensFlareInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::Clouds:
            DrawCloudInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::Wind:
            DrawWindInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::Atmosphere:
            DrawAtmosphereInspectorPanel(PresentationContext);
            break;
        case GlobalInspectorDomain::GenericRecord:
        case GlobalInspectorDomain::CustomCallback:
        {
            const SceneDirectory& Directory = SceneDirectory::Instance();
            const SceneDirectoryPanel* Panel = BoundDirectoryPanel;
            const std::string Name = Directory.QueryName(Selected);
            PresentText(Left + 2.0f, BodyTop + 8.0f, 12.0f, Theme.Text, Name.c_str(), Faces.Medium);
            PresentText(Left + 2.0f, BodyTop + 31.0f, 10.5f, Theme.Muted,
                     "No global inspector schema is registered for this record yet.");
            if (Descriptor->CustomInterfaceCallback) Descriptor->CustomInterfaceCallback();
            (void)Panel;
            break;
        }
    }

    ImGui::PopStyleColor();
    ImGui::PopStyleVar(2);
    (void)Palette;
#else
    // No interface SDK: the portable registry remains available to headless validation.
#endif
}

} // namespace Frontier