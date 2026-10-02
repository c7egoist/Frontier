//============================================================================================================================================
//                                                       TYREINSPECTORPANEL.H
//============================================================================================================================================
// 📦 The tyre's editor surface: the quick strip that lands in the shared Inspector, and Tyre Forge, the separate
//    dockable asset window that owns the tread layer sequence.

#pragma once

namespace Frontier {

class ControlPanel;
struct EditorInstance;
struct EditorSheet;

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE QUICK STRIP
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Draws the picked tyre row's sheet into the shared Inspector, as one card per group.
/// in    Controls  [-]   the shared widget vocabulary; every figure is edited through it
/// in    Picked    [-]   the outliner row, for its label and tint
/// in    Sheet     [-]   the project-filled property sheet; the panel draws what it is given
/// note  The signature matches RecordCameraInspector exactly, so the dispatch in InspectorPanel is one more
///       Appearance arm rather than a special case.
/// tag   api
void RecordTyreInspector(ControlPanel& Controls, EditorInstance& Picked, EditorSheet& Sheet);

//------------------------------------------------------------------------------------------------------------------------
//                                                      TYRE FORGE
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Draws Tyre Forge as its own ImGui window, which the host's dock space makes dockable and tear-off.
/// in    Controls  [-]   the shared widget vocabulary
/// in    Sheet     [-]   the tread-pattern sheet: group 0 is the sequence, group 1 the picked layer
/// in    Open      [-]   the window's open flag; the title bar's close button clears it
/// note  ⚠️ Call this OUTSIDE the inspector's Begin/End pair. It opens a top-level window of its own, which is
///       the whole point — the brief asked for a separate asset editor beside the always-present strip.
/// tag   api
void RecordTyreForgeWindow(ControlPanel& Controls, EditorSheet& Sheet, bool* Open);

}   // namespace Frontier
