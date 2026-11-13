/*==========================================================================================================================================
                                                     TEXTUREPAINTVIEWPORTPANE.H
==========================================================================================================================================*/
// 🖌️ Central Texture Paint viewport pane: Band 1 doc/res bar, Band 2 9-tool dock + More tools/View/Save/Export, 3D/2D UV + Brush Inspector.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Controls/TextInputField.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/TexturePaintSession.h"

namespace Frontier::Workspaces
{

class TexturePaintViewportPane
{
public:
    TexturePaintViewportPane() noexcept = default;
    ~TexturePaintViewportPane() noexcept;

    void AttachSession(TexturePaintSession* TargetSession) noexcept;
    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor);

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void SetBrushInspectorOpen(bool Open) noexcept;
    [[nodiscard]] bool QueryBrushInspectorOpen() const noexcept { return BrushInspectorOpen; }
    void SetMoreToolsOpen(bool Open) noexcept { MoreToolsSheetOpen = Open; }
    void CloseAllOverlays() noexcept;

private:
    void RenderBrushInspectorSheet(
        PixelSpace&             Surface,
        Rectangle2D             WorkspaceBounds,
        const PaneInputReading& Input) noexcept;

    void RenderUvCanvasPreview(
        PixelSpace& Surface,
        Rectangle2D PreviewArea) const noexcept;

    TexturePaintSession* Session             = nullptr;
    TextEditBuffer       DocNameBuffer       {};
    bool                 MoreToolsSheetOpen  = false;
    bool                 ResolutionSheetOpen = false;
    bool                 ViewLayoutSheetOpen = false;
    bool                 SaveSheetOpen       = false;
    bool                 StudySubSheetOpen   = false;
    bool                 ChannelSubSheetOpen = false;
    bool                 BrushInspectorOpen  = false;
    float                SheetScrollY        = 0.0f;
    float                BrushScrollY        = 0.0f;
    float                MaxBrushScrollY     = 0.0f;
    int32_t              ActiveBrushSliderId = -1;
    Point2D              BrushSheetAnchor    { 0.0f, 0.0f };
    Rectangle2D          LastCanvasBounds    {};
};

} // namespace Frontier::Workspaces
