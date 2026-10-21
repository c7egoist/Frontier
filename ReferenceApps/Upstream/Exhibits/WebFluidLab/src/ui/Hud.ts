import { MATERIAL_ORDER, MATERIAL_PRESETS } from "../materials.ts";
import type { MaterialId, QualityTier } from "../types.ts";
import type { ResolutionMode } from "../perf/DynamicResolution.ts";

export interface HudCallbacks {
  onMaterialChange: (id: MaterialId) => void;
  onPourChange: (pouring: boolean) => void;
  onBurst: () => void;
  onReset: () => void;
  onQualityChange: (mode: ResolutionMode) => void;
  onBackendHint: () => string;
}

const QUALITY_OPTIONS: ResolutionMode[] = ["auto", "potato", "low", "medium", "high", "ultra"];

export class Hud {
  private root: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private pouring = false;
  private pourBtn!: HTMLButtonElement;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    parent.appendChild(this.root);

    const title = document.createElement("div");
    title.className = "hud-title";
    title.innerHTML = `<span>Realtime Fluid Lab</span><small>${cb.onBackendHint()}</small>`;
    this.root.appendChild(title);

    const materialRow = document.createElement("div");
    materialRow.className = "hud-row";
    const materialLabel = document.createElement("div");
    materialLabel.className = "hud-label";
    materialLabel.textContent = "Material";
    materialRow.appendChild(materialLabel);
    const materialButtons = document.createElement("div");
    materialButtons.className = "hud-chip-group";
    MATERIAL_ORDER.forEach((id, i) => {
      const btn = document.createElement("button");
      btn.className = "hud-chip";
      if (i === 0) btn.classList.add("active");
      btn.textContent = MATERIAL_PRESETS[id].label;
      const [r, g, b] = MATERIAL_PRESETS[id].color;
      btn.style.setProperty("--swatch", `rgb(${r * 255}, ${g * 255}, ${b * 255})`);
      btn.addEventListener("click", () => {
        materialButtons.querySelectorAll(".hud-chip").forEach((e) => e.classList.remove("active"));
        btn.classList.add("active");
        cb.onMaterialChange(id);
      });
      materialButtons.appendChild(btn);
    });
    materialRow.appendChild(materialButtons);
    this.root.appendChild(materialRow);

    const actionRow = document.createElement("div");
    actionRow.className = "hud-row";
    this.pourBtn = document.createElement("button");
    this.pourBtn.className = "hud-button primary";
    this.pourBtn.textContent = "Start Pouring";
    this.pourBtn.addEventListener("click", () => {
      this.pouring = !this.pouring;
      this.pourBtn.textContent = this.pouring ? "Stop Pouring" : "Start Pouring";
      this.pourBtn.classList.toggle("active", this.pouring);
      cb.onPourChange(this.pouring);
    });
    actionRow.appendChild(this.pourBtn);

    const burstBtn = document.createElement("button");
    burstBtn.className = "hud-button";
    burstBtn.textContent = "Burst";
    burstBtn.title = "Spawn a large splash to stress-test dynamic resolution";
    burstBtn.addEventListener("click", () => cb.onBurst());
    actionRow.appendChild(burstBtn);

    const resetBtn = document.createElement("button");
    resetBtn.className = "hud-button";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => cb.onReset());
    actionRow.appendChild(resetBtn);
    this.root.appendChild(actionRow);

    const qualityRow = document.createElement("div");
    qualityRow.className = "hud-row";
    const qualityLabel = document.createElement("div");
    qualityLabel.className = "hud-label";
    qualityLabel.textContent = "Resolution";
    qualityRow.appendChild(qualityLabel);
    const select = document.createElement("select");
    select.className = "hud-select";
    QUALITY_OPTIONS.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt === "auto" ? "Auto (dynamic)" : opt[0].toUpperCase() + opt.slice(1);
      select.appendChild(o);
    });
    select.addEventListener("change", () => cb.onQualityChange(select.value as ResolutionMode));
    qualityRow.appendChild(select);
    this.root.appendChild(qualityRow);

    this.statsEl = document.createElement("div");
    this.statsEl.className = "hud-stats";
    this.root.appendChild(this.statsEl);

    const hint = document.createElement("div");
    hint.className = "hud-hint";
    hint.textContent = "Drag to orbit · Scroll to zoom · Pour then watch it cling to the sphere, box and paddle.";
    this.root.appendChild(hint);
  }

  setStats(fps: number, tier: QualityTier, scale: number, particles: number, budget: number) {
    this.statsEl.textContent = `${fps.toFixed(0)} fps · tier ${tier} · res ${(scale * 100).toFixed(0)}% · particles ${particles.toLocaleString()} / ${budget.toLocaleString()}`;
  }
}
