/*==========================================================================================================================================
                                                          TEXTURESTUDIO.JS
==========================================================================================================================================*/
/* Main Frontier Experimental Remastered Texture Studio Application Controller:
   Hosts Material, Pattern (Vector SVG + Layer/Modifier Stack + African Patterns + Noise Scale), Stamp,
   Texture Paint, and Baking workspaces with the shared bottom resizable Asset Browser drawer and zero-leak lifecycle switching. */

import { detectComputeCapability } from "./Engine/WebGpuCompute.js";
import { createAssetBrowser } from "./AssetBrowser.js";
import { mountMaterialWorkspace } from "./Workspaces/MaterialWorkspace.js";
import { mountPatternWorkspace } from "./Workspaces/PatternWorkspace.js";
import { mountStampWorkspace } from "./Workspaces/StampWorkspace.js";
import { mountTexturePaintWorkspace } from "./Workspaces/TexturePaintWorkspace.js";
import { mountBakingWorkspace } from "./Workspaces/BakingWorkspace.js";
import { Toast } from "./StudioControls.js";

const WORKSPACES = [
  { id: "material", label: "Material", mount: mountMaterialWorkspace },
  { id: "pattern", label: "Pattern", mount: mountPatternWorkspace },
  { id: "stamp", label: "Stamp", mount: mountStampWorkspace },
  { id: "paint", label: "Texture Paint", mount: mountTexturePaintWorkspace },
  { id: "bake", label: "Baking", mount: mountBakingWorkspace },
];

const mainMount = document.getElementById("studio-main");
const browserHost = document.getElementById("asset-browser-host");
const wsButtons = Array.from(document.querySelectorAll(".ws-tab"));
const statusRight = document.getElementById("status-right-text");
const statusActive = document.getElementById("status-active-ws");

let activeWorkspace = null;
let activeId = null;
let assetBrowser = null;

const appBridge = {
  activeDragAsset: null,
  shared: {
    material: null,
    patternData: null,
    stampData: null,
    bakedMaps: null,
  },
  switchWorkspace(id) {
    activateWorkspace(id);
  },
  resolveAssetPayload(kind, id) {
    return assetBrowser?.getAssetPayload(kind, id) || null;
  },
  focusAssetCategory(catId, family = null) {
    assetBrowser?.setCategory(catId, { userSpecified: false, family });
  },
  applyAssetToActiveWorkspace(payload, dropInfo = {}) {
    if (!payload) return false;
    const handled = activeWorkspace?.applyAsset?.(payload, dropInfo);
    if (handled) return true;
    // Smart fallback cross-workspace routing if the active workspace doesn't directly consume that asset type
    if (payload.assetKind === "pattern") {
      activateWorkspace("pattern");
      requestAnimationFrame(() => activeWorkspace?.applyAsset?.(payload, dropInfo));
      return true;
    }
    if (payload.assetKind === "stamp") {
      activateWorkspace("stamp");
      requestAnimationFrame(() => activeWorkspace?.applyAsset?.(payload, dropInfo));
      return true;
    }
    if (payload.assetKind === "material") {
      activateWorkspace("material");
      requestAnimationFrame(() => activeWorkspace?.applyAsset?.(payload, dropInfo));
      return true;
    }
    if (payload.assetKind === "mesh") {
      activateWorkspace("bake");
      requestAnimationFrame(() => activeWorkspace?.applyAsset?.(payload, dropInfo));
      return true;
    }
    if (payload.assetKind === "brush") {
      activateWorkspace("paint");
      requestAnimationFrame(() => activeWorkspace?.applyAsset?.(payload, dropInfo));
      return true;
    }
    return false;
  },
  sendMaterialToPaint(matParams) {
    appBridge.shared.material = matParams;
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyBridgedMaterial?.(matParams);
    });
  },
  sendPatternToPaint(patternEval) {
    appBridge.shared.patternData = patternEval;
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyBridgedPattern?.(patternEval);
    });
  },
  sendStampToPaint(stampEval) {
    appBridge.shared.stampData = stampEval;
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyBridgedStamp?.(stampEval);
    });
  },
  sendBakedMapsToPaint(bridgeData) {
    appBridge.shared.bakedMaps = bridgeData;
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyBakedMaps?.(bridgeData);
    });
  },
};

assetBrowser = createAssetBrowser(browserHost, appBridge);

function activateWorkspace(id) {
  const target = WORKSPACES.find((w) => w.id === id) || WORKSPACES[0];
  if (activeId === target.id && activeWorkspace) return;

  if (activeWorkspace) {
    try {
      activeWorkspace.dispose?.();
    } catch (e) {
      console.warn("Workspace dispose warning:", e);
    }
    activeWorkspace = null;
  }

  activeId = target.id;
  if (window.location.hash !== `#${target.id}`) {
    history.replaceState(null, "", `#${target.id}`);
  }

  for (const btn of wsButtons) {
    btn.classList.toggle("active", btn.dataset.ws === target.id);
  }

  mainMount.innerHTML = "";
  try {
    activeWorkspace = target.mount(mainMount, appBridge);
  } catch (err) {
    console.error(`Failed to mount workspace ${target.label}:`, err);
    mainMount.innerHTML = `<div style="padding:28px;color:#ff8b78;font-family:monospace;">Workspace "${target.label}" error: ${err?.message || err}</div>`;
  }

  assetBrowser?.setActiveWorkspace(target.id);
  if (statusActive) statusActive.textContent = `Workspace · ${target.label}`;
}

for (const btn of wsButtons) {
  btn.addEventListener("click", () => activateWorkspace(btn.dataset.ws));
}

window.addEventListener("hashchange", () => {
  const hashId = window.location.hash.replace(/^#/, "").toLowerCase();
  if (WORKSPACES.some((w) => w.id === hashId)) activateWorkspace(hashId);
});

detectComputeCapability().then((cap) => {
  if (statusRight) {
    statusRight.textContent = cap.webgpu ? "WebGPU + WebGL2 Ready" : "WebGL2 / CPU Fallback Ready";
  }
});

// Expose minimal read-only inspection helper for validation harness
window.__frontierTextureStudio = {
  switchWorkspace: activateWorkspace,
  getActiveId: () => activeId,
  getSnapshot: () => activeWorkspace?.getSnapshot?.() || null,
  getAssetBrowser: () => assetBrowser?.getState?.() || null,
  applyAsset: (kind, id) => appBridge.applyAssetToActiveWorkspace(assetBrowser?.getAssetPayload(kind, id)),
  notify: (msg) => Toast(msg),
};

const initialHash = window.location.hash.replace(/^#/, "").toLowerCase();
activateWorkspace(WORKSPACES.some((w) => w.id === initialHash) ? initialHash : "material");
