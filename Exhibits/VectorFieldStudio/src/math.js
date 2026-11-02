/*====================================================================================================================================
                                                        MATH.JS
====================================================================================================================================*/
// 🧩 Scalar, vector, matrix, camera, and ray-heightfield arithmetic for the field viewport.

export const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (low, high, value) => {
    const t = clamp((value - low) / (high - low || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
};
export const invLerp = (a, b, value) => (value - a) / (b - a || 1e-6);

export const vec3 = {
    create: (x = 0, y = 0, z = 0) => [x, y, z],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    mul: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ],
    length: (a) => Math.hypot(a[0], a[1], a[2]),
    length2: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
    normalize: (a) => {
        const l = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
    },
    lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    copy: (a) => [a[0], a[1], a[2]],
    isFinite: (a) => Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]),
};

export const mat4 = {
    create: () => new Float32Array(16),
    identity(out = new Float32Array(16)) {
        out.fill(0);
        out[0] = out[5] = out[10] = out[15] = 1;
        return out;
    },
    multiply(a, b, out = new Float32Array(16)) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        for (let i = 0; i < 4; i++) {
            const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
            out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
            out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
            out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
            out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        }
        return out;
    },
    perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
        const f = 1 / Math.tan(fovY / 2);
        const nf = 1 / (near - far);
        out.fill(0);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (far + near) * nf;
        out[11] = -1;
        out[14] = 2 * far * near * nf;
        return out;
    },
    lookAt(eye, target, up, out = new Float32Array(16)) {
        const z = vec3.normalize(vec3.sub(eye, target));
        const x = vec3.normalize(vec3.cross(up, z));
        const y = vec3.cross(z, x);
        out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
        out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
        out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
        out[12] = -vec3.dot(x, eye);
        out[13] = -vec3.dot(y, eye);
        out[14] = -vec3.dot(z, eye);
        out[15] = 1;
        return out;
    },
    invert(a, out = new Float32Array(16)) {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;
        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return mat4.identity(out);
        det = 1 / det;
        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    },
    transformPoint(m, p) {
        const x = p[0], y = p[1], z = p[2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
        return [
            (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
            (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
        ];
    },
    transformDirection(m, p) {
        const x = p[0], y = p[1], z = p[2];
        return [
            m[0] * x + m[4] * y + m[8] * z,
            m[1] * x + m[5] * y + m[9] * z,
            m[2] * x + m[6] * y + m[10] * z,
        ];
    },
};

export const camera = {
    eyeFor(target, azimuth, elevation, distance) {
        const ce = Math.cos(elevation);
        return [
            target[0] + distance * ce * Math.sin(azimuth),
            target[1] + distance * Math.sin(elevation),
            target[2] + distance * ce * Math.cos(azimuth),
        ];
    },
    viewProjection(target, azimuth, elevation, distance, fov, aspect, near, far) {
        const eye = camera.eyeFor(target, azimuth, elevation, distance);
        const view = mat4.lookAt(eye, target, [0, 1, 0]);
        const projection = mat4.perspective(fov, aspect, near, far);
        return { eye, view, projection, viewProjection: mat4.multiply(projection, view) };
    },
};

export function screenToRay(viewProjectionInverse, x, y, width, height) {
    const ndcX = (x / width) * 2 - 1;
    const ndcY = 1 - (y / height) * 2;
    const near = mat4.transformPoint(viewProjectionInverse, [ndcX, ndcY, -1]);
    const far = mat4.transformPoint(viewProjectionInverse, [ndcX, ndcY, 1]);
    const direction = vec3.normalize(vec3.sub(far, near));
    return { origin: near, direction };
}

export function projectToScreen(viewProjection, point, width, height) {
    const clip = [
        viewProjection[0] * point[0] + viewProjection[4] * point[1] + viewProjection[8] * point[2] + viewProjection[12],
        viewProjection[1] * point[0] + viewProjection[5] * point[1] + viewProjection[9] * point[2] + viewProjection[13],
        viewProjection[2] * point[0] + viewProjection[6] * point[1] + viewProjection[10] * point[2] + viewProjection[14],
        viewProjection[3] * point[0] + viewProjection[7] * point[1] + viewProjection[11] * point[2] + viewProjection[15],
    ];
    if (clip[3] <= 0) return null;
    return {
        x: (clip[0] / clip[3] * 0.5 + 0.5) * width,
        y: (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * height,
        depth: clip[2] / clip[3],
    };
}

/**
 * March a ray against a heightfield. The height sampler returns world-space elevation in metres.
 * Returns the first surface hit or null when the ray leaves the field bounds.
 */
export function rayHeightfield(origin, direction, heightAt, bounds, maxDistance = 600) {
    let previousT = 0;
    let previousAbove = true;
    const step = 0.35;
    for (let t = step; t < maxDistance; t += step) {
        const x = origin[0] + direction[0] * t;
        const y = origin[1] + direction[1] * t;
        const z = origin[2] + direction[2] * t;
        if (Math.abs(x) > bounds.half || Math.abs(z) > bounds.half) {
            if (y < -20) return null;
            previousT = t;
            previousAbove = y > 0;
            continue;
        }
        const ground = heightAt(x, z);
        const above = y > ground;
        if (previousAbove && !above) {
            let low = previousT;
            let high = t;
            for (let i = 0; i < 18; i++) {
                const mid = (low + high) * 0.5;
                const mx = origin[0] + direction[0] * mid;
                const my = origin[1] + direction[1] * mid;
                const mz = origin[2] + direction[2] * mid;
                if (my > heightAt(mx, mz)) low = mid;
                else high = mid;
            }
            const hitT = (low + high) * 0.5;
            return [origin[0] + direction[0] * hitT, origin[1] + direction[1] * hitT, origin[2] + direction[2] * hitT];
        }
        previousT = t;
        previousAbove = above;
    }
    return null;
}

export function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const number = parseInt(full, 16);
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

export function rgbToHex(rgb) {
    const channel = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
    return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

export function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function rampColor(stops, t) {
    const clamped = clamp(t, 0, 1);
    for (let i = 0; i < stops.length - 1; i++) {
        const low = i / (stops.length - 1);
        const high = (i + 1) / (stops.length - 1);
        if (clamped <= high) return mixRgb(stops[i], stops[i + 1], invLerp(low, high, clamped));
    }
    return stops[stops.length - 1];
}

export function formatNumber(value, digits = 1) {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1000) return value.toFixed(0);
    if (abs >= 100) return value.toFixed(Math.max(0, digits - 1));
    return value.toFixed(digits);
}
