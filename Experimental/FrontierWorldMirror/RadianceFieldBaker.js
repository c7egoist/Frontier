//==========================================================================================================================================
// FILE: RadianceFieldBaker.js
// PURPOSE: Drives the C++-parity GI bakes for the selected engine and hands one packed Float32Array (RadianceFieldLayout.js) to every
//          renderer (CPU band workers, WebGPU storage buffer, WebGL RGBA32F texture).
//            * voxel_sdf -> VoxelSdfClipmap (TieredWorldRenderSequence clip boxes, BakeStaticSurfaceCacheLighting)
//            * ddgi      -> DynamicProbeCache (UpdateProbeCache)
//          Bakes run in a dedicated Blob Web Worker in the browser (the factories are hermetic) and synchronously under Node.
//==========================================================================================================================================

import { ATLAS_COLS, ATLAS_TILE_SIZE, ATLAS_WIDTH, TILES_PER_PRIM } from "./MaterialAtlasCompiler.js";
import { CreateGtxBandKernel } from "./CpuGtxFallbackRenderer.js";
import { SKY_VIEW_HEIGHT, SKY_VIEW_WIDTH } from "./AtmosphereSky.js";
import { BuildVehicleTlasAndInstances } from "./VehicleBvhAssets.js";
import { CreateRadianceFieldScene } from "./RadianceFieldScene.js";
import { CreateDynamicProbeCache } from "./DynamicProbeCache.js";
import { CreateVoxelSdfClipmap } from "./VoxelSdfClipmap.js";
import { PackRadianceField } from "./RadianceFieldLayout.js";

const GI_FIELD_ENGINES = new Set(["voxel_sdf", "ddgi"]);

// Everything the bake depends on, minus camera / exposure / reflections, so orbiting never re-bakes.
export function DescribeRadianceFieldRequest(CompiledScene, AtlasVersion = 0) {
  const Rs = CompiledScene?.RenderSettings || {};
  if (!GI_FIELD_ENGINES.has(Rs.GiAlgorithm)) return null;
  const Engine = Rs.GiAlgorithm;
  const Cfg = Engine === "ddgi"
    ? {
        GridMinimumWorld: Rs.ProbeGridMinimum,
        GridMaximumWorld: Rs.ProbeGridMaximum,
        CountX: Rs.ProbeCountX,
        CountY: Rs.ProbeCountY,
        CountZ: Rs.ProbeCountZ,
        FibonacciRayCount: Rs.ProbeRayCount,
        BouncePasses: Rs.ProbeBouncePasses,
        TemporalBlend: Rs.ProbeTemporalBlend,
      }
    : {
        Center: Rs.ClipmapCenter,
        HalfExtent0: Rs.ClipmapHalfExtent0,
        HalfExtent1: Rs.ClipmapHalfExtent1,
        Resolution0: Rs.ClipmapResolution0,
        Resolution1: Rs.ClipmapResolution1,
        RadiosityBounces: Rs.ClipmapRadiosityBounces,
        Mask: {
          Emissive: Rs.ClipmapLightEmissive !== false,
          Point: Rs.ClipmapLightPoint !== false,
          Sun: Rs.ClipmapLightSun !== false,
          Area: Rs.ClipmapLightArea !== false,
          SkyFill: Rs.ClipmapLightSkyFill !== false,
        },
      };
  const Sun = {
    Dir: CompiledScene.SunDir,
    Irradiance: CompiledScene.SunIrradiance,
    AngularRadius: CompiledScene.SunAngularRadiusRad || 0.0045,
  };
  const Geo = (CompiledScene.Primitives || []).map((P) => [
    P.Shape, P.Center, P.RotationRad, P.HalfExtents, P.BaseColor, P.Metallic, P.Roughness, P.Emission, P.Transmission,
    P.GiContributor, P.CastShadows, P.GlassShell, P.FaceAtlas ? 1 : 0,
  ]);
  const Lights = (CompiledScene.AreaLights || []).map((L) => [L.Center, L.Normal, L.Right, L.Up, L.HalfWidth, L.HalfHeight, L.Radiance, L.Omni]);
  const Vehicles = (CompiledScene.Vehicles || []).map((V) => JSON.stringify(V));
  const R = (V) => (Array.isArray(V) ? V.map((C) => Number(C).toFixed(4)).join(",") : String(V));
  const Key = JSON.stringify([Engine, Cfg, R(Sun.Dir), R(Sun.Irradiance), R(Sun.AngularRadius), R(CompiledScene.SkyRadiance), Geo, Lights, Vehicles, AtlasVersion]);
  return { Engine, Cfg, Sun, Sky: CompiledScene.SkyRadiance, Key };
}

function BuildVehicleData(CompiledScene, VehicleBvhAssets) {
  if (!VehicleBvhAssets || !CompiledScene?.Vehicles?.length) return null;
  const Built = BuildVehicleTlasAndInstances(CompiledScene.Vehicles, VehicleBvhAssets);
  if (!Built.instanceCount) return null;
  return { nodes: VehicleBvhAssets.nodeTexData, tris: VehicleBvhAssets.triTexData, insts: Built.instanceBuffer, instCount: Built.instanceCount };
}

// Hermetic bake entry (also used verbatim inside the worker).
function RunRadianceFieldBake(Factories, Request, CompiledScene, AtlasPixels, VehicleData, Previous, Progress) {
  const Engine = new Factories.Kernel.GtxBandEngine();
  const Query = Factories.CreateRadianceFieldScene(Engine, CompiledScene, AtlasPixels, VehicleData);
  const T0 = Date.now();
  let Probe = null, Clip = null;
  if (Request.Engine === "ddgi") {
    Probe = Factories.DynamicProbeCache.Bake(Query, Request.Cfg, Request.Sun, Request.Sky, Previous);
  } else {
    Clip = Factories.VoxelSdfClipmap.Bake(Query, Request.Cfg, Request.Sun, Request.Sky, Request.Cfg.Mask, Progress);
  }
  const Field = Factories.PackRadianceField(Probe, Clip);
  const Stats = { Engine: Request.Engine, Ms: Date.now() - T0, Vec4: Field.length / 4 };
  if (Clip) {
    let Surf0 = 0, Surf1 = 0;
    for (const V of Clip.Cascades[0].Surface) Surf0 += V;
    for (const V of Clip.Cascades[1].Surface) Surf1 += V;
    Stats.SurfaceVoxels = [Surf0, Surf1];
    Stats.Dims = Clip.Cascades.map((C) => [C.DimX, C.DimY, C.DimZ]);
  }
  if (Probe) {
    Stats.Cells = Probe.Cells.length / 4;
    let Bad = 0;
    for (let I = 0; I < Stats.Cells; ++I) if (Probe.Cells[I * 4 + 3] > 0.25) ++Bad;
    Stats.GatedCells = Bad;
  }
  return { Field, Stats, ProbeState: Probe ? { Cells: Probe.Cells, Irr: Probe.Irr } : null };
}

function LocalFactories() {
  return {
    Kernel: CreateGtxBandKernel(ATLAS_WIDTH, ATLAS_COLS, ATLAS_TILE_SIZE, TILES_PER_PRIM, SKY_VIEW_WIDTH, SKY_VIEW_HEIGHT),
    CreateRadianceFieldScene,
    DynamicProbeCache: CreateDynamicProbeCache(),
    VoxelSdfClipmap: CreateVoxelSdfClipmap(),
    PackRadianceField,
  };
}

let CachedLocalFactories = null;

export function BakeRadianceFieldSync(CompiledScene, AtlasPixels, VehicleBvhAssets, Previous = null, AtlasVersion = 0) {
  const Request = DescribeRadianceFieldRequest(CompiledScene, AtlasVersion);
  if (!Request) return null;
  CachedLocalFactories = CachedLocalFactories || LocalFactories();
  const Out = RunRadianceFieldBake(CachedLocalFactories, Request, CompiledScene, AtlasPixels, BuildVehicleData(CompiledScene, VehicleBvhAssets), Previous, null);
  return { ...Out, Key: Request.Key, Engine: Request.Engine };
}

//==========================================================================================================================================
// Async baker: one worker, newest request wins, current field stays valid until the next one lands.
//==========================================================================================================================================
export class RadianceFieldBaker {
  constructor() {
    this.Field = null;
    this.FieldKey = "";
    this.FieldEngine = "";
    this.Stats = null;
    this.Status = "idle";
    this.Progress = 0;
    this.Version = 0;
    this.Epoch = 0; // bumps on every new field and on Invalidate(): viewports redraw (and thereby re-Request) when it changes
    this._Worker = null;
    this._BusyKey = "";
    this._Pending = null;
    this._ProbeState = null;
    this._Listeners = new Set();
  }

  // Force the next Request() to bake again (inspector "Rebake").
  Invalidate() {
    this.FieldKey = "";
    this.Epoch += 1;
    this._Emit();
  }

  Subscribe(Fn) {
    this._Listeners.add(Fn);
    return () => this._Listeners.delete(Fn);
  }

  _Emit() {
    for (const Fn of this._Listeners) {
      try { Fn(this); } catch {}
    }
  }

  // Returns the field matching the request (or null while the first bake is in flight / engine needs none).
  Request(CompiledScene, AtlasPixels, AtlasVersion, VehicleBvhAssets) {
    const Req = DescribeRadianceFieldRequest(CompiledScene, AtlasVersion);
    if (!Req) return null;
    if (Req.Key === this.FieldKey) return this.Field;
    if (Req.Key !== this._BusyKey) {
      this._Pending = { Req, CompiledScene, AtlasPixels, VehicleBvhAssets };
      this._Kick();
    }
    return this.FieldEngine === Req.Engine ? this.Field : null;
  }

  _EnsureWorker() {
    if (this._Worker !== null) return !!this._Worker;
    if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
      this._Worker = false;
      return false;
    }
    try {
      const Source = [
        `"use strict";`,
        `const CreateGtxBandKernel = ${CreateGtxBandKernel.toString()};`,
        `const Factories = {`,
        `  Kernel: CreateGtxBandKernel(${ATLAS_WIDTH}, ${ATLAS_COLS}, ${ATLAS_TILE_SIZE}, ${TILES_PER_PRIM}, ${SKY_VIEW_WIDTH}, ${SKY_VIEW_HEIGHT}),`,
        `  CreateRadianceFieldScene: ${CreateRadianceFieldScene.toString()},`,
        `  DynamicProbeCache: (${CreateDynamicProbeCache.toString()})(),`,
        `  VoxelSdfClipmap: (${CreateVoxelSdfClipmap.toString()})(),`,
        `  PackRadianceField: ${PackRadianceField.toString()},`,
        `};`,
        `const RunRadianceFieldBake = ${RunRadianceFieldBake.toString()};`,
        `self.onmessage = (Ev) => {`,
        `  const M = Ev.data;`,
        `  try {`,
        `    const Progress = (Stage, Frac) => self.postMessage({ Phase: "progress", Key: M.Key, Stage, Frac });`,
        `    const Atlas = M.AtlasBuffer ? new Uint8Array(M.AtlasBuffer) : null;`,
        `    const Out = RunRadianceFieldBake(Factories, M.Request, M.CompiledScene, Atlas, M.VehicleData, M.Previous, Progress);`,
        `    self.postMessage({ Phase: "done", Key: M.Key, Field: Out.Field, Stats: Out.Stats, ProbeState: Out.ProbeState }, [Out.Field.buffer]);`,
        `  } catch (Err) {`,
        `    self.postMessage({ Phase: "error", Key: M.Key, Message: String(Err && Err.stack || Err) });`,
        `  }`,
        `};`,
      ].join("\n");
      const Url = URL.createObjectURL(new Blob([Source], { type: "text/javascript" }));
      this._Worker = new Worker(Url);
      this._Worker.onmessage = (Ev) => this._ReceiveBakeMessage(Ev.data);
      this._Worker.onerror = (Ev) => {
        this.Status = `error: ${Ev?.message || "worker failed"}`;
        this._BusyKey = "";
        this._Emit();
      };
      return true;
    } catch {
      this._Worker = false;
      return false;
    }
  }

  _Kick() {
    if (this._BusyKey || !this._Pending) return;
    const { Req, CompiledScene, AtlasPixels, VehicleBvhAssets } = this._Pending;
    this._Pending = null;
    this._BusyKey = Req.Key;
    this.Status = `baking ${Req.Engine === "ddgi" ? "DynamicProbeCache" : "VoxelSdfClipmap"}`;
    this.Progress = 0;
    this._Emit();
    const VehicleData = BuildVehicleData(CompiledScene, VehicleBvhAssets);
    const Previous = Req.Engine === "ddgi" ? this._ProbeState : null;
    if (this._EnsureWorker()) {
      const Atlas = AtlasPixels ? AtlasPixels.slice() : null;
      const Veh = VehicleData
        ? { nodes: VehicleData.nodes.slice(), tris: VehicleData.tris.slice(), insts: VehicleData.insts.slice(), instCount: VehicleData.instCount }
        : null;
      const Transfer = [];
      if (Atlas) Transfer.push(Atlas.buffer);
      if (Veh) Transfer.push(Veh.nodes.buffer, Veh.tris.buffer, Veh.insts.buffer);
      const SceneLite = { ...CompiledScene, ForceOverlay: null };
      this._Worker.postMessage(
        { Key: Req.Key, Request: Req, CompiledScene: SceneLite, AtlasBuffer: Atlas ? Atlas.buffer : null, VehicleData: Veh, Previous },
        Transfer,
      );
      return;
    }
    // No worker (tests / SSR): bake on a macrotask so the caller's frame completes first.
    setTimeout(() => {
      try {
        CachedLocalFactories = CachedLocalFactories || LocalFactories();
        const Out = RunRadianceFieldBake(CachedLocalFactories, Req, CompiledScene, AtlasPixels, VehicleData, Previous, null);
        this._ReceiveBakeMessage({ Phase: "done", Key: Req.Key, Field: Out.Field, Stats: Out.Stats, ProbeState: Out.ProbeState });
      } catch (Err) {
        this._ReceiveBakeMessage({ Phase: "error", Key: Req.Key, Message: String(Err?.stack || Err) });
      }
    }, 0);
  }

  _ReceiveBakeMessage(M) {
    if (!M) return;
    if (M.Phase === "progress") {
      this.Status = `baking · ${M.Stage}`;
      this.Progress = M.Frac;
      this._Emit();
      return;
    }
    if (M.Key !== this._BusyKey) return;
    this._BusyKey = "";
    if (M.Phase === "done") {
      let Engine = "";
      try { Engine = JSON.parse(M.Key)[0]; } catch {}
      this.Field = M.Field;
      this.FieldKey = M.Key;
      this.FieldEngine = Engine;
      this.Stats = M.Stats;
      if (M.ProbeState) this._ProbeState = M.ProbeState;
      this.Status = `ready · ${M.Stats?.Ms ?? 0} ms`;
      this.Progress = 1;
      this.Version += 1;
      this.Epoch += 1;
    } else {
      this.Status = `error: ${M.Message}`;
      console.warn("[RadianceFieldBaker]", M.Message);
    }
    this._Emit();
    this._Kick();
  }

  Dispose() {
    if (this._Worker) {
      try { this._Worker.terminate(); } catch {}
    }
    this._Worker = null;
    this._Listeners.clear();
  }
}

export const SharedRadianceFieldBaker = new RadianceFieldBaker();
