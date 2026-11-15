/*==========================================================================================================================================
                                                            ARTWORKSTARTERS.JS
==========================================================================================================================================*/
/* The self-contained starter documents of TextureStudio's StarterCatalogBridge.js (NOISE_SCALED_STARTERS + STAMP_STARTERS), copied verbatim.
   Only these two tables are taken: they build documents purely from ArtworkStackEngine, while the rest of the bridge pulls in the whole
   legacy pattern archive (heritage, rugs, stitches …), which this card does not need. */

import { createArtworkDocument, createArtworkLayer, createDefaultModifier } from "./ArtworkStackEngine.js";

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
  // --- CANDY & CONFECTIONERY PATTERNS ---
  {
    id: "candy-peppermint-stripe",
    name: "Candy Cane Barber Stripe",
    group: "Candy & Confectionery",
    description: "Glossy diagonal peppermint red and ivory sugar stripes with beveled candy glaze.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Candy Cane Barber Stripe";
      doc.background = { enabled: true, color: "#faf5f2", opacity: 1, finish: "ceramic", roughness: 0.14, metalness: 0, height: 0.05 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Crimson Candy Stripes",
          transform: { x: 256, y: 256, width: 760, height: 42, rotation: -35 },
          shape: { motifType: "stripe", color: "#db1832", strokeWidth: 4, strokeColor: "#ffd6dc" },
          surface: { finish: "ceramic", roughness: 0.12, metalness: 0, height: 0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 1, rows: 6, spanX: 512, spanY: 512 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Thin Mint Accent",
          transform: { x: 256, y: 256, width: 760, height: 10, rotation: -35 },
          shape: { motifType: "stripe", color: "#5be3b8" },
          surface: { finish: "ceramic", roughness: 0.16, metalness: 0, height: 0.25, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 1, rows: 6, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "candy-sprinkle-confetti",
    name: "Sprinkle Confetti Party",
    group: "Candy & Confectionery",
    description: "Multi-color rainbow pill sprinkles scattered randomly over frosted buttercream glaze.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Sprinkle Confetti Party";
      doc.background = { enabled: true, color: "#fff6ee", opacity: 1, finish: "ceramic", roughness: 0.28, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Berry & Lemon Sprinkles",
          transform: { x: 256, y: 256, width: 28, height: 10, rotation: 20 },
          shape: { motifType: "roundedRect", cornerRadius: 0.5, color: "#ff4f87", colorB: "#ffcb36" },
          surface: { finish: "ceramic", roughness: 0.15, metalness: 0, height: 0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 10, rows: 10, spanX: 512, spanY: 512, alternateColor: true, colorB: "#ffcb36" },
            { ...createDefaultModifier("noise-jitter"), posJitter: 18, rotJitter: 165, scaleJitter: 0.25, dropout: 0.15, seed: 404 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Mint & Sky Sprinkles",
          transform: { x: 278, y: 242, width: 26, height: 10, rotation: -32 },
          shape: { motifType: "roundedRect", cornerRadius: 0.5, color: "#35dca8", colorB: "#5ec0ff" },
          surface: { finish: "ceramic", roughness: 0.16, metalness: 0, height: 0.42, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 8, rows: 8, spanX: 512, spanY: 512, alternateColor: true, colorB: "#8f75ff" },
            { ...createDefaultModifier("noise-jitter"), posJitter: 22, rotJitter: 180, scaleJitter: 0.2, dropout: 0.2, seed: 719 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "candy-pastel-checker",
    name: "Lollipop Pastel Checker",
    group: "Candy & Confectionery",
    description: "Beveled strawberry, cream, mint, and lilac hard-candy squares with sugar specular.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Lollipop Pastel Checker";
      doc.background = { enabled: true, color: "#fff8f2", opacity: 1, finish: "ceramic", roughness: 0.14, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Glazed Sugar Squares",
          transform: { x: 256, y: 256, width: 58, height: 58, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.22, color: "#ff6b9d", colorB: "#6ce6c0", strokeWidth: 3, strokeColor: "#ffffff" },
          surface: { finish: "ceramic", roughness: 0.11, metalness: 0, height: 0.48, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 8, rows: 8, spanX: 512, spanY: 512, alternateColor: true, colorB: "#6ce6c0" },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Lemon Pearl Drops",
          transform: { x: 256, y: 256, width: 14, height: 14, rotation: 0 },
          shape: { motifType: "circle", color: "#fff19e" },
          surface: { finish: "ceramic", roughness: 0.12, metalness: 0, height: 0.62, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "brick", columns: 8, rows: 8, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "candy-sour-starburst",
    name: "Sour Sugar Starburst",
    group: "Candy & Confectionery",
    description: "Faceted radial confetti stars in citrus orange, lime, raspberry and grape sugar glazes.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Sour Sugar Starburst";
      doc.background = { enabled: true, color: "#291436", opacity: 1, finish: "ceramic", roughness: 0.22, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Candy Stars",
          transform: { x: 256, y: 256, width: 42, height: 42, rotation: 0 },
          shape: { motifType: "star", points: 5, innerRatio: 0.44, color: "#ff5488", colorB: "#42e39a" },
          surface: { finish: "ceramic", roughness: 0.18, metalness: 0, height: 0.55, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 9, rows: 9, spanX: 512, spanY: 512, alternateColor: true, colorB: "#ffbc36" },
            { ...createDefaultModifier("noise-scale"), noiseType: "perlin", target: "scale-color", minScale: 0.55, maxScale: 1.35, frequency: 4, colorB: "#45d4ff", seamless: true },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "candy-caramel-waffle",
    name: "Caramel Waffle Cone",
    group: "Candy & Confectionery",
    description: "Crisp toasted waffle grid relief in warm golden caramel and honey glaze.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Caramel Waffle Cone";
      doc.background = { enabled: true, color: "#783f12", opacity: 1, finish: "ink", roughness: 0.58, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Crisp Wafer Cells",
          transform: { x: 256, y: 256, width: 42, height: 42, rotation: 45 },
          shape: { motifType: "roundedRect", cornerRadius: 0.12, color: "#d68f3a", strokeWidth: 5, strokeColor: "#5e2d0c" },
          surface: { finish: "ceramic", roughness: 0.44, metalness: 0, height: 0.65, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 10, rows: 10, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "candy-gingham-sugar",
    name: "Gingham Picnic Sugar",
    group: "Candy & Confectionery",
    description: "Strawberry milk & marshmallow cream crosshatch gingham bands with satin sheen.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Gingham Picnic Sugar";
      doc.background = { enabled: true, color: "#fff7fa", opacity: 1, finish: "cotton", roughness: 0.62, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Horizontal Ribbon",
          transform: { x: 256, y: 256, width: 512, height: 32, rotation: 0 },
          shape: { motifType: "stripe", color: "#ff75a0" },
          opacity: 0.55,
          surface: { finish: "cotton", roughness: 0.55, metalness: 0, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 1, rows: 8, spanX: 512, spanY: 512 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Vertical Ribbon",
          transform: { x: 256, y: 256, width: 32, height: 512, rotation: 0 },
          shape: { motifType: "stripe", color: "#ff477e" },
          opacity: 0.5,
          surface: { finish: "cotton", roughness: 0.52, metalness: 0, height: 0.34, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 8, rows: 1, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  // --- ART DECO & ARCHITECTURAL ---
  {
    id: "deco-peacock-fans",
    name: "Art Deco Peacock Fans",
    group: "Art Deco & Architectural",
    description: "Metallic brushed gold Art Deco concentric scallop fans on deep emerald enamel.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Art Deco Peacock Fans";
      doc.background = { enabled: true, color: "#0c2b26", opacity: 1, finish: "ceramic", roughness: 0.18, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Gold Scallop Fans",
          transform: { x: 256, y: 256, width: 92, height: 92, rotation: 0 },
          shape: { motifType: "arc", color: "#e8c27a", strokeWidth: 4, strokeColor: "#fff1c7" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.94, height: 0.5, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "brick", columns: 6, rows: 6, spanX: 512, spanY: 512 },
            { ...createDefaultModifier("inset-echo"), copies: 3, stepPx: 18, alternateColor: true, colorB: "#103a34" },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "deco-bauhaus-arcs",
    name: "Bauhaus Concentric Tiles",
    group: "Art Deco & Architectural",
    description: "Terracotta, cobalt, and warm ochre mid-century ceramic quarter-circle relief tiles.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Bauhaus Concentric Tiles";
      doc.background = { enabled: true, color: "#ebe3d3", opacity: 1, finish: "ceramic", roughness: 0.5, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Geometric Arcs",
          transform: { x: 256, y: 256, width: 78, height: 78, rotation: 45 },
          shape: { motifType: "ring", innerRatio: 0.54, color: "#c44b2b", colorB: "#1d4e78" },
          surface: { finish: "ceramic", roughness: 0.3, metalness: 0, height: 0.44, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 6, rows: 6, spanX: 512, spanY: 512, alternateColor: true, colorB: "#1d4e78" },
            { ...createDefaultModifier("noise-jitter"), posJitter: 0, rotJitter: 90, scaleJitter: 0, seed: 88 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "deco-zellige-stars",
    name: "Moroccan Zellige Star Lattice",
    group: "Art Deco & Architectural",
    description: "Hand-glazed teal, turquoise, and ivory 8-point geometric tile mosaic.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Moroccan Zellige Star Lattice";
      doc.background = { enabled: true, color: "#ede6d6", opacity: 1, finish: "ceramic", roughness: 0.35, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Glazed Zellige Stars",
          transform: { x: 256, y: 256, width: 68, height: 68, rotation: 22.5 },
          shape: { motifType: "star", points: 8, innerRatio: 0.56, color: "#196f6b", strokeWidth: 3, strokeColor: "#f7f3ea" },
          surface: { finish: "ceramic", roughness: 0.16, metalness: 0, height: 0.52, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 6, rows: 6, spanX: 512, spanY: 512, alternateColor: true, colorB: "#2589a1" },
          ],
        }),
      ];
      return doc;
    },
  },
  // --- TECH & HARD-SURFACE ---
  {
    id: "tech-brass-knurling",
    name: "Precision Brass Knurling",
    group: "Tech & Hard-Surface",
    description: "Tight micro-pyramid CNC diamond knurl pattern in anodized brass and gunmetal.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Precision Brass Knurling";
      doc.background = { enabled: true, color: "#24211b", opacity: 1, finish: "foil", roughness: 0.42, metalness: 0.85, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Diamond Knurl Facets",
          transform: { x: 256, y: 256, width: 24, height: 24, rotation: 0 },
          shape: { motifType: "diamond", color: "#d4af63", strokeWidth: 2, strokeColor: "#382f1f" },
          surface: { finish: "foil", roughness: 0.25, metalness: 0.96, height: 0.72, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 18, rows: 18, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "tech-carbon-twill",
    name: "Carbon Fiber Micro Twill",
    group: "Tech & Hard-Surface",
    description: "Tight diagonal carbon-fiber tow weave with anisotropic sheen and specular contrast.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Carbon Fiber Micro Twill";
      doc.background = { enabled: true, color: "#121316", opacity: 1, finish: "ink", roughness: 0.45, metalness: 0.2, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "2x2 Carbon Tows",
          transform: { x: 256, y: 256, width: 32, height: 14, rotation: 45 },
          shape: { motifType: "roundedRect", cornerRadius: 0.25, color: "#2c313b", colorB: "#1e2229" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.35, height: 0.38, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "brick", columns: 14, rows: 14, spanX: 512, spanY: 512, alternateColor: true, colorB: "#1a1d23" },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "tech-hex-vent",
    name: "Hexagonal Vapor Vent",
    group: "Tech & Hard-Surface",
    description: "Machined honeycomb ventilation grille over brushed titanium acoustic backing.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Hexagonal Vapor Vent";
      doc.background = { enabled: true, color: "#2d323a", opacity: 1, finish: "foil", roughness: 0.32, metalness: 0.9, height: 0.45 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Perforated Hex Cells",
          transform: { x: 256, y: 256, width: 36, height: 36, rotation: 0 },
          shape: { motifType: "hexagon", color: "#0b0d10", strokeWidth: 3, strokeColor: "#7c8594" },
          surface: { finish: "ink", roughness: 0.85, metalness: 0.05, height: -0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 11, rows: 11, spanX: 512, spanY: 512 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "tech-terrazzo-confetti",
    name: "Perlin Terrazzo Confetti",
    group: "Noise & Procedural",
    description: "Organic speckled architectural terrazzo mineral chips suspended in polished limestone.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Perlin Terrazzo Confetti";
      doc.background = { enabled: true, color: "#ebe6dc", opacity: 1, finish: "ceramic", roughness: 0.25, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Coral & Sage Chips",
          transform: { x: 256, y: 256, width: 26, height: 18, rotation: 15 },
          shape: { motifType: "triangle", color: "#d46a4e", colorB: "#5a8c76" },
          surface: { finish: "ceramic", roughness: 0.16, metalness: 0, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 10, rows: 10, spanX: 512, spanY: 512, alternateColor: true, colorB: "#5a8c76" },
            { ...createDefaultModifier("noise-jitter"), posJitter: 24, rotJitter: 180, scaleJitter: 0.45, dropout: 0.2, seed: 912 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Brass & Charcoal Flecks",
          transform: { x: 256, y: 256, width: 16, height: 14, rotation: 40 },
          shape: { motifType: "diamond", color: "#d6a43e", colorB: "#2b2e33" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.55, height: 0.28, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 9, rows: 9, spanX: 512, spanY: 512, alternateColor: true, colorB: "#2b2e33" },
            { ...createDefaultModifier("noise-jitter"), posJitter: 28, rotJitter: 180, scaleJitter: 0.5, dropout: 0.3, seed: 251 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "noise-topographic-contours",
    name: "Topographic Contour Waves",
    group: "Noise & Procedural",
    description: "Warped organic iso-elevation rings with metallic gold ridge contrast.",
    build: () => {
      const doc = createArtworkDocument("pattern");
      doc.name = "Topographic Contour Waves";
      doc.background = { enabled: true, color: "#151c22", opacity: 1, finish: "ink", roughness: 0.7, metalness: 0, height: 0 };
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Elevation Contours",
          transform: { x: 256, y: 256, width: 220, height: 220, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.88, color: "#e8c27a", strokeWidth: 2, strokeColor: "#4da6a9" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.88, height: 0.42, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("inset-echo"), copies: 5, stepPx: 32, alternateColor: true, colorB: "#4da6a9" },
            { ...createDefaultModifier("warp"), warpType: "wave", amplitude: 22, frequency: 3 },
          ],
        }),
      ];
      return doc;
    },
  },
];

export const STAMP_STARTERS = [
  {
    id: "stamp-basic-circle",
    name: "Solid Circle Disc",
    group: "Basic Shapes",
    description: "Clean centered circular decal stamp with subtle enamel gloss relief.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Solid Circle Disc";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Solid Disc",
          transform: { x: 256, y: 256, width: 300, height: 300, rotation: 0 },
          shape: { motifType: "circle", color: "#eaecef" },
          surface: { finish: "ink", roughness: 0.38, metalness: 0, height: 0.25, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-ring",
    name: "Clean Halo Ring",
    group: "Basic Shapes",
    description: "Precision uniform annular ring stamp for port bezels, gauges, and badges.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Clean Halo Ring";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Halo Ring",
          transform: { x: 256, y: 256, width: 320, height: 320, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.68, color: "#dce2eb" },
          surface: { finish: "foil", roughness: 0.26, metalness: 0.85, height: 0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-square",
    name: "Rounded Plate Square",
    group: "Basic Shapes",
    description: "Crisp chamfered square placard stamp ready for stenciling labels and panels.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Rounded Plate Square";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Rounded Plate",
          transform: { x: 256, y: 256, width: 290, height: 290, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.16, color: "#cfd6df", strokeWidth: 8, strokeColor: "#252930" },
          surface: { finish: "ink", roughness: 0.44, metalness: 0.1, height: 0.3, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-triangle",
    name: "Delta Warning Triangle",
    group: "Basic Shapes",
    description: "Bold equilateral delta triangle decal for cautionary markers and directionals.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Delta Warning Triangle";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Delta Triangle",
          transform: { x: 256, y: 270, width: 300, height: 275, rotation: 0 },
          shape: { motifType: "triangle", color: "#f2b838", strokeWidth: 10, strokeColor: "#1d1f24" },
          surface: { finish: "ink", roughness: 0.42, metalness: 0, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-star",
    name: "Five-Point Badge Star",
    group: "Basic Shapes",
    description: "Classic crisp 5-point star emblem with metallic satin finish.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Five-Point Badge Star";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Star Emblem",
          transform: { x: 256, y: 256, width: 310, height: 310, rotation: 0 },
          shape: { motifType: "star", points: 5, innerRatio: 0.42, color: "#e8c468" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.92, height: 0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-hexagon",
    name: "Hexagon Fastener Plate",
    group: "Basic Shapes",
    description: "Clean 6-sided machined hex shape for industrial hardware and sci-fi panels.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Hexagon Fastener Plate";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Hexagon Plate",
          transform: { x: 256, y: 256, width: 300, height: 300, rotation: 0 },
          shape: { motifType: "hexagon", color: "#8d99a8", strokeWidth: 8, strokeColor: "#1f242c" },
          surface: { finish: "foil", roughness: 0.3, metalness: 0.88, height: 0.48, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-diamond",
    name: "Precision Diamond Pip",
    group: "Basic Shapes",
    description: "Sharp 45-degree geometric diamond alignment marker.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Precision Diamond Pip";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Diamond Pip",
          transform: { x: 256, y: 256, width: 250, height: 250, rotation: 0 },
          shape: { motifType: "diamond", color: "#58b4ff" },
          surface: { finish: "ink", roughness: 0.34, metalness: 0.05, height: 0.25, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-cross",
    name: "Calibration Plus Cross",
    group: "Basic Stencils",
    description: "Clean registration plus-cross stamp for medical, technical, and fiducial placement.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Calibration Plus Cross";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Plus Cross",
          transform: { x: 256, y: 256, width: 300, height: 300, rotation: 0 },
          shape: { motifType: "cross", innerRatio: 0.26, color: "#eff4cf" },
          surface: { finish: "ink", roughness: 0.4, metalness: 0, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-arrow-chevron",
    name: "Directional Chevron Stencil",
    group: "Basic Stencils",
    description: "Bold single stencil chevron pointer for flow arrows and latch indicators.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Directional Chevron Stencil";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Chevron Arrow",
          transform: { x: 256, y: 256, width: 220, height: 240, rotation: 0 },
          shape: { motifType: "chevron", color: "#ff7847" },
          surface: { finish: "ink", roughness: 0.46, metalness: 0, height: 0.2, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-stripes",
    name: "Parallel Caution Bars",
    group: "Basic Stencils",
    description: "Three parallel angled paint bars for technical hull decals and grip strips.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Parallel Caution Bars";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Caution Bars",
          transform: { x: 256, y: 256, width: 260, height: 36, rotation: -35 },
          shape: { motifType: "stripe", color: "#e8ecef" },
          surface: { finish: "ink", roughness: 0.45, metalness: 0, height: 0.18, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 1, rows: 3, spanX: 260, spanY: 165 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-corners",
    name: "Corner Frame Bracket",
    group: "Basic Stencils",
    description: "Symmetric 4-corner radial framing bracket stencil for UI bays and plates.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Corner Frame Bracket";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Corner Lugs",
          transform: { x: 256, y: 256, width: 76, height: 18, rotation: 0 },
          shape: { motifType: "chevron", color: "#cbd4e1" },
          surface: { finish: "ink", roughness: 0.42, metalness: 0.2, height: 0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 4, radius: 148, rings: 1, startAngle: 45, alignTangent: true },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-basic-rivet-grid",
    name: "4x4 Fastener Rivet Grid",
    group: "Basic Stencils",
    description: "Clean metallic button rivet array with raised dome height and metallic specular.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "4x4 Fastener Rivet Grid";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Rivet Array",
          transform: { x: 256, y: 256, width: 40, height: 40, rotation: 0 },
          shape: { motifType: "circle", color: "#aab4c2", strokeWidth: 4, strokeColor: "#262b33" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.92, height: 0.72, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 4, rows: 4, spanX: 280, spanY: 280 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-warning-seal",
    name: "Industrial Warning Seal",
    group: "Stencils & Badges",
    description: "Industrial cautionary stamp emblem with recessed ring borders.",
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
  // --- HARD SURFACE DECAL STAMPS ---
  {
    id: "stamp-hs-hex-bolt",
    name: "Hex Bolt & Machined Washer",
    group: "Hard Surface",
    description: "Machined metallic hex bolt head seated in a beveled washer collar with center tool dimple.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Hex Bolt & Machined Washer";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Washer Seat Collar",
          transform: { x: 256, y: 256, width: 360, height: 360, rotation: 0 },
          shape: { motifType: "circle", color: "#555d69", strokeWidth: 8, strokeColor: "#1a1e24" },
          surface: { finish: "foil", roughness: 0.34, metalness: 0.92, height: 0.42, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Hex Bolt Head",
          transform: { x: 256, y: 256, width: 245, height: 245, rotation: 30 },
          shape: { motifType: "hexagon", color: "#aeb8c6", strokeWidth: 10, strokeColor: "#232830" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.96, height: 0.85, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Center Tool Recess",
          transform: { x: 256, y: 256, width: 76, height: 76, rotation: 0 },
          shape: { motifType: "circle", color: "#2b3038", strokeWidth: 4, strokeColor: "#7c8594" },
          surface: { finish: "foil", roughness: 0.48, metalness: 0.75, height: 0.18, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-countersunk-screw",
    name: "Countersunk Phillips Screw",
    group: "Hard Surface",
    description: "Flush-mount countersunk machine screw with chamfered bore ring and recessed cross drive.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Countersunk Phillips Screw";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Countersunk Chamfer Ring",
          transform: { x: 256, y: 256, width: 320, height: 320, rotation: 0 },
          shape: { motifType: "circle", color: "#8d96a4", strokeWidth: 14, strokeColor: "#1b1e24" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.94, height: 0.56, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Inner Screw Cap",
          transform: { x: 256, y: 256, width: 224, height: 224, rotation: 0 },
          shape: { motifType: "circle", color: "#aeb6c3", strokeWidth: 6, strokeColor: "#363c46" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.96, height: 0.68, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Phillips Cross Slot",
          transform: { x: 256, y: 256, width: 152, height: 152, rotation: 45 },
          shape: { motifType: "cross", innerRatio: 0.28, color: "#1d2128" },
          surface: { finish: "rubber", roughness: 0.72, metalness: 0.35, height: -0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-access-hatch",
    name: "Service Access Hatch",
    group: "Hard Surface",
    description: "Beveled hull maintenance hatch plate with 4 corner rivets, recessed seam, and stencil tag.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Service Access Hatch";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Outer Bevel Frame",
          transform: { x: 256, y: 256, width: 410, height: 320, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.1, color: "#59626e", strokeWidth: 12, strokeColor: "#1a1e24" },
          surface: { finish: "foil", roughness: 0.36, metalness: 0.86, height: 0.52, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Inner Hatch Door",
          transform: { x: 256, y: 256, width: 356, height: 266, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.08, color: "#76808d", strokeWidth: 6, strokeColor: "#232830" },
          surface: { finish: "foil", roughness: 0.32, metalness: 0.88, height: 0.65, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Latch Handle Slot",
          transform: { x: 256, y: 318, width: 130, height: 34, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.35, color: "#252932", strokeWidth: 4, strokeColor: "#b4becb" },
          surface: { finish: "rubber", roughness: 0.65, metalness: 0.3, height: -0.22, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Corner Rivets",
          transform: { x: 256, y: 256, width: 26, height: 26, rotation: 0 },
          shape: { motifType: "circle", color: "#c8d0dc", strokeWidth: 4, strokeColor: "#252a32" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.96, height: 0.82, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 2, rows: 2, spanX: 300, spanY: 210 },
          ],
        }),
        createArtworkLayer("text", {
          name: "Access Stencil",
          transform: { x: 256, y: 214, width: 240, height: 64, rotation: 0 },
          shape: { color: "#e8c27a" },
          text: { value: "ACCESS P-04", fontFamily: "DM Sans", fontWeight: 700, fontSize: 34, letterSpacing: 2, align: "center" },
          surface: { finish: "ink", roughness: 0.52, metalness: 0.15, height: 0.48, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-louver-vent",
    name: "Louvered Cooling Vent",
    group: "Hard Surface",
    description: "Machined recessed chassis intake plate with 6 slotted cooling louvers and corner bolts.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Louvered Cooling Vent";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Vent Mounting Plate",
          transform: { x: 256, y: 256, width: 390, height: 340, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.09, color: "#687280", strokeWidth: 10, strokeColor: "#1b1f26" },
          surface: { finish: "foil", roughness: 0.34, metalness: 0.88, height: 0.5, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Slotted Louver Vents",
          transform: { x: 256, y: 256, width: 270, height: 34, rotation: 0 },
          shape: { motifType: "stripe", color: "#15181e", strokeWidth: 3, strokeColor: "#9aa4b4" },
          surface: { finish: "rubber", roughness: 0.82, metalness: 0.15, height: -0.52, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 1, rows: 6, spanX: 270, spanY: 220 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Corner Hex Fasteners",
          transform: { x: 256, y: 256, width: 26, height: 26, rotation: 30 },
          shape: { motifType: "hexagon", color: "#c2cbd8", strokeWidth: 3, strokeColor: "#22272f" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.96, height: 0.78, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 2, rows: 2, spanX: 320, spanY: 268 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-honeycomb-grille",
    name: "Hex Mesh Intake Grille",
    group: "Hard Surface",
    description: "Circular heavy machined bezel with hexagonal air intake perforations.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Hex Mesh Intake Grille";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Intake Housing",
          transform: { x: 256, y: 256, width: 370, height: 370, rotation: 0 },
          shape: { motifType: "circle", color: "#4e5662", strokeWidth: 14, strokeColor: "#181b21" },
          surface: { finish: "foil", roughness: 0.32, metalness: 0.9, height: 0.58, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Hex Perforation Grid",
          transform: { x: 256, y: 256, width: 42, height: 42, rotation: 0 },
          shape: { motifType: "hexagon", color: "#15181d", strokeWidth: 3, strokeColor: "#8c96a6" },
          surface: { finish: "rubber", roughness: 0.85, metalness: 0.1, height: -0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "hex", columns: 5, rows: 5, spanX: 210, spanY: 210 },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Machined Bezel Rim",
          transform: { x: 256, y: 256, width: 356, height: 356, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.78, color: "#9ba5b4", strokeWidth: 4, strokeColor: "#232830" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.95, height: 0.76, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-cam-latch",
    name: "Quarter-Turn Cam Latch",
    group: "Hard Surface",
    description: "Knurled mechanical quarter-turn fastener lock with slotted keyway and index chevron.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Quarter-Turn Cam Latch";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Knurled Collar",
          transform: { x: 256, y: 256, width: 350, height: 350, rotation: 0 },
          shape: { motifType: "gear", points: 18, innerRatio: 0.86, color: "#8893a3", strokeWidth: 6, strokeColor: "#1b1f26" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.94, height: 0.62, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Inner Latch Cylinder",
          transform: { x: 256, y: 256, width: 220, height: 220, rotation: 0 },
          shape: { motifType: "circle", color: "#b6c0ce", strokeWidth: 8, strokeColor: "#282e37" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.96, height: 0.74, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Keyway Slot",
          transform: { x: 256, y: 256, width: 170, height: 42, rotation: -30 },
          shape: { motifType: "stripe", color: "#191c22" },
          surface: { finish: "rubber", roughness: 0.76, metalness: 0.25, height: -0.45, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Lock Alignment Pip",
          transform: { x: 256, y: 112, width: 34, height: 28, rotation: 0 },
          shape: { motifType: "triangle", color: "#e85c43" },
          surface: { finish: "ink", roughness: 0.42, metalness: 0.05, height: 0.58, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-serial-dataplate",
    name: "Machined Serial Data Plate",
    group: "Hard Surface",
    description: "Anodized specification placard with corner rivets, etched ID code, and alignment grid.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Machined Serial Data Plate";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Anodized Plate Base",
          transform: { x: 256, y: 256, width: 420, height: 230, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.08, color: "#282d36", strokeWidth: 10, strokeColor: "#b4becb" },
          surface: { finish: "foil", roughness: 0.36, metalness: 0.85, height: 0.46, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Corner Pin Rivets",
          transform: { x: 256, y: 256, width: 22, height: 22, rotation: 0 },
          shape: { motifType: "circle", color: "#d8dfe8", strokeWidth: 3, strokeColor: "#14171c" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.96, height: 0.8, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 2, rows: 2, spanX: 355, spanY: 165 },
          ],
        }),
        createArtworkLayer("text", {
          name: "Model Code",
          transform: { x: 256, y: 224, width: 320, height: 64, rotation: 0 },
          shape: { color: "#eff4cf" },
          text: { value: "UNIT // MK-07", fontFamily: "DM Sans", fontWeight: 700, fontSize: 38, letterSpacing: 2, align: "center" },
          surface: { finish: "ink", roughness: 0.38, metalness: 0.25, height: 0.5, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Code Matrix Bars",
          transform: { x: 256, y: 292, width: 24, height: 26, rotation: 90 },
          shape: { motifType: "stripe", color: "#e8c27a" },
          surface: { finish: "foil", roughness: 0.3, metalness: 0.88, height: 0.54, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 8, rows: 1, spanX: 250, spanY: 30, alternateColor: true, colorB: "#7d8896" },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-hydraulic-port",
    name: "Hydraulic Coupler Port",
    group: "Hard Surface",
    description: "Machined stepped fluid/pneumatic socket with anodized collar ring and hex boss.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Hydraulic Coupler Port";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Hex Boss Seat",
          transform: { x: 256, y: 256, width: 350, height: 350, rotation: 0 },
          shape: { motifType: "hexagon", color: "#687280", strokeWidth: 10, strokeColor: "#181b21" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.92, height: 0.55, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Anodized Seal Collar",
          transform: { x: 256, y: 256, width: 250, height: 250, rotation: 0 },
          shape: { motifType: "ring", innerRatio: 0.68, color: "#d6523b", strokeWidth: 5, strokeColor: "#1d2027" },
          surface: { finish: "foil", roughness: 0.24, metalness: 0.85, height: 0.68, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Recessed Port Bore",
          transform: { x: 256, y: 256, width: 150, height: 150, rotation: 0 },
          shape: { motifType: "circle", color: "#15181e", strokeWidth: 8, strokeColor: "#aeb8c6" },
          surface: { finish: "rubber", roughness: 0.8, metalness: 0.2, height: -0.5, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-rivet-seam",
    name: "Armor Seam & Rivet Strip",
    group: "Hard Surface",
    description: "Linear structural armor butt-strap with twin staggered rows of dome rivets.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Armor Seam & Rivet Strip";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Seam Strap Plate",
          transform: { x: 256, y: 256, width: 440, height: 150, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.06, color: "#66707d", strokeWidth: 8, strokeColor: "#191c22" },
          surface: { finish: "foil", roughness: 0.34, metalness: 0.88, height: 0.48, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Center Seam Groove",
          transform: { x: 256, y: 256, width: 420, height: 18, rotation: 0 },
          shape: { motifType: "stripe", color: "#1a1d24" },
          surface: { finish: "rubber", roughness: 0.78, metalness: 0.2, height: -0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Staggered Dome Rivets",
          transform: { x: 256, y: 256, width: 26, height: 26, rotation: 0 },
          shape: { motifType: "circle", color: "#cbd3df", strokeWidth: 4, strokeColor: "#232831" },
          surface: { finish: "foil", roughness: 0.2, metalness: 0.96, height: 0.86, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-grid"), layout: "grid", columns: 6, rows: 2, spanX: 350, spanY: 82 },
          ],
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-warning-placard",
    name: "Caution Stencil Placard",
    group: "Hard Surface",
    description: "Industrial caution panel decal with bold delta hazard triangle and warning label.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Caution Stencil Placard";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Placard Frame",
          transform: { x: 256, y: 256, width: 410, height: 240, rotation: 0 },
          shape: { motifType: "roundedRect", cornerRadius: 0.08, color: "#1d2026", strokeWidth: 10, strokeColor: "#e8b43c" },
          surface: { finish: "ink", roughness: 0.48, metalness: 0.1, height: 0.32, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Hazard Delta",
          transform: { x: 146, y: 256, width: 105, height: 96, rotation: 0 },
          shape: { motifType: "triangle", color: "#e8b43c", strokeWidth: 4, strokeColor: "#14161a" },
          surface: { finish: "ink", roughness: 0.42, metalness: 0, height: 0.4, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("text", {
          name: "Caution Label",
          transform: { x: 318, y: 258, width: 220, height: 70, rotation: 0 },
          shape: { color: "#f4efe0" },
          text: { value: "CAUTION", fontFamily: "DM Sans", fontWeight: 700, fontSize: 42, letterSpacing: 2, align: "center" },
          surface: { finish: "ink", roughness: 0.45, metalness: 0, height: 0.38, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-gusset-bracket",
    name: "Structural Gusset Bracket",
    group: "Hard Surface",
    description: "Machined triangular load-bearing gusset plate with weight-relief bore and bolts.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Structural Gusset Bracket";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Gusset Plate",
          transform: { x: 256, y: 274, width: 340, height: 310, rotation: 0 },
          shape: { motifType: "triangle", color: "#7c8694", strokeWidth: 12, strokeColor: "#1a1e24" },
          surface: { finish: "foil", roughness: 0.3, metalness: 0.92, height: 0.62, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Lightening Bore",
          transform: { x: 256, y: 310, width: 92, height: 92, rotation: 0 },
          shape: { motifType: "circle", color: "#191c22", strokeWidth: 6, strokeColor: "#aeb8c6" },
          surface: { finish: "rubber", roughness: 0.78, metalness: 0.2, height: -0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Apex Mounting Bolt",
          transform: { x: 256, y: 186, width: 34, height: 34, rotation: 30 },
          shape: { motifType: "hexagon", color: "#cdd5e0", strokeWidth: 3, strokeColor: "#21262e" },
          surface: { finish: "foil", roughness: 0.22, metalness: 0.96, height: 0.82, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
  {
    id: "stamp-hs-knurled-dial",
    name: "Machined Rotary Index Dial",
    group: "Hard Surface",
    description: "Precision instrumentation rotary knob with radial calibration ticks and pointer marker.",
    build: () => {
      const doc = createArtworkDocument("stamp");
      doc.name = "Machined Rotary Index Dial";
      doc.layers = [
        createArtworkLayer("motif", {
          name: "Calibration Ticks",
          transform: { x: 256, y: 256, width: 22, height: 8, rotation: 0 },
          shape: { motifType: "stripe", color: "#eff4cf" },
          surface: { finish: "ink", roughness: 0.38, metalness: 0.1, height: 0.35, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
          modifiers: [
            { ...createDefaultModifier("array-radial"), count: 12, radius: 192, rings: 1, alignTangent: true },
          ],
        }),
        createArtworkLayer("motif", {
          name: "Knurled Dial Rim",
          transform: { x: 256, y: 256, width: 310, height: 310, rotation: 0 },
          shape: { motifType: "gear", points: 20, innerRatio: 0.88, color: "#737d8b", strokeWidth: 6, strokeColor: "#181b21" },
          surface: { finish: "foil", roughness: 0.28, metalness: 0.92, height: 0.65, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Matte Face Insert",
          transform: { x: 256, y: 256, width: 220, height: 220, rotation: 0 },
          shape: { motifType: "circle", color: "#282d36", strokeWidth: 5, strokeColor: "#aab4c2" },
          surface: { finish: "rubber", roughness: 0.62, metalness: 0.2, height: 0.72, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
        createArtworkLayer("motif", {
          name: "Index Marker Chevron",
          transform: { x: 256, y: 184, width: 30, height: 34, rotation: 0 },
          shape: { motifType: "triangle", color: "#e8c27a" },
          surface: { finish: "foil", roughness: 0.26, metalness: 0.9, height: 0.8, enableAlbedo: true, enableRoughness: true, enableMetalness: true, enableHeight: true },
        }),
      ];
      return doc;
    },
  },
];

