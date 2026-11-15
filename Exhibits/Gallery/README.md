# 🏆 Exhibit Proof Gallery

> **TL;DR:** 100 proof captures from this repo's own engine build (`ctest --test-dir Build/Editor`, gallery built 2026-11-15). They come from 37 tests in 21 domains. Shown as 1280 px JPEGs (7 MB). The full-size PNGs (485 MB) are written to `Exhibits/Images/` by every test run and kept out of git.

🌐 Grid view: `Exhibits/Gallery/index.html` (served at `:8095/Exhibits/Gallery/`).

🐞 `MaterialWorkspaceUIValidation` aborts on an ImGui assert from the imported tree (51/52 pass). The Material images below come from the other Material tests.

```text
 cmake --build Build/Editor && ctest --test-dir Build/Editor     # regenerates Exhibits/Images/*.png
 python3 Automation/BuildExhibitGallery.py                        # refreshes this gallery
```

| Domain | Captures | Tests |
| :--- | :---: | :--- |
| [ColourSpace](#colourspace) | 3 | `ColourComponentsValidation`, `ColourSpaceValidation` |
| [ContentBrowser](#contentbrowser) | 10 | `ContentBrowserValidation` |
| [ControlCentre](#controlcentre) | 16 | `ControlCentreValidation` |
| [DirectLighting](#directlighting) | 1 | `SolarShadowValidation` |
| [Docking](#docking) | 2 | `DockingValidation` |
| [Geometry](#geometry) | 2 | `GeometryCompletionValidation`, `GeometryNetworkValidation` |
| [GeometryCompiler](#geometrycompiler) | 3 | `GeometryCompileValidation`, `GeometryReaderValidation` |
| [GlobalIllumination](#globalillumination) | 2 | `TieredWorldRenderValidation` |
| [Input](#input) | 1 | `InputValidation` |
| [Lifecycle](#lifecycle) | 1 | `LifecycleValidation` |
| [MaterialSpace](#materialspace) | 1 | `MaterialScatteringValidation` |
| [Materials](#materials) | 5 | `DynamicMaterialRecipeValidation`, `DynamicMaterialVulkanValidation`, `MaterialWorkspaceUIValidation` |
| [NetworkingSpace](#networkingspace) | 1 | `NetworkingSpaceValidation` |
| [Particles](#particles) | 14 | `ParticleVehicleDissolveValidation`, `ParticleWorkspaceUIValidation` |
| [Texturing](#texturing) | 13 | `BakingWorkspaceUIValidation`, `FrontierBakingExecutableSmoke`, `FrontierPatternExecutableSmoke`, `FrontierStampExecutableSmoke`, `PatternStampWorkspaceUIValidation`, `VectorGraphicsGPUValidation` |
| [UV](#uv) | 8 | `FrontierEditorExecutableSmoke`, `FrontierUVExecutableSmoke`, `UVInteractiveAuthoringValidation`, `UVParameterizationValidation`, `UVRasterPickingGizmoValidation`, `UVWorkspaceUIValidation` |
| [VectorField](#vectorfield) | 8 | `VectorFieldValidation` |
| [Visibility](#visibility) | 1 | `VisibilityRasterValidation` |
| [Windowing](#windowing) | 1 | `WindowValidation` |
| [WorkspacePanes](#workspacepanes) | 6 | `WorkspacePanesValidation` |
| [Workspaces](#workspaces) | 1 | `WorkspaceRevisionValidation` |

---

## ColourSpace

**01-ColourRampDragGhostHighlight** · `ColourComponentsValidation` · 1440×900

![01-ColourRampDragGhostHighlight](ColourSpace/01-ColourRampDragGhostHighlight.jpg)

**02-ColourComponentsStudioPostDrop** · `ColourComponentsValidation` · 1440×900

![02-ColourComponentsStudioPostDrop](ColourSpace/02-ColourComponentsStudioPostDrop.jpg)

**ColourRampPresetsSheet** · `ColourSpaceValidation` · 1120×740

![ColourRampPresetsSheet](ColourSpace/ColourRampPresetsSheet.jpg)

---

## ContentBrowser

**01-ClosedBottomNotch** · `ContentBrowserValidation` · 1440×900

![01-ClosedBottomNotch](ContentBrowser/01-ClosedBottomNotch.jpg)

**02-ColoursGridFigPurple** · `ContentBrowserValidation` · 1440×900

![02-ColoursGridFigPurple](ContentBrowser/02-ColoursGridFigPurple.jpg)

**03-ColoursGridPineappleYellow** · `ContentBrowserValidation` · 1440×900

![03-ColoursGridPineappleYellow](ContentBrowser/03-ColoursGridPineappleYellow.jpg)

**04-ColoursVerticalStripsAugustBeigeAndBrown** · `ContentBrowserValidation` · 1440×900

![04-ColoursVerticalStripsAugustBeigeAndBrown](ContentBrowser/04-ColoursVerticalStripsAugustBeigeAndBrown.jpg)

**05-ColoursHorizontalStrips** · `ContentBrowserValidation` · 1440×900

![05-ColoursHorizontalStrips](ContentBrowser/05-ColoursHorizontalStrips.jpg)

**06-SplitShelfColourSlotAssignment** · `ContentBrowserValidation` · 1440×900

![06-SplitShelfColourSlotAssignment](ContentBrowser/06-SplitShelfColourSlotAssignment.jpg)

**07-SceneWorkspacePrebakedThumbnailSheet** · `ContentBrowserValidation` · 1440×900

![07-SceneWorkspacePrebakedThumbnailSheet](ContentBrowser/07-SceneWorkspacePrebakedThumbnailSheet.jpg)

**08-UVWorkspaceStrictCategoryMaskAndImported** · `ContentBrowserValidation` · 1440×900

![08-UVWorkspaceStrictCategoryMaskAndImported](ContentBrowser/08-UVWorkspaceStrictCategoryMaskAndImported.jpg)

**09-LightThemeSearchAndListIcons** · `ContentBrowserValidation` · 1440×900

![09-LightThemeSearchAndListIcons](ContentBrowser/09-LightThemeSearchAndListIcons.jpg)

**10-NordThemeGridAndSearchIcons** · `ContentBrowserValidation` · 1440×900

![10-NordThemeGridAndSearchIcons](ContentBrowser/10-NordThemeGridAndSearchIcons.jpg)

---

## ControlCentre

**01-ClosedNotch** · `ControlCentreValidation` · 1280×800

![01-ClosedNotch](ControlCentre/01-ClosedNotch.jpg)

**02-QuickPanel** · `ControlCentreValidation` · 1280×800

![02-QuickPanel](ControlCentre/02-QuickPanel.jpg)

**03-SettingsDirectory** · `ControlCentreValidation` · 1280×800

![03-SettingsDirectory](ControlCentre/03-SettingsDirectory.jpg)

**04-AppearanceDisplay** · `ControlCentreValidation` · 1280×800

![04-AppearanceDisplay](ControlCentre/04-AppearanceDisplay.jpg)

**05-AppearanceTypography** · `ControlCentreValidation` · 1280×800

![05-AppearanceTypography](ControlCentre/05-AppearanceTypography.jpg)

**06-AppearanceTypeScale** · `ControlCentreValidation` · 1280×800

![06-AppearanceTypeScale](ControlCentre/06-AppearanceTypeScale.jpg)

**07-AppearanceTheme** · `ControlCentreValidation` · 1280×800

![07-AppearanceTheme](ControlCentre/07-AppearanceTheme.jpg)

**08-AppearanceSemanticAndLight** · `ControlCentreValidation` · 1280×800

![08-AppearanceSemanticAndLight](ControlCentre/08-AppearanceSemanticAndLight.jpg)

**09-InputSettings** · `ControlCentreValidation` · 1280×800

![09-InputSettings](ControlCentre/09-InputSettings.jpg)

**10-NotificationsSettings** · `ControlCentreValidation` · 1280×800

![10-NotificationsSettings](ControlCentre/10-NotificationsSettings.jpg)

**11-WorkspaceSettings** · `ControlCentreValidation` · 1280×800

![11-WorkspaceSettings](ControlCentre/11-WorkspaceSettings.jpg)

**12-ConfirmationRounded** · `ControlCentreValidation` · 1280×800

![12-ConfirmationRounded](ControlCentre/12-ConfirmationRounded.jpg)

**13-ConfirmationSemanticHeader** · `ControlCentreValidation` · 1280×800

![13-ConfirmationSemanticHeader](ControlCentre/13-ConfirmationSemanticHeader.jpg)

**14-ReusableControlsKit** · `ControlCentreValidation` · 1280×800

![14-ReusableControlsKit](ControlCentre/14-ReusableControlsKit.jpg)

**15-TooltipsLightDarkAndDirectional** · `ControlCentreValidation` · 1280×800

![15-TooltipsLightDarkAndDirectional](ControlCentre/15-TooltipsLightDarkAndDirectional.jpg)

**16-DiagnosticSeverityTooltips** · `ControlCentreValidation` · 1280×800

![16-DiagnosticSeverityTooltips](ControlCentre/16-DiagnosticSeverityTooltips.jpg)

---

## DirectLighting

**01-TieredSolarShadowsAndAreaLights** · `SolarShadowValidation` · 1440×900

![01-TieredSolarShadowsAndAreaLights](DirectLighting/01-TieredSolarShadowsAndAreaLights.jpg)

---

## Docking

**01-PrimaryEditorDockspace** · `DockingValidation` · 1440×900

![01-PrimaryEditorDockspace](Docking/01-PrimaryEditorDockspace.jpg)

**02-DetachedMultiWindowDocking** · `DockingValidation` · 1440×800

![02-DetachedMultiWindowDocking](Docking/02-DetachedMultiWindowDocking.jpg)

---

## Geometry

**01-PolygonNetworkAndUVTiles** · `GeometryNetworkValidation` · 1720×920

![01-PolygonNetworkAndUVTiles](Geometry/01-PolygonNetworkAndUVTiles.jpg)

**02-GeometryCompletionAndAcceleration** · `GeometryCompletionValidation` · 1440×900

![02-GeometryCompletionAndAcceleration](Geometry/02-GeometryCompletionAndAcceleration.jpg)

---

## GeometryCompiler

**01-ReaderFormatTiles** · `GeometryReaderValidation` · 1800×1120

![01-ReaderFormatTiles](GeometryCompiler/01-ReaderFormatTiles.jpg)

**02-CompileStepTimeline** · `GeometryCompileValidation` · 1800×1000

![02-CompileStepTimeline](GeometryCompiler/02-CompileStepTimeline.jpg)

**03-CollisionFits** · `GeometryCompileValidation` · 1800×1000

![03-CollisionFits](GeometryCompiler/03-CollisionFits.jpg)

---

## GlobalIllumination

**01-TieredGlobalIlluminationAndWorldRender** · `TieredWorldRenderValidation` · 1440×900

![01-TieredGlobalIlluminationAndWorldRender](GlobalIllumination/01-TieredGlobalIlluminationAndWorldRender.jpg)

**02-CppWorldEditorOutlinerAndGtxViewport** · `TieredWorldRenderValidation` · 1600×940

![02-CppWorldEditorOutlinerAndGtxViewport](GlobalIllumination/02-CppWorldEditorOutlinerAndGtxViewport.jpg)

---

## Input

**InputExchangeTelemetry** · `InputValidation` · 1280×680

![InputExchangeTelemetry](Input/InputExchangeTelemetry.jpg)

---

## Lifecycle

**01-EditorLifecycleWorkspace** · `LifecycleValidation` · 1440×900

![01-EditorLifecycleWorkspace](Lifecycle/01-EditorLifecycleWorkspace.jpg)

---

## MaterialSpace

**01-OpenPbrTenLobeMaterialGallery** · `MaterialScatteringValidation` · 1440×900

![01-OpenPbrTenLobeMaterialGallery](MaterialSpace/01-OpenPbrTenLobeMaterialGallery.jpg)

---

## Materials

**CppDirectPbr_13_Showcase** · `DynamicMaterialRecipeValidation` · 1272×768

![CppDirectPbr_13_Showcase](Materials/CppDirectPbr_13_Showcase.jpg)

**CppDirectPbr_4Specimens_Proof** · `DynamicMaterialRecipeValidation` · 1180×304

![CppDirectPbr_4Specimens_Proof](Materials/CppDirectPbr_4Specimens_Proof.jpg)

**CppDirectPbr_Hero6_Proof** · `DynamicMaterialRecipeValidation` · 1008×676

![CppDirectPbr_Hero6_Proof](Materials/CppDirectPbr_Hero6_Proof.jpg)

**CppMaterialWorkspace_Viewport_Volcanic** · `MaterialWorkspaceUIValidation` · 1600×980

![CppMaterialWorkspace_Viewport_Volcanic](Materials/CppMaterialWorkspace_Viewport_Volcanic.jpg)

**VulkanDirectPbr_Hero6_Proof** · `DynamicMaterialVulkanValidation` · 1008×676

![VulkanDirectPbr_Hero6_Proof](Materials/VulkanDirectPbr_Hero6_Proof.jpg)

---

## NetworkingSpace

**NetworkingSpace_GlobalRoutingAndPolicies** · `NetworkingSpaceValidation` · 1440×900

![NetworkingSpace_GlobalRoutingAndPolicies](NetworkingSpace/NetworkingSpace_GlobalRoutingAndPolicies.jpg)

---

## Particles

**Cpp_Assets_Browser** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_Assets_Browser](Particles/CppUI/Cpp_Assets_Browser.jpg)

**Cpp_ContentBrowser_RampDrop** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_ContentBrowser_RampDrop](Particles/CppUI/Cpp_ContentBrowser_RampDrop.jpg)

**Cpp_Inspector_ForceField** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_Inspector_ForceField](Particles/CppUI/Cpp_Inspector_ForceField.jpg)

**Cpp_Inspector_Metrics_LogDrawer** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_Inspector_Metrics_LogDrawer](Particles/CppUI/Cpp_Inspector_Metrics_LogDrawer.jpg)

**Cpp_Inspector_MotionFX** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_Inspector_MotionFX](Particles/CppUI/Cpp_Inspector_MotionFX.jpg)

**Cpp_Inspector_Source** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_Inspector_Source](Particles/CppUI/Cpp_Inspector_Source.jpg)

**Cpp_WorkspaceUI_Default** · `ParticleWorkspaceUIValidation` · 1440×900

![Cpp_WorkspaceUI_Default](Particles/CppUI/Cpp_WorkspaceUI_Default.jpg)

**CppProceduralSprites_16_Proof** · `ParticleVehicleDissolveValidation` · 572×572

![CppProceduralSprites_16_Proof](Particles/TextureStudio/CppProceduralSprites_16_Proof.jpg)

**01_ControlVehicle_DerezCubes** · `ParticleVehicleDissolveValidation` · 720×540

![01_ControlVehicle_DerezCubes](Particles/VehicleDissolve/01_ControlVehicle_DerezCubes.jpg)

**02_ControlVehicle_ReverseRezCubes** · `ParticleVehicleDissolveValidation` · 720×540

![02_ControlVehicle_ReverseRezCubes](Particles/VehicleDissolve/02_ControlVehicle_ReverseRezCubes.jpg)

**03_ControlVehicle_DissolveToNothing** · `ParticleVehicleDissolveValidation` · 720×540

![03_ControlVehicle_DissolveToNothing](Particles/VehicleDissolve/03_ControlVehicle_DissolveToNothing.jpg)

**04_ControlVehicle_DissolveToButterfly** · `ParticleVehicleDissolveValidation` · 720×540

![04_ControlVehicle_DissolveToButterfly](Particles/VehicleDissolve/04_ControlVehicle_DissolveToButterfly.jpg)

**ContentBrowser_ParticleThumbnails_Proof** · `ParticleVehicleDissolveValidation` · 976×148

![ContentBrowser_ParticleThumbnails_Proof](Particles/VehicleDissolve/ContentBrowser_ParticleThumbnails_Proof.jpg)

**ControlVehicle_4Modes_Proof** · `ParticleVehicleDissolveValidation` · 1482×1122

![ControlVehicle_4Modes_Proof](Particles/VehicleDissolve/ControlVehicle_4Modes_Proof.jpg)

---

## Texturing

**05-PatternWorkspaceMain** · `PatternStampWorkspaceUIValidation` · 1600×980

![05-PatternWorkspaceMain](Texturing/05-PatternWorkspaceMain.jpg)

**06-PatternWorkspaceOverlaySheetsAndModifiers** · `PatternStampWorkspaceUIValidation` · 1600×980

![06-PatternWorkspaceOverlaySheetsAndModifiers](Texturing/06-PatternWorkspaceOverlaySheetsAndModifiers.jpg)

**07-StampWorkspaceMain** · `PatternStampWorkspaceUIValidation` · 1600×980

![07-StampWorkspaceMain](Texturing/07-StampWorkspaceMain.jpg)

**08-PatternWorkspaceLightTheme** · `PatternStampWorkspaceUIValidation` · 1600×980

![08-PatternWorkspaceLightTheme](Texturing/08-PatternWorkspaceLightTheme.jpg)

**09-BakingWorkspaceMain** · `BakingWorkspaceUIValidation` · 1600×980

![09-BakingWorkspaceMain](Texturing/09-BakingWorkspaceMain.jpg)

**10-BakingWorkspaceSplitSdf** · `BakingWorkspaceUIValidation` · 1600×980

![10-BakingWorkspaceSplitSdf](Texturing/10-BakingWorkspaceSplitSdf.jpg)

**11-BakingWorkspaceQuickMenu** · `BakingWorkspaceUIValidation` · 1600×980

![11-BakingWorkspaceQuickMenu](Texturing/11-BakingWorkspaceQuickMenu.jpg)

**FrontierBaking_DesktopExecutable** · `FrontierBakingExecutableSmoke` · 1840×980

![FrontierBaking_DesktopExecutable](Texturing/FrontierBaking_DesktopExecutable.jpg)

**FrontierPattern_DesktopExecutable** · `FrontierPatternExecutableSmoke` · 1840×980

![FrontierPattern_DesktopExecutable](Texturing/FrontierPattern_DesktopExecutable.jpg)

**FrontierStamp_DesktopExecutable** · `FrontierStampExecutableSmoke` · 1840×980

![FrontierStamp_DesktopExecutable](Texturing/FrontierStamp_DesktopExecutable.jpg)

**GPU_VectorRoughnessCheck** · `VectorGraphicsGPUValidation` · 780×560

![GPU_VectorRoughnessCheck](Texturing/GPU_VectorRoughnessCheck.jpg)

**GPU_VectorStageCheck** · `VectorGraphicsGPUValidation` · 780×560

![GPU_VectorStageCheck](Texturing/GPU_VectorStageCheck.jpg)

**GPU_VectorThumbCheck** · `VectorGraphicsGPUValidation` · 128×128

![GPU_VectorThumbCheck](Texturing/GPU_VectorThumbCheck.jpg)

---

## UV

**01-VulkanRendersPickingAndGizmo** · `UVRasterPickingGizmoValidation` · 1660×880

![01-VulkanRendersPickingAndGizmo](UV/01-VulkanRendersPickingAndGizmo.jpg)

**02-StandaloneUVWorkspaceUI** · `UVWorkspaceUIValidation` · 1840×980

![02-StandaloneUVWorkspaceUI](UV/02-StandaloneUVWorkspaceUI.jpg)

**03-FeatureSetUVWorkspaceUI** · `UVWorkspaceUIValidation` · 1840×980

![03-FeatureSetUVWorkspaceUI](UV/03-FeatureSetUVWorkspaceUI.jpg)

**04-GPUConcavePackingAndSolvers** · `UVParameterizationValidation` · 1840×920

![04-GPUConcavePackingAndSolvers](UV/04-GPUConcavePackingAndSolvers.jpg)

**FrontierEditor_DesktopExecutable** · `FrontierEditorExecutableSmoke` · 1840×980

![FrontierEditor_DesktopExecutable](UV/FrontierEditor_DesktopExecutable.jpg)

**FrontierUV_DesktopExecutable** · `FrontierUVExecutableSmoke` · 1840×980

![FrontierUV_DesktopExecutable](UV/FrontierUV_DesktopExecutable.jpg)

**UVInteractive_PinAndBackdrop_2D** · `UVInteractiveAuthoringValidation` · 768×768

![UVInteractive_PinAndBackdrop_2D](UV/UVInteractive_PinAndBackdrop_2D.jpg)

**UVSwapchain_PresentedViewport** · `UVInteractiveAuthoringValidation` · 1840×980

![UVSwapchain_PresentedViewport](UV/UVSwapchain_PresentedViewport.jpg)

---

## VectorField

**01-ForceFieldLitPbrAndOverlay** · `VectorFieldValidation` · 1600×980

![01-ForceFieldLitPbrAndOverlay](VectorField/01-ForceFieldLitPbrAndOverlay.jpg)

**02-ForceFieldSplitViewPerspectiveAndTop** · `VectorFieldValidation` · 1600×980

![02-ForceFieldSplitViewPerspectiveAndTop](VectorField/02-ForceFieldSplitViewPerspectiveAndTop.jpg)

**03-ForceFieldVulkanCanvasDirect** · `VectorFieldValidation` · 1280×720

![03-ForceFieldVulkanCanvasDirect](VectorField/03-ForceFieldVulkanCanvasDirect.jpg)

**04-ForceFieldInspectorFormulaTab** · `VectorFieldValidation` · 1600×980

![04-ForceFieldInspectorFormulaTab](VectorField/04-ForceFieldInspectorFormulaTab.jpg)

**05-ForceFieldInspectorLayersTab** · `VectorFieldValidation` · 1600×980

![05-ForceFieldInspectorLayersTab](VectorField/05-ForceFieldInspectorLayersTab.jpg)

**06-ForceFieldInspectorCacheTab** · `VectorFieldValidation` · 1600×980

![06-ForceFieldInspectorCacheTab](VectorField/06-ForceFieldInspectorCacheTab.jpg)

**07-ForceFieldContentBrowserDrawer** · `VectorFieldValidation` · 1600×980

![07-ForceFieldContentBrowserDrawer](VectorField/07-ForceFieldContentBrowserDrawer.jpg)

**08-ForceFieldConstructModal** · `VectorFieldValidation` · 1600×980

![08-ForceFieldConstructModal](VectorField/08-ForceFieldConstructModal.jpg)

---

## Visibility

**01-VisibilityBufferAndAnalyticResolve** · `VisibilityRasterValidation` · 1440×900

![01-VisibilityBufferAndAnalyticResolve](Visibility/01-VisibilityBufferAndAnalyticResolve.jpg)

---

## Windowing

**WindowPresentationModes** · `WindowValidation` · 1440×820

![WindowPresentationModes](Windowing/WindowPresentationModes.jpg)

---

## WorkspacePanes

**01-EmptyDefaultWorkspace** · `WorkspacePanesValidation` · 1600×980

![01-EmptyDefaultWorkspace](WorkspacePanes/01-EmptyDefaultWorkspace.jpg)

**02-LayerStackAndConstructMenus** · `WorkspacePanesValidation` · 1600×980

![02-LayerStackAndConstructMenus](WorkspacePanes/02-LayerStackAndConstructMenus.jpg)

**03-ShowcaseFolderInspectorAndTree** · `WorkspacePanesValidation` · 1600×980

![03-ShowcaseFolderInspectorAndTree](WorkspacePanes/03-ShowcaseFolderInspectorAndTree.jpg)

**04-EntryInspectorSplitAndDiagnostics** · `WorkspacePanesValidation` · 1600×980

![04-EntryInspectorSplitAndDiagnostics](WorkspacePanes/04-EntryInspectorSplitAndDiagnostics.jpg)

**05-MultiSelectContextAndSettings** · `WorkspacePanesValidation` · 1600×980

![05-MultiSelectContextAndSettings](WorkspacePanes/05-MultiSelectContextAndSettings.jpg)

**06-HeaderSettingsAndScrolledTree** · `WorkspacePanesValidation` · 1600×980

![06-HeaderSettingsAndScrolledTree](WorkspacePanes/06-HeaderSettingsAndScrolledTree.jpg)

---

## Workspaces

**01-WorkspaceCodecsRevisionAndThreading** · `WorkspaceRevisionValidation` · 1720×940

![01-WorkspaceCodecsRevisionAndThreading](Workspaces/01-WorkspaceCodecsRevisionAndThreading.jpg)
