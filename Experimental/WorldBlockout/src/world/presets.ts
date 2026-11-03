// Authored world blockout: continents, mountain spines, gulfs, shelves and city plots.
// Coordinates are normalised to the world square (0..1), world spans -5,000 km .. +5,000 km.

import type { BrushOp, ContinentShape } from '../core/terrain.ts';

/** Chaikin corner cutting: turns authored polygons into plausible coastlines. */
export function smoothRing(ring: [number, number][], iterations = 2): [number, number][] {
  let pts = ring;
  for (let it = 0; it < iterations; it++) {
    const next: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}

/**
 * Meridian — the Africa-scale continent. North-south body, western bulge, eastern horn,
 * tapering south. Mountain spine runs the eastern shoulder and forks around a rift.
 */
export const MERIDIAN: ContinentShape = {
  name: 'Meridian',
  uplift: 1,
  ring: smoothRing([
    [0.395, 0.095], [0.475, 0.075], [0.545, 0.095], [0.585, 0.155],
    [0.615, 0.235], [0.655, 0.275], [0.705, 0.285], [0.745, 0.345],
    [0.735, 0.415], [0.700, 0.470], [0.665, 0.535], [0.655, 0.615],
    [0.620, 0.700], [0.575, 0.785], [0.520, 0.845], [0.470, 0.815],
    [0.448, 0.735], [0.410, 0.655], [0.372, 0.585], [0.345, 0.520],
    [0.330, 0.455], [0.300, 0.390], [0.312, 0.300], [0.340, 0.215],
    [0.365, 0.145],
  ], 2),
  spine: [
    [0.585, 0.165], [0.610, 0.265], [0.660, 0.330], [0.690, 0.430],
    [0.650, 0.520], [0.610, 0.620], [0.560, 0.720], [0.520, 0.800],
  ],
  mountain: 1,
};

/** Vesper — western continent, narrow and mountainous, like an Andean ribbon. */
export const VESPER: ContinentShape = {
  name: 'Vesper',
  uplift: 0.85,
  ring: smoothRing([
    [0.115, 0.265], [0.175, 0.225], [0.225, 0.265], [0.245, 0.340],
    [0.230, 0.420], [0.205, 0.500], [0.180, 0.575], [0.150, 0.640],
    [0.120, 0.600], [0.100, 0.520], [0.085, 0.440], [0.078, 0.360],
    [0.090, 0.300],
  ], 2),
  spine: [[0.150, 0.280], [0.196, 0.360], [0.176, 0.450], [0.146, 0.540], [0.126, 0.610]],
  mountain: 1.25,
};

/** Thule — northern high continent with a broad shield and a fjord coast. */
export const THULE: ContinentShape = {
  name: 'Thule',
  uplift: 0.7,
  ring: smoothRing([
    [0.615, 0.035], [0.700, 0.020], [0.785, 0.050], [0.845, 0.100],
    [0.865, 0.170], [0.835, 0.215], [0.775, 0.235], [0.715, 0.220],
    [0.665, 0.245], [0.615, 0.225], [0.575, 0.180], [0.565, 0.115],
    [0.580, 0.065],
  ], 2),
  spine: [[0.640, 0.090], [0.720, 0.120], [0.800, 0.140]],
  mountain: 0.55,
};

/** A south-polar cap so the world reads as a planet inset, not a floating blob. */
export const AUSTRAL: ContinentShape = {
  name: 'Austral Cap',
  uplift: 0.6,
  ring: smoothRing([
    [0.060, 0.930], [0.240, 0.895], [0.440, 0.910], [0.620, 0.890],
    [0.800, 0.910], [0.940, 0.945], [0.995, 0.985], [0.995, 1.005],
    [0.005, 1.005], [0.005, 0.975],
  ], 1),
  mountain: 0.3,
};

/** Archipelago islands added as SDF blobs (not polygons) — quick blocking masses. */
export const ARCHIPELAGO: BrushOp[] = [
  { kind: 'blob', x: -2_650_000, z: -1_150_000, radius: 210_000, strength: 0.55, squareness: 0.15, name: 'Isle of Kesh' },
  { kind: 'blob', x: -2_250_000, z: -1_620_000, radius: 120_000, strength: 0.4, squareness: 0.25, name: 'Kesh Minor' },
  { kind: 'blob', x: -2_980_000, z: -1_720_000, radius: 90_000, strength: 0.35, squareness: 0.1, name: 'Gull Rock' },
  { kind: 'blob', x: -1_250_000, z: 2_650_000, radius: 260_000, strength: 0.45, squareness: 0.35, name: 'Verdant Shelf' },
  { kind: 'blob', x: -820_000, z: 3_120_000, radius: 140_000, strength: 0.35, squareness: 0.2, name: 'Petrel Isles' },
  { kind: 'blob', x: 2_600_000, z: 2_250_000, radius: 180_000, strength: 0.5, squareness: 0.3, name: 'Tallow Isle' },
  { kind: 'blob', x: 3_350_000, z: -2_650_000, radius: 320_000, strength: 0.42, squareness: 0.4, name: 'Far Reach' },
  { kind: 'blob', x: 3_050_000, z: -2_150_000, radius: 160_000, strength: 0.36, squareness: 0.15, name: 'Reach Shoal' },
];

/**
 * Gulfs and inland seas. These are SDF subtractions: they cut water into existing land the way
 * the brief asked (Africa-like continent with gulfs), and stay editable as their own objects.
 */
export const GULFS: BrushOp[] = [
  { kind: 'gulf', x: -1_550_000, z: 350_000, radius: 620_000, strength: 0.75, squareness: 0.55, name: 'Gulf of Kesh' },
  { kind: 'gulf', x: 2_050_000, z: 420_000, radius: 480_000, strength: 0.6, squareness: 0.8, name: 'Sea of Reeds' },
  { kind: 'gulf', x: 900_000, z: -2_050_000, radius: 700_000, strength: 0.7, squareness: 0.35, name: 'Southern Bight' },
  { kind: 'gulf', x: 2_800_000, z: 900_000, radius: 350_000, strength: 0.55, squareness: 0.6, name: 'Horn Bay' },
];

/** Continental shelves widened where the brief wants shallow seas for the sim. */
export const SHELVES: BrushOp[] = [
  { kind: 'shelf', x: 0, z: 0, radius: 5_000_000, strength: 0.35, name: 'Global shelf' },
];

export interface CityPlot {
  name: string;
  x: number;
  z: number;
  /** Metropolitan radius, metres. */
  radius: number;
  kind: 'capital' | 'city' | 'port' | 'outpost';
}

/**
 * City plots are blockout objects placed on land before any buildings exist: they carry the pad
 * height, radius and a hint of the terrain they sit on. Their z is resolved from the bake.
 */
export const CITIES: CityPlot[] = [
  { name: 'Aurelia', x: -420_000, z: 260_000, radius: 45_000, kind: 'capital' },
  { name: 'Port Ansel', x: -1_140_000, z: 780_000, radius: 26_000, kind: 'port' },
  { name: 'Kestral', x: 1_250_000, z: -340_000, radius: 28_000, kind: 'city' },
  { name: 'Nadir', x: 420_000, z: 2_450_000, radius: 22_000, kind: 'port' },
  { name: 'Highmarch', x: 1_780_000, z: 180_000, radius: 18_000, kind: 'city' },
  { name: 'Thule Gate', x: 1_240_000, z: -4_120_000, radius: 24_000, kind: 'capital' },
  { name: 'Vesper Landing', x: -3_850_000, z: 1_250_000, radius: 16_000, kind: 'outpost' },
  { name: 'Tallow', x: 2_600_000, z: 2_250_000, radius: 12_000, kind: 'outpost' },
  { name: 'Reedmouth', x: 2_020_000, z: 560_000, radius: 20_000, kind: 'port' },
];
