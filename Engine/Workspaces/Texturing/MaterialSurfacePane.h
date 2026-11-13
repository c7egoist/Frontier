/*============================================================================================================================================
                                                           MATERIALSURFACEPANE.H
============================================================================================================================================*/
// 🧩 Central Material Studio UI pane (hero collection header, Fullscreen capsule, zoom HUD & geometry/backdrop dropdowns — zero 3D viewport)

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/MaterialWorkspaceSession.h"

namespace Frontier::Workspaces
{

class MaterialSurfacePane
{
public:
    ~MaterialSurfacePane() noexcept;

    void AttachSession(MaterialWorkspaceSession* TargetSession) noexcept;

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor = 1.0f);

private:
    MaterialWorkspaceSession* Session             = nullptr;
    bool                      ShapeDropdownOpen   = false;
    bool                      BackdropDropdownOpen = false;
};

} // namespace Frontier::Workspaces
