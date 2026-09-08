//============================================================================================================================================
//                                                      RENDERERPANEL.CPP
//============================================================================================================================================
// 🧩 Immediate-mode ImGui control centre overlay — presents ReSTIR parameters, camera telemetry and scene diagnostics.

#include "RenderScheduler.h"

#define GLFW_INCLUDE_NONE
#include <GLFW/glfw3.h>

#include <imgui.h>
#include <imgui_impl_glfw.h>
#include <imgui_impl_vulkan.h>

#include <algorithm>
#include <cmath>

namespace Frontier {

//============================================================================================================================================
//                                                      APPLY THEME
//============================================================================================================================================

void RenderScheduler::ApplyTheme() noexcept
{
    ImGui::StyleColorsDark();

    ImGuiStyle& Style           = ImGui::GetStyle();
    Style.WindowRounding        = 8.0f;
    Style.FrameRounding         = 5.0f;
    Style.GrabRounding          = 5.0f;
    Style.TabRounding           = 4.0f;
    Style.WindowBorderSize      = 0.0f;
    Style.FrameBorderSize       = 0.0f;
    Style.WindowPadding         = ImVec2(14.0f, 14.0f);
    Style.ItemSpacing           = ImVec2(8.0f, 6.0f);

    ImVec4* Colours = Style.Colors;
    Colours[ImGuiCol_WindowBg]        = ImVec4(0.08f, 0.09f, 0.10f, 0.93f);
    Colours[ImGuiCol_TitleBg]         = ImVec4(0.05f, 0.06f, 0.07f, 1.00f);
    Colours[ImGuiCol_TitleBgActive]   = ImVec4(0.09f, 0.27f, 0.48f, 1.00f);
    Colours[ImGuiCol_Header]          = ImVec4(0.09f, 0.24f, 0.43f, 0.85f);
    Colours[ImGuiCol_HeaderHovered]   = ImVec4(0.13f, 0.33f, 0.55f, 1.00f);
    Colours[ImGuiCol_SliderGrab]      = ImVec4(0.18f, 0.52f, 0.82f, 1.00f);
    Colours[ImGuiCol_SliderGrabActive]= ImVec4(0.24f, 0.62f, 0.95f, 1.00f);
    Colours[ImGuiCol_Button]          = ImVec4(0.09f, 0.27f, 0.48f, 0.80f);
    Colours[ImGuiCol_ButtonHovered]   = ImVec4(0.14f, 0.36f, 0.62f, 1.00f);
    Colours[ImGuiCol_ButtonActive]    = ImVec4(0.20f, 0.46f, 0.78f, 1.00f);
    Colours[ImGuiCol_FrameBg]         = ImVec4(0.13f, 0.14f, 0.16f, 1.00f);
    Colours[ImGuiCol_FrameBgHovered]  = ImVec4(0.18f, 0.19f, 0.22f, 1.00f);
    Colours[ImGuiCol_Separator]       = ImVec4(0.22f, 0.24f, 0.28f, 1.00f);
    Colours[ImGuiCol_Tab]             = ImVec4(0.08f, 0.20f, 0.36f, 0.86f);
    Colours[ImGuiCol_TabHovered]      = ImVec4(0.14f, 0.36f, 0.62f, 1.00f);
    Colours[ImGuiCol_TabActive]       = ImVec4(0.18f, 0.44f, 0.74f, 1.00f);
}

//============================================================================================================================================
//                                                         PRESENT
//============================================================================================================================================

void RenderScheduler::Present(
    ReSTIRIntegrator&                    Integrator,
    const ProjectZero::FlyThroughSolver& Camera,
    const ProjectZero::RayTracingSolver& Scene,
    uint32_t                             ViewportWidth,
    uint32_t                             ViewportHeight,
    const OverlayHook&                   Overlay) noexcept
{
    ImGui_ImplVulkan_NewFrame();
    ImGui_ImplGlfw_NewFrame();
    ImGui::NewFrame();

    // 🔴 A dock space, so the trapezoidal tabs have somewhere to be. Patches/PatchA and PatchB give ImGui the
    //    geometry, and SwapchainExchange seats the four style variables that switch it on — but a tab is drawn
    //    by a dock node's tab bar, and until there was a dock space there was no node, so nothing in Slate had
    //    ever drawn a tab at all. Three patches applied on every build, reported as applied, and no tab on
    //    screen to carry them.
    //
    //    ⚠️ PassthruCentralNode is what keeps the rendered scene visible. Without it the central node paints its
    //    own background over the whole viewport and the 3D image disappears behind a flat grey — a dock space is
    //    a full-screen window, and by default it is opaque.
    //
    //    NoDockingOverCentralNode as well: a panel dropped into the middle would cover the render entirely, and
    //    the one thing a viewport must never lose is the view. Panels dock to the edges, as the sheet has them.
#ifdef IMGUI_HAS_DOCK
    ImGui::DockSpaceOverViewport(0u, ImGui::GetMainViewport(),
                                 ImGuiDockNodeFlags_PassthruCentralNode
                               | ImGuiDockNodeFlags_NoDockingOverCentralNode);
#endif

    // ⚠️ The scene / render inspector that used to live here is gone: it is now InterfaceBrowserSequence, drawn
    //    on the engine's own overlay surface rather than through ImGui. This still owns the ImGui frame because
    //    the Control Centre overlay records itself between NewFrame and Render through the hook below, and the
    //    F3 diagnostic popup is still an ImGui window.
    //
    //    SectionCamera / SectionReSTIR / SectionScene are retained but unreferenced by design: they are the
    //    fallback if the browser has to be disabled, and deleting them would make that a rewrite rather than a
    //    one-line change.
    (void)Integrator; (void)Camera; (void)Scene; (void)ViewportWidth; (void)ViewportHeight;

    if (Overlay) Overlay();

    ImGui::Render();
}

//============================================================================================================================================
//                                                    SECTION — CAMERA
//============================================================================================================================================

void RenderScheduler::SectionCamera(const ProjectZero::FlyThroughSolver& Camera) noexcept
{
    if (!ImGui::CollapsingHeader("Camera", ImGuiTreeNodeFlags_DefaultOpen)) return;

    const Vector3& Position = Camera.QuerySpatialLocation();
    ImGui::Text("Position");
    ImGui::Text("  X  %+.3f m     Y  %+.3f m     Z  %+.3f m",
                Position.x, Position.y, Position.z);

    ImGui::Spacing();

    const float PitchDeg = Camera.QueryPitchRadians() * 57.295779513f;
    const float YawDeg   = Camera.QueryYawRadians()   * 57.295779513f;
    ImGui::Text("Pitch  %+.1f °     Yaw  %+.1f °", PitchDeg, YawDeg);

    ImGui::Spacing();

    ImGui::Text("Speed  %.2f m/s     FoV  %.1f °",
                Camera.QueryFlightSpeed(),
                Camera.QueryFieldOfViewRadians() * 57.295779513f);

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    ImGui::TextDisabled("W / A / S / D          fly  forward / strafe");
    ImGui::TextDisabled("Q / E                  descend / ascend");
    ImGui::TextDisabled("RMB + drag             look around");
    ImGui::TextDisabled("Scroll                 adjust speed");
    ImGui::TextDisabled("Left Shift             3 × speed boost");
    ImGui::TextDisabled("Escape                 quit");
}

//============================================================================================================================================
//                                                  SECTION — RESTIR
//============================================================================================================================================

void RenderScheduler::SectionReSTIR(
    ReSTIRIntegrator& Integrator,
    uint32_t          ViewportWidth,
    uint32_t          ViewportHeight) noexcept
{
    if (!ImGui::CollapsingHeader("ReSTIR DI + GI", ImGuiTreeNodeFlags_DefaultOpen)) return;

    const ReSTIRIntegratorConfiguration& Config = Integrator.QueryConfiguration();

    int Candidates = static_cast<int>(Config.CandidatesPerPixel);
    int Extra      = static_cast<int>(Config.ExtraCandidateCount);
    float Exposure = Config.Exposure;

    if (ImGui::SliderInt("Candidates / px", &Candidates, 1, 32))
        Integrator.AssignCandidatesPerPixel(static_cast<uint32_t>(std::clamp(Candidates, 1, 32)));

    if (ImGui::SliderInt("Extra candidates", &Extra, 0, 8))   // R6 row 3: renamed (was "Spatial passes" — these never left the pixel)
        Integrator.AssignExtraCandidateCount(static_cast<uint32_t>(std::clamp(Extra, 0, 8)));

    if (ImGui::SliderFloat("Exposure", &Exposure, 0.1f, 4.0f, "%.2f"))
        Integrator.AssignExposure(Exposure);

    bool Temporal = Config.TemporalReuse;   // R6: off-switches for the A/B proofs (converged image must match)
    bool Spatial  = Config.SpatialReuse;
    bool Alias    = Config.AliasPick;       // R6 row 3: off = uniform pick (R0 identity); F5 in the F3 popup flips the same flag
    if (ImGui::Checkbox("Temporal reuse", &Temporal))
        Integrator.AssignTemporalReuse(Temporal);
    if (ImGui::Checkbox("Spatial reuse", &Spatial))
        Integrator.AssignSpatialReuse(Spatial);
    if (ImGui::Checkbox("Alias pick", &Alias))
        Integrator.AssignAliasPick(Alias);

    ImGui::Spacing();
    ImGui::Text("Frame      %u", Integrator.QueryAccumulationIndex());
    ImGui::Text("Viewport   %u × %u px", ViewportWidth, ViewportHeight);
}

//============================================================================================================================================
//                                                   SECTION — SCENE
//============================================================================================================================================

void RenderScheduler::SectionScene(const ProjectZero::RayTracingSolver& Scene) noexcept
{
    if (!ImGui::CollapsingHeader("Scene", ImGuiTreeNodeFlags_DefaultOpen)) return;

    ImGui::Text("Cornell Box");
    ImGui::Text("Triangles   %zu", Scene.QueryTriangles().size());
    ImGui::Text("Materials   %zu", Scene.QueryMaterials().size());

    ImGui::Spacing();
    ImGui::TextColored(ImVec4(0.85f, 0.12f, 0.12f, 1.0f), "LEFT     Red wall");
    ImGui::TextColored(ImVec4(0.12f, 0.85f, 0.15f, 1.0f), "RIGHT    Green wall");
    ImGui::TextColored(ImVec4(1.00f, 0.95f, 0.80f, 1.0f), "CEILING  Area luminaire  32 lux");
    ImGui::TextColored(ImVec4(0.78f, 0.78f, 0.78f, 1.0f), "BOX A    Tall diffuse box");
    ImGui::TextColored(ImVec4(0.78f, 0.78f, 0.78f, 1.0f), "BOX B    Short diffuse box");
}

} // namespace Frontier
