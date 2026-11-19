//==========================================================================================================================================
// FILE: RadianceFieldLayout.js
// PURPOSE: Single packed vec4 layout shared by the CPU band kernel, the WebGPU storage buffer (binding 12) and the WebGL RGBA32F
//          texture (uRadianceField) for the two C++-parity GI engines:
//            * DynamicProbeCache (DDGI):  cells, 8x8 IrradianceOverPi sheets, 16x16 Chebyshev depth moment sheets,
//            * VoxelSdfClipmap (SDF GI):  3-tier toroidal distance clipmap + 2 cascades x (Mip0, Mip1, Mip2) radiosity.
//          CreateRadianceFieldSampler() is hermetic (serialised into the CPU band workers) and is the reference for the WGSL/GLSL
//          ports of SampleIrradianceOverPi and EvaluateDeterministicConeGiOverPi.
//
//  HEADER (24 vec4 = 96 floats)
//    [1] probe on   [2] clipmap on   [3] total vec4
//    [4..6] probe grid min          [7] min spacing
//    [8..10] probe spacing          [11] max depth clamp
//    [12..14] probe counts          [15] cell base (vec4)
//    [16] irradiance base (vec4)    [17] moment base (vec4)
//    [20] distance base (vec4)      [21] tier resolution (48)   [22] tier spacing0 (0.125)   [23] tier count (3)
//    [24 + 4t .. +2] tier origin (texel coords)
//    [36 + 24c ..] cascade c: +0..2 bounds min, +3 voxel spacing, +4..6 inv span, +8..10 dims, +11 mip0 base,
//                             +12..14 mip1 dims, +15 mip1 base, +16..18 mip2 dims, +19 mip2 base
//    [84 + 3c + m] z layer of cascade c / mip m in the GPU radiance volume   [90..92] radiance volume W, H, D
//  GPU VOLUMES (BuildRadianceVolumes): hardware-trilinear 3D textures for the shaders
//    distance : r16f 48 x 48 x (48 * tiers), tier t at z layer 48t
//    radiance : rgba16f W x H x D, the 6 cascade/mip grids stacked along z (x / y edge-replicated into the padding)
//  DATA
//    cell i            : (x, y, z, backfaceRatio)
//    irradiance        : IrrOffset + i*64 + texel           -> rgb
//    moments           : MomOffset + i*128 + (texel >> 1)   -> (mean, mean2) in xy (even texel) / zw (odd texel)
//    distance (floats) : DistOffset*4 + t*48^3 + (z*48 + y)*48 + x
//    radiance          : MipOffset + (z*dy + y)*dx + x      -> rgb
//==========================================================================================================================================

export const RADIANCE_FIELD_HEADER_VEC4 = 24;
export const RADIANCE_FIELD_TEXTURE_WIDTH = 2048;

export function PackRadianceField(Probe, Clip) {
  // Hermetic (serialised into the bake worker): keep in sync with RADIANCE_FIELD_HEADER_VEC4 / RADIANCE_FIELD_TEXTURE_WIDTH.
  const HeaderVec4 = 24;
  const TexW = 2048;
  let Cursor = HeaderVec4;
  const Plan = {};
  if (Probe) {
    const Cells = Probe.Cells.length / 4;
    Plan.CellOffset = Cursor; Cursor += Cells;
    Plan.IrrOffset = Cursor; Cursor += Cells * 64;
    Plan.MomOffset = Cursor; Cursor += Cells * 128;
  }
  if (Clip) {
    const TierFloats = Clip.Tiers.length * 48 * 48 * 48;
    Plan.DistOffset = Cursor; Cursor += Math.ceil(TierFloats / 4);
    Plan.Mips = Clip.Cascades.map((C) => {
      const M0 = Cursor; Cursor += C.DimX * C.DimY * C.DimZ;
      const M1 = Cursor; Cursor += C.Mip1Dims[0] * C.Mip1Dims[1] * C.Mip1Dims[2];
      const M2 = Cursor; Cursor += C.Mip2Dims[0] * C.Mip2Dims[1] * C.Mip2Dims[2];
      return [M0, M1, M2];
    });
  }
  const Total = Math.max(Cursor, HeaderVec4 + 1);
  const Rows = Math.ceil(Total / TexW);
  const F = new Float32Array(Rows * TexW * 4);
  F[0] = 1;
  F[3] = Total;
  if (Probe) {
    const C = Probe.Cfg;
    F[1] = 1;
    F[4] = C.Min[0]; F[5] = C.Min[1]; F[6] = C.Min[2];
    F[7] = Math.min(C.Spacing[0], C.Spacing[1], C.Spacing[2]);
    F[8] = C.Spacing[0]; F[9] = C.Spacing[1]; F[10] = C.Spacing[2];
    F[11] = Probe.MaxDepthClamp;
    F[12] = C.CountX; F[13] = C.CountY; F[14] = C.CountZ; F[15] = Plan.CellOffset;
    F[16] = Plan.IrrOffset; F[17] = Plan.MomOffset;
    const Cells = Probe.Cells.length / 4;
    F.set(Probe.Cells, Plan.CellOffset * 4);
    for (let I = 0; I < Cells; ++I) {
      for (let T = 0; T < 64; ++T) {
        const Src = (I * 64 + T) * 3, Dst = (Plan.IrrOffset + I * 64 + T) * 4;
        F[Dst] = Probe.Irr[Src]; F[Dst + 1] = Probe.Irr[Src + 1]; F[Dst + 2] = Probe.Irr[Src + 2]; F[Dst + 3] = 1;
      }
    }
    F.set(Probe.Mom, Plan.MomOffset * 4);
  }
  if (Clip) {
    F[2] = 1;
    F[20] = Plan.DistOffset; F[21] = 48; F[22] = 0.125; F[23] = Clip.Tiers.length;
    Clip.Tiers.forEach((T, Ti) => {
      F[24 + Ti * 4] = T.Origin[0]; F[25 + Ti * 4] = T.Origin[1]; F[26 + Ti * 4] = T.Origin[2];
      F.set(T.Raw, Plan.DistOffset * 4 + Ti * 48 * 48 * 48);
    });
    Clip.Cascades.forEach((C, Ci) => {
      const H = 36 + Ci * 24;
      F[H] = C.BoundsMin[0]; F[H + 1] = C.BoundsMin[1]; F[H + 2] = C.BoundsMin[2]; F[H + 3] = C.VoxelSpacing;
      F[H + 4] = C.InvSpan[0]; F[H + 5] = C.InvSpan[1]; F[H + 6] = C.InvSpan[2];
      F[H + 8] = C.DimX; F[H + 9] = C.DimY; F[H + 10] = C.DimZ; F[H + 11] = Plan.Mips[Ci][0];
      F[H + 12] = C.Mip1Dims[0]; F[H + 13] = C.Mip1Dims[1]; F[H + 14] = C.Mip1Dims[2]; F[H + 15] = Plan.Mips[Ci][1];
      F[H + 16] = C.Mip2Dims[0]; F[H + 17] = C.Mip2Dims[1]; F[H + 18] = C.Mip2Dims[2]; F[H + 19] = Plan.Mips[Ci][2];
      const Put = (Src, Offset) => {
        const N = Src.length / 3;
        for (let I = 0; I < N; ++I) {
          const D = (Offset + I) * 4;
          F[D] = Src[I * 3]; F[D + 1] = Src[I * 3 + 1]; F[D + 2] = Src[I * 3 + 2]; F[D + 3] = 1;
        }
      };
      Put(C.Bounce, Plan.Mips[Ci][0]);
      Put(C.Mip1, Plan.Mips[Ci][1]);
      Put(C.Mip2, Plan.Mips[Ci][2]);
    });
    let Layer = 0, VolW = 1, VolH = 1;
    Clip.Cascades.forEach((C, Ci) => {
      const Dims = [[C.DimX, C.DimY, C.DimZ], C.Mip1Dims, C.Mip2Dims];
      Dims.forEach((D, M) => {
        F[84 + Ci * 3 + M] = Layer;
        Layer += Math.max(1, D[2]);
        VolW = Math.max(VolW, D[0]);
        VolH = Math.max(VolH, D[1]);
      });
    });
    F[90] = VolW; F[91] = VolH; F[92] = Math.max(1, Layer);
  }
  return F;
}

//==========================================================================================================================================
// GPU VOLUMES — half-float 3D textures so every clipmap / radiance lookup is ONE hardware-trilinear fetch on the GPU
//==========================================================================================================================================
const HalfScratchF = new Float32Array(1);
const HalfScratchU = new Uint32Array(HalfScratchF.buffer);
function FloatToHalfBits(V) {
  HalfScratchF[0] = V;
  const X = HalfScratchU[0];
  const Sign = (X >>> 16) & 0x8000;
  const Exp = (X >>> 23) & 0xff;
  let Mant = X & 0x7fffff;
  if (Exp === 0xff) return Sign | 0x7c00 | (Mant ? 0x200 : 0);
  const E = Exp - 127 + 15;
  if (E >= 0x1f) return Sign | 0x7bff; // clamp to the largest finite half
  if (E <= 0) {
    if (E < -10) return Sign;
    Mant = (Mant | 0x800000) >> (1 - E);
    return Sign | ((Mant + 0x1000) >> 13);
  }
  return Sign | (E << 10) | ((Mant + 0x1000) >> 13);
}

export function BuildRadianceVolumes(F) {
  if (!F || F[2] < 0.5) return null;
  const Tiers = F[23] | 0;
  const DistFloat = F[20] * 4;
  const Dist = new Uint16Array(48 * 48 * 48 * Tiers);
  for (let I = 0; I < Dist.length; ++I) Dist[I] = FloatToHalfBits(F[DistFloat + I]);
  const W = F[90] | 0, H = F[91] | 0, D = F[92] | 0;
  const Rad = new Uint16Array(W * H * D * 4);
  for (let C = 0; C < 2; ++C) {
    const Hd = 36 + C * 24;
    for (let M = 0; M < 3; ++M) {
      const Gx = F[Hd + 8 + M * 4] | 0, Gy = F[Hd + 9 + M * 4] | 0, Gz = F[Hd + 10 + M * 4] | 0;
      const Src = F[Hd + 11 + M * 4];
      const Layer = F[84 + C * 3 + M] | 0;
      if (Gx < 1 || Gy < 1 || Gz < 1) continue;
      for (let Z = 0; Z < Gz; ++Z) {
        for (let Y = 0; Y < H; ++Y) {
          const Sy = Math.min(Y, Gy - 1);
          for (let X = 0; X < W; ++X) {
            const Sx = Math.min(X, Gx - 1);
            const S = (Src + (Z * Gy + Sy) * Gx + Sx) * 4;
            const O = (((Layer + Z) * H + Y) * W + X) * 4;
            Rad[O] = FloatToHalfBits(F[S]);
            Rad[O + 1] = FloatToHalfBits(F[S + 1]);
            Rad[O + 2] = FloatToHalfBits(F[S + 2]);
            Rad[O + 3] = 0x3c00;
          }
        }
      }
    }
  }
  return { Dist, DistDims: [48, 48, 48 * Tiers], Rad, RadDims: [W, H, D] };
}

//==========================================================================================================================================
// HERMETIC SAMPLER (CPU reference for the WGSL / GLSL ports)
//==========================================================================================================================================
export function CreateRadianceFieldSampler() {
  function Clamp(V, Lo, Hi) {
    return V < Lo ? Lo : V > Hi ? Hi : V;
  }
  function SmoothStep(E0, E1, X) {
    const T = Clamp((X - E0) / Math.max(1e-6, E1 - E0), 0, 1);
    return T * T * (3 - 2 * T);
  }
  const Uv = [0, 0];
  function OctUv(Dx, Dy, Dz) {
    const Inv = 1 / Math.max(1e-6, Math.abs(Dx) + Math.abs(Dy) + Math.abs(Dz));
    let Ox = Dx * Inv, Oy = Dy * Inv;
    if (Dz < 0) {
      const Wx = (1 - Math.abs(Oy)) * (Ox >= 0 ? 1 : -1);
      const Wy = (1 - Math.abs(Ox)) * (Oy >= 0 ? 1 : -1);
      Ox = Wx; Oy = Wy;
    }
    Uv[0] = Ox * 0.5 + 0.5; Uv[1] = Oy * 0.5 + 0.5;
  }

  //---------------------------------------------------------------------------------------- DynamicProbeCache::SampleIrradianceOverPi
  function ProbeIrradiance(F, Px, Py, Pz, Nx, Ny, Nz, Vx, Vy, Vz, Out) {
    Out[0] = 0; Out[1] = 0; Out[2] = 0;
    if (!F || F[1] < 0.5) return Out;
    const CX = F[12], CY = F[13], CZ = F[14];
    const Sx = F[8], Sy = F[9], Sz = F[10];
    const CellOffset = F[15], IrrOffset = F[16], MomOffset = F[17];
    const Bias = Math.min(0.09, 0.14 * F[7]);
    const Bx = Px + (Nx * 0.72 + Vx * 0.28) * Bias;
    const By = Py + (Ny * 0.72 + Vy * 0.28) * Bias;
    const Bz = Pz + (Nz * 0.72 + Vz * 0.28) * Bias;
    const Fx = Clamp((Bx - F[4]) / Sx, 0, CX - 1), Fy = Clamp((By - F[5]) / Sy, 0, CY - 1), Fz = Clamp((Bz - F[6]) / Sz, 0, CZ - 1);
    const X0 = Math.floor(Fx), Y0 = Math.floor(Fy), Z0 = Math.floor(Fz);
    const X1 = Math.min(CX - 1, X0 + 1), Y1 = Math.min(CY - 1, Y0 + 1), Z1 = Math.min(CZ - 1, Z0 + 1);
    const Tx = Fx - X0, Ty = Fy - Y0, Tz = Fz - Z0;
    // Normal octahedral texel weights are shared across all 8 cells.
    OctUv(Nx, Ny, Nz);
    const Ix = Clamp(Uv[0] * 8 - 0.5, 0, 7), Iy = Clamp(Uv[1] * 8 - 0.5, 0, 7);
    const Ix0 = Math.floor(Ix), Iy0 = Math.floor(Iy), Ix1 = Math.min(7, Ix0 + 1), Iy1 = Math.min(7, Iy0 + 1);
    const Itx = Ix - Ix0, Ity = Iy - Iy0;
    let Ar = 0, Ag = 0, Ab = 0, Wt = 0;
    for (let Dz = 0; Dz < 2; ++Dz) {
      const Cz = Dz ? Z1 : Z0, Wz = Dz ? Tz : 1 - Tz;
      for (let Dy = 0; Dy < 2; ++Dy) {
        const Cy = Dy ? Y1 : Y0, Wy = Dy ? Ty : 1 - Ty;
        for (let Dx = 0; Dx < 2; ++Dx) {
          const Cx = Dx ? X1 : X0, Wx = Dx ? Tx : 1 - Tx;
          const Ci = (Cz * CY + Cy) * CX + Cx;
          const Cb = (CellOffset + Ci) * 4;
          const Ox = Bx - F[Cb], Oy = By - F[Cb + 1], Oz = Bz - F[Cb + 2];
          const Dist = Math.hypot(Ox, Oy, Oz);
          let Ux, Uy, Uz;
          if (Dist > 1e-5) { Ux = Ox / Dist; Uy = Oy / Dist; Uz = Oz / Dist; } else { Ux = -Nx; Uy = -Ny; Uz = -Nz; }
          const Wrap = 0.5 * (-(Ux * Nx + Uy * Ny + Uz * Nz) + 1);
          const SmoothBack = Math.max(0.02, Wrap * Wrap);
          const Gate = F[Cb + 3] > 0.25 ? 0.02 : 1;
          OctUv(Ux, Uy, Uz);
          const Mx = Clamp(Uv[0] * 16 - 0.5, 0, 15), My = Clamp(Uv[1] * 16 - 0.5, 0, 15);
          const Mx0 = Math.floor(Mx), My0 = Math.floor(My), Mx1 = Math.min(15, Mx0 + 1), My1 = Math.min(15, My0 + 1);
          const Mtx = Mx - Mx0, Mty = My - My0;
          const MomAt = (X, Y, K) => {
            const T = Y * 16 + X;
            return F[(MomOffset + Ci * 128 + (T >> 1)) * 4 + (T & 1) * 2 + K];
          };
          const Mean = (MomAt(Mx0, My0, 0) * (1 - Mtx) + MomAt(Mx1, My0, 0) * Mtx) * (1 - Mty) + (MomAt(Mx0, My1, 0) * (1 - Mtx) + MomAt(Mx1, My1, 0) * Mtx) * Mty;
          const Mean2 = (MomAt(Mx0, My0, 1) * (1 - Mtx) + MomAt(Mx1, My0, 1) * Mtx) * (1 - Mty) + (MomAt(Mx0, My1, 1) * (1 - Mtx) + MomAt(Mx1, My1, 1) * Mtx) * Mty;
          const Var = Math.max(1e-4, Math.abs(Mean2 - Mean * Mean));
          let Cheb = 1;
          if (Dist > Mean) {
            const Ex = Dist - Mean;
            Cheb = Var / (Var + Ex * Ex);
            Cheb = Cheb * Cheb * Cheb;
          }
          const W = Wx * Wy * Wz * SmoothBack * Gate * Math.max(1e-4, Cheb);
          const Ib = IrrOffset + Ci * 64;
          const A00 = (Ib + Iy0 * 8 + Ix0) * 4, A10 = (Ib + Iy0 * 8 + Ix1) * 4, A01 = (Ib + Iy1 * 8 + Ix0) * 4, A11 = (Ib + Iy1 * 8 + Ix1) * 4;
          const W00 = (1 - Itx) * (1 - Ity), W10 = Itx * (1 - Ity), W01 = (1 - Itx) * Ity, W11 = Itx * Ity;
          Ar += (F[A00] * W00 + F[A10] * W10 + F[A01] * W01 + F[A11] * W11) * W;
          Ag += (F[A00 + 1] * W00 + F[A10 + 1] * W10 + F[A01 + 1] * W01 + F[A11 + 1] * W11) * W;
          Ab += (F[A00 + 2] * W00 + F[A10 + 2] * W10 + F[A01 + 2] * W01 + F[A11 + 2] * W11) * W;
          Wt += W;
        }
      }
    }
    if (Wt > 1e-6) { Out[0] = Ar / Wt; Out[1] = Ag / Wt; Out[2] = Ab / Wt; }
    return Out;
  }

  //---------------------------------------------------------------------------------------- toroidal distance clipmap Sample()
  const Pick = { Tier: 3 };
  function TierDistance(F, Px, Py, Pz) {
    const DistFloat = F[20] * 4;
    const Levels = F[23] | 0;
    let Sp = F[22];
    for (let T = 0; T < Levels; ++T, Sp *= 2) {
      const Qx = Px / Sp, Qy = Py / Sp, Qz = Pz / Sp;
      const Fx0 = Math.floor(Qx), Fy0 = Math.floor(Qy), Fz0 = Math.floor(Qz);
      const X = Fx0 - F[24 + T * 4], Y = Fy0 - F[25 + T * 4], Z = Fz0 - F[26 + T * 4];
      if (X < 0 || Y < 0 || Z < 0 || X + 1 >= 48 || Y + 1 >= 48 || Z + 1 >= 48) continue;
      Pick.Tier = T;
      const Fx = Qx - Fx0, Fy = Qy - Fy0, Fz = Qz - Fz0;
      const I = DistFloat + T * 110592 + (Z * 48 + Y) * 48 + X;
      const C00 = F[I] * (1 - Fx) + F[I + 1] * Fx;
      const C10 = F[I + 48] * (1 - Fx) + F[I + 49] * Fx;
      const C01 = F[I + 2304] * (1 - Fx) + F[I + 2305] * Fx;
      const C11 = F[I + 2352] * (1 - Fx) + F[I + 2353] * Fx;
      return (C00 * (1 - Fy) + C10 * Fy) * (1 - Fz) + (C01 * (1 - Fy) + C11 * Fy) * Fz;
    }
    Pick.Tier = 3;
    return 1e5;
  }

  // Trilinear RGB fetch from one radiance grid; accumulates Weight * rgb into Out.
  function GridRgbInto(F, GridOffset, GX, GY, GZ, H, Px, Py, Pz, Weight, Out) {
    const Fx = Clamp((Px - F[H]) * F[H + 4] * (GX - 1), 0, GX - 1);
    const Fy = Clamp((Py - F[H + 1]) * F[H + 5] * (GY - 1), 0, GY - 1);
    const Fz = Clamp((Pz - F[H + 2]) * F[H + 6] * (GZ - 1), 0, GZ - 1);
    const X0 = Math.floor(Fx), Y0 = Math.floor(Fy), Z0 = Math.floor(Fz);
    const Dx = X0 + 1 < GX ? 4 : 0, Dy = Y0 + 1 < GY ? GX * 4 : 0, Dz = Z0 + 1 < GZ ? GX * GY * 4 : 0;
    const Tx = Fx - X0, Ty = Fy - Y0, Tz = Fz - Z0;
    const I = (GridOffset + (Z0 * GY + Y0) * GX + X0) * 4;
    const W000 = (1 - Tx) * (1 - Ty) * (1 - Tz) * Weight, W100 = Tx * (1 - Ty) * (1 - Tz) * Weight;
    const W010 = (1 - Tx) * Ty * (1 - Tz) * Weight, W110 = Tx * Ty * (1 - Tz) * Weight;
    const W001 = (1 - Tx) * (1 - Ty) * Tz * Weight, W101 = Tx * (1 - Ty) * Tz * Weight;
    const W011 = (1 - Tx) * Ty * Tz * Weight, W111 = Tx * Ty * Tz * Weight;
    for (let K = 0; K < 3; ++K) {
      const J = I + K;
      Out[K] += F[J] * W000 + F[J + Dx] * W100 + F[J + Dy] * W010 + F[J + Dx + Dy] * W110
        + F[J + Dz] * W001 + F[J + Dx + Dz] * W101 + F[J + Dy + Dz] * W011 + F[J + Dx + Dy + Dz] * W111;
    }
  }

  // VoxelClipmapCascade::SampleRadiosityTrilinear (Mip0 -> Mip1 -> Mip2)
  function CascadeRadiance(F, Casc, Px, Py, Pz, ConeR, Out) {
    Out[0] = 0; Out[1] = 0; Out[2] = 0;
    if (Casc > 1) return Out;
    const H = 36 + Casc * 24;
    const Vs = F[H + 3];
    if (ConeR <= Vs * 1.1 || F[H + 12] < 2) {
      GridRgbInto(F, F[H + 11], F[H + 8], F[H + 9], F[H + 10], H, Px, Py, Pz, 1, Out);
      return Out;
    }
    const T1 = Vs * 2.2;
    if (ConeR <= T1 || F[H + 16] < 2) {
      const T = Clamp((ConeR - Vs * 1.1) / Math.max(0.03, Vs * 1.1), 0, 1);
      if (T < 1) GridRgbInto(F, F[H + 11], F[H + 8], F[H + 9], F[H + 10], H, Px, Py, Pz, 1 - T, Out);
      if (T > 0) GridRgbInto(F, F[H + 15], F[H + 12], F[H + 13], F[H + 14], H, Px, Py, Pz, T, Out);
      return Out;
    }
    const T = Clamp((ConeR - T1) / Math.max(0.05, Vs * 2.6), 0, 1);
    if (T < 1) GridRgbInto(F, F[H + 15], F[H + 12], F[H + 13], F[H + 14], H, Px, Py, Pz, 1 - T, Out);
    if (T > 0) GridRgbInto(F, F[H + 19], F[H + 16], F[H + 17], F[H + 18], H, Px, Py, Pz, T, Out);
    return Out;
  }

  const SRad = [0, 0, 0];
  //---------------------------------------------------------------------------------------- EvaluateDeterministicConeGiOverPi
  function ConeGi(F, Px, Py, Pz, Nx, Ny, Nz, SkyR, SkyG, SkyB, ConeCount, Out) {
    Out[0] = 0; Out[1] = 0; Out[2] = 0;
    if (!F || F[2] < 0.5) return Out;
    const Count = Clamp(ConeCount | 0, 12, 24);
    const Inv = 1 / Count;
    let Nl = Math.hypot(Nx, Ny, Nz);
    if (Nl < 1e-6) { Nx = 0; Ny = 0; Nz = 1; Nl = 1; }
    Nx /= Nl; Ny /= Nl; Nz /= Nl;
    const S = Nz >= 0 ? 1 : -1;
    const A = -1 / (S + Nz);
    const D = Nx * Ny * A;
    const Tx = 1 + S * Nx * Nx * A, Ty = S * D, Tz = -S * Nx;
    const Bx = D, By = S + Ny * Ny * A, Bz = -Ny;
    const Vs0 = F[36 + 3], Vs1 = F[60 + 3];
    const Bias = Math.max(0.032, Vs0 * 0.75);
    const Ox = Px + Nx * Bias, Oy = Py + Ny * Bias, Oz = Pz + Nz * Bias;
    let Gr = 0, Gg = 0, Gb = 0;
    for (let K = 0; K < Count; ++K) {
      const R = Math.sqrt(Clamp((K + 0.5) * Inv, 0.015, 0.96));
      const Ang = K * 2.39996323 + 0.31;
      const Ca = Math.cos(Ang) * R, Sa = Math.sin(Ang) * R, Zc = Math.sqrt(Math.max(0, 1 - R * R));
      let Cx = Tx * Ca + Bx * Sa + Nx * Zc, Cy = Ty * Ca + By * Sa + Ny * Zc, Cz = Tz * Ca + Bz * Sa + Nz * Zc;
      const Cl = Math.hypot(Cx, Cy, Cz);
      Cx /= Cl; Cy /= Cl; Cz /= Cl;
      let CT = Math.max(0.14, Vs0 * 1.15);
      let CA = 0, Cr = 0, Cg = 0, Cb = 0;
      for (let St = 0; St < 24 && CA < 0.97 && CT < 14; ++St) {
        const Sx = Ox + Cx * CT, Sy = Oy + Cy * CT, Sz = Oz + Cz * CT;
        const CD = TierDistance(F, Sx, Sy, Sz);
        const Casc = Pick.Tier;
        if (Casc >= 3 || CD > 4e3) break;
        const Vox = Casc === 0 ? 0.125 : Casc === 1 ? 0.25 : 0.5;
        const ConeR = Math.max(Vox * 1.15, CT * 0.42);
        if (CD < ConeR) {
          let Occ = (1 - SmoothStep(0, ConeR, CD)) * 0.78;
          CascadeRadiance(F, Casc, Sx, Sy, Sz, ConeR * 1.45, SRad);
          // EvaluateClipmapNormal: tetrahedral gradient of the toroidal distance
          const H = Casc === 0 ? Math.max(0.02, Vs0 * 0.9) : Math.max(0.05, Vs1 * 0.9);
          const D0 = TierDistance(F, Sx + H, Sy - H, Sz - H);
          const D1 = TierDistance(F, Sx - H, Sy - H, Sz + H);
          const D2 = TierDistance(F, Sx - H, Sy + H, Sz - H);
          const D3 = TierDistance(F, Sx + H, Sy + H, Sz + H);
          let Gx = D0 - D1 - D2 + D3, Gy = -D0 - D1 + D2 + D3, Gz = -D0 + D1 - D2 + D3;
          const Gl = Math.hypot(Gx, Gy, Gz);
          if (Gl > 1e-6) { Gx /= Gl; Gy /= Gl; Gz /= Gl; } else { Gx = 0; Gy = 0; Gz = 1; }
          const Front = 0.45 + 0.7 * SmoothStep(-0.15, 0.55, -(Gx * Cx + Gy * Cy + Gz * Cz));
          if (CT < 0.85 && Math.max(SRad[0], SRad[1], SRad[2]) < 0.25) Occ = Math.min(1, Occ * 1.25);
          const W = (1 - CA) * Occ;
          Cr += Math.min(SRad[0], 2.5) * Front * W;
          Cg += Math.min(SRad[1], 2.5) * Front * W;
          Cb += Math.min(SRad[2], 2.5) * Front * W;
          CA += W;
        }
        CT += Math.max(CD * 0.75, Vox * 0.75);
      }
      const Hem = 0.45 + 0.85 * (0.5 + 0.5 * Cz);
      const Un = 1 - CA;
      Gr += (Cr + SkyR * Hem * Un) * Inv;
      Gg += (Cg + SkyG * Hem * Un) * Inv;
      Gb += (Cb + SkyB * Hem * Un) * Inv;
    }
    Out[0] = Math.min(Gr, 18); Out[1] = Math.min(Gg, 18); Out[2] = Math.min(Gb, 18);
    return Out;
  }

  return { ProbeIrradiance, ConeGi, TierDistance, CascadeRadiance, Pick };
}
