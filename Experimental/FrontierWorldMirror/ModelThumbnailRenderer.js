//==========================================================================================================================================
//                                                MODELTHUMBNAILRENDERER.JS
//==========================================================================================================================================
// Miniature 3D Analytical OpenPBR Studio Thumbnail Raytracer for Traffic Cone, Cylinder Cone & Analytical Shapes
//   Renders genuine raytraced 3-point studio thumbnails (20-channel OpenPBR MaterialAtlas + soft contact shadow + studio cyclorama floor)
//   for Asset Browser ("Models"), Construct ("Geometry"), and Viewport Quick-Place Chips, cached by shape + material signature.

import { CpuGtxRenderer } from "./CpuGtxFallbackRenderer.js";
import { MaterialAtlasSynchronizer } from "./MaterialAtlasCompiler.js";
import { BuildMaterialRecord, CompileLiveGtxScene } from "./ShowcaseGalleryScene.js";
import {
  BuildCylinderConeMaterial,
  BuildNeutralPrimitiveMaterial,
  BuildTrafficConeMaterial,
  WORLD_PLACEABLE_MODELS,
} from "./WorldDragDrop.js";

const ThumbnailUrlCache = new Map();
const ThumbnailRgbaCache = new Map();

let SharedThumbAtlas = null;
let SharedThumbTracer = null;

function ResolveDefaultThumbMaterial(Shape) {
  if (Shape === "cone") return BuildTrafficConeMaterial();
  if (Shape === "cylinder-cone") return BuildCylinderConeMaterial();
  const Spec = WORLD_PLACEABLE_MODELS.find((M) => M.PrimitiveShape === Shape);
  if (Spec && typeof Spec.BuildMaterial === "function") return Spec.BuildMaterial();
  return BuildNeutralPrimitiveMaterial("#d4d0c8", 0.32, 0.0);
}

function ResolveDefaultThumbScale(Shape) {
  if (Shape === "cone") return [0.62, 0.62, 0.96];
  if (Shape === "cylinder-cone") return [0.52, 0.52, 1.02];
  if (Shape === "torus") return [0.88, 0.88, 0.30];
  if (Shape === "cylinder") return [0.68, 0.68, 0.88];
  if (Shape === "sphere") return [0.82, 0.82, 0.82];
  return [0.74, 0.74, 0.74];
}

function ComputeMaterialHashKey(Shape, Scale, Material) {
  const S = Array.isArray(Scale) ? Scale.join(",") : "default";
  const Ch = Material?.Channels || {};
  const ColCh = Ch.colour || {};
  const StopsKey = Array.isArray(ColCh.Stops)
    ? ColCh.Stops.map((St) => `${St.Position}:${St.Value}`).join("|")
    : "";
  return `${Shape}|${S}|${Material?.Type || "Standard"}|${ColCh.Source || "Fill"}|${ColCh.Fill || ""}|${StopsKey}|${Ch.metallic?.Fill ?? 0}|${Ch.roughness?.Fill ?? 0.34}`;
}

// Pure-JS / Node-safe RGBA buffer render (used by both browser canvas DataURL encoder and headless validation tests)
export function RenderAnalyticalThumbnailRgba({
  Shape = "cone",
  Scale = null,
  Material = null,
  Width = 96,
  Height = 96,
} = {}) {
  const ResolvedMat = Material || ResolveDefaultThumbMaterial(Shape);
  const ResolvedScale = Array.isArray(Scale) ? Scale : ResolveDefaultThumbScale(Shape);
  const CacheKey = `${Width}x${Height}|` + ComputeMaterialHashKey(Shape, ResolvedScale, ResolvedMat);

  if (ThumbnailRgbaCache.has(CacheKey)) {
    return ThumbnailRgbaCache.get(CacheKey);
  }

  if (!SharedThumbAtlas) SharedThumbAtlas = new MaterialAtlasSynchronizer();
  if (!SharedThumbTracer) SharedThumbTracer = new CpuGtxRenderer();

  const HalfZ = Math.max(0.12, Math.abs(Number(ResolvedScale[2]) || 0.8) * 0.5);
  const FloorTopZ = -HalfZ;
  const ObjCenterZ = 0.0;

  // Tilt torus slightly toward the studio camera so its ring hole & specular highlight read clearly
  const ObjRotation =
    Shape === "torus"
      ? [28, -16, 12]
      : Shape === "box"
        ? [0, 0, 32]
        : [0, 0, 0];

  const ThumbRows = [
    {
      Id: "thumb-floor",
      Name: "Studio Plinth",
      Panel: "geometry",
      PrimitiveShape: "box",
      Preview: true,
    },
    {
      Id: "thumb-hero",
      Name: "Thumbnail Specimen",
      Panel: "geometry",
      PrimitiveShape: Shape,
      Preview: true,
    },
    { Id: "camera", Name: "Thumb Camera", Panel: "camera" },
    { Id: "post", Name: "Thumb Post", Panel: "post" },
    { Id: "sun", Name: "Thumb Key", Panel: "sun", Preview: true },
    { Id: "key-light", Name: "Thumb Softbox", Panel: "light", Preview: true },
  ];

  const ThumbValues = {
    "thumb-floor": {
      Position: [0, 0, FloorTopZ - 0.08],
      Rotation: [0, 0, 0],
      Scale: [5.2, 5.2, 0.16],
      "Cast shadows": true,
      GI: true,
      ...BuildMaterialRecord({
        Type: "Standard",
        BaseLinear: [0.055, 0.058, 0.066],
        Roughness: 0.42,
      }),
    },
    "thumb-hero": {
      Position: [0, 0, ObjCenterZ],
      Rotation: ObjRotation,
      Scale: ResolvedScale,
      "Cast shadows": true,
      GI: true,
      Material: ResolvedMat,
    },
    camera: {
      Position: [-0.92, -1.48, 0.56],
      Target: [0.0, 0.0, -0.04],
      "Focal Length": 42,
      "Sensor Width": 36,
    },
    post: { Exposure: 0.22 },
    sun: {
      Direction: [-0.52, -0.58, 0.63],
      Irradiance: [4.6, 4.35, 3.95],
      "Angular Radius": 0.018,
      "Sky Radiance": [0.24, 0.28, 0.36],
    },
    "key-light": {
      Position: [0.45, -0.55, 1.65],
      Intensity: 8.4,
      Width: 1.8,
      Height: 1.4,
      EmittedRadiance: [8.4, 8.0, 7.4],
    },
  };

  const Compiled = CompileLiveGtxScene(ThumbRows, ThumbValues, {}, "PERSP");
  SharedThumbAtlas.InvalidateAll();
  SharedThumbAtlas.UpdatePrimitives(Compiled.Primitives);

  SharedThumbTracer.Invalidate();
  SharedThumbTracer.RenderSlice(
    {
      CompiledScene: Compiled,
      AtlasPixels: SharedThumbAtlas.Pixels,
      Width,
      Height,
      ViewModeCode: 0,
      ShowGrid: 0,
    },
    Height,
  );

  const Pixels = new Uint8ClampedArray(SharedThumbTracer.OffscreenImg.data);
  const Result = { Width, Height, Pixels };
  ThumbnailRgbaCache.set(CacheKey, Result);
  return Result;
}

export function RenderAnalyticalThumbnailDataUrl({
  Shape = "cone",
  Scale = null,
  Material = null,
  Size = 96,
} = {}) {
  const ResolvedMat = Material || ResolveDefaultThumbMaterial(Shape);
  const ResolvedScale = Array.isArray(Scale) ? Scale : ResolveDefaultThumbScale(Shape);
  const UrlKey = `${Size}|` + ComputeMaterialHashKey(Shape, ResolvedScale, ResolvedMat);

  if (ThumbnailUrlCache.has(UrlKey)) {
    return ThumbnailUrlCache.get(UrlKey);
  }

  if (typeof document === "undefined") return "";

  const SrcCanvas = document.createElement("canvas");
  const SrcCtx = SrcCanvas.getContext("2d");
  if (!SrcCtx) {
    ThumbnailUrlCache.set(UrlKey, "");
    return "";
  }

  // Render at 1.5x internal resolution and downsample onto target canvas for crisp anti-aliased silhouettes
  const SuperSize = Math.min(144, Math.max(64, Math.round(Size * 1.5)));
  SrcCanvas.width = SuperSize;
  SrcCanvas.height = SuperSize;

  const Raw = RenderAnalyticalThumbnailRgba({
    Shape,
    Scale: ResolvedScale,
    Material: ResolvedMat,
    Width: SuperSize,
    Height: SuperSize,
  });

  const ImgData = SrcCtx.createImageData(SuperSize, SuperSize);
  ImgData.data.set(Raw.Pixels);
  SrcCtx.putImageData(ImgData, 0, 0);

  const DstCanvas = document.createElement("canvas");
  DstCanvas.width = Size;
  DstCanvas.height = Size;
  const DstCtx = DstCanvas.getContext("2d");
  if (!DstCtx) {
    const FallbackUrl = SrcCanvas.toDataURL("image/png");
    ThumbnailUrlCache.set(UrlKey, FallbackUrl);
    return FallbackUrl;
  }
  DstCtx.imageSmoothingEnabled = true;
  DstCtx.imageSmoothingQuality = "high";
  DstCtx.drawImage(SrcCanvas, 0, 0, Size, Size);

  const DataUrl = DstCanvas.toDataURL("image/png");
  ThumbnailUrlCache.set(UrlKey, DataUrl);
  return DataUrl;
}
