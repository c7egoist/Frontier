/*==========================================================================================================================================
                                               SCENE INSPECTOR PANEL REGISTRATION
                                     ------------------------------------------------------------------
                 Bridges SceneInspectorPanel into PanelDockspace as the reusable "Inspector" dockable panel.
==========================================================================================================================================*/
// 🧩 DockPanelSpecification factory for the global Engine SceneInspectorPanel.

#include "Engine/Interface/SceneInspectorPanelRegistration.h"

namespace Frontier
{

DockPanelSpecification MakeSceneInspectorPanelSpecification(SceneInspectorPanel& Panel)
{
    DockPanelSpecification Specification;
    Specification.Key              = "Inspector";
    Specification.Caption          = "Inspector";
    Specification.ConstructContent = [&Panel]() { Panel.ConstructInterface(); };
    Specification.Open             = false;
    return Specification;
}

} // namespace Frontier