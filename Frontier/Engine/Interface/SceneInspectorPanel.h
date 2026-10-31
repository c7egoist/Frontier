/*==========================================================================================================================================
                                                        SCENE INSPECTOR PANEL
                                     ------------------------------------------------------------------
                 Global Engine Inspector panel: renders VehicleHMI-ported Observatory, Optical-Workbench,
                      Wind-Instrument, and Folder-Telemetry UIs for the selected Outliner record.
==========================================================================================================================================*/
// 🧩 Reusable Engine Inspector panel observing SceneDirectoryPanel selection and RecordInspectorRegistry descriptors.

#pragma once

#include "Engine/Scene/RecordToken.h"

#include <cstdint>
#include <functional>
#include <optional>
#include <string>

namespace Frontier
{

class SceneDirectoryPanel;

//------------------------------------------------------------------------------------------------------------------------
//                                                  SCENE INSPECTOR PANEL
//------------------------------------------------------------------------------------------------------------------------

class SceneInspectorPanel
{
  public:
    SceneInspectorPanel() = default;

    void BindDirectoryPanel(SceneDirectoryPanel* DirectoryPanel) noexcept { BoundDirectoryPanel = DirectoryPanel; }

    // Subfolder creation request emitted from the Folder Inspector; serviced by the owning workspace/host.
    struct SubfolderRequest
    {
        RecordToken EnclosingFolderToken;
        std::string Title;
    };

    [[nodiscard]] std::optional<SubfolderRequest> TakeSubfolderRequest();

    // Optional reference sun angles used by the Atmosphere workbench when inspecting transmittance/sky preview.
    void ConfigureReferenceSunAngles(double ElevationDegrees, double AzimuthDegrees) noexcept
    {
        ReferenceSunElevationDegrees = ElevationDegrees;
        ReferenceSunAzimuthDegrees   = AzimuthDegrees;
    }

    // Native drawing (interface-SDK builds; compiles to a clean no-op stub without FRONTIER_WITH_INTERFACE_SDK).
    void ConstructInterface();

  private:
    SceneDirectoryPanel*            BoundDirectoryPanel          = nullptr;
    std::optional<SubfolderRequest> PendingSubfolderRequest;
    double                          ReferenceSunElevationDegrees = 38.0;
    double                          ReferenceSunAzimuthDegrees   = 145.0;
};

} // namespace Frontier
