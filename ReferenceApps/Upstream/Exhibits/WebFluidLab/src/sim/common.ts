import type { QualitySettings, QualityTier } from "../types.ts";

export const GRAVITY = -9.8;

// Smoothing kernel radius, meters. Chosen relative to particle visual radius
// so that ~30-40 neighbours fall inside the support radius at rest density.
export const SMOOTHING_RADIUS = 0.16;

export const DOMAIN_MIN: [number, number, number] = [-2.1, 0, -1.5];
export const DOMAIN_MAX: [number, number, number] = [2.1, 3.4, 1.5];

export const QUALITY_TABLE: Record<QualityTier, QualitySettings> = {
  potato: { tier: "potato", renderScale: 0.45, maxParticles: 4000, pressureIterations: 2, blurPasses: 1, shadow: false },
  low: { tier: "low", renderScale: 0.6, maxParticles: 9000, pressureIterations: 3, blurPasses: 2, shadow: false },
  medium: { tier: "medium", renderScale: 0.78, maxParticles: 22000, pressureIterations: 4, blurPasses: 3, shadow: true },
  high: { tier: "high", renderScale: 0.92, maxParticles: 55000, pressureIterations: 4, blurPasses: 4, shadow: true },
  ultra: { tier: "ultra", renderScale: 1.0, maxParticles: 120000, pressureIterations: 5, blurPasses: 5, shadow: true },
};

export const QUALITY_ORDER: QualityTier[] = ["potato", "low", "medium", "high", "ultra"];

export const CPU_QUALITY_TABLE: Record<QualityTier, QualitySettings> = {
  potato: { tier: "potato", renderScale: 0.55, maxParticles: 500, pressureIterations: 1, blurPasses: 1, shadow: false },
  low: { tier: "low", renderScale: 0.7, maxParticles: 900, pressureIterations: 1, blurPasses: 2, shadow: false },
  medium: { tier: "medium", renderScale: 0.85, maxParticles: 1500, pressureIterations: 1, blurPasses: 2, shadow: false },
  high: { tier: "high", renderScale: 1.0, maxParticles: 2200, pressureIterations: 1, blurPasses: 3, shadow: false },
  ultra: { tier: "ultra", renderScale: 1.0, maxParticles: 3000, pressureIterations: 1, blurPasses: 3, shadow: false },
};

/** Gas constant / stiffness scaling applied so presets feel distinct while staying numerically stable. */
export const TAIT_GAMMA = 7;
