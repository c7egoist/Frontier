/*==========================================================================================================================================
                                                         BAKINGVIEWPORTPANE.H
==========================================================================================================================================*/
// 🧊 Center pane for Baking Studio: toolbar controls, deferred 3D / inspected 2D layout & right-click / Q Baking Quick Overlay.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/Components/PixelSpace.h"
#include "Engine/Workspaces/Texturing/BakingWorkspaceSession.h"

namespace Frontier::Workspaces
{

class BakingViewportPane
{
public:
    BakingViewportPane() noexcept = default;
    ~BakingViewportPane() noexcept;

    void AttachSession(BakingWorkspaceSession* TargetSession) noexcept;
    void PresentInImGuiPane(double DeltaSeconds, float ScaleFactor);

    void Render(
        PixelSpace&             Surface,
        Rectangle2D             Bounds,
        const PaneInputReading& Input,
        double                  DeltaSeconds);

    void RenderTopLevelOverlays(
        PixelSpace&             Surface,
        Rectangle2D             WorkspaceBounds,
        const PaneInputReading& Input) noexcept;

    void SetQuickOverlayOpen(bool Open) noexcept;
    [[nodiscard]] bool QueryQuickOverlayOpen() const noexcept;
    [[nodiscard]] bool QueryAnyOverlayOpen() const noexcept;
    void CloseAllOverlays() noexcept;

private:
    void RenderInspectedTwoDPreview(
        PixelSpace& Surface,
        Rectangle2D PreviewArea) const noexcept;

    BakingWorkspaceSession* Session            = nullptr;
    bool                    StudyDropdownOpen  = false;
    bool                    LayoutDropdownOpen = false;
    bool                    QuickOverlayOpen   = false;
    float                   SheetScrollY       = 0.0f;
    Point2D                 QuickOverlayAnchor { 0.0f, 0.0f };
    Rectangle2D             LastStudyAnchor    {};
    Rectangle2D             LastLayoutAnchor   {};
    Rectangle2D             LastCanvasBounds   {};
};

} // namespace Frontier::Workspaces
