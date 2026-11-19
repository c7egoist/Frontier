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
import { SetActiveColourSlot, SetFallbackColourSlot } from "./ColourCodex.js";
import { LoadUvBridgeTransfer } from "../Shared/UvTextureBridge.js";
import { DockCards, UndockCards, DockedCard } from "./CardDock.js";
import { WebglContextRefused, ReleaseStudioRenderersSince, StudioRendererMark } from "./StudioRenderer.js";

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
    importedMesh: null,
  },
  applyImportedMesh(transfer, targetWorkspace = "paint") {
    if (!transfer) return false;
    appBridge.shared.importedMesh = transfer;
    if (targetWorkspace && activeId !== targetWorkspace) {
      activateWorkspace(targetWorkspace);
      requestAnimationFrame(() => activeWorkspace?.applyImportedMesh?.(transfer));
      return true;
    }
    return !!activeWorkspace?.applyImportedMesh?.(transfer);
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
  inspectAsset(kind, id) {
    assetBrowser?.selectAsset?.(kind, id);
  },
  getActiveMaterialParams() {
    return activeWorkspace?.getParams?.() || appBridge.shared.material || null;
  },
  openPatternAssetInMaterial(patternEntry) {
    appBridge.shared.patternData = patternEntry;
    activateWorkspace("material");
    requestAnimationFrame(() => {
      activeWorkspace?.applyAsset?.({
        assetKind: "pattern",
        id: patternEntry.id,
        name: patternEntry.name,
        family: patternEntry.group || patternEntry.family,
        raw: patternEntry,
      });
    });
  },
  openPatternAssetInPaint(patternEntry) {
    appBridge.shared.patternData = patternEntry;
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyAsset?.({
        assetKind: "pattern",
        id: patternEntry.id,
        name: patternEntry.name,
        family: patternEntry.group || patternEntry.family,
        raw: patternEntry,
      });
    });
  },
  openStampAssetInPaint(stampEntry) {
    activateWorkspace("paint");
    requestAnimationFrame(() => {
      activeWorkspace?.applyAsset?.({
        assetKind: "stamp",
        id: stampEntry.id,
        name: stampEntry.name,
        family: stampEntry.group || stampEntry.family,
        raw: stampEntry,
      });
    });
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
    if (payload.assetKind === "image") {
      const targetWs = dropInfo?.role === "tile" ? "material" : "paint";
      activateWorkspace(targetWs);
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
    activeWorkspace?.applyBridgedPattern?.(patternEval);
  },
  sendPatternToMaterial(patternEval) {
    appBridge.shared.patternData = patternEval;
    activateWorkspace("material");
    activeWorkspace?.applyAsset?.({
      assetKind: "pattern",
      id: patternEval.id || patternEval.name || "live-pattern",
      name: patternEval.name || "Pattern Texture",
      raw: patternEval,
    });
  },
  sendStampToPaint(stampEval) {
    appBridge.shared.stampData = stampEval;
    activateWorkspace("paint");
    activeWorkspace?.applyBridgedStamp?.(stampEval);
  },
  sendBakedMapsToPaint(bridgeData) {
    appBridge.shared.bakedMaps = bridgeData;
    activateWorkspace("paint");
    activeWorkspace?.applyBakedMaps?.(bridgeData);
  },
};

assetBrowser = createAssetBrowser(browserHost, appBridge);

// A WebGL context freed by the previous workspace can take a moment to be returned by the browser,
// so a context failure is retried automatically before the error panel asks the user.
const WEBGL_RETRY_DELAYS_MS = [250, 1000];
let mountRetryTimer = 0;

function showMountError(target, err, attempt) {
  const webgl = WebglContextRefused(err);
  mainMount.innerHTML = "";
  const panel = document.createElement("div");
  panel.className = "ts-mount-error";
  panel.style.cssText = "padding:28px;color:#ff8b78;font-family:monospace;display:flex;flex-direction:column;gap:12px;align-items:flex-start;";
  const line = document.createElement("div");
  line.className = "ts-mount-error-line";
  line.textContent = `Workspace "${target.label}" error: ${err?.message || err}`;
  panel.append(line);
  if (webgl) {
    const hint = document.createElement("div");
    hint.style.color = "#c9ccd3";
    hint.textContent = attempt < WEBGL_RETRY_DELAYS_MS.length
      ? "The browser has not released a WebGL context yet. Retrying…"
      : "The browser refused a WebGL context. Close other GPU-heavy tabs, then retry.";
    panel.append(hint);
  }
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry";
  retry.style.cssText = "padding:6px 14px;border-radius:6px;border:1px solid #3a3d44;background:#1b1d22;color:#e8e9ec;cursor:pointer;font:inherit;";
  retry.addEventListener("click", () => activateWorkspace(target.id, { force: true }));
  panel.append(retry);
  mainMount.append(panel);
}

function activateWorkspace(id, { force = false, attempt = 0 } = {}) {
  const target = WORKSPACES.find((w) => w.id === id) || WORKSPACES[0];
  if (activeId === target.id && activeWorkspace && !force) return;
  clearTimeout(mountRetryTimer);

  if (activeWorkspace) {
    UndockCards();
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

  SetActiveColourSlot(null);
  SetFallbackColourSlot(null);
  mainMount.innerHTML = "";
  const rendererMark = StudioRendererMark();
  try {
    activeWorkspace = target.mount(mainMount, appBridge);
    // Project Zero cards replace the native side panels (outliner · viewport · inspector); see CardDock.js.
    DockCards(target.id, activeWorkspace, appBridge);
  } catch (err) {
    console.error(`Failed to mount workspace ${target.label}:`, err);
    try {
      activeWorkspace?.dispose?.();
    } catch {}
    activeWorkspace = null;
    UndockCards();
    ReleaseStudioRenderersSince(rendererMark);
    showMountError(target, err, attempt);
    if (WebglContextRefused(err) && attempt < WEBGL_RETRY_DELAYS_MS.length) {
      mountRetryTimer = setTimeout(() => {
        if (activeId === target.id && !activeWorkspace) activateWorkspace(target.id, { force: true, attempt: attempt + 1 });
      }, WEBGL_RETRY_DELAYS_MS[attempt]);
    }
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
  getAssetBrowserController: () => assetBrowser,
  applyAsset: (kind, id) => appBridge.applyAssetToActiveWorkspace(assetBrowser?.getAssetPayload(kind, id)),
  applyImportedMesh: (transfer, targetWs) => appBridge.applyImportedMesh(transfer, targetWs),
  sendPatternToMaterial: (pat) => appBridge.sendPatternToMaterial(pat),
  notify: (msg) => Toast(msg),
  // CardDock: the docked card hubs ("material", "artwork", "bake", "paint", "brush") and the active workspace api.
  card: (key) => DockedCard(key),
  workspaceApi: () => activeWorkspace,
};

const initialHash = window.location.hash.replace(/^#/, "").toLowerCase();
const urlParams = new URLSearchParams(window.location.search || "");
const uvImportKey = urlParams.get("uvImport");
const startupWorkspace = WORKSPACES.some((w) => w.id === initialHash)
  ? initialHash
  : (uvImportKey ? "paint" : "material");
activateWorkspace(startupWorkspace);

if (uvImportKey) {
  LoadUvBridgeTransfer(uvImportKey).then((transfer) => {
    if (!transfer) {
      Toast("No recent UV Studio transfer found — load or send a mesh from UV Studio.");
      return;
    }
    appBridge.shared.importedMesh = transfer;
    activeWorkspace?.applyImportedMesh?.(transfer);
  }).catch((err) => {
    console.warn("UV Bridge load failed:", err);
  });
}
