/*============================================================================================================================================
                                                          MATERIALINSPECTORPANE.H
============================================================================================================================================*/
// 🧩 Right docked Material Inspector pane matching MaterialWorkspace UI (KPI trio, Properties & Layer Stack tabs, 29 PBR channels)

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/MaterialWorkspaceSession.h"

#include <cstdint>
#include <functional>

namespace Frontier::Workspaces
{

enum class MaterialSwatchTarget : uint8_t
{
    None               = 0,
    InspectedChannel   = 1,
    PrimaryAlbedo      = 2,
    GradientStopA      = 3,
    GradientStopB      = 4,
    FlakeSecondaryTint = 5,
};

class MaterialInspectorPane
{
public:
    ~MaterialInspectorPane() noexcept;

    void AttachSession(MaterialWorkspaceSession* TargetSession) noexcept;
    void SetExportOrPaintCallback(std::function<void(std::string_view CommandTag)> Callback) noexcept
    {
        OperationCallback = std::move(Callback);
    }

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor = 1.0f);

public:
    float ScrollOffsetY = 0.0f;

private:
    enum class OpenDropdownVariant : uint8_t
    {
        None = 0,
        AddChannel,
        InspectedChannel,
        ChannelSource,
        FieldProcedure,
        PatternPreset,
        PreviewGeometry,
    };

    void CloseAllSheets() noexcept;

    MaterialWorkspaceSession*                         Session           = nullptr;
    std::function<void(std::string_view CommandTag)> OperationCallback {};

    // Expandable section toggles
    bool LayerInspectorExpanded  = true;
    bool SurfaceSectionExpanded  = true;
    bool FinishSectionExpanded   = true;
    bool PatternSectionExpanded  = false;
    bool LightingSectionExpanded = false;
    bool ExportSectionExpanded   = true;

    // Active drag & sheet scroll tracking
    float                CachedContentHeight     = 900.0f;
    float                DropdownScrollY         = 0.0f;
    int32_t              ActiveSliderId          = -1;
    uint32_t             DraggingLayerIdentity   = 0u;
    float                DragStartCursorY        = 0.0f;
    bool                 DraggingLayerActive     = false;

    // Dropdown & colour swatch sheet anchoring
    OpenDropdownVariant     ActiveDropdown          = OpenDropdownVariant::None;
    Rectangle2D          ActiveDropdownAnchor    {};
    MaterialSwatchTarget ActiveSwatchTarget      = MaterialSwatchTarget::None;
    Rectangle2D          ActiveSwatchAnchor      {};
};

} // namespace Frontier::Workspaces
