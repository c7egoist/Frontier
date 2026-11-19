//==========================================================================================================================================
// FILE: GlobalDistanceFieldLayout.js
// PURPOSE: Backend-neutral bookkeeping for the GPU global distance field GI (GlobalDistanceFieldGi.js / GlobalDistanceFieldGiGl.js).
//          Everything here is tiny O(primitives + instances) CPU bookkeeping that decides WHICH voxels the GPU must touch; no
//          distance, lighting or probe value is ever computed on the CPU.
//
//  CLIPMAP     2 clip levels centred on ClipmapCenter, half extents ClipmapHalfExtent0/1, resolutions ClipmapResolution0/1.
//              Both levels live in ONE stacked 3D texture: clip c occupies x,y in [0, Res_c) and z in [ZOffset_c, ZOffset_c + Res_c)
//              (ZOffset_0 = 0, ZOffset_1 = Res_0, width/height = max(Res_0, Res_1), depth = Res_0 + Res_1).
//  BAND        stored distances are truncated to +-Band_c = GDF_BAND_VOXELS voxels (Lumen-style narrow band). A change of the
//              geometry inside box B therefore only changes voxels inside B expanded by Band_c, which is what makes the
//              incremental dirty-region update exact.
//  FIELD HEADER (floats 0..95 = 24 vec4 of the field buffer / RGBA32F texture, read by RadianceFieldShaders.js)
//    [0] 1   [1] probe volume on   [2] distance field on   [3] total vec4
//    [4..6] probe grid min  [7] min probe spacing  [8..10] probe spacing  [11] probe max ray distance
//    [12..14] probe counts  [15] cell offset (vec4)  [16] irradiance offset (vec4)  [17] moment offset (vec4)
//    [20] Res0  [21] Res1  [22] stack width  [23] stack depth
//    [24..26] clip centre  [27] half extent 0  [28] half extent 1  [29] voxel 0  [30] voxel 1  [31] z offset of clip 1
//    [32] band 0  [33] band 1  [34] trace max distance
//  PROBE BLOCK cell i -> (relocated x, y, z, backface flag); irradiance 8x8 octahedral texels (rgb = irradiance / PI);
//              moments 16x16 octahedral texels packed two per vec4 (mean, mean^2).
//==========================================================================================================================================

export const GDF_BAND_VOXELS = 6;
export const GDF_FIELD_HEADER_VEC4 = 24;
export const GDF_FIELD_TEXTURE_WIDTH = 2048;
export const GDF_CONVERGE_FRAMES = 72;
export const GDF_MAX_DYNAMIC_INSTANCES = 36;

const Clamp = (V, Lo, Hi) => (V < Lo ? Lo : V > Hi ? Hi : V);
const Num = (V, D) => (Number.isFinite(Number(V)) ? Number(V) : D);

// Resolved clipmap + probe layout from the (already sanitised) render settings.
export function ResolveGdfLayout(Rs = {}) {
  const Center = Array.isArray(Rs.ClipmapCenter) && Rs.ClipmapCenter.length >= 3 ? Rs.ClipmapCenter.map((V) => Num(V, 0)) : [0, 0.45, 0.55];
  const Res0 = Math.round(Clamp(Num(Rs.ClipmapResolution0, 48), 16, 96) / 4) * 4;
  const Res1 = Math.round(Clamp(Num(Rs.ClipmapResolution1, 48), 16, 96) / 4) * 4;
  const Half0 = Clamp(Num(Rs.ClipmapHalfExtent0, 2.8), 0.5, 16);
  const Half1 = Math.max(Half0 * 1.05, Clamp(Num(Rs.ClipmapHalfExtent1, 5.6), 1, 32));
  const Voxel0 = (2 * Half0) / Res0;
  const Voxel1 = (2 * Half1) / Res1;
  const PMin = Array.isArray(Rs.ProbeGridMinimum) ? Rs.ProbeGridMinimum.map((V) => Num(V, 0)) : [-2.02, -1.2, -0.58];
  const PMaxRaw = Array.isArray(Rs.ProbeGridMaximum) ? Rs.ProbeGridMaximum.map((V) => Num(V, 0)) : [2.02, 2.15, 1.75];
  const PMax = PMaxRaw.map((V, I) => Math.max(V, PMin[I] + 0.1));
  const Counts = [
    Math.round(Clamp(Num(Rs.ProbeCountX, 7), 2, 16)),
    Math.round(Clamp(Num(Rs.ProbeCountY, 6), 2, 16)),
    Math.round(Clamp(Num(Rs.ProbeCountZ, 4), 2, 16)),
  ];
  const Spacing = PMin.map((V, I) => (PMax[I] - V) / Math.max(1, Counts[I] - 1));
  const Cells = Counts[0] * Counts[1] * Counts[2];
  const CellOffset = GDF_FIELD_HEADER_VEC4;
  const IrrOffset = CellOffset + Cells;
  const MomOffset = IrrOffset + Cells * 64;
  const TotalVec4 = MomOffset + Cells * 128;
  return {
    Center, Res0, Res1, Half0, Half1, Voxel0, Voxel1,
    StackW: Math.max(Res0, Res1), StackD: Res0 + Res1, ZOffset1: Res0,
    Band0: GDF_BAND_VOXELS * Voxel0, Band1: GDF_BAND_VOXELS * Voxel1,
    TraceMax: Half1 * 2.2,
    Probe: {
      Min: PMin, Spacing, Counts, Cells,
      MinSpacing: Math.min(Spacing[0], Spacing[1], Spacing[2]),
      MaxDepth: Math.max(Spacing[0], Spacing[1], Spacing[2]) * 2.5,
      Rays: Math.round(Clamp(Num(Rs.ProbeRayCount, 64), 16, 256)),
      CellOffset, IrrOffset, MomOffset, TotalVec4,
    },
    FieldRows: Math.ceil(TotalVec4 / GDF_FIELD_TEXTURE_WIDTH),
    Key: [Center.join(","), Res0, Res1, Half0, Half1].join("|"),
    ProbeKey: [PMin.join(","), PMax.join(","), Counts.join(",")].join("|"),
  };
}

// Header floats (24 vec4) for the field buffer / texture.
export function WriteGdfFieldHeader(L, Out = new Float32Array(GDF_FIELD_HEADER_VEC4 * 4), { ProbeOn = true, FieldOn = true } = {}) {
  Out.fill(0);
  const P = L.Probe;
  Out[0] = 1;
  Out[1] = ProbeOn ? 1 : 0;
  Out[2] = FieldOn ? 1 : 0;
  Out[3] = P.TotalVec4;
  Out[4] = P.Min[0]; Out[5] = P.Min[1]; Out[6] = P.Min[2];
  Out[7] = P.MinSpacing;
  Out[8] = P.Spacing[0]; Out[9] = P.Spacing[1]; Out[10] = P.Spacing[2];
  Out[11] = P.MaxDepth;
  Out[12] = P.Counts[0]; Out[13] = P.Counts[1]; Out[14] = P.Counts[2];
  Out[15] = P.CellOffset; Out[16] = P.IrrOffset; Out[17] = P.MomOffset;
  Out[20] = L.Res0; Out[21] = L.Res1; Out[22] = L.StackW; Out[23] = L.StackD;
  Out[24] = L.Center[0]; Out[25] = L.Center[1]; Out[26] = L.Center[2];
  Out[27] = L.Half0; Out[28] = L.Half1; Out[29] = L.Voxel0; Out[30] = L.Voxel1; Out[31] = L.ZOffset1;
  Out[32] = L.Band0; Out[33] = L.Band1; Out[34] = L.TraceMax;
  return Out;
}

// World AABB (min/max) -> voxel box [Min, Max) of clip `Clip`, expanded by that clip's band; null when outside the clip.
export function ComputeDirtyVoxelBox(L, Clip, BoxMin, BoxMax) {
  const Res = Clip === 0 ? L.Res0 : L.Res1;
  const Half = Clip === 0 ? L.Half0 : L.Half1;
  const Voxel = Clip === 0 ? L.Voxel0 : L.Voxel1;
  const Band = (Clip === 0 ? L.Band0 : L.Band1) + Voxel;
  const Lo = [0, 0, 0], Hi = [0, 0, 0];
  for (let A = 0; A < 3; ++A) {
    const Origin = L.Center[A] - Half;
    Lo[A] = Math.max(0, Math.floor((BoxMin[A] - Band - Origin) / Voxel - 0.5));
    Hi[A] = Math.min(Res, Math.ceil((BoxMax[A] + Band - Origin) / Voxel + 0.5));
    if (Hi[A] <= Lo[A]) return null;
  }
  return { Min: Lo, Max: Hi };
}

export function UnionVoxelBox(A, B) {
  if (!A) return B ? { Min: B.Min.slice(), Max: B.Max.slice() } : null;
  if (!B) return A;
  return { Min: A.Min.map((V, I) => Math.min(V, B.Min[I])), Max: A.Max.map((V, I) => Math.max(V, B.Max[I])) };
}

export function FullVoxelBox(L, Clip) {
  const R = Clip === 0 ? L.Res0 : L.Res1;
  return { Min: [0, 0, 0], Max: [R, R, R] };
}

// World AABB of packed primitive row `I` (SceneData layout: 8 vec4 per row; rows 0..383 primitives).
function PrimRowBounds(Buf, I) {
  const B = I * 32;
  const Cx = Buf[B], Cy = Buf[B + 1], Cz = Buf[B + 2];
  const Hx = Buf[B + 4], Hy = Buf[B + 5], Hz = Buf[B + 6];
  const Ex = Math.abs(Buf[B + 8]) * Hx + Math.abs(Buf[B + 12]) * Hy + Math.abs(Buf[B + 16]) * Hz;
  const Ey = Math.abs(Buf[B + 9]) * Hx + Math.abs(Buf[B + 13]) * Hy + Math.abs(Buf[B + 17]) * Hz;
  const Ez = Math.abs(Buf[B + 10]) * Hx + Math.abs(Buf[B + 14]) * Hy + Math.abs(Buf[B + 18]) * Hz;
  return { Min: [Cx - Ex, Cy - Ey, Cz - Ez], Max: [Cx + Ex, Cy + Ey, Cz + Ez] };
}

// Geometry-relevant words of a primitive row: centre, shape, half extents, flags, rotation, GI albedo + emission.
const PRIM_GEOMETRY_WORDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 16, 17, 18, 24, 25, 26, 27];

// Diffs the packed primitive rows against the previous snapshot. Returns world AABBs (old + new) of every changed primitive, or
// "all" when the primitive count changed. Snapshot is updated in place.
export function DiffPrimitiveRows(Snapshot, Buf, PCount) {
  if (!Snapshot.Rows || Snapshot.Count !== PCount) {
    Snapshot.Rows = new Float32Array(Math.max(1, PCount) * 32);
    Snapshot.Rows.set(Buf.subarray(0, PCount * 32));
    Snapshot.Count = PCount;
    return "all";
  }
  const Changed = [];
  for (let I = 0; I < PCount; ++I) {
    const B = I * 32;
    let Same = true;
    for (const W of PRIM_GEOMETRY_WORDS) {
      if (Snapshot.Rows[B + W] !== Buf[B + W]) { Same = false; break; }
    }
    if (Same) continue;
    Changed.push(PrimRowBounds(Snapshot.Rows, I), PrimRowBounds(Buf, I));
    Snapshot.Rows.set(Buf.subarray(B, B + 32), B);
  }
  return Changed;
}

// Light-relevant signature (area light rows + sun/moon/sky + GI lighting switches): changes restart the radiance convergence.
export function LightingSignature(Scene, Buf, LCount, Rs) {
  let H = 2166136261 >>> 0;
  const Mix = (V) => {
    const F = Math.round(Number(V) * 4096) | 0;
    H = Math.imul(H ^ F, 16777619) >>> 0;
  };
  for (let I = 0; I < LCount * 32; ++I) Mix(Buf[384 * 32 + I]);
  for (const V of Scene.SunDir || []) Mix(V);
  for (const V of Scene.SunIrradiance || []) Mix(V);
  for (const V of Scene.SkyRadiance || []) Mix(V);
  const Mn = Scene.Moon || {};
  for (const V of Mn.dir || []) Mix(V);
  Mix(Mn.visible ? 1 : 0); Mix(Mn.bright ?? 0); Mix(Mn.phase ?? 0);
  Mix(Rs.ClipmapLightSun !== false); Mix(Rs.ClipmapLightArea !== false); Mix(Rs.ClipmapLightPoint !== false);
  Mix(Rs.ClipmapLightEmissive !== false); Mix(Rs.ClipmapLightSkyFill !== false); Mix(Rs.SdfGiBilateral !== false);
  Mix(Num(Rs.FillBoost, 1.15)); Mix(Num(Rs.ClipmapRadiosityBounces, 2)); Mix(Num(Rs.ProbeBouncePasses, 2));
  Mix(Num(Rs.ProbeRayCount, 64)); Mix(Num(Rs.ShadowSoftness, 1)); Mix(Num(Rs.ProbeTemporalBlend, 0));
  return H;
}

// Dynamic SDF instances (vehicle body, tyres, rims): world->local rows, world AABB, mesh, scale, paint, material override.
// Record = 8 vec4 (32 floats). Bounds are returned separately for the dirty-region diff.
export function PackDynamicInstances(Instances, Assets, Out) {
  const Bounds = [];
  const Count = Math.min(GDF_MAX_DYNAMIC_INSTANCES, Instances.length);
  Out.fill(0);
  for (let I = 0; I < Count; ++I) {
    const Inst = Instances[I];
    const Lb = Assets.meshLocalBounds[Inst.meshIdx];
    const M = Inst.l2w, W = Inst.w2l;
    const Min = [1e30, 1e30, 1e30], Max = [-1e30, -1e30, -1e30];
    for (let C = 0; C < 8; ++C) {
      const Lx = C & 1 ? Lb.max[0] : Lb.min[0];
      const Ly = C & 2 ? Lb.max[1] : Lb.min[1];
      const Lz = C & 4 ? Lb.max[2] : Lb.min[2];
      const P = [
        M[0] * Lx + M[4] * Ly + M[8] * Lz + M[12],
        M[1] * Lx + M[5] * Ly + M[9] * Lz + M[13],
        M[2] * Lx + M[6] * Ly + M[10] * Lz + M[14],
      ];
      for (let A = 0; A < 3; ++A) { Min[A] = Math.min(Min[A], P[A]); Max[A] = Math.max(Max[A], P[A]); }
    }
    const B = I * 32;
    for (let R = 0; R < 3; ++R) {
      Out[B + R * 4] = W[R]; Out[B + R * 4 + 1] = W[4 + R]; Out[B + R * 4 + 2] = W[8 + R]; Out[B + R * 4 + 3] = W[12 + R];
    }
    Out[B + 12] = Min[0]; Out[B + 13] = Min[1]; Out[B + 14] = Min[2]; Out[B + 15] = Inst.meshIdx;
    Out[B + 16] = Max[0]; Out[B + 17] = Max[1]; Out[B + 18] = Max[2];
    Out[B + 19] = Math.max(1e-4, Math.hypot(M[0], M[1], M[2]));
    Out[B + 20] = Inst.paint[0]; Out[B + 21] = Inst.paint[1]; Out[B + 22] = Inst.paint[2]; Out[B + 23] = Inst.rough;
    Out[B + 24] = Inst.matOverride + 1; Out[B + 25] = Inst.coat;
    Bounds.push({ Min, Max, Key: Out.subarray(B, B + 26).join(",") });
  }
  return { Count, Bounds };
}

// Local mesh SDF grids (one per vehicle mesh): node-centred grid over the padded mesh bounds.
export function PlanLocalMeshGrids(Assets, Spacing = 0.05, Pad = 0.3) {
  const Grids = [];
  let Offset = 0;
  for (let M = 0; M < Assets.meshLocalBounds.length; ++M) {
    const Lb = Assets.meshLocalBounds[M];
    const Ext = [0, 1, 2].map((A) => Lb.max[A] - Lb.min[A] + 2 * Pad);
    const Sp = Math.max(Spacing, Math.max(Ext[0], Ext[1], Ext[2]) / 112);
    const Dims = Ext.map((E) => Math.max(2, Math.ceil(E / Sp) + 1));
    const Min = [0, 1, 2].map((A) => Lb.min[A] - Pad);
    const Meta = Assets.meshMeta[M] || {};
    Grids.push({ Min, Spacing: Sp, Dims, Offset, Root: 96 + (Meta.nodeOffset || 0), Count: Dims[0] * Dims[1] * Dims[2] });
    Offset += Dims[0] * Dims[1] * Dims[2];
  }
  const Meta = new Float32Array(Math.max(1, Grids.length) * 12);
  Grids.forEach((G, I) => {
    Meta.set([G.Min[0], G.Min[1], G.Min[2], G.Spacing, G.Dims[0], G.Dims[1], G.Dims[2], G.Offset, G.Root, G.Count, 0, 0], I * 12);
  });
  return { Grids, Meta, TotalVoxels: Offset };
}

// Per-frame random rotation (rows) for the probe / surface-cache ray sets (temporal integration needs fresh directions).
export function FrameRotationRows(Frame) {
  let S = (Frame * 2654435761) >>> 0;
  const R = () => ((S = (Math.imul(S ^ (S >>> 15), 2246822519) + 0x9e3779b9) >>> 0) / 4294967296);
  const U1 = R(), U2 = R(), U3 = R();
  const Qx = Math.sqrt(1 - U1) * Math.sin(2 * Math.PI * U2), Qy = Math.sqrt(1 - U1) * Math.cos(2 * Math.PI * U2);
  const Qz = Math.sqrt(U1) * Math.sin(2 * Math.PI * U3), Qw = Math.sqrt(U1) * Math.cos(2 * Math.PI * U3);
  return [
    [1 - 2 * (Qy * Qy + Qz * Qz), 2 * (Qx * Qy - Qz * Qw), 2 * (Qx * Qz + Qy * Qw)],
    [2 * (Qx * Qy + Qz * Qw), 1 - 2 * (Qx * Qx + Qz * Qz), 2 * (Qy * Qz - Qx * Qw)],
    [2 * (Qx * Qz - Qy * Qw), 2 * (Qy * Qz + Qx * Qw), 1 - 2 * (Qx * Qx + Qy * Qy)],
  ];
}

// Radiosity feedback bounces of the active engine: voxel_sdf (3) -> ClipmapRadiosityBounces, ddgi (4) -> ProbeBouncePasses - 1.
// 0 = the surface cache holds direct light only (single indirect bounce); N > 0 = multi-bounce feedback, 4N rays per voxel.
export function RadiosityBounces(Rs, Engine) {
  return Engine === 4
    ? Math.round(Clamp(Num(Rs.ProbeBouncePasses, 2), 1, 4)) - 1
    : Math.round(Clamp(Num(Rs.ClipmapRadiosityBounces, 2), 0, 4));
}

// GI lighting switches -> flag bits shared by every backend kernel.
//   1 sun + moon   2 area lights   4 point (omni) lights   8 emissive primitives   16 sky fill   32 multi-bounce   64 bilateral
export function GiLightFlags(Rs, Engine = 3) {
  return (Rs.ClipmapLightSun !== false ? 1 : 0)
    | (Rs.ClipmapLightArea !== false ? 2 : 0)
    | (Rs.ClipmapLightPoint !== false ? 4 : 0)
    | (Rs.ClipmapLightEmissive !== false ? 8 : 0)
    | (Rs.ClipmapLightSkyFill !== false ? 16 : 0)
    | (RadiosityBounces(Rs, Engine) > 0 ? 32 : 0)
    | (Rs.SdfGiBilateral !== false ? 64 : 0);
}

// Moon irradiance (same formula as the scene shaders' evalMoonIrradiance) so the surface cache sees the same moonlight.
export function MoonIrradiance(Scene) {
  const Mn = Scene.Moon || {};
  const Dir = Mn.dir || [-0.5, 0.4, 0.45];
  if (!Mn.visible || Dir[2] <= 0.01) return { Dir, Irr: [0, 0, 0] };
  const Phase = 0.25 + 0.75 * Math.sin(Clamp(Mn.phase ?? 0.62, 0, 1) * Math.PI);
  const Fade = Clamp(1 - ((Scene.SunDir?.[2] ?? 0.5) + 0.05) * 4.5, 0.08, 1);
  const Tint = Mn.tint || [0.94, 0.93, 0.9];
  const K = Math.max(0, Mn.bright ?? 1.6) * 0.085 * Phase * Fade;
  return { Dir, Irr: [Tint[0] * K, Tint[1] * K, Tint[2] * K] };
}

// Shared per-frame uniform block (GiParams) — identical layout on WebGPU (uniform buffer) and WebGL (uniform vec4 array).
export const GI_PARAM_VEC4 = 20;
export function PackGiParams(Out, L, Scene, Rs, Frame, Alpha, ProbeAlpha, Counts, Engine = 3) {
  const F = Out.F, I = Out.I;
  F.fill(0);
  F[0] = L.Center[0]; F[1] = L.Center[1]; F[2] = L.Center[2]; F[3] = Frame;
  F[4] = L.Half0; F[5] = L.Half1; F[6] = L.Voxel0; F[7] = L.Voxel1;
  I[8] = L.Res0; I[9] = L.Res1; I[10] = L.StackW; I[11] = L.ZOffset1;
  // 12..15 box min (+clip / mesh), 16..19 box max (+instance count / voxel count): filled per dispatch
  I[20] = Counts.Prims; I[21] = Counts.Lights; I[22] = Math.max(4, Math.min(16, 4 * RadiosityBounces(Rs, Engine))); I[23] = GiLightFlags(Rs, Engine);
  const Sd = Scene.SunDir || [0, 0, 1], Si = Scene.SunIrradiance || [0, 0, 0];
  const Soft = Clamp(Num(Rs.ShadowSoftness, 1), 0.25, 2.5);
  F[24] = Sd[0]; F[25] = Sd[1]; F[26] = Sd[2]; F[27] = 10 / Soft;
  F[28] = Si[0]; F[29] = Si[1]; F[30] = Si[2]; F[31] = Alpha;
  const Moon = MoonIrradiance(Scene);
  F[32] = Moon.Dir[0]; F[33] = Moon.Dir[1]; F[34] = Moon.Dir[2]; F[35] = ProbeAlpha;
  F[36] = Moon.Irr[0]; F[37] = Moon.Irr[1]; F[38] = Moon.Irr[2]; F[39] = Clamp(Num(Rs.FillBoost, 1.15), 0.2, 2.5);
  F[40] = L.Band0; F[41] = L.Band1; F[42] = L.TraceMax; F[43] = Counts.Instances;
  // ProbeTemporalBlend 0 = no history: keep the probe ray set fixed so the un-blended result is stable.
  const Rot = Num(Rs.ProbeTemporalBlend, 0) < 0.01 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : FrameRotationRows(Frame);
  for (let R = 0; R < 3; ++R) { F[44 + R * 4] = Rot[R][0]; F[45 + R * 4] = Rot[R][1]; F[46 + R * 4] = Rot[R][2]; }
  const P = L.Probe;
  F[56] = P.Min[0]; F[57] = P.Min[1]; F[58] = P.Min[2]; F[59] = P.MinSpacing;
  F[60] = P.Spacing[0]; F[61] = P.Spacing[1]; F[62] = P.Spacing[2]; F[63] = P.MaxDepth;
  I[64] = P.Counts[0]; I[65] = P.Counts[1]; I[66] = P.Counts[2]; I[67] = P.Rays;
  I[68] = P.CellOffset; I[69] = P.IrrOffset; I[70] = P.MomOffset; I[71] = 0;
  const Sky = Scene.SkyRadiance || [0.16, 0.23, 0.36];
  F[72] = Sky[0]; F[73] = Sky[1]; F[74] = Sky[2]; F[75] = 0;
  F[76] = 0; F[77] = 0; F[78] = 0; F[79] = 0;
  return Out;
}
export function CreateGiParamBlock() {
  const Buf = new ArrayBuffer(GI_PARAM_VEC4 * 16);
  return { Buf, F: new Float32Array(Buf), I: new Int32Array(Buf) };
}
export function StampGiDispatch(Block, BoxMin, BoxMax, W0, W1) {
  Block.I[12] = BoxMin[0]; Block.I[13] = BoxMin[1]; Block.I[14] = BoxMin[2]; Block.I[15] = W0;
  Block.I[16] = BoxMax[0]; Block.I[17] = BoxMax[1]; Block.I[18] = BoxMax[2]; Block.I[19] = W1;
}
