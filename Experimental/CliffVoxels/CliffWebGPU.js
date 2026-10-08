//============================================================================================================================================
//                                                             CLIFFWEBGPU.JS
//============================================================================================================================================
// 📦 Native WebGPU & WGSL Real-time Procedural Voxel SDF Cliff Raymarcher and Surface Renderer.
// Evaluates true 3D Signed Distance Fields with acute >90° overhangs directly on GPU compute/fragment pipelines.

export const CliffWGSL = `
struct Uniforms {
    cameraPos: vec3f,
    fov: f32,
    cameraTarget: vec3f,
    time: f32,
    resolution: vec2f,
    lightDir: vec3f,
    stage: u32,
    renderMode: u32,       // 0=Composite, 1=Slope, 2=Strata, 3=Cavity, 4=Flow, 5=Steps, 6=Slice
    preset: u32,           // 0=Sandstone, 1=Dolerite, 2=Coastal, 3=Crag, 4=Monument
    sliceAxis: u32,        // 0=X, 1=Y, 2=Z
    slicePos: f32,
    overhangStrength: f32,
    cliffHeight: f32,
    cliffWidth: f32,
    cliffDepth: f32,
    asymmetry: f32,
    strataFreq: f32,
    strataDip: f32,
    strataUndercut: f32,
    strataHardnessVar: f32,
    jointType: u32,        // 0=Columnar, 1=Block
    jointScale: f32,
    jointDepth: f32,
    talusHeight: f32,
    talusRepose: f32,
    gullyDepth: f32,
    seed: f32,
    exposure: f32,
    softShadows: f32
};

@group(0) @binding(0) var<uniform> u: Uniforms;

// --- FAST 3D HASH & PROCEDURAL NOISE IN WGSL ---
fn hash3(p: vec3f) -> vec3f {
    var q = vec3f(
        dot(p, vec3f(127.1, 311.7, 74.7)),
        dot(p, vec3f(269.5, 183.3, 246.1)),
        dot(p, vec3f(113.5, 271.9, 124.6))
    );
    return fract(sin(q) * (43758.5453 + u.seed * 0.1));
}

fn hash1(n: f32) -> f32 {
    return fract(sin(n + u.seed) * 43758.5453123);
}

fn noise3(p: vec3f) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u_smooth = f * f * (3.0 - 2.0 * f);

    let n000 = dot(hash3(i + vec3f(0.0, 0.0, 0.0)) - 0.5, f - vec3f(0.0, 0.0, 0.0));
    let n100 = dot(hash3(i + vec3f(1.0, 0.0, 0.0)) - 0.5, f - vec3f(1.0, 0.0, 0.0));
    let n010 = dot(hash3(i + vec3f(0.0, 1.0, 0.0)) - 0.5, f - vec3f(0.0, 1.0, 0.0));
    let n110 = dot(hash3(i + vec3f(1.0, 1.0, 0.0)) - 0.5, f - vec3f(1.0, 1.0, 0.0));
    let n001 = dot(hash3(i + vec3f(0.0, 0.0, 1.0)) - 0.5, f - vec3f(0.0, 0.0, 1.0));
    let n101 = dot(hash3(i + vec3f(1.0, 0.0, 1.0)) - 0.5, f - vec3f(1.0, 0.0, 1.0));
    let n011 = dot(hash3(i + vec3f(0.0, 1.0, 1.0)) - 0.5, f - vec3f(0.0, 1.0, 1.0));
    let n111 = dot(hash3(i + vec3f(1.0, 1.0, 1.0)) - 0.5, f - vec3f(1.0, 1.0, 1.0));

    let nx0 = mix(n000, n100, u_smooth.x);
    let nx1 = mix(n010, n110, u_smooth.x);
    let nxy0 = mix(nx0, nx1, u_smooth.y);

    let nx2 = mix(n001, n101, u_smooth.x);
    let nx3 = mix(n011, n111, u_smooth.x);
    let nxy1 = mix(nx2, nx3, u_smooth.y);

    return mix(nxy0, nxy1, u_smooth.z) * 1.5;
}

fn fbm3(p: vec3f, octaves: i32) -> f32 {
    var sum = 0.0;
    var amp = 1.0;
    var freq = 1.0;
    var maxAmp = 0.0;
    var q = p;
    for (var i = 0; i < octaves; i = i + 1) {
        sum += noise3(q * freq) * amp;
        maxAmp += amp;
        freq *= 2.05;
        amp *= 0.5;
    }
    return sum / maxAmp;
}

fn ridgedFbm(p: vec3f, octaves: i32) -> f32 {
    var sum = 0.0;
    var amp = 1.0;
    var freq = 1.0;
    var maxAmp = 0.0;
    var q = p;
    for (var i = 0; i < octaves; i = i + 1) {
        var n = noise3(q * freq);
        n = 1.0 - abs(n);
        n = n * n;
        sum += n * amp;
        maxAmp += amp;
        freq *= 2.02;
        amp *= 0.5;
    }
    return sum / maxAmp;
}

// 2D/3D Cellular / Voronoi for Columnar Dolerite Jointing
fn voronoi2D(p: vec2f) -> vec2f {
    let pi = floor(p);
    let pf = fract(p);
    var d1 = 8.0;
    var d2 = 8.0;

    for (var j = -1; j <= 1; j = j + 1) {
        for (var i = -1; i <= 1; i = i + 1) {
            let g = vec2f(f32(i), f32(j));
            let o = fract(sin(vec2f(dot(pi + g, vec2f(127.1, 311.7)), dot(pi + g, vec2f(269.5, 183.3)))) * 43758.5453);
            let delta = g + o - pf;
            let d = length(delta);
            if (d < d1) {
                d2 = d1;
                d1 = d;
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    return vec2f(d1, d2 - d1); // d1 = center distance, d2-d1 = edge distance
}

// --- BASIC SDF PRIMITIVES & OPERATORS ---
fn sdBox(p: vec3f, b: vec3f) -> f32 {
    let d = abs(p) - b;
    return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

fn sdCylinder(p: vec3f, r: f32, h: f32) -> f32 {
    let d = vec2f(length(p.xz) - r, abs(p.y) - h);
    return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn smax(a: f32, b: f32, k: f32) -> f32 {
    let h = max(k - abs(a - b), 0.0) / k;
    return max(a, b) + h * h * k * 0.25;
}

// --- FULL PROCEDURAL VOXEL CLIFF SIGNED DISTANCE FIELD ---
fn mapCliff(pos: vec3f) -> f32 {
    let halfH = u.cliffHeight * 0.5;
    let halfW = u.cliffWidth * 0.5;
    let halfD = u.cliffDepth * 0.5;

    // Organic Domain Warping
    let warpAmp = 1.6;
    let wx = pos.x + warpAmp * noise3(pos * 0.08);
    let wy = pos.y + warpAmp * noise3(pos * 0.08 + vec3f(11.3, 7.1, 3.2));
    let wz = pos.z + warpAmp * noise3(pos * 0.08 + vec3f(23.7, 19.5, 41.2));
    let warpedP = vec3f(wx, wy, wz);

    let ny = clamp(pos.y / halfH, -1.0, 1.0);
    var d = 999.0;

    // -------------------------------------------------------------
    // STAGE 1: LANDFORM BASE MASS (Non-heightfield 3D geometry)
    // -------------------------------------------------------------
    if (u.preset == 0u) {
        // Sandstone Canyon (Escarpment, Amphitheatre, Overhang Lean)
        let lean = u.overhangStrength * (1.0 - ny * ny) * 3.5;
        let buttress = max(0.0, -ny) * 2.8;
        let coreBox = sdBox(vec3f(wx, pos.y - 0.5, wz + lean), vec3f(halfW - 2.0, halfH, halfD - buttress));
        let alcove = sdCylinder(vec3f(wx + u.asymmetry * 5.0, pos.y, wz + 4.0), 7.5, halfH + 2.0);
        d = smax(coreBox, -alcove, 3.0);
        let faceRelief = ridgedFbm(warpedP * 0.12, 3) * 2.0;
        d -= faceRelief;

    } else if (u.preset == 1u) {
        // Dolerite Spires (Clustered vertical needle pinnacles)
        let s1 = sdCylinder(vec3f(wx + 3.5, pos.y, wz + 1.0), 3.2 * (1.2 - ny * 0.5), halfH);
        let s2 = sdCylinder(vec3f(wx - 4.0, pos.y + 1.5, wz - 1.5), 2.8 * (1.1 - ny * 0.6), halfH + 1.5);
        let s3 = sdCylinder(vec3f(wx + 0.5, pos.y - 1.0, wz - 3.5), 3.5 * (1.3 - ny * 0.4), halfH - 1.0);
        let s4 = sdCylinder(vec3f(wx - 1.5, pos.y + 2.5, wz + 3.0), 2.2 * (1.0 - ny * 0.7), halfH + 2.5);

        d = smin(s1, s2, 2.0);
        d = smin(d, s3, 2.5);
        d = smin(d, s4, 1.8);

        let flare = max(0.0, ny - 0.2) * u.overhangStrength * 2.5;
        d -= flare;
        let facet = ridgedFbm(vec3f(wx * 0.15, wy * 0.25, wz * 0.15), 3) * 1.8;
        d -= facet;

    } else if (u.preset == 2u) {
        // Coastal Sea Cliff (>90° Wave-cut Notch Overhang & Sea Stack)
        let seaLevelY = -halfH * 0.5;
        let notchDist = abs(pos.y - seaLevelY);
        let waveCut = max(0.0, 3.8 - notchDist * 0.9) * (1.0 + u.overhangStrength * 1.8);

        let slab = sdBox(warpedP, vec3f(halfW, halfH, halfD - 2.0));
        let stack = sdCylinder(vec3f(wx - halfW * 0.65, pos.y, wz - halfD * 0.9), 2.8, halfH * 0.85);
        d = smin(slab, stack, 1.5);

        if (wz > -2.0) {
            d += waveCut * max(0.0, (wz + 2.0) / halfD);
        }
        let oceanErosion = fbm3(warpedP * 0.12, 3) * 2.0;
        d -= oceanErosion;

    } else if (u.preset == 3u) {
        // Alpine Rugged Crag (Asymmetric sharp arêtes)
        let cragBox = sdBox(warpedP, vec3f(halfW * (1.0 - ny * 0.4), halfH, halfD * (1.0 - ny * 0.3)));
        let cut1 = (wx * 0.7 + wy * 0.5 + wz * 0.5) - 6.0;
        let cut2 = (-wx * 0.6 + wy * 0.6 - wz * 0.5) - 5.0;
        d = smax(cragBox, cut1, 2.0);
        d = smax(d, cut2, 2.0);
        d -= ridgedFbm(warpedP * 0.14, 3) * 2.5;

    } else {
        // Monument Butte & Mesa (Stepped sandstone tiers & caprock)
        let tier = sdBox(vec3f(wx, pos.y - 2.0, wz), vec3f(halfW * 0.7, halfH * 0.8, halfD * 0.7));
        let cap = sdBox(vec3f(wx, pos.y - halfH + 1.0, wz), vec3f(halfW * 0.8, 1.2, halfD * 0.8));
        d = smin(tier, cap, 1.0);
        d -= ridgedFbm(warpedP * 0.1, 3) * 1.5;
    }

    if (u.stage <= 1u) { return d; }

    // -------------------------------------------------------------
    // STAGE 2: SEDIMENTARY STRATA (Gaea Stacks Differential Hardness)
    // -------------------------------------------------------------
    let dipRad = (u.strataDip * 3.14159) / 180.0;
    let bedNormal = vec3f(sin(dipRad), cos(dipRad), 0.0);
    let bedCoord = dot(pos, bedNormal);
    let strataWarp = noise3(pos * 0.1) * 0.4;
    let effCoord = (bedCoord + strataWarp) * u.strataFreq;

    let bandIdx = floor(effCoord);
    let bandPhase = effCoord - bandIdx;
    let hardness = 0.4 + 1.1 * pow(hash1(bandIdx * 17.3), 2.0);

    let diffDisplace = (1.0 - hardness) * u.strataUndercut * u.strataHardnessVar;
    let bedProfile = sin(bandPhase * 3.14159) * diffDisplace;
    d += bedProfile;
    d += sin(effCoord * 6.283) * 0.12 * u.strataHardnessVar;

    if (u.stage <= 2u) { return d; }

    // -------------------------------------------------------------
    // STAGE 3: ROCK JOINTS (Voronoi Columnar & Block Fractures)
    // -------------------------------------------------------------
    if (u.jointType == 0u) {
        // Columnar Voronoi jointing
        let v = voronoi2D(pos.xz * u.jointScale);
        let jointGroove = max(0.0, 1.0 - v.y * 3.5) * u.jointDepth;
        let cross = sin(pos.y * 1.5 + v.x * 10.0) * 0.15 * u.jointDepth;
        d += jointGroove + cross;
    } else {
        // Block fracture set
        let jx = sin(pos.x * u.jointScale * 1.5) * sin(pos.z * u.jointScale * 1.5);
        let blockGroove = pow(abs(jx), 4.0) * u.jointDepth * 0.8;
        d += blockGroove;
    }

    if (u.stage <= 3u) { return d; }

    // -------------------------------------------------------------
    // STAGE 4 & 5: THERMAL TALUS & GULLY CARVE
    // -------------------------------------------------------------
    let talusBaseY = -halfH;
    let heightAboveBase = pos.y - talusBaseY;
    if (heightAboveBase < u.talusHeight && heightAboveBase > -2.0) {
        let talusFactor = max(0.0, 1.0 - heightAboveBase / u.talusHeight);
        let talusSlope = talusFactor * talusFactor * 2.8;
        let scree = fbm3(pos * 0.8, 2) * 0.35 * talusFactor;
        d -= (talusSlope + scree);
    }

    let gullyFlow = ridgedFbm(vec3f(pos.x * 0.25, pos.y * 0.06, pos.z * 0.25), 2);
    let crownMask = max(0.0, (pos.y + halfH * 0.3) / halfH);
    d += gullyFlow * u.gullyDepth * crownMask * 0.7;

    return d;
}

// Analytical SDF Normal Calculation
fn calcNormal(p: vec3f) -> vec3f {
    let eps = 0.04;
    let n = vec3f(
        mapCliff(p + vec3f(eps, 0.0, 0.0)) - mapCliff(p - vec3f(eps, 0.0, 0.0)),
        mapCliff(p + vec3f(0.0, eps, 0.0)) - mapCliff(p - vec3f(0.0, eps, 0.0)),
        mapCliff(p + vec3f(0.0, 0.0, eps)) - mapCliff(p - vec3f(0.0, 0.0, eps))
    );
    return normalize(n);
}

// Soft Shadow Raymarching
fn calcSoftShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32, k: f32) -> f32 {
    var res = 1.0;
    var t = mint;
    for (var i = 0; i < 32; i = i + 1) {
        let h = mapCliff(ro + rd * t);
        if (h < 0.002) {
            return 0.0;
        }
        res = min(res, k * h / t);
        t += clamp(h, 0.05, 0.8);
        if (t >= maxt) {
            break;
        }
    }
    return clamp(res, 0.0, 1.0);
}

// Ambient Occlusion
fn calcAO(p: vec3f, n: vec3f) -> f32 {
    var occ = 0.0;
    var sca = 1.0;
    for (var i = 1; i <= 5; i = i + 1) {
        let hr = 0.08 * f32(i);
        let d = mapCliff(p + n * hr);
        occ += (hr - d) * sca;
        sca *= 0.75;
    }
    return clamp(1.0 - 1.5 * occ, 0.0, 1.0);
}

// Satmap Color Evaluation
fn evalSatmapColor(pos: vec3f, normal: vec3f) -> vec3f {
    var baseCol = vec3f(0.72, 0.48, 0.32); // Sandstone Terracotta
    var hardCol = vec3f(0.85, 0.62, 0.45);
    var softCol = vec3f(0.55, 0.32, 0.22);
    var grassCol = vec3f(0.65, 0.60, 0.42);
    var cavCol  = vec3f(0.22, 0.16, 0.14);

    if (u.preset == 1u) {
        // Dolerite
        baseCol = vec3f(0.32, 0.34, 0.36);
        hardCol = vec3f(0.45, 0.47, 0.50);
        softCol = vec3f(0.24, 0.22, 0.20);
        grassCol = vec3f(0.38, 0.42, 0.32);
        cavCol  = vec3f(0.12, 0.12, 0.14);
    } else if (u.preset == 2u) {
        // Coastal Chalk/Limestone
        baseCol = vec3f(0.52, 0.50, 0.46);
        hardCol = vec3f(0.68, 0.66, 0.62);
        softCol = vec3f(0.38, 0.40, 0.38);
        grassCol = vec3f(0.28, 0.45, 0.24);
        cavCol  = vec3f(0.18, 0.22, 0.20);
    } else if (u.preset == 3u) {
        // Alpine Crag
        baseCol = vec3f(0.45, 0.46, 0.48);
        hardCol = vec3f(0.62, 0.64, 0.66);
        softCol = vec3f(0.30, 0.31, 0.33);
        grassCol = vec3f(0.35, 0.44, 0.30);
        cavCol  = vec3f(0.15, 0.16, 0.18);
    } else if (u.preset == 4u) {
        // Monument Red
        baseCol = vec3f(0.82, 0.38, 0.22);
        hardCol = vec3f(0.92, 0.52, 0.32);
        softCol = vec3f(0.62, 0.24, 0.18);
        grassCol = vec3f(0.75, 0.58, 0.38);
        cavCol  = vec3f(0.25, 0.12, 0.10);
    }

    let dipRad = (u.strataDip * 3.14159) / 180.0;
    let bedCoord = dot(pos, vec3f(sin(dipRad), cos(dipRad), 0.0));
    let effCoord = bedCoord * u.strataFreq;
    let bandPhase = fract(effCoord);
    let bandIdx = floor(effCoord);
    let hardness = 0.4 + 1.1 * pow(hash1(bandIdx * 17.3), 2.0);

    let bedMix = clamp((hardness - 0.9) / 0.6, 0.0, 1.0);
    var col = mix(softCol, hardCol, bedMix);
    col *= 0.88 + 0.24 * sin(bandPhase * 6.283);

    // Plateau blend
    let flatMask = clamp((normal.y - 0.45) / 0.4, 0.0, 1.0);
    col = mix(col, grassCol, flatMask);

    // Cavity crevice darkening
    let ao = calcAO(pos, normal);
    col = mix(cavCol, col, ao);

    // Acute Overhang dampness
    if (normal.y < -0.05) {
        col *= 0.78;
    }

    return col;
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen quad from single triangle
    let x = f32(i32(vertexIndex & 1u) * 4 - 1);
    let y = f32(i32(vertexIndex & 2u) * 2 - 1);
    out.position = vec4f(x, y, 0.0, 1.0);
    out.uv = vec2f(x, y);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
    let aspect = u.resolution.x / u.resolution.y;
    let p = in.uv * vec2f(aspect, 1.0);

    // Camera ray setup
    let ro = u.cameraPos;
    let ta = u.cameraTarget;
    let ww = normalize(ta - ro);
    let uu = normalize(cross(ww, vec3f(0.0, 1.0, 0.0)));
    let vv = normalize(cross(uu, ww));
    let tanFov = tan(u.fov * 0.5 * 3.14159 / 180.0);
    let rd = normalize(p.x * uu * tanFov + p.y * vv * tanFov + ww);

    // Raymarching / Sphere Tracing
    var t = 1.0;
    let tmax = 120.0;
    var hit = false;
    var steps = 0u;

    for (var i = 0u; i < 110u; i = i + 1u) {
        steps = i;
        let pos = ro + rd * t;
        let d = mapCliff(pos);
        if (d < 0.004 * t) {
            hit = true;
            break;
        }
        t += d * 0.85;
        if (t >= tmax) {
            break;
        }
    }

    // Sky gradient background
    var skyColor = mix(vec3f(0.12, 0.14, 0.18), vec3f(0.24, 0.28, 0.36), in.uv.y * 0.5 + 0.5);

    if (!hit) {
        // Ground plane fallback if ray hits below horizon
        if (rd.y < -0.01) {
            let tg = (-10.0 - ro.y) / rd.y;
            if (tg > 0.0 && tg < 140.0) {
                let gp = ro + rd * tg;
                let grid = step(0.06, fract(gp.xz * 0.25));
                let gCol = mix(vec3f(0.18, 0.20, 0.24), vec3f(0.14, 0.16, 0.20), grid.x * grid.y);
                return vec4f(gCol * u.exposure, 1.0);
            }
        }
        return vec4f(skyColor * u.exposure, 1.0);
    }

    let pos = ro + rd * t;
    let norm = calcNormal(pos);

    // Diagnostic Visualization Modes
    if (u.renderMode == 1u) {
        // SLOPE MAP: Green (plateau) -> Red (vertical) -> MAGENTA (acute overhangs >90° \ /)
        if (norm.y < -0.05) {
            return vec4f(1.0, 0.1, 0.85, 1.0); // Vibrant Magenta for Overhangs!
        }
        let slope = clamp(1.0 - max(0.0, norm.y), 0.0, 1.0);
        let col = mix(vec3f(0.2, 0.85, 0.3), vec3f(0.9, 0.15, 0.1), slope);
        return vec4f(col, 1.0);
    } else if (u.renderMode == 2u) {
        // STRATA MAP: Rainbow sedimentary beds
        let dipRad = (u.strataDip * 3.14159) / 180.0;
        let p_strata = fract(dot(pos, vec3f(sin(dipRad), cos(dipRad), 0.0)) * u.strataFreq);
        let col = 0.5 + 0.5 * cos(6.283 * (vec3f(0.0, 0.33, 0.67) + p_strata));
        return vec4f(col, 1.0);
    } else if (u.renderMode == 3u) {
        // CAVITY MAP: Ambient Occlusion Grayscale
        let ao = calcAO(pos, norm);
        return vec4f(vec3f(ao), 1.0);
    } else if (u.renderMode == 4u) {
        // FLOW MAP: Hydraulic drainage chutes
        let flow = ridgedFbm(vec3f(pos.x * 0.25, pos.y * 0.06, pos.z * 0.25), 2);
        let col = mix(vec3f(0.12, 0.14, 0.18), vec3f(0.0, 0.85, 1.0), flow);
        return vec4f(col, 1.0);
    } else if (u.renderMode == 5u) {
        // RAYMARCH STEP HEATMAP
        let stepRatio = f32(steps) / 100.0;
        let col = mix(vec3f(0.1, 0.4, 0.9), vec3f(0.9, 0.1, 0.1), stepRatio);
        return vec4f(col, 1.0);
    }

    // PBR COMPOSITE SHADING WITH REAL-TIME SOFT SHADOWS & GI
    let albedo = evalSatmapColor(pos, norm);
    let lightDir = normalize(u.lightDir);
    let diff = max(dot(norm, lightDir), 0.0);
    let shadow = calcSoftShadow(pos + norm * 0.05, lightDir, 0.1, 45.0, 16.0);
    let ao = calcAO(pos, norm);

    // Sky indirect fill
    let hemi = (norm.y * 0.5 + 0.5) * vec3f(0.35, 0.42, 0.55);
    let direct = diff * shadow * vec3f(1.0, 0.95, 0.88) * 1.8;
    let ambient = hemi * ao * 0.8;

    // Specular highlight
    let halfVec = normalize(lightDir - rd);
    let spec = pow(max(dot(norm, halfVec), 0.0), 32.0) * shadow * 0.35;

    var finalColor = albedo * (direct + ambient) + vec3f(spec);
    finalColor *= u.exposure;

    // Fog distance falloff
    let fog = 1.0 - exp(-t * 0.012);
    finalColor = mix(finalColor, skyColor, fog);

    return vec4f(finalColor, 1.0);
}
`;

/**
 * WebGPU Cliff Pipeline Controller
 */
export class CliffWebGPURenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.uniformBuffer = null;
        this.bindGroup = null;
        this.isSupported = false;
        this.uniformArray = new Float32Array(32);
    }

    async init() {
        if (!navigator.gpu) {
            console.warn('WebGPU not supported on this browser/platform; falling back to WebGL.');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter) {
                console.warn('No WebGPU adapter found.');
                return false;
            }

            this.device = await adapter.requestDevice();
            this.context = this.canvas.getContext('webgpu');
            const format = navigator.gpu.getPreferredCanvasFormat();

            this.context.configure({
                device: this.device,
                format: format,
                alphaMode: 'opaque'
            });

            // Shader Module
            const shaderModule = this.device.createShaderModule({
                label: 'CliffVoxelWGSL',
                code: CliffWGSL
            });

            // Uniform Buffer (32 floats = 128 bytes)
            this.uniformBuffer = this.device.createBuffer({
                label: 'CliffUniforms',
                size: 128,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            // Pipeline
            this.pipeline = this.device.createRenderPipeline({
                label: 'CliffPipeline',
                layout: 'auto',
                vertex: {
                    module: shaderModule,
                    entryPoint: 'vs_main'
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: 'fs_main',
                    targets: [{ format: format }]
                },
                primitive: {
                    topology: 'triangle-list'
                }
            });

            this.bindGroup = this.device.createBindGroup({
                label: 'CliffBindGroup',
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [{
                    binding: 0,
                    resource: { buffer: this.uniformBuffer }
                }]
            });

            this.isSupported = true;
            console.log('✓ WebGPU Raymarching Engine Initialized Successfully!');
            return true;

        } catch (err) {
            console.error('WebGPU initialization failed:', err);
            this.isSupported = false;
            return false;
        }
    }

    /**
     * Updates uniform buffer and renders a frame using WebGPU.
     */
    render(camera, spec, options = {}) {
        if (!this.isSupported || !this.device || !this.context) return;

        const presetMap = {
            'sandstone_canyon': 0,
            'dolerite_spires': 1,
            'coastal_cliff': 2,
            'rugged_crag': 3,
            'monument_butte': 4
        };

        const modeMap = {
            'composite': 0,
            'slope': 1,
            'strata': 2,
            'cavity': 3,
            'flow': 4,
            'steps': 5,
            'slice': 6
        };

        const u = this.uniformArray;
        // cameraPos (vec3) + fov
        u[0] = camera.position.x;
        u[1] = camera.position.y;
        u[2] = camera.position.z;
        u[3] = camera.fov;

        // cameraTarget (vec3) + time
        const target = options.target || { x: 0, y: 0, z: 0 };
        u[4] = target.x;
        u[5] = target.y;
        u[6] = target.z;
        u[7] = performance.now() * 0.001;

        // resolution (vec2) + lightDir (vec3)
        u[8] = this.canvas.width;
        u[9] = this.canvas.height;
        const light = options.lightDir || { x: -0.6, y: 0.7, z: 0.5 };
        u[10] = light.x;
        u[11] = light.y;

        // Pack integers via Uint32Array view
        const uInt = new Uint32Array(u.buffer);
        uInt[12] = options.stage || 5;
        uInt[13] = modeMap[options.renderMode || 'composite'] || 0;
        uInt[14] = presetMap[spec.preset || 'sandstone_canyon'] || 0;
        uInt[15] = options.sliceAxis || 0;

        // Floats
        u[16] = options.slicePos || 0.0;
        u[17] = spec.overhangStrength !== undefined ? spec.overhangStrength : 0.45;
        u[18] = spec.cliffHeight || 18.0;
        u[19] = spec.cliffWidth || 26.0;
        u[20] = spec.cliffDepth || 16.0;
        u[21] = spec.asymmetry !== undefined ? spec.asymmetry : 0.3;
        u[22] = spec.strataFreq || 0.85;
        u[23] = spec.strataDip || 6.0;
        u[24] = spec.strataUndercut || 0.9;
        u[25] = spec.strataHardnessVar || 0.85;

        uInt[26] = spec.jointType === 'block' ? 1 : 0;
        u[27] = spec.jointScale || 0.5;
        u[28] = spec.jointDepth || 0.5;
        u[29] = spec.talusHeight || 4.5;
        u[30] = spec.gullyDepth || 0.6;
        u[31] = (spec.seed || 1337) % 10000;

        this.device.queue.writeBuffer(this.uniformBuffer, 0, u.buffer);

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.1, g: 0.12, b: 0.15, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.bindGroup);
        renderPass.draw(3); // single triangle covers fullscreen
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}
