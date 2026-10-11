// ============================================================================================================================================
//                                                            WEBGPURENDERER.JS
// ============================================================================================================================================
// High-Fidelity WebGPU (WGSL) PBR + 8-Layer Texture Stack + Quad/Triangle Topology Renderer
// with automatic WebGL2 (#version 300 es) fallback so it runs everywhere with zero compromise.

import {
  clamp,
  vSub,
  vCross,
  vNorm,
  mat4LookAt,
  mat4Multiply,
  mat4Invert,
  mat4PerspectiveZO,
  mat4PerspectiveNO,
  projectWorldToScreen,
} from './math.js';

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  WGSL SHADERS (WEBGPU PRIMARY)
// --------------------------------------------------------------------------------------------------------------------------------------------

export const ROAD_SURFACE_WGSL = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  cameraPos: vec4f,        // xyz = eye, w = time
  sunDir: vec4f,           // xyz = normalized light dir, w = sunIntensity
  envParams: vec4f,        // x = skyIntensity, y = fogDensity, z = exposure, w = renderMode
  selectionParams: vec4f,  // x = selectedEntityId, y = hoveredEntityId, z = nightMode, w = wirePassFlag
  texWeights0: vec4f,      // x = T1 Bitumen, y = T2 WheelWear, z = T3 Cracks, w = T4 Distress
  texWeights1: vec4f,      // x = T5 Paving, y = T6 Gutter/Skid, z = T7 Markings, w = T8 Wetness
  texParams0: vec4f,       // x = aggregateScale, y = albedoDarkness, z = trackPolish, w = crackDensity
  texParams1: vec4f,       // x = pavingScale, y = mortarDepth, z = wetness, w = puddleThreshold
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VSIn {
  @location(0) pos: vec3f,
  @location(1) norm: vec3f,
  @location(2) uv: vec2f,
  @location(3) meta: vec4f, // x = matId, y = aux0, z = aux1, w = entityId
};

struct VSOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) worldNorm: vec3f,
  @location(2) uv: vec2f,
  @location(3) meta: vec4f,
};

@vertex
fn vsMain(in: VSIn) -> VSOut {
  var out: VSOut;
  var p = in.pos;
  // Subtle depth bias when drawing quad/triangle wireframe overlay
  if (u.selectionParams.w > 0.5) {
    let toCam = normalize(u.cameraPos.xyz - p);
    p = p + toCam * 0.018;
  }
  out.clipPos = u.viewProj * vec4f(p, 1.0);
  out.worldPos = in.pos;
  out.worldNorm = in.norm;
  out.uv = in.uv;
  out.meta = in.meta;
  return out;
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn hash22(p: vec2f) -> vec2f {
  let n = sin(dot(p, vec2f(41.0, 289.0)));
  return fract(vec2f(262144.0, 32768.0) * n);
}

fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let a = hash21(i + vec2f(0.0, 0.0));
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm2(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i = i + 1) {
    v += a * noise2(q);
    q = q * 2.03 + vec2f(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

// Voronoi edge distance for alligator asphalt cracks & flagstone/cobble joints
fn voronoiCrack(p: vec2f) -> vec2f {
  let n = floor(p);
  let f = fract(p);
  var md1 = 8.0;
  var md2 = 8.0;
  var cellId = 0.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let g = vec2f(f32(i), f32(j));
      let o = hash22(n + g);
      let r = g + o - f;
      let d = dot(r, r);
      if (d < md1) {
        md2 = md1;
        md1 = d;
        cellId = hash21(n + g);
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  let edgeDist = sqrt(md2) - sqrt(md1);
  return vec2f(edgeDist, cellId);
}

// Evaluates 8 distinct procedural paving patterns (Herringbone, Running-Bond, Cobble, Hex, Concrete Slab, Flagstone, Tactile, Terrazzo)
fn evaluatePavingPattern(worldXZ: vec2f, patternId: i32, scale: f32) -> vec3f {
  let p = worldXZ * (2.6 / max(0.25, scale));
  if (patternId == 0) {
    // 45° Herringbone Brick Pavers
    let rot = vec2f(p.x + p.y, p.y - p.x) * 0.7071 * 1.4;
    let stepCell = floor(rot.x) + floor(rot.y);
    let localUV = select(fract(rot.yx), fract(rot.xy), (i32(abs(stepCell)) % 2) == 0);
    let joint = min(min(localUV.x, 1.0 - localUV.x), min(localUV.y * 2.0, (1.0 - localUV.y) * 2.0));
    let brickHash = hash21(floor(rot));
    return vec3f(smoothstep(0.03, 0.09, joint), brickHash, 0.0);
  } else if (patternId == 1) {
    // Running-Bond Ashlar Pavers
    let row = floor(p.y * 1.6);
    let colCoord = vec2f(p.x * 0.9 + (row % 2.0) * 0.5, p.y * 1.6);
    let f = fract(colCoord);
    let joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3f(smoothstep(0.03, 0.08, joint), hash21(floor(colCoord)), 0.0);
  } else if (patternId == 2) {
    // European Fan Porphyry Cobblestone
    let v = voronoiCrack(p * 2.2);
    return vec3f(smoothstep(0.05, 0.14, v.x), v.y, 1.0);
  } else if (patternId == 3) {
    // Hexagonal Basalt Plaza Tiles
    let v = voronoiCrack(p * 1.5);
    return vec3f(smoothstep(0.03, 0.08, v.x), v.y, 0.0);
  } else if (patternId == 4) {
    // Brushed Concrete Expansion Slabs
    let f = fract(p * 0.35);
    let joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3f(smoothstep(0.012, 0.03, joint), hash21(floor(p * 0.35)) * 0.25, 0.0);
  } else if (patternId == 5) {
    // Yorkstone Flagstone
    let v = voronoiCrack(p * 0.85);
    return vec3f(smoothstep(0.025, 0.07, v.x), v.y, 0.0);
  } else if (patternId == 6) {
    // Tactile Blister Paving
    let f = fract(p * 4.5) - 0.5;
    let dome = smoothstep(0.32, 0.15, length(f));
    return vec3f(1.0 - dome * 0.35, dome, dome);
  } else {
    // Terrazzo Promenade Grid
    let f = fract(p * 0.7);
    let joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    let speck = noise2(p * 14.0);
    return vec3f(smoothstep(0.02, 0.05, joint), speck, 0.0);
  }
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
  let renderMode = i32(round(u.envParams.w));
  let wirePass = u.selectionParams.w > 0.5;

  // Wireframe Overlay Pass
  if (wirePass) {
    let isQuadOnly = renderMode == 1 || renderMode == 2;
    let wireCol = select(vec3f(0.98, 0.68, 0.25), vec3f(0.32, 0.86, 0.98), isQuadOnly);
    let alpha = select(0.75, 0.92, renderMode == 2 || renderMode == 3);
    return vec4f(wireCol, alpha);
  }

  let matId = i32(round(in.meta.x));
  let aux0 = in.meta.y;
  let aux1 = in.meta.z;
  let entityId = i32(round(in.meta.w));

  var N = normalize(in.worldNorm);
  let V = normalize(u.cameraPos.xyz - in.worldPos);
  let L = normalize(u.sunDir.xyz);
  let H = normalize(V + L);

  // Pure Wireframe Background Surface Mode (Quad Cage = 2, Triangle Wire = 3)
  if (renderMode == 2 || renderMode == 3) {
    let ndl = max(0.15, dot(N, L));
    let baseTone = select(vec3f(0.08, 0.09, 0.11), vec3f(0.14, 0.16, 0.20), matId == 1 || matId == 5);
    return vec4f(baseTone * (0.5 + 0.5 * ndl), 1.0);
  }

  // Clay / Matcap Studio Relief Mode (renderMode == 4)
  if (renderMode == 4) {
    let ndl = max(0.0, dot(N, L));
    let rim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    let clay = vec3f(0.72, 0.69, 0.65) * (0.28 + 0.72 * ndl) + vec3f(0.18, 0.16, 0.14) * rim;
    return vec4f(pow(clay, vec3f(1.0 / 2.2)), 1.0);
  }

  // Evaluate 8-Layer Texture & PBR Stack Weights (T1..T8)
  let wT1 = u.texWeights0.x; // Bitumen Base
  let wT2 = u.texWeights0.y; // Wheel-Track Polish & Oil
  let wT3 = u.texWeights0.z; // Cracks & Tar Sealant
  let wT4 = u.texWeights0.w; // Pothole Gravel & Construction Milling
  let wT5 = u.texWeights1.x; // Sidewalk & Block Paving Coursework
  let wT6 = u.texWeights1.y; // Gutter Grime & Skid Marks
  let wT7 = u.texWeights1.z; // Thermoplastic Markings & Glass Beads
  let wT8 = u.texWeights1.w; // Rain Wetness & Puddles

  let aggScale = u.texParams0.x;
  let baseDark = u.texParams0.y;
  let trackPolish = u.texParams0.z;
  let crackDensity = u.texParams0.w;
  let pavingScale = u.texParams1.x;
  let mortarDepth = u.texParams1.y;
  let wetness = u.texParams1.z * wT8;
  let puddleThresh = u.texParams1.w;

  var albedo = vec3f(0.24, 0.24, 0.26);
  var roughness = 0.75;
  var metallic = 0.0;
  var emissive = vec3f(0.0);

  let wXZ = in.worldPos.xz;

  if (matId == 1 || matId == 2) {
    // --- ASPHALT CARRIAGEWAY + TEXTURE LAYER STACK (T1, T2, T3, T6, T8) ---
    let agg = fbm2(wXZ * aggScale);
    let fine = noise2(wXZ * aggScale * 3.7);
    let baseAsphalt = mix(vec3f(0.11, 0.11, 0.12), vec3f(0.29, 0.29, 0.31), baseDark + (agg - 0.5) * 0.42 * wT1);
    albedo = baseAsphalt;
    roughness = clamp(0.82 - fine * 0.14 * wT1, 0.2, 0.95);

    // T2: Dual-Gaussian Wheel Track Wear & Central Oil Streak (aux0 is normalized lateral road coord -1..1)
    let absLat = abs(aux0);
    let wheelTrack = exp(-pow((absLat - 0.48) * 5.2, 2.0)) + exp(-pow((absLat - 0.78) * 5.2, 2.0));
    let oilCenter = exp(-pow((absLat - 0.63) * 8.0, 2.0));
    albedo = mix(albedo, albedo * 1.16, wheelTrack * trackPolish * 0.45 * wT2);
    albedo = mix(albedo, albedo * 0.62, oilCenter * 0.42 * wT2);
    roughness = mix(roughness, 0.36, wheelTrack * trackPolish * wT2);

    // T3: Voronoi Alligator Cracking & Glossy Bitumen Tar Sealant Snakes
    let vc = voronoiCrack(wXZ * (1.2 + crackDensity * 1.6));
    let crackMask = (1.0 - smoothstep(0.015, 0.055, vc.x)) * wT3 * step(0.32, fbm2(wXZ * 0.18));
    albedo = mix(albedo, vec3f(0.04, 0.04, 0.045), crackMask);
    roughness = mix(roughness, 0.18, crackMask); // glossy tar overband sealant

    // T6: Curb-Line Gutter Grime & Intersection Braking Skid Marks
    let edgeDirt = smoothstep(0.78, 0.99, absLat) * wT6;
    albedo = mix(albedo, vec3f(0.22, 0.19, 0.15), edgeDirt * 0.55);

    // T8: Rain Wetness & Puddle Pooling
    let puddleNoise = fbm2(wXZ * 0.22);
    let puddleMask = smoothstep(1.0 - puddleThresh * 0.65, 1.0 - puddleThresh * 0.45, puddleNoise) * wetness;
    albedo = mix(albedo, albedo * 0.55, wetness * 0.5 + puddleMask * 0.4);
    roughness = mix(roughness, 0.05, clamp(wetness * 0.45 + puddleMask * 0.95, 0.0, 0.98));

    // Perturb surface normal with aggregate & crack relief
    let dN = vec3f((fine - 0.5) * 0.14 - crackMask * 0.25, 0.0, (agg - 0.5) * 0.14);
    N = normalize(N + dN * (1.0 - puddleMask * 0.9));
  } else if (matId == 3) {
    // --- GRANITE CURB (T5) ---
    let gNoise = fbm2(wXZ * 14.0);
    let courseJoint = smoothstep(0.02, 0.06, abs(fract(in.uv.x * 1.2) - 0.5));
    albedo = mix(vec3f(0.32, 0.31, 0.29), vec3f(0.58, 0.57, 0.55) + (gNoise - 0.5) * 0.16, courseJoint);
    roughness = 0.62 - gNoise * 0.15;
  } else if (matId == 4) {
    // --- GUTTER CHANNEL (T6) ---
    let grime = fbm2(wXZ * 4.5);
    albedo = mix(vec3f(0.18, 0.18, 0.19), vec3f(0.24, 0.26, 0.19), grime * wT6);
    roughness = mix(0.68, 0.12, wetness);
  } else if (matId == 5 || matId == 6) {
    // --- SIDEWALK & CITY BLOCK PAVING COURSEWORK (T5) ---
    let patId = i32(round(aux0));
    let pav = evaluatePavingPattern(wXZ, patId, pavingScale);
    let jointMask = pav.x;
    let tileHash = pav.y;

    var stoneBase = vec3f(0.52, 0.49, 0.46);
    if (patId == 0) {
      // Herringbone clay/terracotta & charcoal blend
      stoneBase = mix(vec3f(0.46, 0.34, 0.29), vec3f(0.56, 0.45, 0.39), tileHash);
    } else if (patId == 2) {
      // European porphyry cobble
      stoneBase = mix(vec3f(0.34, 0.33, 0.35), vec3f(0.48, 0.45, 0.44), tileHash);
    } else if (patId == 3) {
      // Hex basalt plaza tile
      stoneBase = mix(vec3f(0.26, 0.28, 0.30), vec3f(0.38, 0.40, 0.42), tileHash);
    } else {
      stoneBase = mix(vec3f(0.48, 0.47, 0.45), vec3f(0.62, 0.60, 0.57), tileHash);
    }
    let mortarCol = vec3f(0.16, 0.15, 0.14);
    albedo = mix(mortarCol, stoneBase, mix(1.0, jointMask, mortarDepth * wT5));
    roughness = mix(0.88, 0.58, jointMask);
    N = normalize(N + vec3f((tileHash - 0.5) * 0.08, 0.0, (1.0 - jointMask) * 0.18));
  } else if (matId == 7 || matId == 8 || matId == 13 || matId == 30) {
    // --- THERMOPLASTIC ROAD MARKINGS, SPEED BUMPS & TACTILE PAVING (T7) ---
    let wearNoise = fbm2(wXZ * 6.5);
    let beadSparkle = pow(hash21(floor(wXZ * 60.0)), 6.0) * 0.45 * wT7;
    if (matId == 7) {
      albedo = vec3f(0.88, 0.89, 0.90) * mix(0.72, 1.0, wearNoise) + beadSparkle;
    } else if (matId == 8 || matId == 30) {
      albedo = vec3f(0.92, 0.72, 0.16) * mix(0.78, 1.0, wearNoise) + beadSparkle;
    } else {
      // Speed bump with high-contrast yellow/black chevron hazard stripes!
      let chevron = step(0.5, fract((wXZ.x + wXZ.y) * 1.6));
      albedo = mix(vec3f(0.14, 0.14, 0.15), vec3f(0.94, 0.74, 0.14), chevron);
    }
    roughness = 0.42;
  } else if (matId == 9) {
    // --- POTHOLE EXPOSED SUB-BASE GRAVEL (T4) ---
    let grav = fbm2(wXZ * 28.0);
    albedo = mix(vec3f(0.14, 0.12, 0.10), vec3f(0.36, 0.33, 0.29), grav * wT4);
    roughness = 0.92;
    N = normalize(N + vec3f((grav - 0.5) * 0.45, 0.0, (grav - 0.5) * 0.45));
  } else if (matId == 10) {
    // --- POTHOLE STANDING RAINWATER PUDDLE (T8) ---
    let ripple = sin(length(wXZ * 8.0) - u.cameraPos.w * 4.0) * 0.03;
    N = normalize(vec3f(ripple, 1.0, ripple));
    albedo = vec3f(0.05, 0.07, 0.09);
    roughness = 0.03;
    metallic = 0.15;
  } else if (matId == 11) {
    // --- CONSTRUCTION MILLED ROADBED TRENCH (T4) ---
    let grooves = sin(wXZ.x * 38.0 + wXZ.y * 38.0) * 0.5 + 0.5;
    let aggregate = fbm2(wXZ * 18.0);
    albedo = mix(vec3f(0.19, 0.17, 0.15), vec3f(0.35, 0.32, 0.28), grooves * 0.5 + aggregate * 0.5);
    roughness = 0.89;
    N = normalize(N + vec3f((grooves - 0.5) * 0.32, 0.0, (aggregate - 0.5) * 0.25));
  } else if (matId == 12) {
    // --- CONSTRUCTION HIGH-VIS SAFETY ORANGE ---
    albedo = vec3f(0.95, 0.36, 0.08);
    roughness = 0.38;
  } else if (matId == 14 || matId == 20 || matId == 21) {
    // --- STRUCTURAL CONCRETE, BRIDGE PIERS, TUNNEL & SUBWAY LINING ---
    let conc = fbm2(in.worldPos.xz * 2.4 + in.worldPos.y * 2.0);
    albedo = mix(vec3f(0.42, 0.43, 0.45), vec3f(0.56, 0.57, 0.58), conc);
    if (matId == 20 || matId == 21) {
      // Segmental tunnel ring joints
      let ringJoint = smoothstep(0.02, 0.06, abs(fract(in.uv.x * 0.8) - 0.5));
      albedo *= mix(0.68, 1.0, ringJoint);
    }
    roughness = 0.72;
  } else if (matId == 15) {
    // --- GALVANIZED / BRUSHED STEEL (GUARDRAILS, BOLLARDS, CABLES, SUBWAY) ---
    albedo = vec3f(0.74, 0.77, 0.80);
    roughness = 0.28;
    metallic = 0.85;
  } else if (matId == 16 || matId == 19) {
    // --- DARK CAST IRON / STEEL RAILS / MANHOLES / GRATES ---
    albedo = select(vec3f(0.18, 0.20, 0.22), vec3f(0.55, 0.52, 0.50), matId == 19);
    roughness = select(0.42, 0.22, matId == 19);
    metallic = 0.82;
  } else if (matId == 17) {
    // --- RAILWAY CRUSHED GRANITE BALLAST ---
    let bal = fbm2(wXZ * 16.0);
    albedo = mix(vec3f(0.22, 0.20, 0.19), vec3f(0.44, 0.41, 0.39), bal);
    roughness = 0.94;
  } else if (matId == 18) {
    // --- RAILWAY CONCRETE SLEEPERS ---
    albedo = vec3f(0.46, 0.44, 0.42);
    roughness = 0.78;
  } else if (matId == 22) {
    emissive = vec3f(2.4, 2.35, 2.15);
    albedo = vec3f(0.95);
  } else if (matId == 23) {
    emissive = vec3f(2.6, 1.55, 0.18);
    albedo = vec3f(0.95, 0.65, 0.1);
  } else if (matId == 24) {
    emissive = vec3f(2.8, 0.18, 0.15);
    albedo = vec3f(0.9, 0.1, 0.1);
  } else if (matId == 25) {
    emissive = vec3f(0.22, 1.95, 2.55);
    albedo = vec3f(0.2, 0.85, 0.98);
  } else if (matId == 26) {
    // --- AUTOMOTIVE METALLIC CAR PAINT ---
    let pid = i32(round(aux0)) % 6;
    if (pid == 0) { albedo = vec3f(0.76, 0.79, 0.83); }      // Liquid Silver
    else if (pid == 1) { albedo = vec3f(0.78, 0.11, 0.14); } // Monza Rosso
    else if (pid == 2) { albedo = vec3f(0.11, 0.28, 0.62); } // Deep Sapphire
    else if (pid == 3) { albedo = vec3f(0.15, 0.52, 0.36); } // Transit Emerald
    else if (pid == 4) { albedo = vec3f(0.88, 0.62, 0.12); } // Amber Logistics
    else { albedo = vec3f(0.14, 0.15, 0.18); }               // Obsidian Metallic
    roughness = 0.18;
    metallic = 0.65;
  } else if (matId == 27) {
    // --- AUTOMOTIVE TINTED CABIN GLASS ---
    albedo = vec3f(0.08, 0.12, 0.16);
    roughness = 0.08;
    metallic = 0.25;
  } else if (matId == 28) {
    // --- RUBBER TIRE ---
    albedo = vec3f(0.09, 0.09, 0.10);
    roughness = 0.82;
  } else if (matId == 29) {
    // --- ILLUMINATED HIGHWAY GANTRY / DIGITAL BILLBOARD ---
    let bType = i32(round(aux0));
    let stripe = step(0.12, fract(in.worldPos.x * 0.45 + in.worldPos.z * 0.45));
    let baseSign = select(vec3f(0.06, 0.38, 0.24), vec3f(0.08, 0.24, 0.52), bType == 2);
    albedo = mix(vec3f(0.92, 0.95, 0.98), baseSign, stripe);
    emissive = albedo * 0.75;
    roughness = 0.22;
  }

  // Texture Layer Mask Diagnostic View (renderMode == 5)
  if (renderMode == 5) {
    let absLat = abs(aux0);
    let wheelMask = exp(-pow((absLat - 0.48) * 5.2, 2.0));
    let crackMask = 1.0 - smoothstep(0.015, 0.06, voronoiCrack(wXZ * 1.8).x);
    let diag = vec3f(wheelMask * wT2, crackMask * wT3, wetness);
    return vec4f(clamp(diag + albedo * 0.35, vec3f(0.0), vec3f(1.0)), 1.0);
  }

  // --- PHYSICALLY BASED ILLUMINATION (GGX SPECULAR + HEMISPHERE SKY + SUN + EMISSIVE) ---
  let ndl = max(0.0, dot(N, L));
  let ndv = max(0.001, dot(N, V));
  let ndh = max(0.0, dot(N, H));

  let f0 = mix(vec3f(0.04), albedo, metallic);
  let fresnel = f0 + (vec3f(1.0) - f0) * pow(1.0 - max(0.0, dot(H, V)), 5.0);
  let alphaRough = max(0.03, roughness * roughness);
  let alpha2 = alphaRough * alphaRough;
  let denom = ndh * ndh * (alpha2 - 1.0) + 1.0;
  let D = alpha2 / max(0.0001, 3.14159 * denom * denom);
  let spec = D * fresnel * ndl / max(0.15, 4.0 * ndv);

  let skyUp = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  let skyCol = mix(vec3f(0.16, 0.17, 0.20), vec3f(0.46, 0.56, 0.72), skyUp) * u.envParams.x;
  let sunCol = vec3f(1.0, 0.95, 0.86) * u.sunDir.w;

  let kd = (vec3f(1.0) - fresnel) * (1.0 - metallic);
  var color = kd * albedo * (sunCol * ndl + skyCol * 0.55) + spec * sunCol + emissive;

  // Subtle selection / hover highlight pulse
  let selId = i32(round(u.selectionParams.x));
  let hovId = i32(round(u.selectionParams.y));
  if (selId > 0 && entityId == selId) {
    let pulse = 0.5 + 0.5 * sin(u.cameraPos.w * 5.0);
    color = mix(color, vec3f(1.0, 0.70, 0.32), 0.22 + 0.08 * pulse);
  } else if (hovId > 0 && entityId == hovId) {
    color = mix(color, vec3f(0.45, 0.78, 1.0), 0.16);
  }

  // Distance Aerial Perspective Fog
  let camDist = length(in.worldPos - u.cameraPos.xyz);
  let fogFactor = 1.0 - exp(-camDist * u.envParams.y);
  let fogCol = select(vec3f(0.09, 0.10, 0.12), vec3f(0.03, 0.035, 0.05), u.selectionParams.z > 0.5);
  color = mix(color, fogCol, clamp(fogFactor * 0.65, 0.0, 0.82));

  // ACES Filmic Tonemapping + Gamma
  color *= u.envParams.z;
  let mapped = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  let gamma = pow(clamp(mapped, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  return vec4f(gamma, 1.0);
}
`;

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  WEBGL2 FALLBACK SHADERS (#version 300 es)
// --------------------------------------------------------------------------------------------------------------------------------------------

const WEBGL2_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUV;
layout(location = 3) in vec4 aMeta;

uniform mat4 uViewProj;
uniform vec4 uCameraPos;
uniform vec4 uSelectionParams;

out vec3 vWorldPos;
out vec3 vWorldNorm;
out vec2 vUV;
out vec4 vMeta;

void main() {
  vec3 p = aPos;
  if (uSelectionParams.w > 0.5) {
    vec3 toCam = normalize(uCameraPos.xyz - p);
    p += toCam * 0.018;
  }
  gl_Position = uViewProj * vec4(p, 1.0);
  vWorldPos = aPos;
  vWorldNorm = aNorm;
  vUV = aUV;
  vMeta = aMeta;
}
`;

const WEBGL2_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vWorldNorm;
in vec2 vUV;
in vec4 vMeta;

uniform vec4 uCameraPos;
uniform vec4 uSunDir;
uniform vec4 uEnvParams;
uniform vec4 uSelectionParams;
uniform vec4 uTexWeights0;
uniform vec4 uTexWeights1;
uniform vec4 uTexParams0;
uniform vec4 uTexParams1;

out vec4 fragColor;

float hash21(vec2 p) {
  vec2 q = fract(p * vec2(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

vec2 hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(262144.0, 32768.0) * n);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 q = p;
  for (int i = 0; i < 4; i++) {
    v += a * noise2(q);
    q = q * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

vec2 voronoiCrack(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float md1 = 8.0;
  float md2 = 8.0;
  float cellId = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md1) {
        md2 = md1;
        md1 = d;
        cellId = hash21(n + g);
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec2(sqrt(md2) - sqrt(md1), cellId);
}

vec3 evaluatePavingPattern(vec2 worldXZ, int patternId, float scale) {
  vec2 p = worldXZ * (2.6 / max(0.25, scale));
  if (patternId == 0) {
    vec2 rot = vec2(p.x + p.y, p.y - p.x) * 0.7071 * 1.4;
    float stepCell = floor(rot.x) + floor(rot.y);
    vec2 localUV = (int(abs(stepCell)) % 2 == 0) ? fract(rot.xy) : fract(rot.yx);
    float joint = min(min(localUV.x, 1.0 - localUV.x), min(localUV.y * 2.0, (1.0 - localUV.y) * 2.0));
    return vec3(smoothstep(0.03, 0.09, joint), hash21(floor(rot)), 0.0);
  } else if (patternId == 1) {
    float row = floor(p.y * 1.6);
    vec2 colCoord = vec2(p.x * 0.9 + mod(row, 2.0) * 0.5, p.y * 1.6);
    vec2 f = fract(colCoord);
    float joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3(smoothstep(0.03, 0.08, joint), hash21(floor(colCoord)), 0.0);
  } else if (patternId == 2) {
    vec2 v = voronoiCrack(p * 2.2);
    return vec3(smoothstep(0.05, 0.14, v.x), v.y, 1.0);
  } else if (patternId == 3) {
    vec2 v = voronoiCrack(p * 1.5);
    return vec3(smoothstep(0.03, 0.08, v.x), v.y, 0.0);
  } else if (patternId == 4) {
    vec2 f = fract(p * 0.35);
    float joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3(smoothstep(0.012, 0.03, joint), hash21(floor(p * 0.35)) * 0.25, 0.0);
  } else if (patternId == 5) {
    vec2 v = voronoiCrack(p * 0.85);
    return vec3(smoothstep(0.025, 0.07, v.x), v.y, 0.0);
  } else if (patternId == 6) {
    vec2 f = fract(p * 4.5) - 0.5;
    float dome = smoothstep(0.32, 0.15, length(f));
    return vec3(1.0 - dome * 0.35, dome, dome);
  } else {
    vec2 f = fract(p * 0.7);
    float joint = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return vec3(smoothstep(0.02, 0.05, joint), noise2(p * 14.0), 0.0);
  }
}

void main() {
  int renderMode = int(round(uEnvParams.w));
  bool wirePass = uSelectionParams.w > 0.5;

  if (wirePass) {
    bool isQuadOnly = (renderMode == 1 || renderMode == 2);
    vec3 wireCol = isQuadOnly ? vec3(0.32, 0.86, 0.98) : vec3(0.98, 0.68, 0.25);
    float alpha = (renderMode == 2 || renderMode == 3) ? 0.92 : 0.75;
    fragColor = vec4(wireCol, alpha);
    return;
  }

  int matId = int(round(vMeta.x));
  float aux0 = vMeta.y;
  int entityId = int(round(vMeta.w));

  vec3 N = normalize(vWorldNorm);
  vec3 V = normalize(uCameraPos.xyz - vWorldPos);
  vec3 L = normalize(uSunDir.xyz);
  vec3 H = normalize(V + L);

  if (renderMode == 2 || renderMode == 3) {
    float ndl = max(0.15, dot(N, L));
    vec3 baseTone = (matId == 1 || matId == 5) ? vec3(0.14, 0.16, 0.20) : vec3(0.08, 0.09, 0.11);
    fragColor = vec4(baseTone * (0.5 + 0.5 * ndl), 1.0);
    return;
  }

  if (renderMode == 4) {
    float ndl = max(0.0, dot(N, L));
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    vec3 clay = vec3(0.72, 0.69, 0.65) * (0.28 + 0.72 * ndl) + vec3(0.18, 0.16, 0.14) * rim;
    fragColor = vec4(pow(clay, vec3(1.0 / 2.2)), 1.0);
    return;
  }

  float wT1 = uTexWeights0.x;
  float wT2 = uTexWeights0.y;
  float wT3 = uTexWeights0.z;
  float wT4 = uTexWeights0.w;
  float wT5 = uTexWeights1.x;
  float wT6 = uTexWeights1.y;
  float wT7 = uTexWeights1.z;
  float wT8 = uTexWeights1.w;

  float aggScale = uTexParams0.x;
  float baseDark = uTexParams0.y;
  float trackPolish = uTexParams0.z;
  float crackDensity = uTexParams0.w;
  float pavingScale = uTexParams1.x;
  float mortarDepth = uTexParams1.y;
  float wetness = uTexParams1.z * wT8;
  float puddleThresh = uTexParams1.w;

  vec3 albedo = vec3(0.24, 0.24, 0.26);
  float roughness = 0.75;
  float metallic = 0.0;
  vec3 emissive = vec3(0.0);
  vec2 wXZ = vWorldPos.xz;

  if (matId == 1 || matId == 2) {
    float agg = fbm2(wXZ * aggScale);
    float fine = noise2(wXZ * aggScale * 3.7);
    albedo = mix(vec3(0.11, 0.11, 0.12), vec3(0.29, 0.29, 0.31), baseDark + (agg - 0.5) * 0.42 * wT1);
    roughness = clamp(0.82 - fine * 0.14 * wT1, 0.2, 0.95);

    float absLat = abs(aux0);
    float wheelTrack = exp(-pow((absLat - 0.48) * 5.2, 2.0)) + exp(-pow((absLat - 0.78) * 5.2, 2.0));
    float oilCenter = exp(-pow((absLat - 0.63) * 8.0, 2.0));
    albedo = mix(albedo, albedo * 1.16, wheelTrack * trackPolish * 0.45 * wT2);
    albedo = mix(albedo, albedo * 0.62, oilCenter * 0.42 * wT2);
    roughness = mix(roughness, 0.36, wheelTrack * trackPolish * wT2);

    vec2 vc = voronoiCrack(wXZ * (1.2 + crackDensity * 1.6));
    float crackMask = (1.0 - smoothstep(0.015, 0.055, vc.x)) * wT3 * step(0.32, fbm2(wXZ * 0.18));
    albedo = mix(albedo, vec3(0.04, 0.04, 0.045), crackMask);
    roughness = mix(roughness, 0.18, crackMask);

    float edgeDirt = smoothstep(0.78, 0.99, absLat) * wT6;
    albedo = mix(albedo, vec3(0.22, 0.19, 0.15), edgeDirt * 0.55);

    float puddleNoise = fbm2(wXZ * 0.22);
    float puddleMask = smoothstep(1.0 - puddleThresh * 0.65, 1.0 - puddleThresh * 0.45, puddleNoise) * wetness;
    albedo = mix(albedo, albedo * 0.55, wetness * 0.5 + puddleMask * 0.4);
    roughness = mix(roughness, 0.05, clamp(wetness * 0.45 + puddleMask * 0.95, 0.0, 0.98));
  } else if (matId == 3) {
    float gNoise = fbm2(wXZ * 14.0);
    float courseJoint = smoothstep(0.02, 0.06, abs(fract(vUV.x * 1.2) - 0.5));
    albedo = mix(vec3(0.32, 0.31, 0.29), vec3(0.58, 0.57, 0.55) + (gNoise - 0.5) * 0.16, courseJoint);
    roughness = 0.62 - gNoise * 0.15;
  } else if (matId == 4) {
    float grime = fbm2(wXZ * 4.5);
    albedo = mix(vec3(0.18, 0.18, 0.19), vec3(0.24, 0.26, 0.19), grime * wT6);
    roughness = mix(0.68, 0.12, wetness);
  } else if (matId == 5 || matId == 6) {
    int patId = int(round(aux0));
    vec3 pav = evaluatePavingPattern(wXZ, patId, pavingScale);
    vec3 stoneBase = (patId == 0) ? mix(vec3(0.46, 0.34, 0.29), vec3(0.56, 0.45, 0.39), pav.y)
      : (patId == 2) ? mix(vec3(0.34, 0.33, 0.35), vec3(0.48, 0.45, 0.44), pav.y)
      : (patId == 3) ? mix(vec3(0.26, 0.28, 0.30), vec3(0.38, 0.40, 0.42), pav.y)
      : mix(vec3(0.48, 0.47, 0.45), vec3(0.62, 0.60, 0.57), pav.y);
    albedo = mix(vec3(0.16, 0.15, 0.14), stoneBase, mix(1.0, pav.x, mortarDepth * wT5));
    roughness = mix(0.88, 0.58, pav.x);
  } else if (matId == 7 || matId == 8 || matId == 13 || matId == 30) {
    float wearNoise = fbm2(wXZ * 6.5);
    if (matId == 7) albedo = vec3(0.88, 0.89, 0.90) * mix(0.72, 1.0, wearNoise);
    else if (matId == 8 || matId == 30) albedo = vec3(0.92, 0.72, 0.16) * mix(0.78, 1.0, wearNoise);
    else {
      float chevron = step(0.5, fract((wXZ.x + wXZ.y) * 1.6));
      albedo = mix(vec3(0.14, 0.14, 0.15), vec3(0.94, 0.74, 0.14), chevron);
    }
    roughness = 0.42;
  } else if (matId == 9) {
    float grav = fbm2(wXZ * 28.0);
    albedo = mix(vec3(0.14, 0.12, 0.10), vec3(0.36, 0.33, 0.29), grav * wT4);
    roughness = 0.92;
  } else if (matId == 10) {
    albedo = vec3(0.05, 0.07, 0.09);
    roughness = 0.03;
    metallic = 0.15;
  } else if (matId == 11) {
    float grooves = sin(wXZ.x * 38.0 + wXZ.y * 38.0) * 0.5 + 0.5;
    albedo = mix(vec3(0.19, 0.17, 0.15), vec3(0.35, 0.32, 0.28), grooves);
    roughness = 0.89;
  } else if (matId == 12) {
    albedo = vec3(0.95, 0.36, 0.08);
    roughness = 0.38;
  } else if (matId == 14 || matId == 20 || matId == 21) {
    float conc = fbm2(vWorldPos.xz * 2.4 + vWorldPos.y * 2.0);
    albedo = mix(vec3(0.42, 0.43, 0.45), vec3(0.56, 0.57, 0.58), conc);
    roughness = 0.72;
  } else if (matId == 15) {
    albedo = vec3(0.74, 0.77, 0.80);
    roughness = 0.28;
    metallic = 0.85;
  } else if (matId == 16 || matId == 19) {
    albedo = (matId == 19) ? vec3(0.55, 0.52, 0.50) : vec3(0.18, 0.20, 0.22);
    roughness = (matId == 19) ? 0.22 : 0.42;
    metallic = 0.82;
  } else if (matId == 17) {
    albedo = mix(vec3(0.22, 0.20, 0.19), vec3(0.44, 0.41, 0.39), fbm2(wXZ * 16.0));
    roughness = 0.94;
  } else if (matId == 18) {
    albedo = vec3(0.46, 0.44, 0.42);
    roughness = 0.78;
  } else if (matId == 22) { emissive = vec3(2.4, 2.35, 2.15); albedo = vec3(0.95); }
  else if (matId == 23) { emissive = vec3(2.6, 1.55, 0.18); albedo = vec3(0.95, 0.65, 0.1); }
  else if (matId == 24) { emissive = vec3(2.8, 0.18, 0.15); albedo = vec3(0.9, 0.1, 0.1); }
  else if (matId == 25) { emissive = vec3(0.22, 1.95, 2.55); albedo = vec3(0.2, 0.85, 0.98); }
  else if (matId == 26) {
    int pid = int(round(aux0)) % 6;
    if (pid == 0) albedo = vec3(0.76, 0.79, 0.83);
    else if (pid == 1) albedo = vec3(0.78, 0.11, 0.14);
    else if (pid == 2) albedo = vec3(0.11, 0.28, 0.62);
    else if (pid == 3) albedo = vec3(0.15, 0.52, 0.36);
    else if (pid == 4) albedo = vec3(0.88, 0.62, 0.12);
    else albedo = vec3(0.14, 0.15, 0.18);
    roughness = 0.18;
    metallic = 0.65;
  } else if (matId == 27) {
    albedo = vec3(0.08, 0.12, 0.16);
    roughness = 0.08;
    metallic = 0.25;
  } else if (matId == 28) {
    albedo = vec3(0.09, 0.09, 0.10);
    roughness = 0.82;
  } else if (matId == 29) {
    float stripe = step(0.12, fract(vWorldPos.x * 0.45 + vWorldPos.z * 0.45));
    albedo = mix(vec3(0.92, 0.95, 0.98), vec3(0.06, 0.38, 0.24), stripe);
    emissive = albedo * 0.75;
    roughness = 0.22;
  }

  if (renderMode == 5) {
    float absLat = abs(aux0);
    float wheelMask = exp(-pow((absLat - 0.48) * 5.2, 2.0));
    float crackMask = 1.0 - smoothstep(0.015, 0.06, voronoiCrack(wXZ * 1.8).x);
    fragColor = vec4(clamp(vec3(wheelMask * wT2, crackMask * wT3, wetness) + albedo * 0.35, 0.0, 1.0), 1.0);
    return;
  }

  float ndl = max(0.0, dot(N, L));
  float ndv = max(0.001, dot(N, V));
  float ndh = max(0.0, dot(N, H));

  vec3 f0 = mix(vec3(0.04), albedo, metallic);
  vec3 fresnel = f0 + (vec3(1.0) - f0) * pow(1.0 - max(0.0, dot(H, V)), 5.0);
  float alphaRough = max(0.03, roughness * roughness);
  float alpha2 = alphaRough * alphaRough;
  float denom = ndh * ndh * (alpha2 - 1.0) + 1.0;
  float D = alpha2 / max(0.0001, 3.14159 * denom * denom);
  vec3 spec = D * fresnel * ndl / max(0.15, 4.0 * ndv);

  float skyUp = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyCol = mix(vec3(0.16, 0.17, 0.20), vec3(0.46, 0.56, 0.72), skyUp) * uEnvParams.x;
  vec3 sunCol = vec3(1.0, 0.95, 0.86) * uSunDir.w;

  vec3 kd = (vec3(1.0) - fresnel) * (1.0 - metallic);
  vec3 color = kd * albedo * (sunCol * ndl + skyCol * 0.55) + spec * sunCol + emissive;

  int selId = int(round(uSelectionParams.x));
  int hovId = int(round(uSelectionParams.y));
  if (selId > 0 && entityId == selId) {
    float pulse = 0.5 + 0.5 * sin(uCameraPos.w * 5.0);
    color = mix(color, vec3(1.0, 0.70, 0.32), 0.22 + 0.08 * pulse);
  } else if (hovId > 0 && entityId == hovId) {
    color = mix(color, vec3(0.45, 0.78, 1.0), 0.16);
  }

  float camDist = length(vWorldPos - uCameraPos.xyz);
  float fogFactor = 1.0 - exp(-camDist * uEnvParams.y);
  vec3 fogCol = (uSelectionParams.z > 0.5) ? vec3(0.03, 0.035, 0.05) : vec3(0.09, 0.10, 0.12);
  color = mix(color, fogCol, clamp(fogFactor * 0.65, 0.0, 0.82));

  color *= uEnvParams.z;
  vec3 mapped = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
  fragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  UNIFIED WEBGPU / WEBGL2 VIEWPORT RENDERER
// --------------------------------------------------------------------------------------------------------------------------------------------

export class RoadViewportRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.backend = 'initializing'; // 'webgpu' | 'webgl2' | 'canvas2d'
    this.adapterName = 'WebGPU WGSL Hardware Pipeline';
    this.device = null;
    this.context = null;
    this.gl = null;
    this.ready = false;

    this.staticCount = { tris: 0, quadLines: 0, triLines: 0 };
    this.dynamicCount = { tris: 0, quadLines: 0 };
    this.pendingStatic = null;
    this.pendingDynamic = null;
  }

  async init() {
    // 1. Try Native WebGPU first!
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (adapter) {
          const device = await adapter.requestDevice();
          const context = this.canvas.getContext('webgpu');
          if (device && context) {
            const format = navigator.gpu.getPreferredCanvasFormat();
            context.configure({
              device,
              format,
              alphaMode: 'opaque',
            });
            this.device = device;
            this.context = context;
            this.format = format;
            this.backend = 'webgpu';
            this.adapterName = adapter.info?.description || adapter.name || 'WebGPU Native Adapter';
            this._initWebGPUPipelines();
            this.ready = true;
            if (this.pendingStatic) this.uploadStaticBuffers(this.pendingStatic);
            if (this.pendingDynamic) this.uploadDynamicBuffers(this.pendingDynamic);
            return this.backend;
          }
        }
      } catch (err) {
        console.warn('WebGPU init fell back to WebGL2:', err);
      }
    }

    // 2. Fallback to WebGL2 if WebGPU is unavailable in headless/older browser
    try {
      const gl = this.canvas.getContext('webgl2', { antialias: true, depth: true });
      if (gl) {
        this.gl = gl;
        this.backend = 'webgl2';
        this.adapterName = 'WebGPU-Compat Shader Pipeline (WebGL2)';
        this._initWebGL2Pipelines();
        this.ready = true;
        if (this.pendingStatic) this.uploadStaticBuffers(this.pendingStatic);
        if (this.pendingDynamic) this.uploadDynamicBuffers(this.pendingDynamic);
        return this.backend;
      }
    } catch (err) {
      console.warn('WebGL2 init error:', err);
    }

    this.backend = 'canvas2d';
    this.adapterName = 'Software Plan Rasterizer';
    this.ready = true;
    return this.backend;
  }

  _initWebGPUPipelines() {
    const device = this.device;
    const shaderModule = device.createShaderModule({ code: ROAD_SURFACE_WGSL });

    // Uniform buffer: 64 floats = 256 bytes
    this.uniformBuffer = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const vertexBuffersLayout = [
      {
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' },
          { shaderLocation: 3, offset: 32, format: 'float32x4' },
        ],
      },
    ];

    this.surfacePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vsMain', buffers: vertexBuffersLayout },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
      },
    });

    this.wirePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vsMain', buffers: vertexBuffersLayout },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'line-list' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      },
    });

    this._ensureDepthTexture(this.canvas.width || 800, this.canvas.height || 600);
  }

  _ensureDepthTexture(w, h) {
    if (!this.device) return;
    if (this.depthTexture && this.depthW === w && this.depthH === h) return;
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthW = Math.max(1, w);
    this.depthH = Math.max(1, h);
    this.depthTexture = this.device.createTexture({
      size: [this.depthW, this.depthH],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  _initWebGL2Pipelines() {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('WebGL2 shader compile error:', gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, WEBGL2_VS);
    const fs = compile(gl.FRAGMENT_SHADER, WEBGL2_FS);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.glProgram = prog;

    this.glLocs = {
      uViewProj: gl.getUniformLocation(prog, 'uViewProj'),
      uCameraPos: gl.getUniformLocation(prog, 'uCameraPos'),
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uEnvParams: gl.getUniformLocation(prog, 'uEnvParams'),
      uSelectionParams: gl.getUniformLocation(prog, 'uSelectionParams'),
      uTexWeights0: gl.getUniformLocation(prog, 'uTexWeights0'),
      uTexWeights1: gl.getUniformLocation(prog, 'uTexWeights1'),
      uTexParams0: gl.getUniformLocation(prog, 'uTexParams0'),
      uTexParams1: gl.getUniformLocation(prog, 'uTexParams1'),
    };

    this.glStaticVAO = gl.createVertexArray();
    this.glStaticVBO = gl.createBuffer();
    this.glStaticTriIBO = gl.createBuffer();
    this.glStaticQuadIBO = gl.createBuffer();
    this.glStaticTriWireIBO = gl.createBuffer();

    this.glDynVAO = gl.createVertexArray();
    this.glDynVBO = gl.createBuffer();
    this.glDynTriIBO = gl.createBuffer();
    this.glDynQuadIBO = gl.createBuffer();

    const bindAttribs = (vao, vbo) => {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
      gl.bindVertexArray(null);
    };
    bindAttribs(this.glStaticVAO, this.glStaticVBO);
    bindAttribs(this.glDynVAO, this.glDynVBO);
  }

  uploadStaticBuffers(buffers) {
    if (!buffers) return;
    if (!this.ready) {
      this.pendingStatic = buffers;
      return;
    }

    if (this.backend === 'webgpu') {
      const d = this.device;
      const makeBuf = (arr, usage) => {
        const byteLen = Math.max(16, Math.ceil(arr.byteLength / 4) * 4);
        const b = d.createBuffer({ size: byteLen, usage: usage | GPUBufferUsage.COPY_DST });
        if (arr.byteLength > 0) d.queue.writeBuffer(b, 0, arr);
        return b;
      };
      if (this.gpuStaticVBO) this.gpuStaticVBO.destroy();
      if (this.gpuStaticTriIBO) this.gpuStaticTriIBO.destroy();
      if (this.gpuStaticQuadIBO) this.gpuStaticQuadIBO.destroy();
      if (this.gpuStaticTriWireIBO) this.gpuStaticTriWireIBO.destroy();

      this.gpuStaticVBO = makeBuf(buffers.vertexBufferData, GPUBufferUsage.VERTEX);
      this.gpuStaticTriIBO = makeBuf(buffers.triangleIndices, GPUBufferUsage.INDEX);
      this.gpuStaticQuadIBO = makeBuf(buffers.quadLineIndices, GPUBufferUsage.INDEX);
      this.gpuStaticTriWireIBO = makeBuf(buffers.triLineIndices, GPUBufferUsage.INDEX);
      this.staticCount = {
        tris: buffers.triangleIndices.length,
        quadLines: buffers.quadLineIndices.length,
        triLines: buffers.triLineIndices.length,
      };
    } else if (this.backend === 'webgl2') {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glStaticVBO);
      gl.bufferData(gl.ARRAY_BUFFER, buffers.vertexBufferData, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticTriIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buffers.triangleIndices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticQuadIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buffers.quadLineIndices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticTriWireIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buffers.triLineIndices, gl.STATIC_DRAW);
      this.staticCount = {
        tris: buffers.triangleIndices.length,
        quadLines: buffers.quadLineIndices.length,
        triLines: buffers.triLineIndices.length,
      };
    }
  }

  uploadDynamicBuffers(buffers) {
    if (!buffers) return;
    if (!this.ready) {
      this.pendingDynamic = buffers;
      return;
    }

    if (this.backend === 'webgpu') {
      const d = this.device;
      const byteV = Math.max(64, Math.ceil(buffers.vertexBufferData.byteLength / 4) * 4);
      const byteI = Math.max(64, Math.ceil(buffers.triangleIndices.byteLength / 4) * 4);
      const byteQ = Math.max(64, Math.ceil(buffers.quadLineIndices.byteLength / 4) * 4);

      if (!this.gpuDynVBO || this.gpuDynVBOSize < byteV) {
        if (this.gpuDynVBO) this.gpuDynVBO.destroy();
        this.gpuDynVBOSize = byteV * 2;
        this.gpuDynVBO = d.createBuffer({ size: this.gpuDynVBOSize, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      if (!this.gpuDynTriIBO || this.gpuDynTriIBOSize < byteI) {
        if (this.gpuDynTriIBO) this.gpuDynTriIBO.destroy();
        this.gpuDynTriIBOSize = byteI * 2;
        this.gpuDynTriIBO = d.createBuffer({ size: this.gpuDynTriIBOSize, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      }
      if (!this.gpuDynQuadIBO || this.gpuDynQuadIBOSize < byteQ) {
        if (this.gpuDynQuadIBO) this.gpuDynQuadIBO.destroy();
        this.gpuDynQuadIBOSize = byteQ * 2;
        this.gpuDynQuadIBO = d.createBuffer({ size: this.gpuDynQuadIBOSize, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      }

      if (buffers.vertexBufferData.byteLength > 0) d.queue.writeBuffer(this.gpuDynVBO, 0, buffers.vertexBufferData);
      if (buffers.triangleIndices.byteLength > 0) d.queue.writeBuffer(this.gpuDynTriIBO, 0, buffers.triangleIndices);
      if (buffers.quadLineIndices.byteLength > 0) d.queue.writeBuffer(this.gpuDynQuadIBO, 0, buffers.quadLineIndices);

      this.dynamicCount = {
        tris: buffers.triangleIndices.length,
        quadLines: buffers.quadLineIndices.length,
      };
    } else if (this.backend === 'webgl2') {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glDynVBO);
      gl.bufferData(gl.ARRAY_BUFFER, buffers.vertexBufferData, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glDynTriIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buffers.triangleIndices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glDynQuadIBO);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buffers.quadLineIndices, gl.DYNAMIC_DRAW);
      this.dynamicCount = {
        tris: buffers.triangleIndices.length,
        quadLines: buffers.quadLineIndices.length,
      };
    }
  }

  project(pt, vpW, vpH) {
    if (!this.lastViewProj) return null;
    return projectWorldToScreen(pt, this.lastViewProj, vpW, vpH);
  }

  /**
   * Renders a full 3D frame with current camera, environment, and Texture Layer Stack parameters.
   */
  renderFrame(state) {
    if (!this.ready) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(64, Math.floor((this.canvas.clientWidth || 800) * dpr));
    const targetH = Math.max(64, Math.floor((this.canvas.clientHeight || 600) * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;
    const split2D = !!state.splitView;
    const vpX = split2D ? Math.floor(width * 0.44) : 0;
    const vpW = Math.max(64, width - vpX);
    const vpH = Math.max(64, height);

    const aspect = vpW / vpH;
    const fovRad = (46 * Math.PI) / 180;
    const view = mat4LookAt(state.camera.eye, state.camera.target, [0, 1, 0]);
    const proj =
      this.backend === 'webgpu'
        ? mat4PerspectiveZO(fovRad, aspect, 0.5, 650.0)
        : mat4PerspectiveNO(fovRad, aspect, 0.5, 650.0);
    const viewProj = mat4Multiply(proj, view);
    this.lastViewProj = viewProj;
    this.lastInvViewProj = mat4Invert(viewProj);
    this.lastViewportRect = { x: vpX, y: 0, w: vpW, h: vpH };

    const env = state.project.environment || {};
    const azRad = ((env.sunAzimuth ?? -42) * Math.PI) / 180;
    const elRad = ((env.sunElevation ?? 34) * Math.PI) / 180;
    const sunDir = vNorm([
      Math.cos(elRad) * Math.sin(azRad),
      Math.sin(elRad),
      Math.cos(elRad) * Math.cos(azRad),
    ]);

    // Extract Texture Layer Stack weights & parameters (T1..T8)
    const tMap = {};
    for (const tl of state.project.textureLayers || []) {
      tMap[tl.id] = tl.visible ? (tl.weight ?? 100) / 100 : 0.0;
    }
    const t1 = (state.project.textureLayers || []).find((l) => l.id === 'tex-bitumen')?.params || {};
    const t2 = (state.project.textureLayers || []).find((l) => l.id === 'tex-wheelwear')?.params || {};
    const t3 = (state.project.textureLayers || []).find((l) => l.id === 'tex-cracks')?.params || {};
    const t5 = (state.project.textureLayers || []).find((l) => l.id === 'tex-paving')?.params || {};
    const t8 = (state.project.textureLayers || []).find((l) => l.id === 'tex-wetness')?.params || {};

    const renderMode = state.renderMode ?? 0; // 0=PBR, 1=PBR+Quads, 2=QuadCage, 3=TriWire, 4=Clay, 5=TexMask
    const needsWireOverlay = renderMode === 1 || renderMode === 2 || renderMode === 3;

    const uData = new Float32Array(56);
    uData.set(viewProj, 0);
    uData.set([state.camera.eye[0], state.camera.eye[1], state.camera.eye[2], state.time || 0], 16);
    uData.set([sunDir[0], sunDir[1], sunDir[2], env.nightMode ? 0.25 : (env.sunIntensity ?? 2.6)], 20);
    uData.set([env.nightMode ? 0.35 : (env.skyIntensity ?? 1.15), env.fogDensity ?? 0.0018, env.exposure ?? 1.08, renderMode], 24);
    uData.set([state.selectedEntityId || 0, state.hoveredEntityId || 0, env.nightMode ? 1 : 0, 0], 28);
    uData.set([tMap['tex-bitumen'] ?? 1, tMap['tex-wheelwear'] ?? 0.8, tMap['tex-cracks'] ?? 0.7, tMap['tex-distress'] ?? 1], 32);
    uData.set([tMap['tex-paving'] ?? 1, tMap['tex-gutter'] ?? 0.7, tMap['tex-markings'] ?? 1, tMap['tex-wetness'] ?? 0.4], 36);
    uData.set([t1.aggregateScale ?? 18, t1.albedoDarkness ?? 0.22, t2.trackPolish ?? 0.62, t3.crackDensity ?? 0.58], 40);
    uData.set([t5.pavingScale ?? 1.0, t5.mortarDepth ?? 0.68, t8.wetness ?? 0.38, t8.puddleThreshold ?? 0.52], 44);

    if (this.backend === 'webgpu' && this.device && this.context) {
      this._ensureDepthTexture(width, height);
      this.device.queue.writeBuffer(this.uniformBuffer, 0, uData);

      const encoder = this.device.createCommandEncoder();
      const viewTex = this.context.getCurrentTexture().createView();
      const clearCol = env.nightMode ? { r: 0.03, g: 0.035, b: 0.05, a: 1 } : { r: 0.075, g: 0.08, b: 0.095, a: 1 };

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: viewTex,
            clearValue: clearCol,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depthTexture.createView(),
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });

      pass.setViewport(vpX, 0, vpW, vpH, 0, 1);
      pass.setScissorRect(vpX, 0, vpW, vpH);
      pass.setPipeline(this.surfacePipeline);
      pass.setBindGroup(0, this.bindGroup);

      if (this.gpuStaticVBO && this.staticCount.tris > 0) {
        pass.setVertexBuffer(0, this.gpuStaticVBO);
        pass.setIndexBuffer(this.gpuStaticTriIBO, 'uint32');
        pass.drawIndexed(this.staticCount.tris);
      }
      if (this.gpuDynVBO && this.dynamicCount.tris > 0) {
        pass.setVertexBuffer(0, this.gpuDynVBO);
        pass.setIndexBuffer(this.gpuDynTriIBO, 'uint32');
        pass.drawIndexed(this.dynamicCount.tris);
      }
      pass.end();
      this.device.queue.submit([encoder.finish()]);

      // Optional Quad or Triangle Wireframe Overlay Pass
      if (needsWireOverlay && this.gpuStaticVBO) {
        uData[31] = 1.0; // wirePassFlag = 1
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uData);

        const wireEncoder = this.device.createCommandEncoder();
        const wirePass = wireEncoder.beginRenderPass({
          colorAttachments: [
            {
              view: viewTex,
              loadOp: 'load',
              storeOp: 'store',
            },
          ],
          depthStencilAttachment: {
            view: this.depthTexture.createView(),
            depthLoadOp: 'load',
            depthStoreOp: 'store',
          },
        });
        wirePass.setViewport(vpX, 0, vpW, vpH, 0, 1);
        wirePass.setScissorRect(vpX, 0, vpW, vpH);
        wirePass.setPipeline(this.wirePipeline);
        wirePass.setBindGroup(0, this.bindGroup);

        wirePass.setVertexBuffer(0, this.gpuStaticVBO);
        if (renderMode === 3 && this.staticCount.triLines > 0) {
          wirePass.setIndexBuffer(this.gpuStaticTriWireIBO, 'uint32');
          wirePass.drawIndexed(this.staticCount.triLines);
        } else if (this.staticCount.quadLines > 0) {
          wirePass.setIndexBuffer(this.gpuStaticQuadIBO, 'uint32');
          wirePass.drawIndexed(this.staticCount.quadLines);
        }
        if (this.gpuDynVBO && this.dynamicCount.quadLines > 0) {
          wirePass.setVertexBuffer(0, this.gpuDynVBO);
          wirePass.setIndexBuffer(this.gpuDynQuadIBO, 'uint32');
          wirePass.drawIndexed(this.dynamicCount.quadLines);
        }
        wirePass.end();
        this.device.queue.submit([wireEncoder.finish()]);
      }
    } else if (this.backend === 'webgl2' && this.gl) {
      const gl = this.gl;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      gl.viewport(0, 0, width, height);
      if (env.nightMode) gl.clearColor(0.03, 0.035, 0.05, 1.0);
      else gl.clearColor(0.075, 0.08, 0.095, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.viewport(vpX, 0, vpW, vpH);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vpX, 0, vpW, vpH);

      gl.useProgram(this.glProgram);
      gl.uniformMatrix4fv(this.glLocs.uViewProj, false, viewProj);
      gl.uniform4fv(this.glLocs.uCameraPos, uData.subarray(16, 20));
      gl.uniform4fv(this.glLocs.uSunDir, uData.subarray(20, 24));
      gl.uniform4fv(this.glLocs.uEnvParams, uData.subarray(24, 28));
      gl.uniform4fv(this.glLocs.uSelectionParams, uData.subarray(28, 32));
      gl.uniform4fv(this.glLocs.uTexWeights0, uData.subarray(32, 36));
      gl.uniform4fv(this.glLocs.uTexWeights1, uData.subarray(36, 40));
      gl.uniform4fv(this.glLocs.uTexParams0, uData.subarray(40, 44));
      gl.uniform4fv(this.glLocs.uTexParams1, uData.subarray(44, 48));

      if (this.staticCount.tris > 0) {
        gl.bindVertexArray(this.glStaticVAO);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticTriIBO);
        gl.drawElements(gl.TRIANGLES, this.staticCount.tris, gl.UNSIGNED_INT, 0);
      }
      if (this.dynamicCount.tris > 0) {
        gl.bindVertexArray(this.glDynVAO);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glDynTriIBO);
        gl.drawElements(gl.TRIANGLES, this.dynamicCount.tris, gl.UNSIGNED_INT, 0);
      }

      if (needsWireOverlay) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        uData[31] = 1.0;
        gl.uniform4fv(this.glLocs.uSelectionParams, uData.subarray(28, 32));
        gl.bindVertexArray(this.glStaticVAO);
        if (renderMode === 3 && this.staticCount.triLines > 0) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticTriWireIBO);
          gl.drawElements(gl.LINES, this.staticCount.triLines, gl.UNSIGNED_INT, 0);
        } else if (this.staticCount.quadLines > 0) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glStaticQuadIBO);
          gl.drawElements(gl.LINES, this.staticCount.quadLines, gl.UNSIGNED_INT, 0);
        }
        if (this.dynamicCount.quadLines > 0) {
          gl.bindVertexArray(this.glDynVAO);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.glDynQuadIBO);
          gl.drawElements(gl.LINES, this.dynamicCount.quadLines, gl.UNSIGNED_INT, 0);
        }
        gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
      gl.disable(gl.SCISSOR_TEST);
    }
  }
}
