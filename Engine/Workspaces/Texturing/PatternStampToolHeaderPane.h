/*==========================================================================================================================================
                                                       PATTERNSTAMPTOOLHEADERPANE.H
==========================================================================================================================================*/
// 🛠️ Central Pattern Studio / Stamp Studio UI chrome pane: editable document title, resolution combo, circular tool dock, More tools overlay sheet,
//    View/Undo/Redo/Save/Export/Bridge actions, ruler border chrome, and zoom controls (ZERO 2D/PBR shader rendering).

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Controls/TextInputField.h"
#include "Engine/Workspaces/Texturing/PatternStampStackSession.h"
#include "Engine/Workspaces/Texturing/TexturingPaneAppearance.h"

#include <functional>
#include <string_view>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                  CLASS DECLARATION
//------------------------------------------------------------------------------------------------------------------------

class PatternStampToolHeaderPane
{
public:
    ~PatternStampToolHeaderPane() noexcept;

    void AttachSession(PatternStampWorkspaceSession* TargetSession) noexcept;
    void SetBridgeCallback(std::function<void(std::string_view CommandTag)> Callback) noexcept
    {
        BridgeCallback = std::move(Callback);
    }

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor = 1.0f);

public:
    bool MoreToolsSheetOpen  = false;
    bool ResolutionSheetOpen = false;
    bool ViewSheetOpen       = false;
    bool SaveSheetOpen       = false;
    bool SnapSheetOpen       = false;

private:
    void CloseAllSheets() noexcept;

    PatternStampWorkspaceSession*                          Session          = nullptr;
    std::function<void(std::string_view CommandTag)>  BridgeCallback   {};
    TextEditBuffer                                    NameEditBuffer   {};
    float                                             ViewSheetScrollY = 0.0f;
};

} // namespace Frontier::Workspaces
