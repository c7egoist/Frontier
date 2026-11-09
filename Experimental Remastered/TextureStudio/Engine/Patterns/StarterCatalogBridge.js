/*==========================================================================================================================================
                                                         STARTERCATALOGBRIDGE.JS
==========================================================================================================================================*/
/* Bridges all reusable Frontier pattern archives (Geometric, Heritage, Textiles, Stitches, Rugs, Ornamental) plus new Noise-Scaled Patterns
   and Stamp/Decal starter kits into unified ArtworkStackEngine layer+modifier documents. */

import { patternStarterCatalog, patternStarter } from "./patternDocument.js";
import {
  ARTWORK_SIZE,
  createArtworkDocument,
  createArtworkLayer,
  createDefaultModifier,
} from "./ArtworkStackEngine.js";

export const NOISE_SCALED_STARTERS = [
  {
    id: "noise-hex-matrix",
    name: "Noise-Scaled Hex Matrix",
    group: "Noise & Procedural",
    build: () => createArtworkDocument("pattern"),
  },
  {
    id: "noise-polka-wave",
    name: "Perlin Polka Wave",
    group: "Noise & Procedural",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Perlin Polka Wave";
      doc.background.color = "#13171d";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Perlin Dots",
          transform: { x: 256, y: 256, width: 34, height: 34, rotation: 0 },
          shape: { motifType: "circle", color: "#f0d38c", colorB: "#7dc7b0" },
          surface: { finish: "ceramic", roughness: 0.22, metalness: 0.1, height: 0.32, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 14, rows: 14, spanX: 512, spanY: 512 },
            { ...createDefaultModifier("noise-scale"), noiseType: "perlin", target: "scale-color", minScale: 0.15, maxScale: 1.75, frequency: 4, colorB: "#e47b64", seamless: true },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "noise-ridged-diamonds",
    name: "Ridged Diamond Acoustic Mesh",
    group: "Noise & Procedural",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Ridged Diamond Acoustic Mesh";
      doc.background.color = "#101215";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Diamond Perforation",
          transform: { x: 256, y: 256, width: 38, height: 38, rotation: 0 },
          shape: { motifType: "diamond", color: "#d5dce6", colorB: "#e8c27a" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.92, height: 0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "brick", columns: 12, rows: 12, spanX: 512, spanY: 512 },
            { ...createDefaultModifier("noise-scale"), noiseType: "ridged", target: "scale-color", minScale: 0.25, maxScale: 1.65, frequency: 3, octaves: 3, colorB: "#e8c27a", seamless: true },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "noise-cellular-pebbles",
    name: "Voronoi Organic Pebbles",
    group: "Noise & Procedural",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Voronoi Organic Pebbles";
      doc.background.color = "#23211e";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Rounded Pebbles",
          transform: { x: 256, y: 256, width: 46, height: 40, rotation: 15 },
          shape: { motifType: "roundedRect", cornerRadius: 0.45, color: "#978f84", colorB: "#d2c3aa" },
          surface: { finish: "ceramic", roughness: 0.65, metalness: 0.0, height: 0.55, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 9, rows: 9, spanX: 512, spanY: 512 },
            { ...createDefaultModifier("noise-jitter"), posJitter: 14, rotJitter: 45, scaleJitter: 0.15, seed: 303 },
            { ...createDefaultModifier("noise-scale"), noiseType: "worley", target: "scale-color", minScale: 0.4, maxScale: 1.5, frequency: 3, colorB: "#dfd3bf", seamless: true },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "noise-mandala-bloom",
    name: "Radial Mandala Echo",
    group: "Noise & Procedural",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Radial Mandala Echo";
      doc.background.color = "#18151d";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Petal Ring",
          transform: { x: 256, y: 256, width: 44, height: 78, rotation: 0 },
          shape: { motifType: "teardrop", color: "#e8c27a", colorB: "#7bb2d9" },
          surface: { finish: "foil", roughness: 0.3, metalness: 0.85, height: 0.4, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 12, radius: 135, rings: 2, ringStep: 56, scaleDecay: 0.78 },
            { ...createDefaultModifier("noise-scale"), noiseType: "radial", target: "scale-color", minScale: 0.65, maxScale: 1.4, colorB: "#9b8de0", seamless: true },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Center Medallion",
          transform: { x: 256, y: 256, width: 140, height: 140, rotation: 0 },
          shape: { motifType: "star", points: 8, innerRatio: 0.55, color: "#eff4cf" },
          surface: { finish: "foil", roughness: 0.25, metalness: 0.9, height: 0.52, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 4, stepPx: 26, alternateColor: true, colorB: "#18151d" },
          ],
        }),
      ];
      return doc;
    },
  },
];

export const STAMP_STARTERS = [
  {
    id: "stamp-warning-seal",
    name: "Industrial Warning Seal",
    group: "Stencils & Badges",
    build: () => createArtworkDocument("stamp"),
  },
  {
    id: "stamp-chevron-hazard",
    name: "Hazard Chevron Strip",
    group: "Stencils & Badges",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Hazard Chevron Strip";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Chevron Array",
          transform: { x: 256, y: 256, width: 72, height: 140, rotation: 90 },
          shape: { motifType: "chevron", color: "#e8b853" },
          surface: { finish: "ink", roughness: 0.52, metalness: 0.0, height: 0.16, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 5, rows: 1, spanX: 380, spanY: 160, alternateColor: true, colorB: "#212429" },
            { ...createDefaultModifier("edge-wear"), chipAmount: 0.42, chipScale: 14, bevelHeight: 0.1 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-botanical-crest",
    name: "Botanical Crest Emblem",
    group: "Emblems & Seals",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Botanical Crest Emblem";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Laurel Wreath",
          transform: { x: 256, y: 256, width: 34, height: 68, rotation: 0 },
          shape: { motifType: "leaf", color: "#90b88f" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.88, height: 0.42, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 14, radius: 145, rings: 1, sweep: 280, startAngle: 130, alignTangent: true },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Core Medallion",
          transform: { x: 256, y: 256, width: 170, height: 170, rotation: 0 },
          shape: { motifType: "gear", points: 10, innerRatio: 0.78, color: "#e8c27a" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.95, height: 0.55, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 2, stepPx: 50, alternateColor: true, colorB: "#1c2026" },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-scuff-cluster",
    name: "Noise Scuff & Abrasion",
    group: "Surface Wear",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Noise Scuff & Abrasion";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Micro Scuff Marks",
          transform: { x: 256, y: 256, width: 58, height: 12, rotation: 28 },
          shape: { motifType: "stripe", color: "#b6bcc6", colorB: "#5a6069" },
          surface: { finish: "rubber", roughness: 0.88, metalness: 0.0, height: -0.25, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 6, rows: 6, spanX: 300, spanY: 300 },
            { ...createDefaultModifier("noise-jitter"), posJitter: 28, rotJitter: 65, scaleJitter: 0.45, dropout: 0.25, seed: 519 },
            { ...createDefaultModifier("noise-scale"), noiseType: "radial", target: "scale-opacity", minScale: 0.2, maxScale: 1.4, curve: "smoothstep", seamless: false },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-calibration-target",
    name: "Precision Optical Target",
    group: "Technical Decals",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Precision Optical Target";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Concentric Rings",
          transform: { x: 256, y: 256, width: 340, height: 340, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.84, color: "#eff4cf" },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 3, stepPx: 72, alternateColor: true, colorB: "#76b2d8" },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Crosshair Reticle",
          transform: { x: 256, y: 256, width: 390, height: 18, rotation: 0 },
          shape: { motifType: "cross", innerRatio: 0.06, color: "#e8c27a" },
        }),
      ];
      return doc;
    },
  },
];

export function listPatternStarterCatalog() {
  const legacy = patternStarterCatalog.map((entry) => ({
    id: `legacy:${entry.name}`,
    name: entry.name,
    group: entry.group || "Archive",
    legacyName: entry.name,
  }));
  const noiseOnes = NOISE_SCALED_STARTERS.map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    starter: s,
  }));
  return [...noiseOnes, ...legacy];
}

export function listStampStarterCatalog() {
  return STAMP_STARTERS.map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    starter: s,
  }));
}

function mapLegacyKind(kind) {
  switch (kind) {
    case "circle": return "circle";
    case "ring": return "ring";
    case "rect": return "square";
    case "diamond": return "diamond";
    case "triangle": return "triangle";
    case "star": return "star";
    case "cross": return "cross";
    case "polygon": return "hexagon";
    case "stripe": return "stripe";
    case "arc": return "arc";
    default: return "square";
  }
}

export function loadStarterAsArtworkDocument(entry) {
  if (entry.starter) return structuredClone(entry.starter.build());
  const legacy = patternStarter(entry.legacyName || entry.name);
  const doc = createArtworkDocument("pattern");
  doc.name = legacy.name || entry.name;
  doc.background = {
    enabled: true,
    color: legacy.background || "#eee8dc",
    opacity: legacy.backgroundOpacity ?? 1,
    finish: "cotton",
    roughness: 0.82,
    metalness: 0.0,
    height: 0.0,
  };
  doc.tiling = {
    mode: legacy.repeat || "straight",
    repeats: Math.max(1, Math.min(8, Math.round(legacy.repeats || 2))),
    showGrid: false,
  };

  // Convert legacy flat layers into clean ArtworkStackEngine layers (preserving colors, positions, finishes, and geometry)
  doc.layers = (legacy.layers || []).slice(0, 48).map((l, idx) => {
    const fin = l.finish || "ink";
    const roughMap = { ink: 0.62, cotton: 0.84, wool: 0.94, ceramic: 0.2, foil: 0.26 };
    const metalMap = { ink: 0, cotton: 0, wool: 0, ceramic: 0, foil: 1 };
    const isText = l.kind === "text";
    return createArtworkLayer(isText ? "text" : "motif", {
      name: l.name || `Layer ${idx + 1}`,
      visible: l.visible !== false,
      locked: l.locked === true,
      opacity: l.opacity ?? 1,
      transform: {
        x: l.x ?? ARTWORK_SIZE * 0.5,
        y: l.y ?? ARTWORK_SIZE * 0.5,
        width: l.width ?? 64,
        height: l.height ?? 64,
        rotation: l.rotation ?? 0,
      },
      shape: {
        motifType: mapLegacyKind(l.kind),
        sides: l.sides || 6,
        points: l.points || 5,
        innerRatio: l.innerRatio ?? 0.46,
        cornerRadius: l.radius ? Math.min(0.5, l.radius / Math.max(1, l.width || 64)) : 0.12,
        strokeWidth: l.strokeWidth || 0,
        strokeColor: l.stroke || "#16181c",
        color: l.color || "#e8c27a",
        fillMode: "solid",
      },
      ...(isText && l.text ? { text: { ...l.text } } : {}),
      surface: {
        finish: fin,
        roughness: roughMap[fin] ?? 0.6,
        metalness: metalMap[fin] ?? 0,
        height: l.relief ?? 0.16,
        enableAlbedo: true,
        enableRoughness: true,
        enableMetalness: true,
        enableHeight: true,
      },
    });
  });
  return doc;
}
