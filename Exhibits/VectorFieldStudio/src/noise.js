/*====================================================================================================================================
                                                        NOISE.JS
====================================================================================================================================*/
// 🧩 Tileable 3D value-noise volume shared by the GPU field and the CPU analysis sampler.

const FADE = (t) => t * t * (3 - 2 * t);
const WRAP = (value, period) => ((value % period) + period) % period;

function hashLattice(x, y, z, seed) {
    let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function valueNoise(x, y, z, period, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = FADE(x - xi);
    const yf = FADE(y - yi);
    const zf = FADE(z - zi);
    const x0 = WRAP(xi, period), x1 = WRAP(xi + 1, period);
    const y0 = WRAP(yi, period), y1 = WRAP(yi + 1, period);
    const z0 = WRAP(zi, period), z1 = WRAP(zi + 1, period);
    const n000 = hashLattice(x0, y0, z0, seed);
    const n100 = hashLattice(x1, y0, z0, seed);
    const n010 = hashLattice(x0, y1, z0, seed);
    const n110 = hashLattice(x1, y1, z0, seed);
    const n001 = hashLattice(x0, y0, z1, seed);
    const n101 = hashLattice(x1, y0, z1, seed);
    const n011 = hashLattice(x0, y1, z1, seed);
    const n111 = hashLattice(x1, y1, z1, seed);
    const nx00 = n000 + (n100 - n000) * xf;
    const nx10 = n010 + (n110 - n010) * xf;
    const nx01 = n001 + (n101 - n001) * xf;
    const nx11 = n011 + (n111 - n011) * xf;
    const nxy0 = nx00 + (nx10 - nx00) * yf;
    const nxy1 = nx01 + (nx11 - nx01) * yf;
    return nxy0 + (nxy1 - nxy0) * zf;
}

/**
 * Build a 64³ RGBA8 noise volume. Each channel is an independent tileable value-noise field at a
 * different lattice period, so the RGB triple behaves as a smooth vector potential.
 */
export function createNoiseVolume(size = 64) {
    const periods = [4, 8, 16, 32];
    const seeds = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];
    const data = new Uint8Array(size * size * size * 4);
    let index = 0;
    for (let z = 0; z < size; z++) {
        const w = z / size;
        for (let y = 0; y < size; y++) {
            const v = y / size;
            for (let x = 0; x < size; x++) {
                const u = x / size;
                data[index++] = Math.round(valueNoise(u * periods[0], v * periods[0], w * periods[0], periods[0], seeds[0]) * 255);
                data[index++] = Math.round(valueNoise(u * periods[1], v * periods[1], w * periods[1], periods[1], seeds[1]) * 255);
                data[index++] = Math.round(valueNoise(u * periods[2], v * periods[2], w * periods[2], periods[2], seeds[2]) * 255);
                data[index++] = Math.round(valueNoise(u * periods[3], v * periods[3], w * periods[3], periods[3], seeds[3]) * 255);
            }
        }
    }

    const sampleChannel = (x, y, z, channel) => {
        const sizeMinus = size - 1;
        const fx = WRAP(x, 1) * sizeMinus;
        const fy = WRAP(y, 1) * sizeMinus;
        const fz = WRAP(z, 1) * sizeMinus;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
        const x1 = Math.min(x0 + 1, sizeMinus), y1 = Math.min(y0 + 1, sizeMinus), z1 = Math.min(z0 + 1, sizeMinus);
        const tx = fx - x0, ty = fy - y0, tz = fz - z0;
        const stride = size * size;
        const at = (xx, yy, zz) => data[(zz * stride + yy * size + xx) * 4 + channel] / 255;
        const c00 = at(x0, y0, z0) + (at(x1, y0, z0) - at(x0, y0, z0)) * tx;
        const c10 = at(x0, y1, z0) + (at(x1, y1, z0) - at(x0, y1, z0)) * tx;
        const c01 = at(x0, y0, z1) + (at(x1, y0, z1) - at(x0, y0, z1)) * tx;
        const c11 = at(x0, y1, z1) + (at(x1, y1, z1) - at(x0, y1, z1)) * tx;
        const c0 = c00 + (c10 - c00) * ty;
        const c1 = c01 + (c11 - c01) * ty;
        return c0 + (c1 - c0) * tz;
    };

    return {
        size,
        data,
        sample(x, y, z) {
            return [sampleChannel(x, y, z, 0), sampleChannel(x, y, z, 1), sampleChannel(x, y, z, 2)];
        },
        sampleChannel,
    };
}

/**
 * Curl of the RGB potential sampled from the noise volume. The finite-difference epsilon is in
 * texture space; the 0.02 factor normalises the derivative to roughly unit magnitude.
 */
export function curlNoise(volume, x, y, z, epsilon = 0.012) {
    const px1 = volume.sample(x + epsilon, y, z);
    const px0 = volume.sample(x - epsilon, y, z);
    const py1 = volume.sample(x, y + epsilon, z);
    const py0 = volume.sample(x, y - epsilon, z);
    const pz1 = volume.sample(x, y, z + epsilon);
    const pz0 = volume.sample(x, y, z - epsilon);
    const cx = (py1[2] - py0[2]) - (pz1[1] - pz0[1]);
    const cy = (pz1[0] - pz0[0]) - (px1[2] - px0[2]);
    const cz = (px1[1] - px0[1]) - (py1[0] - py0[0]);
    const scale = 0.02 / (2 * epsilon);
    return [cx * scale, cy * scale, cz * scale];
}
