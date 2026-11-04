/*==========================================================================================================================================
                                                         PARTICLEEDITOR.H
==========================================================================================================================================*/
// 🧩 The Particle editor window opened from a Particles record's inspector: the approved prototype's editor in C++ (Outliner,
//    viewport on the GPU particle engine, Log Stream, Inspector, preset library).

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"
#include "Engine/Scene/RecordToken.h"

namespace Frontier
{

#if FRONTIER_EDITOR

class RecordInspector;
class ParticleEditorWorkspace;

class ParticleEditor
{
  public:
    static void ConstructInterface(RecordToken Token, RecordInspector& Inspector);

    // 📝 The editor behind the window (created when it first opens); captures drive it through its verbs.
    [[nodiscard]] static ParticleEditorWorkspace* AccessWorkspace();
};

#endif // FRONTIER_EDITOR

} // namespace Frontier
