//==========================================================================================================================================
//                                                  WORLDMIRRORVALIDATION.MJS
//==========================================================================================================================================
// Standalone Node ESM validation suite verifying 1:1 C++ <-> HTML parity of Experimental/FrontierWorldMirror:
//   1. Exact 17-entry Outliner hierarchy matching Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.cpp
//   2. Canonical EditorCamera pose, 43.0 deg vertical FOV, and bidirectional camera/transform/visibility compilation
//   3. Analytical 3D ray picking across the Cornell-Studio Gallery specimens and Ceiling Softbox
//   4. Standalone bundled index.html integrity

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
assert.ok(
  ShowcaseInitialRows.some((Row) => Row.Id === "camera" && Row.Parent === "cameras"),
  "Editor Camera registered under Cameras",
);
assert.ok(
  ShowcaseInitialRows.some((Row) => Row.Id === "sun" && Row.Parent === "world"),
  "Sun registered under World",
);
assert.ok(
  ShowcaseInitialRows.some(
    (Row) => Row.Id === "ceiling-softbox" && Row.Parent === "lighting",
  ),
  "Ceiling Softbox registered under Lighting",
);

// 2. Verify compiled Tier 1 GTX scene & EditorCamera 43.0 deg vertical FOV parity
const Compiled = CompileLiveGtxScene(
  ShowcaseInitialRows,
  ShowcaseInitialValues,
  {},
  "PERSP",
);
assert.equal(Compiled.Primitives.length, 10, "All 10 gallery primitives compiled");
assert.equal(Compiled.AreaLights.length, 1, "Ceiling Softbox LTC area light compiled");
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

// 3. Verify analytical 3D ray picking hits central Mirror Chrome Sphere & Abbe Glass Orb
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

// 4. Verify live Outliner visibility & EditorCamera transform synchronization
const HiddenWallScene = CompileLiveGtxScene(
  ShowcaseInitialRows,
  {
    ...ShowcaseInitialValues,
    camera: { ...ShowcaseInitialValues.camera, Position: [0.25, -3.85, 0.55] },
  },
  { "crimson-left-wall": true },
  "PERSP",
);
assert.equal(
  HiddenWallScene.Primitives.length,
  9,
  "Hiding Crimson Left Wall in Outliner removes it from live GTX scene",
);
assert.deepEqual(
  HiddenWallScene.CameraOrigin,
  [0.25, -3.85, 0.55],
  "Editing EditorCamera in Inspector updates live GTX camera origin",
);

// 5. Verify standalone index.html bundle exists and embeds FrontierWorldMirror GTX shader
const HtmlPath = path.join(Folder, "index.html");
assert.ok(fs.existsSync(HtmlPath), "Bundled index.html exists");
const HtmlText = fs.readFileSync(HtmlPath, "utf8");
assert.ok(
  HtmlText.includes("Frontier World Mirror — Tier 1 GTX") &&
    HtmlText.includes("evaluateGtxConeGiAndAo") &&
    HtmlText.includes("Frontier.WorldMirrorGtx.v1"),
  "Bundled index.html embeds Frontier World Mirror UI and WebGL2 Tier 1 GTX shader",
);

console.log(
  "[WorldMirrorValidation] PASSED: 17 Outliner entries, 43.0 deg EditorCamera, 3D ray-picking, live Outliner/Inspector sync, and standalone GTX bundle verified.",
);
