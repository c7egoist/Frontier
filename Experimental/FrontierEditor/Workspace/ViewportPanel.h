/*==========================================================================================================================================
                                                              VIEWPORTPANEL.H
==========================================================================================================================================*/
// 🧩 Blank scene canvas: the docking home of the future renderer, today a labelled surface + simulation readout.

#pragma once

#include <cstddef>
#include <functional>
#include <string>

namespace Frontier
{

class InputMap;

//----------------------------------------------------------------------------------------------------------------------
//                                                       VIEWPORT PANEL
//----------------------------------------------------------------------------------------------------------------------

// 📝 Deliberately blank per the UI-first scope: no renderer is connected in this step (the eos lineage
//    owns rendering). The panel still earns its place — it is the pointer-capture target for the
//    Simulation input context and renders the live driving axes so Editor ⇄ Simulation input routing is
//    verifiable on screen before any scene drawing exists.
class ViewportPanel
{
  public:
    void ConstructInterface();

    // Host wiring, refreshed by WorkspaceHost::Synchronize every cycle.
    const InputMap*     Map                = nullptr;
    size_t              RecordCount        = 0;      // [records]
    std::string         SelectedName;                // [text] - Empty when nothing is selected
    bool                SimulationCaptured = false;  // [-]
    std::function<void()> RequestCaptureToggle;      // Click on the canvas (capture ⇄ release is host policy)

  private:
    void ConstructSimulationStrip(float Width);
};

} // namespace Frontier
