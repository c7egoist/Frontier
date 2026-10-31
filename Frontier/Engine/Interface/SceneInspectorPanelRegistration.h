/*==========================================================================================================================================
                                               SCENE INSPECTOR PANEL REGISTRATION
                                     ------------------------------------------------------------------
                 Bridges SceneInspectorPanel into PanelDockspace as the reusable "Inspector" dockable panel.
==========================================================================================================================================*/
// 🧩 DockPanelSpecification factory for the global Engine SceneInspectorPanel.

#pragma once

#include "Engine/Interface/PanelDockspace.h"
#include "Engine/Interface/SceneInspectorPanel.h"

namespace Frontier
{

[[nodiscard]] DockPanelSpecification MakeSceneInspectorPanelSpecification(SceneInspectorPanel& Panel);

} // namespace Frontier
