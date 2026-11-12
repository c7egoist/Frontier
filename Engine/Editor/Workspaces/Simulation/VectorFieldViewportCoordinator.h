/*============================================================================================================================================
                                                   VECTORFIELDVIEWPORTCOORDINATOR.H
============================================================================================================================================*/
// 🧩 Editor coordinator binding ForceFieldAccumulator, FieldLatticeVulkanExecutor, VectorFieldOverlaySequence & 3-dock UI panes

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Panes/InspectorPanel.h"
#include "Engine/Components/Panes/OutlinerPanel.h"
#include "Engine/Components/Panes/ViewportPanel.h"
#include "Engine/Editor/Workspaces/Simulation/VectorFieldOverlaySequence.h"
#include "Engine/SimulationSpace/ForceFields/FieldLatticeCascade.h"
#include "Engine/SimulationSpace/ForceFields/FieldLatticeVulkanExecutor.h"
#include "Engine/SimulationSpace/ForceFields/ForceFieldAccumulator.h"

#include <array>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace Frontier::Editor::Simulation
{

//------------------------------------------------------------------------------------------------------------------------
//                                             VECTORFIELDVIEWPORTCOORDINATOR
//------------------------------------------------------------------------------------------------------------------------

class VectorFieldViewportCoordinator
{
public:
    VectorFieldViewportCoordinator() noexcept = default;
    ~VectorFieldViewportCoordinator() noexcept = default;

    [[nodiscard]] bool InitializeAndAttach(
        OutlinerPanel&               Outliner,
        ViewportPanel&               Viewport,
        InspectorPanel&              Inspector,
        const std::filesystem::path& ShaderBinaryDirectory,
        const std::filesystem::path& SwiftShaderIcdDir,
        std::string&                 OutDiagnostic) noexcept;

    void StepSimulation(double ΔtSeconds) noexcept;

    [[nodiscard]] OutlinerSlotToken AddForceSourceEntry(
        SimulationSpace::ForceFields::ForceSourceRecordEntry Descriptor,
        OutlinerSlotToken                                    EnclosingFolder = {});

    [[nodiscard]] SimulationSpace::ForceFields::ForceFieldAccumulator&       AccessAccumulator() noexcept;
    [[nodiscard]] const SimulationSpace::ForceFields::ForceFieldAccumulator& QueryAccumulator() const noexcept;
    [[nodiscard]] SimulationSpace::ForceFields::FieldLatticeCascade&         AccessLatticeCascade() noexcept;
    [[nodiscard]] SimulationSpace::ForceFields::FieldLatticeVulkanExecutor&  AccessVulkanExecutor() noexcept;
    [[nodiscard]] VectorFieldOverlaySequence&                                AccessOverlaySequence() noexcept;
    [[nodiscard]] OverlayCameraState&                                        AccessCamera(uint32_t PaneIndex) noexcept;

    [[nodiscard]] int32_t QuerySelectedWaypointIndex() const noexcept;
    void                  ConfigureSelectedWaypointIndex(int32_t WaypointIdx) noexcept;
    [[nodiscard]] uint32_t QueryMappedForceToken(OutlinerSlotToken OutlinerToken) const noexcept;
    [[nodiscard]] double   QuerySimulationTimeSeconds() const noexcept;

private:
    void  SynchronizeOutlinerAndAccumulator();
    float RenderForceInspectorExtension(
        PixelSpace&             Surface,
        Rectangle2D             ScrollViewport,
        float                   LeftX,
        float                   TopY,
        float                   InnerWidth,
        OutlinerRecordEntry&    Entry,
        const PaneInputReading& Input);
    ViewportRasterSurface HandleViewportRaster(const ViewportPaneSurfaceSpecification& Spec);
    void                  HandleViewportInteraction(uint32_t PaneIndex, Rectangle2D PaneBounds, const PaneInputReading& Input);

    OutlinerPanel*  BoundOutliner  = nullptr;
    ViewportPanel*  BoundViewport  = nullptr;
    InspectorPanel* BoundInspector = nullptr;

    SimulationSpace::ForceFields::ForceFieldAccumulator      Accumulator    {};
    SimulationSpace::ForceFields::FieldLatticeCascade        LatticeCascade {};
    SimulationSpace::ForceFields::FieldLatticeVulkanExecutor VulkanExecutor {};
    VectorFieldOverlaySequence                               OverlaySequence{};

    std::vector<SimulationSpace::ForceFields::ForceSourceRecordEntry> AuthoredSources{};
    uint32_t                                                          NextForceToken = 1u;

    std::array<OverlayCameraState, 2> Cameras            {};
    std::array<float, 32>             AnemometerHistoryMs{};
    uint32_t                          AnemometerCursor    = 0u;
    int32_t                           SelectedWaypointIdx = -1;
    double                            SimulationTimeSec   = 0.0;

    bool     OrbitDragging   = false;
    Point2D  LastDragCursor  {};
    uint32_t DragPaneIndex   = 0u;
};

} // namespace Frontier::Editor::Simulation
