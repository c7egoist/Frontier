//============================================================================================================================================
//                                                             SURFACENETS.JS
//============================================================================================================================================
// 📦 Fast, robust 3D Surface Nets isosurface polygonizer for procedural voxel fields.
// Extracts clean, watertight triangle meshes from Signed Distance Fields with accurate
// analytical gradient normals, true overhangs (>90°), and per-vertex satmap masks.
// DOM-free: runs in Node.js and the Browser.

import { CliffField } from './VoxelField.js';

/**
 * Surface Nets Isosurface Mesher
 */
export class SurfaceNetsMesher {
    constructor() {}

    /**
     * Meshes the given CliffField inside a specified 3D bounding box.
     * @param {CliffField} field - The procedural cliff field evaluator
     * @param {Object} options - Bounding box and resolution options
     * @returns {Object} Mesh data containing typed arrays (positions, normals, colors, satmaps, indices)
     */
    static generateMesh(field, options = {}) {
        const stage = options.stage !== undefined ? options.stage : 5;
        const resX = options.resX || 64;
        const resY = options.resY || 56;
        const resZ = options.resZ || 64;

        const bounds = options.bounds || {
            minX: -(field.spec.cliffWidth || 24.0) * 0.6,
            maxX:  (field.spec.cliffWidth || 24.0) * 0.6,
            minY: -(field.spec.cliffHeight || 16.0) * 0.65,
            maxY:  (field.spec.cliffHeight || 16.0) * 0.65,
            minZ: -(field.spec.cliffDepth || 14.0) * 0.6,
            maxX_Z: (field.spec.cliffDepth || 14.0) * 0.6
        };
        const minZ = bounds.minZ;
        const maxZ = bounds.maxX_Z !== undefined ? bounds.maxX_Z : bounds.maxZ;

        const sx = (bounds.maxX - bounds.minX) / (resX - 1);
        const sy = (bounds.maxY - bounds.minY) / (resY - 1);
        const sz = (maxZ - minZ) / (resZ - 1);

        // 1. Sample scalar SDF grid values at (resX x resY x resZ) points
        const numSamples = resX * resY * resZ;
        const grid = new Float32Array(numSamples);

        let idx = 0;
        for (let k = 0; k < resZ; k++) {
            const z = minZ + k * sz;
            for (let j = 0; j < resY; j++) {
                const y = bounds.minY + j * sy;
                for (let i = 0; i < resX; i++) {
                    const x = bounds.minX + i * sx;
                    grid[idx++] = field.evaluate(x, y, z, stage);
                }
            }
        }

        const strideY = resX;
        const strideZ = resX * resY;

        // Cube corner offsets
        const cubeCorners = [
            [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
            [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
        ];

        // 12 edges of a cube connecting corner indices
        const cubeEdges = [
            [0, 1], [1, 3], [3, 2], [2, 0], // bottom face
            [4, 5], [5, 7], [7, 6], [6, 4], // top face
            [0, 4], [1, 5], [2, 6], [3, 7]  // vertical pillars
        ];

        // Buffer to store dual vertex index for each cell (-1 if cell has no vertex)
        const cellCount = (resX - 1) * (resY - 1) * (resZ - 1);
        const cellVertices = new Int32Array(cellCount).fill(-1);

        const tempPositions = [];
        const tempNormals = [];
        const tempSatmaps = [];
        const tempColors = [];
        const tempUvs = [];

        let overhangVertexCount = 0;

        // 2. Dual vertex generation per active cell
        let cellIdx = 0;
        for (let cz = 0; cz < resZ - 1; cz++) {
            for (let cy = 0; cy < resY - 1; cy++) {
                for (let cx = 0; cx < resX - 1; cx++) {
                    // Check signs of 8 corners
                    let mask = 0;
                    const cornerValues = new Float32Array(8);

                    for (let c = 0; c < 8; c++) {
                        const ix = cx + cubeCorners[c][0];
                        const iy = cy + cubeCorners[c][1];
                        const iz = cz + cubeCorners[c][2];
                        const val = grid[ix + iy * strideY + iz * strideZ];
                        cornerValues[c] = val;
                        if (val <= 0.0) mask |= (1 << c);
                    }

                    // If all inside or all outside, no isosurface crosses this cell
                    if (mask === 0 || mask === 255) {
                        cellVertices[cellIdx++] = -1;
                        continue;
                    }

                    // Average zero-crossings along active edges
                    let avgX = 0, avgY = 0, avgZ = 0;
                    let crossCount = 0;

                    for (let e = 0; e < 12; e++) {
                        const c0 = cubeEdges[e][0];
                        const c1 = cubeEdges[e][1];
                        const v0 = cornerValues[c0];
                        const v1 = cornerValues[c1];

                        if ((v0 <= 0.0 && v1 > 0.0) || (v0 > 0.0 && v1 <= 0.0)) {
                            // Linear interpolation for zero crossing
                            const t = Math.max(0.0, Math.min(1.0, -v0 / (v1 - v0)));
                            const x0 = bounds.minX + (cx + cubeCorners[c0][0]) * sx;
                            const y0 = bounds.minY + (cy + cubeCorners[c0][1]) * sy;
                            const z0 = minZ + (cz + cubeCorners[c0][2]) * sz;

                            const x1 = bounds.minX + (cx + cubeCorners[c1][0]) * sx;
                            const y1 = bounds.minY + (cy + cubeCorners[c1][1]) * sy;
                            const z1 = minZ + (cz + cubeCorners[c1][2]) * sz;

                            avgX += x0 + t * (x1 - x0);
                            avgY += y0 + t * (y1 - y0);
                            avgZ += z0 + t * (z1 - z0);
                            crossCount++;
                        }
                    }

                    if (crossCount > 0) {
                        avgX /= crossCount;
                        avgY /= crossCount;
                        avgZ /= crossCount;

                        // Refine position along gradient for sharper features (1 Newton-Raphson step)
                        const dVal = field.evaluate(avgX, avgY, avgZ, stage);
                        const nGrad = field.normal(avgX, avgY, avgZ, 0.05, stage);
                        avgX -= dVal * nGrad.x * 0.7;
                        avgY -= dVal * nGrad.y * 0.7;
                        avgZ -= dVal * nGrad.z * 0.7;

                        const norm = field.normal(avgX, avgY, avgZ, 0.06, stage);
                        const sat = field.getSatmap(avgX, avgY, avgZ, norm, stage);

                        if (norm.y < -0.05) overhangVertexCount++;

                        const vIndex = tempPositions.length / 3;
                        cellVertices[cellIdx] = vIndex;

                        tempPositions.push(avgX, avgY, avgZ);
                        tempNormals.push(norm.x, norm.y, norm.z);
                        tempSatmaps.push(sat.slope, sat.strataPhase, sat.cavity, sat.flow);

                        // Synthesize RGB color based on satmaps and preset palette
                        const rgb = SurfaceNetsMesher.evalPalette(sat, norm, avgY, field.spec);
                        tempColors.push(rgb.r, rgb.g, rgb.b);

                        // Planar UVs
                        tempUvs.push(avgX / field.spec.cliffWidth + 0.5, avgY / field.spec.cliffHeight + 0.5);
                    } else {
                        cellVertices[cellIdx] = -1;
                    }
                    cellIdx++;
                }
            }
        }

        // 3. Connect dual vertices into quads (2 triangles) across zero-crossing edges
        const indices = [];
        const cellStrideY = resX - 1;
        const cellStrideZ = (resX - 1) * (resY - 1);

        for (let cz = 0; cz < resZ - 1; cz++) {
            for (let cy = 0; cy < resY - 1; cy++) {
                for (let cx = 0; cx < resX - 1; cx++) {
                    const gIdx = cx + cy * strideY + cz * strideZ;
                    const v0 = grid[gIdx];

                    // X-axis edge crossing: between (cx, cy, cz) and (cx+1, cy, cz)
                    if (cx < resX - 1 && cy > 0 && cz > 0) {
                        const vX = grid[gIdx + 1];
                        if ((v0 <= 0 && vX > 0) || (v0 > 0 && vX <= 0)) {
                            const c00 = cellVertices[cx + (cy - 1) * cellStrideY + (cz - 1) * cellStrideZ];
                            const c10 = cellVertices[cx + cy * cellStrideY + (cz - 1) * cellStrideZ];
                            const c11 = cellVertices[cx + cy * cellStrideY + cz * cellStrideZ];
                            const c01 = cellVertices[cx + (cy - 1) * cellStrideY + cz * cellStrideZ];

                            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
                                if (v0 <= 0) {
                                    indices.push(c00, c10, c11, c00, c11, c01);
                                } else {
                                    indices.push(c00, c11, c10, c00, c01, c11);
                                }
                            }
                        }
                    }

                    // Y-axis edge crossing: between (cx, cy, cz) and (cx, cy+1, cz)
                    if (cy < resY - 1 && cx > 0 && cz > 0) {
                        const vY = grid[gIdx + strideY];
                        if ((v0 <= 0 && vY > 0) || (v0 > 0 && vY <= 0)) {
                            const c00 = cellVertices[(cx - 1) + cy * cellStrideY + (cz - 1) * cellStrideZ];
                            const c10 = cellVertices[cx + cy * cellStrideY + (cz - 1) * cellStrideZ];
                            const c11 = cellVertices[cx + cy * cellStrideY + cz * cellStrideZ];
                            const c01 = cellVertices[(cx - 1) + cy * cellStrideY + cz * cellStrideZ];

                            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
                                if (v0 <= 0) {
                                    indices.push(c00, c11, c10, c00, c01, c11);
                                } else {
                                    indices.push(c00, c10, c11, c00, c11, c01);
                                }
                            }
                        }
                    }

                    // Z-axis edge crossing: between (cx, cy, cz) and (cx, cy, cz+1)
                    if (cz < resZ - 1 && cx > 0 && cy > 0) {
                        const vZ = grid[gIdx + strideZ];
                        if ((v0 <= 0 && vZ > 0) || (v0 > 0 && vZ <= 0)) {
                            const c00 = cellVertices[(cx - 1) + (cy - 1) * cellStrideY + cz * cellStrideZ];
                            const c10 = cellVertices[cx + (cy - 1) * cellStrideY + cz * cellStrideZ];
                            const c11 = cellVertices[cx + cy * cellStrideY + cz * cellStrideZ];
                            const c01 = cellVertices[(cx - 1) + cy * cellStrideY + cz * cellStrideZ];

                            if (c00 >= 0 && c10 >= 0 && c11 >= 0 && c01 >= 0) {
                                if (v0 <= 0) {
                                    indices.push(c00, c10, c11, c00, c11, c01);
                                } else {
                                    indices.push(c00, c11, c10, c00, c01, c11);
                                }
                            }
                        }
                    }
                }
            }
        }

        return {
            positions: new Float32Array(tempPositions),
            normals: new Float32Array(tempNormals),
            satmaps: new Float32Array(tempSatmaps),
            colors: new Float32Array(tempColors),
            uvs: new Float32Array(tempUvs),
            indices: new Uint32Array(indices),
            vertexCount: tempPositions.length / 3,
            triangleCount: indices.length / 3,
            overhangCount: overhangVertexCount,
            overhangPercent: tempPositions.length > 0 ? (overhangVertexCount / (tempPositions.length / 3)) * 100 : 0
        };
    }

    /**
     * Synthesizes PBR diffuse base colors from Satmaps (slope, strata, cavity, flow).
     */
    static evalPalette(sat, normal, y, spec = {}) {
        const preset = spec.preset || 'sandstone_canyon';

        let baseColor = [0.72, 0.48, 0.32]; // Sandstone warm terracotta
        let hardBedColor = [0.85, 0.62, 0.45]; // Protruding caprock buff
        let softBedColor = [0.55, 0.32, 0.22]; // Recessed shale dark ochre
        let plateauColor = [0.65, 0.60, 0.42]; // Plateau dust / lichen
        let cavityColor  = [0.22, 0.16, 0.14]; // Desert varnish / shadow

        if (preset === 'dolerite_spires') {
            baseColor     = [0.32, 0.34, 0.36]; // Dark slate dolerite
            hardBedColor  = [0.45, 0.47, 0.50]; // Weathered basalt
            softBedColor  = [0.24, 0.22, 0.20]; // Iron stained crevice
            plateauColor  = [0.38, 0.42, 0.32]; // Alpine moss
            cavityColor   = [0.12, 0.12, 0.14]; // Deep shadow
        } else if (preset === 'coastal_cliff') {
            baseColor     = [0.52, 0.50, 0.46]; // Coastal limestone/chalk
            hardBedColor  = [0.68, 0.66, 0.62]; // Dry upper cliff
            softBedColor  = [0.38, 0.40, 0.38]; // Wet sea-spray rock
            plateauColor  = [0.28, 0.45, 0.24]; // Coastal grass / moss
            cavityColor   = [0.18, 0.22, 0.20]; // Wet tide notch
        } else if (preset === 'rugged_crag') {
            baseColor     = [0.45, 0.46, 0.48]; // Alpine granite
            hardBedColor  = [0.62, 0.64, 0.66]; // Quartz vein
            softBedColor  = [0.30, 0.31, 0.33]; // Shattered gneiss
            plateauColor  = [0.35, 0.44, 0.30]; // Tundra moss
            cavityColor   = [0.15, 0.16, 0.18]; // Frost crack
        } else if (preset === 'monument_butte') {
            baseColor     = [0.82, 0.38, 0.22]; // Vivid Navaho Red
            hardBedColor  = [0.92, 0.52, 0.32]; // Wingate sandstone cap
            softBedColor  = [0.62, 0.24, 0.18]; // Chinle shale
            plateauColor  = [0.75, 0.58, 0.38]; // Red desert sand
            cavityColor   = [0.25, 0.12, 0.10]; // Iron oxide varnish
        }

        // 1. Blend hard bed vs soft bed using Strata Phase & Hardness
        const bedMix = sat.hardness > 0.9 ? (sat.hardness - 0.9) / 0.6 : 0.0;
        let r = softBedColor[0] * (1 - bedMix) + hardBedColor[0] * bedMix;
        let g = softBedColor[1] * (1 - bedMix) + hardBedColor[1] * bedMix;
        let b = softBedColor[2] * (1 - bedMix) + hardBedColor[2] * bedMix;

        // Micro strata band modulation
        const bandMod = 0.88 + 0.24 * Math.sin(sat.strataPhase * Math.PI * 2);
        r *= bandMod;
        g *= bandMod;
        b *= bandMod;

        // 2. Blend Flat Plateau / Grass based on Slope Mask (normal.y > 0.65)
        const flatMask = Math.max(0.0, Math.min(1.0, (normal.y - 0.45) / 0.4));
        r = r * (1 - flatMask) + plateauColor[0] * flatMask;
        g = g * (1 - flatMask) + plateauColor[1] * flatMask;
        b = b * (1 - flatMask) + plateauColor[2] * flatMask;

        // 3. Apply Cavity & Crevice Darkening (Desert Varnish)
        const crevice = Math.pow(sat.cavity, 1.8);
        r = r * (1 - crevice * 0.6) + cavityColor[0] * crevice * 0.6;
        g = g * (1 - crevice * 0.6) + cavityColor[1] * crevice * 0.6;
        b = b * (1 - crevice * 0.6) + cavityColor[2] * crevice * 0.6;

        // 4. Overhang underside damp darkening
        if (sat.isOverhang > 0.5) {
            r *= 0.78;
            g *= 0.78;
            b *= 0.78;
        }

        return {
            r: Math.max(0, Math.min(1, r)),
            g: Math.max(0, Math.min(1, g)),
            b: Math.max(0, Math.min(1, b))
        };
    }

    /**
     * Converts mesh data to Wavefront OBJ format.
     */
    static toOBJ(mesh, name = 'VoxelCliff') {
        let out = `# Voxel Cliff Generator OBJ Export\n# Formation: ${name}\n# Vertices: ${mesh.vertexCount}\n# Triangles: ${mesh.triangleCount}\n# Overhang vertices: ${mesh.overhangCount} (${mesh.overhangPercent.toFixed(1)}%)\n\no ${name}\n`;

        const pos = mesh.positions;
        const norm = mesh.normals;
        const uvs = mesh.uvs;
        const ind = mesh.indices;

        for (let i = 0; i < pos.length; i += 3) {
            out += `v ${pos[i].toFixed(4)} ${pos[i + 1].toFixed(4)} ${pos[i + 2].toFixed(4)}\n`;
        }
        for (let i = 0; i < norm.length; i += 3) {
            out += `vn ${norm[i].toFixed(4)} ${norm[i + 1].toFixed(4)} ${norm[i + 2].toFixed(4)}\n`;
        }
        for (let i = 0; i < uvs.length; i += 2) {
            out += `vt ${uvs[i].toFixed(4)} ${uvs[i + 1].toFixed(4)}\n`;
        }

        out += `s 1\n`;
        for (let i = 0; i < ind.length; i += 3) {
            const i1 = ind[i] + 1;
            const i2 = ind[i + 1] + 1;
            const i3 = ind[i + 2] + 1;
            out += `f ${i1}/${i1}/${i1} ${i2}/${i2}/${i2} ${i3}/${i3}/${i3}\n`;
        }

        return out;
    }

    /**
     * Converts mesh data to Stanford PLY format (including per-vertex RGB colors).
     */
    static toPLY(mesh, name = 'VoxelCliff') {
        const vCount = mesh.vertexCount;
        const fCount = mesh.triangleCount;
        const pos = mesh.positions;
        const norm = mesh.normals;
        const col = mesh.colors;
        const ind = mesh.indices;

        let out = `ply\nformat ascii 1.0\ncomment Procedural Voxel Cliff Export: ${name}\nelement vertex ${vCount}\nproperty float x\nproperty float y\nproperty float z\nproperty float nx\nproperty float ny\nproperty float nz\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face ${fCount}\nproperty list uchar uint vertex_indices\nend_header\n`;

        for (let i = 0; i < vCount; i++) {
            const pIdx = i * 3;
            const x = pos[pIdx].toFixed(4);
            const y = pos[pIdx + 1].toFixed(4);
            const z = pos[pIdx + 2].toFixed(4);
            const nx = norm[pIdx].toFixed(4);
            const ny = norm[pIdx + 1].toFixed(4);
            const nz = norm[pIdx + 2].toFixed(4);
            const r = Math.floor(col[pIdx] * 255);
            const g = Math.floor(col[pIdx + 1] * 255);
            const b = Math.floor(col[pIdx + 2] * 255);
            out += `${x} ${y} ${z} ${nx} ${ny} ${nz} ${r} ${g} ${b}\n`;
        }

        for (let i = 0; i < ind.length; i += 3) {
            out += `3 ${ind[i]} ${ind[i + 1]} ${ind[i + 2]}\n`;
        }

        return out;
    }
}
