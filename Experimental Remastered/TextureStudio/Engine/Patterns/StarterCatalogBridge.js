/*==========================================================================================================================================
                                                         STARTERCATALOGBRIDGE.JS
==========================================================================================================================================*/
/* Bridges all reusable Frontier pattern archives (Geometric, African Heritage & Inlay, Islamic Heritage, Textiles, Stitches, Rugs,
   Collections, and Noise-Scaled Procedural Patterns) plus Stamp/Decal starter kits into unified ArtworkStackEngine documents. */

import { patternStarterCatalog, patternStarter, validatePattern } from "./patternDocument.js";
import { ornamentalCatalog } from "./ornamentalConstructions.js";
import { collectionPatterns } from "./patternCollections.js";
import {
  ARTWORK_SIZE,
  artworkDocumentToSvgString,
  createArtworkDocument,
  createArtworkLayer,
  createDefaultModifier,
  evaluateArtworkDocument,
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
  {
    id: "african-procedural-kente-loom",
    name: "African Kente Noise Loom",
    group: "African Patterns",
    description: "Procedural African Kente warp bands and supplementary-weft diamond blocks modulated by weave noise.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "African Kente Noise Loom";
      doc.background = { enabled: true, color: "#191512", opacity: 1, finish: "cotton", roughness: 0.86, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Gold & Rust Warp Blocks",
          transform: { x: 256, y: 256, width: 52, height: 42, rotation: 0 },
          shape: { motifType: "square", color: "#e1a82e", colorB: "#b83b28", strokeWidth: 2, strokeColor: "#14110f" },
          surface: { finish: "cotton", roughness: 0.78, metalness: 0, height: 0.34, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "brick", columns: 8, rows: 8, spanX: 512, spanY: 512, alternateColor: true, colorB: "#1d5d46" },
            { ...createDefaultModifier("noise-scale"), noiseType: "fbm", target: "scale-color", minScale: 0.68, maxScale: 1.15, frequency: 3, colorB: "#b83b28", seamless: true },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Kente Diamond Inlay",
          transform: { x: 256, y: 256, width: 32, height: 32, rotation: 0 },
          shape: { motifType: "diamond", color: "#f6e7c1", strokeWidth: 3, strokeColor: "#12100e" },
          surface: { finish: "foil", roughness: 0.35, metalness: 0.35, height: 0.48, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 4, rows: 4, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "african-procedural-ndebele-chevrons",
    name: "Ndebele Stepped Geometry",
    group: "African Patterns",
    description: "African Ndebele-inspired crisp architectural chevron bands with contrasting chalk borders and stepped lozenges.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Ndebele Stepped Geometry";
      doc.background = { enabled: true, color: "#f2eadb", opacity: 1, finish: "ceramic", roughness: 0.72, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Primary Ochre Chevrons",
          transform: { x: 256, y: 256, width: 96, height: 84, rotation: 0 },
          shape: { motifType: "chevron", color: "#c9492f", strokeWidth: 6, strokeColor: "#15171a" },
          surface: { finish: "ink", roughness: 0.58, metalness: 0, height: 0.32, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 4, rows: 4, spanX: 512, spanY: 512, alternateColor: true, colorB: "#25667d" },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Accent Lozenge Center",
          transform: { x: 256, y: 256, width: 38, height: 38, rotation: 0 },
          shape: { motifType: "diamond", color: "#e8b43c", strokeWidth: 4, strokeColor: "#15171a" },
          surface: { finish: "ceramic", roughness: 0.36, metalness: 0, height: 0.42, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 4, rows: 4, spanX: 512, spanY: 512 },
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
    id: "stamp-african-adire-seal",
    name: "African Adire Concentric Stamp",
    group: "African Motifs",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "African Adire Concentric Stamp";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Indigo Halo Ring",
          transform: { x: 256, y: 256, width: 340, height: 340, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.78, color: "#5e8ab8", strokeWidth: 4, strokeColor: "#e6dec8" },
          surface: { finish: "ink", roughness: 0.74, metalness: 0, height: 0.14, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 3, stepPx: 74, alternateColor: true, colorB: "#d6c89d" },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Resist Bead Dots",
          transform: { x: 256, y: 256, width: 16, height: 16, rotation: 0 },
          shape: { motifType: "circle", color: "#f1e8d0" },
          surface: { finish: "ink", roughness: 0.7, metalness: 0, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 16, radius: 132, rings: 1 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Central Kola Star",
          transform: { x: 256, y: 256, width: 92, height: 92, rotation: 45 },
          shape: { motifType: "star", points: 4, innerRatio: 0.42, color: "#e8c27a" },
          surface: { finish: "ink", roughness: 0.65, metalness: 0, height: 0.25, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
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

function normalizePatternGroup(rawGroup = "", name = "") {
  const g = String(rawGroup || "");
  const n = String(name || "");
  if (
    /african/i.test(g) ||
    /african/i.test(n) ||
    /kente|bogolanfini|kuba|ndebele|yoruba|ndop|tibeb|kanga/i.test(n)
  ) {
    return "African Patterns";
  }
  return g || "Archive";
}

export function listPatternStarterCatalog() {
  const seen = new Set();
  const entries = [];
  const push = (item) => {
    if (!item?.name || item.name === "Blank") return;
    const key = item.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(item);
  };

  // Surface Noise-Scaled Procedural + Featured African Loom first
  for (const s of NOISE_SCALED_STARTERS) {
    push({
      id: s.id,
      name: s.name,
      group: normalizePatternGroup(s.group, s.name),
      subGroup: s.group,
      description: s.description || "",
      starter: s,
    });
  }

  // Merge Heritage (African traditional + Islamic geometry) & African Inlay / Collections
  for (const entry of patternStarterCatalog) {
    push({
      id: `legacy:${entry.name}`,
      name: entry.name,
      group: normalizePatternGroup(entry.group, entry.name),
      subGroup: entry.group || "Archive",
      description: entry.description || "",
      legacyName: entry.name,
    });
  }

  for (const entry of ornamentalCatalog) {
    push({
      id: `ornamental:${entry.name}`,
      name: entry.name,
      group: normalizePatternGroup(entry.group, entry.name),
      subGroup: entry.group || "Architectural Inlay",
      description: entry.description || "",
      legacyName: entry.name,
    });
  }

  for (const entry of collectionPatterns) {
    push({
      id: `collection:${entry.name}`,
      name: entry.name,
      group: normalizePatternGroup(entry.group, entry.name),
      subGroup: entry.group || "Collections",
      description: entry.description || "",
      legacyName: entry.name,
    });
  }

  return entries;
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
    case "path": return "svg-path";
    case "flower": return "flower";
    case "circle": return "circle";
    case "ellipse": return "circle";
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
  if (entry?.starter) return structuredClone(entry.starter.build());
  const legacy = patternStarter(entry?.legacyName || entry?.name);
  const doc = createArtworkDocument("pattern");
  doc.name = legacy.name || entry?.name || "Pattern";
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

  doc.layers = (legacy.layers || []).slice(0, 256).map((l, idx) => {
    const fin = l.finish || "ink";
    const roughMap = { ink: 0.62, cotton: 0.84, wool: 0.94, ceramic: 0.2, foil: 0.26 };
    const metalMap = { ink: 0, cotton: 0, wool: 0, ceramic: 0, foil: 1 };
    const isText = l.kind === "text";
    const strokeW = Number(l.strokeWidth || 0);
    const fillEnabled = l.fillEnabled !== undefined
      ? l.fillEnabled !== false
      : !(l.kind === "path" && strokeW > 0 && !l.fillSource && l.color === "#222222");
    const motifType = l.kind === "path" && !l.path ? "square" : mapLegacyKind(l.kind);
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
        motifType,
        svgPath: l.path || "",
        sides: l.sides || 6,
        points: l.starPoints || l.points || 5,
        innerRatio: l.innerRadius ?? l.innerRatio ?? 0.46,
        cornerRadius: l.cornerRadius ? Math.min(0.5, l.cornerRadius / 100) : l.radius ? Math.min(0.5, l.radius / Math.max(1, l.width || 64)) : 0.0,
        strokeWidth: strokeW,
        strokeColor: l.stroke || l.color || "#16181c",
        fillEnabled,
        fillRule: l.fillRule || "evenodd",
        flipX: !!l.flipX,
        flipY: !!l.flipY,
        color: l.color || "#e8c27a",
        fillMode: "solid",
      },
      ...(isText && l.text ? {
        text: {
          value: l.text.value || "Text",
          fontFamily: l.text.fontFamily || "DM Sans",
          fontWeight: l.text.fontWeight || 600,
          fontSize: l.text.fontSize || 48,
          letterSpacing: l.text.letterSpacing || 0,
          align: l.text.align || "center",
        },
      } : {}),
      surface: {
        finish: fin,
        roughness: l.roughness ?? roughMap[fin] ?? 0.6,
        metalness: l.metalness ?? metalMap[fin] ?? 0,
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

const _svgPreviewCache = new Map();

export function getArtworkPreviewSvg(entry, mode = "pattern", size = 72) {
  const cacheKey = `${mode}:${entry?.id || entry?.name}:${size}`;
  if (_svgPreviewCache.has(cacheKey)) return _svgPreviewCache.get(cacheKey);
  let svg = "";
  try {
    const doc = loadStarterAsArtworkDocument(entry);
    svg = artworkDocumentToSvgString(doc, { width: size, height: size, showBg: mode !== "stamp" });
  } catch {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect x="8" y="8" width="48" height="48" rx="8" fill="#46525a"/></svg>`;
  }
  if (_svgPreviewCache.size > 400) _svgPreviewCache.clear();
  _svgPreviewCache.set(cacheKey, svg);
  return svg;
}

export function buildMaterialPatternDocument(input, overrides = {}) {
  if (!input) return null;
  const repeats = overrides.repeats ?? input.repeats ?? input.tiling?.repeats ?? 3;
  const rotation = overrides.rotation ?? input.rotation ?? 0;
  const mapping = overrides.mapping ?? input.mapping ?? "uv";
  const tileAxes = overrides.tileAxes ?? input.tileAxes ?? "xy";

  // 1) Already a frontier.pattern-surface.v1 or alloy.pattern.v1
  if (input.schema === "frontier.pattern-surface.v1") {
    return { ...input, repeats, rotation, mapping, tileAxes };
  }
  if (input.schema === "alloy.pattern.v1") {
    return validatePattern({ ...input, repeats, rotation, mapping, tileAxes });
  }

  // 2) Already evaluated PBR pixel bundle from Pattern Studio (e.g. sendPatternToMaterial)
  if (input.albedo && input.roughness && input.width) {
    return {
      schema: "frontier.pattern-surface.v1",
      sourceId: input.sourceId || input.id || input.name || "custom-pattern",
      name: input.name || "Custom Pattern",
      width: input.width,
      height: input.heightPx || input.height || input.width,
      repeats,
      rotation,
      mapping,
      tileAxes,
      albedo: input.albedo,
      roughness: input.roughness,
      metalness: input.metalness,
      heightMap: input.height,
      normal: input.normal,
      version: input.version || Date.now(),
    };
  }

  // 3) Legacy catalog entry without custom ArtworkStack noise modifiers -> rich SVG vector shader document
  const entry = input.raw || input;
  if (!entry.starter && input.schema !== "frontier.artwork.v2" && !entry.doc) {
    try {
      const legacyName = entry.legacyName || entry.name;
      if (legacyName) {
        const legacyDoc = patternStarter(legacyName);
        if (legacyDoc) {
          return validatePattern({
            ...legacyDoc,
            repeats: overrides.repeats ?? legacyDoc.repeats ?? 3,
            rotation,
            mapping,
            tileAxes,
          });
        }
      }
    } catch {
      // Fall back to ArtworkStack evaluation
    }
  }

  // 4) ArtworkStack v2 doc / Noise-Scaled / African / Custom Pattern -> seamless 512x512 evaluated surface
  const doc = input.schema === "frontier.artwork.v2"
    ? input
    : entry.doc?.schema === "frontier.artwork.v2"
      ? entry.doc
      : loadStarterAsArtworkDocument(entry);
  const ev = evaluateArtworkDocument(doc, 512);
  return {
    schema: "frontier.pattern-surface.v1",
    sourceId: entry.id || doc.id || doc.name || "artwork-pattern",
    name: doc.name || entry.name || "Pattern Texture",
    width: ev.width,
    height: ev.heightPx || ev.width,
    repeats: overrides.repeats ?? doc.tiling?.repeats ?? 3,
    rotation,
    mapping,
    tileAxes,
    albedo: ev.albedo,
    roughness: ev.roughness,
    metalness: ev.metalness,
    heightMap: ev.height,
    normal: ev.normal,
    version: Date.now(),
  };
}
