//==========================================================================================================================================
// FILE: GlobalDistanceFieldGi.js
// PURPOSE: WebGPU runtime of the GPU-only global distance field GI (kernels: GlobalDistanceFieldShaders.js, bookkeeping:
//          GlobalDistanceFieldLayout.js). Owns the PERSISTENT GPU resources and records only the work a frame actually needs:
//            * layout change              -> full static build + compose (once)
//            * primitive edited / moved   -> static rebuild + compose of the old ∪ new voxel box (+ band) only
//            * vehicle moved              -> compose of the old ∪ new voxel box (+ band) only; the mesh SDF itself is baked once
//            * lighting / geometry change -> surface cache + probes re-converge over GDF_CONVERGE_FRAMES frames, then go idle
//          Nothing is computed on the CPU besides those voxel boxes.
//==========================================================================================================================================

import { GDF_GI_COMPUTE_WGSL } from "./GlobalDistanceFieldShaders.js";
import {
  CreateGiParamBlock,
  ComputeDirtyVoxelBox,
  DiffPrimitiveRows,
  FullVoxelBox,
  GDF_CONVERGE_FRAMES,
  GDF_FIELD_HEADER_VEC4,
  GDF_MAX_DYNAMIC_INSTANCES,
  GI_PARAM_VEC4,
  LightingSignature,
  PackDynamicInstances,
  PackGiParams,
  PlanLocalMeshGrids,
  ResolveGdfLayout,
  StampGiDispatch,
  UnionVoxelBox,
  WriteGdfFieldHeader,
} from "./GlobalDistanceFieldLayout.js";
import { ExpandVehicleInstances } from "./VehicleBvhAssets.js";

const SLOT_BYTES = 512;
const SURFACE_CACHE_HYSTERESIS = 0.9;
const MAX_SLOTS = 48;
const ENTRY_POINTS = ["StaticBuildEntry", "LocalBakeEntry", "ComposeEntry", "SurfaceLightEntry", "ProbeTraceEntry", "ProbeBlendEntry"];

// Bindings each entry point statically uses (auto layouts contain exactly these).
const ENTRY_BINDINGS = {
  StaticBuildEntry: [0, 1, 7, 8],
  LocalBakeEntry: [0, 2, 3, 5, 6],
  ComposeEntry: [0, 4, 5, 6, 9, 10, 11, 12],
  SurfaceLightEntry: [0, 1, 13, 14, 15, 16, 17, 18, 19, 22, 23],
  ProbeTraceEntry: [0, 13, 15, 17, 18, 19, 21],
  ProbeBlendEntry: [0, 13, 17, 20, 21],
};

export async function CreateGlobalDistanceFieldGi(Device) {
  const Module = Device.createShaderModule({ label: "GlobalDistanceFieldGi", code: GDF_GI_COMPUTE_WGSL });
  if (typeof Module.getCompilationInfo === "function") {
    const Compiled = await Module.getCompilationInfo();
    const Errors = Compiled.messages.filter((M) => M.type === "error");
    if (Errors.length) return { Ok: false, Reason: `gdf-wgsl:${Errors.map((E) => `L${E.lineNum}:${E.message}`).join(" | ").slice(0, 160)}` };
  }
  const Pipes = {};
  for (const Entry of ENTRY_POINTS) {
    Pipes[Entry] = Device.createComputePipeline({ label: Entry, layout: "auto", compute: { module: Module, entryPoint: Entry } });
  }

  const ParamBuf = Device.createBuffer({ size: SLOT_BYTES * MAX_SLOTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const ParamStage = new Uint8Array(SLOT_BYTES * MAX_SLOTS);
  const Block = CreateGiParamBlock();
  const LinearSampler = Device.createSampler({
    magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", addressModeW: "clamp-to-edge",
  });
  const SkySampler = Device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "clamp-to-edge" });
  const DynInstBuf = Device.createBuffer({ size: GDF_MAX_DYNAMIC_INSTANCES * 32 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const DynScratch = new Float32Array(GDF_MAX_DYNAMIC_INSTANCES * 32);
  const Placeholder = Device.createBuffer({ size: 256, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

  const Volume = (Dims) =>
    Device.createTexture({
      dimension: "3d", size: Dims, format: "rgba16float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

  const St = {
    Layout: null, Tex: null, Views: null, RadFlip: 0,
    FieldBuf: null, RaysBuf: null, ProbeKey: "", ProbeRays: 0,
    Mesh: null, LocalSdfBuf: null, MeshGridBuf: null, MeshBaked: false, MeshAssets: null,
    PrimSnap: {}, DynBounds: [], DynCount: 0,
    LightSig: -1, LightFrames: 0, Frame: 0, Engine: 0,
    FieldReady: false, RadReady: false, ProbeReady: false, HeaderKey: "",
    Version: 0, Stats: { StaticVoxels: 0, ComposeVoxels: 0, LightPasses: 0, ProbePasses: 0, MeshBakes: 0 },
  };
  const HeaderScratch = new Float32Array(GDF_FIELD_HEADER_VEC4 * 4);

  const DestroyVolumes = () => {
    if (!St.Tex) return;
    for (const T of Object.values(St.Tex)) { try { T.destroy(); } catch {} }
    St.Tex = null;
  };

  const AllocateVolumes = (L) => {
    DestroyVolumes();
    const Dims = [L.StackW, L.StackW, L.StackD];
    St.Tex = {
      StaticDist: Volume(Dims), StaticAttr: Volume(Dims), Field: Volume(Dims), Attr: Volume(Dims),
      RadA: Volume(Dims), RadB: Volume(Dims), IndA: Volume(Dims), IndB: Volume(Dims),
    };
    St.Views = Object.fromEntries(Object.entries(St.Tex).map(([K, T]) => [K, T.createView({ dimension: "3d" })]));
    St.RadFlip = 0;
    St.FieldReady = false;
    St.RadReady = false;
    St.LightFrames = 0;
    St.Version += 1;
  };

  const AllocateProbes = (L) => {
    try { St.FieldBuf?.destroy(); } catch {}
    try { St.RaysBuf?.destroy(); } catch {}
    St.FieldBuf = Device.createBuffer({ size: L.Probe.TotalVec4 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    St.RaysBuf = Device.createBuffer({ size: Math.max(256, L.Probe.Cells * 256 * 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    St.ProbeKey = L.ProbeKey;
    St.ProbeRays = L.Probe.Rays;
    St.ProbeReady = false;
    St.HeaderKey = "";
    St.Version += 1;
  };

  const BakePlanFor = (Assets) => {
    const Plan = PlanLocalMeshGrids(Assets);
    try { St.LocalSdfBuf?.destroy(); } catch {}
    try { St.MeshGridBuf?.destroy(); } catch {}
    St.LocalSdfBuf = Device.createBuffer({ size: Math.max(256, Plan.TotalVoxels * 8), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    St.MeshGridBuf = Device.createBuffer({ size: Math.max(256, Plan.Meta.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    Device.queue.writeBuffer(St.MeshGridBuf, 0, Plan.Meta);
    St.Mesh = Plan;
    St.MeshAssets = Assets;
    St.MeshBaked = false;
  };

  const Group = (Entry, Slot, Res) =>
    Device.createBindGroup({
      layout: Pipes[Entry].getBindGroupLayout(0),
      entries: ENTRY_BINDINGS[Entry].map((B) => ({
        binding: B,
        resource: B === 0 ? { buffer: ParamBuf, offset: Slot * SLOT_BYTES, size: GI_PARAM_VEC4 * 16 } : Res[B],
      })),
    });

  const Api = {
    Ok: true,
    get Version() { return St.Version; },
    get FieldBuffer() { return St.FieldBuf || Placeholder; },
    get FieldView() { return St.Views?.Field || null; },
    get RadianceView() { return St.Views ? (St.RadFlip ? St.Views.RadB : St.Views.RadA) : null; },
    get Converging() { return St.LightFrames < GDF_CONVERGE_FRAMES; },
    get FieldReady() { return St.FieldReady; },
    get RadianceReady() { return St.RadReady; },
    get ProbeReady() { return St.ProbeReady; },
    get Stats() { return St.Stats; },
    get Layout() { return St.Layout; },
    Textures() { return St.Tex; },
    Buffers() { return { Field: St.FieldBuf, Rays: St.RaysBuf, LocalSdf: St.LocalSdfBuf, MeshGrid: St.MeshGridBuf }; },

    // Records this frame's GI work into `Encoder` (compute pass). Engine: 3 = per-pixel distance-field gather, 4 = probes.
    Advance(Encoder, { Scene, Rs, SceneCpu, SceneBuf, PCount, LCount, Assets, BvhNodesBuf, BvhTrisBuf, SkyView, Engine }) {
      const L = ResolveGdfLayout(Rs);
      let FullStatic = false;
      if (!St.Layout || St.Layout.Key !== L.Key) {
        AllocateVolumes(L);
        FullStatic = true;
        St.PrimSnap = {};
        St.DynBounds = [];
        St.DynCount = 0;
      }
      if (!St.FieldBuf || St.ProbeKey !== L.ProbeKey || St.ProbeRays !== L.Probe.Rays) AllocateProbes(L);
      St.Layout = L;

      // ---- static dirty region ----
      const Diff = DiffPrimitiveRows(St.PrimSnap, SceneCpu, PCount);
      const StaticBoxes = [null, null];
      if (FullStatic || Diff === "all") {
        StaticBoxes[0] = FullVoxelBox(L, 0);
        StaticBoxes[1] = FullVoxelBox(L, 1);
      } else {
        for (const Bx of Diff) for (let C = 0; C < 2; ++C) StaticBoxes[C] = UnionVoxelBox(StaticBoxes[C], ComputeDirtyVoxelBox(L, C, Bx.Min, Bx.Max));
      }

      // ---- moving mesh instances (vehicle): mesh SDF baked once, compose old ∪ new boxes ----
      const DynBoxes = [null, null];
      let BakeMeshes = false;
      let DynCount = 0;
      if (Assets && BvhNodesBuf && BvhTrisBuf) {
        if (St.MeshAssets !== Assets) BakePlanFor(Assets);
        BakeMeshes = !St.MeshBaked;
        const Packed = PackDynamicInstances(ExpandVehicleInstances(Scene.Vehicles || [], Assets), Assets, DynScratch);
        DynCount = Packed.Count;
        const Moved = [];
        const N = Math.max(Packed.Count, St.DynBounds.length);
        for (let I = 0; I < N; ++I) {
          const A = St.DynBounds[I], B = Packed.Bounds[I];
          if (BakeMeshes || !A || !B || A.Key !== B.Key) {
            if (A) Moved.push(A);
            if (B) Moved.push(B);
          }
        }
        if (Moved.length || Packed.Count !== St.DynCount) {
          Device.queue.writeBuffer(DynInstBuf, 0, DynScratch.buffer, 0, Math.max(1, Packed.Count) * 128);
          for (const Bx of Moved) for (let C = 0; C < 2; ++C) DynBoxes[C] = UnionVoxelBox(DynBoxes[C], ComputeDirtyVoxelBox(L, C, Bx.Min, Bx.Max));
        }
        St.DynBounds = Packed.Bounds;
        St.DynCount = Packed.Count;
      }

      // ---- convergence schedule ----
      const Sig = LightingSignature(Scene, SceneCpu, LCount, Rs);
      const GeometryChanged = !!(StaticBoxes[0] || StaticBoxes[1] || DynBoxes[0] || DynBoxes[1]);
      if (FullStatic) St.LightFrames = 0;
      else if (Sig !== St.LightSig) St.LightFrames = Math.min(St.LightFrames, 1);
      else if (GeometryChanged) St.LightFrames = Math.min(St.LightFrames, 3);
      St.LightSig = Sig;
      if (Engine !== St.Engine) {
        St.Engine = Engine;
        St.LightFrames = Math.min(St.LightFrames, 1);
      }
      const Lighting = St.LightFrames < GDF_CONVERGE_FRAMES;
      const Hyst = SURFACE_CACHE_HYSTERESIS;
      const ProbeHyst = Math.max(0, Math.min(0.95, Number(Rs.ProbeTemporalBlend) || 0));
      const Alpha = Math.max(1 / (St.LightFrames + 1), 1 - Hyst);
      const ProbeAlpha = St.ProbeReady ? Math.max(1 / (St.LightFrames + 1), 1 - ProbeHyst) : 1;
      PackGiParams(Block, L, Scene, Rs, St.Frame, Alpha, ProbeAlpha, { Prims: PCount, Lights: LCount, Instances: DynCount }, Engine);

      // ---- record dispatches ----
      const Plan = [];
      let Slot = 0;
      const Stage = (BoxMin, BoxMax, W0, W1) => {
        StampGiDispatch(Block, BoxMin, BoxMax, W0, W1);
        ParamStage.set(new Uint8Array(Block.Buf), Slot * SLOT_BYTES);
        return Slot++;
      };
      const T = St.Views;
      const Res = {
        1: { buffer: SceneBuf }, 2: { buffer: BvhNodesBuf || Placeholder }, 3: { buffer: BvhTrisBuf || Placeholder },
        4: { buffer: DynInstBuf }, 5: { buffer: St.LocalSdfBuf || Placeholder }, 6: { buffer: St.MeshGridBuf || Placeholder },
        7: T.StaticDist, 8: T.StaticAttr, 9: T.StaticDist, 10: T.StaticAttr, 11: T.Field, 12: T.Attr, 13: T.Field, 14: T.Attr,
        17: LinearSampler, 18: SkyView, 19: SkySampler, 20: { buffer: St.FieldBuf }, 21: { buffer: St.RaysBuf },
      };
      const Groups4 = (Box) => [Math.ceil((Box.Max[0] - Box.Min[0]) / 4), Math.ceil((Box.Max[1] - Box.Min[1]) / 4), Math.ceil((Box.Max[2] - Box.Min[2]) / 4)];
      const Vox = (Box) => (Box.Max[0] - Box.Min[0]) * (Box.Max[1] - Box.Min[1]) * (Box.Max[2] - Box.Min[2]);

      if (BakeMeshes && St.Mesh) {
        St.Mesh.Grids.forEach((G, M) => {
          Plan.push({ Entry: "LocalBakeEntry", Slot: Stage([0, 0, 0], [G.Count, 0, 0], M, 0), Groups: [Math.ceil(G.Count / 64), 1, 1] });
        });
        St.MeshBaked = true;
        St.Stats.MeshBakes += 1;
      }
      for (let C = 0; C < 2; ++C) {
        const Sb = StaticBoxes[C];
        if (Sb) {
          Plan.push({ Entry: "StaticBuildEntry", Slot: Stage(Sb.Min, Sb.Max, C, 0), Groups: Groups4(Sb) });
          St.Stats.StaticVoxels += Vox(Sb);
        }
        const Cb = UnionVoxelBox(Sb, DynBoxes[C]);
        if (Cb) {
          Plan.push({ Entry: "ComposeEntry", Slot: Stage(Cb.Min, Cb.Max, C, DynCount), Groups: Groups4(Cb) });
          St.Stats.ComposeVoxels += Vox(Cb);
        }
      }
      const ReadRad = St.RadFlip ? T.RadB : T.RadA, WriteRad = St.RadFlip ? T.RadA : T.RadB;
      const ReadInd = St.RadFlip ? T.IndB : T.IndA, WriteInd = St.RadFlip ? T.IndA : T.IndB;
      if (Lighting) {
        for (let C = 0; C < 2; ++C) {
          const R = C === 0 ? L.Res0 : L.Res1;
          Plan.push({
            Entry: "SurfaceLightEntry", Slot: Stage([0, 0, 0], [R, R, R], C, 0), Groups: [Math.ceil(R / 4), Math.ceil(R / 4), Math.ceil(R / 4)],
            Extra: { 15: ReadRad, 16: WriteRad, 22: ReadInd, 23: WriteInd },
          });
        }
        if (Engine === 4) {
          const Ps = Stage([0, 0, 0], [0, 0, 0], 0, 0);
          Plan.push({ Entry: "ProbeTraceEntry", Slot: Ps, Groups: [L.Probe.Cells, 1, 1], Extra: { 15: WriteRad } });
          Plan.push({ Entry: "ProbeBlendEntry", Slot: Ps, Groups: [L.Probe.Cells, 1, 1] });
        }
      }

      if (Slot > 0) Device.queue.writeBuffer(ParamBuf, 0, ParamStage.buffer, 0, Slot * SLOT_BYTES);
      if (Plan.length) {
        const Pass = Encoder.beginComputePass({ label: "GlobalDistanceFieldGi" });
        for (const Step of Plan) {
          Pass.setPipeline(Pipes[Step.Entry]);
          Pass.setBindGroup(0, Group(Step.Entry, Step.Slot, Step.Extra ? { ...Res, ...Step.Extra } : Res));
          Pass.dispatchWorkgroups(Step.Groups[0], Step.Groups[1], Step.Groups[2]);
        }
        Pass.end();
      }
      if (StaticBoxes[0] || StaticBoxes[1] || DynBoxes[0] || DynBoxes[1]) St.FieldReady = true;
      if (Lighting) {
        St.RadFlip ^= 1;
        St.RadReady = true;
        St.LightFrames += 1;
        St.Stats.LightPasses += 1;
        if (Engine === 4) {
          St.ProbeReady = true;
          St.Stats.ProbePasses += 1;
        }
      }
      St.Frame += 1;

      const HeaderKey = `${L.Key}|${L.ProbeKey}|${L.Probe.Rays}|${St.ProbeReady}|${St.FieldReady}`;
      if (HeaderKey !== St.HeaderKey) {
        St.HeaderKey = HeaderKey;
        WriteGdfFieldHeader(L, HeaderScratch, { ProbeOn: St.ProbeReady, FieldOn: St.FieldReady });
        Device.queue.writeBuffer(St.FieldBuf, 0, HeaderScratch);
      }
      return {
        FieldReady: St.FieldReady && St.RadReady,
        ProbeReady: St.ProbeReady,
        Converging: St.LightFrames < GDF_CONVERGE_FRAMES,
        LightFrames: St.LightFrames,
      };
    },

    // Forces the surface cache / probes to re-converge (e.g. after device-side resource loss of the sky texture).
    Invalidate() { St.LightFrames = 0; },

    Destroy() {
      DestroyVolumes();
      for (const B of [ParamBuf, DynInstBuf, Placeholder, St.FieldBuf, St.RaysBuf, St.LocalSdfBuf, St.MeshGridBuf]) {
        try { B?.destroy(); } catch {}
      }
    },
  };
  return Api;
}
