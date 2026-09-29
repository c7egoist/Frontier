//============================================================================================================================================
// 📦 Exhibits/Workbench/Drive/PngWriteCounterpart.h — forwarder to the engine PNG writer
//============================================================================================================================================
//
// 📝 The PNG writer belongs to the engine (Engine/ContentInterchange/PngWriteCounterpart.h); the app's material-preview
//    TU writes its PNG with it too. This keeps the workbench harness's `-I Exhibits/Workbench/Drive` build resolving
//    `#include "PngWriteCounterpart.h"` unchanged, exactly as Exhibits/Workbench/Editor does.

#pragma once
#include "../../../Engine/ContentInterchange/PngWriteCounterpart.h"
