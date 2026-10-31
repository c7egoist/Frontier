/*==========================================================================================================================================
                                      GLOBAL INSPECTOR PRESENTATION CONTEXT
==========================================================================================================================================*/
// 🧩 Shared shell services passed to independent, source-faithful Engine Inspector panels.

#pragma once

#if defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/StackRailControls.h"
#include "Engine/Scene/RecordInspectorRegistry.h"
#include "Engine/Scene/RecordToken.h"

#include <imgui_internal.h>

#include <algorithm>
#include <functional>
#include <string>

namespace Frontier
{

class SceneDirectoryPanel;

// Inspector cards are child windows without their own scrollbars. Forward wheel input from the hovered card to the
// scrollable domain tab so controls beneath the visible fold remain reachable.
inline void ForwardGlobalInspectorCardWheelToParent()
{
    ImGuiWindow* Card = ImGui::GetCurrentWindow();
    ImGuiWindow* Parent = Card->ParentWindow;
    const ImGuiIO& IO = ImGui::GetIO();
    if (Parent == nullptr || IO.MouseWheel == 0.0f || !Card->Rect().Contains(IO.MousePos))
        return;
    const float Step = ImGui::GetTextLineHeightWithSpacing() * 5.0f;
    Parent->ScrollTarget.y = std::clamp(Parent->Scroll.y - IO.MouseWheel * Step, 0.0f, Parent->ScrollMax.y);
}

// This is the narrow bridge from the docked Inspector shell to a domain-specific panel. Keep domain layout and behavior
// in the individual panel implementation; this object only carries shared selection, theme, geometry and primitives.
struct GlobalInspectorPresentationContext
{
    RecordToken Selected;
    RecordInspectorDescriptor* Descriptor = nullptr;
    SceneDirectoryPanel* DirectoryPanel = nullptr;
    ImDrawList* Ink = nullptr;
    KitTheme Theme{};
    KitFaces Faces{};
    float Left = 0.0f;
    float Right = 0.0f;
    float Width = 0.0f;
    float BodyTop = 0.0f;
    ImU32 Accent = 0;
    double ReferenceSunElevationDegrees = 38.0;
    double ReferenceSunAzimuthDegrees = 145.0;

    std::function<void(float&, const char*, const char*)> PresentSection;
    std::function<void(float, float, const char*, const char*, const char*, ImU32)> PresentMetric;
    std::function<void(float, float, float, ImU32, const char*, ImFont*)> PresentTextPrimitive;
    std::function<bool(const char*, double*, double, double, const char*)> PresentScalar;
    std::function<void(float)> PositionControls;
    std::function<bool(const char*, bool*)> PresentCheckbox;
    std::function<bool(const char*, const char*, bool, const char*)> PresentPill;
    std::function<void(RecordToken, std::string)> QueueSubfolder;

    void PresentText(float X, float Y, float FontSize, ImU32 Colour, const char* Text, ImFont* Font = nullptr) const
    {
        PresentTextPrimitive(X, Y, FontSize, Colour, Text, Font);
    }
};

void DrawFolderInspectorPanel(GlobalInspectorPresentationContext& Context);
void DrawSolarInspectorPanel(GlobalInspectorPresentationContext& Context);
void DrawLensFlareInspectorPanel(GlobalInspectorPresentationContext& Context);
void DrawCloudInspectorPanel(GlobalInspectorPresentationContext& Context);
void DrawWindInspectorPanel(GlobalInspectorPresentationContext& Context);
void DrawAtmosphereInspectorPanel(GlobalInspectorPresentationContext& Context);

} // namespace Frontier

#endif // FRONTIER_WITH_INTERFACE_SDK
