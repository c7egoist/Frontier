//==========================================================================================================================================
// FILE: RadianceFieldScene.js
// PURPOSE: Hermetic scene query used by the C++-parity GI bakes (DynamicProbeCache + VoxelSdfClipmap).
//          Wraps the CPU band kernel (TraceScene / TraceShadowRayAny / vehicle TLAS+BLAS) and adds the two queries the C++ bakes
//          need that a pure ray tracer does not have:
//            * closest-surface distance + facet normal + material slab (QueryClosestTriangleBvh equivalent) over analytic
//              primitives AND the vehicle triangle BVH,
//            * BounceSlabEntry compilation (MaterialSpace::CompileBounceSlabEntry subset) for every surface hit.
//          NO free outer variables: the factory source is serialised into the GI bake Web Worker.
//==========================================================================================================================================

export function CreateRadianceFieldScene(Engine, CompiledScene, AtlasPixels, VehicleBvhData) {
  const PI = Math.PI;
  const Packed = Engine.PackScene(CompiledScene, AtlasPixels);
  const Prims = Packed.Prims;
  const Lights = Packed.Lights;
  const Veh = VehicleBvhData && VehicleBvhData.instCount > 0 ? VehicleBvhData : null;
  const SrcPrims = CompiledScene.Primitives || [];
  const Hit = { ...Engine._Hit, gnx: 0, gny: 0, gnz: 1 };
  const MatScratch = { ...Engine._Mat };

  function Clamp(V, Lo, Hi) {
    return V < Lo ? Lo : V > Hi ? Hi : V;
  }

  //--------------------------------------------------------------------------------------------------------------------------------------
  // BounceSlab compile (CompileBounceSlabEntry): DiffAlbedo, SpecF0, effective roughness, emissive exitance, plus the voxel record
  // inputs (AlbedoRgb = BaseColor * BaseWeight, Metalness, Roughness).
  //--------------------------------------------------------------------------------------------------------------------------------------
  function CompileSlabFromMaterial(M, ExtraEmission = 0) {
    const Ior = Math.max(1.0001, M.ior || 1.5);
    const F0S = ((Ior - 1) / (Ior + 1)) * ((Ior - 1) / (Ior + 1));
    const Metal = Clamp(M.metallic, 0, 1);
    const Trans = Clamp(M.transmission || 0, 0, 1);
    const Dmask = (1 - Metal) * (1 - Trans);
    const Rough = M.coat > 0.5 ? 0.35 * M.coatRoughness + 0.65 * M.roughness : M.roughness;
    const Em = Math.max(0, (M.emission > 0 ? M.emission : 0) + ExtraEmission);
    return {
      DiffR: Clamp(M.baseR * Dmask, 0, 1), DiffG: Clamp(M.baseG * Dmask, 0, 1), DiffB: Clamp(M.baseB * Dmask, 0, 1),
      F0R: F0S * (1 - Metal) + M.baseR * Metal,
      F0G: F0S * (1 - Metal) + M.baseG * Metal,
      F0B: F0S * (1 - Metal) + M.baseB * Metal,
      Rough: Clamp(Rough, 0.02, 1),
      EmR: M.baseR * Em, EmG: M.baseG * Em, EmB: M.baseB * Em,
      AlbR: M.baseR, AlbG: M.baseG, AlbB: M.baseB,
      Metal,
    };
  }

  const PrimSlabs = new Array(Prims.length);
  for (let I = 0; I < Prims.length; ++I) {
    const M = Engine.FetchMaterialInto(Prims, AtlasPixels, I, 0.5, 0.5, MatScratch);
    PrimSlabs[I] = CompileSlabFromMaterial(M, Prims[I].Emission || 0);
  }
  const VehSlabCache = new Map();
  function VehicleSlab(MatId, Pr, Pg, Pb, Rough, Coat) {
    const Key = `${MatId}|${Pr.toFixed(3)}|${Pg.toFixed(3)}|${Pb.toFixed(3)}|${Rough.toFixed(3)}|${Coat.toFixed(2)}`;
    let S = VehSlabCache.get(Key);
    if (!S) {
      const H = { vehMatId: MatId, vehPr: Pr, vehPg: Pg, vehPb: Pb, vehRough: Rough, vehCoat: Coat };
      S = CompileSlabFromMaterial(Engine.BuildVehicleMaterialInto(H, MatScratch));
      VehSlabCache.set(Key, S);
    }
    return S;
  }

  // EvaluateBounceSlabRadiance (BounceLayerSummary.cpp)
  function EvaluateSlabRadiance(S, Nx, Ny, Nz, Ox, Oy, Oz, Lx, Ly, Lz, Ir, Ig, Ib, Out) {
    const NdotL = Math.max(0, Nx * Lx + Ny * Ly + Nz * Lz);
    if (NdotL <= 1e-6) { Out[0] = S.EmR; Out[1] = S.EmG; Out[2] = S.EmB; return Out; }
    let Hx = Ox + Lx, Hy = Oy + Ly, Hz = Oz + Lz;
    const Hl = Math.hypot(Hx, Hy, Hz);
    if (Hl > 1e-6) { Hx /= Hl; Hy /= Hl; Hz /= Hl; } else { Hx = Nx; Hy = Ny; Hz = Nz; }
    const NdotH = Math.max(0, Nx * Hx + Ny * Hy + Nz * Hz);
    const VdotH = Clamp(Ox * Hx + Oy * Hy + Oz * Hz, 0, 1);
    const R2 = S.Rough * S.Rough;
    const A2 = Math.max(1e-3, R2 * R2);
    const Den = NdotH * NdotH * (A2 - 1) + 1;
    const Lobe = A2 / Math.max(1e-5, PI * Den * Den * 4);
    const Sch = Math.pow(1 - VdotH, 5);
    const InvPi = 1 / PI;
    Out[0] = S.EmR + (S.DiffR * InvPi * (1 - S.F0R) + (S.F0R + (1 - S.F0R) * Sch) * Lobe) * Ir * NdotL;
    Out[1] = S.EmG + (S.DiffG * InvPi * (1 - S.F0G) + (S.F0G + (1 - S.F0G) * Sch) * Lobe) * Ig * NdotL;
    Out[2] = S.EmB + (S.DiffB * InvPi * (1 - S.F0B) + (S.F0B + (1 - S.F0B) * Sch) * Lobe) * Ib * NdotL;
    return Out;
  }

  //--------------------------------------------------------------------------------------------------------------------------------------
  // TraceClosest: SceneTree.TraceClosestRay(Ray, false) equivalent with the RAW geometric normal (not flipped toward the ray),
  // so callers can apply the C++ backface rule dot(GeometricNormal, RayDir) >= 0.
  //--------------------------------------------------------------------------------------------------------------------------------------
  function TraceClosest(Ox, Oy, Oz, Dx, Dy, Dz, TMax) {
    Engine.TraceScene(Prims, Veh, Ox, Oy, Oz, Dx, Dy, Dz, TMax, -1, true, Hit);
    if (!Hit.hit) return null;
    if (!Hit.isVehicle) {
      Hit.gnx = Hit.nx; Hit.gny = Hit.ny; Hit.gnz = Hit.nz;
      Hit.slab = PrimSlabs[Hit.primIdx];
      if (SrcPrims[Hit.primIdx] && !Prims[Hit.primIdx].ConstMat) {
        const M = Engine.FetchMaterialInto(Prims, AtlasPixels, Hit.primIdx, Hit.u, Hit.v, MatScratch);
        Hit.slab = CompileSlabFromMaterial(M, Prims[Hit.primIdx].Emission || 0);
      }
    } else {
      // TraceVehicleBvh stores the un-bent oriented world normal in gnx/gny/gnz.
      if (!(Hit.gnx || Hit.gny || Hit.gnz)) { Hit.gnx = Hit.nx; Hit.gny = Hit.ny; Hit.gnz = Hit.nz; }
      Hit.slab = VehicleSlab(Hit.vehMatId, Hit.vehPr, Hit.vehPg, Hit.vehPb, Hit.vehRough, Hit.vehCoat);
    }
    return Hit;
  }

  function Occluded(Ox, Oy, Oz, Dx, Dy, Dz, MaxDist) {
    return Engine.TraceShadowRayAny(Prims, Veh, Ox, Oy, Oz, Dx, Dy, Dz, MaxDist, -1);
  }

  //--------------------------------------------------------------------------------------------------------------------------------------
  // Closest surface (unsigned distance, facet normal, slab) — QueryClosestTriangleBvh over analytic primitives + vehicle BVH.
  //--------------------------------------------------------------------------------------------------------------------------------------
  function SdCappedCone(Px, Py, Pz, Z0, Z1, R0, R1) {
    // Exact SDF of a capped cone aligned with +Z between Z0 (radius R0) and Z1 (radius R1) (Quilez).
    const H = Math.max(1e-5, 0.5 * (Z1 - Z0));
    const Zc = Pz - 0.5 * (Z0 + Z1);
    const Qx = Math.hypot(Px, Py), Qy = Zc;
    const K1x = R1, K1y = H;
    const K2x = R1 - R0, K2y = 2 * H;
    const Cax = Qx - Math.min(Qx, Qy < 0 ? R0 : R1), Cay = Math.abs(Qy) - H;
    const K2d = K2x * K2x + K2y * K2y;
    const T = Clamp(((K1x - Qx) * K2x + (K1y - Qy) * K2y) / Math.max(1e-9, K2d), 0, 1);
    const Cbx = Qx - K1x + K2x * T, Cby = Qy - K1y + K2y * T;
    const S = Cbx < 0 && Cay < 0 ? -1 : 1;
    return S * Math.sqrt(Math.min(Cax * Cax + Cay * Cay, Cbx * Cbx + Cby * Cby));
  }
  function SdBox(Px, Py, Pz, Hx, Hy, Hz) {
    const Qx = Math.abs(Px) - Hx, Qy = Math.abs(Py) - Hy, Qz = Math.abs(Pz) - Hz;
    const Ox = Math.max(Qx, 0), Oy = Math.max(Qy, 0), Oz = Math.max(Qz, 0);
    return Math.hypot(Ox, Oy, Oz) + Math.min(Math.max(Qx, Math.max(Qy, Qz)), 0);
  }
  function PrimLocalSd(P, X, Y, Z) {
    const Hx = P.Hx, Hy = P.Hy, Hz = P.Hz;
    const Shape = P.Shape;
    if (Shape === 0) return SdBox(X, Y, Z, Hx, Hy, Hz);
    if (Shape === 1) {
      const K0 = Math.hypot(X / Hx, Y / Hy, Z / Hz);
      const K1 = Math.hypot(X / (Hx * Hx), Y / (Hy * Hy), Z / (Hz * Hz));
      return K1 > 1e-9 ? (K0 * (K0 - 1)) / K1 : -Math.min(Hx, Hy, Hz);
    }
    if (Shape === 4) {
      const RMinor = Hz;
      const RMajor = Math.max(RMinor * 1.25, Math.max(Hx, Hy) - RMinor);
      return Math.hypot(Math.hypot(X, Y) - RMajor, Z) - RMinor;
    }
    const Rad = Math.max(Hx, Hy);
    if (Shape === 3) {
      const ZFoot = -0.78 * Hz;
      const BoxD = SdBox(X, Y, Z - 0.5 * (ZFoot - Hz), Rad, Rad, 0.5 * (ZFoot + Hz));
      return Math.min(BoxD, SdCappedCone(X, Y, Z, ZFoot, Hz, 0.72 * Rad, 0.13 * Rad));
    }
    if (Shape === 5) {
      const ZFoot = -0.84 * Hz;
      return Math.min(
        SdCappedCone(X, Y, Z, -Hz, ZFoot, Rad, 0.94 * Rad),
        SdCappedCone(X, Y, Z, ZFoot, Hz, 0.5 * Rad, 0.37 * Rad),
      );
    }
    return SdCappedCone(X, Y, Z, -Hz, Hz, Rad, Rad);
  }

  const Near = { valid: false, dist: 1e9, nx: 0, ny: 0, nz: 1, slab: null };

  function ClosestPointTriDistSq(Px, Py, Pz, Ax, Ay, Az, Bx, By, Bz, Cx, Cy, Cz) {
    // Ericson, Real-Time Collision Detection 5.1.5
    const ABx = Bx - Ax, ABy = By - Ay, ABz = Bz - Az;
    const ACx = Cx - Ax, ACy = Cy - Ay, ACz = Cz - Az;
    const APx = Px - Ax, APy = Py - Ay, APz = Pz - Az;
    const D1 = ABx * APx + ABy * APy + ABz * APz, D2 = ACx * APx + ACy * APy + ACz * APz;
    let Qx, Qy, Qz;
    if (D1 <= 0 && D2 <= 0) { Qx = Ax; Qy = Ay; Qz = Az; }
    else {
      const BPx = Px - Bx, BPy = Py - By, BPz = Pz - Bz;
      const D3 = ABx * BPx + ABy * BPy + ABz * BPz, D4 = ACx * BPx + ACy * BPy + ACz * BPz;
      if (D3 >= 0 && D4 <= D3) { Qx = Bx; Qy = By; Qz = Bz; }
      else {
        const VC = D1 * D4 - D3 * D2;
        if (VC <= 0 && D1 >= 0 && D3 <= 0) {
          const V = D1 / (D1 - D3);
          Qx = Ax + ABx * V; Qy = Ay + ABy * V; Qz = Az + ABz * V;
        } else {
          const CPx = Px - Cx, CPy = Py - Cy, CPz = Pz - Cz;
          const D5 = ABx * CPx + ABy * CPy + ABz * CPz, D6 = ACx * CPx + ACy * CPy + ACz * CPz;
          if (D6 >= 0 && D5 <= D6) { Qx = Cx; Qy = Cy; Qz = Cz; }
          else {
            const VB = D5 * D2 - D1 * D6;
            if (VB <= 0 && D2 >= 0 && D6 <= 0) {
              const W = D2 / (D2 - D6);
              Qx = Ax + ACx * W; Qy = Ay + ACy * W; Qz = Az + ACz * W;
            } else {
              const VA = D3 * D6 - D5 * D4;
              if (VA <= 0 && D4 - D3 >= 0 && D5 - D6 >= 0) {
                const W = (D4 - D3) / ((D4 - D3) + (D5 - D6));
                Qx = Bx + (Cx - Bx) * W; Qy = By + (Cy - By) * W; Qz = Bz + (Cz - Bz) * W;
              } else {
                const Dn = 1 / (VA + VB + VC);
                const V = VB * Dn, W = VC * Dn;
                Qx = Ax + ABx * V + ACx * W; Qy = Ay + ABy * V + ACy * W; Qz = Az + ABz * V + ACz * W;
              }
            }
          }
        }
      }
    }
    const Ex = Px - Qx, Ey = Py - Qy, Ez = Pz - Qz;
    return Ex * Ex + Ey * Ey + Ez * Ez;
  }

  function AabbDistSq(Px, Py, Pz, Nodes, B) {
    const Dx = Math.max(Nodes[B] - Px, 0, Px - Nodes[B + 4]);
    const Dy = Math.max(Nodes[B + 1] - Py, 0, Py - Nodes[B + 5]);
    const Dz = Math.max(Nodes[B + 2] - Pz, 0, Pz - Nodes[B + 6]);
    return Dx * Dx + Dy * Dy + Dz * Dz;
  }

  const TStack = new Int32Array(64);
  const BStack = new Int32Array(64);
  const InstScale = [];
  if (Veh) {
    for (let I = 0; I < Veh.instCount; ++I) {
      const B = I * 40;
      InstScale.push(Math.max(1e-4, Math.hypot(Veh.insts[B], Veh.insts[B + 1], Veh.insts[B + 2])));
    }
  }

  // Returns Near (shared record). Cutoff bounds the search like QueryClosestTriangleBvh(Tree, Pt, CutoffDist).
  function ClosestSurface(Px, Py, Pz, Cutoff) {
    let Best = Cutoff;
    let BestSource = -1, BestPrim = -1, BestInst = -1, BestTri = -1;
    for (let I = 0; I < Prims.length; ++I) {
      const P = Prims[I];
      if (!P.GiContributor && !P.CastShadows) continue;
      const Dx = Px - P.Cx, Dy = Py - P.Cy, Dz = Pz - P.Cz;
      const Dc = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      if (Dc - P.BoundR > Best) continue;
      const Lx = P.R0x * Dx + P.R0y * Dy + P.R0z * Dz;
      const Ly = P.R1x * Dx + P.R1y * Dy + P.R1z * Dz;
      const Lz = P.R2x * Dx + P.R2y * Dy + P.R2z * Dz;
      const D = Math.abs(PrimLocalSd(P, Lx, Ly, Lz));
      if (D < Best) { Best = D; BestSource = 0; BestPrim = I; }
    }
    if (Veh) {
      const Nodes = Veh.nodes, Tris = Veh.tris, Insts = Veh.insts;
      let TTop = 1; TStack[0] = 0;
      while (TTop > 0) {
        const Ni = TStack[--TTop];
        const Nb = Ni * 8;
        if (AabbDistSq(Px, Py, Pz, Nodes, Nb) >= Best * Best) continue;
        const LeftFirst = Math.round(Nodes[Nb + 3]);
        const Count = Math.round(Nodes[Nb + 7]);
        if (Count < 0) {
          const Inst = -Count - 1;
          if (Inst < 0 || Inst >= Veh.instCount) continue;
          const Ib = Inst * 40;
          const Sc = InstScale[Inst];
          const Lx = Insts[Ib + 16] * Px + Insts[Ib + 20] * Py + Insts[Ib + 24] * Pz + Insts[Ib + 28];
          const Ly = Insts[Ib + 17] * Px + Insts[Ib + 21] * Py + Insts[Ib + 25] * Pz + Insts[Ib + 29];
          const Lz = Insts[Ib + 18] * Px + Insts[Ib + 22] * Py + Insts[Ib + 26] * Pz + Insts[Ib + 30];
          const LBest = Best / Sc;
          let LB2 = LBest * LBest;
          let BTop = 1; BStack[0] = LeftFirst;
          while (BTop > 0) {
            const Bi = BStack[--BTop];
            const Bb = Bi * 8;
            if (AabbDistSq(Lx, Ly, Lz, Nodes, Bb) >= LB2) continue;
            const BL = Math.round(Nodes[Bb + 3]);
            const BC = Math.round(Nodes[Bb + 7]);
            if (BC > 0) {
              for (let T = 0; T < BC; ++T) {
                const Tb = (BL + T) * 16;
                const D2 = ClosestPointTriDistSq(Lx, Ly, Lz,
                  Tris[Tb], Tris[Tb + 1], Tris[Tb + 2], Tris[Tb + 4], Tris[Tb + 5], Tris[Tb + 6], Tris[Tb + 8], Tris[Tb + 9], Tris[Tb + 10]);
                if (D2 < LB2) {
                  LB2 = D2;
                  Best = Math.sqrt(D2) * Sc;
                  BestSource = 1; BestInst = Inst; BestTri = BL + T;
                }
              }
            } else if (BTop < 62) {
              const DL = AabbDistSq(Lx, Ly, Lz, Nodes, BL * 8), DR = AabbDistSq(Lx, Ly, Lz, Nodes, (BL + 1) * 8);
              if (DL < DR) { BStack[BTop++] = BL + 1; BStack[BTop++] = BL; }
              else { BStack[BTop++] = BL; BStack[BTop++] = BL + 1; }
            }
          }
        } else if (TTop < 62) {
          TStack[TTop++] = LeftFirst;
          TStack[TTop++] = LeftFirst + 1;
        }
      }
    }
    Near.valid = BestSource >= 0;
    Near.dist = Best;
    if (BestSource === 0) {
      const P = Prims[BestPrim];
      const Dx = Px - P.Cx, Dy = Py - P.Cy, Dz = Pz - P.Cz;
      const Lx = P.R0x * Dx + P.R0y * Dy + P.R0z * Dz;
      const Ly = P.R1x * Dx + P.R1y * Dy + P.R1z * Dz;
      const Lz = P.R2x * Dx + P.R2y * Dy + P.R2z * Dz;
      const H = Math.max(1e-3, Math.min(P.Hx, P.Hy, P.Hz) * 0.02);
      const D0 = PrimLocalSd(P, Lx + H, Ly - H, Lz - H);
      const D1 = PrimLocalSd(P, Lx - H, Ly - H, Lz + H);
      const D2 = PrimLocalSd(P, Lx - H, Ly + H, Lz - H);
      const D3 = PrimLocalSd(P, Lx + H, Ly + H, Lz + H);
      let Gx = D0 - D1 - D2 + D3, Gy = -D0 - D1 + D2 + D3, Gz = -D0 + D1 - D2 + D3;
      const Gl = Math.hypot(Gx, Gy, Gz);
      if (Gl > 1e-9) { Gx /= Gl; Gy /= Gl; Gz /= Gl; } else { Gx = 0; Gy = 0; Gz = 1; }
      Near.nx = P.R0x * Gx + P.R1x * Gy + P.R2x * Gz;
      Near.ny = P.R0y * Gx + P.R1y * Gy + P.R2y * Gz;
      Near.nz = P.R0z * Gx + P.R1z * Gy + P.R2z * Gz;
      Near.slab = PrimSlabs[BestPrim];
    } else if (BestSource === 1) {
      const Tris = Veh.tris, Insts = Veh.insts;
      const Tb = BestTri * 16, Ib = BestInst * 40;
      const E1x = Tris[Tb + 4] - Tris[Tb], E1y = Tris[Tb + 5] - Tris[Tb + 1], E1z = Tris[Tb + 6] - Tris[Tb + 2];
      const E2x = Tris[Tb + 8] - Tris[Tb], E2y = Tris[Tb + 9] - Tris[Tb + 1], E2z = Tris[Tb + 10] - Tris[Tb + 2];
      const Gx = E1y * E2z - E1z * E2y, Gy = E1z * E2x - E1x * E2z, Gz = E1x * E2y - E1y * E2x;
      let Wx = Insts[Ib + 16] * Gx + Insts[Ib + 17] * Gy + Insts[Ib + 18] * Gz;
      let Wy = Insts[Ib + 20] * Gx + Insts[Ib + 21] * Gy + Insts[Ib + 22] * Gz;
      let Wz = Insts[Ib + 24] * Gx + Insts[Ib + 25] * Gy + Insts[Ib + 26] * Gz;
      const Wl = Math.hypot(Wx, Wy, Wz);
      if (Wl > 1e-12) { Wx /= Wl; Wy /= Wl; Wz /= Wl; } else { Wx = 0; Wy = 0; Wz = 1; }
      Near.nx = Wx; Near.ny = Wy; Near.nz = Wz;
      const Override = Math.round(Insts[Ib + 32]) - 1;
      const MatId = Override >= 0 ? Override : Math.round(Tris[Tb + 3]);
      Near.slab = VehicleSlab(MatId, Insts[Ib + 36], Insts[Ib + 37], Insts[Ib + 38], Insts[Ib + 39], Insts[Ib + 35]);
    }
    return Near;
  }

  //--------------------------------------------------------------------------------------------------------------------------------------
  // Lights in C++ terms: PolygonalAreaQuadLight (two-sided for mirror Omni lights, which the clipmap mask treats as "Point").
  //--------------------------------------------------------------------------------------------------------------------------------------
  const AreaLights = Lights.map((L) => {
    let Nx = L.Nx, Ny = L.Ny, Nz = L.Nz;
    const Nl = Math.hypot(Nx, Ny, Nz);
    if (Nl > 1e-6) { Nx /= Nl; Ny /= Nl; Nz /= Nl; } else { Nx = 0; Ny = 0; Nz = -1; }
    return {
      Cx: L.Cx, Cy: L.Cy, Cz: L.Cz, Nx, Ny, Nz,
      Hw: Math.max(1e-3, L.Hw), Hh: Math.max(1e-3, L.Hh),
      TwoSided: !!L.Omni, Omni: !!L.Omni,
      R: L.RadR, G: L.RadG, B: L.RadB,
    };
  });

  return {
    Prims, Lights, AreaLights, Veh,
    TraceClosest, Occluded, ClosestSurface, EvaluateSlabRadiance, CompileSlabFromMaterial,
  };
}
