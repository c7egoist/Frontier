/*==========================================================================================================================================
                                                          ARTWORKSTACKENGINE.JS
==========================================================================================================================================*/
/* Unified non-destructive Layer-Stack + Modifier-Stack authoring and multi-channel PBR evaluator for Pattern Studio & Stamp Studio. */

import { evaluateTileNoise } from "../NoiseField.js";

export const ARTWORK_SIZE = 512;

export const ARTWORK_FINISHES = {
  ink: { name: "Printed Dye", roughness: 0.62, metalness: 0.0, height: 0.02 },
  cotton: { name: "Woven Cotton", roughness: 0.84, metalness: 0.0, height: 0.14 },
  wool: { name: "Cut-Pile Wool", roughness: 0.94, metalness: 0.0, height: 0.55 },
  ceramic: { name: "Glazed Ceramic", roughness: 0.18, metalness: 0.0, height: 0.24 },
  foil: { name: "Metal Inlay", roughness: 0.24, metalness: 1.0, height: 0.10 },
  rubber: { name: "Embossed Rubber", roughness: 0.78, metalness: 0.0, height: 0.36 },
};

export const MOTIF_TYPES = [
  { id: "circle", label: "Circle" },
  { id: "ring", label: "Ring" },
  { id: "square", label: "Square" },
  { id: "roundedRect", label: "Rounded Box" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
  { id: "triangle", label: "Triangle" },
  { id: "star", label: "Star" },
  { id: "cross", label: "Cross" },
  { id: "chevron", label: "Chevron" },
  { id: "stripe", label: "Stripe / Bar" },
  { id: "arc", label: "Arc" },
  { id: "teardrop", label: "Teardrop" },
  { id: "leaf", label: "Botanical Leaf" },
  { id: "flower", label: "5-Petal Flower" },
  { id: "gear", label: "Cog / Gear" },
  { id: "line", label: "Line / Stroke" },
  { id: "svg-path", label: "Vector Path" },
];

export const MODIFIER_DEFINITIONS = [
  { type: "noise-scale", label: "Noise Scale", badge: "NOISE", description: "Modulates instance scale, opacity, or color smoothly using coherent seamless noise." },
  { type: "array-grid", label: "Grid / Hex Array", badge: "ARRAY", description: "Repeats the motif into Grid, Brick, Half-Drop, or Hexagonal lattices." },
  { type: "array-radial", label: "Radial Array", badge: "RADIAL", description: "Distributes copies in concentric rings or mandala petals around a pivot." },
  { type: "mirror", label: "Mirror Symmetry", badge: "MIRROR", description: "Reflects instances cleanly across X, Y, Quad, or Diagonal axes." },
  { type: "inset-echo", label: "Inset / Echo", badge: "ECHO", description: "Creates nested concentric inner/outer rings with color and relief stepping." },
  { type: "noise-jitter", label: "Scatter & Dropout", badge: "SCATTER", description: "Deterministic random offset, rotation, scale jitter, and organic thinning." },
  { type: "warp", label: "Domain Warp", badge: "WARP", description: "Non-destructive wave, swirl, or curl distortion across motif positions." },
  { type: "edge-wear", label: "Bevel & Edge Wear", badge: "WEAR", description: "Adds contour stroke, bevel height boost, and distressed noise chipping." },
];

let uidSeq = 1;
export function nextArtworkId(prefix = "layer") {
  return `${prefix}-${Date.now().toString(36)}-${(uidSeq++).toString(36)}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex || "#ffffff"));
  if (!m) return [255, 255, 255];
  return [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ];
}

function lerpHex(hexA, hexB, t) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const u = clamp(t, 0, 1);
  const r = Math.round(r1 + (r2 - r1) * u);
  const g = Math.round(g1 + (g2 - g1) * u);
  const b = Math.round(b1 + (b2 - b1) * u);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function detHash(a, b, seed) {
  let h = (a * 374761393 + b * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createDefaultModifier(type = "noise-scale") {
  const id = nextArtworkId("mod");
  switch (type) {
    case "noise-scale":
      return {
        id,
        type,
        enabled: true,
        noiseType: "fbm",
        target: "scale-color", // "uniform" | "width" | "height" | "scale-opacity" | "scale-color"
        minScale: 0.25,
        maxScale: 1.85,
        frequency: 3,
        octaves: 3,
        seed: 1337,
        contrast: 1.15,
        bias: 0.0,
        curve: "smoothstep",
        invert: false,
        stretchX: 1,
        stretchY: 1,
        offsetX: 0,
        offsetY: 0,
        seamless: true,
        colorB: "#7aa6d9",
        dropoutThreshold: 0.0,
      };
    case "array-grid":
      return {
        id,
        type,
        enabled: true,
        layout: "hex", // "grid" | "brick" | "half-drop" | "hex"
        columns: 8,
        rows: 8,
        spanX: 512,
        spanY: 512,
        center: true,
        alternateColor: false,
        colorB: "#5a7c8c",
        alternateRotate: 0,
      };
    case "array-radial":
      return {
        id,
        type,
        enabled: true,
        count: 8,
        radius: 130,
        rings: 1,
        ringStep: 56,
        startAngle: 0,
        sweep: 360,
        alignTangent: true,
        scaleDecay: 0.85,
      };
    case "mirror":
      return {
        id,
        type,
        enabled: true,
        axis: "xy", // "x" | "y" | "xy" | "diag"
        pivotX: 256,
        pivotY: 256,
      };
    case "inset-echo":
      return {
        id,
        type,
        enabled: true,
        copies: 4,
        stepPx: 26,
        alternateColor: true,
        colorB: "#1e2228",
        opacityDecay: 0.12,
        heightDecay: 0.15,
      };
    case "noise-jitter":
      return {
        id,
        type,
        enabled: true,
        posJitter: 12,
        rotJitter: 35,
        scaleJitter: 0.2,
        dropout: 0.0,
        seed: 404,
      };
    case "warp":
      return {
        id,
        type,
        enabled: true,
        warpType: "wave", // "wave" | "swirl" | "curl" | "pinch"
        amplitude: 22,
        frequency: 2,
        seed: 901,
      };
    case "edge-wear":
      return {
        id,
        type,
        enabled: true,
        outlineWidth: 0,
        outlineColor: "#141619",
        chipAmount: 0.38,
        chipScale: 10,
        bevelHeight: 0.25,
        seed: 707,
      };
    default:
      return createDefaultModifier("noise-scale");
  }
}

export function createArtworkLayer(kind = "motif", overrides = {}) {
  const id = overrides.id || nextArtworkId("lyr");
  const isFolder = kind === "folder";
  return {
    id,
    name: overrides.name || (isFolder ? "Layer Group" : kind === "text" ? "Typography" : kind === "gradient" ? "Gradient Wash" : kind === "image" ? "Image / SVG" : "Motif Shape"),
    kind,
    parentId: overrides.parentId || null,
    visible: overrides.visible !== false,
    locked: overrides.locked === true,
    blend: overrides.blend || "Normal",
    opacity: clamp(overrides.opacity ?? 1, 0, 1),
    transform: {
      x: 256,
      y: 256,
      width: 64,
      height: 64,
      rotation: 0,
      ...(overrides.transform || {}),
    },
    shape: {
      motifType: "circle",
      sides: 6,
      points: 5,
      innerRatio: 0.46,
      cornerRadius: 0.18,
      strokeWidth: 0,
      fillEnabled: true,
      fillRule: "evenodd",
      flipX: false,
      flipY: false,
      fillMode: "solid", // "solid" | "linear" | "radial"
      color: "#e8c27a",
      colorB: "#5a7692",
      gradientAngle: 45,
      strokeColor: "#16181c",
      svgPath: "",
      ...(overrides.shape || {}),
    },
    text: {
      value: "FRONTIER",
      fontFamily: "DM Sans",
      fontWeight: 600,
      fontSize: 64,
      letterSpacing: 4,
      align: "center",
      ...(overrides.text || {}),
    },
    media: {
      svgMarkup: "",
      imageUrl: "",
      ...(overrides.media || {}),
    },
    surface: {
      finish: "ink",
      roughness: 0.55,
      metalness: 0.0,
      height: 0.18,
      enableAlbedo: true,
      enableRoughness: true,
      enableMetalness: true,
      enableHeight: true,
      ...(overrides.surface || {}),
    },
    mask: {
      enabled: false,
      invert: false,
      mode: "noise", // "noise" | "radial" | "stripe"
      frequency: 4,
      threshold: 0.45,
      softness: 0.25,
      seed: 211,
      ...(overrides.mask || {}),
    },
    modifiers: Array.isArray(overrides.modifiers)
      ? overrides.modifiers.map((m) => structuredClone(m))
      : [],
  };
}

export function createArtworkDocument(mode = "pattern") {
  if (mode === "stamp") {
    return {
      schema: "frontier.artwork.v2",
      mode: "stamp",
      name: "Industrial Warning Seal",
      size: ARTWORK_SIZE,
      background: { enabled: false, color: "#1d2024", opacity: 0, finish: "ink", roughness: 0.8, metalness: 0, height: 0 },
      tiling: { mode: "straight", repeats: 1, showGrid: false },
      layers: [
        createArtworkLayer("motif", {
          name: "Outer Octagon Ring",
          transform: { x: 256, y: 256, width: 380, height: 380, rotation: 0 },
          shape: { motifType: "hexagon", color: "#e8c27a", fillMode: "solid", strokeWidth: 0 },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.85, height: 0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 2, stepPx: 44, alternateColor: true, colorB: "#181b1f" },
            { ...createDefaultModifier("edge-wear"), chipAmount: 0.32, chipScale: 12, bevelHeight: 0.22 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Perimeter Rivets",
          transform: { x: 256, y: 256, width: 18, height: 18, rotation: 0 },
          shape: { motifType: "circle", color: "#cfd6df" },
          surface: { finish: "foil", roughness: 0.22, metalness: 1.0, height: 0.52, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 12, radius: 158, rings: 1, alignTangent: true },
          ],
        }),
        createArtworkLayer("text", {
          name: "Stencil Mark",
          transform: { x: 256, y: 256, width: 260, height: 90, rotation: 0 },
          text: { value: "UNIT 04", fontFamily: "DM Sans", fontWeight: 600, fontSize: 54, letterSpacing: 6, align: "center" },
          shape: { color: "#eff4cf" },
          surface: { finish: "ink", roughness: 0.45, metalness: 0.1, height: 0.24, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("edge-wear"), chipAmount: 0.22, chipScale: 14, bevelHeight: 0.15 },
          ],
        }),
      ],
    };
  }

  return {
    schema: "frontier.artwork.v2",
    mode: "pattern",
    name: "Noise-Scaled Hex Matrix",
    size: ARTWORK_SIZE,
    background: { enabled: true, color: "#171a1f", opacity: 1, finish: "cotton", roughness: 0.85, metalness: 0.0, height: 0.0 },
    tiling: { mode: "straight", repeats: 2, showGrid: false },
    layers: [
      createArtworkLayer("motif", {
        name: "Noise-Scaled Dots",
        transform: { x: 256, y: 256, width: 42, height: 42, rotation: 0 },
        shape: { motifType: "hexagon", color: "#e8c27a", colorB: "#7cb4d8" },
        surface: { finish: "ceramic", roughness: 0.24, metalness: 0.15, height: 0.36, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        modifiers: [
          { ...createDefaultModifier("array-grid"), layout: "hex", columns: 10, rows: 10, spanX: 512, spanY: 512, center: true },
          { ...createDefaultModifier("noise-scale"), noiseType: "fbm", target: "scale-color", minScale: 0.22, maxScale: 1.55, frequency: 3, octaves: 3, colorB: "#76b2d8", seamless: true },
        ],
      }),
      createArtworkLayer("motif", {
        name: "Fine Accent Rings",
        transform: { x: 256, y: 256, width: 16, height: 16, rotation: 0 },
        shape: { motifType: "ring", color: "#eff4cf" },
        surface: { finish: "foil", roughness: 0.26, metalness: 0.92, height: 0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        opacity: 0.72,
        modifiers: [
          { ...createDefaultModifier("array-grid"), layout: "grid", columns: 5, rows: 5, spanX: 512, spanY: 512, center: true },
          { ...createDefaultModifier("noise-scale"), noiseType: "worley", target: "scale-opacity", minScale: 0.4, maxScale: 1.6, frequency: 2, seamless: true },
        ],
      }),
    ],
  };
}

/**
 * Evaluate a single layer's non-destructive modifier stack into concrete draw instances.
 * Each instance tracks { x, y, width, height, rotation, color, colorB, fillMode, gradientAngle, opacity, heightValue, roughness, metalness, outlineWidth, outlineColor, chipAmount, chipScale, seed, motifType, innerRatio, cornerRadius, sides, points, strokeWidth, strokeColor, svgPath, text }.
 */
export function evaluateLayerInstances(layer, docSize = ARTWORK_SIZE, mode = "pattern") {
  const seamless = mode === "pattern";
  const baseInstance = {
    x: layer.transform.x,
    y: layer.transform.y,
    width: layer.transform.width,
    height: layer.transform.height,
    rotation: layer.transform.rotation || 0,
    color: layer.shape.color || "#e8c27a",
    colorB: layer.shape.colorB || "#5a7692",
    fillMode: layer.shape.fillMode || "solid",
    gradientAngle: layer.shape.gradientAngle ?? 45,
    opacity: 1,
    heightValue: layer.surface.height ?? 0.2,
    roughness: layer.surface.roughness ?? 0.5,
    metalness: layer.surface.metalness ?? 0.0,
    outlineWidth: layer.shape.strokeWidth || 0,
    outlineColor: layer.shape.strokeColor || "#16181c",
    fillEnabled: layer.shape.fillEnabled !== false,
    fillRule: layer.shape.fillRule || "evenodd",
    flipX: !!layer.shape.flipX,
    flipY: !!layer.shape.flipY,
    chipAmount: 0,
    chipScale: 10,
    chipSeed: 707,
    motifType: layer.shape.motifType || "circle",
    sides: layer.shape.sides || 6,
    points: layer.shape.points || 5,
    innerRatio: layer.shape.innerRatio ?? 0.46,
    cornerRadius: layer.shape.cornerRadius ?? 0.18,
    svgPath: layer.shape.svgPath || "",
    text: layer.kind === "text" ? { ...layer.text } : null,
  };

  let instances = [baseInstance];
  const modifiers = layer.modifiers || [];

  for (const mod of modifiers) {
    if (!mod || mod.enabled === false) continue;

    if (mod.type === "array-grid") {
      const cols = Math.max(1, Math.min(28, Math.round(mod.columns || 6)));
      const rows = Math.max(1, Math.min(28, Math.round(mod.rows || 6)));
      const spanX = Number(mod.spanX ?? docSize);
      const spanY = Number(mod.spanY ?? docSize);
      const stepX = spanX / cols;
      const stepY = spanY / rows;
      const layout = mod.layout || "grid";
      const next = [];
      for (const inst of instances) {
        const originX = mod.center !== false ? (docSize - spanX) * 0.5 + stepX * 0.5 : inst.x;
        const originY = mod.center !== false ? (docSize - spanY) * 0.5 + stepY * 0.5 : inst.y;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            let px = originX + c * stepX;
            let py = originY + r * stepY;
            if (layout === "brick" || layout === "hex") {
              if (r % 2 === 1) px += stepX * 0.5;
            } else if (layout === "half-drop") {
              if (c % 2 === 1) py += stepY * 0.5;
            }
            if (seamless) {
              px = ((px % docSize) + docSize) % docSize;
              py = ((py % docSize) + docSize) % docSize;
            }
            const alt = (r + c) % 2 === 1;
            next.push({
              ...inst,
              x: px,
              y: py,
              color: mod.alternateColor && alt ? (mod.colorB || inst.color) : inst.color,
              rotation: inst.rotation + (mod.alternateRotate && alt ? Number(mod.alternateRotate) : 0),
            });
          }
        }
      }
      instances = next;
    } else if (mod.type === "array-radial") {
      const count = Math.max(2, Math.min(48, Math.round(mod.count || 8)));
      const rings = Math.max(1, Math.min(6, Math.round(mod.rings || 1)));
      const baseR = Number(mod.radius ?? 120);
      const ringStep = Number(mod.ringStep ?? 48);
      const startDeg = Number(mod.startAngle ?? 0);
      const sweepDeg = Number(mod.sweep ?? 360);
      const decay = Number(mod.scaleDecay ?? 0.9);
      const next = [];
      for (const inst of instances) {
        for (let ring = 0; ring < rings; ring++) {
          const r = baseR + ring * ringStep;
          const rScale = Math.pow(decay, ring);
          const denom = sweepDeg >= 359.5 ? count : Math.max(1, count - 1);
          for (let k = 0; k < count; k++) {
            const angDeg = startDeg + (sweepDeg * k) / denom;
            const rad = (angDeg * Math.PI) / 180;
            next.push({
              ...inst,
              x: inst.x + Math.cos(rad) * r,
              y: inst.y + Math.sin(rad) * r,
              width: inst.width * rScale,
              height: inst.height * rScale,
              rotation: inst.rotation + (mod.alignTangent !== false ? angDeg + 90 : 0),
            });
          }
        }
      }
      instances = next;
    } else if (mod.type === "mirror") {
      const axis = mod.axis || "xy";
      const px = Number(mod.pivotX ?? docSize * 0.5);
      const py = Number(mod.pivotY ?? docSize * 0.5);
      const next = [];
      for (const inst of instances) {
        next.push(inst);
        if (axis === "x" || axis === "xy") {
          next.push({ ...inst, x: 2 * px - inst.x, rotation: -inst.rotation });
        }
        if (axis === "y" || axis === "xy") {
          next.push({ ...inst, y: 2 * py - inst.y, rotation: -inst.rotation });
        }
        if (axis === "xy") {
          next.push({ ...inst, x: 2 * px - inst.x, y: 2 * py - inst.y, rotation: inst.rotation + 180 });
        }
        if (axis === "diag") {
          const dx = inst.x - px;
          const dy = inst.y - py;
          next.push({ ...inst, x: px + dy, y: py + dx, rotation: 90 - inst.rotation });
        }
      }
      instances = next;
    } else if (mod.type === "inset-echo") {
      const copies = Math.max(2, Math.min(16, Math.round(mod.copies || 4)));
      const step = Number(mod.stepPx ?? 24);
      const opDecay = clamp(Number(mod.opacityDecay ?? 0.1), 0, 0.9);
      const hDecay = clamp(Number(mod.heightDecay ?? 0.12), 0, 0.9);
      const next = [];
      for (const inst of instances) {
        for (let i = 0; i < copies; i++) {
          const w = Math.max(2, inst.width - step * i);
          const h = Math.max(2, inst.height - step * i);
          next.push({
            ...inst,
            width: w,
            height: h,
            color: mod.alternateColor && i % 2 === 1 ? (mod.colorB || "#1d2025") : inst.color,
            opacity: clamp(inst.opacity * Math.pow(1 - opDecay, i), 0.05, 1),
            heightValue: clamp(inst.heightValue * Math.pow(1 - hDecay, i), -1, 1),
          });
        }
      }
      instances = next;
    } else if (mod.type === "noise-scale") {
      const minS = Number(mod.minScale ?? 0.25);
      const maxS = Number(mod.maxScale ?? 1.85);
      const target = mod.target || "uniform";
      const dropThresh = clamp(Number(mod.dropoutThreshold ?? 0), 0, 0.95);
      const next = [];
      for (const inst of instances) {
        const u = ((inst.x / docSize) % 1 + 1) % 1;
        const v = ((inst.y / docSize) % 1 + 1) % 1;
        const n = evaluateTileNoise(u, v, {
          noiseType: mod.noiseType || "fbm",
          frequency: mod.frequency ?? 3,
          octaves: mod.octaves ?? 3,
          seed: mod.seed ?? 1337,
          contrast: mod.contrast ?? 1.0,
          bias: mod.bias ?? 0.0,
          curve: mod.curve || "smoothstep",
          invert: !!mod.invert,
          stretchX: mod.stretchX ?? 1,
          stretchY: mod.stretchY ?? 1,
          offsetX: mod.offsetX ?? 0,
          offsetY: mod.offsetY ?? 0,
          seamless: mod.seamless !== false && seamless,
        });
        if (dropThresh > 0 && n < dropThresh) continue;
        const factor = minS + (maxS - minS) * n;
        const out = { ...inst };
        if (target === "width") {
          out.width = Math.max(1, inst.width * factor);
        } else if (target === "height") {
          out.height = Math.max(1, inst.height * factor);
        } else {
          out.width = Math.max(1, inst.width * factor);
          out.height = Math.max(1, inst.height * factor);
        }
        if (target === "scale-opacity") {
          out.opacity = clamp(inst.opacity * (0.15 + 0.85 * n), 0.05, 1);
        }
        if (target === "scale-color") {
          out.color = lerpHex(inst.color, mod.colorB || "#7aa6d9", n);
        }
        next.push(out);
      }
      instances = next;
    } else if (mod.type === "noise-jitter") {
      const pJ = Number(mod.posJitter ?? 12);
      const rJ = Number(mod.rotJitter ?? 35);
      const sJ = Number(mod.scaleJitter ?? 0.2);
      const drop = clamp(Number(mod.dropout ?? 0), 0, 0.95);
      const seed = Number(mod.seed ?? 404);
      const next = [];
      instances.forEach((inst, idx) => {
        if (drop > 0 && detHash(idx, 11, seed) < drop) return;
        const jx = (detHash(idx, 1, seed) - 0.5) * 2 * pJ;
        const jy = (detHash(idx, 2, seed) - 0.5) * 2 * pJ;
        const jr = (detHash(idx, 3, seed) - 0.5) * 2 * rJ;
        const js = 1 + (detHash(idx, 4, seed) - 0.5) * 2 * sJ;
        next.push({
          ...inst,
          x: seamless ? (((inst.x + jx) % docSize) + docSize) % docSize : inst.x + jx,
          y: seamless ? (((inst.y + jy) % docSize) + docSize) % docSize : inst.y + jy,
          rotation: inst.rotation + jr,
          width: Math.max(1, inst.width * js),
          height: Math.max(1, inst.height * js),
        });
      });
      instances = next;
    } else if (mod.type === "warp") {
      const amp = Number(mod.amplitude ?? 22);
      const freq = Math.max(1, Number(mod.frequency ?? 2));
      const wType = mod.warpType || "wave";
      const seed = Number(mod.seed ?? 901);
      instances = instances.map((inst) => {
        const u = inst.x / docSize;
        const v = inst.y / docSize;
        let dx = 0, dy = 0, drot = 0;
        if (wType === "wave") {
          dx = Math.sin(v * Math.PI * 2 * freq) * amp;
          dy = Math.cos(u * Math.PI * 2 * freq) * amp * 0.5;
        } else if (wType === "swirl") {
          const cx = inst.x - docSize * 0.5;
          const cy = inst.y - docSize * 0.5;
          const dist = Math.hypot(cx, cy) / (docSize * 0.5);
          const ang = (1 - clamp(dist, 0, 1)) * (amp * 0.04);
          const c = Math.cos(ang), s = Math.sin(ang);
          return {
            ...inst,
            x: docSize * 0.5 + cx * c - cy * s,
            y: docSize * 0.5 + cx * s + cy * c,
            rotation: inst.rotation + (ang * 180) / Math.PI,
          };
        } else if (wType === "curl") {
          const n1 = evaluateTileNoise(u, v, { noiseType: "fbm", frequency: freq, seed, seamless });
          const n2 = evaluateTileNoise(u + 0.17, v + 0.31, { noiseType: "fbm", frequency: freq, seed: seed + 77, seamless });
          dx = (n1 - 0.5) * 2 * amp;
          dy = (n2 - 0.5) * 2 * amp;
        } else {
          const cx = inst.x - docSize * 0.5;
          const cy = inst.y - docSize * 0.5;
          const len = Math.max(1, Math.hypot(cx, cy));
          const push = (1 - clamp(len / (docSize * 0.5), 0, 1)) * amp;
          dx = (cx / len) * push;
          dy = (cy / len) * push;
        }
        return {
          ...inst,
          x: seamless ? (((inst.x + dx) % docSize) + docSize) % docSize : inst.x + dx,
          y: seamless ? (((inst.y + dy) % docSize) + docSize) % docSize : inst.y + dy,
          rotation: inst.rotation + drot,
        };
      });
    } else if (mod.type === "edge-wear") {
      instances = instances.map((inst) => ({
        ...inst,
        outlineWidth: Math.max(inst.outlineWidth, Number(mod.outlineWidth || 0)),
        outlineColor: mod.outlineColor || inst.outlineColor,
        chipAmount: Math.max(inst.chipAmount, Number(mod.chipAmount || 0)),
        chipScale: Number(mod.chipScale || 10),
        chipSeed: Number(mod.seed || 707),
        heightValue: clamp(inst.heightValue + Number(mod.bevelHeight || 0), -1, 1),
      }));
    }
  }
  return instances;
}

function drawMotifPath(ctx, inst) {
  const w = inst.width;
  const h = inst.height;
  const hw = w * 0.5;
  const hh = h * 0.5;
  const t = inst.motifType || "circle";

  ctx.beginPath();
  if (t === "circle") {
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  } else if (t === "ring") {
    const inner = clamp(inst.innerRatio ?? 0.5, 0.1, 0.92);
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    ctx.moveTo(hw * inner, 0);
    ctx.ellipse(0, 0, hw * inner, hh * inner, 0, 0, Math.PI * 2, true);
  } else if (t === "square") {
    ctx.rect(-hw, -hh, w, h);
  } else if (t === "roundedRect") {
    const r = Math.min(hw, hh) * clamp(inst.cornerRadius ?? 0.22, 0, 1);
    ctx.roundRect(-hw, -hh, w, h, r);
  } else if (t === "diamond") {
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, 0);
    ctx.lineTo(0, hh);
    ctx.lineTo(-hw, 0);
    ctx.closePath();
  } else if (t === "triangle") {
    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, hh);
    ctx.lineTo(-hw, hh);
    ctx.closePath();
  } else if (t === "hexagon") {
    const sides = Math.max(3, Math.min(12, Math.round(inst.sides || 6)));
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI * 0.5;
      const x = Math.cos(a) * hw;
      const y = Math.sin(a) * hh;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (t === "star") {
    const pts = Math.max(3, Math.min(16, Math.round(inst.points || 5)));
    const inner = clamp(inst.innerRatio ?? 0.45, 0.15, 0.85);
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI * 0.5;
      const r = i % 2 === 0 ? 1 : inner;
      const x = Math.cos(a) * hw * r;
      const y = Math.sin(a) * hh * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (t === "cross") {
    const arm = clamp(inst.innerRatio ?? 0.34, 0.1, 0.8);
    const aw = hw * arm, ah = hh * arm;
    ctx.moveTo(-aw, -hh);
    ctx.lineTo(aw, -hh);
    ctx.lineTo(aw, -ah);
    ctx.lineTo(hw, -ah);
    ctx.lineTo(hw, ah);
    ctx.lineTo(aw, ah);
    ctx.lineTo(aw, hh);
    ctx.lineTo(-aw, hh);
    ctx.lineTo(-aw, ah);
    ctx.lineTo(-hw, ah);
    ctx.lineTo(-hw, -ah);
    ctx.lineTo(-aw, -ah);
    ctx.closePath();
  } else if (t === "chevron") {
    const th = hh * 0.48;
    ctx.moveTo(-hw, th);
    ctx.lineTo(0, -hh);
    ctx.lineTo(hw, th);
    ctx.lineTo(hw, hh);
    ctx.lineTo(0, -hh + (hh * 2 - th));
    ctx.lineTo(-hw, hh);
    ctx.closePath();
  } else if (t === "stripe") {
    ctx.rect(-hw, -hh * 0.28, w, h * 0.56);
  } else if (t === "arc") {
    const inner = clamp(inst.innerRatio ?? 0.55, 0.2, 0.85);
    ctx.arc(0, 0, hw, Math.PI, 0, false);
    ctx.arc(0, 0, hw * inner, 0, Math.PI, true);
    ctx.closePath();
  } else if (t === "teardrop") {
    ctx.moveTo(0, -hh);
    ctx.bezierCurveTo(hw * 0.85, -hh * 0.15, hw, hh * 0.55, 0, hh);
    ctx.bezierCurveTo(-hw, hh * 0.55, -hw * 0.85, -hh * 0.15, 0, -hh);
    ctx.closePath();
  } else if (t === "leaf") {
    ctx.moveTo(0, -hh);
    ctx.quadraticCurveTo(hw, -hh * 0.2, 0, hh);
    ctx.quadraticCurveTo(-hw, -hh * 0.2, 0, -hh);
    ctx.closePath();
  } else if (t === "flower") {
    for (let p = 0; p < 5; p++) {
      const a = (p * 72 * Math.PI) / 180;
      const cx = Math.sin(a) * hh * 0.46;
      const cy = -Math.cos(a) * hh * 0.46;
      ctx.ellipse(cx, cy, hw * 0.36, hh * 0.54, a, 0, Math.PI * 2);
      ctx.moveTo(0, 0);
    }
  } else if (t === "line") {
    ctx.moveTo(-hw, 0);
    ctx.lineTo(hw, 0);
  } else if (t === "gear") {
    const teeth = Math.max(6, Math.min(20, Math.round(inst.points || 8)));
    const innerR = hw * clamp(inst.innerRatio ?? 0.72, 0.45, 0.9);
    const holeR = hw * 0.32;
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * Math.PI * 2;
      const a1 = ((i + 0.65) / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? hw : innerR;
      const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      if (i === 0) ctx.moveTo(x0, y0);
      else ctx.lineTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.closePath();
    ctx.moveTo(holeR, 0);
    ctx.arc(0, 0, holeR, 0, Math.PI * 2, true);
  } else {
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
  }
}

function resolveFillStyle(ctx, inst, overrideColor) {
  if (overrideColor) return overrideColor;
  if (inst.fillMode === "radial") {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(inst.width, inst.height) * 0.5);
    grad.addColorStop(0, inst.color);
    grad.addColorStop(1, inst.colorB || "#1a1e24");
    return grad;
  }
  if (inst.fillMode === "linear") {
    const rad = ((inst.gradientAngle ?? 45) * Math.PI) / 180;
    const dx = Math.cos(rad) * inst.width * 0.5;
    const dy = Math.sin(rad) * inst.height * 0.5;
    const grad = ctx.createLinearGradient(-dx, -dy, dx, dy);
    grad.addColorStop(0, inst.color);
    grad.addColorStop(1, inst.colorB || "#1a1e24");
    return grad;
  }
  return inst.color;
}

function canvasBlendOp(blend) {
  switch (blend) {
    case "Multiply": return "multiply";
    case "Screen": return "screen";
    case "Overlay": return "overlay";
    case "Add": return "lighter";
    case "Darken": return "darken";
    default: return "source-over";
  }
}

function makeScratchCanvas(size) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size, size) : document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

/**
 * Render an entire layer stack + modifier stack + masks + tiling into 4 PBR canvases:
 * { albedo, roughness, metalness, height, normalData } (and single-layer preview if desired).
 */
export function renderArtworkDocument(doc, targetSize = 512, { tileMode = "single", channel = "composite" } = {}) {
  const size = doc.size || ARTWORK_SIZE;
  const scale = targetSize / size;

  const albedo = makeScratchCanvas(targetSize);
  const roughness = makeScratchCanvas(targetSize);
  const metalness = makeScratchCanvas(targetSize);
  const height = makeScratchCanvas(targetSize);

  const aCtx = albedo.getContext("2d");
  const rCtx = roughness.getContext("2d");
  const mCtx = metalness.getContext("2d");
  const hCtx = height.getContext("2d");

  const bg = doc.background || {};
  if (bg.enabled) {
    aCtx.fillStyle = bg.color || "#171a1f";
    aCtx.globalAlpha = clamp(bg.opacity ?? 1, 0, 1);
    aCtx.fillRect(0, 0, targetSize, targetSize);
    aCtx.globalAlpha = 1;

    const rV = Math.round(clamp(bg.roughness ?? 0.85, 0, 1) * 255);
    const mV = Math.round(clamp(bg.metalness ?? 0, 0, 1) * 255);
    const hV = Math.round(clamp((bg.height ?? 0) * 0.5 + 0.5, 0, 1) * 255);
    rCtx.fillStyle = `rgb(${rV},${rV},${rV})`;
    rCtx.fillRect(0, 0, targetSize, targetSize);
    mCtx.fillStyle = `rgb(${mV},${mV},${mV})`;
    mCtx.fillRect(0, 0, targetSize, targetSize);
    hCtx.fillStyle = `rgb(${hV},${hV},${hV})`;
    hCtx.fillRect(0, 0, targetSize, targetSize);
  } else {
    const rV = 200, mV = 0, hV = 128;
    rCtx.fillStyle = `rgb(${rV},${rV},${rV})`;
    rCtx.fillRect(0, 0, targetSize, targetSize);
    mCtx.fillStyle = `rgb(${mV},${mV},${mV})`;
    mCtx.fillRect(0, 0, targetSize, targetSize);
    hCtx.fillStyle = `rgb(${hV},${hV},${hV})`;
    hCtx.fillRect(0, 0, targetSize, targetSize);
  }

  // Evaluate layers bottom-to-top
  const layerScratchA = makeScratchCanvas(targetSize);
  const layerScratchR = makeScratchCanvas(targetSize);
  const layerScratchM = makeScratchCanvas(targetSize);
  const layerScratchH = makeScratchCanvas(targetSize);
  const maskScratch = makeScratchCanvas(targetSize);

  const lACtx = layerScratchA.getContext("2d");
  const lRCtx = layerScratchR.getContext("2d");
  const lMCtx = layerScratchM.getContext("2d");
  const lHCtx = layerScratchH.getContext("2d");

  const folderMap = new Map(doc.layers.filter((l) => l.kind === "folder").map((f) => [f.id, f]));
  const isEffectiveVisible = (lyr) => {
    if (!lyr.visible) return false;
    if (lyr.parentId && folderMap.has(lyr.parentId)) return isEffectiveVisible(folderMap.get(lyr.parentId));
    return true;
  };

  for (const layer of doc.layers) {
    if (layer.kind === "folder" || !isEffectiveVisible(layer)) continue;

    lACtx.clearRect(0, 0, targetSize, targetSize);
    lRCtx.clearRect(0, 0, targetSize, targetSize);
    lMCtx.clearRect(0, 0, targetSize, targetSize);
    lHCtx.clearRect(0, 0, targetSize, targetSize);

    const instances = layer.kind === "gradient"
      ? [{
          x: size * 0.5,
          y: size * 0.5,
          width: size,
          height: size,
          rotation: 0,
          motifType: "square",
          fillMode: layer.shape.fillMode || "linear",
          color: layer.shape.color,
          colorB: layer.shape.colorB,
          gradientAngle: layer.shape.gradientAngle ?? 45,
          opacity: 1,
          heightValue: layer.surface.height ?? 0.05,
          roughness: layer.surface.roughness ?? 0.6,
          metalness: layer.surface.metalness ?? 0.0,
          outlineWidth: 0,
          chipAmount: 0,
        }]
      : evaluateLayerInstances(layer, size, doc.mode);

    // Draw each instance; wrap across tile edges if pattern mode
    const wraps = doc.mode === "pattern"
      ? [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size], [-size, -size], [size, -size], [-size, size], [size, size]]
      : [[0, 0]];

    for (const inst of instances) {
      const rV = Math.round(clamp(inst.roughness ?? 0.5, 0, 1) * 255);
      const mV = Math.round(clamp(inst.metalness ?? 0, 0, 1) * 255);
      const hV = Math.round(clamp((inst.heightValue ?? 0.2) * 0.5 + 0.5, 0, 1) * 255);
      const rCol = `rgb(${rV},${rV},${rV})`;
      const mCol = `rgb(${mV},${mV},${mV})`;
      const hCol = `rgb(${hV},${hV},${hV})`;

      for (const [wx, wy] of wraps) {
        const px = inst.x + wx;
        const py = inst.y + wy;
        const margin = Math.max(inst.width, inst.height) * 0.8 + 40;
        if (px < -margin || px > size + margin || py < -margin || py > size + margin) continue;

        const drawToChannel = (ctx, fillStyle, isAlbedo = false) => {
          ctx.save();
          ctx.scale(scale, scale);
          ctx.translate(px, py);
          ctx.rotate((inst.rotation * Math.PI) / 180);
          ctx.scale(inst.flipX ? -1 : 1, inst.flipY ? -1 : 1);
          ctx.globalAlpha = clamp(inst.opacity, 0, 1);

          if (layer.kind === "text" && inst.text) {
            const t = inst.text;
            ctx.font = `${t.fontWeight || 600} ${t.fontSize || 48}px "${t.fontFamily || "DM Sans"}", sans-serif`;
            ctx.textAlign = t.align || "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = fillStyle;
            ctx.fillText(t.value || "", 0, 0);
            if (isAlbedo && inst.outlineWidth > 0) {
              ctx.lineWidth = inst.outlineWidth;
              ctx.strokeStyle = inst.outlineColor || "#141619";
              ctx.strokeText(t.value || "", 0, 0);
            }
          } else if (inst.motifType === "svg-path" && inst.svgPath && typeof Path2D !== "undefined") {
            ctx.save();
            ctx.scale(inst.width / 100, inst.height / 100);
            ctx.translate(-50, -50);
            const p2d = new Path2D(inst.svgPath);
            if (inst.fillEnabled !== false) {
              ctx.fillStyle = fillStyle;
              ctx.fill(p2d, inst.fillRule === "nonzero" ? "nonzero" : "evenodd");
            }
            if (inst.outlineWidth > 0) {
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.lineWidth = inst.outlineWidth;
              ctx.strokeStyle = isAlbedo ? (inst.outlineColor || inst.color || "#141619") : fillStyle;
              ctx.stroke(p2d);
            }
            ctx.restore();
          } else {
            drawMotifPath(ctx, inst);
            if (inst.fillEnabled !== false && inst.motifType !== "line") {
              ctx.fillStyle = fillStyle;
              ctx.fill("evenodd");
            }
            if (inst.outlineWidth > 0 || inst.motifType === "line") {
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.lineWidth = Math.max(1, inst.outlineWidth || 4);
              ctx.strokeStyle = isAlbedo ? (inst.outlineColor || "#141619") : fillStyle;
              ctx.stroke();
            }
          }
          ctx.restore();
        };

        if (layer.surface.enableAlbedo !== false) drawToChannel(lACtx, resolveFillStyle(lACtx, inst), true);
        if (layer.surface.enableRoughness !== false) drawToChannel(lRCtx, rCol);
        if (layer.surface.enableMetalness !== false) drawToChannel(lMCtx, mCol);
        if (layer.surface.enableHeight !== false) drawToChannel(lHCtx, hCol);
      }
    }

    // Apply optional Edge Wear chipping if any modifier requested chipAmount > 0
    const maxChip = instances.reduce((m, i) => Math.max(m, i.chipAmount || 0), 0);
    if (maxChip > 0.01) {
      const chipRef = instances.find((i) => i.chipAmount > 0.01);
      applyNoiseMaskCutout(lACtx, lRCtx, lMCtx, lHCtx, targetSize, {
        threshold: 0.25 + maxChip * 0.45,
        softness: 0.16,
        frequency: chipRef?.chipScale || 10,
        seed: chipRef?.chipSeed || 707,
        seamless: doc.mode === "pattern",
        invert: true,
      });
    }

    // Apply per-layer Mask if enabled
    if (layer.mask?.enabled) {
      applyLayerMask(lACtx, lRCtx, lMCtx, lHCtx, maskScratch, targetSize, layer.mask, doc.mode === "pattern");
    }

    // Composite layer onto target channels
    const op = clamp(layer.opacity ?? 1, 0, 1);
    const blend = canvasBlendOp(layer.blend);

    if (layer.surface.enableAlbedo !== false) {
      aCtx.save();
      aCtx.globalAlpha = op;
      aCtx.globalCompositeOperation = blend;
      aCtx.drawImage(layerScratchA, 0, 0);
      aCtx.restore();
    }
    if (layer.surface.enableRoughness !== false) {
      rCtx.save();
      rCtx.globalAlpha = op;
      rCtx.drawImage(layerScratchR, 0, 0);
      rCtx.restore();
    }
    if (layer.surface.enableMetalness !== false) {
      mCtx.save();
      mCtx.globalAlpha = op;
      mCtx.drawImage(layerScratchM, 0, 0);
      mCtx.restore();
    }
    if (layer.surface.enableHeight !== false) {
      hCtx.save();
      hCtx.globalAlpha = op;
      hCtx.drawImage(layerScratchH, 0, 0);
      hCtx.restore();
    }
  }

  return { albedo, roughness, metalness, height, width: targetSize, heightPx: targetSize };
}

function applyNoiseMaskCutout(aCtx, rCtx, mCtx, hCtx, size, opts) {
  const img = aCtx.getImageData(0, 0, size, size);
  const rImg = rCtx.getImageData(0, 0, size, size);
  const mImg = mCtx.getImageData(0, 0, size, size);
  const hImg = hCtx.getImageData(0, 0, size, size);
  const d = img.data;
  const rd = rImg.data;
  const md = mImg.data;
  const hd = hImg.data;
  const step = size > 256 ? 2 : 1;

  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const idx0 = (y * size + x) * 4;
      if (d[idx0 + 3] === 0) continue;
      const n = evaluateTileNoise(x / size, y / size, {
        noiseType: "fbm",
        frequency: opts.frequency || 10,
        octaves: 3,
        seed: opts.seed || 707,
        seamless: opts.seamless,
      });
      const keep = n > (1 - opts.threshold) ? 1 : clamp((n - (1 - opts.threshold - opts.softness)) / Math.max(0.01, opts.softness), 0, 1);
      for (let sy = 0; sy < step && y + sy < size; sy++) {
        for (let sx = 0; sx < step && x + sx < size; sx++) {
          const k = ((y + sy) * size + (x + sx)) * 4 + 3;
          d[k] = Math.round(d[k] * keep);
          rd[k] = Math.round(rd[k] * keep);
          md[k] = Math.round(md[k] * keep);
          hd[k] = Math.round(hd[k] * keep);
        }
      }
    }
  }
  aCtx.putImageData(img, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  mCtx.putImageData(mImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
}

function applyLayerMask(aCtx, rCtx, mCtx, hCtx, maskCanvas, size, mask, seamless) {
  const img = aCtx.getImageData(0, 0, size, size);
  const rImg = rCtx.getImageData(0, 0, size, size);
  const mImg = mCtx.getImageData(0, 0, size, size);
  const hImg = hCtx.getImageData(0, 0, size, size);
  const d = img.data, rd = rImg.data, md = mImg.data, hd = hImg.data;
  const freq = mask.frequency ?? 4;
  const thr = clamp(mask.threshold ?? 0.45, 0, 1);
  const soft = Math.max(0.02, mask.softness ?? 0.25);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const k = (y * size + x) * 4 + 3;
      if (d[k] === 0 && hd[k] === 0) continue;
      const u = x / size;
      let val = 1;
      if (mask.mode === "radial") {
        val = 1 - clamp(Math.hypot(u - 0.5, v - 0.5) * 2, 0, 1);
      } else if (mask.mode === "stripe") {
        val = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * Math.max(1, Math.round(freq)));
      } else {
        val = evaluateTileNoise(u, v, {
          noiseType: "fbm",
          frequency: freq,
          octaves: 3,
          seed: mask.seed || 211,
          seamless,
        });
      }
      if (mask.invert) val = 1 - val;
      const alpha = clamp((val - (thr - soft * 0.5)) / soft, 0, 1);
      d[k] = Math.round(d[k] * alpha);
      rd[k] = Math.round(rd[k] * alpha);
      md[k] = Math.round(md[k] * alpha);
      hd[k] = Math.round(hd[k] * alpha);
    }
  }
  aCtx.putImageData(img, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  mCtx.putImageData(mImg, 0, 0);
  hCtx.putImageData(hImg, 0, 0);
}

/**
 * Derive tangent-space RGB Normal map ImageData from a height canvas via Sobel filter.
 */
export function buildNormalFromHeightCanvas(heightCanvas, strength = 2.6) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext("2d").getImageData(0, 0, w, h).data;
  const outCanvas = makeScratchCanvas(w);
  const oCtx = outCanvas.getContext("2d");
  const out = oCtx.createImageData(w, h);
  const dst = out.data;

  const sample = (x, y) => {
    const px = ((x % w) + w) % w;
    const py = ((y % h) + h) % h;
    return src[(py * w + px) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y), r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  oCtx.putImageData(out, 0, 0);
  return outCanvas;
}

/**
 * Evaluate document into flat Uint8ClampedArray PBR buffers + instance stats (browser Canvas OR pure-JS Node fallback).
 */
export function evaluateArtworkDocument(doc, targetSize = 384) {
  const docSize = doc.size || ARTWORK_SIZE;
  let totalInstances = 0;
  let minScale = Infinity;
  let maxScale = -Infinity;

  for (const lyr of doc.layers || []) {
    if (!lyr.visible || lyr.kind === "folder") continue;
    const insts = evaluateLayerInstances(lyr, docSize, doc.mode);
    totalInstances += insts.length;
    const baseW = Math.max(1, lyr.transform?.width || 48);
    for (const inst of insts) {
      const s = inst.width / baseW;
      if (s < minScale) minScale = s;
      if (s > maxScale) maxScale = s;
    }
  }
  if (!Number.isFinite(minScale)) { minScale = 1; maxScale = 1; }

  const canCanvas = typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined";
  if (canCanvas) {
    const rendered = renderArtworkDocument(doc, targetSize);
    const normCanvas = buildNormalFromHeightCanvas(rendered.height, 2.6);
    const albedo = rendered.albedo.getContext("2d").getImageData(0, 0, targetSize, targetSize).data;
    const roughness = rendered.roughness.getContext("2d").getImageData(0, 0, targetSize, targetSize).data;
    const metalness = rendered.metalness.getContext("2d").getImageData(0, 0, targetSize, targetSize).data;
    const height = rendered.height.getContext("2d").getImageData(0, 0, targetSize, targetSize).data;
    const normal = normCanvas.getContext("2d").getImageData(0, 0, targetSize, targetSize).data;

    let opaque = 0;
    for (let i = 3; i < albedo.length; i += 4) if (albedo[i] > 18) opaque++;
    return {
      width: targetSize,
      heightPx: targetSize,
      albedo,
      roughness,
      metalness,
      height,
      normal,
      stats: {
        instances: totalInstances,
        minScale,
        maxScale,
        coveragePct: (opaque / (targetSize * targetSize)) * 100,
      },
    };
  }

  // Headless Node rasterizer fallback (no DOM Canvas)
  const n = targetSize * targetSize;
  const albedo = new Uint8ClampedArray(n * 4);
  const roughness = new Uint8ClampedArray(n * 4);
  const metalness = new Uint8ClampedArray(n * 4);
  const height = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);

  const bg = doc.background || {};
  const [bgr, bgg, bgb] = bg.enabled ? hexToRgb(bg.color || "#171a1f") : [0, 0, 0];
  const bga = bg.enabled ? Math.round(clamp(bg.opacity ?? 1, 0, 1) * 255) : 0;
  const bgrV = Math.round(clamp(bg.roughness ?? 0.85, 0, 1) * 255);
  const bgmV = Math.round(clamp(bg.metalness ?? 0, 0, 1) * 255);
  const bghV = Math.round(clamp((bg.height ?? 0) * 0.5 + 0.5, 0, 1) * 255);
  for (let i = 0; i < n; i++) {
    const i4 = i * 4;
    albedo[i4] = bgr; albedo[i4 + 1] = bgg; albedo[i4 + 2] = bgb; albedo[i4 + 3] = bga;
    roughness[i4] = roughness[i4 + 1] = roughness[i4 + 2] = bgrV; roughness[i4 + 3] = 255;
    metalness[i4] = metalness[i4 + 1] = metalness[i4 + 2] = bgmV; metalness[i4 + 3] = 255;
    height[i4] = height[i4 + 1] = height[i4 + 2] = bghV; height[i4 + 3] = 255;
    normal[i4] = 128; normal[i4 + 1] = 128; normal[i4 + 2] = 255; normal[i4 + 3] = 255;
  }

  const scale = targetSize / docSize;
  for (const layer of doc.layers || []) {
    if (!layer.visible || layer.kind === "folder") continue;
    const insts = evaluateLayerInstances(layer, docSize, doc.mode);
    const lOp = clamp(layer.opacity ?? 1, 0, 1);
    for (const inst of insts) {
      const [cr, cg, cb] = hexToRgb(inst.color || "#e8c27a");
      const rV = Math.round(clamp(inst.roughness ?? 0.5, 0, 1) * 255);
      const mV = Math.round(clamp(inst.metalness ?? 0, 0, 1) * 255);
      const hV = Math.round(clamp((inst.heightValue ?? 0.2) * 0.5 + 0.5, 0, 1) * 255);
      const cx = inst.x * scale, cy = inst.y * scale;
      const rx = Math.max(1, inst.width * scale * 0.5);
      const ry = Math.max(1, inst.height * scale * 0.5);
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(targetSize - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(targetSize - 1, Math.ceil(cy + ry));
      const a = clamp(inst.opacity * lOp, 0, 1);
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const dx = (px - cx) / rx, dy = (py - cy) / ry;
          if (dx * dx + dy * dy > 1.0) continue;
          const i4 = (py * targetSize + px) * 4;
          albedo[i4] = Math.round(albedo[i4] * (1 - a) + cr * a);
          albedo[i4 + 1] = Math.round(albedo[i4 + 1] * (1 - a) + cg * a);
          albedo[i4 + 2] = Math.round(albedo[i4 + 2] * (1 - a) + cb * a);
          albedo[i4 + 3] = Math.min(255, Math.round(albedo[i4 + 3] + (255 - albedo[i4 + 3]) * a));
          roughness[i4] = roughness[i4 + 1] = roughness[i4 + 2] = rV;
          metalness[i4] = metalness[i4 + 1] = metalness[i4 + 2] = mV;
          height[i4] = height[i4 + 1] = height[i4 + 2] = hV;
        }
      }
    }
  }
  let opaque = 0;
  for (let i = 3; i < albedo.length; i += 4) if (albedo[i] > 18) opaque++;
  return {
    width: targetSize,
    heightPx: targetSize,
    albedo,
    roughness,
    metalness,
    height,
    normal,
    stats: {
      instances: totalInstances,
      minScale,
      maxScale,
      coveragePct: (opaque / n) * 100,
    },
  };
}

function escapeXml(s) {
  return String(s || "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[c]));
}

function buildSvgMotifMarkup(inst, fillAttr, strokeAttr, strokeW, gradDefs, gid) {
  const w = Math.max(1, inst.width), h = Math.max(1, inst.height);
  const hw = w * 0.5, hh = h * 0.5;
  const t = inst.motifType || "circle";
  let effectiveFill = inst.fillEnabled === false || t === "line" ? "none" : fillAttr;
  if (effectiveFill !== "none" && (inst.fillMode === "linear" || inst.fillMode === "radial")) {
    const id = `${gid}-g`;
    if (inst.fillMode === "radial") {
      gradDefs.push(`<radialGradient id="${id}"><stop offset="0%" stop-color="${inst.color}"/><stop offset="100%" stop-color="${inst.colorB || "#1a1e24"}"/></radialGradient>`);
    } else {
      const a = ((inst.gradientAngle ?? 45) * Math.PI) / 180;
      const x1 = (50 - Math.cos(a) * 50).toFixed(1), y1 = (50 - Math.sin(a) * 50).toFixed(1);
      const x2 = (50 + Math.cos(a) * 50).toFixed(1), y2 = (50 + Math.sin(a) * 50).toFixed(1);
      gradDefs.push(`<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%"><stop offset="0%" stop-color="${inst.color}"/><stop offset="100%" stop-color="${inst.colorB || "#1a1e24"}"/></linearGradient>`);
    }
    effectiveFill = `url(#${id})`;
  }
  const common = `fill="${effectiveFill}" fill-rule="${inst.fillRule === "nonzero" ? "nonzero" : "evenodd"}" stroke="${strokeW > 0 || t === "line" ? strokeAttr : "none"}" stroke-width="${t === "line" ? Math.max(1, strokeW || 4) : strokeW}" stroke-linecap="round" stroke-linejoin="round"`;

  if (t === "svg-path" && inst.svgPath) {
    return `<path d="${escapeXml(inst.svgPath)}" transform="scale(${(w / 100).toFixed(4)} ${(h / 100).toFixed(4)}) translate(-50 -50)" ${common}/>`;
  }
  if (t === "circle") return `<ellipse cx="0" cy="0" rx="${hw}" ry="${hh}" ${common}/>`;
  if (t === "ring") {
    const inner = clamp(inst.innerRatio ?? 0.5, 0.1, 0.92);
    const rxI = hw * inner, ryI = hh * inner;
    const d = `M${-hw} 0 A${hw} ${hh} 0 1 0 ${hw} 0 A${hw} ${hh} 0 1 0 ${-hw} 0 Z M${-rxI} 0 A${rxI} ${ryI} 0 1 1 ${rxI} 0 A${rxI} ${ryI} 0 1 1 ${-rxI} 0 Z`;
    return `<path d="${d}" ${common}/>`;
  }
  if (t === "square") return `<rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" ${common}/>`;
  if (t === "roundedRect") {
    const r = Math.min(hw, hh) * clamp(inst.cornerRadius ?? 0.22, 0, 1);
    return `<rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${common}/>`;
  }
  if (t === "diamond") return `<polygon points="0,${-hh} ${hw},0 0,${hh} ${-hw},0" ${common}/>`;
  if (t === "triangle") return `<polygon points="0,${-hh} ${hw},${hh} ${-hw},${hh}" ${common}/>`;
  if (t === "hexagon") {
    const sides = Math.max(3, Math.min(12, Math.round(inst.sides || 6)));
    const pts = Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 - Math.PI * 0.5;
      return `${(Math.cos(a) * hw).toFixed(2)},${(Math.sin(a) * hh).toFixed(2)}`;
    }).join(" ");
    return `<polygon points="${pts}" ${common}/>`;
  }
  if (t === "star") {
    const n = Math.max(3, Math.min(16, Math.round(inst.points || 5)));
    const inner = clamp(inst.innerRatio ?? 0.45, 0.15, 0.85);
    const pts = Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI * 0.5;
      const r = i % 2 === 0 ? 1 : inner;
      return `${(Math.cos(a) * hw * r).toFixed(2)},${(Math.sin(a) * hh * r).toFixed(2)}`;
    }).join(" ");
    return `<polygon points="${pts}" ${common}/>`;
  }
  if (t === "cross") {
    const arm = clamp(inst.innerRatio ?? 0.34, 0.1, 0.8);
    const aw = hw * arm, ah = hh * arm;
    return `<polygon points="${-aw},${-hh} ${aw},${-hh} ${aw},${-ah} ${hw},${-ah} ${hw},${ah} ${aw},${ah} ${aw},${hh} ${-aw},${hh} ${-aw},${ah} ${-hw},${ah} ${-hw},${-ah} ${-aw},${-ah}" ${common}/>`;
  }
  if (t === "chevron") {
    const th = hh * 0.48;
    const midY = -hh + (hh * 2 - th);
    return `<polygon points="${-hw},${th} 0,${-hh} ${hw},${th} ${hw},${hh} 0,${midY} ${-hw},${hh}" ${common}/>`;
  }
  if (t === "stripe") return `<rect x="${-hw}" y="${(-hh * 0.28).toFixed(2)}" width="${w}" height="${(h * 0.56).toFixed(2)}" ${common}/>`;
  if (t === "line") return `<line x1="${-hw}" y1="0" x2="${hw}" y2="0" ${common}/>`;
  if (t === "flower") {
    return [0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="${(-hh * 0.46).toFixed(2)}" rx="${(hw * 0.36).toFixed(2)}" ry="${(hh * 0.54).toFixed(2)}" transform="rotate(${a})" ${common}/>`).join("");
  }
  if (t === "arc") {
    const inner = clamp(inst.innerRatio ?? 0.55, 0.2, 0.85);
    const ri = hw * inner;
    const d = `M${-hw} 0 A${hw} ${hw} 0 0 1 ${hw} 0 L${ri} 0 A${ri} ${ri} 0 0 0 ${-ri} 0 Z`;
    return `<path d="${d}" ${common}/>`;
  }
  if (t === "teardrop") {
    const d = `M0 ${-hh} C${hw * 0.85} ${-hh * 0.15} ${hw} ${hh * 0.55} 0 ${hh} C${-hw} ${hh * 0.55} ${-hw * 0.85} ${-hh * 0.15} 0 ${-hh} Z`;
    return `<path d="${d}" ${common}/>`;
  }
  if (t === "leaf") {
    const d = `M0 ${-hh} Q${hw} ${-hh * 0.2} 0 ${hh} Q${-hw} ${-hh * 0.2} 0 ${-hh} Z`;
    return `<path d="${d}" ${common}/>`;
  }
  if (t === "gear") {
    const teeth = Math.max(6, Math.min(20, Math.round(inst.points || 8)));
    const innerR = hw * clamp(inst.innerRatio ?? 0.72, 0.45, 0.9);
    const holeR = hw * 0.32;
    let d = "";
    for (let i = 0; i < teeth * 2; i++) {
      const a0 = (i / (teeth * 2)) * Math.PI * 2;
      const a1 = ((i + 0.65) / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? hw : innerR;
      d += `${i === 0 ? "M" : "L"}${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} L${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)} `;
    }
    d += `Z M${holeR} 0 A${holeR} ${holeR} 0 1 0 ${-holeR} 0 A${holeR} ${holeR} 0 1 0 ${holeR} 0 Z`;
    return `<path d="${d}" ${common}/>`;
  }
  return `<ellipse cx="0" cy="0" rx="${hw}" ry="${hh}" ${common}/>`;
}

export function artworkDocumentLayersSvg(doc, { idPrefix = "art" } = {}) {
  const size = doc.size || ARTWORK_SIZE;
  const gradDefs = [];
  const groups = [];
  const folderMap = new Map((doc.layers || []).filter((l) => l.kind === "folder").map((f) => [f.id, f]));
  const isVisible = (lyr) => {
    if (!lyr.visible) return false;
    if (lyr.parentId && folderMap.has(lyr.parentId)) return isVisible(folderMap.get(lyr.parentId));
    return true;
  };
  const wraps = doc.mode === "pattern"
    ? [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size], [-size, -size], [size, -size], [-size, size], [size, size]]
    : [[0, 0]];

  let instSeq = 0;
  for (const layer of doc.layers || []) {
    if (layer.kind === "folder" || !isVisible(layer)) continue;
    const instances = layer.kind === "gradient"
      ? [{
          x: size * 0.5, y: size * 0.5, width: size, height: size, rotation: 0,
          motifType: "square", fillMode: layer.shape.fillMode || "linear",
          color: layer.shape.color, colorB: layer.shape.colorB, gradientAngle: layer.shape.gradientAngle ?? 45,
          opacity: 1, fillEnabled: true, outlineWidth: 0,
        }]
      : evaluateLayerInstances(layer, size, doc.mode);

    const parts = [];
    for (const inst of instances) {
      for (const [wx, wy] of wraps) {
        const px = inst.x + wx, py = inst.y + wy;
        const margin = Math.max(inst.width || 64, inst.height || 64) * 0.8 + 40;
        if (px < -margin || px > size + margin || py < -margin || py > size + margin) continue;
        const xf = `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${(inst.rotation || 0).toFixed(2)}) scale(${inst.flipX ? -1 : 1} ${inst.flipY ? -1 : 1})`;
        if (layer.kind === "text" && inst.text) {
          const t = inst.text;
          const anchor = t.align === "left" ? "start" : t.align === "right" ? "end" : "middle";
          parts.push(`<text transform="${xf}" opacity="${clamp(inst.opacity, 0, 1)}" text-anchor="${anchor}" dominant-baseline="central" font-family="${escapeXml(t.fontFamily || "DM Sans")}, sans-serif" font-weight="${t.fontWeight || 600}" font-size="${t.fontSize || 48}" letter-spacing="${t.letterSpacing || 0}" fill="${inst.color}" ${inst.outlineWidth > 0 ? `stroke="${inst.outlineColor || "#141619"}" stroke-width="${inst.outlineWidth}"` : ""}>${escapeXml(t.value || "")}</text>`);
        } else {
          const markup = buildSvgMotifMarkup(inst, inst.color || "#e8c27a", inst.outlineColor || inst.color || "#141619", inst.outlineWidth || 0, gradDefs, `${idPrefix}-${instSeq++}`);
          parts.push(`<g transform="${xf}" opacity="${clamp(inst.opacity, 0, 1)}">${markup}</g>`);
        }
      }
    }
    groups.push(`<g data-layer-id="${escapeXml(layer.id)}" opacity="${clamp(layer.opacity ?? 1, 0, 1)}" style="mix-blend-mode:${(layer.blend || "Normal").toLowerCase()};cursor:${layer.locked ? "default" : "move"}">${parts.join("")}</g>`);
  }
  return { defs: gradDefs.join(""), body: groups.join("") };
}

export function artworkDocumentToSvgString(doc, { width = 512, height = 512, showBg = true } = {}) {
  const size = doc.size || ARTWORK_SIZE;
  const { defs, body } = artworkDocumentLayersSvg(doc);
  const bg = doc.background || {};
  const bgRect = showBg && bg.enabled
    ? `<rect width="${size}" height="${size}" fill="${bg.color || "#171a1f"}" opacity="${clamp(bg.opacity ?? 1, 0, 1)}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${size} ${size}"><defs>${defs}</defs>${bgRect}${body}</svg>`;
}

