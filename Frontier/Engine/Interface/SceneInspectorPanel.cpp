/*==========================================================================================================================================
                                                        SCENE INSPECTOR PANEL
                                     ------------------------------------------------------------------
                 VehicleHMI-inspired global inspectors for Folder, Sun, Lens Flare, Clouds, Wind, and Atmosphere records.
==========================================================================================================================================*/
// 🧩 Reusable Engine Inspector rendering for global scene records and project-defined inspector callbacks.

#include "Engine/Interface/SceneInspectorPanel.h"

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

    const float BodyTop = ImGui::GetCursorScreenPos().y;
    ImGui::SetCursorScreenPos(ImVec2(Left, BodyTop));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 7.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(7.0f, 5.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, Theme.TextVec4);

    switch (Descriptor->Domain)
    {
        case GlobalInspectorDomain::Folder:
        {
            auto* Folder = static_cast<FolderRecord*>(Descriptor->PayloadAddress);
            SceneDirectory& Directory = SceneDirectory::Instance();
            const uint32_t ChildCount = Directory.QueryChildCount(Selected);
            const std::string ChildrenText = std::to_string(ChildCount);
            const std::string TotalText = std::to_string(Directory.QueryCount());
            const std::string LeafText = std::to_string(Directory.QueryCount() > ChildCount ? Directory.QueryCount() - ChildCount : 0);
            float Y = BodyTop;
            PresentSection(Y, "01 / DIRECTORY TELEMETRY", "Folder overview");
            const float Third = (Width - 24.0f) / 3.0f;
            PresentMetric(Left + 2.0f, Y, "NESTED ITEMS", ChildrenText.c_str(), "records", Accent);
            PresentMetric(Left + Third + 8.0f, Y, "SCENE TOTAL", TotalText.c_str(), "records", Theme.Text);
            PresentMetric(Left + Third * 2.0f + 14.0f, Y, "OTHER ROWS", LeafText.c_str(), "records", Theme.Text);
            Y += 54.0f;
            PresentSection(Y, "02 / CONTENT DISTRIBUTION", "Scene composition");
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
                PresentText(Left + 2.0f, Y, 10.5f, Theme.Muted, CategoryName);
                char CountLabel[24] = {};
                std::snprintf(CountLabel, sizeof(CountLabel), "%u", Counts[Index]);
                const float CountWidth = KitTextWidth(Faces.Medium, 10.5f, CountLabel);
                PresentText(Right - CountWidth, Y, 10.5f, Theme.Text, CountLabel, Faces.Medium);
                const float BarY = Y + 16.0f;
                Ink->AddRectFilled(ImVec2(Left + 2.0f, BarY), ImVec2(Right - 2.0f, BarY + 5.0f), Theme.Surface2, 3.0f);
                Ink->AddRectFilled(ImVec2(Left + 2.0f, BarY),
                                   ImVec2(Left + 2.0f + (Width - 4.0f) * Counts[Index] / Maximum, BarY + 5.0f),
                                   InspectorClassificationColour(static_cast<RecordClassification>(Index)), 3.0f);
                Y += 31.0f;
            }
            PresentSection(Y, "03 / ORGANIZATION", "Folder properties");
            PositionControls(Y);
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
                PendingSubfolderRequest = SubfolderRequest{Selected, "New Folder"};
            }
            PresentCheckbox("Lock folder placement", &Folder->PlacementLockedEnabled);
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
            if (PresentCheckbox("Folder visibility · applies to nested rows", &VisibilityCopy))
            {
                (void)Directory.ConfigureVisible(Selected, VisibilityCopy);
                uint32_t FolderDepth = 0;
                for (const SceneDirectoryRow& Row : BoundDirectoryPanel->QueryRows())
                    if (Row.Token == Selected) FolderDepth = Row.DepthTier;
                bool WithinSubtree = false;
                for (const SceneDirectoryRow& Row : BoundDirectoryPanel->QueryRows())
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
                    Descriptor->AccentHex = Folder->AccentSpectrumHex;
                    RecordInspectorRegistry::Instance().Register(*Descriptor);
                }
                ImGui::EndPopup();
            }
            break;
        }
        case GlobalInspectorDomain::Sun:
        {
            auto* Sun = static_cast<SunRecord*>(Descriptor->PayloadAddress);
            float Y = BodyTop;
            PresentSection(Y, "01 / SOLAR OBSERVATORY", "Overview · direction & source");
            const ImVec2 DiagramMin(Left + 2.0f, Y);
            const float DiagramSize = std::min(Width - 4.0f, 124.0f);
            const ImVec2 Centre(DiagramMin.x + DiagramSize * 0.5f, DiagramMin.y + DiagramSize * 0.50f);
            Ink->AddCircle(Centre, DiagramSize * 0.42f, Theme.Line, 64, 1.0f);
            Ink->AddCircle(Centre, DiagramSize * 0.22f, Theme.LineSoft, 64, 1.0f);
            Ink->AddLine(ImVec2(DiagramMin.x + 5.0f, Centre.y), ImVec2(DiagramMin.x + DiagramSize - 5.0f, Centre.y), Theme.LineSoft, 1.0f);
            Ink->AddLine(ImVec2(Centre.x, DiagramMin.y + 5.0f), ImVec2(Centre.x, DiagramMin.y + DiagramSize - 5.0f), Theme.LineSoft, 1.0f);
            const double Azimuth = Sun->AzimuthDegrees * 0.017453292519943295;
            const double Elevation = std::clamp(Sun->ElevationDegrees, -90.0, 90.0) * 0.017453292519943295;
            const float Radius = DiagramSize * 0.42f;
            const ImVec2 SunPoint(Centre.x + float(std::cos(Azimuth) * std::cos(Elevation)) * Radius,
                                  Centre.y - float(std::sin(Elevation)) * Radius);
            Ink->AddLine(Centre, SunPoint, Accent, 2.0f);
            Ink->AddCircleFilled(SunPoint, 5.0f, Accent);
            char DirectionValue[64] = {};
            std::snprintf(DirectionValue, sizeof(DirectionValue), "%+.0f° / %.0f°", Sun->ElevationDegrees, Sun->AzimuthDegrees);
            PresentMetric(DiagramMin.x + DiagramSize + 18.0f, DiagramMin.y + 8.0f, "ALTITUDE / AZIMUTH", DirectionValue, "ELEV / AZIM", Accent);
            Y += DiagramSize + 10.0f;
            PositionControls(Y);
            if (PresentPill("Sunlight", Sun->SunlightEnabled ? "LIVE" : "OFF", Sun->SunlightEnabled, "##SunlightQuick"))
                Sun->SunlightEnabled = !Sun->SunlightEnabled;
            if (PresentPill("Sun disc", Sun->SolarDiscEnabled ? "LIVE" : "OFF", Sun->SolarDiscEnabled, "##SolarDiscQuick"))
                Sun->SolarDiscEnabled = !Sun->SolarDiscEnabled;
            if (PresentPill("Day cycle", Sun->DayCycleEnabled ? "RUNNING" : "PAUSED", Sun->DayCycleEnabled, "##SolarCycleQuick"))
                Sun->DayCycleEnabled = !Sun->DayCycleEnabled;
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "02 / POSITION & LIGHT", "Solar controls");
            PositionControls(Y);
            if (PresentScalar("Elevation", &Sun->ElevationDegrees, -90.0, 90.0, "%.1f°"))
            {
                Sun->AutomaticPlacementEnabled = false;
                Sun->DayCycleEnabled = false;
            }
            if (PresentScalar("Azimuth", &Sun->AzimuthDegrees, -180.0, 180.0, "%.1f°"))
            {
                Sun->AutomaticPlacementEnabled = false;
                Sun->DayCycleEnabled = false;
            }
            (void)PresentScalar("Solar illuminance", &Sun->SolarIlluminance, 0.0, 60.0, "%.2f×");
            if (PresentPill("Placement", Sun->AutomaticPlacementEnabled ? "AUTOMATIC" : "MANUAL",
                         Sun->AutomaticPlacementEnabled, "##SolarPlacementMode"))
            {
                Sun->AutomaticPlacementEnabled = !Sun->AutomaticPlacementEnabled;
                if (Sun->AutomaticPlacementEnabled) Sun->RecomputeFromEphemeris();
            }
            if (PresentPill("Lighting preset", "Noon / Golden / Dusk / Night", false, "##SolarPresets"))
                ImGui::OpenPopup("##SolarPresetMenu");
            if (ImGui::BeginPopup("##SolarPresetMenu"))
            {
                if (ImGui::Selectable("Noon")) Sun->ApplyLightingPreset(0);
                if (ImGui::Selectable("Golden")) Sun->ApplyLightingPreset(1);
                if (ImGui::Selectable("Dusk")) Sun->ApplyLightingPreset(2);
                if (ImGui::Selectable("Night")) Sun->ApplyLightingPreset(3);
                ImGui::EndPopup();
            }
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "03 / DAYLIGHT", "Daily solar path · geometric horizon");
            const DailySolarCurveSummary Curve = Sun->EvaluateDailyElevationCurve();
            const float PlotTop = Y;
            const float PlotHeight = 74.0f;
            Ink->AddRectFilled(ImVec2(Left + 2.0f, PlotTop), ImVec2(Right - 2.0f, PlotTop + PlotHeight), Theme.Surface2, 7.0f);
            Ink->AddLine(ImVec2(Left + 8.0f, PlotTop + PlotHeight * 0.71f), ImVec2(Right - 8.0f, PlotTop + PlotHeight * 0.71f), Theme.Line, 1.0f);
            std::vector<ImVec2> SolarPoints;
            SolarPoints.reserve(Curve.ElevationSamplesDegrees.size());
            for (size_t Index = 0; Index < Curve.ElevationSamplesDegrees.size(); ++Index)
            {
                const float X = Left + 8.0f + float(Index) / 96.0f * (Width - 16.0f);
                const float NormalizedElevation = float((Curve.ElevationSamplesDegrees[Index] + 20.0) / 110.0);
                const float Z = PlotTop + PlotHeight - 8.0f - std::clamp(NormalizedElevation, 0.0f, 1.0f) * (PlotHeight - 16.0f);
                SolarPoints.emplace_back(X, Z);
            }
            Ink->AddPolyline(SolarPoints.data(), static_cast<int>(SolarPoints.size()), Accent, ImDrawFlags_None, 2.0f);
            char Sunrise[48] = {}, Sunset[48] = {}, Daylight[48] = {};
            if (Curve.SunriseHour >= 0.0)
            {
                std::snprintf(Sunrise, sizeof(Sunrise), "%02.0f:%02.0f", std::floor(Curve.SunriseHour),
                              std::fmod(Curve.SunriseHour, 1.0) * 60.0);
            }
            else
            {
                std::snprintf(Sunrise, sizeof(Sunrise), "Polar");
            }
            if (Curve.SunsetHour >= 0.0)
            {
                std::snprintf(Sunset, sizeof(Sunset), "%02.0f:%02.0f", std::floor(Curve.SunsetHour),
                              std::fmod(Curve.SunsetHour, 1.0) * 60.0);
            }
            else
            {
                std::snprintf(Sunset, sizeof(Sunset), "Polar");
            }
            std::snprintf(Daylight, sizeof(Daylight), "%.1f h", Curve.DaylightSpanHours);
            PresentMetric(Left + 2.0f, PlotTop + PlotHeight + 8.0f, "SUNRISE", Sunrise, "local", Accent);
            PresentMetric(Left + Width * 0.40f, PlotTop + PlotHeight + 8.0f, "SUNSET", Sunset, "local", Accent);
            PresentMetric(Left + Width * 0.74f, PlotTop + PlotHeight + 8.0f, "DAYLIGHT", Daylight, "today", Accent);
            Y = PlotTop + PlotHeight + 58.0f;
            PresentSection(Y, "04 / SPECTRUM & OPTICS", "Light, colour & solar disc");
            PositionControls(Y);
            if (PresentScalar("Colour temperature", &Sun->ColourTemperatureKelvin, 2000.0, 10000.0, "%.0f K"))
                Sun->TemperatureModeEnabled = true;
            (void)PresentCheckbox("Planck temperature tint", &Sun->TemperatureModeEnabled);
            (void)PresentScalar("Solar angular radius", &Sun->SolarRadiusDegrees, 0.05, 2.0, "%.3f°");
            (void)PresentScalar("Aureole glow", &Sun->AureoleGlow, 0.0, 3.0, "%.2f×");
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            std::array<double, 65> PlanckSamples{};
            double WienPeakNanometres = 0.0;
            Sun->EvaluatePlanckSpectrum(PlanckSamples, WienPeakNanometres);
            const ImVec2 SpectrumMin(Left + 2.0f, Y);
            const float SpectrumWidth = Width - 4.0f;
            const float SpectrumHeight = 54.0f;
            Ink->AddRectFilled(SpectrumMin, ImVec2(SpectrumMin.x + SpectrumWidth, SpectrumMin.y + SpectrumHeight),
                               Theme.Surface2, 7.0f);
            std::array<ImVec2, 65> SpectrumPoints{};
            for (size_t Index = 0; Index < PlanckSamples.size(); ++Index)
            {
                SpectrumPoints[Index] = ImVec2(
                    SpectrumMin.x + 7.0f + float(Index) / 64.0f * (SpectrumWidth - 14.0f),
                    SpectrumMin.y + SpectrumHeight - 8.0f - float(PlanckSamples[Index]) * (SpectrumHeight - 18.0f));
            }
            Ink->AddPolyline(SpectrumPoints.data(), static_cast<int>(SpectrumPoints.size()), Accent, ImDrawFlags_None, 1.8f);
            char PeakLabel[48] = {};
            std::snprintf(PeakLabel, sizeof(PeakLabel), "PLANCK REFERENCE · WIEN PEAK %.0f nm", WienPeakNanometres);
            PresentText(SpectrumMin.x + 8.0f, SpectrumMin.y + SpectrumHeight - 14.0f, 8.0f, Theme.Muted, PeakLabel);
            PositionControls(Y + SpectrumHeight + 8.0f);
            if (ImGui::Button("Reset Sun settings")) Sun->ResetDefaults();
            break;
        }
        case GlobalInspectorDomain::LensFlare:
        {
            auto* Flare = static_cast<LensFlareRecord*>(Descriptor->PayloadAddress);
            float Y = BodyTop;
            PresentSection(Y, "01 / CAMERA OPTICS", "Live optical composite");
            const float CardHeight = 108.0f;
            const ImVec2 Min(Left + 2.0f, Y);
            const ImVec2 CardSize(Width - 4.0f, CardHeight);
            ImGui::SetCursorScreenPos(Min);
            ImGui::InvisibleButton("##LensFlareSourcePreview", CardSize);
            if (ImGui::IsItemActive())
            {
                const ImVec2 Pointer = ImGui::GetIO().MousePos;
                Flare->PreviewSourceU = std::clamp(double((Pointer.x - Min.x) / CardSize.x), 0.06, 0.94);
                Flare->PreviewSourceV = std::clamp(double((Pointer.y - Min.y) / CardSize.y), 0.08, 0.92);
            }
            Ink->AddRectFilled(Min, ImVec2(Right - 2.0f, Y + CardHeight), Theme.Surface2, 9.0f);
            Ink->AddRect(Min, ImVec2(Right - 2.0f, Y + CardHeight), Theme.Line, 9.0f);
            const ImVec2 Source(Min.x + float(Flare->PreviewSourceU) * (Width - 4.0f), Y + float(Flare->PreviewSourceV) * CardHeight);
            const ImVec2 OpticalCentre(Min.x + (Width - 4.0f) * 0.5f, Y + CardHeight * 0.5f);
            Ink->AddLine(Source, OpticalCentre, KitInkWithAlpha(Accent, 0.35f), 1.0f);
            const auto Ghosts = Flare->EvaluateSensorGhostCentres();
            for (size_t Index = 0; Index < Ghosts.size(); ++Index)
            {
                const float GhostX = Min.x + float(Ghosts[Index].first) * (Width - 4.0f);
                const float GhostY = Y + float(Ghosts[Index].second) * CardHeight;
                if (GhostX < Min.x + 5.0f || GhostX > Right - 7.0f || GhostY < Y + 5.0f || GhostY > Y + CardHeight - 5.0f) continue;
                Ink->AddCircle(ImVec2(GhostX, GhostY), 3.0f + float(Index % 3) * 2.0f, KitInkWithAlpha(Accent, 0.48f), 24, 1.4f);
            }
            Ink->AddCircleFilled(Source, 4.0f, Accent);
            Ink->AddCircle(OpticalCentre, 4.0f, Theme.Muted);
            PresentText(Min.x + 8.0f, Y + CardHeight - 16.0f, 8.5f, Theme.Faint, "SOURCE → SENSOR CENTRE → INTERNAL REFLECTIONS");
            Y += CardHeight + 11.0f;
            PositionControls(Y);
            (void)PresentCheckbox("Lens flare enabled in scene", &Flare->FlareEnabled);
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "02 / COMPOSE", "Intensity, optical spread & preset");
            PositionControls(Y);
            (void)PresentScalar("Global intensity", &Flare->GlobalIntensity, 0.0, 5.0, "%.2f×");
            (void)PresentScalar("Optical spread", &Flare->OpticalSpread, 0.25, 2.0, "%.2f×");
            (void)PresentScalar("Chromatic separation", &Flare->ChromaticSeparation, 0.0, 1.0, "%.2f");
            const char* Presets[] = {"Cinematic", "Anamorphic Prime", "Clean Portrait", "Solar Bloom", "Custom layers"};
            const int32_t CurrentPreset = std::clamp(Flare->PresetIndex, 0, 4);
            if (ImGui::BeginCombo("Optical preset", Presets[CurrentPreset]))
            {
                for (int32_t Index = 0; Index < 5; ++Index)
                {
                    if (ImGui::Selectable(Presets[Index], Index == CurrentPreset)) Flare->ApplyOpticalPreset(Index);
                }
                ImGui::EndCombo();
            }
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "03 / GHOSTS", "Sensor-plane internal reflections");
            PositionControls(Y);
            (void)PresentScalar("Ghost spacing", &Flare->GhostSpacing, 0.0, 3.0, "%.2f×");
            (void)PresentScalar("Ghost brightness", &Flare->GhostBrightness, 0.0, 2.0, "%.2f×");
            double GhostCount = Flare->GhostCount;
            if (PresentScalar("Ghost count", &GhostCount, 0.0, 24.0, "%.0f")) Flare->GhostCount = int32_t(std::round(GhostCount));
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "04 / HALO & DIFFRACTION", "Annular response / aperture");
            PositionControls(Y);
            (void)PresentScalar("Halo radius", &Flare->HaloRadius, 0.01, 0.60, "%.3f");
            (void)PresentScalar("Halo width", &Flare->HaloWidth, 0.005, 0.20, "%.3f");
            (void)PresentScalar("Halo brightness", &Flare->HaloBrightness, 0.0, 2.0, "%.2f×");
            PresentCheckbox("Anamorphic streak", &Flare->AnamorphicStreakEnabled);
            PresentCheckbox("Warm streak", &Flare->WarmStreakEnabled);
            PresentCheckbox("Aperture starburst", &Flare->StarburstEnabled);
            double BladeCount = Flare->ApertureBlades;
            if (PresentScalar("Aperture blades", &BladeCount, 2.0, 12.0, "%.0f")) Flare->ApertureBlades = int32_t(std::round(BladeCount));
            PresentText(Left + 2.0f, ImGui::GetCursorScreenPos().y, 10.0f, Theme.Muted,
                     ("Effective ray pairs · " + std::to_string(Flare->QueryEffectiveRayPairs())).c_str());
            break;
        }
        case GlobalInspectorDomain::Clouds:
        {
            auto* Clouds = static_cast<CloudLayerRecord*>(Descriptor->PayloadAddress);
            Clouds->SynchronizeCloudParameters();
            float Y = BodyTop;
            PresentSection(Y, "01 / CLOUD OBSERVATORY", "Overview · density field");
            const ImVec2 Min(Left + 2.0f, Y);
            const float AtlasW = Width - 4.0f;
            const float AtlasH = 76.0f;
            Ink->AddRectFilled(Min, ImVec2(Min.x + AtlasW, Min.y + AtlasH), Theme.Surface2, 8.0f);
            for (int32_t Index = 0; Index < 5; ++Index)
            {
                const float X = Min.x + 12.0f + float(Index) / 4.0f * (AtlasW - 24.0f);
                Ink->AddLine(ImVec2(X, Min.y + 8.0f), ImVec2(X, Min.y + AtlasH - 8.0f), Theme.LineSoft, 1.0f);
            }
            for (int32_t Index = 0; Index < 4; ++Index)
            {
                const float Z = Min.y + 12.0f + float(Index) / 3.0f * (AtlasH - 24.0f);
                Ink->AddLine(ImVec2(Min.x + 8.0f, Z), ImVec2(Min.x + AtlasW - 8.0f, Z), Theme.LineSoft, 1.0f);
            }
            constexpr int32_t GridWidth = 36;
            constexpr int32_t GridHeight = 10;
            const float CellWidth = (AtlasW - 16.0f) / GridWidth;
            const float CellHeight = (AtlasH - 20.0f) / GridHeight;
            const double SampleHeight = Clouds->BaseAltitudeMetres + Clouds->QueryRenderedDepthMetres() * 0.48;
            for (int32_t Row = 0; Row < GridHeight; ++Row)
            {
                for (int32_t Column = 0; Column < GridWidth; ++Column)
                {
                    const SpatialVector SamplePoint{
                        20000.0 * (double(Column) / (GridWidth - 1)),
                        20000.0 * (double(Row) / (GridHeight - 1)),
                        SampleHeight};
                    const double Density = CloudDensity(Clouds->Parameters, SamplePoint);
                    if (Density <= 0.005) continue;
                    const float NormalizedDensity = float(std::clamp(Density / 1.5, 0.0, 1.0));
                    const ImU32 CellInk = KitInkWithAlpha(Accent, 0.12f + NormalizedDensity * 0.62f);
                    const ImVec2 CellMin(Min.x + 8.0f + Column * CellWidth,
                                         Min.y + 8.0f + Row * CellHeight);
                    Ink->AddRectFilled(CellMin, ImVec2(CellMin.x + CellWidth - 1.2f, CellMin.y + CellHeight - 1.0f),
                                       CellInk, 2.0f);
                }
            }
            PresentText(Min.x + 10.0f, Min.y + AtlasH - 15.0f, 8.5f, Theme.Muted,
                     "XY / CPU FBM DENSITY SAMPLE · NOT A LIT SKY");
            Y += AtlasH + 9.0f;
            PositionControls(Y);
            (void)PresentCheckbox("Global clouds enabled", &Clouds->CloudLayerEnabled);
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "02 / SHAPE & COVERAGE", "Formation and altitude");
            PositionControls(Y);
            (void)PresentScalar("Coverage", &Clouds->CoverageFraction, 0.0, 1.0, "%.2f");
            (void)PresentScalar("Density multiplier", &Clouds->DensityMultiplier, 0.0, 4.0, "%.2f×");
            double Formation = Clouds->FormationIndex;
            if (PresentScalar("Formation index (0–5)", &Formation, 0.0, 5.0, "%.0f")) Clouds->FormationIndex = int32_t(std::round(Formation));
            (void)PresentScalar("Layer base", &Clouds->BaseAltitudeMetres, 100.0, 20000.0, "%.0f m");
            (void)PresentScalar("Layer thickness", &Clouds->LayerThicknessMetres, 100.0, 6000.0, "%.0f m");
            (void)PresentScalar("Ceiling", &Clouds->CeilingAltitudeMetres, 4000.0, 20000.0, "%.0f m");
            Clouds->SynchronizeCloudParameters();
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            const ImVec2 ProfileMin(Left + 2.0f, Y);
            const float ProfileWidth = Width - 4.0f;
            const float ProfileHeight = 48.0f;
            Ink->AddRectFilled(ProfileMin, ImVec2(ProfileMin.x + ProfileWidth, ProfileMin.y + ProfileHeight),
                               Theme.Surface2, 7.0f);
            std::array<ImVec2, 41> EnvelopePoints{};
            for (size_t Index = 0; Index < EnvelopePoints.size(); ++Index)
            {
                const double HeightFraction = double(Index) / double(EnvelopePoints.size() - 1);
                const float X = ProfileMin.x + 8.0f + float(HeightFraction) * (ProfileWidth - 16.0f);
                const float Z = ProfileMin.y + ProfileHeight - 7.0f -
                                float(Clouds->EvaluateVerticalEnvelope(HeightFraction)) * (ProfileHeight - 14.0f);
                EnvelopePoints[Index] = ImVec2(X, Z);
            }
            Ink->AddPolyline(EnvelopePoints.data(), static_cast<int>(EnvelopePoints.size()), Accent, ImDrawFlags_None, 1.8f);
            PresentText(ProfileMin.x + 8.0f, ProfileMin.y + ProfileHeight - 14.0f, 8.0f, Theme.Muted,
                     "FORMATION / NORMALISED VERTICAL DENSITY ENVELOPE");
            Y += ProfileHeight + 8.0f;
            PresentSection(Y, "03 / CLOUD RENDERING", "Trace budget and ground shadow");
            PositionControls(Y);
            char Summary[96] = {};
            std::snprintf(Summary, sizeof(Summary), "%s · %.0f m rendered · %d primary samples",
                          CloudLayerRecord::FormationLabel(Clouds->FormationIndex), Clouds->QueryRenderedDepthMetres(),
                          Clouds->QuerySkyMarchBudget());
            PresentText(Left + 2.0f, Y, 10.0f, Accent, Summary, Faces.Medium);
            Y += 17.0f;
            double TargetResolution = Clouds->TargetResolutionPercent;
            if (PresentScalar("Target resolution", &TargetResolution, 25.0, 100.0, "%.0f%%"))
            {
                Clouds->TargetResolutionPercent = int32_t(std::round(TargetResolution));
            }
            PositionControls(Y);
            (void)PresentCheckbox("Projected ground shadows", &Clouds->GroundShadowsEnabled);
            (void)PresentScalar("Shadow softness", &Clouds->ShadowSoftnessMetres, 0.0, 200.0, "%.0f m");
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "04 / WEATHER COUPLING", "Shared wind & receivers");
            PositionControls(Y);
            PresentCheckbox("Follow shared wind", &Clouds->FollowSharedWindEnabled);
            PresentCheckbox("Storm lightning", &Clouds->StormLightningEnabled);
            break;
        }
        case GlobalInspectorDomain::Wind:
        {
            auto* Wind = static_cast<WindFieldRecord*>(Descriptor->PayloadAddress);
            float Y = BodyTop;
            PresentSection(Y, "01 / SHARED FORCE FIELD", "Flow · source bearing & velocity");
            const ImVec2 CompassCentre(Left + Width * 0.5f, Y + 59.0f);
            const float CompassRadius = std::min(Width * 0.28f, 54.0f);
            ImGui::SetCursorScreenPos(ImVec2(Left, Y));
            ImGui::InvisibleButton("##WindCompassRose", ImVec2(Width, CompassRadius * 2.0f + 22.0f));
            if (ImGui::IsItemActive())
            {
                const ImVec2 Pointer = ImGui::GetIO().MousePos;
                const double DeltaX = Pointer.x - CompassCentre.x;
                const double DeltaY = CompassCentre.y - Pointer.y;
                double Bearing = std::atan2(DeltaX, DeltaY) * 57.29577951308232;
                if (Bearing < 0.0) Bearing += 360.0;
                Wind->TravelBearingDegrees = Bearing;
            }
            Ink->AddCircle(CompassCentre, CompassRadius, Theme.Line, 64, 1.2f);
            Ink->AddCircle(CompassCentre, CompassRadius * 0.62f, Theme.LineSoft, 64, 1.0f);
            Ink->AddLine(ImVec2(CompassCentre.x - CompassRadius, CompassCentre.y),
                         ImVec2(CompassCentre.x + CompassRadius, CompassCentre.y), Theme.LineSoft, 1.0f);
            Ink->AddLine(ImVec2(CompassCentre.x, CompassCentre.y - CompassRadius),
                         ImVec2(CompassCentre.x, CompassCentre.y + CompassRadius), Theme.LineSoft, 1.0f);
            const double Direction = Wind->TravelBearingDegrees * 0.017453292519943295;
            const ImVec2 VectorEnd(CompassCentre.x + std::sin(Direction) * CompassRadius * 0.78f,
                                  CompassCentre.y - std::cos(Direction) * CompassRadius * 0.78f);
            Ink->AddLine(CompassCentre, VectorEnd, Accent, 2.5f);
            Ink->AddCircleFilled(VectorEnd, 4.0f, Accent);
            PresentText(CompassCentre.x - 4.0f, CompassCentre.y - CompassRadius - 14.0f, 8.0f, Theme.Faint, "N");
            char WindSpeed[32] = {};
            std::snprintf(WindSpeed, sizeof(WindSpeed), "%.1f m/s", Wind->BaseSpeedMps);
            PresentMetric(Left + Width * 0.69f, Y + 27.0f, "BASE FLOW", WindSpeed, "steady", Accent);
            Y += CompassRadius * 2.0f + 22.0f;
            PresentText(Left + 2.0f, Y, 10.0f, Theme.Muted, "Meteorological source bearing · direction wind comes FROM");
            Y += 17.0f;
            char SourceBearing[32] = {};
            std::snprintf(SourceBearing, sizeof(SourceBearing), "FROM %.0f°", Wind->QueryMeteorologicalSourceDegrees());
            PresentText(Left + 2.0f, Y, 12.0f, Accent, SourceBearing, Faces.Medium);
            Y += 22.0f;
            PresentSection(Y, "02 / FLOW", "Bearing and base speed");
            PositionControls(Y);
            (void)PresentCheckbox("Shared wind enabled", &Wind->WindFieldEnabled);
            (void)PresentScalar("Travel bearing", &Wind->TravelBearingDegrees, 0.0, 360.0, "%.0f°");
            (void)PresentScalar("Speed at sea level", &Wind->BaseSpeedMps, 0.0, 40.0, "%.1f m/s");
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "03 / VARIABILITY", "Two-sine gust and turbulence");
            PositionControls(Y);
            (void)PresentScalar("Gust strength", &Wind->GustStrength, 0.0, 1.0, "%.2f");
            (void)PresentScalar("Turbulence amplitude", &Wind->TurbulenceAmplitude, 0.0, 1.0, "%.2f");
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "04 / ALTITUDE & RECEIVERS", "Steady shear · directional veer");
            PositionControls(Y);
            (void)PresentScalar("Speed gain per km", &Wind->AltitudeShearPerKm, 0.0, 2.0, "%.2f×/km");
            (void)PresentScalar("Bearing veer per km", &Wind->AltitudeVeerDegreesPerKm, -60.0, 60.0, "%.1f°/km");
            Y = ImGui::GetCursorScreenPos().y + 4.0f;
            const ImVec2 PlotMin(Left + 2.0f, Y);
            const float PlotW = Width - 4.0f;
            const float PlotH = 62.0f;
            Ink->AddRectFilled(PlotMin, ImVec2(PlotMin.x + PlotW, PlotMin.y + PlotH), Theme.Surface2, 7.0f);
            for (int32_t Index = 0; Index < 6; ++Index)
            {
                const double Altitude = Index * 600.0;
                double Speed = 0.0, Bearing = 0.0;
                Wind->EvaluateAltitudeVector(Altitude, Speed, Bearing);
                const float X = PlotMin.x + 20.0f + float(Index) / 5.0f * (PlotW - 40.0f);
                const float CY = PlotMin.y + PlotH * 0.5f;
                const float Length = 8.0f + float(std::min(Speed, 30.0) / 30.0) * 16.0f;
                const double Angle = Bearing * 0.017453292519943295;
                const ImVec2 End(X + float(std::sin(Angle)) * Length, CY - float(std::cos(Angle)) * Length);
                Ink->AddLine(ImVec2(X, CY), End, Accent, 1.8f);
                Ink->AddCircleFilled(End, 2.1f, Accent);
            }
            Y += PlotH + 12.0f;
            PositionControls(Y);
            PresentCheckbox("Clouds follow shared wind", &Wind->CloudsFollowEnabled);
            PresentCheckbox("Local clouds follow shared wind", &Wind->LocalCloudFollowEnabled);
            PresentCheckbox("Local fog follows shared wind", &Wind->LocalFogFollowEnabled);
            PresentCheckbox("Precipitation follows shared wind", &Wind->PrecipitationFollowEnabled);
            (void)PresentScalar("Precipitation drift", &Wind->PrecipitationDrift, 0.0, 1.0, "%.2f");
            if (ImGui::Button("Reset reference flow · 7 m/s north-source")) Wind->ResetReferenceFlow();
            break;
        }
        case GlobalInspectorDomain::Atmosphere:
        {
            auto* Atmosphere = static_cast<AtmosphereRecord*>(Descriptor->PayloadAddress);
            Atmosphere->SynchronizeAtmosphereParameters(false);
            float Y = BodyTop;
            PresentSection(Y, "01 / OPTICAL WORKBENCH", "Overview · molecular and aerosol medium");
            const ImVec2 SkyMin(Left + 2.0f, Y);
            const float SkyW = Width - 4.0f;
            const float SkyH = 72.0f;
            Ink->AddRectFilled(SkyMin, ImVec2(SkyMin.x + SkyW, SkyMin.y + SkyH), Theme.Surface2, 8.0f);
            std::array<double, 32> SkyLuminance{};
            double MaximumSkyLuminance = 1.0e-9;
            for (int32_t Index = 0; Index < 32; ++Index)
            {
                const double Azimuth = (double(Index) / 31.0) * 6.283185307179586;
                const SpectrumRgb Radiance = Atmosphere->SampleSkyPanorama(
                    Azimuth, 0.10, ReferenceSunElevationDegrees, ReferenceSunAzimuthDegrees);
                SkyLuminance[static_cast<size_t>(Index)] =
                    std::max(0.0, Radiance.R * 0.2126 + Radiance.G * 0.7152 + Radiance.B * 0.0722);
                MaximumSkyLuminance = std::max(MaximumSkyLuminance, SkyLuminance[static_cast<size_t>(Index)]);
            }
            std::vector<ImVec2> SkyPoints;
            SkyPoints.reserve(SkyLuminance.size());
            for (size_t Index = 0; Index < SkyLuminance.size(); ++Index)
            {
                const double RelativeRadiance = SkyLuminance[Index] / MaximumSkyLuminance;
                const float NormalizedLuminance = float(std::log1p(8.0 * RelativeRadiance) / std::log1p(8.0));
                const float X = SkyMin.x + 8.0f + float(Index) / 31.0f * (SkyW - 16.0f);
                const float Z = SkyMin.y + SkyH - 10.0f - NormalizedLuminance * (SkyH - 20.0f);
                SkyPoints.emplace_back(X, Z);
            }
            Ink->AddPolyline(SkyPoints.data(), static_cast<int>(SkyPoints.size()), Accent, ImDrawFlags_None, 1.8f);
            PresentText(SkyMin.x + 8.0f, SkyMin.y + SkyH - 15.0f, 8.5f, Theme.Muted, "CPU ATMOSPHERE MODEL REFERENCE · NOT GPU LUT READBACK");
            Y += SkyH + 8.0f;
            PositionControls(Y);
            (void)PresentCheckbox("Atmosphere enabled", &Atmosphere->AtmosphereEnabled);
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "02 / MEDIUM", "Rayleigh molecules · Mie aerosols · ozone");
            PositionControls(Y);
            (void)PresentScalar("Rayleigh multiplier", &Atmosphere->RayleighMultiplier, 0.0, 3.0, "%.2f×");
            (void)PresentScalar("Mie multiplier", &Atmosphere->MieMultiplier, 0.0, 6.0, "%.2f×");
            (void)PresentScalar("Ozone multiplier", &Atmosphere->OzoneMultiplier, 0.0, 4.0, "%.2f×");
            (void)PresentScalar("Rayleigh scale height", &Atmosphere->RayleighScaleHeightMetres, 1000.0, 16000.0, "%.0f m");
            (void)PresentScalar("Mie scale height", &Atmosphere->MieScaleHeightMetres, 500.0, 8000.0, "%.0f m");
            (void)PresentScalar("Mie anisotropy g", &Atmosphere->MieAnisotropyG, -0.95, 0.95, "%.2f");
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "03 / LIGHT RESPONSE", "Solar transmittance · ground and twilight");
            const SpectrumRgb Transmission = Atmosphere->EvaluateSolarTransmittance(
                ReferenceSunElevationDegrees, ReferenceSunAzimuthDegrees);
            const float StripTop = Y + 3.0f;
            const ImU32 StripColours[] = {KitInkHex(0xff8a70), KitInkHex(0x9fe89a), KitInkHex(0x83b9ff)};
            const double StripValues[] = {Transmission.R, Transmission.G, Transmission.B};
            for (int32_t Index = 0; Index < 3; ++Index)
            {
                const float StripY = StripTop + Index * 7.0f;
                Ink->AddRectFilled(ImVec2(Left + 2.0f, StripY), ImVec2(Right - 2.0f, StripY + 4.0f), Theme.Surface2, 2.0f);
                Ink->AddRectFilled(ImVec2(Left + 2.0f, StripY),
                                   ImVec2(Left + 2.0f + (Width - 4.0f) * float(std::clamp(StripValues[Index], 0.0, 1.0)),
                                          StripY + 4.0f), StripColours[Index], 2.0f);
            }
            Y = StripTop + 28.0f;
            PositionControls(Y);
            (void)PresentCheckbox("Multiple scattering approximation", &Atmosphere->MultipleScatteringEnabled);
            (void)PresentCheckbox("Spherical air-mass integration", &Atmosphere->AirMassEnabled);
            (void)PresentCheckbox("Civil twilight line", &Atmosphere->CivilTwilightLineEnabled);
            (void)PresentScalar("Ground albedo", &Atmosphere->GroundAlbedoScalar, 0.0, 1.0, "%.2f");
            (void)PresentScalar("Horizon glow", &Atmosphere->HorizonGlow, 0.0, 3.0, "%.2f×");
            double Samples = Atmosphere->SkySampleBudget;
            if (PresentScalar("Sky sample budget", &Samples, 8.0, 64.0, "%.0f")) Atmosphere->SkySampleBudget = int32_t(std::round(Samples));
            Y = ImGui::GetCursorScreenPos().y + 5.0f;
            PresentSection(Y, "04 / BAKING", "Transmittance lookup table");
            PositionControls(Y);
            char LutStatus[64] = {};
            std::snprintf(LutStatus, sizeof(LutStatus), "%s · revision %u",
                          Atmosphere->OpticalDepthLut.Baked() ? "BAKED / 96 × 24" : "NOT BAKED", Atmosphere->LutRevision);
            PresentText(Left + 2.0f, Y, 10.0f, Accent, LutStatus, Faces.Medium);
            ImGui::SameLine();
            if (ImGui::Button("Bake transmittance LUT")) Atmosphere->SynchronizeAtmosphereParameters(true);
            break;
        }
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