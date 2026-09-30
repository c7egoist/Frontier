//============================================================================================================================================
//                                                       FRONTIERRUNTIME.H
//============================================================================================================================================
// 📦 Shared window, device, renderer, editor, camera, input, and celestial execution reached by FrontierHost.

#pragma once

namespace Frontier
{

class CodeInterchange;
struct ProjectSpecification;

/// 📦 Runs the sole windowed Frontier experience after the project opening and code image have been verified.
/// in    ArgumentCount          [-]  command-line reading supplied to Frontier.exe
/// in    ArgumentVector         [-]  command-line text supplied to Frontier.exe
/// in    ResolvedSpecification  [-]  validated opening scene and content readings
/// in    ActiveInterchange      [-]  optional project simulation callbacks
/// out   ExitNumber             [-]  process completion reading
int RunFrontierRuntime(
    int ArgumentCount,
    char** ArgumentVector,
    const ProjectSpecification& ResolvedSpecification,
    CodeInterchange& ActiveInterchange);

} // namespace Frontier
