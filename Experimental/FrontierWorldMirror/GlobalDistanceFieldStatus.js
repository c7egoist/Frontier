//==========================================================================================================================================
// GlobalDistanceFieldStatus.js — live state of the GPU global distance field GI, shared by the WebGPU and WebGL2 viewports and
//                                the Render Settings inspector. The renderers publish after each Advance; the inspector's Reset
//                                button bumps ResetSerial, which the renderers turn into Invalidate() (surface cache + probe history
//                                restart from frame 0) on their next frame. Nothing here touches the field itself.
//==========================================================================================================================================
import { GDF_CONVERGE_FRAMES } from "./GlobalDistanceFieldLayout.js";

const Listeners = new Set();
let Current = { Backend: "", Engine: 0, FieldReady: false, ProbeReady: false, Converging: false, LightFrames: 0, Stats: null, Layout: null };
let CurrentKey = "";
let ResetSerial = 0;

function Notify(Reason) {
  for (const Fn of Listeners) Fn(Reason);
}

export const GdfStatus = {
  get Current() { return Current; },
  get ResetSerial() { return ResetSerial; },
  get ConvergeFrames() { return GDF_CONVERGE_FRAMES; },

  // Cheap enough to call every frame: listeners only hear about readiness changes and convergence progress steps.
  Publish(Backend, Engine, Result, Runtime) {
    const Frames = Math.min(GDF_CONVERGE_FRAMES, Result.LightFrames | 0);
    const Key = `${Backend}|${Engine}|${Result.FieldReady}|${Result.ProbeReady}|${Result.Converging}|${Frames >> 3}`;
    if (Key === CurrentKey) return;
    CurrentKey = Key;
    Current = {
      Backend,
      Engine,
      FieldReady: !!Result.FieldReady,
      ProbeReady: !!Result.ProbeReady,
      Converging: !!Result.Converging,
      LightFrames: Frames,
      Stats: Runtime?.Stats ? { ...Runtime.Stats } : null,
      Layout: Runtime?.Layout || null,
    };
    Notify("publish");
  },

  RequestReset() {
    ResetSerial += 1;
    Notify("reset");
  },

  Subscribe(Fn) {
    Listeners.add(Fn);
    return () => Listeners.delete(Fn);
  },
};
