//==========================================================================================================================================
// FILE: VoxelSdfClipmap.js
// PURPOSE: 1:1 port of Engine/DistanceFieldSpace/VoxelSdfClipmap.cpp + ToroidalDistanceClipmap.h (SDF cone GI surface cache).
//            * DistanceClipmap: 3 tiers x 48^3 texels, spacing 0.125 * 2^tier, unsigned distance truncated at 1.0 m, relocated
//              once around the Clip0 focus (TieredWorldRenderSequence builds it with Force = true),
//            * VoxelClipmapCascade x2 (Clip0 / Clip1): signed distance with 6-direction majority vote, surface band 1.95 * spacing,
//              voxel records (albedo, emissive, facet normal, metalness, roughness),
//            * BakeStaticSurfaceCacheLighting: direct injection (emissive / point / sun / area / sky-fill mask, SDF penumbra
//              shadows), RadiosityBounces passes of 6 Vogel cones, Mip1 (/(A*0.62 + 8*0.38)) and Mip2 (/(A*0.65 + 8*0.35)).
//          NO free outer variables: serialised into the GI bake Web Worker.
//==========================================================================================================================================

export function CreateVoxelSdfClipmap() {
  const RES = 48;
  const LEVELS = 3;
  const TRUNC = 1.0;

  function Clamp(V, Lo, Hi) {
    return V < Lo ? Lo : V > Hi ? Hi : V;
  }
  function SmoothStep(E0, E1, X) {
    const T = Clamp((X - E0) / Math.max(1e-6, E1 - E0), 0, 1);
    return T * T * (3 - 2 * T);
  }
  function Duff(Nx, Ny, Nz, T, B) {
    const S = Nz >= 0 ? 1 : -1;
    const A = -1 / (S + Nz);
    const D = Nx * Ny * A;
    T[0] = 1 + S * Nx * Nx * A; T[1] = S * D; T[2] = -S * Nx;
    B[0] = D; B[1] = S + Ny * Ny * A; B[2] = -Ny;
  }

  //------------------------------------------------------------------------------------------------------------------------------------
  // DistanceClipmap (toroidal) — Relocate(Force) + Sample
  //------------------------------------------------------------------------------------------------------------------------------------
  function BuildTiers(Query, Focus) {
    const Tiers = [];
    for (let T = 0; T < LEVELS; ++T) {
      const Sp = 0.125 * (1 << T);
      const Origin = [
        Math.floor(Focus[0] / Sp) - RES / 2,
        Math.floor(Focus[1] / Sp) - RES / 2,
        Math.floor(Focus[2] / Sp) - RES / 2,
      ];
      const Raw = new Float32Array(RES * RES * RES);
      for (let Z = 0; Z < RES; ++Z) {
        for (let Y = 0; Y < RES; ++Y) {
          for (let X = 0; X < RES; ++X) {
            const Px = (Origin[0] + X) * Sp, Py = (Origin[1] + Y) * Sp, Pz = (Origin[2] + Z) * Sp;
            const N = Query.ClosestSurface(Px, Py, Pz, TRUNC);
            Raw[(Z * RES + Y) * RES + X] = N.valid ? Math.min(TRUNC, N.dist) : TRUNC;
          }
        }
      }
      Tiers.push({ Spacing: Sp, Origin, Raw });
    }
    return Tiers;
  }

  const TierPick = { Tier: -1 };
  function SampleTiers(Tiers, Px, Py, Pz) {
    for (let T = 0; T < Tiers.length; ++T) {
      const G = Tiers[T];
      const Qx = Px / G.Spacing, Qy = Py / G.Spacing, Qz = Pz / G.Spacing;
      const X = Math.floor(Qx) - G.Origin[0], Y = Math.floor(Qy) - G.Origin[1], Z = Math.floor(Qz) - G.Origin[2];
      if (X < 0 || Y < 0 || Z < 0 || X + 1 >= RES || Y + 1 >= RES || Z + 1 >= RES) continue;
      TierPick.Tier = T;
      const Fx = Qx - Math.floor(Qx), Fy = Qy - Math.floor(Qy), Fz = Qz - Math.floor(Qz);
      const R = G.Raw;
      const I = (Z * RES + Y) * RES + X;
      const C00 = R[I] * (1 - Fx) + R[I + 1] * Fx;
      const C10 = R[I + RES] * (1 - Fx) + R[I + RES + 1] * Fx;
      const C01 = R[I + RES * RES] * (1 - Fx) + R[I + RES * RES + 1] * Fx;
      const C11 = R[I + RES * RES + RES] * (1 - Fx) + R[I + RES * RES + RES + 1] * Fx;
      return (C00 * (1 - Fy) + C10 * Fy) * (1 - Fz) + (C01 * (1 - Fy) + C11 * Fy) * Fz;
    }
    TierPick.Tier = -1;
    return 0;
  }

  //------------------------------------------------------------------------------------------------------------------------------------
  // VoxelClipmapCascade
  //------------------------------------------------------------------------------------------------------------------------------------
  function MakeCascade(BMin, BMax, Dx, Dy, Dz) {
    const DimX = Math.max(4, Dx), DimY = Math.max(4, Dy), DimZ = Math.max(4, Dz);
    const Span = [BMax[0] - BMin[0], BMax[1] - BMin[1], BMax[2] - BMin[2]];
    const N = DimX * DimY * DimZ;
    return {
      BoundsMin: BMin.slice(), BoundsMax: BMax.slice(), Span,
      InvSpan: [1 / Math.max(1e-5, Span[0]), 1 / Math.max(1e-5, Span[1]), 1 / Math.max(1e-5, Span[2])],
      DimX, DimY, DimZ,
      VoxelSpacing: Math.max(Span[0] / (DimX - 1), Span[1] / (DimY - 1), Span[2] / (DimZ - 1)),
      Dist: new Float32Array(N),
      Surface: new Uint8Array(N),
      Albedo: new Float32Array(N * 3),
      Emissive: new Float32Array(N * 3),
      Normal: new Float32Array(N * 3),
      Metal: new Float32Array(N),
      Rough: new Float32Array(N),
      Direct: new Float32Array(N * 3),
      Bounce: new Float32Array(N * 3),
      Mip1: null, Mip1Dims: [0, 0, 0],
      Mip2: null, Mip2Dims: [0, 0, 0],
    };
  }

  const VoteDirs = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0.57735, 0.57735, 0.57735],
  ];

  function BakeCascadeGeometry(Query, C) {
    const Cutoff = Math.max(1.4, C.VoxelSpacing * 8);
    const Band = C.VoxelSpacing * 1.95;
    const SXY = C.DimX * C.DimY;
    for (let Z = 0; Z < C.DimZ; ++Z) {
      const Pz = C.BoundsMin[2] + (Z / (C.DimZ - 1)) * C.Span[2];
      for (let Y = 0; Y < C.DimY; ++Y) {
        const Py = C.BoundsMin[1] + (Y / (C.DimY - 1)) * C.Span[1];
        for (let X = 0; X < C.DimX; ++X) {
          const Px = C.BoundsMin[0] + (X / (C.DimX - 1)) * C.Span[0];
          const I = Z * SXY + Y * C.DimX + X;
          const N = Query.ClosestSurface(Px, Py, Pz, Cutoff);
          let D = Cutoff;
          if (N.valid) {
            const U = N.dist;
            if (U < 1e-5) D = 0;
            else {
              D = U;
              if (U < Cutoff * 0.85) {
                let Back = 0;
                for (const Dir of VoteDirs) {
                  const H = Query.TraceClosest(Px, Py, Pz, Dir[0], Dir[1], Dir[2], 32);
                  if (H && H.gnx * Dir[0] + H.gny * Dir[1] + H.gnz * Dir[2] > 0) ++Back;
                }
                if (Back >= 4) D = -U;
              }
            }
          }
          C.Dist[I] = D;
          // The ClosestSurface record may have been clobbered by TraceClosest only for Hit, not Near: still valid here.
          if (N.valid && Math.abs(D) <= Band) {
            const S = N.slab;
            C.Surface[I] = 1;
            C.Albedo[I * 3] = S.AlbR; C.Albedo[I * 3 + 1] = S.AlbG; C.Albedo[I * 3 + 2] = S.AlbB;
            C.Emissive[I * 3] = S.EmR; C.Emissive[I * 3 + 1] = S.EmG; C.Emissive[I * 3 + 2] = S.EmB;
            C.Normal[I * 3] = N.nx; C.Normal[I * 3 + 1] = N.ny; C.Normal[I * 3 + 2] = N.nz;
            C.Metal[I] = S.Metal;
            C.Rough[I] = S.Rough;
          }
        }
      }
    }
  }

  function Contains(C, Px, Py, Pz, Margin) {
    const Ux = (Px - C.BoundsMin[0]) * C.InvSpan[0];
    const Uy = (Py - C.BoundsMin[1]) * C.InvSpan[1];
    const Uz = (Pz - C.BoundsMin[2]) * C.InvSpan[2];
    const Hi = 1 - Margin;
    return Ux > Margin && Ux < Hi && Uy > Margin && Uy < Hi && Uz > Margin && Uz < Hi;
  }

  function Trilinear(Grid, Stride, Comp, GX, GY, GZ, C, Px, Py, Pz) {
    const Fx = Clamp((Px - C.BoundsMin[0]) * C.InvSpan[0] * (GX - 1), 0, GX - 1);
    const Fy = Clamp((Py - C.BoundsMin[1]) * C.InvSpan[1] * (GY - 1), 0, GY - 1);
    const Fz = Clamp((Pz - C.BoundsMin[2]) * C.InvSpan[2] * (GZ - 1), 0, GZ - 1);
    const X0 = Math.floor(Fx), Y0 = Math.floor(Fy), Z0 = Math.floor(Fz);
    const X1 = Math.min(GX - 1, X0 + 1), Y1 = Math.min(GY - 1, Y0 + 1), Z1 = Math.min(GZ - 1, Z0 + 1);
    const Tx = Fx - X0, Ty = Fy - Y0, Tz = Fz - Z0;
    const SXY = GX * GY;
    const A = (X, Y, Z) => Grid[(Z * SXY + Y * GX + X) * Stride + Comp];
    const C00 = A(X0, Y0, Z0) * (1 - Tx) + A(X1, Y0, Z0) * Tx;
    const C10 = A(X0, Y1, Z0) * (1 - Tx) + A(X1, Y1, Z0) * Tx;
    const C01 = A(X0, Y0, Z1) * (1 - Tx) + A(X1, Y0, Z1) * Tx;
    const C11 = A(X0, Y1, Z1) * (1 - Tx) + A(X1, Y1, Z1) * Tx;
    return (C00 * (1 - Ty) + C10 * Ty) * (1 - Tz) + (C01 * (1 - Ty) + C11 * Ty) * Tz;
  }

  function SampleCascadeDistance(C, Px, Py, Pz) {
    return Trilinear(C.Dist, 1, 0, C.DimX, C.DimY, C.DimZ, C, Px, Py, Pz);
  }

  // SampleRadiosityTrilinear(WorldPos, ConeRadiusM) with Mip0 / Mip1 / Mip2 blend
  function SampleCascadeRadiance(C, Px, Py, Pz, ConeR, Out) {
    const R0 = [0, 1, 2].map((K) => Trilinear(C.Bounce, 3, K, C.DimX, C.DimY, C.DimZ, C, Px, Py, Pz));
    const Vs = C.VoxelSpacing;
    if (ConeR <= Vs * 1.1 || C.Mip1Dims[0] < 2 || !C.Mip1) { Out[0] = R0[0]; Out[1] = R0[1]; Out[2] = R0[2]; return Out; }
    const D1 = C.Mip1Dims;
    const R1 = [0, 1, 2].map((K) => Trilinear(C.Mip1, 3, K, D1[0], D1[1], D1[2], C, Px, Py, Pz));
    const T1 = Vs * 2.2;
    if (ConeR <= T1 || C.Mip2Dims[0] < 2 || !C.Mip2) {
      const T = Clamp((ConeR - Vs * 1.1) / Math.max(0.03, Vs * 1.1), 0, 1);
      for (let K = 0; K < 3; ++K) Out[K] = R0[K] * (1 - T) + R1[K] * T;
      return Out;
    }
    const D2 = C.Mip2Dims;
    const T = Clamp((ConeR - T1) / Math.max(0.05, Vs * 2.6), 0, 1);
    for (let K = 0; K < 3; ++K) Out[K] = R1[K] * (1 - T) + Trilinear(C.Mip2, 3, K, D2[0], D2[1], D2[2], C, Px, Py, Pz) * T;
    return Out;
  }

  function RebuildMips(C) {
    const M1 = [Math.max(2, (C.DimX + 1) >> 1), Math.max(2, (C.DimY + 1) >> 1), Math.max(2, (C.DimZ + 1) >> 1)];
    const Mip1 = new Float32Array(M1[0] * M1[1] * M1[2] * 3);
    const SXY0 = C.DimX * C.DimY, SXY1 = M1[0] * M1[1];
    for (let Z = 0; Z < M1[2]; ++Z) for (let Y = 0; Y < M1[1]; ++Y) for (let X = 0; X < M1[0]; ++X) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let Dz = 0; Dz < 2; ++Dz) {
        const Sz = Math.min(C.DimZ - 1, Z * 2 + Dz);
        for (let Dy = 0; Dy < 2; ++Dy) {
          const Sy = Math.min(C.DimY - 1, Y * 2 + Dy);
          for (let Dx = 0; Dx < 2; ++Dx) {
            const Sx = Math.min(C.DimX - 1, X * 2 + Dx);
            const I = Sz * SXY0 + Sy * C.DimX + Sx;
            if (C.Surface[I]) { R += C.Bounce[I * 3]; G += C.Bounce[I * 3 + 1]; B += C.Bounce[I * 3 + 2]; A += 1; }
          }
        }
      }
      if (A > 0) {
        const S = 1 / Math.max(1, A * 0.62 + 8 * 0.38);
        const O = (Z * SXY1 + Y * M1[0] + X) * 3;
        Mip1[O] = R * S; Mip1[O + 1] = G * S; Mip1[O + 2] = B * S;
      }
    }
    const M2 = [Math.max(2, (M1[0] + 1) >> 1), Math.max(2, (M1[1] + 1) >> 1), Math.max(2, (M1[2] + 1) >> 1)];
    const Mip2 = new Float32Array(M2[0] * M2[1] * M2[2] * 3);
    const SXY2 = M2[0] * M2[1];
    for (let Z = 0; Z < M2[2]; ++Z) for (let Y = 0; Y < M2[1]; ++Y) for (let X = 0; X < M2[0]; ++X) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let Dz = 0; Dz < 2; ++Dz) {
        const Sz = Math.min(M1[2] - 1, Z * 2 + Dz);
        for (let Dy = 0; Dy < 2; ++Dy) {
          const Sy = Math.min(M1[1] - 1, Y * 2 + Dy);
          for (let Dx = 0; Dx < 2; ++Dx) {
            const Sx = Math.min(M1[0] - 1, X * 2 + Dx);
            const I = (Sz * SXY1 + Sy * M1[0] + Sx) * 3;
            if (Mip1[I] + Mip1[I + 1] + Mip1[I + 2] > 1e-4) { R += Mip1[I]; G += Mip1[I + 1]; B += Mip1[I + 2]; A += 1; }
          }
        }
      }
      if (A > 0) {
        const S = 1 / Math.max(1, A * 0.65 + 8 * 0.35);
        const O = (Z * SXY2 + Y * M2[0] + X) * 3;
        Mip2[O] = R * S; Mip2[O + 1] = G * S; Mip2[O + 2] = B * S;
      }
    }
    C.Mip1 = Mip1; C.Mip1Dims = M1;
    C.Mip2 = Mip2; C.Mip2Dims = M2;
  }

  //------------------------------------------------------------------------------------------------------------------------------------
  // TraceClipmapSdfPenumbra (Global toroidal path)
  //------------------------------------------------------------------------------------------------------------------------------------
  function Penumbra(Tiers, Px, Py, Pz, Nx, Ny, Nz, Lx, Ly, Lz, MaxDist, AngOrRadius, Directional) {
    const NdotL = Nx * Lx + Ny * Ly + Nz * Lz;
    if (NdotL <= 0.002) return 0;
    const Voxel = 0.125;
    const Ox = Px + Nx * 0.032, Oy = Py + Ny * 0.032, Oz = Pz + Nz * 0.032;
    const Ang = Directional ? Math.max(0.012, AngOrRadius) : Math.max(0.015, AngOrRadius / Math.max(0.25, MaxDist));
    let Travel = Math.max(0.045, Voxel * 0.45);
    let Vis = 1;
    for (let S = 0; S < 80 && Travel < MaxDist; ++S) {
      const D = SampleTiers(Tiers, Ox + Lx * Travel, Oy + Ly * Travel, Oz + Lz * Travel);
      if (TierPick.Tier < 0) break;
      const ConeR = Math.max(Voxel * 0.35, Travel * Ang);
      const Sv = SmoothStep(0.004, ConeR, D);
      if (Sv < Vis) Vis = Sv;
      if (Vis < 0.002) { Vis = 0; break; }
      Travel += Math.max(Voxel * 0.32, D * 0.85);
    }
    return Vis;
  }

  // EvaluateDirectVoxelSurfaceLighting
  function DirectVoxel(Tiers, C, I, Px, Py, Pz, Mask, Sun, AreaLights, Sky, Out) {
    let R = 0, G = 0, B = 0;
    if (Mask.Emissive) { R += C.Emissive[I * 3]; G += C.Emissive[I * 3 + 1]; B += C.Emissive[I * 3 + 2]; }
    let Nx = C.Normal[I * 3], Ny = C.Normal[I * 3 + 1], Nz = C.Normal[I * 3 + 2];
    const Nl = Math.hypot(Nx, Ny, Nz);
    if (Nl > 1e-6) { Nx /= Nl; Ny /= Nl; Nz /= Nl; } else { Nx = 0; Ny = 0; Nz = 1; }
    const M = Clamp(C.Metal[I], 0, 1);
    const DW = 1 - M;
    const Tr = C.Albedo[I * 3] * DW + C.Albedo[I * 3] * M * 0.25;
    const Tg = C.Albedo[I * 3 + 1] * DW + C.Albedo[I * 3 + 1] * M * 0.25;
    const Tb = C.Albedo[I * 3 + 2] * DW + C.Albedo[I * 3 + 2] * M * 0.25;
    if (Mask.SkyFill) {
      const Hem = 0.5 + 0.5 * Nz;
      const K = 0.14 + 0.16 * Hem;
      R += Tr * Sky[0] * K; G += Tg * Sky[1] * K; B += Tb * Sky[2] * K;
    }
    if (Mask.Sun) {
      const Sx = Sun.Dir[0], Sy = Sun.Dir[1], Sz = Sun.Dir[2];
      const NdotL = Math.max(0, Nx * Sx + Ny * Sy + Nz * Sz);
      if (NdotL > 0.01) {
        const Vis = Penumbra(Tiers, Px, Py, Pz, Nx, Ny, Nz, Sx, Sy, Sz, 18, Math.max(0.025, Math.tan(Sun.AngularRadius)), true);
        const Gain = NdotL * Vis * (1 / Math.PI);
        R += Tr * Sun.Irradiance[0] * Gain; G += Tg * Sun.Irradiance[1] * Gain; B += Tb * Sun.Irradiance[2] * Gain;
      }
    }
    for (const Q of AreaLights) {
      if (Q.Omni ? !Mask.Point : !Mask.Area) continue;
      if (Math.max(Q.R, Q.G, Q.B) <= 1e-4) continue;
      const Dx = Q.Cx - Px, Dy = Q.Cy - Py, Dz = Q.Cz - Pz;
      const D2 = Math.max(0.12, Dx * Dx + Dy * Dy + Dz * Dz);
      const D = Math.sqrt(D2);
      const Lx = Dx / D, Ly = Dy / D, Lz = Dz / D;
      const NdotL = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
      if (NdotL <= 0.01) continue;
      const Lc = -(Q.Nx * Lx + Q.Ny * Ly + Q.Nz * Lz);
      const LCos = Q.TwoSided ? Math.abs(Lc) : Math.max(0, Lc);
      if (LCos <= 0.01) continue;
      const Vis = Penumbra(Tiers, Px, Py, Pz, Nx, Ny, Nz, Lx, Ly, Lz, Math.max(0.15, D - 0.12), 0.35 * (Q.Hw + Q.Hh), false);
      const Area = 4 * Q.Hw * Q.Hh;
      const Form = Math.min(1.8, (NdotL * LCos * Area) / (Math.PI * D2));
      const Gain = Form * Vis;
      R += Tr * Q.R * Gain; G += Tg * Q.G * Gain; B += Tb * Q.B * Gain;
    }
    Out[0] = Clamp(R, 0, 28); Out[1] = Clamp(G, 0, 28); Out[2] = Clamp(B, 0, 28);
    return Out;
  }

  function Bake(Query, Cfg, Sun, Sky, Mask, Progress) {
    const R0 = Cfg.Resolution0 | 0, R1 = Cfg.Resolution1 | 0;
    const H0 = Number(Cfg.HalfExtent0) || 0, H1 = Number(Cfg.HalfExtent1) || 0;
    if (!(R0 > 1) || !(H0 > 0)) return null;
    const Ctr = Cfg.Center;
    // TieredWorldRenderSequence clip boxes: H0 = (h0, h0, 0.55 h0), H1 = (h1, h1, 0.45 h1); Dims R x R x max(16|12, R*55|45/100)
    const E0 = [H0, H0, 0.55 * H0], E1 = [H1, H1, 0.45 * H1];
    const C0 = MakeCascade([Ctr[0] - E0[0], Ctr[1] - E0[1], Ctr[2] - E0[2]], [Ctr[0] + E0[0], Ctr[1] + E0[1], Ctr[2] + E0[2]],
      R0, R0, Math.max(16, Math.floor((R0 * 55) / 100)));
    const R1e = Math.max(2, R1 || R0);
    const C1 = MakeCascade([Ctr[0] - E1[0], Ctr[1] - E1[1], Ctr[2] - E1[2]], [Ctr[0] + E1[0], Ctr[1] + E1[1], Ctr[2] + E1[2]],
      R1e, R1e, Math.max(12, Math.floor((R1e * 45) / 100)));
    if (Progress) Progress("distance clipmap", 0.05);
    const Tiers = BuildTiers(Query, Ctr);
    if (Progress) Progress("cascade 0 geometry", 0.3);
    BakeCascadeGeometry(Query, C0);
    if (Progress) Progress("cascade 1 geometry", 0.5);
    BakeCascadeGeometry(Query, C1);

    // Direct injection
    if (Progress) Progress("direct injection", 0.65);
    const Tmp = [0, 0, 0];
    for (const C of [C0, C1]) {
      const SXY = C.DimX * C.DimY;
      for (let Z = 0; Z < C.DimZ; ++Z) {
        const Pz = C.BoundsMin[2] + (Z / (C.DimZ - 1)) * C.Span[2];
        for (let Y = 0; Y < C.DimY; ++Y) {
          const Py = C.BoundsMin[1] + (Y / (C.DimY - 1)) * C.Span[1];
          for (let X = 0; X < C.DimX; ++X) {
            const I = Z * SXY + Y * C.DimX + X;
            if (!C.Surface[I]) continue;
            const Px = C.BoundsMin[0] + (X / (C.DimX - 1)) * C.Span[0];
            DirectVoxel(Tiers, C, I, Px, Py, Pz, Mask, Sun, Query.AreaLights, Sky, Tmp);
            C.Direct[I * 3] = Tmp[0]; C.Direct[I * 3 + 1] = Tmp[1]; C.Direct[I * 3 + 2] = Tmp[2];
            C.Bounce[I * 3] = Tmp[0]; C.Bounce[I * 3 + 1] = Tmp[1]; C.Bounce[I * 3 + 2] = Tmp[2];
          }
        }
      }
      RebuildMips(C);
    }

    // Radiosity propagation (6 Vogel cones, 9 steps, PrevSame -> StaticClip1 fallback)
    const T = [0, 0, 0], Bv = [0, 0, 0], SRad = [0, 0, 0];
    const Passes = Math.max(0, Cfg.RadiosityBounces | 0);
    for (let Pass = 0; Pass < Passes; ++Pass) {
      if (Progress) Progress(`radiosity bounce ${Pass + 1}`, 0.7 + (0.28 * Pass) / Math.max(1, Passes));
      const Snap = (C) => ({ ...C, Bounce: C.Bounce.slice(), Mip1: C.Mip1 && C.Mip1.slice(), Mip2: C.Mip2 && C.Mip2.slice() });
      const P0 = Snap(C0), P1 = Snap(C1);
      const Prop = (C, Prev) => {
        const SXY = C.DimX * C.DimY;
        const Next = new Float32Array(C.Bounce.length);
        for (let Z = 0; Z < C.DimZ; ++Z) {
          const Pz = C.BoundsMin[2] + (Z / (C.DimZ - 1)) * C.Span[2];
          for (let Y = 0; Y < C.DimY; ++Y) {
            const Py = C.BoundsMin[1] + (Y / (C.DimY - 1)) * C.Span[1];
            for (let X = 0; X < C.DimX; ++X) {
              const I = Z * SXY + Y * C.DimX + X;
              if (!C.Surface[I]) continue;
              const Px = C.BoundsMin[0] + (X / (C.DimX - 1)) * C.Span[0];
              const DW = 1 - Clamp(C.Metal[I], 0, 1);
              if (DW < 0.02) {
                Next[I * 3] = C.Direct[I * 3]; Next[I * 3 + 1] = C.Direct[I * 3 + 1]; Next[I * 3 + 2] = C.Direct[I * 3 + 2];
                continue;
              }
              let Nx = C.Normal[I * 3], Ny = C.Normal[I * 3 + 1], Nz = C.Normal[I * 3 + 2];
              const Nl = Math.hypot(Nx, Ny, Nz);
              if (Nl > 1e-6) { Nx /= Nl; Ny /= Nl; Nz /= Nl; } else { Nx = 0; Ny = 0; Nz = 1; }
              Duff(Nx, Ny, Nz, T, Bv);
              let Ir = 0, Ig = 0, Ib = 0;
              for (let K = 0; K < 6; ++K) {
                const Rr = Math.sqrt((K + 0.5) / 6);
                const Ang = K * 2.39996323 + 0.35;
                const Zc = Math.sqrt(Math.max(0, 1 - Rr * Rr));
                let Cx = T[0] * Rr * Math.cos(Ang) + Bv[0] * Rr * Math.sin(Ang) + Nx * Zc;
                let Cy = T[1] * Rr * Math.cos(Ang) + Bv[1] * Rr * Math.sin(Ang) + Ny * Zc;
                let Cz = T[2] * Rr * Math.cos(Ang) + Bv[2] * Rr * Math.sin(Ang) + Nz * Zc;
                const Cl = Math.hypot(Cx, Cy, Cz);
                Cx /= Cl; Cy /= Cl; Cz /= Cl;
                let CT = C.VoxelSpacing * 1.75;
                let CA = 0;
                let Cr = 0, Cg = 0, Cb = 0;
                for (let St = 0; St < 9 && CA < 0.96 && CT < 12; ++St) {
                  const Sx = Px + Nx * C.VoxelSpacing + Cx * CT;
                  const Sy = Py + Ny * C.VoxelSpacing + Cy * CT;
                  const Sz = Pz + Nz * C.VoxelSpacing + Cz * CT;
                  let Used = 2, SD = 1e5, Vox = 0.15;
                  if (Contains(Prev, Sx, Sy, Sz, 0.015)) {
                    SD = SampleCascadeDistance(Prev, Sx, Sy, Sz);
                    Vox = Prev.VoxelSpacing;
                    SampleCascadeRadiance(Prev, Sx, Sy, Sz, Math.max(Vox * 0.85, CT * 0.22), SRad);
                    Used = 0;
                  } else if (Contains(P1, Sx, Sy, Sz, 0.015)) {
                    SD = SampleCascadeDistance(P1, Sx, Sy, Sz);
                    Vox = P1.VoxelSpacing;
                    SampleCascadeRadiance(P1, Sx, Sy, Sz, Math.max(Vox * 0.85, CT * 0.22), SRad);
                    Used = 1;
                  }
                  if (Used === 2) break;
                  const ConeR = Math.max(Vox * 0.8, CT * 0.2);
                  if (SD < ConeR) {
                    const Occ = 1 - SmoothStep(-Vox * 0.2, ConeR, SD);
                    const W = (1 - CA) * Occ;
                    Cr += SRad[0] * W; Cg += SRad[1] * W; Cb += SRad[2] * W;
                    CA += W;
                  }
                  CT += Math.max(SD * 0.88, Vox * 0.92);
                }
                Ir += Cr / 6; Ig += Cg / 6; Ib += Cb / 6;
              }
              Next[I * 3] = Math.min(32, C.Direct[I * 3] + C.Albedo[I * 3] * DW * Ir * 0.88);
              Next[I * 3 + 1] = Math.min(32, C.Direct[I * 3 + 1] + C.Albedo[I * 3 + 1] * DW * Ig * 0.88);
              Next[I * 3 + 2] = Math.min(32, C.Direct[I * 3 + 2] + C.Albedo[I * 3 + 2] * DW * Ib * 0.88);
            }
          }
        }
        C.Bounce = Next;
        RebuildMips(C);
      };
      Prop(C0, P0);
      Prop(C1, P1);
    }
    if (Progress) Progress("done", 1);
    return { Tiers, Cascades: [C0, C1] };
  }

  return { Bake, SampleTiers, SampleCascadeRadiance, Penumbra, RES, LEVELS, TierPick };
}
