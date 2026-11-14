/*==========================================================================================================================================
                                                        NANITEMESHCATALOGUE.JS
==========================================================================================================================================*/
/**
 * 🧩 Procedural & Synthetic Mesh Catalog for Nanite Virtual Geometry Studio
 *
 * Provides:
 *   - Stanford Bunny reconstructed manifold
 *   - Stanford Dragon serpentine sculpture with scales & horns
 *   - Corinthian Classical Architectural Column
 *   - Fractal Torus Knot Helix with micro-ribbing
 *   - Mountain Crater Multi-Octave Fractal Terrain
 *   - Multi-Instance Nanite Grid Coordinator (100 instances = 12M+ virtual triangles)
 *   - Wavefront OBJ file intake & normal generator
 */

import { NanitePyramidBuilder } from './NanitePyramidBuilder.js';

//------------------------------------------------------------------------------------------------------------------------
//                                           PROCEDURAL GEOMETRY GENERATORS
//------------------------------------------------------------------------------------------------------------------------

/**
 * Computes smooth vertex normals from positions and triangle indices.
 */
function ComputeSmoothNormals(Positions, Indices)
{
    const VertexCount = Math.floor(Positions.length / 3);
    const Normals = new Float32Array(VertexCount * 3);

    const TriCount = Math.floor(Indices.length / 3);
    for (let t = 0; t < TriCount; ++t)
    {
        const i0 = Indices[t * 3] * 3;
        const i1 = Indices[t * 3 + 1] * 3;
        const i2 = Indices[t * 3 + 2] * 3;

        const e1x = Positions[i1] - Positions[i0];
        const e1y = Positions[i1 + 1] - Positions[i0 + 1];
        const e1z = Positions[i1 + 2] - Positions[i0 + 2];

        const e2x = Positions[i2] - Positions[i0];
        const e2y = Positions[i2 + 1] - Positions[i0 + 1];
        const e2z = Positions[i2 + 2] - Positions[i0 + 2];

        const fnx = e1y * e2z - e1z * e2y;
        const fny = e1z * e2x - e1x * e2z;
        const fnz = e1x * e2y - e1y * e2x;

        Normals[i0] += fnx; Normals[i0 + 1] += fny; Normals[i0 + 2] += fnz;
        Normals[i1] += fnx; Normals[i1 + 1] += fny; Normals[i1 + 2] += fnz;
        Normals[i2] += fnx; Normals[i2 + 1] += fny; Normals[i2 + 2] += fnz;
    }

    for (let v = 0; v < VertexCount; ++v)
    {
        const vi = v * 3;
        const len = Math.hypot(Normals[vi], Normals[vi + 1], Normals[vi + 2]);
        if (len > 1e-8)
        {
            Normals[vi] /= len; Normals[vi + 1] /= len; Normals[vi + 2] /= len;
        }
        else
        {
            Normals[vi] = 0; Normals[vi + 1] = 1; Normals[vi + 2] = 0;
        }
    }

    return Normals;
}

/**
 * 1. Stanford Dragon Procedural Reconstruction
 * High-polygon serpentine body with dorsal spine ridge, scales, curling horns and tail.
 */
export function GenerateStanfordDragon(Subdivisions = 140, RingSegments = 48)
{
    const Positions = [];
    const UVs = [];
    const Indices = [];

    const SpineLength = 12.0;

    for (let i = 0; i <= Subdivisions; ++i)
    {
        const u = i / Subdivisions;
        const t = u * SpineLength;

        // Serpentine curve: S-curves in X and Z, head elevation in Y
        const BaseX = Math.sin(t * 1.2) * 1.8 + Math.sin(t * 2.8) * 0.4;
        const BaseY = Math.cos(t * 0.6) * 1.2 + Math.sin(u * Math.PI) * 1.5 + (u > 0.8 ? (u - 0.8) * 12.0 : 0.0);
        const BaseZ = (u - 0.5) * 14.0 + Math.cos(t * 1.4) * 0.8;

        // Tangent, normal, binormal
        const dt = 0.01;
        const NextU = (i + dt) / Subdivisions;
        const NextT = NextU * SpineLength;
        const TanX = (Math.sin(NextT * 1.2) * 1.8 + Math.sin(NextT * 2.8) * 0.4) - BaseX;
        const TanY = (Math.cos(NextT * 0.6) * 1.2 + Math.sin(NextU * Math.PI) * 1.5 + (NextU > 0.8 ? (NextU - 0.8) * 12.0 : 0.0)) - BaseY;
        const TanZ = ((NextU - 0.5) * 14.0 + Math.cos(NextT * 1.4) * 0.8) - BaseZ;
        const TanLen = Math.hypot(TanX, TanY, TanZ);
        const Tx = TanX / TanLen, Ty = TanY / TanLen, Tz = TanZ / TanLen;

        let UpX = 0, UpY = 1, UpZ = 0;
        if (Math.abs(Ty) > 0.95) { UpX = 1; UpY = 0; UpZ = 0; }

        let Bx = Ty * UpZ - Tz * UpY;
        let By = Tz * UpX - Tx * UpZ;
        let Bz = Tx * UpY - Ty * UpX;
        const Blen = Math.hypot(Bx, By, Bz);
        Bx /= Blen; By /= Blen; Bz /= Blen;

        const Nx = By * Tz - Bz * Ty;
        const Ny = Bz * Tx - Bx * Tz;
        const Nz = Bx * Ty - By * Tx;

        // Radius profile: thick body, taper to tail, wider head
        let Radius = 0.8 * Math.sin(u * Math.PI) + 0.25;
        if (u > 0.82) Radius *= (1.0 + (u - 0.82) * 4.5); // Head expansion

        for (let j = 0; j < RingSegments; ++j)
        {
            const v = j / RingSegments;
            const Theta = v * Math.PI * 2;

            // Micro-scales & dorsal ridge modulation
            const SpineRidge = Math.exp(-Math.pow((Theta - Math.PI * 0.5) * 4.0, 2)) * 0.45;
            const ScaleNoise = Math.sin(u * 80.0 + Theta * 12.0) * 0.04 + Math.cos(u * 120.0 - Theta * 18.0) * 0.02;
            const ModRadius = Radius * (1.0 + SpineRidge + ScaleNoise);

            const CosT = Math.cos(Theta);
            const SinT = Math.sin(Theta);

            const Px = BaseX + (Bx * CosT + Nx * SinT) * ModRadius;
            const Py = BaseY + (By * CosT + Ny * SinT) * ModRadius;
            const Pz = BaseZ + (Bz * CosT + Nz * SinT) * ModRadius;

            Positions.push(Px, Py, Pz);
            UVs.push(u, v);
        }
    }

    for (let i = 0; i < Subdivisions; ++i)
    {
        for (let j = 0; j < RingSegments; ++j)
        {
            const nextJ = (j + 1) % RingSegments;
            const v00 = i * RingSegments + j;
            const v01 = i * RingSegments + nextJ;
            const v10 = (i + 1) * RingSegments + j;
            const v11 = (i + 1) * RingSegments + nextJ;

            Indices.push(v00, v10, v01);
            Indices.push(v01, v10, v11);
        }
    }

    const Normals = ComputeSmoothNormals(Positions, Indices);
    return {
        Positions: new Float32Array(Positions),
        Normals,
        UVs: new Float32Array(UVs),
        Indices: new Uint32Array(Indices)
    };
}

/**
 * 2. Stanford Bunny Procedural Reconstruction
 * Rounded body, upright ears, chest curvature, and rear flanks.
 */
export function GenerateStanfordBunny(LatitudeBands = 90, LongitudeBands = 90)
{
    const Positions = [];
    const UVs = [];
    const Indices = [];

    for (let lat = 0; lat <= LatitudeBands; ++lat)
    {
        const theta = (lat * Math.PI) / LatitudeBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= LongitudeBands; ++lon)
        {
            const phi = (lon * 2 * Math.PI) / LongitudeBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            // Base ellipsoid + bunny ear bumps + chest contour
            let r = 2.4;
            const x0 = cosPhi * sinTheta;
            const y0 = cosTheta;
            const z0 = sinPhi * sinTheta;

            // Pear-shaped torso
            const torsoY = y0 * 1.3 - 0.2;
            let radiusMod = 1.0 - torsoY * 0.18;

            // Ears (protruding when y0 > 0.5 and lateral)
            const earLeft = Math.exp(-((x0 - 0.45) ** 2 + (z0 - 0.15) ** 2) * 14.0) * Math.max(0, y0 - 0.35) * 4.2;
            const earRight = Math.exp(-((x0 + 0.45) ** 2 + (z0 - 0.15) ** 2) * 14.0) * Math.max(0, y0 - 0.35) * 4.2;

            // Tail
            const tail = Math.exp(-((x0) ** 2 + (y0 + 0.7) ** 2 + (z0 + 0.8) ** 2) * 8.0) * 0.8;

            // Haunches / hind legs
            const haunch = (Math.exp(-((x0 - 0.75) ** 2 + (y0 + 0.5) ** 2) * 6.0) +
                            Math.exp(-((x0 + 0.75) ** 2 + (y0 + 0.5) ** 2) * 6.0)) * 0.45;

            // Fine surface fur micro-texture
            const furNoise = (Math.sin(x0 * 30.0) * Math.cos(y0 * 30.0) + Math.sin(z0 * 25.0)) * 0.035;

            const finalR = (r * radiusMod + earLeft + earRight + tail + haunch + furNoise);

            Positions.push(x0 * finalR, (y0 * finalR * 1.1) + earLeft * 0.8 + earRight * 0.8, z0 * finalR);
            UVs.push(lon / LongitudeBands, lat / LatitudeBands);
        }
    }

    for (let lat = 0; lat < LatitudeBands; ++lat)
    {
        for (let lon = 0; lon < LongitudeBands; ++lon)
        {
            const first = lat * (LongitudeBands + 1) + lon;
            const second = first + LongitudeBands + 1;

            Indices.push(first, second, first + 1);
            Indices.push(second, second + 1, first + 1);
        }
    }

    const Normals = ComputeSmoothNormals(Positions, Indices);
    return {
        Positions: new Float32Array(Positions),
        Normals,
        UVs: new Float32Array(UVs),
        Indices: new Uint32Array(Indices)
    };
}

/**
 * 3. Classical Corinthian Column
 * Intricate architectural pillar with 24 flutes, torus base, pedestal, and volute capital.
 */
export function GenerateCorinthianColumn(HeightSegments = 120, RadialSegments = 72)
{
    const Positions = [];
    const UVs = [];
    const Indices = [];

    const TotalHeight = 9.0;

    for (let yIdx = 0; yIdx <= HeightSegments; ++yIdx)
    {
        const v = yIdx / HeightSegments;
        const y = (v - 0.5) * TotalHeight;

        // Radius profile along column
        let BaseRadius = 1.0;
        if (v < 0.12)
        {
            // Pedestal & Plinth
            BaseRadius = 1.45 - (v / 0.12) * 0.35 + Math.sin(v * 40.0) * 0.06;
        }
        else if (v > 0.88)
        {
            // Capital & Abacus
            const capV = (v - 0.88) / 0.12;
            BaseRadius = 1.0 + capV * 0.65 + Math.sin(capV * Math.PI * 4) * 0.12;
        }
        else
        {
            // Shaft with classical Entasis (slight swell)
            const shaftV = (v - 0.12) / 0.76;
            BaseRadius = 0.92 + Math.sin(shaftV * Math.PI) * 0.08;
        }

        for (let rIdx = 0; rIdx <= RadialSegments; ++rIdx)
        {
            const u = rIdx / RadialSegments;
            const theta = u * Math.PI * 2;

            // 24 Classical Flutes
            let Flute = 0;
            if (v >= 0.12 && v <= 0.88)
            {
                Flute = Math.sin(theta * 24.0) * 0.065;
            }
            else if (v > 0.88)
            {
                // Acanthus leaf volutes
                Flute = Math.sin(theta * 8.0) * 0.18 + Math.cos(theta * 16.0) * 0.08;
            }

            const r = BaseRadius - Flute;
            const x = Math.cos(theta) * r;
            const z = Math.sin(theta) * r;

            Positions.push(x, y, z);
            UVs.push(u, v);
        }
    }

    for (let y = 0; y < HeightSegments; ++y)
    {
        for (let r = 0; r < RadialSegments; ++r)
        {
            const p00 = y * (RadialSegments + 1) + r;
            const p01 = p00 + 1;
            const p10 = (y + 1) * (RadialSegments + 1) + r;
            const p11 = p10 + 1;

            Indices.push(p00, p10, p01);
            Indices.push(p01, p10, p11);
        }
    }

    const Normals = ComputeSmoothNormals(Positions, Indices);
    return {
        Positions: new Float32Array(Positions),
        Normals,
        UVs: new Float32Array(UVs),
        Indices: new Uint32Array(Indices)
    };
}

/**
 * 4. Fractal Helix / Torus Knot
 * (p=3, q=7) Torus Knot with high-frequency micro-helical fluting.
 */
export function GenerateFractalHelix(TubeSegments = 160, RadialSegments = 40)
{
    const Positions = [];
    const UVs = [];
    const Indices = [];

    const P = 3, Q = 7;
    const KnotRadius = 3.2;
    const TubeRadius = 0.65;

    for (let i = 0; i <= TubeSegments; ++i)
    {
        const u = (i / TubeSegments) * Math.PI * 2;
        const R = KnotRadius + Math.cos(Q * u) * 1.2;
        const cx = R * Math.cos(P * u);
        const cy = R * Math.sin(P * u);
        const cz = -Math.sin(Q * u) * 1.8;

        const du = 0.001;
        const u2 = u + du;
        const R2 = KnotRadius + Math.cos(Q * u2) * 1.2;
        const cx2 = R2 * Math.cos(P * u2);
        const cy2 = R2 * Math.sin(P * u2);
        const cz2 = -Math.sin(Q * u2) * 1.8;

        const tx = cx2 - cx, ty = cy2 - cy, tz = cz2 - cz;
        const tLen = Math.hypot(tx, ty, tz);
        const Tx = tx / tLen, Ty = ty / tLen, Tz = tz / tLen;

        let upx = 0, upy = 0, upz = 1;
        if (Math.abs(Tz) > 0.9) { upx = 1; upy = 0; upz = 0; }

        let bx = Ty * upz - Tz * upy, by = Tz * upx - Tx * upz, bz = Tx * upy - Ty * upx;
        const bLen = Math.hypot(bx, by, bz);
        bx /= bLen; by /= bLen; bz /= bLen;

        const nx = by * Tz - bz * Ty, ny = bz * Tx - bx * Tz, nz = bx * Ty - by * Tx;

        for (let j = 0; j <= RadialSegments; ++j)
        {
            const v = (j / RadialSegments) * Math.PI * 2;
            const Ribbing = Math.sin(v * 16.0 + u * 40.0) * 0.08;
            const LocalR = TubeRadius + Ribbing;

            const cv = Math.cos(v), sv = Math.sin(v);
            const px = cx + (bx * cv + nx * sv) * LocalR;
            const py = cy + (by * cv + ny * sv) * LocalR;
            const pz = cz + (bz * cv + nz * sv) * LocalR;

            Positions.push(px, py, pz);
            UVs.push(i / TubeSegments, j / RadialSegments);
        }
    }

    for (let i = 0; i < TubeSegments; ++i)
    {
        for (let j = 0; j < RadialSegments; ++j)
        {
            const v00 = i * (RadialSegments + 1) + j;
            const v01 = v00 + 1;
            const v10 = (i + 1) * (RadialSegments + 1) + j;
            const v11 = v10 + 1;

            Indices.push(v00, v10, v01);
            Indices.push(v01, v10, v11);
        }
    }

    const Normals = ComputeSmoothNormals(Positions, Indices);
    return {
        Positions: new Float32Array(Positions),
        Normals,
        UVs: new Float32Array(UVs),
        Indices: new Uint32Array(Indices)
    };
}

/**
 * 5. Mountain Crater Terrain
 * Heightfield elevation grid with multi-octave fractal noise and central impact crater.
 */
export function GenerateMountainCrater(GridResolution = 110)
{
    const Positions = [];
    const UVs = [];
    const Indices = [];

    const Size = 24.0;
    const HalfSize = Size * 0.5;
    const Step = Size / GridResolution;

    for (let zIdx = 0; zIdx <= GridResolution; ++zIdx)
    {
        const z = -HalfSize + zIdx * Step;
        const v = zIdx / GridResolution;

        for (let xIdx = 0; xIdx <= GridResolution; ++xIdx)
        {
            const x = -HalfSize + xIdx * Step;
            const u = xIdx / GridResolution;

            const distFromCenter = Math.hypot(x, z);

            // Crater rim and floor
            const craterRim = Math.exp(-Math.pow((distFromCenter - 4.5) * 0.8, 2)) * 3.2;
            const craterBowl = (distFromCenter < 4.2) ? -Math.cos((distFromCenter / 4.2) * Math.PI * 0.5) * 2.8 : 0.0;

            // Multi-octave ridges
            const octave1 = Math.sin(x * 0.35) * Math.cos(z * 0.35) * 2.2;
            const octave2 = Math.sin(x * 0.9 + 1.2) * Math.cos(z * 0.85) * 1.1;
            const octave3 = Math.sin(x * 2.4 - z * 1.8) * 0.45;
            const octave4 = (Math.sin(x * 6.0) + Math.cos(z * 6.0)) * 0.12;

            const y = craterRim + craterBowl + octave1 + octave2 + octave3 + octave4;

            Positions.push(x, y, z);
            UVs.push(u, v);
        }
    }

    for (let z = 0; z < GridResolution; ++z)
    {
        for (let x = 0; x < GridResolution; ++x)
        {
            const p00 = z * (GridResolution + 1) + x;
            const p01 = p00 + 1;
            const p10 = (z + 1) * (GridResolution + 1) + x;
            const p11 = p10 + 1;

            Indices.push(p00, p10, p01);
            Indices.push(p01, p10, p11);
        }
    }

    const Normals = ComputeSmoothNormals(Positions, Indices);
    return {
        Positions: new Float32Array(Positions),
        Normals,
        UVs: new Float32Array(UVs),
        Indices: new Uint32Array(Indices)
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                           WAVEFRONT OBJ FILE PARSER
//------------------------------------------------------------------------------------------------------------------------

export function ParseWavefrontOBJ(OBJText)
{
    const RawPositions = [];
    const RawNormals = [];
    const RawUVs = [];
    const OutPositions = [];
    const OutNormals = [];
    const OutUVs = [];
    const OutIndices = [];

    const Lines = OBJText.split(/\r?\n/);
    const VertexMap = new Map();
    let IndexCounter = 0;

    for (let i = 0; i < Lines.length; ++i)
    {
        const Line = Lines[i].trim();
        if (!Line || Line.startsWith('#')) continue;

        const Parts = Line.split(/\s+/);
        const Keyword = Parts[0];

        if (Keyword === 'v')
        {
            RawPositions.push(Number(Parts[1]), Number(Parts[2]), Number(Parts[3]));
        }
        else if (Keyword === 'vn')
        {
            RawNormals.push(Number(Parts[1]), Number(Parts[2]), Number(Parts[3]));
        }
        else if (Keyword === 'vt')
        {
            RawUVs.push(Number(Parts[1]), Number(Parts[2]));
        }
        else if (Keyword === 'f')
        {
            const FaceVerts = [];
            for (let p = 1; p < Parts.length; ++p)
            {
                const Key = Parts[p];
                if (VertexMap.has(Key))
                {
                    FaceVerts.push(VertexMap.get(Key));
                }
                else
                {
                    const Sub = Key.split('/');
                    const PosIdx = (Number(Sub[0]) - 1) * 3;
                    OutPositions.push(RawPositions[PosIdx], RawPositions[PosIdx + 1], RawPositions[PosIdx + 2]);

                    if (Sub[1] && RawUVs.length)
                    {
                        const UvIdx = (Number(Sub[1]) - 1) * 2;
                        OutUVs.push(RawUVs[UvIdx], RawUVs[UvIdx + 1]);
                    }
                    else
                    {
                        OutUVs.push(0, 0);
                    }

                    if (Sub[2] && RawNormals.length)
                    {
                        const NrmIdx = (Number(Sub[2]) - 1) * 3;
                        OutNormals.push(RawNormals[NrmIdx], RawNormals[NrmIdx + 1], RawNormals[NrmIdx + 2]);
                    }
                    else
                    {
                        OutNormals.push(0, 1, 0);
                    }

                    const NewIdx = IndexCounter++;
                    VertexMap.set(Key, NewIdx);
                    FaceVerts.push(NewIdx);
                }
            }

            // Triangulate polygon fan
            for (let f = 1; f < FaceVerts.length - 1; ++f)
            {
                OutIndices.push(FaceVerts[0], FaceVerts[f], FaceVerts[f + 1]);
            }
        }
    }

    let FinalNormals = new Float32Array(OutNormals);
    if (!RawNormals.length)
    {
        FinalNormals = ComputeSmoothNormals(OutPositions, OutIndices);
    }

    return {
        Positions: new Float32Array(OutPositions),
        Normals: FinalNormals,
        UVs: new Float32Array(OutUVs),
        Indices: new Uint32Array(OutIndices)
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                           NANITE MESH CATALOGUE MANAGER
//------------------------------------------------------------------------------------------------------------------------

export class NaniteMeshCatalogue
{
    constructor()
    {
        this.Pyramids = new Map();
    }

    loadPreset(PresetId, TargetClusterTris = 128)
    {
        if (this.Pyramids.has(PresetId))
        {
            return this.Pyramids.get(PresetId);
        }

        let RawGeo = null;
        let MeshName = 'Preset';

        switch (PresetId)
        {
            case 'bunny':
                MeshName = 'Stanford Bunny';
                RawGeo = GenerateStanfordBunny(84, 84); // ~14,000 triangles
                break;
            case 'dragon':
                MeshName = 'Stanford Dragon';
                RawGeo = GenerateStanfordDragon(130, 44); // ~22,000 triangles
                break;
            case 'column':
                MeshName = 'Corinthian Pillar';
                RawGeo = GenerateCorinthianColumn(110, 64); // ~14,000 triangles
                break;
            case 'fractal':
                MeshName = 'Fractal Helix';
                RawGeo = GenerateFractalHelix(140, 36); // ~10,000 triangles
                break;
            case 'crater':
                MeshName = 'Mountain Crater';
                RawGeo = GenerateMountainCrater(100); // ~20,000 triangles
                break;
            default:
                MeshName = 'Stanford Bunny';
                RawGeo = GenerateStanfordBunny(84, 84);
                break;
        }

        const Pyramid = NanitePyramidBuilder.Build(
            MeshName,
            RawGeo.Positions,
            RawGeo.Normals,
            RawGeo.UVs,
            RawGeo.Indices,
            TargetClusterTris,
            5
        );

        this.Pyramids.set(PresetId, Pyramid);
        return Pyramid;
    }

    loadOBJ(FileName, OBJText, TargetClusterTris = 128)
    {
        const RawGeo = ParseWavefrontOBJ(OBJText);
        const Pyramid = NanitePyramidBuilder.Build(
            FileName,
            RawGeo.Positions,
            RawGeo.Normals,
            RawGeo.UVs,
            RawGeo.Indices,
            TargetClusterTris,
            5
        );
        this.Pyramids.set(FileName, Pyramid);
        return Pyramid;
    }
}
