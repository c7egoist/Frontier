/*==========================================================================================================================================
                                                     TEXTUREPAINTINSPECTORPANE.H
==========================================================================================================================================*/
// 🎛️ Right-docked inspector pane for Texture Paint Studio: KPI trio, active brush box, layer properties, 22 PBR channels & masks.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Controls/TextInputField.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/TexturePaintSession.h"

#include <functional>

namespace Frontier::Workspaces
{

class TexturePaintInspectorPane
{
public:
    TexturePaintInspectorPane() noexcept = default;
    ~TexturePaintInspectorPane() noexcept;

    void AttachSession(TexturePaintSession* TargetSession) noexcept;
    void AssignOpenBrushInspectorCallback(std::function<void()> Callback) noexcept { OpenBrushInspectorFn = std::move(Callback); }
    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor);

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void SetScrollOffsetY(float OffsetY) noexcept { ScrollOffsetY = OffsetY; }

private:
    TexturePaintSession*  Session                = nullptr;
    std::function<void()> OpenBrushInspectorFn   {};
    float                 ScrollOffsetY          = 0.0f;
    float                 MaxScrollY             = 0.0f;
    int32_t               ActiveSliderId         = -1;
    uint32_t              SyncedLayerId          = 0u;
    TextEditBuffer        LayerNameBuffer        {};

    bool                  LayerSectionOpen       = true;
    bool                  CategorySectionOpen    = true;
    bool                  MaskSectionOpen        = true;
    bool                  ViewportSectionOpen    = false;

    bool                  BlendDropdownOpen      = false;
    bool                  PartDropdownOpen       = false;
    bool                  AddChannelDropdownOpen = false;
    bool                  MaskGenDropdownOpen    = false;
    float                 DropdownScrollY        = 0.0f;
    Rectangle2D           BlendAnchor            {};
    Rectangle2D           PartAnchor             {};
    Rectangle2D           AddChannelAnchor       {};
    Rectangle2D           MaskGenAnchor          {};
};

} // namespace Frontier::Workspaces
