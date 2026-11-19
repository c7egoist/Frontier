/* StudioRenderer — one place that creates and releases the Texture Studio's WebGL contexts.

   Browsers cap live WebGL contexts per page (Chrome: 16) and keep a context alive until it is
   garbage-collected unless it is explicitly lost. `renderer.dispose()` frees three.js resources but
   NOT the context, so switching workspaces (Material ⇄ Paint ⇄ Bake) and the icon baker's idle
   recycling piled up contexts until `getContext` returned null and three.js threw
   "Error creating WebGL context."

   CreateStudioRenderer releases idle helper contexts (icon baker) before creating, and retries with
   lighter attributes when the first attempt fails. ReleaseStudioRenderer disposes, force-loses the
   context and detaches the canvas so the slot is free immediately. */

import * as THREE from "three";

const IDLE_RELEASERS = new Set();
const LIVE = new Set();

// Helpers that can drop their context on demand (e.g. the material icon baker) register here.
export function RegisterIdleContextReleaser(Release) {
  IDLE_RELEASERS.add(Release);
  return () => IDLE_RELEASERS.delete(Release);
}

function ReleaseIdleContexts() {
  for (const Release of IDLE_RELEASERS) {
    try {
      Release();
    } catch (err) {
      console.warn("Idle WebGL context release warning:", err);
    }
  }
}

export function LiveStudioRendererCount() {
  return LIVE.size;
}

// Snapshot of live renderers; pass it to ReleaseStudioRenderersSince to free contexts created by a
// workspace mount that threw before it could return its dispose().
export function StudioRendererMark() {
  return new Set(LIVE);
}

export function ReleaseStudioRenderersSince(Mark) {
  for (const Renderer of [...LIVE]) {
    if (!Mark.has(Renderer)) ReleaseStudioRenderer(Renderer);
  }
}

export function ReleaseStudioRenderer(Renderer) {
  if (!Renderer) return;
  LIVE.delete(Renderer);
  try {
    Renderer.dispose();
  } catch (err) {
    console.warn("Renderer dispose warning:", err);
  }
  try {
    Renderer.forceContextLoss?.();
  } catch {
    /* context already lost */
  }
  const Canvas = Renderer.domElement;
  if (Canvas) {
    Canvas.remove?.();
    Canvas.width = 1;
    Canvas.height = 1;
  }
}

export function CreateStudioRenderer(Options = {}) {
  const Attempts = [
    Options,
    { ...Options, antialias: false },
    { ...Options, antialias: false, powerPreference: "default", failIfMajorPerformanceCaveat: false },
  ];
  let LastError = null;
  for (let I = 0; I < Attempts.length; I++) {
    // The icon baker is the only context that can be dropped without visible loss; free it before
    // any workspace context is created and again before every retry.
    ReleaseIdleContexts();
    try {
      const Renderer = new THREE.WebGLRenderer(Attempts[I]);
      LIVE.add(Renderer);
      return Renderer;
    } catch (err) {
      LastError = err;
    }
  }
  throw LastError || new Error("Error creating WebGL context.");
}

export function WebglContextRefused(err) {
  return /WebGL context/i.test(String(err?.message || err || ""));
}
