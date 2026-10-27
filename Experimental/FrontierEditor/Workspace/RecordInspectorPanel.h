/*==========================================================================================================================================
                                                           RECORDINSPECTORPANEL.H
==========================================================================================================================================*/
// 🧩 Inspector for the Outliner selection: identity, nesting and visibility of one scene record, read/write.

#pragma once

#include "Engine/Scene/RecordToken.h"

#include <array>
#include <functional>

namespace Frontier
{

class SceneDirectoryPanel;

//----------------------------------------------------------------------------------------------------------------------
//                                                    RECORD INSPECTOR PANEL
//----------------------------------------------------------------------------------------------------------------------

// 📝 The third member of the VehicleHMI editor triad (Outliner · Viewport · Inspector). Reads the
//    SceneDirectoryPanel's SceneInspectorSummary each frame and writes back through the SceneDirectory
//    (rename, visibility), so the Outliner and Inspector can never disagree about a record. Navigation
//    (up-link/down-link clicks) routes through SelectRecord back into the Outliner's selection.
class RecordInspectorPanel
{
  public:
    explicit RecordInspectorPanel(const SceneDirectoryPanel& Outliner) : OutlinerPanel(Outliner) {}

    void ConstructInterface();

    std::function<void(RecordToken)> SelectRecord;   // Host wiring: OutlinerPanel.Select

  private:
    const SceneDirectoryPanel& OutlinerPanel;
    std::array<char, 128>      RenameBuffer{};
    RecordToken                RenameToken{};        // [-] - Selection the buffer currently mirrors
};

} // namespace Frontier
