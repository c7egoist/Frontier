/*==========================================================================================================================================
                                                     TEXTUREPAINTLAYERSTACKPANE.H
==========================================================================================================================================*/
// 🗂️ Left-docked Texture Paint Layer Stack pane: Add Layer overlay, Visible/Hidden filters, search, layer cards, masks & stack actions.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Controls/TextInputField.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/TexturePaintSession.h"

#include <cstdint>

namespace Frontier::Workspaces
{

class TexturePaintLayerStackPane
{
public:
    TexturePaintLayerStackPane() noexcept = default;
    ~TexturePaintLayerStackPane() noexcept;

    void AttachSession(TexturePaintSession* TargetSession) noexcept;
    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor);

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void SetAddLayerSheetOpen(bool Open) noexcept { AddLayerSheetOpen = Open; }
    [[nodiscard]] bool QueryAddLayerSheetOpen() const noexcept { return AddLayerSheetOpen; }
    void SetScrollOffsetY(float OffsetY) noexcept { ScrollOffsetY = OffsetY; }

private:
    TexturePaintSession* Session            = nullptr;
    bool                 AddLayerSheetOpen  = false;
    float                ScrollOffsetY      = 0.0f;
    float                MaxScrollY         = 0.0f;
    TextEditBuffer       SearchBuffer       {};
};

} // namespace Frontier::Workspaces
