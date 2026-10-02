//============================================================================================================================================
//                                                       TYREINSPECTORPANEL.H
//============================================================================================================================================
// 📦 The tyre's editor surface: the quick strip that lands in the shared Inspector, and Tyre Generator, the separate
//    dockable asset window that owns the tread layer sequence.

#pragma once

#include "../ContentInterchange/Tyre/TreadSpecification.h"
#include "../ContentInterchange/Tyre/TreadPatternSpecification.h"

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

/// 📦 Draws the whole tyre generator as its own ImGui window: the carcass, the layer sequence, a viewport that
///    shows the tyre the specification describes, and the picked layer's parameters.
/// in    Controls       [-]   the shared widget vocabulary
/// in    Specification  [-]   the carcass the preview is lathed from
/// in    Pattern        [-]   the layer sequence the preview cuts into it
/// in    Sheet          [-]   group 0 is the sequence, group 1 the picked layer
/// in    Open           [-]   the window's open flag; the title bar's close button clears it
/// note  ⚠️ Call this OUTSIDE the inspector's Begin/End pair — it opens a top-level window, which is the point.
/// note  The preview is drawn from the SAME DeriveTreadValues and EvaluateTyreProfile the mesh solver uses, so
///       the picture and the geometry cannot disagree about the shape; only about tessellation.
/// tag   api
void RecordTyreGeneratorWindow(ControlPanel& Controls, const TreadSpecification& Specification,
                               const TreadPatternSpecification& Pattern, EditorSheet& Sheet, bool* Open);

}   // namespace Frontier
