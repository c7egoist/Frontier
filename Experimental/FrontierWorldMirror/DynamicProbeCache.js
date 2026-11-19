//==========================================================================================================================================
// FILE: DynamicProbeCache.js
// PURPOSE: 1:1 port of Engine/GeometricRaster/GlobalIllumination/DynamicProbeCacheSequence.cpp (DDGI raytracing engine).
//            * lattice of CountX*CountY*CountZ cells (min 2 per axis) spanning GridMinimumWorld..GridMaximumWorld,
//            * FibonacciRayCount (32..256) spherical-Fibonacci rays per cell, 60 m reach, backface ratio bookkeeping,
//            * 16x16 octahedral Chebyshev depth moments (cos^16 lobe, depth clamped to 2.25 * |CellSpacing|),
//            * BouncePasses (1..4) of 8x8 octahedral IrradianceOverPi gathered from sky / BounceSlab sun / area lights /
//              previous-pass irradiance, temporal blend alpha = clamp(1 - TemporalBlend, 0.05, 1) on the final pass,
//            * SampleIrradianceOverPi: normal/view biased trilinear lookup with wrap-shading, backface gate and Chebyshev weight.
//          NO free outer variables: serialised into the GI bake Web Worker.
//==========================================================================================================================================

export function CreateDynamicProbeCache() {
  const TAU = Math.PI * 2;
  const IRR_W = 8;
  const MOM_W = 16;

  function Clamp(V, Lo, Hi) {
    return V < Lo ? Lo : V > Hi ? Hi : V;
  }

  function EncodeOct(Dx, Dy, Dz, Out) {
    const Inv = 1 / Math.max(1e-6, Math.abs(Dx) + Math.abs(Dy) + Math.abs(Dz));
    let Ox = Dx * Inv, Oy = Dy * Inv;
    if (Dz < 0) {
      const Wx = (1 - Math.abs(Oy)) * (Ox >= 0 ? 1 : -1);
      const Wy = (1 - Math.abs(Ox)) * (Oy >= 0 ? 1 : -1);
      Ox = Wx; Oy = Wy;
    }
    Out[0] = Ox * 0.5 + 0.5;
    Out[1] = Oy * 0.5 + 0.5;
    return Out;
  }

  function DecodeOct(U, V, Out) {
    const Ox = U * 2 - 1, Oy = V * 2 - 1;
    let X = Ox, Y = Oy;
    const Z = 1 - Math.abs(Ox) - Math.abs(Oy);
    if (Z < 0) {
      const Fx = (1 - Math.abs(Y)) * (X >= 0 ? 1 : -1);
      const Fy = (1 - Math.abs(X)) * (Y >= 0 ? 1 : -1);
      X = Fx; Y = Fy;
    }
    const L = Math.hypot(X, Y, Z);
    if (L < 1e-6) { Out[0] = 0; Out[1] = 0; Out[2] = 1; return Out; }
    Out[0] = X / L; Out[1] = Y / L; Out[2] = Z / L;
    return Out;
  }

  // SampleProbeOctahedralBilinear: Sheet holds `Stride` floats per texel, `Comps` used.
  function SampleSheet(Sheet, SheetOffset, GridW, Stride, Comps, Dx, Dy, Dz, Uv, Out) {
    EncodeOct(Dx, Dy, Dz, Uv);
    const Fx = Clamp(Uv[0] * GridW - 0.5, 0, GridW - 1);
    const Fy = Clamp(Uv[1] * GridW - 0.5, 0, GridW - 1);
    const X0 = Math.floor(Fx), Y0 = Math.floor(Fy);
    const X1 = Math.min(GridW - 1, X0 + 1), Y1 = Math.min(GridW - 1, Y0 + 1);
    const Tx = Fx - X0, Ty = Fy - Y0;
    const I00 = SheetOffset + (Y0 * GridW + X0) * Stride, I10 = SheetOffset + (Y0 * GridW + X1) * Stride;
    const I01 = SheetOffset + (Y1 * GridW + X0) * Stride, I11 = SheetOffset + (Y1 * GridW + X1) * Stride;
    for (let C = 0; C < Comps; ++C) {
      Out[C] = (Sheet[I00 + C] * (1 - Tx) + Sheet[I10 + C] * Tx) * (1 - Ty) + (Sheet[I01 + C] * (1 - Tx) + Sheet[I11 + C] * Tx) * Ty;
    }
    return Out;
  }

  function ResolveConfig(Cfg) {
    const CountX = Math.max(2, Cfg.CountX | 0), CountY = Math.max(2, Cfg.CountY | 0), CountZ = Math.max(2, Cfg.CountZ | 0);
    const Min = Cfg.GridMinimumWorld, Max = Cfg.GridMaximumWorld;
    const Spacing = [
      Math.max(0.05, (Max[0] - Min[0]) / (CountX - 1)),
      Math.max(0.05, (Max[1] - Min[1]) / (CountY - 1)),
      Math.max(0.05, (Max[2] - Min[2]) / (CountZ - 1)),
    ];
    return {
      CountX, CountY, CountZ,
      Min: [Min[0], Min[1], Min[2]],
      Spacing,
      RayCount: Clamp(Cfg.FibonacciRayCount | 0, 32, 256),
      BouncePasses: Clamp(Cfg.BouncePasses | 0, 1, 4),
      TemporalBlend: Clamp(Number(Cfg.TemporalBlend) || 0, 0, 0.95),
    };
  }

  // State = { Cfg, Cells(Float32 x,y,z,backfaceRatio), Irr(Float32 rgb * 64), Mom(Float32 mean,mean2 * 256), MaxDepthClamp }
  function SampleIrradianceOverPi(State, Px, Py, Pz, Nx, Ny, Nz, Vx, Vy, Vz, Out) {
    const C = State.Cfg;
    const Sp = C.Spacing;
    const BiasMag = Math.min(0.09, 0.14 * Math.min(Sp[0], Sp[1], Sp[2]));
    const Bx = Px + (Nx * 0.72 + Vx * 0.28) * BiasMag;
    const By = Py + (Ny * 0.72 + Vy * 0.28) * BiasMag;
    const Bz = Pz + (Nz * 0.72 + Vz * 0.28) * BiasMag;
    const Fx = Clamp((Bx - C.Min[0]) / Sp[0], 0, C.CountX - 1);
    const Fy = Clamp((By - C.Min[1]) / Sp[1], 0, C.CountY - 1);
    const Fz = Clamp((Bz - C.Min[2]) / Sp[2], 0, C.CountZ - 1);
    const X0 = Math.floor(Fx), Y0 = Math.floor(Fy), Z0 = Math.floor(Fz);
    const X1 = Math.min(C.CountX - 1, X0 + 1), Y1 = Math.min(C.CountY - 1, Y0 + 1), Z1 = Math.min(C.CountZ - 1, Z0 + 1);
    const Tx = Fx - X0, Ty = Fy - Y0, Tz = Fz - Z0;
    const Uv = State._Uv, Tmp = State._Tmp;
    let Ar = 0, Ag = 0, Ab = 0, Wt = 0;
    for (let Dz = 0; Dz < 2; ++Dz) {
      const Cz = Dz === 0 ? Z0 : Z1, Wz = Dz === 0 ? 1 - Tz : Tz;
      for (let Dy = 0; Dy < 2; ++Dy) {
        const Cy = Dy === 0 ? Y0 : Y1, Wy = Dy === 0 ? 1 - Ty : Ty;
        for (let Dx = 0; Dx < 2; ++Dx) {
          const Cx = Dx === 0 ? X0 : X1, Wx = Dx === 0 ? 1 - Tx : Tx;
          const Ci = (Cz * C.CountY + Cy) * C.CountX + Cx;
          const Sx = Bx - State.Cells[Ci * 4], Sy = By - State.Cells[Ci * 4 + 1], Sz = Bz - State.Cells[Ci * 4 + 2];
          const Dist = Math.hypot(Sx, Sy, Sz);
          let Ux, Uy, Uz;
          if (Dist > 1e-5) { Ux = Sx / Dist; Uy = Sy / Dist; Uz = Sz / Dist; } else { Ux = -Nx; Uy = -Ny; Uz = -Nz; }
          const Wrap = 0.5 * (-(Ux * Nx + Uy * Ny + Uz * Nz) + 1);
          const SmoothBack = Math.max(0.02, Wrap * Wrap);
          const Gate = State.Cells[Ci * 4 + 3] > 0.25 ? 0.02 : 1;
          SampleSheet(State.Mom, Ci * MOM_W * MOM_W * 2, MOM_W, 2, 2, Ux, Uy, Uz, Uv, Tmp);
          const Mean = Tmp[0];
          const Var = Math.max(1e-4, Math.abs(Tmp[1] - Mean * Mean));
          let Cheb = 1;
          if (Dist > Mean) {
            const Ex = Dist - Mean;
            Cheb = Var / (Var + Ex * Ex);
            Cheb = Cheb * Cheb * Cheb;
          }
          const W = Wx * Wy * Wz * SmoothBack * Gate * Math.max(1e-4, Cheb);
          SampleSheet(State.Irr, Ci * IRR_W * IRR_W * 3, IRR_W, 3, 3, Nx, Ny, Nz, Uv, Tmp);
          Ar += Tmp[0] * W; Ag += Tmp[1] * W; Ab += Tmp[2] * W;
          Wt += W;
        }
      }
    }
    if (Wt > 1e-6) { Out[0] = Ar / Wt; Out[1] = Ag / Wt; Out[2] = Ab / Wt; }
    else { Out[0] = 0; Out[1] = 0; Out[2] = 0; }
    return Out;
  }

  // C++ EvaluateAreaDirectContribution (DynamicProbeCacheSequence.cpp anonymous namespace)
  function AreaDirect(Query, Px, Py, Pz, Nx, Ny, Nz, Alb, Out, Mask) {
    let R = 0, G = 0, B = 0;
    for (const L of Query.AreaLights) {
      if (Mask && !Mask(L)) continue;
      const Dx = L.Cx - Px, Dy = L.Cy - Py, Dz = L.Cz - Pz;
      const D2 = Math.max(0.04, Dx * Dx + Dy * Dy + Dz * Dz);
      const D = Math.sqrt(D2);
      const Lx = Dx / D, Ly = Dy / D, Lz = Dz / D;
      const NdotL = Nx * Lx + Ny * Ly + Nz * Lz;
      if (NdotL <= 1e-4) continue;
      let LdotNeg = -(L.Nx * Lx + L.Ny * Ly + L.Nz * Lz);
      if (L.TwoSided) LdotNeg = Math.abs(LdotNeg);
      if (LdotNeg <= 1e-4) continue;
      if (Query.Occluded(Px + Nx * 2.5e-3, Py + Ny * 2.5e-3, Pz + Nz * 2.5e-3, Lx, Ly, Lz, Math.max(0.01, D - 0.04))) continue;
      const Area = 4 * L.Hw * L.Hh;
      const F = (NdotL * LdotNeg * Area) / (Math.PI * D2 + Area);
      R += L.R * Alb[0] * F; G += L.G * Alb[1] * F; B += L.B * Alb[2] * F;
    }
    Out[0] = R; Out[1] = G; Out[2] = B;
    return Out;
  }

  // UpdateProbeCache(Config, SceneTree, BounceSummaries, Sun, AreaLights, SkyRadiance)
  function Bake(Query, RawCfg, Sun, SkyRadiance, Previous) {
    const Cfg = ResolveConfig(RawCfg);
    const Total = Cfg.CountX * Cfg.CountY * Cfg.CountZ;
    const PreserveHistory = Cfg.TemporalBlend > 0.01 && Previous && Previous.Irr && Previous.Cells && Previous.Cells.length === Total * 4;
    const RayCount = Cfg.RayCount;
    const Sp = Cfg.Spacing;
    const MaxDepthClamp = Math.hypot(Sp[0], Sp[1], Sp[2]) * 2.25;
    const State = {
      Cfg,
      Cells: new Float32Array(Total * 4),
      Irr: new Float32Array(Total * IRR_W * IRR_W * 3),
      Mom: new Float32Array(Total * MOM_W * MOM_W * 2),
      MaxDepthClamp,
      _Uv: [0, 0],
      _Tmp: [0, 0, 0],
    };
    let SunX = Sun.Dir[0], SunY = Sun.Dir[1], SunZ = Sun.Dir[2];
    const SunL = Math.hypot(SunX, SunY, SunZ);
    if (SunL > 1e-6) { SunX /= SunL; SunY /= SunL; SunZ /= SunL; } else { SunX = 0.42; SunY = -0.55; SunZ = 0.72; }
    const SunIrr = Sun.Irradiance;

    // Per-ray records: dir(3) hitPos(3) hitNormal(3) dist, flags (1 = surface, 2 = backface), slab ref
    const RayDirs = new Float32Array(RayCount * 3);
    for (let R = 0; R < RayCount; ++R) {
      const Z = 1 - (2 * (R + 0.5)) / RayCount;
      const Rxy = Math.sqrt(Math.max(0, 1 - Z * Z));
      const Phi = TAU * ((R * 0.61803398875) % 1);
      RayDirs[R * 3] = Rxy * Math.cos(Phi);
      RayDirs[R * 3 + 1] = Rxy * Math.sin(Phi);
      RayDirs[R * 3 + 2] = Z;
    }
    const HitPos = new Float32Array(Total * RayCount * 3);
    const HitNrm = new Float32Array(Total * RayCount * 3);
    const HitDist = new Float32Array(Total * RayCount);
    const HitFlags = new Uint8Array(Total * RayCount);
    const HitSlab = new Array(Total * RayCount);
    const TexDir = [0, 0, 0];

    for (let Iz = 0; Iz < Cfg.CountZ; ++Iz) {
      for (let Iy = 0; Iy < Cfg.CountY; ++Iy) {
        for (let Ix = 0; Ix < Cfg.CountX; ++Ix) {
          const Ci = (Iz * Cfg.CountY + Iy) * Cfg.CountX + Ix;
          const Cx = Cfg.Min[0] + Ix * Sp[0], Cy = Cfg.Min[1] + Iy * Sp[1], Cz = Cfg.Min[2] + Iz * Sp[2];
          State.Cells[Ci * 4] = Cx; State.Cells[Ci * 4 + 1] = Cy; State.Cells[Ci * 4 + 2] = Cz;
          let Backfaces = 0;
          for (let R = 0; R < RayCount; ++R) {
            const Dx = RayDirs[R * 3], Dy = RayDirs[R * 3 + 1], Dz = RayDirs[R * 3 + 2];
            const Ri = Ci * RayCount + R;
            const H = Query.TraceClosest(Cx + Dx * 1e-3, Cy + Dy * 1e-3, Cz + Dz * 1e-3, Dx, Dy, Dz, 60);
            if (H) {
              const T = H.t + 1e-3;
              HitDist[Ri] = T;
              HitPos[Ri * 3] = Cx + Dx * T; HitPos[Ri * 3 + 1] = Cy + Dy * T; HitPos[Ri * 3 + 2] = Cz + Dz * T;
              const Side = H.gnx * Dx + H.gny * Dy + H.gnz * Dz;
              const Back = Side >= 0;
              if (Back) ++Backfaces;
              const Fl = Back ? -1 : 1;
              HitNrm[Ri * 3] = H.gnx * Fl; HitNrm[Ri * 3 + 1] = H.gny * Fl; HitNrm[Ri * 3 + 2] = H.gnz * Fl;
              HitFlags[Ri] = 1 | (Back ? 2 : 0);
              HitSlab[Ri] = H.slab;
            } else {
              HitDist[Ri] = MaxDepthClamp;
              HitFlags[Ri] = 0;
            }
          }
          State.Cells[Ci * 4 + 3] = Backfaces / RayCount;
          const MomOffset = Ci * MOM_W * MOM_W * 2;
          for (let Oy = 0; Oy < MOM_W; ++Oy) {
            for (let Ox = 0; Ox < MOM_W; ++Ox) {
              DecodeOct((Ox + 0.5) / MOM_W, (Oy + 0.5) / MOM_W, TexDir);
              let SR = 0, SR2 = 0, SW = 0;
              for (let R = 0; R < RayCount; ++R) {
                const Ca = TexDir[0] * RayDirs[R * 3] + TexDir[1] * RayDirs[R * 3 + 1] + TexDir[2] * RayDirs[R * 3 + 2];
                if (Ca > 0) {
                  const W = Math.pow(Ca, 16);
                  const D = Math.min(MaxDepthClamp, HitDist[Ci * RayCount + R]);
                  SR += D * W; SR2 += D * D * W; SW += W;
                }
              }
              const O = MomOffset + (Oy * MOM_W + Ox) * 2;
              if (SW > 1e-6) { State.Mom[O] = SR / SW; State.Mom[O + 1] = SR2 / SW; }
              else { State.Mom[O] = MaxDepthClamp; State.Mom[O + 1] = MaxDepthClamp * MaxDepthClamp; }
            }
          }
        }
      }
    }

    const RayRad = new Float32Array(RayCount * 3);
    const Tmp3 = [0, 0, 0], Alb = [0, 0, 0], Prev3 = [0, 0, 0];
    const NormDirs = new Float32Array(IRR_W * IRR_W * 3);
    for (let Oy = 0; Oy < IRR_W; ++Oy) {
      for (let Ox = 0; Ox < IRR_W; ++Ox) {
        DecodeOct((Ox + 0.5) / IRR_W, (Oy + 0.5) / IRR_W, TexDir);
        const O = (Oy * IRR_W + Ox) * 3;
        NormDirs[O] = TexDir[0]; NormDirs[O + 1] = TexDir[1]; NormDirs[O + 2] = TexDir[2];
      }
    }
    for (let Pass = 0; Pass < Cfg.BouncePasses; ++Pass) {
      const Next = new Float32Array(State.Irr.length);
      for (let Ci = 0; Ci < Total; ++Ci) {
        for (let R = 0; R < RayCount; ++R) {
          const Ri = Ci * RayCount + R;
          const Fl = HitFlags[Ri];
          if (!(Fl & 1)) {
            RayRad[R * 3] = SkyRadiance[0]; RayRad[R * 3 + 1] = SkyRadiance[1]; RayRad[R * 3 + 2] = SkyRadiance[2];
            continue;
          }
          if (Fl & 2) { RayRad[R * 3] = 0; RayRad[R * 3 + 1] = 0; RayRad[R * 3 + 2] = 0; continue; }
          const S = HitSlab[Ri];
          const Hx = HitPos[Ri * 3], Hy = HitPos[Ri * 3 + 1], Hz = HitPos[Ri * 3 + 2];
          const Nx = HitNrm[Ri * 3], Ny = HitNrm[Ri * 3 + 1], Nz = HitNrm[Ri * 3 + 2];
          const Dx = RayDirs[R * 3], Dy = RayDirs[R * 3 + 1], Dz = RayDirs[R * 3 + 2];
          let Er = S.EmR, Eg = S.EmG, Eb = S.EmB;
          if (Nx * SunX + Ny * SunY + Nz * SunZ > 0) {
            if (!Query.Occluded(Hx + Nx * 2.5e-3, Hy + Ny * 2.5e-3, Hz + Nz * 2.5e-3, SunX, SunY, SunZ, 120)) {
              Query.EvaluateSlabRadiance(S, Nx, Ny, Nz, -Dx, -Dy, -Dz, SunX, SunY, SunZ, SunIrr[0], SunIrr[1], SunIrr[2], Tmp3);
              Er += Tmp3[0]; Eg += Tmp3[1]; Eb += Tmp3[2];
            }
          }
          Alb[0] = S.DiffR; Alb[1] = S.DiffG; Alb[2] = S.DiffB;
          if (Query.AreaLights.length) {
            AreaDirect(Query, Hx, Hy, Hz, Nx, Ny, Nz, Alb, Tmp3, null);
            Er += Tmp3[0]; Eg += Tmp3[1]; Eb += Tmp3[2];
          }
          if (Pass > 0) {
            SampleIrradianceOverPi(State, Hx, Hy, Hz, Nx, Ny, Nz, -Dx, -Dy, -Dz, Prev3);
            Er += Prev3[0] * Alb[0]; Eg += Prev3[1] * Alb[1]; Eb += Prev3[2] * Alb[2];
          }
          RayRad[R * 3] = Er; RayRad[R * 3 + 1] = Eg; RayRad[R * 3 + 2] = Eb;
        }
        const IrrOffset = Ci * IRR_W * IRR_W * 3;
        for (let T = 0; T < IRR_W * IRR_W; ++T) {
          const Ndx = NormDirs[T * 3], Ndy = NormDirs[T * 3 + 1], Ndz = NormDirs[T * 3 + 2];
          let Sr = 0, Sg = 0, Sb = 0, Sw = 0;
          for (let R = 0; R < RayCount; ++R) {
            const Ct = Ndx * RayDirs[R * 3] + Ndy * RayDirs[R * 3 + 1] + Ndz * RayDirs[R * 3 + 2];
            if (Ct > 0) {
              Sr += RayRad[R * 3] * Ct; Sg += RayRad[R * 3 + 1] * Ct; Sb += RayRad[R * 3 + 2] * Ct;
              Sw += Ct;
            }
          }
          const Ns = Sw > 1e-5 ? 1 / Sw : 0;
          Next[IrrOffset + T * 3] = Sr * Ns; Next[IrrOffset + T * 3 + 1] = Sg * Ns; Next[IrrOffset + T * 3 + 2] = Sb * Ns;
        }
      }
      if (PreserveHistory && Pass + 1 === Cfg.BouncePasses) {
        const A = Clamp(1 - Cfg.TemporalBlend, 0.05, 1);
        for (let I = 0; I < Next.length; ++I) {
          const P = Previous.Irr[I];
          State.Irr[I] = P + (Next[I] - P) * A;
        }
      } else {
        State.Irr = Next;
      }
    }
    return State;
  }

  return { Bake, SampleIrradianceOverPi, AreaDirect, EncodeOct, DecodeOct, IRR_W, MOM_W };
}
