import { makeLayer, makeMask, emptyDocument, normalizeDocument } from "./document.js";

// Presets are complete documents. Each one is a stack a person could have built by hand, so the
// layers carry readable ids and the parameters are the ones the sliders expose.

const L = (type, id, name, params = {}, masks = [], extra = {}) => {
  const layer = makeLayer(type, { id, name, params, masks });
  return { ...layer, ...extra };
};
const M = (type, params = {}, extra = {}) => ({ ...makeMask(type, { params }), ...extra });

function doc(name, terrain, layers, sun) {
  const base = emptyDocument();
  return normalizeDocument({
    ...base,
    name,
    terrain: { ...base.terrain, ...terrain },
    sun: { ...base.sun, ...(sun || {}) },
    layers,
  });
}

const satmap = (id, name, params, masks = [], extra = {}) => L("satmap", id, name, params, masks, extra);

export const PRESETS = {
  canyons: {
    label: "Canyons (sandstone)",
    build: () =>
      doc(
        "Sandstone canyons",
        { size: "256", cell: 32, maxHeight: 900, seaLevel: 0, seed: 4021 },
        [
          L("perlin", "plateau", "Plateau base", { frequency: 1.4, octaves: 6, warp: 0.35, amplitude: 0.62, base: 0.26, seed: 1 }),
          L("rift", "canyon-cut", "Canyon carve", { depth: 280, frequency: 1.8, width: 0.075, wall: 0.8, warp: 0.6 }, [M("elevation", { low: 0.28, high: 0.6, summitRoll: 0.4 })]),
          L("stream", "river-cut", "River incision", { iterations: 10, erodibility: 0.04, maxStep: 26 }),
          L("terrace", "strata", "Sandstone strata", { steps: 16, smooth: 0.25 }, [M("elevation", { low: 0.3, high: 0.7, summitRoll: 0 }), M("strata", { interval: 55, duty: 0.58, sharpness: 0.8, warp: 30 }, { op: "multiply" })]),
          L("hydraulic", "rain", "Rain gullies", { density: 1.1, lifetime: 70, erosionRate: 0.35, depositRate: 0.25, radius: 2 }),
          L("thermal", "scree", "Talus slopes", { talus: 33, iterations: 30 }),
          satmap("sand-base", "Sandstone colour", { palette: "sandstone", channel: "altitude", contrast: 1.2, breakup: 0.3, breakupScale: 9 }),
          satmap("sed-sand", "Sediment dust", { palette: "desert", channel: "sediment", contrast: 1.6, blend: "over", breakup: 0.2 }, [M("ridges", { min: -10, max: 40, scale: 120 }, { invert: true })], { opacity: 0.55 }),
          satmap("rivers", "Dark river beds", { palette: "volcanic", channel: "rivers", contrast: 2.0, blend: "multiply", breakup: 0 }, [], { opacity: 0.6 }),
        ],
        { azimuth: 250, elevation: 28 },
      ),
  },
  sandstoneCliffs: {
    label: "Sandstone cliffs",
    build: () =>
      doc(
        "Sandstone cliffs",
        { size: "256", cell: 30, maxHeight: 1100, seaLevel: 0, seed: 778 },
        [
          L("flat", "mesa", "Mesa table", { level: 0.42 }),
          L("perlin", "rise", "Rolling rise", { frequency: 1.6, octaves: 5, warp: 0.25, amplitude: 0.3, base: 0.3, seed: 2 }, [], { blend: "add" }),
          L("cliffSculpt", "cliff-steps", "Cliff steps", { threshold: 40, stepSize: 110, softness: 7 }, [M("cliffs", { threshold: 35, softness: 8, breakup: 0.35 })]),
          L("terrace", "bedding", "Bedding planes", { steps: 14, smooth: 0.35 }, [M("strata", { interval: 60, duty: 0.6, sharpness: 0.9, warp: 60 })]),
          L("thermal", "talus", "Cliff talus", { talus: 30, iterations: 60, rate: 0.45 }),
          L("stream", "gullies", "Drainage", { iterations: 6, erodibility: 0.025 }),
          satmap("bands", "Stratified sandstone", { palette: "sandstone", channel: "altitude", contrast: 1.4, breakup: 0.1 }),
          satmap("cliff-face", "Cliff faces", { palette: "volcanic", channel: "slope", contrast: 1.5, blend: "multiply", breakup: 0.4 }, [], { opacity: 0.7 }),
          satmap("talus-sand", "Talus fans", { palette: "desert", channel: "sediment", contrast: 1.5, blend: "over" }, [M("slope", { min: 0, max: 22 }, { invert: true })], { opacity: 0.7 }),
        ],
        { azimuth: 300, elevation: 34 },
      ),
  },
  coastalCliffs: {
    label: "Coastal cliffs",
    build: () =>
      doc(
        "Coastal cliffs",
        { size: "256", cell: 25, maxHeight: 420, seaLevel: 60, seed: 2201 },
        [
          L("island", "landmass", "Landmass", { radius: 0.5, falloff: 0.28, frequency: 2.6, warp: 0.4, amplitude: 0.85, base: 0.12, seed: 3 }),
          L("perlin", "headland", "Headland detail", { frequency: 3.2, octaves: 5, amplitude: 0.25, base: 0, seed: 4 }, [M("coastal", { width: 700, jitter: 260, side: "land" })], { blend: "add" }),
          L("cliffSculpt", "sea-cliffs", "Sea cliffs", { threshold: 34, stepSize: 40, softness: 5 }, [M("coastal", { width: 320, jitter: 90, sharpness: 1.2, side: "land" }, { invert: true })]),
          L("thermal", "cliff-foot", "Cliff foot talus", { talus: 28, iterations: 40 }, [M("coastal", { width: 240, side: "land" })]),
          L("stream", "creeks", "Coastal creeks", { iterations: 5, erodibility: 0.02, maxStep: 8 }),
          satmap("coast-sand", "Beach sand", { palette: "coastal", channel: "altitude", contrast: 1.1 }, [M("coastal", { width: 130, jitter: 50, side: "shelf" })]),
          satmap("cliff-dark", "Dark cliff rock", { palette: "rock", channel: "slope", contrast: 1.6, blend: "multiply" }, [M("slope", { min: 18, max: 40 })], { opacity: 0.9 }),
          satmap("wet", "Wet rock and grass", { palette: "forest", channel: "wetness", contrast: 1.3, blend: "multiply", breakup: 0.2 }, [], { opacity: 0.35 }),
        ],
        { azimuth: 220, elevation: 30 },
      ),
  },
  himalaya: {
    label: "Himalayan mountains",
    build: () =>
      doc(
        "Himalayan range",
        { size: "256", cell: 45, maxHeight: 6200, seaLevel: 250, seed: 8848 },
        [
          L("mountain", "range", "Range core", { frequency: 1.4, octaves: 8, sharpness: 1.9, coverage: 0.6, peaks: 1.6, amplitude: 1, base: 0.05, warp: 0.7, seed: 5 }),
          L("multifractal", "massif", "Massif detail", { frequency: 3.5, octaves: 9, roughness: 0.9, offset: 0.9, amplitude: 0.35, base: 0, warp: 0.5, seed: 6 }, [M("elevation", { low: 0.25, high: 0.7, summitRoll: 0.1 })], { blend: "add" }),
          L("stream", "trunk", "Trunk valleys", { iterations: 14, erodibility: 0.07, uplift: 2, maxStep: 40, areaExp: 0.45 }),
          L("glacial", "glaciers", "Glacial valleys", { iceline: 0.55, intensity: 0.8, smoothing: 0.6, cirque: 0.5, iterations: 8 }, [M("elevation", { low: 0.5, high: 0.8, summitRoll: 0 })]),
          L("hydraulic", "monsoon", "Monsoon gullies", { density: 0.8, lifetime: 80, erosionRate: 0.25, depositRate: 0.3, radius: 2 }),
          L("thermal", "rockfall", "Rockfall talus", { talus: 42, iterations: 40 }, [M("slope", { min: 25, max: 50 })]),
          satmap("base", "Forest to scree", { palette: "forest", channel: "altitude", contrast: 1.2, breakup: 0.2 }, [], {}),
          satmap("alpine", "Alpine meadow", { palette: "alpine", channel: "altitude", contrast: 1.3, bias: -0.05 }, [M("elevation", { low: 0.35, high: 0.7 })], { opacity: 0.9 }),
          satmap("snow", "Snowcaps", { palette: "snowrock", channel: "exposure", contrast: 1.8, bias: 0.15, breakup: 0.25, blend: "over" }, [M("elevation", { low: 0.7, high: 0.82 })]),
          satmap("rock", "Bare rock", { palette: "rock", channel: "slope", contrast: 1.3, blend: "multiply" }, [M("slope", { min: 22, max: 40 })], { opacity: 0.75 }),
        ],
        { azimuth: 300, elevation: 42 },
      ),
  },
  iceland: {
    label: "Icelandic highlands",
    build: () =>
      doc(
        "Icelandic highlands",
        { size: "256", cell: 35, maxHeight: 1400, seaLevel: 120, seed: 1104 },
        [
          L("perlin", "tundra", "Highland plateau", { frequency: 1.2, octaves: 5, warp: 0.3, amplitude: 0.5, base: 0.22, seed: 7 }),
          L("voronoi", "lava-plates", "Lava plateaux", { frequency: 5, jitter: 0.95, steps: 6, edge: 0.4, amplitude: 0.35, base: 0.05, seed: 8 }, [M("elevation", { low: 0.25, high: 0.6 })], { blend: "add" }),
          L("ridged", "shield-ridges", "Eruption ridges", { frequency: 2.4, octaves: 5, sharpness: 1.4, amplitude: 0.3, base: 0, warp: 0.4, seed: 9 }, [M("ridges", { min: 0, max: 80 })], { blend: "add" }),
          L("glacial", "valleys", "Glacial valleys", { iceline: 0.7, intensity: 0.5, smoothing: 0.7, cirque: 0.3, iterations: 5 }),
          L("stream", "braids", "Braided rivers", { iterations: 6, erodibility: 0.025, areaExp: 0.4 }),
          L("smooth", "lava-soft", "Lava smoothing", { radius: 2, detail: 0.6 }),
          satmap("moss", "Moss and lava", { palette: "volcanic", channel: "altitude", contrast: 1.1, breakup: 0.35, breakupScale: 10 }),
          satmap("moss-green", "Moss in the valleys", { palette: "forest", channel: "wetness", contrast: 1.6, blend: "multiply", breakup: 0.3 }, [], { opacity: 0.8 }),
          satmap("snow", "Ice caps", { palette: "ice", channel: "altitude", contrast: 1.5, bias: 0.2 }, [M("elevation", { low: 0.82, high: 0.92 })]),
        ],
        { azimuth: 200, elevation: 32 },
      ),
  },
  alps: {
    label: "Alps",
    build: () =>
      doc(
        "Alpine massif",
        { size: "256", cell: 40, maxHeight: 3800, seaLevel: 300, seed: 4810 },
        [
          L("mountain", "massif", "Alpine massif", { frequency: 1.8, octaves: 8, sharpness: 1.6, coverage: 0.7, peaks: 1.2, base: 0.08, amplitude: 0.92, warp: 0.6, seed: 10 }),
          L("glacial", "u-valleys", "U-shaped valleys", { iceline: 0.5, intensity: 1.0, smoothing: 0.85, cirque: 0.6, iterations: 12 }),
          L("stream", "rivers", "Alpine rivers", { iterations: 10, erodibility: 0.05, maxStep: 30 }),
          L("thermal", "scree", "Scree slopes", { talus: 36, iterations: 50 }, [M("slope", { min: 22, max: 42 })]),
          L("sharpen", "arêtes", "Arêtes", { amount: 0.7, radius: 7 }, [M("elevation", { low: 0.5, high: 0.85 })]),
          satmap("meadow", "Valley meadow", { palette: "alpine", channel: "altitude", contrast: 1.2, breakup: 0.15 }),
          satmap("wet", "Wet valley floor", { palette: "forest", channel: "rivers", contrast: 1.8, blend: "multiply" }, [], { opacity: 0.45 }),
          satmap("snow", "Snow above the firn line", { palette: "snowrock", channel: "exposure", contrast: 1.6, bias: 0.2, blend: "over", breakup: 0.2 }, [M("elevation", { low: 0.62, high: 0.75 })]),
          satmap("rock", "Rock faces", { palette: "rock", channel: "slope", contrast: 1.4, blend: "multiply" }, [M("slope", { min: 26, max: 45 })], { opacity: 0.7 }),
        ],
        { azimuth: 290, elevation: 40 },
      ),
  },
  snowyMountains: {
    label: "Snowy mountains",
    build: () =>
      doc(
        "Snowy peaks",
        { size: "256", cell: 38, maxHeight: 4200, seaLevel: 200, seed: 6120 },
        [
          L("ridged", "peaks", "Sharp peaks", { frequency: 2.2, octaves: 7, sharpness: 1.9, amplitude: 1, base: 0.05, warp: 0.5, seed: 12 }),
          L("multifractal", "rough", "Rough crags", { frequency: 4, octaves: 8, roughness: 1.0, offset: 0.95, amplitude: 0.25, base: 0, seed: 13 }, [M("elevation", { low: 0.45, high: 0.8 })], { blend: "add" }),
          L("glacial", "cirques", "Cirques", { iceline: 0.6, intensity: 0.7, smoothing: 0.4, cirque: 0.9, iterations: 8 }),
          L("thermal", "debris", "Debris cones", { talus: 38, iterations: 45 }),
          L("hydraulic", "meltwater", "Meltwater", { density: 0.7, lifetime: 60, erosionRate: 0.2, depositRate: 0.3 }),
          satmap("snow", "Fresh snow", { palette: "ice", channel: "exposure", contrast: 2.0, bias: 0.25, blend: "over" }, [M("elevation", { low: 0.45, high: 0.7 })]),
          satmap("rock-peaks", "Peak rock", { palette: "rock", channel: "altitude", contrast: 1.4, blend: "over" }, [M("slope", { min: 30, max: 50 })]),
          satmap("shade", "Shaded snow", { palette: "snowrock", channel: "protrusion", contrast: 1.3, blend: "multiply", breakup: 0.2 }, [], { opacity: 0.4 }),
        ],
        { azimuth: 210, elevation: 36 },
      ),
  },
  outcrops: {
    label: "Rugged outcrops",
    build: () =>
      doc(
        "Rugged outcrops",
        { size: "256", cell: 28, maxHeight: 1000, seaLevel: 0, seed: 3333 },
        [
          L("perlin", "ground", "Rolling ground", { frequency: 2, octaves: 6, amplitude: 0.4, base: 0.2, seed: 14 }),
          L("voronoi", "boulders", "Outcrop cells", { frequency: 9, jitter: 1, steps: 0, edge: 0.2, amplitude: 0.4, base: 0, seed: 15 }, [M("elevation", { low: 0.3, high: 0.65 })], { blend: "add" }),
          L("sharpen", "crags", "Crag sharpening", { amount: 1.6, radius: 5 }),
          L("cliffSculpt", "shelves", "Rock shelves", { threshold: 48, stepSize: 35, softness: 4 }, [M("cliffs", { threshold: 40, breakup: 0.5 })]),
          L("hydraulic", "weather", "Weathering", { density: 0.6, lifetime: 45, erosionRate: 0.2, depositRate: 0.4 }),
          L("thermal", "rubble", "Rubble", { talus: 40, iterations: 25 }),
          satmap("rock", "Grey outcrop rock", { palette: "rock", channel: "altitude", contrast: 1.5, breakup: 0.3, breakupScale: 10 }),
          satmap("lichen", "Lichen", { palette: "steppe", channel: "protrusion", contrast: 1.2, blend: "over", breakup: 0.5 }, [M("ridges", { min: 0, max: 30 })], { opacity: 0.5 }),
          satmap("shadow", "Crevice shadow", { palette: "volcanic", channel: "slope", contrast: 1.5, blend: "multiply" }, [], { opacity: 0.4 }),
        ],
        { azimuth: 235, elevation: 36 },
      ),
  },
  dunes: {
    label: "Desert dunes",
    build: () =>
      doc(
        "Desert dunes",
        { size: "256", cell: 40, maxHeight: 300, seaLevel: 0, seed: 5511 },
        [
          L("perlin", "sand-base", "Sand sheet", { frequency: 1.2, octaves: 4, warp: 0.2, amplitude: 0.45, base: 0.2, seed: 16 }),
          L("billow", "dune-field", "Dune field", { frequency: 3.5, octaves: 3, gain: 0.45, amplitude: 0.5, base: 0.05, seed: 17 }, [M("elevation", { low: 0.15, high: 0.5 })], { blend: "add" }),
          L("aeolian", "wind", "Wind sculpting", { direction: 215, strength: 0.7, saltation: 7, iterations: 140 }),
          L("smooth", "soften", "Soften sand", { radius: 2, detail: 0.5 }),
          satmap("sand", "Dune sand", { palette: "desert", channel: "altitude", contrast: 1.2, breakup: 0.15 }),
          satmap("dune-deposit", "Lee deposits", { palette: "desert", channel: "sediment", contrast: 1.8, blend: "over" }, [], { opacity: 0.7 }),
          satmap("shade", "Windward light and lee shade", { palette: "volcanic", channel: "slope", contrast: 1.0, blend: "multiply" }, [], { opacity: 0.3 }),
        ],
        { azimuth: 260, elevation: 34 },
      ),
  },
  rockyDesert: {
    label: "Rocky desert",
    build: () =>
      doc(
        "Rocky desert",
        { size: "256", cell: 34, maxHeight: 700, seaLevel: 0, seed: 9099 },
        [
          L("perlin", "pan", "Desert pan", { frequency: 1.6, octaves: 6, warp: 0.4, amplitude: 0.35, base: 0.15, seed: 18 }),
          L("voronoi", "mesas", "Mesa plates", { frequency: 3.5, jitter: 0.9, steps: 5, edge: 0.45, amplitude: 0.35, base: 0.05, seed: 19 }, [M("elevation", { low: 0.3, high: 0.6, summitRoll: 0.2 })], { blend: "add" }),
          L("terrace", "bench", "Desert benches", { steps: 9, smooth: 0.5 }, [M("strata", { interval: 45, duty: 0.5, sharpness: 0.6 })]),
          L("stream", "wadis", "Wadis", { iterations: 4, erodibility: 0.02, maxStep: 15 }),
          L("aeolian", "wind", "Wind polish", { direction: 240, strength: 0.4, saltation: 4, iterations: 50 }),
          L("thermal", "rubble", "Rock fall", { talus: 37, iterations: 25 }),
          satmap("base", "Desert pavement", { palette: "desert", channel: "altitude", contrast: 1.15, breakup: 0.25 }),
          satmap("rock", "Dark rock varnish", { palette: "volcanic", channel: "slope", contrast: 1.4, blend: "multiply" }, [M("slope", { min: 14, max: 36 })], { opacity: 0.75 }),
          satmap("wadi", "Wadi washes", { palette: "steppe", channel: "rivers", contrast: 1.8, blend: "over" }, [], { opacity: 0.4 }),
        ],
        { azimuth: 230, elevation: 40 },
      ),
  },
};

export const PRESET_LIST = Object.entries(PRESETS).map(([k, v]) => [k, v.label]);

export function buildPreset(id) {
  const p = PRESETS[id];
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p.build();
}
