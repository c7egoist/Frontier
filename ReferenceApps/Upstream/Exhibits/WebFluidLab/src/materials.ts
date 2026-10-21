import type { MaterialId, MaterialPreset } from "./types.ts";

// Material presets tuned by feel (not literal SI units) so that each liquid
// reads distinctly at real-time particle counts: water is light and splashy,
// milk is a touch creamier and more opaque, chocolate is thick, glossy and
// clingy, mud is heavy, dull and extremely sticky.
export const MATERIAL_PRESETS: Record<MaterialId, MaterialPreset> = {
  water: {
    id: "water",
    label: "Water",
    restDensity: 1000,
    stiffness: 180,
    viscosity: 0.045,
    cohesion: 0.02,
    adhesion: 0.25,
    friction: 0.03,
    releaseThreshold: 0.02,
    color: [0.1, 0.35, 0.55],
    absorption: 0.9,
    roughness: 0.06,
    refraction: 0.08,
    particleRadius: 0.055,
    damping: 0.0,
  },
  milk: {
    id: "milk",
    label: "Milk",
    restDensity: 1030,
    stiffness: 160,
    viscosity: 0.09,
    cohesion: 0.06,
    adhesion: 0.45,
    friction: 0.08,
    releaseThreshold: 0.05,
    color: [0.93, 0.91, 0.85],
    absorption: 3.2,
    roughness: 0.18,
    refraction: 0.02,
    particleRadius: 0.058,
    damping: 0.04,
  },
  chocolate: {
    id: "chocolate",
    label: "Chocolate",
    restDensity: 1250,
    stiffness: 170,
    viscosity: 0.55,
    cohesion: 0.13,
    adhesion: 0.85,
    friction: 0.35,
    releaseThreshold: 0.14,
    color: [0.27, 0.14, 0.07],
    absorption: 6.0,
    roughness: 0.32,
    refraction: 0.0,
    particleRadius: 0.062,
    damping: 0.22,
  },
  mud: {
    id: "mud",
    label: "Mud",
    restDensity: 1700,
    stiffness: 150,
    viscosity: 0.85,
    cohesion: 0.2,
    adhesion: 0.95,
    friction: 0.55,
    releaseThreshold: 0.22,
    color: [0.22, 0.16, 0.1],
    absorption: 8.0,
    roughness: 0.65,
    refraction: 0.0,
    particleRadius: 0.065,
    damping: 0.4,
  },
};

export const MATERIAL_ORDER: MaterialId[] = ["water", "milk", "chocolate", "mud"];

export function materialIndex(id: MaterialId): number {
  return MATERIAL_ORDER.indexOf(id);
}

/** Derives a render-time particle opacity from the material's light absorption. */
export function particleAlpha(m: MaterialPreset): number {
  return Math.min(0.97, Math.max(0.12, 1 - Math.exp(-m.absorption * 0.4)));
}
