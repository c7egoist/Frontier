import { QUALITY_ORDER } from "../sim/common.ts";
import type { QualitySettings, QualityTier } from "../types.ts";

export type ResolutionMode = "auto" | QualityTier;

/**
 * Unreal-style dynamic resolution controller: tracks a rolling average frame
 * time and steps the render-scale / particle-budget tier up or down with
 * hysteresis so it does not thrash between neighbouring tiers every frame.
 */
export class DynamicResolution {
  private table: Record<QualityTier, QualitySettings>;
  private mode: ResolutionMode = "auto";
  private tierIndex = 3; // start at "high"
  private emaMs = 16.6;
  private readonly targetMs = 16.6;
  private cooldown = 0;
  private continuousScale = 1.0;

  constructor(table: Record<QualityTier, QualitySettings>) {
    this.table = table;
  }

  setMode(mode: ResolutionMode) {
    this.mode = mode;
    if (mode !== "auto") {
      this.tierIndex = QUALITY_ORDER.indexOf(mode);
      this.continuousScale = 1.0;
    }
  }

  getMode(): ResolutionMode {
    return this.mode;
  }

  /** Feed the most recent frame time in milliseconds. */
  update(dtMs: number) {
    this.emaMs = this.emaMs * 0.92 + dtMs * 0.08;
    if (this.mode !== "auto") {
      this.continuousScale = 1.0;
      return;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
    } else if (this.emaMs > this.targetMs * 1.18 && this.tierIndex > 0) {
      this.tierIndex--;
      this.cooldown = 45;
    } else if (this.emaMs < this.targetMs * 0.78 && this.tierIndex < QUALITY_ORDER.length - 1) {
      this.tierIndex++;
      this.cooldown = 70;
    }

    // Fine continuous render-scale trim within the current tier, similar to
    // Unreal's continuous dynamic resolution percentage on top of discrete
    // scalability groups. Keeps things smooth between the coarse tier steps.
    const error = this.targetMs / Math.max(this.emaMs, 1e-3);
    const trimTarget = Math.min(1.08, Math.max(0.55, error));
    this.continuousScale += (trimTarget - this.continuousScale) * 0.05;
  }

  get tier(): QualityTier {
    return QUALITY_ORDER[this.tierIndex];
  }

  get settings(): QualitySettings {
    const base = this.table[this.tier];
    const scale = Math.min(1.0, Math.max(0.4, this.continuousScale));
    return { ...base, renderScale: Math.min(1.0, base.renderScale * scale) };
  }

  get smoothedFrameMs(): number {
    return this.emaMs;
  }

  get fps(): number {
    return 1000 / Math.max(this.emaMs, 1e-3);
  }
}
