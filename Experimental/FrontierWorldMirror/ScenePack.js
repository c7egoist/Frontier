//==========================================================================================================================================
// FILE: ScenePack.js
// PURPOSE: Packs the compiled scene into the 8 x 396 vec4 primitive / area-light table shared by the WebGPU storage buffer, the
//          WebGL RGBA32F texture and the GPU global distance field GI kernels (rows 0..383 primitives, rows 384..395 area lights).
//==========================================================================================================================================

export const SCENE_DATA_W = 8;
export const SCENE_DATA_H = 396;
export const LIGHT_ROW_BASE = 384;

export function PackSceneDataBuffer(ActiveScene, PCount, LCount, Out) {
  Out.fill(0);
  for (let I = 0; I < PCount; ++I) {
    const P = ActiveScene.Primitives[I];
    const Row = I * SCENE_DATA_W * 4;
    const Flags =
      (P.CastShadows ? 1 : 0) |
      (P.GiContributor ? 2 : 0) |
      (P.GlassShell ? 4 : 0) |
      (P.FaceAtlas ? 8 : 0);
    Out[Row + 0] = P.Center[0];
    Out[Row + 1] = P.Center[1];
    Out[Row + 2] = P.Center[2];
    Out[Row + 3] = P.Shape;

    Out[Row + 4] = P.HalfExtents[0];
    Out[Row + 5] = P.HalfExtents[1];
    Out[Row + 6] = P.HalfExtents[2];
    Out[Row + 7] = Flags;

    const [Rx, Ry, Rz] = P.RotationRad;
    const Cx = Math.cos(Rx), Sx = Math.sin(Rx);
    const Cy = Math.cos(Ry), Sy = Math.sin(Ry);
    const Cz = Math.cos(Rz), Sz = Math.sin(Rz);

    Out[Row + 8] = Cz * Cy;
    Out[Row + 9] = Sz * Cy;
    Out[Row + 10] = -Sy;
    Out[Row + 11] = P.Abbe;

    Out[Row + 12] = Cz * Sy * Sx - Sz * Cx;
    Out[Row + 13] = Sz * Sy * Sx + Cz * Cx;
    Out[Row + 14] = Cy * Sx;
    Out[Row + 15] = P.PickCode || 1 + I;

    Out[Row + 16] = Cz * Sy * Cx + Sz * Sx;
    Out[Row + 17] = Sz * Sy * Cx - Cz * Sx;
    Out[Row + 18] = Cy * Cx;
    Out[Row + 19] = 0.0;

    Out[Row + 20] = P.EdgeTintF82[0];
    Out[Row + 21] = P.EdgeTintF82[1];
    Out[Row + 22] = P.EdgeTintF82[2];
    Out[Row + 23] = P.Transmission;

    const DiffWeight = P.Emission > 0.01 ? 1.0 : 1.0 - P.Metallic * 0.75;
    Out[Row + 24] = P.BaseColor[0] * DiffWeight;
    Out[Row + 25] = P.BaseColor[1] * DiffWeight;
    Out[Row + 26] = P.BaseColor[2] * DiffWeight;
    Out[Row + 27] = P.Emission;
  }

  for (let Li = 0; Li < LCount; ++Li) {
    const L = ActiveScene.AreaLights[Li];
    const Row = (LIGHT_ROW_BASE + Li) * SCENE_DATA_W * 4;
    const Right = L.Right || [1, 0, 0];
    const Up = L.Up || [0, 1, 0];
    const Normal = L.Normal || [0, 0, -1];
    Out[Row + 0] = L.Center[0];
    Out[Row + 1] = L.Center[1];
    Out[Row + 2] = L.Center[2];
    Out[Row + 3] = L.HalfWidth;

    Out[Row + 4] = L.HalfHeight;
    Out[Row + 5] = L.Radiance[0];
    Out[Row + 6] = L.Radiance[1];
    Out[Row + 7] = L.Radiance[2];

    Out[Row + 8] = L.QuadVisible === false ? 0.0 : 1.0;
    Out[Row + 9] = L.PickCode || (400 + Li);
    Out[Row + 10] = L.Omni ? 1.0 : 0.0;
    Out[Row + 11] = 0.0;

    Out[Row + 12] = Right[0];
    Out[Row + 13] = Right[1];
    Out[Row + 14] = Right[2];
    Out[Row + 15] = 0.0;

    Out[Row + 16] = Up[0];
    Out[Row + 17] = Up[1];
    Out[Row + 18] = Up[2];
    Out[Row + 19] = 0.0;

    Out[Row + 20] = Normal[0];
    Out[Row + 21] = Normal[1];
    Out[Row + 22] = Normal[2];
    Out[Row + 23] = 0.0;
  }
}
