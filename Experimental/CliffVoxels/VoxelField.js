//============================================================================================================================================
//                                                             VOXELFIELD.JS
//============================================================================================================================================
// 📦 Pure procedural 3D Signed Distance Field (SDF) evaluator for geological cliff formations.
// Features: true >90° overhangs, Gaea-style Stacks strata with per-band differential hardness,
// 3D Voronoi columnar & block joints, thermal talus deposition at angle of repose, and gully carving.
// DOM-free: runs identically in Node.js and the Browser.

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export class PRNG {
    constructor(seed = 1337) {
        this.s = (seed | 0) || 1;
    }
    next() {
        let t = (this.s += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) {
        return min + (max - min) * this.next();
    }
}

/**
 * Fast 3D Simplex & Permutation Noise with seeded permutation table.
 */
export class FastNoise3D {
    constructor(seed = 42) {
        this.perm = new Uint8Array(512);
        const prng = new PRNG(seed);
        const source = new Uint8Array(256);
        for (let i = 0; i < 256; i++) source[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(prng.next() * (i + 1));
            const tmp = source[i];
            source[i] = source[j];
            source[j] = tmp;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = source[i & 255];
        }
    }

    // 3D Value / Gradient Noise
    eval(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;

        const fx = x - Math.floor(x);
        const fy = y - Math.floor(y);
        const fz = z - Math.floor(z);

        // Quintic smoothstep
        const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
        const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
        const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

        const A  = this.perm[X] + Y;
        const AA = this.perm[A] + Z;
        const AB = this.perm[A + 1] + Z;
        const B  = this.perm[X + 1] + Y;
        const BA = this.perm[B] + Z;
        const BB = this.perm[B + 1] + Z;

        const grad = (hash, gx, gy, gz) => {
            const h = hash & 15;
            const u = h < 8 ? gx : gy;
            const v = h < 4 ? gy : (h === 12 || h === 14 ? gx : gz);
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        };

        const g000 = grad(this.perm[AA], fx, fy, fz);
        const g100 = grad(this.perm[BA], fx - 1, fy, fz);
        const g010 = grad(this.perm[AB], fx, fy - 1, fz);
        const g110 = grad(this.perm[BB], fx - 1, fy - 1, fz);
        const g001 = grad(this.perm[AA + 1], fx, fy, fz - 1);
        const g101 = grad(this.perm[BA + 1], fx - 1, fy, fz - 1);
        const g011 = grad(this.perm[AB + 1], fx, fy - 1, fz - 1);
        const g111 = grad(this.perm[BB + 1], fx - 1, fy - 1, fz - 1);

        const x1 = g000 + u * (g100 - g000);
        const x2 = g010 + u * (g110 - g010);
        const y1 = x1 + v * (x2 - x1);

        const x3 = g001 + u * (g101 - g001);
        const x4 = g011 + u * (g111 - g011);
        const y2 = x3 + v * (x4 - x3);

        return y1 + w * (y2 - y1);
    }

    // Fractal Brownian Motion
    fBm(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
        let sum = 0;
        let amp = 1.0;
        let freq = 1.0;
        let maxAmp = 0;
        for (let i = 0; i < octaves; i++) {
            sum += this.eval(x * freq, y * freq, z * freq) * amp;
            maxAmp += amp;
            freq *= lacunarity;
            amp *= gain;
        }
        return sum / maxAmp;
    }

    // Ridged Multi-fractal Noise (sharp rock crests and angular ribs)
    ridgedFbm(x, y, z, octaves = 4, lacunarity = 2.0, gain = 0.5) {
        let sum = 0;
        let amp = 1.0;
        let freq = 1.0;
        let maxAmp = 0;
        for (let i = 0; i < octaves; i++) {
            let n = this.eval(x * freq, y * freq, z * freq);
            n = 1.0 - Math.abs(n);
            n = n * n; // sharpen ridges
            sum += n * amp;
            maxAmp += amp;
            freq *= lacunarity;
            amp *= gain;
        }
        return sum / maxAmp;
    }

    // 3D Cellular / Voronoi Noise (returns F1 distance, F2 distance, and cell seed hash)
    cellular(x, y, z) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const zi = Math.floor(z);

        let d1 = 999.0;
        let d2 = 999.0;
        let cellHash = 0;

        for (let cZ = -1; cZ <= 1; cZ++) {
            for (let cY = -1; cY <= 1; cY++) {
                for (let cX = -1; cX <= 1; cX++) {
                    const nx = (xi + cX) & 255;
                    const ny = (yi + cY) & 255;
                    const nz = (zi + cZ) & 255;
                    const h1 = this.perm[(this.perm[(this.perm[nx] + ny) & 255] + nz) & 255];
                    const h2 = this.perm[(h1 + 43) & 255];
                    const h3 = this.perm[(h1 + 89) & 255];

                    const px = xi + cX + (h1 / 255.0);
                    const py = yi + cY + (h2 / 255.0);
                    const pz = zi + cZ + (h3 / 255.0);

                    const dx = px - x;
                    const dy = py - y;
                    const dz = pz - z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist < d1) {
                        d2 = d1;
                        d1 = dist;
                        cellHash = h1;
                    } else if (dist < d2) {
                        d2 = dist;
                    }
                }
            }
        }
        return { f1: d1, f2: d2, edge: d2 - d1, hash: cellHash / 255.0 };
    }
}

/**
 * Basic SDF Primitives and Operations
 */
export const SDFOps = {
    sdBox(px, py, pz, bx, by, bz) {
        const dx = Math.abs(px) - bx;
        const dy = Math.abs(py) - by;
        const dz = Math.abs(pz) - bz;
        const ox = Math.max(dx, 0);
        const oy = Math.max(dy, 0);
        const oz = Math.max(dz, 0);
        const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
        const inside = Math.min(Math.max(dx, Math.max(dy, dz)), 0);
        return outside + inside;
    },

    sdCylinder(px, py, pz, r, h) {
        const dxy = Math.sqrt(px * px + pz * pz) - r;
        const dy = Math.abs(py) - h;
        const ox = Math.max(dxy, 0);
        const oy = Math.max(dy, 0);
        const outside = Math.sqrt(ox * ox + oy * oy);
        const inside = Math.min(Math.max(dxy, dy), 0);
        return outside + inside;
    },

    smin(a, b, k = 0.5) {
        const h = Math.max(k - Math.abs(a - b), 0.0) / k;
        return Math.min(a, b) - h * h * k * (1.0 / 4.0);
    },

    smax(a, b, k = 0.5) {
        const h = Math.max(k - Math.abs(a - b), 0.0) / k;
        return Math.max(a, b) + h * h * k * (1.0 / 4.0);
    }
};

/**
 * Voxel Cliff Field Generator
 * Computes 3D SDF and geological satmaps for arbitrary points in space.
 */
export class CliffField {
    constructor(spec = {}) {
        this.spec = { ...spec };
        this.noise = new FastNoise3D(this.spec.seed || 1337);
        this.macroNoise = new FastNoise3D((this.spec.seed || 1337) + 512);
        this.strataNoise = new FastNoise3D((this.spec.seed || 1337) + 1024);

        // Precompute bedding orientation
        const dipRad = ((this.spec.strataDip || 5) * Math.PI) / 180;
        const strikeRad = ((this.spec.strataStrike || 30) * Math.PI) / 180;
        this.bedNormal = {
            x: Math.sin(dipRad) * Math.cos(strikeRad),
            y: Math.cos(dipRad),
            z: Math.sin(dipRad) * Math.sin(strikeRad)
        };

        // Cache per-band hardness table (256 bands)
        this.bandHardness = new Float32Array(256);
        const prng = new PRNG((this.spec.seed || 1337) + 2048);
        for (let i = 0; i < 256; i++) {
            // Mix of soft shale layers (0.3) and hard sandstone/dolomite caprocks (1.4)
            const raw = prng.next();
            this.bandHardness[i] = 0.4 + 1.1 * (raw * raw);
        }
    }

    /**
     * Evaluates the Signed Distance Function at (x, y, z) up to the specified pipeline stage.
     * Stage 1: Base Landform Mass
     * Stage 2: + Sedimentary Strata (Differential Hardness)
     * Stage 3: + Joints (Columnar / Block Fractures)
     * Stage 4: + Thermal Talus & Gully Carve
     * Stage 5: Full Detail (Same SDF as Stage 4 + satmap ready)
     */
    evaluate(x, y, z, maxStage = 5) {
        const {
            preset = 'sandstone_canyon',
            cliffHeight = 16.0,
            cliffWidth = 24.0,
            cliffDepth = 14.0,
            overhangStrength = 0.35,
            asymmetry = 0.25,
            strataFreq = 0.8,
            strataHardnessVar = 0.7,
            strataUndercut = 0.8,
            jointType = 'columnar',
            jointScale = 0.5,
            jointDepth = 0.6,
            talusHeight = 4.0,
            talusRepose = 34.0,
            gullyDepth = 0.5
        } = this.spec;

        // Base domain centering
        const halfH = cliffHeight * 0.5;
        const halfW = cliffWidth * 0.5;
        const halfD = cliffDepth * 0.5;

        // -------------------------------------------------------------
        // STAGE 1: LANDFORM BASE MASS (True 3D SDF with Overhangs)
        // -------------------------------------------------------------
        let d = 999.0;

        // 3D Domain warping for organic geological mass
        const warpAmp = 1.8;
        const wx = x + warpAmp * this.macroNoise.eval(x * 0.08, y * 0.08, z * 0.08);
        const wy = y + warpAmp * this.macroNoise.eval(x * 0.08 + 11.3, y * 0.08 + 7.1, z * 0.08 + 3.2);
        const wz = z + warpAmp * this.macroNoise.eval(x * 0.08 + 23.7, y * 0.08 + 19.5, z * 0.08 + 41.2);

        // Normalized height [-1, 1] across cliff mass
        const ny = Math.max(-1.0, Math.min(1.0, y / halfH));

        if (preset === 'sandstone_canyon') {
            // Massive escarpment with amphitheater alcove and undercut cliff face
            // Overhang lean: cliff leans forward (negative Z) at mid/high elevations
            const lean = overhangStrength * (1.0 - ny * ny) * 3.5;
            // Base buttress expansion at bottom
            const buttress = Math.max(0, -ny) * 3.0;

            // Primary box core
            const coreBox = SDFOps.sdBox(wx, y - 0.5, wz + lean, halfW - 2.0, halfH, halfD - buttress);

            // Large concave amphitheater cutout on the front face
            const alcoveCyl = SDFOps.sdCylinder(wx + asymmetry * 5.0, y, wz + 4.0, 7.5, halfH + 2.0);

            // Carve alcove with smooth subtraction
            d = SDFOps.smax(coreBox, -alcoveCyl, 3.0);

            // Add ridged cliff face buttresses
            const faceRelief = this.noise.ridgedFbm(wx * 0.12, wy * 0.08, wz * 0.12, 3) * 2.2;
            d -= faceRelief;

        } else if (preset === 'dolerite_spires') {
            // Cluster of vertical jagged needle spires with steep chasm cuts
            const spire1 = SDFOps.sdCylinder(wx + 3.5, y, wz + 1.0, 3.2 * (1.2 - ny * 0.5), halfH);
            const spire2 = SDFOps.sdCylinder(wx - 4.0, y + 1.5, wz - 1.5, 2.8 * (1.1 - ny * 0.6), halfH + 1.5);
            const spire3 = SDFOps.sdCylinder(wx + 0.5, y - 1.0, wz - 3.5, 3.5 * (1.3 - ny * 0.4), halfH - 1.0);
            const spire4 = SDFOps.sdCylinder(wx - 1.5, y + 2.5, wz + 3.0, 2.2 * (1.0 - ny * 0.7), halfH + 2.5);

            d = SDFOps.smin(spire1, spire2, 2.0);
            d = SDFOps.smin(d, spire3, 2.5);
            d = SDFOps.smin(d, spire4, 1.8);

            // Overhang flaring near spire tips
            const flare = Math.max(0, ny - 0.2) * overhangStrength * 2.5;
            d -= flare;

            // Angular spire faceting
            const facet = this.noise.ridgedFbm(wx * 0.15, wy * 0.25, wz * 0.15, 3) * 1.8;
            d -= facet;

        } else if (preset === 'coastal_cliff') {
            // Towering sea cliff with massive wave-cut notch at sea level (Y ~ -halfH * 0.6)
            // Creating dramatic >90° overhangs (`\ /` profile) where upper cliff hangs out over water
            const seaLevelY = -halfH * 0.5;
            const notchDist = Math.abs(y - seaLevelY);
            // Wave notch cuts deeply into front wall (Z > 0)
            const waveCut = Math.max(0, 3.5 - notchDist * 0.9) * (1.0 + overhangStrength * 1.5);

            // Main cliff slab
            const slab = SDFOps.sdBox(wx, y, wz, halfW, halfH, halfD - 2.0);

            // Separate sea stack island offshore
            const stack = SDFOps.sdCylinder(wx - halfW * 0.65, y, wz - halfD * 0.9, 2.8, halfH * 0.85);

            d = SDFOps.smin(slab, stack, 1.5);

            // Apply wave cut undercut on seaward exposure
            if (wz > -2.0) {
                d += waveCut * Math.max(0, (wz + 2.0) / halfD);
            }

            // Headland ruggedness
            const oceanErosion = this.noise.fBm(wx * 0.1, wy * 0.15, wz * 0.1, 4) * 2.0;
            d -= oceanErosion;

        } else if (preset === 'rugged_crag') {
            // Asymmetric alpine mountain crag with steep rock slabs and arêtes
            const cragBox = SDFOps.sdBox(wx, y, wz, halfW * (1.0 - ny * 0.4), halfH, halfD * (1.0 - ny * 0.3));
            const ridgeCut1 = (wx * 0.7 + wy * 0.5 + wz * 0.5) - 6.0;
            const ridgeCut2 = (-wx * 0.6 + wy * 0.6 - wz * 0.5) - 5.0;

            d = SDFOps.smax(cragBox, ridgeCut1, 2.0);
            d = SDFOps.smax(d, ridgeCut2, 2.0);

            const ruggedFbm = this.noise.ridgedFbm(wx * 0.14, wy * 0.14, wz * 0.14, 4) * 2.5;
            d -= ruggedFbm;

        } else {
            // monument_butte: isolated sandstone mesa with caprock and stepped cliff tiers
            const butteTier1 = SDFOps.sdBox(wx, y - 2.0, wz, halfW * 0.7, halfH * 0.8, halfD * 0.7);
            const butteCap = SDFOps.sdBox(wx, y - halfH + 1.0, wz, halfW * 0.8, 1.2, halfD * 0.8);
            d = SDFOps.smin(butteTier1, butteCap, 1.0);

            // Sheer vertical walls
            const wallRelief = this.noise.ridgedFbm(wx * 0.1, wy * 0.08, wz * 0.1, 3) * 1.5;
            d -= wallRelief;
        }

        // Return early if only stage 1 is requested
        if (maxStage <= 1) return d;

        // -------------------------------------------------------------
        // STAGE 2: SEDIMENTARY STRATA (Gaea Stacks Differential Hardness)
        // -------------------------------------------------------------
        // Strata coordinate along dipping bed normal
        const bedCoord = x * this.bedNormal.x + y * this.bedNormal.y + z * this.bedNormal.z;
        const strataWarp = this.strataNoise.eval(x * 0.1, y * 0.1, z * 0.1) * 0.4;
        const effectiveCoord = (bedCoord + strataWarp) * strataFreq;

        const bandIdx = (Math.floor(effectiveCoord) & 255);
        const bandPhase = effectiveCoord - Math.floor(effectiveCoord); // 0 to 1 inside band
        const hardness = this.bandHardness[bandIdx];

        // Soft layers (hardness < 0.8) erode inward; hard layers (hardness > 1.0) protrude outward
        // Creates stepped rock shelves, alcoves, and horizontal ledge overhangs
        const differentialDisplacement = (1.0 - hardness) * strataUndercut * strataHardnessVar;
        // Shape ledge profile: sharp protrusion at bottom/top of hard bed, recessed soft bed
        const bedProfile = Math.sin(bandPhase * Math.PI) * differentialDisplacement;
        d += bedProfile;

        // Fine sedimentary micro-laminae
        const laminae = Math.sin(effectiveCoord * 6.28318) * 0.12 * strataHardnessVar;
        d += laminae;

        if (maxStage <= 2) return d;

        // -------------------------------------------------------------
        // STAGE 3: ROCK JOINTS (3D Columnar & Block Fractures)
        // -------------------------------------------------------------
        if (jointType === 'columnar') {
            // Hexagonal / polygonal columnar joints (dolerite / basalt towers)
            const cell = this.noise.cellular(x * jointScale, 0.0, z * jointScale);
            // Sharp V-groove cuts along Voronoi cell boundaries
            const jointGroove = Math.max(0.0, 1.0 - cell.edge * 3.5) * jointDepth;
            // Cross-fracture breaks along height
            const crossJoint = Math.sin(y * 1.5 + cell.hash * 10.0) * 0.15 * jointDepth;
            d += jointGroove + crossJoint;
        } else {
            // Block joint sets (orthogonal sedimentary joint planes)
            const jx = Math.sin(x * jointScale * 1.5) * Math.sin(z * jointScale * 1.5);
            const blockGroove = Math.pow(Math.abs(jx), 4.0) * jointDepth * 0.8;
            d += blockGroove;
        }

        if (maxStage <= 3) return d;

        // -------------------------------------------------------------
        // STAGE 4 & 5: THERMAL TALUS & GULLY CARVE
        // -------------------------------------------------------------
        // Talus deposition at cliff base: accumulation ramp at angle of repose ~35°
        const talusBaseY = -halfH;
        const heightAboveBase = y - talusBaseY;
        if (heightAboveBase < talusHeight && heightAboveBase > -2.0) {
            const talusFactor = Math.max(0.0, 1.0 - heightAboveBase / talusHeight);
            // Talus fills in the base, pushing the SDF outward
            const talusSlope = talusFactor * talusFactor * 2.8;
            // Talus debris roughness (boulders and scree)
            const screeNoise = this.noise.fBm(x * 0.8, y * 0.8, z * 0.8, 3) * 0.35 * talusFactor;
            d -= (talusSlope + screeNoise);
        }

        // Gully carving: vertical drainage chutes running down the cliff face
        const gullyFlow = this.noise.ridgedFbm(x * 0.25, y * 0.06, z * 0.25, 3);
        const crownMask = Math.max(0.0, (y + halfH * 0.3) / halfH); // stronger near crown
        const gullyCarve = gullyFlow * gullyDepth * crownMask * 0.7;
        d += gullyCarve;

        return d;
    }

    /**
     * Calculates analytical SDF Gradient Normal at (x, y, z).
     */
    normal(x, y, z, eps = 0.08, stage = 5) {
        const dx = this.evaluate(x + eps, y, z, stage) - this.evaluate(x - eps, y, z, stage);
        const dy = this.evaluate(x, y + eps, z, stage) - this.evaluate(x - eps, y, z, stage);
        const dz = this.evaluate(x, y, z + eps, stage) - this.evaluate(x, y, z - eps, stage);
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        return { x: dx / len, y: dy / len, z: dz / len };
    }

    /**
     * Computes the 4 Satmap topological masks for a surface vertex at position P with normal N:
     * - slope: 0 (flat floor/plateau) to 1 (vertical cliff) to >1 (overhanging `\ /`)
     * - strata: normalized phase & band index [0, 1]
     * - cavity: ambient crevice occlusion & undercut depth [0, 1]
     * - flow: drainage / gully concentration [0, 1]
     */
    getSatmap(x, y, z, normal, stage = 5) {
        // 1. Slope Mask: based on normal Y component
        // Overhangs have normal.y < 0; vertical walls have normal.y ~ 0; flat ground normal.y = 1
        const slope = Math.max(0.0, Math.min(1.0, 1.0 - normal.y));
        const isOverhang = normal.y < -0.05 ? 1.0 : 0.0;

        // 2. Strata Mask: sedimentary bed phase
        const bedCoord = x * this.bedNormal.x + y * this.bedNormal.y + z * this.bedNormal.z;
        const strataWarp = this.strataNoise.eval(x * 0.1, y * 0.1, z * 0.1) * 0.4;
        const effectiveCoord = (bedCoord + strataWarp) * (this.spec.strataFreq || 0.8);
        const strataPhase = effectiveCoord - Math.floor(effectiveCoord);
        const bandIdx = (Math.floor(effectiveCoord) & 255);
        const hardness = this.bandHardness[bandIdx];

        // 3. Cavity Mask (Estimated via step distance sampling along normal)
        const sampleDist = 0.35;
        const valAbove = this.evaluate(x + normal.x * sampleDist, y + normal.y * sampleDist, z + normal.z * sampleDist, stage);
        const valBelow = this.evaluate(x - normal.x * sampleDist, y - normal.y * sampleDist, z - normal.z * sampleDist, stage);
        // Concave crevices have lower valAbove
        const curvature = (valAbove + valBelow) / (sampleDist * sampleDist);
        const cavity = Math.max(0.0, Math.min(1.0, 0.5 - curvature * 0.25));

        // 4. Flow Mask: hydraulic drainage accumulation
        const gullySample = this.noise.ridgedFbm(x * 0.25, y * 0.06, z * 0.25, 2);
        const flow = Math.max(0.0, Math.min(1.0, gullySample));

        return {
            slope,
            isOverhang,
            strataPhase,
            hardness,
            cavity,
            flow
        };
    }
}
