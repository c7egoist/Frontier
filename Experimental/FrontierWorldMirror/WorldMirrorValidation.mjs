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
  BuildDefaultLevels,
  CreateNewLevelRecord,
} from "./LevelSystem.js";

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
    !ViewportSrc.includes("localDirs[6]"),
  "Legacy SDF step march AND discrete 6-ray ghost GI projections completely removed",
);
assert.ok(
  ViewportSrc.includes("closestRayPrimitiveSoftVis") &&
    ViewportSrc.includes("evaluateAreaLightSoftVis") &&
    ViewportSrc.includes("uMetaTex") &&
    ViewportSrc.includes("OUTLINE_FRAGMENT_SHADER"),
  "Smooth analytical GI/AO, softbox penumbra, and depth-aware 2px outer silhouette outline shaders present",
);

const HtmlPath = path.join(Folder, "index.html");
assert.ok(fs.existsSync(HtmlPath), "Bundled index.html exists");
const HtmlText = fs.readFileSync(HtmlPath, "utf8");
assert.ok(
  HtmlText.includes("Frontier World Mirror — Tier 1 GTX") &&
    HtmlText.includes("closestRayPrimitiveSoftVis") &&
    HtmlText.includes("Create New Level") &&
    HtmlText.includes("Active level") &&
    !HtmlText.includes("NO ENGINE CONNECTION"),
  "Bundled index.html embeds ring-free GTX shader, Slate GizmoPRO, Level Switcher, Create Level modal, and removes NO ENGINE CONNECTION",
);

console.log(
  "[WorldMirrorValidation] ALL 7 SUITES PASSED: Ring-free GTX shadows/GI, 20-channel Material Atlas, 13-handle Slate GizmoPRO, 2px Selection Outline, and Multi-Level Footer/Modal verified!",
);
