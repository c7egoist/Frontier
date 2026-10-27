/*==========================================================================================================================================
                                                             VIEWPORTPANEL.CPP
==========================================================================================================================================*/
// 🧩 Blank scene canvas: the docking home of the future renderer, today a labelled surface + simulation readout.

#include "Workspace/ViewportPanel.h"

#include "Engine/Interface/StackRailControls.h"
#include "Input/InputMap.h"

#include <imgui.h>

#include <algorithm>
#include <cstdio>

namespace Frontier
{

namespace
{

using Theme = KitTheme;

void AxisBar(const char* Label, float Reading, bool Centred, float Width)
{
    ImDrawList*  Ink    = ImGui::GetWindowDrawList();
    const ImVec2 Origin = ImGui::GetCursorScreenPos();
    const float  BarX   = Origin.x + 86.0f;
    const float  BarW   = std::max(Width - 86.0f - 52.0f, 40.0f);
    const float  BarH   = 10.0f;
    char         Caption[64];
    std::snprintf(Caption, sizeof(Caption), "%+.2f", static_cast<double>(Reading));
    ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Faint), "%s", Label);
    Ink->AddRectFilled(ImVec2(BarX, Origin.y + 3.0f), ImVec2(BarX + BarW, Origin.y + 3.0f + BarH), Theme::Surface3,
                       3.0f);
    if (Centred)
    {
        const float Centre = BarX + BarW * 0.5f;
        const float Edge   = Centre + std::clamp(Reading, -1.0f, 1.0f) * BarW * 0.5f;
        Ink->AddRectFilled(ImVec2(std::min(Centre, Edge), Origin.y + 3.0f),
                           ImVec2(std::max(Centre, Edge), Origin.y + 3.0f + BarH), Theme::Mint, 3.0f);
        Ink->AddLine(ImVec2(Centre, Origin.y + 1.0f), ImVec2(Centre, Origin.y + 5.0f + BarH), Theme::Line, 1.0f);
    }
    else
    {
        const float Edge = BarX + std::clamp(Reading, 0.0f, 1.0f) * BarW;
        Ink->AddRectFilled(ImVec2(BarX, Origin.y + 3.0f), ImVec2(Edge, Origin.y + 3.0f + BarH), Theme::Mint, 3.0f);
    }
    Ink->AddText(ImVec2(BarX + BarW + 8.0f, Origin.y), Theme::Muted, Caption);
    ImGui::Dummy(ImVec2(Width, 17.0f));
}

} // namespace

//----------------------------------------------------------------------------------------------------------------------
//                                                    INTERFACE RECORDING
//----------------------------------------------------------------------------------------------------------------------

void ViewportPanel::ConstructInterface()
{
    const KitFaces Faces = ResolveKitFaces();
    ImDrawList*    Ink   = ImGui::GetWindowDrawList();

    const ImVec2 Origin  = ImGui::GetCursorScreenPos();
    const ImVec2 Avail   = ImGui::GetContentRegionAvail();
    const float  StripH  = 118.0f;
    const float  CanvasH = std::max(Avail.y - StripH - 8.0f, 60.0f);

    // Blank canvas ------------------------------------------------------------------------------------
    Ink->AddRectFilled(Origin, ImVec2(Origin.x + Avail.x, Origin.y + CanvasH), Theme::Surface, 6.0f);
    Ink->AddRect(Origin, ImVec2(Origin.x + Avail.x, Origin.y + CanvasH),
                 SimulationCaptured ? Theme::Mint : Theme::Line, 6.0f, 0, SimulationCaptured ? 1.5f : 1.0f);

    const char* Caption    = "SCENE CANVAS";
    const float CaptionW   = KitTextWidth(Faces.Medium, 12.0f, Caption) + 12.0f * 0.13f * 11.0f;
    KitDrawTracked(Ink, Faces.Medium, 12.0f,
                   ImVec2(Origin.x + (Avail.x - CaptionW) * 0.5f, Origin.y + CanvasH * 0.5f - 22.0f), Theme::Faint,
                   Caption, 12.0f * 0.13f);
    const char* Note =
        "Scene rendering connects here (eos lineage), intentionally blank in this UI step.";
    const float NoteW = KitTextWidth(Faces.Regular, 11.5f, Note);
    KitDrawText(Ink, Faces.Regular, 11.5f,
                ImVec2(Origin.x + (Avail.x - NoteW) * 0.5f, Origin.y + CanvasH * 0.5f + 2.0f), Theme::Faint, Note);

    char Stats[192];
    std::snprintf(Stats, sizeof(Stats), "%zu records · %s", RecordCount,
                  SelectedName.empty() ? "no selection" : SelectedName.c_str());
    KitDrawText(Ink, Faces.Regular, 11.0f, ImVec2(Origin.x + 12.0f, Origin.y + 10.0f), Theme::Muted, Stats);

    Ink->AddCircleFilled(ImVec2(Origin.x + Avail.x - 18.0f, Origin.y + 16.0f), 4.0f,
                         SimulationCaptured ? Theme::Mint : Theme::Faint);
    const char* Mode = SimulationCaptured ? "SIMULATION" : "EDITOR";
    KitDrawTracked(Ink, Faces.Medium, 10.0f, ImVec2(Origin.x + Avail.x - 108.0f, Origin.y + 10.0f),
                   SimulationCaptured ? Theme::Mint : Theme::Faint, Mode, 10.0f * 0.13f);

    // The whole canvas is the capture target.
    ImGui::SetCursorScreenPos(Origin);
    if (ImGui::InvisibleButton("##SceneCanvas", ImVec2(Avail.x, CanvasH)))
    {
        if (RequestCaptureToggle)
        {
            RequestCaptureToggle();
        }
    }
    if (ImGui::IsItemHovered())
    {
        ImGui::SetTooltip(SimulationCaptured ? "Simulation captured — Esc releases"
                                             : "Click (or F5) to capture the Simulation context");
    }

    ImGui::Dummy(ImVec2(Avail.x, 6.0f));
    ConstructSimulationStrip(Avail.x);
}

void ViewportPanel::ConstructSimulationStrip(float Width)
{
    const KitFaces Faces  = ResolveKitFaces();
    ImDrawList*    Ink    = ImGui::GetWindowDrawList();
    const ImVec2   Origin = ImGui::GetCursorScreenPos();
    KitPillSurface(Ink, Origin, ImVec2(Origin.x + Width, Origin.y + 112.0f), Theme::Surface2, Theme::Line, 8.0f);

    ImGui::SetCursorScreenPos(ImVec2(Origin.x + 12.0f, Origin.y + 8.0f));
    ImGui::BeginGroup();
    KitDrawTracked(Ink, Faces.Medium, 10.5f, ImVec2(Origin.x + 12.0f, Origin.y + 8.0f), Theme::Faint,
                   "SIMULATION INPUT", 10.5f * 0.13f);
    ImGui::Dummy(ImVec2(Width - 24.0f, 20.0f));

    const float Steer    = Map != nullptr ? Map->QueryAxis("Simulation.Steer") : 0.0f;
    const float Throttle = Map != nullptr ? Map->QueryAxis("Simulation.Throttle") : 0.0f;
    const float Brake    = Map != nullptr ? Map->QueryAxis("Simulation.Brake") : 0.0f;
    const bool  Handbrake = Map != nullptr && Map->QueryAction("Simulation.Handbrake").Down;
    AxisBar("Steer", Steer, true, Width - 24.0f);
    AxisBar("Throttle", Throttle, false, Width - 24.0f);
    AxisBar("Brake", Brake, false, Width - 24.0f);

    const ImVec2 LampAt = ImGui::GetCursorScreenPos();
    Ink->AddCircleFilled(ImVec2(LampAt.x + 5.0f, LampAt.y + 7.0f), 5.0f,
                         Handbrake ? KitInkHex(0xff6d6d) : Theme::Surface3);
    ImGui::Dummy(ImVec2(14.0f, 14.0f));
    ImGui::SameLine();
    ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Faint), "Handbrake (Space)");
    ImGui::SameLine(Width - 330.0f);
    ImGui::TextColored(ImGui::ColorConvertU32ToFloat4(Theme::Faint), "%s",
                       SimulationCaptured ? "WASD drive · mouse look · wheel zoom · Esc release"
                                          : "Click canvas or F5 to capture · F6 Input panel");
    ImGui::EndGroup();
    ImGui::SetCursorScreenPos(ImVec2(Origin.x, Origin.y + 112.0f));
    ImGui::Dummy(ImVec2(Width, 2.0f));
}

} // namespace Frontier
