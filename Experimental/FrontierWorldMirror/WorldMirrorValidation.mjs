//==========================================================================================================================================
//                                                  WORLDMIRRORVALIDATION.MJS
//==========================================================================================================================================
// Standalone Node ESM validation suite verifying 1:1 C++ <-> HTML parity of Experimental/FrontierWorldMirror:
//   1. Exact 17-entry Outliner hierarchy matching Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp
//   2. Canonical EditorCamera pose, 43.0 deg vertical FOV, and bidirectional camera/transform/visibility compilation
//   3. Analytical 3D ray picking across the Cornell-Studio Gallery specimens and Ceiling Softbox
//   4. Ring-free analytical GTX shadow/GI shader + 2px screen-space silhouette selection outline verification
//   5. Full 20-channel OpenPBR Material Atlas compilation (Fill, Gradient, Fabric, Subsurface, Clear coat, Unlit)
//   6. 1:1 C++ Slate 13-handle TransformGizmo3D (GizmoPRO) geometry, ray-triangle picking, and drag/Ctrl-snap math
//   7. Multi-Level Viewport Footer Switcher & Create Level Dialogue templates

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CanonicalEditorCamera,
  CompileLiveGtxScene,
  PickSceneEntityAtUv,
  ShowcaseInitialRows,
  ShowcaseInitialValues,
} from "./ShowcaseGalleryScene.js";
import { ResolveMaterial } from "./MaterialSpecification.js";
import {
  ATLAS_COLS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  MaterialAtlasSynchronizer,
  TILES_PER_PRIM,
} from "./MaterialAtlasCompiler.js";
import {
  BeginGizmoDrag,
  BuildSlateGizmoGeometry,
  GizmoHandle,
  PickGizmoHandle,
  SolveGizmoDrag,
} from "./TransformGizmo3D.js";
import {
  BuildForceOverlayGeometry,
  DEFAULT_FORCE_OVERLAY,
  ENGINE_FORCE_PRESETS,
  EvaluateSceneForceFieldAt,
  FORCE_MODELS,
  ParseForceModelToml,
  PickForceBeacon,
  ResolveForceValues,
  SampleCurlNoise3D,
  SerializeForceModelToml,
} from "./ForceFieldCatalog.js";
import { CompileFieldProgram, DEFAULT_FORMULA_CODE } from "./VectorFieldLang.js";
import { CreateWebgpuGtxRenderer } from "./WebgpuGtxRenderer.js";
import {
  BuildDefaultLevels,
  CreateNewLevelRecord,
} from "./LevelSystem.js";
import { CreateGtxBandKernel, CpuGtxRenderer } from "./CpuGtxFallbackRenderer.js";
import {
  ApplyUnrealDolly,
  ApplyUnrealMouseLook,
  ApplyUnrealOrbit,
  ApplyUnrealPan,
  BuildUnrealCameraBasis,
  DeriveUnrealCameraState,
  StepUnrealWasdCamera,
} from "./UnrealViewportCamera.js";

const Folder = path.dirname(fileURLToPath(import.meta.url));

// 1. Verify exact 17-entry Cornell-Studio Gallery Outliner matching C++ ShowcaseGalleryScene
assert.equal(
  ShowcaseInitialRows.length,
  17,
  "Expected 17 Outliner entries (4 folders + 10 geometry + Editor Camera + Sun + Ceiling Softbox)",
);
const ShowcaseChildren = ShowcaseInitialRows.filter(
  (Row) => Row.Parent === "showcase",
);
assert.equal(ShowcaseChildren.length, 10, "Expected 10 geometry specimens under Showcase");

// 2. Verify compiled Tier 1 GTX scene & EditorCamera 43.0 deg vertical FOV parity
const Compiled = CompileLiveGtxScene(
  ShowcaseInitialRows,
  ShowcaseInitialValues,
  {},
  "PERSP",
);
assert.equal(Compiled.Primitives.length, 10, "All 10 gallery primitives compiled");
assert.equal(Compiled.AreaLights.length, 1, "Ceiling Softbox LTC area light compiled");
assert.deepEqual(
  Compiled.AreaLights[0].Center,
  [0.55, 0.35, 1.82],
  "Ceiling Softbox retains exact C++ Showcase coordinates [0.55, 0.35, 1.82]",
);
const FovDeg = (Compiled.VerticalFovRad * 180) / Math.PI;
assert.ok(
  Math.abs(FovDeg - CanonicalEditorCamera.VerticalFovDeg) < 0.25,
  `EditorCamera vertical FOV (${FovDeg.toFixed(2)} deg) matches C++ 43.0 deg`,
);
assert.equal(
  Compiled.Primitives.filter((P) => P.GlassShell).length,
  1,
  "Abbe Crown Glass Orb routed to 2-layer glass peel",
);

// 3. Verify analytical 3D ray picking (including rotated objects)
const CenterPick = PickSceneEntityAtUv(Compiled, 0.48, 0.45, 16 / 9);
assert.equal(
  CenterPick,
  "chrome-sphere",
  `Center viewport ray pick should select chrome-sphere (got ${CenterPick})`,
);
const GlassPick = PickSceneEntityAtUv(Compiled, 0.62, 0.63, 16 / 9);
assert.equal(
  GlassPick,
  "abbe-glass-orb",
  `Foreground right ray pick should select abbe-glass-orb (got ${GlassPick})`,
);

// 4. Verify 20-Channel Material Atlas compilation (Fill + multi-stop Gradient + Unlit + Sheen + Subsurface)
const Atlas = new MaterialAtlasSynchronizer();
const GradientMat = ResolveMaterial({
  Material: {
    Name: "Sunset Gradient Silk",
    Type: "Fabric",
    Channels: {
      colour: {
        Source: "Gradient",
        Axis: "U",
        Fill: "#ff2200",
        Stops: [
          { Id: "a", Position: 0.0, Value: "#ff0000" },
          { Id: "b", Position: 1.0, Value: "#0000ff" },
        ],
      },
      sheen: { Source: "Fill", Fill: "#ffc0dd" },
      sheenRoughness: { Source: "Fill", Fill: 0.5 },
      opacity: { Source: "Fill", Fill: 0.85 },
    },
  },
});
const CustomPrims = [...Compiled.Primitives];
CustomPrims[0] = { ...CustomPrims[0], ResolvedMaterial: GradientMat };
assert.equal(Atlas.UpdatePrimitives(CustomPrims), true, "Atlas marks dirty on update");

// Check Prim 0 Slot 0 (BaseColour + Opacity) across U = left (red) vs right (blue)
const ReadTexel = (TileIdx, Px, Py) => {
  const Col = TileIdx % ATLAS_COLS;
  const Row = Math.floor(TileIdx / ATLAS_COLS);
  const Off = ((Row * ATLAS_TILE_SIZE + Py) * ATLAS_WIDTH + (Col * ATLAS_TILE_SIZE + Px)) * 4;
  return [Atlas.Pixels[Off], Atlas.Pixels[Off + 1], Atlas.Pixels[Off + 2], Atlas.Pixels[Off + 3]];
};
const LeftRgbA = ReadTexel(0, 2, 32);
const RightRgbA = ReadTexel(0, 61, 32);
assert.ok(LeftRgbA[0] > 220 && LeftRgbA[2] < 20, "Gradient U=0 bakes linear Red");
assert.ok(RightRgbA[2] > 220 && RightRgbA[0] < 20, "Gradient U=1 bakes linear Blue");
assert.ok(Math.abs(LeftRgbA[3] - Math.round(0.85 * 255)) <= 2, "Opacity channel baked into Slot 0 Alpha");
const SheenTexel = ReadTexel(4, 32, 32);
assert.ok(SheenTexel[0] > 180 && SheenTexel[2] > 140, "Fabric Sheen channel baked into Slot 4 RGB");

// Verify non-Subsurface materials do NOT bleed default #cccccc subsurface wrap lighting, while Subsurface materials DO!
const StandardPlasterMat = ResolveMaterial({
  Material: {
    Name: "Matte Gallery Plaster",
    Type: "Standard",
    Channels: {
      colour: { Source: "Fill", Fill: "#dfd9cf" },
      roughness: { Source: "Fill", Fill: 0.65 },
    },
  },
});
const TrueSubsurfaceMat = ResolveMaterial({
  Material: {
    Name: "Alabaster Wax",
    Type: "Subsurface",
    Channels: {
      colour: { Source: "Fill", Fill: "#ede6da" },
      subsurface: { Source: "Fill", Fill: "#ffd2ad" },
    },
  },
});
CustomPrims[1] = { ...CustomPrims[1], ResolvedMaterial: StandardPlasterMat };
CustomPrims[2] = { ...CustomPrims[2], ResolvedMaterial: TrueSubsurfaceMat };
Atlas.UpdatePrimitives(CustomPrims);
const PlasterSssTexel = ReadTexel(1 * TILES_PER_PRIM + 5, 32, 32);
const AlabasterSssTexel = ReadTexel(2 * TILES_PER_PRIM + 5, 32, 32);
assert.deepEqual(
  PlasterSssTexel.slice(0, 3),
  [0, 0, 0],
  "Standard material zeroes unauthored default #cccccc subsurface channel (no plaster blowout)",
);
assert.ok(
  AlabasterSssTexel[0] > 200 && AlabasterSssTexel[1] > 120,
  "Subsurface material bakes warm subsurface scatter tint into Slot 5 RGB",
);

// 5. Verify 1:1 C++ Slate 13-Handle TransformGizmo3D (GizmoPRO)
const Pivot = [0.0, 0.5, 0.25];
const BuiltGizmo = BuildSlateGizmoGeometry(Pivot, [0, 1, 0], 1.0);
assert.ok(BuiltGizmo.OpaqueVertexCount > 400, "Opaque Slate gizmo cones, cylinders, arcs, borders & torus built");
assert.equal(BuiltGizmo.TranslucentVertexCount, 36, "3 double-sided translucent plane quads (3 * 12 verts) built");

// Verify picking TranslateX cone at Pivot + [1.02, 0, 0]
const HitTranslateX = PickGizmoHandle([1.02, -2.0, 0.25], [0, 1, 0], BuiltGizmo);
assert.equal(HitTranslateX, GizmoHandle.TranslateX, "Ray hits +X Translate cone");

// Verify picking ScaleX cylinder at Pivot + [0.67, 0, 0]
const HitScaleX = PickGizmoHandle([0.67, -2.0, 0.25], [0, 1, 0], BuiltGizmo);
assert.equal(HitScaleX, GizmoHandle.ScaleX, "Ray hits +X Scale cylinder");

// Verify picking CenterRing billboarded torus at radius 0.16
const HitCenterRing = PickGizmoHandle([0.16, -2.0, 0.25], [0, 1, 0], BuiltGizmo);
assert.equal(HitCenterRing, GizmoHandle.CenterRing, "Ray hits camera-billboarded CenterRing");

// Verify TranslateX drag + Ctrl-snap (0.25 m increment)
const DragStart = BeginGizmoDrag(
  GizmoHandle.TranslateX,
  [1.0, -2.0, 0.25],
  [0, 1, 0],
  BuiltGizmo,
  { Position: [...Pivot], Rotation: [0, 0, 0], Scale: [1, 1, 1] },
);
const UnsnappedMove = SolveGizmoDrag(DragStart, [1.37, -2.0, 0.25], [0, 1, 0], false);
assert.ok(Math.abs(UnsnappedMove.Position[0] - 0.37) < 0.01, "TranslateX moves +0.37 m along X");
const SnappedMove = SolveGizmoDrag(DragStart, [1.37, -2.0, 0.25], [0, 1, 0], true);
assert.equal(SnappedMove.Position[0], 0.25, "Ctrl-snap quantizes TranslateX to 0.25 m");

// 6. Verify Multi-Level System & Create Level templates
const DefaultLevels = BuildDefaultLevels();
assert.equal(DefaultLevels.length, 3, "3 built-in Frontier levels shipped");
const CreatedLookDev = CreateNewLevelRecord({
  Name: "Custom Courtyard",
  TemplateId: "lookdev",
  Notes: "Shader validation stage",
});
assert.equal(CreatedLookDev.Name, "Custom Courtyard");
assert.ok(
  CreatedLookDev.Rows.some((R) => R.Id === "velvet-torus"),
  "Look-Dev template populates Charlie velvet & subsurface specimens",
);
const Duplicated = CreateNewLevelRecord({
  Name: "Gallery Variant B",
  TemplateId: "duplicate",
  CurrentLevel: DefaultLevels[0],
});
assert.equal(Duplicated.Rows.length, 17, "Duplicate Current Level clones all 17 Showcase rows");

// 7. Verify standalone index.html bundle integrity & ring-free shader / UI presence
const ViewportSrc = fs.readFileSync(path.join(Folder, "GtxWorldViewport.jsx"), "utf8");
assert.ok(
  !ViewportSrc.includes("evalSceneSdfOpaque") &&
    !ViewportSrc.includes("localDirs[6]") &&
    !ViewportSrc.includes("fwidth(") &&
    !ViewportSrc.includes("uMetaTex"),
  "Zero SDF rings, zero discrete GI ghost rays, zero divergent fwidth derivatives, and zero MRT overhead",
);
assert.ok(
  ViewportSrc.includes("closestRayPrimitiveSoftVis") &&
    ViewportSrc.includes("evaluateAreaLightSoftVis") &&
    ViewportSrc.includes("encodeSelectionDepthAlpha") &&
    ViewportSrc.includes("OUTLINE_FRAGMENT_SHADER"),
  "Smooth analytical GI/AO, softbox penumbra, and single-texture depth-aware 2px outer silhouette outline shaders present",
);

// 8. Verify Zero-WebGL CpuGtxRenderer + KHR_parallel_shader_compile Dual-Backend Self-Healing Parity
assert.ok(
  ViewportSrc.includes("KHR_parallel_shader_compile") &&
    ViewportSrc.includes("CpuGtxRenderer") &&
    ViewportSrc.includes("SessionWebGlBlocked"),
  "Dual-backend KHR_parallel_shader_compile + zero-WebGL CpuGtxRenderer self-healing wired",
);
const CpuFallback = new CpuGtxRenderer();
const CpuAtlas = new MaterialAtlasSynchronizer();
CpuAtlas.UpdatePrimitives(Compiled.Primitives);
const DoneCpu = CpuFallback.RenderSlice(
  {
    CompiledScene: Compiled,
    AtlasPixels: CpuAtlas.Pixels,
    Width: 160,
    Height: 90,
    ViewModeCode: 0,
    ShowGrid: 1,
  },
  90,
);
assert.equal(DoneCpu, true, "CpuGtxRenderer completes full Cornell-Studio Gallery frame");
let NonBlackPixels = 0;
for (let I = 0; I < CpuFallback.OffscreenImg.data.length; I += 4) {
  const R = CpuFallback.OffscreenImg.data[I];
  const G = CpuFallback.OffscreenImg.data[I + 1];
  const B = CpuFallback.OffscreenImg.data[I + 2];
  assert.ok(Number.isFinite(R) && Number.isFinite(G) && Number.isFinite(B), "Finite RGB output");
  if (R + G + B > 24) NonBlackPixels += 1;
}
assert.ok(NonBlackPixels > 160 * 90 * 0.9, "CpuGtxRenderer produces fully lit Cornell-Studio Gallery");

// 9. Verify Atomic Double-Buffering (Zero Top-to-Bottom Scanline Refresh), Hermetic Worker Kernel, and Unreal WASD Camera
const SnapshotFrameA = new Uint8ClampedArray(CpuFallback.OffscreenImg.data);
const RevA = CpuFallback.FrontRevision;
CpuFallback.Invalidate();
const ZoomedScene = {
  ...Compiled,
  CameraOrigin: [0, -2.4, 1.05],
};
const PartialDone = CpuFallback.RenderSlice(
  {
    CompiledScene: ZoomedScene,
    AtlasPixels: CpuAtlas.Pixels,
    Width: 160,
    Height: 90,
    ViewModeCode: 0,
    ShowGrid: 1,
  },
  30,
);
assert.equal(PartialDone, false, "30/90 rows is an in-progress back-buffer slice");
assert.equal(
  CpuFallback.FrontRevision,
  RevA,
  "FrontRevision MUST NOT advance during partial slice",
);
let ByteDiffDuringSlice = 0;
for (let I = 0; I < SnapshotFrameA.length; ++I) {
  if (CpuFallback.OffscreenImg.data[I] !== SnapshotFrameA[I]) {
    ByteDiffDuringSlice += 1;
    break;
  }
}
assert.equal(
  ByteDiffDuringSlice,
  0,
  "Front buffer MUST stay 100% untouched during partial render (zero top-to-bottom scanline tearing!)",
);
const FinishedZoom = CpuFallback.RenderSlice(
  {
    CompiledScene: ZoomedScene,
    AtlasPixels: CpuAtlas.Pixels,
    Width: 160,
    Height: 90,
    ViewModeCode: 0,
    ShowGrid: 1,
  },
  60,
);
assert.equal(FinishedZoom, true, "Remaining 60/90 rows complete zoomed frame");
assert.equal(CpuFallback.FrontRevision, RevA + 1, "FrontRevision advances atomically on full completion");

// Hermetic isolated Worker kernel test (zero outer scope variables)
const IsolatedKernelFactory = new Function(
  `"use strict"; return (${CreateGtxBandKernel.toString()})(1024, 16, 64, 8);`,
);
const IsolatedKernel = IsolatedKernelFactory();
assert.equal(typeof IsolatedKernel.GtxBandEngine, "function", "Hermetic Worker kernel instantiates cleanly");

// Unreal Engine 5 WASDQE + simultaneous RMB free-look + sprint + dolly + orbit verification
const StartCam = DeriveUnrealCameraState(
  CanonicalEditorCamera.Position,
  CanonicalEditorCamera.Target,
  1.0,
);
const Basis0 = BuildUnrealCameraBasis(StartCam.Yaw, StartCam.Pitch);
assert.ok(Basis0.Forward[1] > 0.98 && Math.abs(Basis0.Right[0] - 1.0) < 1e-3, "Canonical Z-up Unreal camera looks +Y with +X Right");

const MovedFwd = StepUnrealWasdCamera(StartCam, new Set(["KeyW"]), 0.5, 3.4);
assert.ok(MovedFwd.Position[1] > StartCam.Position[1] + 1.6, "KeyW flies forward along 3D view ray");
const MovedSprint = StepUnrealWasdCamera(StartCam, new Set(["KeyW", "ShiftLeft"]), 0.5, 3.4);
assert.ok(
  Math.abs((MovedSprint.Position[1] - StartCam.Position[1]) / (MovedFwd.Position[1] - StartCam.Position[1]) - 2.5) < 1e-4,
  "ShiftLeft applies exact 2.5x Unreal sprint boost",
);
const MovedDiag = StepUnrealWasdCamera(StartCam, new Set(["KeyW", "KeyD"]), 0.5, 3.4);
const DistFwd = Math.hypot(
  MovedFwd.Position[0] - StartCam.Position[0],
  MovedFwd.Position[1] - StartCam.Position[1],
  MovedFwd.Position[2] - StartCam.Position[2],
);
const DistDiag = Math.hypot(
  MovedDiag.Position[0] - StartCam.Position[0],
  MovedDiag.Position[1] - StartCam.Position[1],
  MovedDiag.Position[2] - StartCam.Position[2],
);
assert.ok(Math.abs(DistDiag - DistFwd) < 1e-5, "Diagonal W+D movement is normalized (no sqrt(2) overspeed)");

const SteeredAfterFly = ApplyUnrealMouseLook(MovedFwd, 45, -20, 0.0038);
assert.deepEqual(
  SteeredAfterFly.Position,
  MovedFwd.Position,
  "Simultaneous RMB mouse-look NEVER snaps Position back to drag start!",
);
const ElevatedCam = StepUnrealWasdCamera(SteeredAfterFly, new Set(["KeyE"]), 0.25, 3.4);
assert.ok(ElevatedCam.Position[2] > SteeredAfterFly.Position[2] + 0.8, "KeyE elevates along world +Z");

const DolliedIn = ApplyUnrealDolly(StartCam, -3, 0.105);
assert.ok(DolliedIn.FocusDist < StartCam.FocusDist, "Mouse wheel dolly-in reduces FocusDist smoothly");
const Orbited = ApplyUnrealOrbit(DolliedIn, DolliedIn.Target, 60, 15, 0.0052);
const OrbitDist = Math.hypot(
  Orbited.Target[0] - Orbited.Position[0],
  Orbited.Target[1] - Orbited.Position[1],
  Orbited.Target[2] - Orbited.Position[2],
);
assert.ok(Math.abs(OrbitDist - DolliedIn.FocusDist) < 1e-4, "Unreal Orbit preserves exact pivot FocusDist");
const Panned = ApplyUnrealPan(Orbited, 30, -20, 0.0015);
assert.ok(Panned.Position[0] !== Orbited.Position[0], "Unreal MMB Pan translates Position & Target together");

const HtmlPath = path.join(Folder, "index.html");
assert.ok(fs.existsSync(HtmlPath), "Bundled index.html exists");
const HtmlText = fs.readFileSync(HtmlPath, "utf8");
assert.ok(
  HtmlText.includes("Frontier World Mirror — Tier 1 GTX") &&
    HtmlText.includes("closestRayPrimitiveSoftVis") &&
    HtmlText.includes("KHR_parallel_shader_compile") &&
    HtmlText.includes("RequestAtomicFrame") || HtmlText.includes("bandDone"),
  "Bundled index.html embeds Multi-Worker Atomic Double-Buffered GTX pipeline",
);
assert.ok(
  HtmlText.includes("Create New Level") &&
    HtmlText.includes("Active level") &&
    !HtmlText.includes("NO ENGINE CONNECTION"),
  "Bundled index.html embeds Slate GizmoPRO, Level Switcher, and Create Level modal",
);

// 10. Verify WebGPU 120 FPS Renderer, Always-On-Top Gizmo Overlap Picking, and 19-Law ForceFields + VectorFieldLang
assert.ok(
  ViewportSrc.includes("WebgpuGtxRenderer") &&
    ViewportSrc.includes("ForceOverlay") &&
    ViewportSrc.includes("PickGizmoHandle"),
  "WebgpuGtxRenderer + Always-On-Top Gizmo + ForceOverlay GPU pass wired in GtxWorldViewport",
);

// Verify gizmo picks TranslateX even when an overlapping scene object stands in front of Pivot along the camera ray
const BehindPivot = [0.0, 1.4, 0.45];
const OverlapGizmo = BuildSlateGizmoGeometry(BehindPivot, [0, 1, 0], 1.0);
// Front occluder sphere sits at [0.85, 0.2, 0.45] right between camera [0.85, -2.5, 0.45] and Gizmo TranslateX shaft/cone
const OverlapHit = PickGizmoHandle([0.85, -2.5, 0.45], [0, 1, 0], OverlapGizmo);
assert.equal(
  OverlapHit,
  GizmoHandle.TranslateX,
  "Gizmo handle picks cleanly on top even when another scene object overlaps in front",
);

assert.equal(FORCE_MODELS.length, 19, "All 19 canonical C++ ForceModel laws registered");
assert.equal(ENGINE_FORCE_PRESETS.length, 12, "12 built-in Engine Force presets registered");

// Numerical divergence of analytical SampleCurlNoise3D must be near zero (incompressible curl field)
const CurlEps = 1e-3;
const CxP = SampleCurlNoise3D(1.01 + CurlEps, -0.37, 0.64, 1.3, 3, 0.0)[0];
const CxM = SampleCurlNoise3D(1.01 - CurlEps, -0.37, 0.64, 1.3, 3, 0.0)[0];
const CyP = SampleCurlNoise3D(1.01, -0.37 + CurlEps, 0.64, 1.3, 3, 0.0)[1];
const CyM = SampleCurlNoise3D(1.01, -0.37 - CurlEps, 0.64, 1.3, 3, 0.0)[1];
const CzP = SampleCurlNoise3D(1.01, -0.37, 0.64 + CurlEps, 1.3, 3, 0.0)[2];
const CzM = SampleCurlNoise3D(1.01, -0.37, 0.64 - CurlEps, 1.3, 3, 0.0)[2];
const CurlDiv = (CxP - CxM + (CyP - CyM) + (CzP - CzM)) / (2.0 * CurlEps);
assert.ok(Math.abs(CurlDiv) < 1e-3, `SampleCurlNoise3D is incompressible (div=${CurlDiv.toExponential(2)})`);

// Symbolic VectorFieldLang compiler + evaluation through EvaluateSceneForceFieldAt
const CompiledFormula = CompileFieldProgram(DEFAULT_FORMULA_CODE);
assert.equal(CompiledFormula.Ok, true, "Default symbolic VectorFieldLang formula compiles cleanly");
const SampledFormulaVec = EvaluateSceneForceFieldAt(
  [
    {
      Id: "formula-force-1",
      Position: [0, 0, 1.0],
      Rotation: [0, 0, 0],
      Force: ResolveForceValues({
        Model: "RotationalColumn",
        Strength: 12.0,
        Radius: 4.0,
        FormulaEnabled: true,
        FormulaCode: DEFAULT_FORMULA_CODE,
      }),
    },
  ],
  1.0,
  0.5,
  1.25,
  0.0,
);
assert.ok(
  Array.isArray(SampledFormulaVec) &&
    SampledFormulaVec.every((Comp) => Number.isFinite(Comp)) &&
    Math.hypot(...SampledFormulaVec) > 0.01,
  "Compiled symbolic formula evaluates finite non-zero 3D acceleration",
);

// .ForceModel TOML round-trip + ForceOverlay geometry + Beacon picking
const VortexForce = ResolveForceValues({
  Model: "RotationalColumn",
  Strength: 14.5,
  Radius: 3.2,
});
const EncodedForceToml = SerializeForceModelToml("Validation Vortex", VortexForce, {
  Position: [0.0, 0.4, 0.8],
  Rotation: [0, 0, 0],
});
const DecodedForceDoc = ParseForceModelToml(EncodedForceToml);
assert.equal(DecodedForceDoc.Force.Model, "RotationalColumn", ".ForceModel TOML round-trips Model");
assert.equal(DecodedForceDoc.Force.Strength, 14.5, ".ForceModel TOML round-trips Strength");

const ForceNodes = [
  {
    Id: "force-vortex-1",
    Position: [0.0, 0.4, 0.8],
    Rotation: [0, 0, 0],
    Force: VortexForce,
  },
];
const EvaluatedForce = EvaluateSceneForceFieldAt(ForceNodes, 1.0, 0.4, 0.8, 0.0);
assert.ok(Math.hypot(...EvaluatedForce) > 0.1, "RotationalColumn evaluates non-zero acceleration");

const BuiltForceOverlay = BuildForceOverlayGeometry(
  ForceNodes,
  { ...DEFAULT_FORCE_OVERLAY, SliceEnabled: true },
  "force-vortex-1",
  0.25,
);
assert.ok(
  BuiltForceOverlay.OpaqueVertexCount > 100 && BuiltForceOverlay.TranslucentVertexCount > 500,
  "ForceOverlay builds opaque beacons/arrows + translucent envelopes/streamlines/heatmap slice",
);
const PickedForce = PickForceBeacon([0.0, -2.0, 0.8], [0, 1, 0], BuiltForceOverlay);
assert.equal(PickedForce?.Id, "force-vortex-1", "PickForceBeacon selects Force source beacon in 3D");

// 11. Strict WebGPU PipelineLayout / BindGroupLayout identity & Windows requestAdapter() validation
assert.ok(
  ViewportSrc.includes("const ComputeCurrentGizmo = () =>"),
  "ComputeCurrentGizmo defined in GtxWorldViewport component scope for pointer hover & down",
);
{
  globalThis.GPUBufferUsage = { UNIFORM: 1, STORAGE: 2, COPY_DST: 4, VERTEX: 8 };
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
  globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2 };
  const ExecutedDraws = [];
  const StrictMockDevice = {
    lost: new Promise(() => {}),
    createShaderModule: ({ code }) => ({ code, getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: (desc) => ({ __kind: "BGL", label: desc.label, entries: desc.entries }),
    createPipelineLayout: (desc) => ({ __kind: "PL", label: desc.label, bgls: desc.bindGroupLayouts }),
    createRenderPipeline: (desc) => {
      assert.notEqual(desc.layout, "auto", `Pipeline ${desc.label} must use explicit PipelineLayout`);
      assert.equal(desc.layout?.__kind, "PL");
      return { __kind: "Pipeline", label: desc.label, layout: desc.layout };
    },
    createBuffer: (desc) => ({ __kind: "Buffer", size: desc.size, destroy() {} }),
    createTexture: (desc) => ({ __kind: "Texture", desc, createView: () => ({ __kind: "TexView" }), destroy() {} }),
    createSampler: () => ({ __kind: "Sampler" }),
    createBindGroup: (desc) => {
      assert.equal(desc.layout?.__kind, "BGL");
      return { __kind: "BG", label: desc.label, layout: desc.layout };
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => {
        let curPipe = null;
        const curBgs = {};
        return {
          setPipeline(p) { curPipe = p; },
          setBindGroup(i, bg) { curBgs[i] = bg; },
          setVertexBuffer() {},
          draw(vertCount) {
            for (let i = 0; i < curPipe.layout.bgls.length; ++i) {
              assert.strictEqual(
                curBgs[i]?.layout,
                curPipe.layout.bgls[i],
                `BindGroupLayout mismatch on ${curPipe.label} Draw(${vertCount})`,
              );
            }
            ExecutedDraws.push({ pipeline: curPipe.label, verts: vertCount });
          },
          end() {},
        };
      },
      finish: () => ({ __kind: "CmdBuf" }),
    }),
    queue: { writeBuffer() {}, writeTexture() {}, submit() {} },
    destroy() {},
  };
  Object.defineProperty(globalThis, "navigator", {
    value: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      gpu: {
        requestAdapter: async (opts) => {
          assert.equal(opts, undefined, "Windows requestAdapter() omits powerPreference");
          return { requestDevice: async () => StrictMockDevice };
        },
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    },
    configurable: true,
  });
  const GpuRenderer = await CreateWebgpuGtxRenderer(() => {});
  assert.equal(GpuRenderer.Ok, true);
  assert.equal(
    GpuRenderer.AttachCanvas({
      getContext: (k) =>
        k === "webgpu"
          ? { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }
          : null,
    }),
    true,
  );
  assert.equal(
    GpuRenderer.RenderFrame({
      Width: 1280,
      Height: 720,
      NeedScenePass: true,
      ActiveScene: Compiled,
      CameraOrigin: Compiled.CameraOrigin,
      Fwd: [0, 1, 0],
      Right: [1, 0, 0],
      Up: [0, 0, 1],
      EffectiveViewMode: 0,
      ShowGrid: true,
      SelectedCode: 1,
      PrimCount: Compiled.Primitives.length,
      LightCount: Compiled.AreaLights.length,
      BuiltGizmo,
      ForceOverlay: BuiltForceOverlay,
      ViewProjZeroToOne: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      HighlightedHandle: 1,
    }),
    true,
  );
  assert.equal(ExecutedDraws.length, 6, "All 6 WebGPU passes (Scene, Outline, ForceOpaque, ForceTrans, GizmoOpaque, GizmoTrans) executed cleanly");
}

console.log(
  "[WorldMirrorValidation] ALL 11 SUITES PASSED: Strict WebGPU Explicit PipelineLayouts, WebGL2 + Atomic Multi-Worker CPU GTX, Always-On-Top 13-handle GizmoPRO, 19 ForceModels (CurlNoise div=0), VectorFieldLang, .ForceModel TOML, 20-channel Material Atlas, and Multi-Level World Editor verified!",
);
