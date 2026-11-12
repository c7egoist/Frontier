import {
  FULLSCREEN_VERT,
  GBUFFER_VERT,
  GBUFFER_FRAG,
  SDF_UNION_FRAG,
  REFLECTION_SDF_FRAG,
  REFLECTION_BVH_FRAG,
  COMPOSITE_FRAG,
} from "./BenchmarkShaders.js";

//========================================================================================================================
// RIGHT-HANDED LINEAR ALGEBRA (+X Forward, +Y Left, +Z Up; X x Y = +Z)
//========================================================================================================================
function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function mat4ComposeRigid(tx, ty, tz, yawZ, pitchY = 0, rollX = 0) {
  const cz = Math.cos(yawZ), sz = Math.sin(yawZ);
  const cy = Math.cos(pitchY), sy = Math.sin(pitchY);
  const cx = Math.cos(rollX), sx = Math.sin(rollX);
  // R = Rz(yaw) * Ry(pitch) * Rx(roll) in column-major
  const m = new Float32Array(16);
  m[0] = cz * cy;
  m[1] = sz * cy;
  m[2] = -sy;
  m[3] = 0;

  m[4] = cz * sy * sx - sz * cx;
  m[5] = sz * sy * sx + cz * cx;
  m[6] = cy * sx;
  m[7] = 0;

  m[8] = cz * sy * cx + sz * sx;
  m[9] = sz * sy * cx - cz * sx;
  m[10] = cy * cx;
  m[11] = 0;

  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  m[15] = 1;
  return m;
}

function mat4InvertRigid(m) {
  // Transpose 3x3 rotation + inverse translate
  const inv = new Float32Array(16);
  inv[0] = m[0]; inv[1] = m[4]; inv[2]  = m[8];  inv[3]  = 0;
  inv[4] = m[1]; inv[5] = m[5]; inv[6]  = m[9];  inv[7]  = 0;
  inv[8] = m[2]; inv[9] = m[6]; inv[10] = m[10]; inv[11] = 0;
  const tx = m[12], ty = m[13], tz = m[14];
  inv[12] = -(inv[0] * tx + inv[4] * ty + inv[8]  * tz);
  inv[13] = -(inv[1] * tx + inv[5] * ty + inv[9]  * tz);
  inv[14] = -(inv[2] * tx + inv[6] * ty + inv[10] * tz);
  inv[15] = 1;
  return inv;
}

function mat4InvertGeneral(m) {
  const inv = new Float32Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
  let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  det = Math.abs(det) > 1e-12 ? 1.0 / det : 0.0;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

// Right-Handed LookAt (+Z Up world -> Right-Handed OpenGL/WebGL clip space)
function mat4LookAtRH(eye, target, up = [0, 0, 1]) {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  // s = normalize(cross(f, up))
  let sx = fy * up[2] - fz * up[1];
  let sy = fz * up[0] - fx * up[2];
  let sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;

  // u = cross(s, f)
  const ux = sy * fz - sz * fy;
  const uy = sz * fx - sx * fz;
  const uz = sx * fy - sy * fx;

  const m = new Float32Array(16);
  m[0] = sx;  m[4] = sy;  m[8]  = sz;  m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  m[1] = ux;  m[5] = uy;  m[9]  = uz;  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  m[2] = -fx; m[6] = -fy; m[10] = -fz; m[14] =  (fx * eye[0] + fy * eye[1] + fz * eye[2]);
  m[3] = 0;   m[7] = 0;   m[11] = 0;   m[15] = 1;
  return m;
}

function mat4PerspectiveRH(fovYRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovYRad * 0.5);
  const nf = 1.0 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function decodeFloat16(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7C00) >> 10;
  const f = h & 0x03FF;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1F) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

function unpackOctahedralJs(packed20) {
  const p = Math.round(packed20);
  const u = ((p & 1023) / 1023.0) * 2.0 - 1.0;
  const v = (((p >>> 10) & 1023) / 1023.0) * 2.0 - 1.0;
  let nx = u, ny = v, nz = 1.0 - Math.abs(u) - Math.abs(v);
  if (nz < 0.0) {
    const ox = nx, oy = ny;
    nx = (1.0 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
    ny = (1.0 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function smoothstepJs(e0, e1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - e0) / (e1 - e0)));
  return t * t * (3.0 - 2.0 * t);
}

// Pre-lit surface radiosity helper matching evalSurfaceDirectRadiance 1:1 for static ProvingGround Global SDF cascades
function evalStaticArenaVoxelRadiosity(matId, px, py, pz, sunDir) {
  let ar = 0.09, ag = 0.095, ab = 0.11, rough = 0.42, metal = 0.25, coat = 0.0, coatRough = 0.04;
  let er = 0, eg = 0, eb = 0;
  if (matId === 1) {
    const gx = Math.abs(px * 0.25 + 0.5 - Math.floor(px * 0.25 + 0.5)) - 0.5;
    const gy = Math.abs(py * 0.25 + 0.5 - Math.floor(py * 0.25 + 0.5)) - 0.5;
    const grid = 1.0 - smoothstepJs(0.008, 0.016, Math.min(Math.abs(gx), Math.abs(gy)));
    const lane = (1.0 - smoothstepJs(0.04, 0.06, Math.abs(Math.abs(py) - 3.65))) * (Math.abs(px) < 11.0 ? 1.0 : 0.0);
    const br = 0.042 * (1 - grid * 0.55) + 0.075 * (grid * 0.55);
    const bg = 0.046 * (1 - grid * 0.55) + 0.082 * (grid * 0.55);
    const bb = 0.054 * (1 - grid * 0.55) + 0.098 * (grid * 0.55);
    ar = br * (1 - lane * 0.75) + 0.68 * (lane * 0.75);
    ag = bg * (1 - lane * 0.75) + 0.54 * (lane * 0.75);
    ab = bb * (1 - lane * 0.75) + 0.14 * (lane * 0.75);
    rough = 0.22; metal = 0.05; coat = 0.45; coatRough = 0.14;
  } else if (matId === 2) {
    ar = 0.90; ag = 0.93; ab = 0.97; rough = 0.035; metal = 0.98; coat = 0.5; coatRough = 0.03;
  } else if (matId === 3) {
    ar = 0.94; ag = 0.74; ab = 0.44; rough = 0.045; metal = 0.96; coat = 0.4; coatRough = 0.04;
  } else if (matId === 4) {
    ar = 0.11; ag = 0.12; ab = 0.15; rough = 0.28; metal = 0.65;
  } else if (matId === 5) {
    ar = 0.95; ag = 0.98; ab = 1.0; rough = 0.15; er = 7.5; eg = 8.6; eb = 10.5;
  } else if (matId === 17) {
    ar = 0.92; ag = 0.26; ab = 0.04; rough = 0.18; metal = 0.1; coat = 0.65; coatRough = 0.08;
  }

  let nx = 0, ny = 0.7071, nz = 0.7071;
  if (matId === 1) { nx = 0; ny = 0; nz = 1; }
  else if (matId === 2) { nx = 0; ny = -1; nz = 0; }
  else if (matId === 3) { nx = -1; ny = 0; nz = 0; }
  else if (matId === 5) { nx = 0; ny = 0; nz = -1; }

  const ndl = Math.max(0, nx * sunDir[0] + ny * sunDir[1] + nz * sunDir[2]);
  const s = nz * 0.5 + 0.5;
  let ir = 3.1 * ndl + (0.10 * (1 - s) + 0.36 * s);
  let ig = 2.85 * ndl + (0.11 * (1 - s) + 0.48 * s);
  let ib = 2.55 * ndl + (0.14 * (1 - s) + 0.68 * s);

  if (pz < 4.30) {
    for (let i = -1; i <= 1; i++) {
      const dx = i * 4.2 - px, dy = Math.max(-5.2, Math.min(5.2, py)) - py, dz = 4.30 - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const invL = 1.0 / Math.sqrt(Math.max(d2, 1e-4));
      const pNdl = Math.max(0, (nx * dx + ny * dy + nz * dz) * invL);
      const att = pNdl / (1.0 + 0.22 * d2);
      ir += 1.15 * att; ig += 1.32 * att; ib += 1.65 * att;
    }
  }

  const diffScale = (1.0 - metal) / Math.PI;
  const rr = Math.min(24.0, er + ar * diffScale * ir);
  const rg = Math.min(24.0, eg + ag * diffScale * ig);
  const rb = Math.min(24.0, eb + ab * diffScale * ib);
  const refl = Math.min(0.95, Math.max(0.0, (metal * 0.75 + coat * 0.45) * (1.0 - rough)));
  return [rr, rg, rb, refl];
}

//========================================================================================================================
// WEBGL2 HELPERS
//========================================================================================================================
function compileProgram(gl, vsSrc, fsSrc) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error("VS error: " + gl.getShaderInfoLog(vs));
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error("FS error: " + gl.getShaderInfoLog(fs));
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link error: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

//========================================================================================================================
// MAIN APPLICATION
//========================================================================================================================
const PAINT_PALETTE = [
  [0.08, 0.37, 0.94], // Sapphire Clearcoat
  [0.86, 0.12, 0.14], // Crimson Metallic
  [0.92, 0.68, 0.06], // Solar Gold
  [0.03, 0.59, 0.40], // Emerald Pearl
  [0.82, 0.85, 0.90], // Liquid Silver
  [0.05, 0.055, 0.07], // Obsidian Mirror
];

const SUN_DIR = (() => {
  const v = [0.46, -0.38, 0.80];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

const TLAS_RESERVED_NODES = 32;
const TLAS_LEAF_BIT = 0x40000000;

async function startBenchmark() {
  const canvas = document.getElementById("viewport-canvas");
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
  if (!gl) {
    document.getElementById("loading-banner").textContent = "WebGL2 is required to run this GPU benchmark.";
    return;
  }

  const extFloat = gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  const extTimer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const dbgRenderInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuString = dbgRenderInfo
    ? gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  document.getElementById("gpu-readout").textContent =
    (gpuString || "WebGL2 GPU").replace(/ANGLE \(([^,]+), ([^,(]+).*\)/, "$2").slice(0, 26);

  if (!extFloat) {
    document.getElementById("loading-banner").textContent = "EXT_color_buffer_float is required on this GPU.";
    return;
  }

  // Load packed authentic ControlVehicle + ProvingGround binary bundle
  const resp = await fetch("./Assets/VehicleBenchmarkAssets.bin");
  const arrayBuf = await resp.arrayBuffer();
  const dv = new DataView(arrayBuf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "FVB1") throw new Error("Invalid asset header: " + magic);

  const meshCount = dv.getUint32(4, true);
  const totalBlasNodes = dv.getUint32(8, true);
  const totalTris = dv.getUint32(12, true);
  const sdfCount = dv.getUint32(16, true);

  let offset = 20;
  const meshMeta = [];
  for (let i = 0; i < meshCount; i++) {
    meshMeta.push({
      nodeOffset: dv.getUint32(offset, true),
      nodeCount: dv.getUint32(offset + 4, true),
      triOffset: dv.getUint32(offset + 8, true),
      triCount: dv.getUint32(offset + 12, true),
    });
    offset += 16;
  }

  // Read BLAS nodes & shift internal child links by +TLAS_RESERVED_NODES (exact float32 — zero denormals!)
  const totalCombinedNodes = TLAS_RESERVED_NODES + totalBlasNodes;
  const nodeTexWidth = 2048;
  const nodeTexHeight = Math.ceil((totalCombinedNodes * 2) / nodeTexWidth);
  const nodeTexData = new Float32Array(nodeTexWidth * nodeTexHeight * 4);

  const meshLocalBounds = meshMeta.map(() => ({ min: [0, 0, 0], max: [0, 0, 0] }));
  for (let n = 0; n < totalBlasNodes; n++) {
    const minX = dv.getFloat32(offset + 0, true);
    const minY = dv.getFloat32(offset + 4, true);
    const minZ = dv.getFloat32(offset + 8, true);
    let leftOrFirst = Math.round(dv.getFloat32(offset + 12, true));
    const maxX = dv.getFloat32(offset + 16, true);
    const maxY = dv.getFloat32(offset + 20, true);
    const maxZ = dv.getFloat32(offset + 24, true);
    const count = Math.round(dv.getFloat32(offset + 28, true));
    offset += 32;

    if (count === 0) {
      leftOrFirst += TLAS_RESERVED_NODES;
    }
    const dstTexel = (TLAS_RESERVED_NODES + n) * 2;
    nodeTexData[dstTexel * 4 + 0] = minX;
    nodeTexData[dstTexel * 4 + 1] = minY;
    nodeTexData[dstTexel * 4 + 2] = minZ;
    nodeTexData[dstTexel * 4 + 3] = leftOrFirst;

    nodeTexData[(dstTexel + 1) * 4 + 0] = maxX;
    nodeTexData[(dstTexel + 1) * 4 + 1] = maxY;
    nodeTexData[(dstTexel + 1) * 4 + 2] = maxZ;
    nodeTexData[(dstTexel + 1) * 4 + 3] = count;

    for (let m = 0; m < meshCount; m++) {
      if (n === meshMeta[m].nodeOffset) {
        meshLocalBounds[m].min = [minX, minY, minZ];
        meshLocalBounds[m].max = [maxX, maxY, maxZ];
      }
    }
  }

  // Read triangles into uBvhTris AND build WebGL VAO per mesh for primary G-Buffer rasterization
  const triTexWidth = 2048;
  const triTexHeight = Math.ceil((totalTris * 4) / triTexWidth);
  const triTexData = new Float32Array(triTexWidth * triTexHeight * 4);
  const triBytesSrc = new Uint8Array(arrayBuf, offset, totalTris * 64);
  new Uint8Array(triTexData.buffer, 0, totalTris * 64).set(triBytesSrc);

  const meshVaos = [];
  for (let m = 0; m < meshCount; m++) {
    const { triOffset, triCount } = meshMeta[m];
    const vboFloats = new Float32Array(triCount * 3 * 7);
    let ptr = 0;
    for (let t = 0; t < triCount; t++) {
      const b = offset + (triOffset + t) * 64;
      const p0x = dv.getFloat32(b + 0, true), p0y = dv.getFloat32(b + 4, true), p0z = dv.getFloat32(b + 8, true);
      const matId = Math.round(dv.getFloat32(b + 12, true));
      const e1x = dv.getFloat32(b + 16, true), e1y = dv.getFloat32(b + 20, true), e1z = dv.getFloat32(b + 24, true);
      const n0 = unpackOctahedralJs(dv.getFloat32(b + 28, true));
      const e2x = dv.getFloat32(b + 32, true), e2y = dv.getFloat32(b + 36, true), e2z = dv.getFloat32(b + 40, true);
      const n1 = unpackOctahedralJs(dv.getFloat32(b + 44, true));
      const n2 = unpackOctahedralJs(dv.getFloat32(b + 60, true));

      const verts = [
        [p0x, p0y, p0z, n0[0], n0[1], n0[2], matId],
        [p0x + e1x, p0y + e1y, p0z + e1z, n1[0], n1[1], n1[2], matId],
        [p0x + e2x, p0y + e2y, p0z + e2z, n2[0], n2[1], n2[2], matId],
      ];
      for (const v of verts) {
        for (let k = 0; k < 7; k++) vboFloats[ptr++] = v[k];
      }
    }
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vboFloats, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 24);
    gl.bindVertexArray(null);
    meshVaos.push({ vao, vertexCount: triCount * 3 });
  }
  offset += totalTris * 64;

  // Read 5 SDF volumes: 0=BodySDF, 1=RimSDF, 2=TyreSDF (fp16), 3=Clip0Static, 4=Clip1Static (fp16 + uint16 mat)
  const sdfVolumes = [];
  for (let s = 0; s < sdfCount; s++) {
    const nx = dv.getUint32(offset + 0, true);
    const ny = dv.getUint32(offset + 4, true);
    const nz = dv.getUint32(offset + 8, true);
    const byteLen = dv.getUint32(offset + 12, true);
    const min = [dv.getFloat32(offset + 16, true), dv.getFloat32(offset + 20, true), dv.getFloat32(offset + 24, true)];
    const max = [dv.getFloat32(offset + 28, true), dv.getFloat32(offset + 32, true), dv.getFloat32(offset + 36, true)];
    offset += 40;
    const payload = new Uint8Array(arrayBuf, offset, byteLen);
    offset += byteLen;
    while (offset % 4 !== 0) offset++;
    sdfVolumes.push({ nx, ny, nz, min, max, payload });
  }

  function createPartSdf3D(vol) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const u16 = new Uint16Array(vol.payload.buffer, vol.payload.byteOffset, vol.nx * vol.ny * vol.nz);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, vol.nx, vol.ny, vol.nz, 0, gl.RED, gl.HALF_FLOAT, u16);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createArenaCascade3D(vol, needDynamicCopy) {
    const count = vol.nx * vol.ny * vol.nz;
    const rgba = new Float32Array(count * 4);
    const refl = new Float32Array(count);
    const view = new DataView(vol.payload.buffer, vol.payload.byteOffset, vol.payload.byteLength);
    const sx = (vol.max[0] - vol.min[0]) / vol.nx;
    const sy = (vol.max[1] - vol.min[1]) / vol.ny;
    const sz = (vol.max[2] - vol.min[2]) / vol.nz;
    let idx = 0;
    for (let iz = 0; iz < vol.nz; iz++) {
      const pz = vol.min[2] + (iz + 0.5) * sz;
      for (let iy = 0; iy < vol.ny; iy++) {
        const py = vol.min[1] + (iy + 0.5) * sy;
        for (let ix = 0; ix < vol.nx; ix++) {
          const px = vol.min[0] + (ix + 0.5) * sx;
          const dist = decodeFloat16(view.getUint16(idx * 4, true));
          const matId = view.getUint16(idx * 4 + 2, true);
          const [rr, rg, rb, rf] = evalStaticArenaVoxelRadiosity(matId, px, py, pz, SUN_DIR);
          rgba[idx * 4 + 0] = rr;
          rgba[idx * 4 + 1] = rg;
          rgba[idx * 4 + 2] = rb;
          rgba[idx * 4 + 3] = dist;
          refl[idx] = rf;
          idx++;
        }
      }
    }
    const makeRgbaTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, vol.nx, vol.ny, vol.nz, 0, gl.RGBA, gl.FLOAT, rgba);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      return tex;
    };
    const makeReflTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, vol.nx, vol.ny, vol.nz, 0, gl.RED, gl.FLOAT, refl);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      return tex;
    };
    return needDynamicCopy
      ? { texA: makeRgbaTex(), texB: makeRgbaTex(), reflA: makeReflTex(), reflB: makeReflTex() }
      : { texA: makeRgbaTex(), reflA: makeReflTex() };
  }

  const bodySdfTex = createPartSdf3D(sdfVolumes[0]);
  const rimSdfTex  = createPartSdf3D(sdfVolumes[1]);
  const tyreSdfTex = createPartSdf3D(sdfVolumes[2]);
  const clip0Pair  = createArenaCascade3D(sdfVolumes[3], true);  // texA/reflA = static base, texB/reflB = live unioned Clip0!
  const clip1Pair  = createArenaCascade3D(sdfVolumes[4], false); // texA/reflA = live Clip1

  const linearSampler = gl.createSampler();
  gl.samplerParameteri(linearSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.samplerParameteri(linearSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(linearSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(linearSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(linearSampler, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  const nearestSampler = gl.createSampler();
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  // BVH GPU textures (RGBA32F)
  const bvhNodesTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bvhNodesTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, nodeTexWidth, nodeTexHeight, 0, gl.RGBA, gl.FLOAT, nodeTexData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const bvhTrisTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, bvhTrisTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, triTexWidth, triTexHeight, 0, gl.RGBA, gl.FLOAT, triTexData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const instancesData = new Float32Array(128 * 4);
  const instancesTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, instancesTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 128, 1, 0, gl.RGBA, gl.FLOAT, instancesData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Compile GPU Programs
  const progGBuffer   = compileProgram(gl, GBUFFER_VERT, GBUFFER_FRAG);
  const progSdfUnion  = compileProgram(gl, FULLSCREEN_VERT, SDF_UNION_FRAG);
  const progReflSdf   = compileProgram(gl, FULLSCREEN_VERT, REFLECTION_SDF_FRAG);
  const progReflBvh   = compileProgram(gl, FULLSCREEN_VERT, REFLECTION_BVH_FRAG);
  const progComposite = compileProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);
  const emptyVao      = gl.createVertexArray();

  // Pre-create FBO for dynamic Clip0 Z-slice updates (slices 0..24 cover Z = -0.35m .. +2.45m)
  const sdfUnionFbo = gl.createFramebuffer();

  // Screen-sized G-Buffer + Half-res Reflection Targets (matching VehicleHMI half-res reflection dispatch!)
  let screenW = 0, screenH = 0, traceW = 0, traceH = 0;
  let gBufferFbo = null, gPosTex = null, gNormTex = null, gDirectTex = null, gDepthRb = null;
  let reflSdfFbo = null, reflSdfTex = null;
  let reflBvhFbo = null, reflBvhTex = null;

  function makeTargetTex(w, h, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function resizeTargets() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(640, Math.floor(window.innerWidth * dpr));
    const h = Math.max(360, Math.floor(window.innerHeight * dpr));
    if (w === screenW && h === screenH) return;
    screenW = w; screenH = h;
    traceW = Math.max(320, Math.floor(w * 0.5));
    traceH = Math.max(180, Math.floor(h * 0.5));
    canvas.width = w;
    canvas.height = h;

    if (gBufferFbo) {
      gl.deleteFramebuffer(gBufferFbo);
      gl.deleteTexture(gPosTex); gl.deleteTexture(gNormTex); gl.deleteTexture(gDirectTex);
      gl.deleteRenderbuffer(gDepthRb);
      gl.deleteFramebuffer(reflSdfFbo); gl.deleteTexture(reflSdfTex);
      gl.deleteFramebuffer(reflBvhFbo); gl.deleteTexture(reflBvhTex);
    }

    gPosTex    = makeTargetTex(screenW, screenH, gl.NEAREST);
    gNormTex   = makeTargetTex(screenW, screenH, gl.NEAREST);
    gDirectTex = makeTargetTex(screenW, screenH, gl.LINEAR);
    gDepthRb   = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, gDepthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, screenW, screenH);

    gBufferFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, gBufferFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gPosTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, gNormTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, gDirectTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, gDepthRb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);

    reflSdfTex = makeTargetTex(traceW, traceH, gl.LINEAR);
    reflSdfFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflSdfFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reflSdfTex, 0);

    reflBvhTex = makeTargetTex(traceW, traceH, gl.LINEAR);
    reflBvhFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflBvhFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reflBvhTex, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  resizeTargets();
  window.addEventListener("resize", resizeTargets);

  //======================================================================================================================
  // INTERACTIVE STATE & VEHICLE PHYSICS (Right-Handed: +X Fwd, +Y Left, +Z Up)
  //======================================================================================================================
  const state = {
    displayMode: 2, // 0=SDF, 1=BVH, 2=Split (default hero side-by-side!), 3=Delta
    maxBounces: 2,
    useHiZAssist: true,
    traceNeeShadows: true,
    legacyRough80: true,
    driveMode: "auto",
    chaseCam: false,
    paintIdx: 0,
    splitX: 0.5,

    carX: 0.0,
    carY: 0.65,
    carYaw: 0.42,
    carSpeed: 0.0,
    steerAngle: 0.0,
    wheelSpin: 0.0,
    autoTime: 0.0,

    camYaw: -1.46,
    camPitch: 0.22,
    camDist: 5.9,

    sdfMs: 0.0,
    bvhMs: 0.0,
    unionMs: 0.08,
    pixelDeltaPct: 4.1,
  };

  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      if (state.driveMode !== "manual") {
        state.driveMode = "manual";
        syncDriveButtons();
      }
    }
    if (k === "r") {
      state.carX = 0; state.carY = 0; state.carYaw = 0.08; state.carSpeed = 0; state.steerAngle = 0;
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  // Orbit Camera & Split Divider Drag
  let draggingCam = false, draggingSplit = false, lastMx = 0, lastMy = 0;
  canvas.addEventListener("pointerdown", (e) => {
    draggingCam = true; lastMx = e.clientX; lastMy = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (draggingSplit) {
      state.splitX = Math.min(0.92, Math.max(0.08, e.clientX / window.innerWidth));
      document.getElementById("split-divider").style.left = (state.splitX * 100).toFixed(1) + "%";
      return;
    }
    if (!draggingCam) return;
    const dx = e.clientX - lastMx, dy = e.clientY - lastMy;
    lastMx = e.clientX; lastMy = e.clientY;
    state.camYaw -= dx * 0.0065;
    state.camPitch = Math.min(1.25, Math.max(0.06, state.camPitch + dy * 0.0055));
  });
  window.addEventListener("pointerup", () => { draggingCam = false; draggingSplit = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    state.camDist = Math.min(16.5, Math.max(3.6, state.camDist + e.deltaY * 0.005));
  }, { passive: false });

  const splitDiv = document.getElementById("split-divider");
  splitDiv.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    draggingSplit = true;
  });

  // Scene Instances & Dynamic TLAS Builder (10 instances: 0=Body, 1..4=Rim, 5..8=Tyre, 9=Arena)
  const WHEEL_MOUNTS = [
    { x:  1.665, y:  1.045, front: true,  right: false }, // FL (+X Fwd, +Y Left)
    { x:  1.665, y: -1.045, front: true,  right: true  }, // FR
    { x: -1.705, y:  1.045, front: false, right: false }, // RL
    { x: -1.705, y: -1.045, front: false, right: true  }, // RR
  ];
  const TYRE_RADIUS = 0.50855;

  let activeInstances = [];
  function updateSceneInstances(dt) {
    if (state.driveMode === "auto") {
      state.autoTime += dt;
      // Smooth figure-8 right across the 17m Silver Mirror Inspection Wall (clear of all calibration pylons!)
      const t = state.autoTime * 0.52;
      const nextX = Math.sin(t) * 2.25;
      const nextY = 0.45 + Math.sin(t * 2.0) * 1.15;
      const dx = nextX - state.carX;
      const dy = nextY - state.carY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-4) {
        const targetYaw = Math.atan2(dy, dx);
        let diff = targetYaw - state.carYaw;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        state.steerAngle = Math.max(-0.46, Math.min(0.46, diff * 2.4));
        state.carYaw = targetYaw;
      }
      state.carX = nextX;
      state.carY = nextY;
      state.wheelSpin += (dist / TYRE_RADIUS);
    } else {
      const throttle = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      const steerIn  = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
      const targetSteer = steerIn * 0.48;
      state.steerAngle += (targetSteer - state.steerAngle) * Math.min(1, dt * 8.5);
      if (throttle !== 0) {
        state.carSpeed += throttle * 6.8 * dt;
      } else {
        state.carSpeed *= Math.pow(0.22, dt);
      }
      if (keys.has(" ")) state.carSpeed *= Math.pow(0.02, dt);
      state.carSpeed = Math.max(-4.5, Math.min(6.5, state.carSpeed));

      const wheelbase = 3.37;
      state.carYaw += (state.carSpeed / wheelbase) * Math.tan(state.steerAngle) * dt;
      state.carX += Math.cos(state.carYaw) * state.carSpeed * dt;
      state.carY += Math.sin(state.carYaw) * state.carSpeed * dt;
      // Keep inside proving pad bounds
      state.carX = Math.max(-5.2, Math.min(5.2, state.carX));
      state.carY = Math.max(-3.1, Math.min(3.1, state.carY));
      state.wheelSpin += (state.carSpeed * dt) / TYRE_RADIUS;
    }

    const cy = Math.cos(state.carYaw), sy = Math.sin(state.carYaw);
    const bodyModel = mat4ComposeRigid(state.carX, state.carY, TYRE_RADIUS, state.carYaw, 0, 0);
    const bodyInv   = mat4InvertRigid(bodyModel);

    const wheelModels = [];
    const wheelInvs   = [];
    for (const wm of WHEEL_MOUNTS) {
      const wx = state.carX + wm.x * cy - wm.y * sy;
      const wy = state.carY + wm.x * sy + wm.y * cy;
      const wYaw = state.carYaw + (wm.front ? state.steerAngle : 0) + (wm.right ? Math.PI : 0);
      const spin = wm.right ? -state.wheelSpin : state.wheelSpin;
      const mYaw = mat4ComposeRigid(wx, wy, TYRE_RADIUS, wYaw, 0, 0);
      const mSpin = mat4ComposeRigid(0, 0, 0, 0, spin, 0);
      const m = mat4Multiply(mYaw, mSpin);
      wheelModels.push(m);
      wheelInvs.push(mat4InvertRigid(m));
    }

    const arenaModel = mat4Identity();
    const arenaInv   = mat4Identity();

    activeInstances = [
      { meshIdx: 0, l2w: bodyModel, w2l: bodyInv, matOverride: -1 },
      { meshIdx: 1, l2w: wheelModels[0], w2l: wheelInvs[0], matOverride: -1 },
      { meshIdx: 1, l2w: wheelModels[1], w2l: wheelInvs[1], matOverride: -1 },
      { meshIdx: 1, l2w: wheelModels[2], w2l: wheelInvs[2], matOverride: -1 },
      { meshIdx: 1, l2w: wheelModels[3], w2l: wheelInvs[3], matOverride: -1 },
      { meshIdx: 2, l2w: wheelModels[0], w2l: wheelInvs[0], matOverride: 11 },
      { meshIdx: 2, l2w: wheelModels[1], w2l: wheelInvs[1], matOverride: 11 },
      { meshIdx: 2, l2w: wheelModels[2], w2l: wheelInvs[2], matOverride: 11 },
      { meshIdx: 2, l2w: wheelModels[3], w2l: wheelInvs[3], matOverride: 11 },
      { meshIdx: 3, l2w: arenaModel, w2l: arenaInv, matOverride: -1 },
    ];

    // Pack instances into uInstances texture
    for (let i = 0; i < activeInstances.length; i++) {
      const base = i * 9 * 4;
      instancesData.set(activeInstances[i].l2w, base);
      instancesData.set(activeInstances[i].w2l, base + 16);
      instancesData[base + 32] = activeInstances[i].matOverride + 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, instancesTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 1, gl.RGBA, gl.FLOAT, instancesData);

    // Rebuild 10-leaf balanced binary TLAS at node indices [0 .. 18]
    const leaves = activeInstances.map((inst, idx) => {
      const lb = meshLocalBounds[inst.meshIdx];
      const wmin = [1e30, 1e30, 1e30], wmax = [-1e30, -1e30, -1e30];
      const m = inst.l2w;
      for (let c = 0; c < 8; c++) {
        const lx = (c & 1) ? lb.max[0] : lb.min[0];
        const ly = (c & 2) ? lb.max[1] : lb.min[1];
        const lz = (c & 4) ? lb.max[2] : lb.min[2];
        const wx = m[0]*lx + m[4]*ly + m[8]*lz + m[12];
        const wy = m[1]*lx + m[5]*ly + m[9]*lz + m[13];
        const wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
        if (wx < wmin[0]) wmin[0] = wx; if (wy < wmin[1]) wmin[1] = wy; if (wz < wmin[2]) wmin[2] = wz;
        if (wx > wmax[0]) wmax[0] = wx; if (wy > wmax[1]) wmax[1] = wy; if (wz > wmax[2]) wmax[2] = wz;
      }
      const blasRoot = TLAS_RESERVED_NODES + meshMeta[inst.meshIdx].nodeOffset;
      return { min: wmin, max: wmax, leftOrFirst: blasRoot, count: -(idx + 1) };
    });

    let nextTlasSlot = 1;
    function writeTlasNode(slot, min, max, lof, cnt) {
      const t = slot * 2;
      nodeTexData[t * 4 + 0] = min[0]; nodeTexData[t * 4 + 1] = min[1]; nodeTexData[t * 4 + 2] = min[2];
      nodeTexData[t * 4 + 3] = lof;
      nodeTexData[(t + 1) * 4 + 0] = max[0]; nodeTexData[(t + 1) * 4 + 1] = max[1]; nodeTexData[(t + 1) * 4 + 2] = max[2];
      nodeTexData[(t + 1) * 4 + 3] = cnt;
    }

    function buildTlasSlot(slot, list) {
      if (list.length === 1) {
        writeTlasNode(slot, list[0].min, list[0].max, list[0].leftOrFirst, list[0].count);
        return;
      }
      const bmin = [1e30, 1e30, 1e30], bmax = [-1e30, -1e30, -1e30];
      for (const it of list) {
        for (let k = 0; k < 3; k++) {
          if (it.min[k] < bmin[k]) bmin[k] = it.min[k];
          if (it.max[k] > bmax[k]) bmax[k] = it.max[k];
        }
      }
      const spans = [bmax[0]-bmin[0], bmax[1]-bmin[1], bmax[2]-bmin[2]];
      const axis = spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : (spans[1] >= spans[2] ? 1 : 2);
      list.sort((a, b) => (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]));
      const mid = list.length >> 1;
      const leftSlot = nextTlasSlot;
      nextTlasSlot += 2;
      writeTlasNode(slot, bmin, bmax, leftSlot, 0);
      buildTlasSlot(leftSlot, list.slice(0, mid));
      buildTlasSlot(leftSlot + 1, list.slice(mid));
    }
    buildTlasSlot(0, leaves);

    gl.bindTexture(gl.TEXTURE_2D, bvhNodesTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TLAS_RESERVED_NODES * 2, 1, gl.RGBA, gl.FLOAT,
      nodeTexData.subarray(0, TLAS_RESERVED_NODES * 2 * 4));

    return { bodyModel, bodyInv, wheelInvs };
  }

  //======================================================================================================================
  // GPU PASS RUNNERS
  //======================================================================================================================
  const clip0Vol = sdfVolumes[3];
  const clip1Vol = sdfVolumes[4];
  const clip0Span = [clip0Vol.max[0]-clip0Vol.min[0], clip0Vol.max[1]-clip0Vol.min[1], clip0Vol.max[2]-clip0Vol.min[2]];
  const clip1Span = [clip1Vol.max[0]-clip1Vol.min[0], clip1Vol.max[1]-clip1Vol.min[1], clip1Vol.max[2]-clip1Vol.min[2]];
  const clip0Voxel = clip0Span[2] / clip0Vol.nz;
  const clip1Voxel = clip1Span[2] / clip1Vol.nz;

  function runDynamicGlobalSdfUnion(bodyModel, bodyInv, wheelInvs) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sdfUnionFbo);
    gl.viewport(0, 0, clip0Vol.nx, clip0Vol.ny);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progSdfUnion);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, clip0Pair.texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, clip0Pair.reflA);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_3D, bodySdfTex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, rimSdfTex);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, tyreSdfTex);

    gl.uniform1i(gl.getUniformLocation(progSdfUnion, "uStaticClip0"), 0);
    gl.uniform1i(gl.getUniformLocation(progSdfUnion, "uStaticClip0Refl"), 1);
    gl.uniform1i(gl.getUniformLocation(progSdfUnion, "uBodySdf"), 2);
    gl.uniform1i(gl.getUniformLocation(progSdfUnion, "uRimSdf"), 3);
    gl.uniform1i(gl.getUniformLocation(progSdfUnion, "uTyreSdf"), 4);

    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uClip0Min"), clip0Vol.min);
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uClip0Max"), clip0Vol.max);

    const bVol = sdfVolumes[0], rVol = sdfVolumes[1], tVol = sdfVolumes[2];
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uBodySdfMin"), bVol.min);
    gl.uniform3f(gl.getUniformLocation(progSdfUnion, "uBodySdfInvSpan"),
      1/(bVol.max[0]-bVol.min[0]), 1/(bVol.max[1]-bVol.min[1]), 1/(bVol.max[2]-bVol.min[2]));
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uRimSdfMin"), rVol.min);
    gl.uniform3f(gl.getUniformLocation(progSdfUnion, "uRimSdfInvSpan"),
      1/(rVol.max[0]-rVol.min[0]), 1/(rVol.max[1]-rVol.min[1]), 1/(rVol.max[2]-rVol.min[2]));
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uTyreSdfMin"), tVol.min);
    gl.uniform3f(gl.getUniformLocation(progSdfUnion, "uTyreSdfInvSpan"),
      1/(tVol.max[0]-tVol.min[0]), 1/(tVol.max[1]-tVol.min[1]), 1/(tVol.max[2]-tVol.min[2]));

    gl.uniformMatrix4fv(gl.getUniformLocation(progSdfUnion, "uBodyLocalToWorld"), false, bodyModel);
    gl.uniformMatrix4fv(gl.getUniformLocation(progSdfUnion, "uBodyWorldToLocal"), false, bodyInv);
    const flatWheels = new Float32Array(64);
    for (let w = 0; w < 4; w++) flatWheels.set(wheelInvs[w], w * 16);
    gl.uniformMatrix4fv(gl.getUniformLocation(progSdfUnion, "uWheelWorldToLocal[0]"), false, flatWheels);
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uSunDir"), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(progSdfUnion, "uPaintColor"), PAINT_PALETTE[state.paintIdx]);

    const sliceLoc = gl.getUniformLocation(progSdfUnion, "uSliceZNorm");
    gl.bindVertexArray(emptyVao);
    // Z slices 0..28 intersect ControlVehicle height + narrow-band shell [-0.35m .. +2.26m]
    for (let iz = 0; iz <= 28; iz++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, clip0Pair.texB, 0, iz);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, clip0Pair.reflB, 0, iz);
      if (iz === 0) {
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      }
      gl.uniform1f(sliceLoc, (iz + 0.5) / clip0Vol.nz);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  function runGBufferPass(viewProj, camPos) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, gBufferFbo);
    gl.viewport(0, 0, screenW, screenH);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(progGBuffer);
    gl.uniformMatrix4fv(gl.getUniformLocation(progGBuffer, "uViewProj"), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(progGBuffer, "uCamPos"), camPos);
    gl.uniform3fv(gl.getUniformLocation(progGBuffer, "uSunDir"), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(progGBuffer, "uPaintColor"), PAINT_PALETTE[state.paintIdx]);

    const modelLoc = gl.getUniformLocation(progGBuffer, "uModel");
    const overLoc  = gl.getUniformLocation(progGBuffer, "uMatOverride");
    for (const inst of activeInstances) {
      const m = meshVaos[inst.meshIdx];
      gl.bindVertexArray(m.vao);
      gl.uniformMatrix4fv(modelLoc, false, inst.l2w);
      gl.uniform1i(overLoc, inst.matOverride);
      gl.drawArrays(gl.TRIANGLES, 0, m.vertexCount);
    }
  }

  function runReflectionSdfPass(viewProj, camPos) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflSdfFbo);
    gl.viewport(0, 0, traceW, traceH);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progReflSdf);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gPosTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gNormTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, gDirectTex);

    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, clip0Pair.texB);  gl.bindSampler(3, linearSampler);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_3D, clip0Pair.reflB); gl.bindSampler(4, linearSampler);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_3D, clip1Pair.texA);  gl.bindSampler(5, linearSampler);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_3D, clip1Pair.reflA); gl.bindSampler(6, linearSampler);

    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uGPosRough"), 0);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uGNormMat"), 1);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uGDirect"), 2);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uClip0Linear"), 3);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uClip0Refl"), 4);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uClip1Linear"), 5);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uClip1Refl"), 6);

    gl.uniform3fv(gl.getUniformLocation(progReflSdf, "uClip0Min"), clip0Vol.min);
    gl.uniform3f(gl.getUniformLocation(progReflSdf, "uClip0InvSpan"), 1/clip0Span[0], 1/clip0Span[1], 1/clip0Span[2]);
    gl.uniform1f(gl.getUniformLocation(progReflSdf, "uClip0Voxel"), clip0Voxel);

    gl.uniform3fv(gl.getUniformLocation(progReflSdf, "uClip1Min"), clip1Vol.min);
    gl.uniform3f(gl.getUniformLocation(progReflSdf, "uClip1InvSpan"), 1/clip1Span[0], 1/clip1Span[1], 1/clip1Span[2]);
    gl.uniform1f(gl.getUniformLocation(progReflSdf, "uClip1Voxel"), clip1Voxel);

    gl.uniformMatrix4fv(gl.getUniformLocation(progReflSdf, "uViewProj"), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(progReflSdf, "uCamPos"), camPos);
    gl.uniform3fv(gl.getUniformLocation(progReflSdf, "uSunDir"), SUN_DIR);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uMaxBounces"), state.maxBounces);
    gl.uniform1f(gl.getUniformLocation(progReflSdf, "uRoughnessCutoff"), 0.50);
    gl.uniform1i(gl.getUniformLocation(progReflSdf, "uUseHiZAssist"), state.useHiZAssist ? 1 : 0);

    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    for (let u = 3; u <= 6; u++) gl.bindSampler(u, null);
  }

  function runReflectionBvhPass(camPos) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflBvhFbo);
    gl.viewport(0, 0, traceW, traceH);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progReflBvh);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gPosTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gNormTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bvhNodesTex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bvhTrisTex);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, instancesTex);

    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uGPosRough"), 0);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uGNormMat"), 1);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uBvhNodes"), 2);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uBvhTris"), 3);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uInstances"), 4);

    gl.uniform3fv(gl.getUniformLocation(progReflBvh, "uCamPos"), camPos);
    gl.uniform3fv(gl.getUniformLocation(progReflBvh, "uSunDir"), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(progReflBvh, "uPaintColor"), PAINT_PALETTE[state.paintIdx]);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uMaxBounces"), state.maxBounces);
    gl.uniform1f(gl.getUniformLocation(progReflBvh, "uRoughnessCutoff"), state.legacyRough80 ? 0.80 : 0.50);
    gl.uniform1i(gl.getUniformLocation(progReflBvh, "uTraceNeeShadows"), state.traceNeeShadows ? 1 : 0);

    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function runCompositePass(invViewProj, camPos) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenW, screenH);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progComposite);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gPosTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gNormTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, gDirectTex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, reflSdfTex);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, reflBvhTex);

    gl.uniform1i(gl.getUniformLocation(progComposite, "uGPosRough"), 0);
    gl.uniform1i(gl.getUniformLocation(progComposite, "uGNormMat"), 1);
    gl.uniform1i(gl.getUniformLocation(progComposite, "uGDirect"), 2);
    gl.uniform1i(gl.getUniformLocation(progComposite, "uReflSdf"), 3);
    gl.uniform1i(gl.getUniformLocation(progComposite, "uReflBvh"), 4);

    gl.uniformMatrix4fv(gl.getUniformLocation(progComposite, "uInvViewProj"), false, invViewProj);
    gl.uniform3fv(gl.getUniformLocation(progComposite, "uCamPos"), camPos);
    gl.uniform3fv(gl.getUniformLocation(progComposite, "uSunDir"), SUN_DIR);
    gl.uniform3fv(gl.getUniformLocation(progComposite, "uPaintColor"), PAINT_PALETTE[state.paintIdx]);
    gl.uniform1i(gl.getUniformLocation(progComposite, "uDisplayMode"), state.displayMode);
    gl.uniform1f(gl.getUniformLocation(progComposite, "uSplitX"), state.splitX);

    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  //======================================================================================================================
  // EXACT ISOLATED GPU BENCHMARKING (gl.finish() Differential Multi-Dispatch + EXT_disjoint_timer_query_webgl2)
  //======================================================================================================================
  function computeCamera() {
    const target = [state.carX, state.carY, 0.78];
    const yaw = state.chaseCam ? state.carYaw + Math.PI : state.camYaw;
    const pitch = state.chaseCam ? 0.24 : state.camPitch;
    const dist = state.chaseCam ? 6.8 : state.camDist;
    const camPos = [
      target[0] + Math.cos(pitch) * Math.cos(yaw) * dist,
      target[1] + Math.cos(pitch) * Math.sin(yaw) * dist,
      target[2] + Math.sin(pitch) * dist,
    ];
    const view = mat4LookAtRH(camPos, target, [0, 0, 1]);
    const proj = mat4PerspectiveRH(48 * Math.PI / 180, screenW / screenH, 0.15, 120.0);
    const viewProj = mat4Multiply(proj, view);
    const invViewProj = mat4InvertGeneral(viewProj);
    return { camPos, viewProj, invViewProj };
  }

  function updateTelemetryUi() {
    const totalSdf = state.sdfMs + state.unionMs;
    const bvh = Math.max(state.bvhMs, 0.01);
    const ratio = bvh / Math.max(totalSdf, 0.02);

    document.getElementById("sdf-ms-readout").textContent = `${totalSdf.toFixed(2)} ms`;
    document.getElementById("bvh-ms-readout").textContent = `${bvh.toFixed(2)} ms`;
    document.getElementById("union-ms-readout").textContent = `${state.unionMs.toFixed(2)} ms`;
    document.getElementById("speedup-readout").textContent = `${ratio.toFixed(1)}× Faster`;
    document.getElementById("delta-readout").textContent = `${state.pixelDeltaPct.toFixed(2)} %`;

    const maxBar = Math.max(totalSdf, bvh, 1.0);
    document.getElementById("sdf-bar").style.width = `${Math.max(4, (totalSdf / maxBar) * 100).toFixed(1)}%`;
    document.getElementById("bvh-bar").style.width = `${Math.max(4, (bvh / maxBar) * 100).toFixed(1)}%`;
  }

  function runSynchronizedBenchmark(iterations = 12) {
    const btn = document.getElementById("run-benchmark-btn");
    btn.disabled = true;
    btn.textContent = "Measuring Isolated GPU Reflection Passes…";

    requestAnimationFrame(() => {
      const { bodyModel, bodyInv, wheelInvs } = updateSceneInstances(0);
      const { camPos, viewProj } = computeCamera();
      runGBufferPass(viewProj, camPos);
      runDynamicGlobalSdfUnion(bodyModel, bodyInv, wheelInvs);
      runReflectionSdfPass(viewProj, camPos);
      runReflectionBvhPass(camPos);
      gl.finish();

      // 1. Measure Dynamic Car SDF Union Pass
      const tU0 = performance.now();
      for (let i = 0; i < iterations; i++) runDynamicGlobalSdfUnion(bodyModel, bodyInv, wheelInvs);
      gl.finish();
      const unionMs = (performance.now() - tU0) / iterations;

      // 2. Measure Multi-Bounce Global SDF Reflection Pass
      const tS0 = performance.now();
      for (let i = 0; i < iterations; i++) runReflectionSdfPass(viewProj, camPos);
      gl.finish();
      const sdfMs = (performance.now() - tS0) / iterations;

      // 3. Measure Multi-Bounce Two-Level SAH Compute BVH Reflection Pass
      const bvhIters = Math.max(4, Math.floor(iterations * 0.5));
      const tB0 = performance.now();
      for (let i = 0; i < bvhIters; i++) runReflectionBvhPass(camPos);
      gl.finish();
      const bvhMs = (performance.now() - tB0) / bvhIters;

      // 4. Measure Mean Pixel Delta (%) across 64x36 composite sample grid
      const sampleW = 64, sampleH = 36;
      const readFbo = gl.createFramebuffer();
      const readTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, sampleW, sampleH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, readFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, readTex, 0);
      gl.viewport(0, 0, sampleW, sampleH);
      gl.useProgram(progComposite);

      const prevMode = state.displayMode;
      const pixelsSdf = new Uint8Array(sampleW * sampleH * 4);
      const pixelsBvh = new Uint8Array(sampleW * sampleH * 4);
      const { invViewProj } = computeCamera();

      state.displayMode = 0;
      gl.uniform1i(gl.getUniformLocation(progComposite, "uDisplayMode"), 0);
      gl.uniformMatrix4fv(gl.getUniformLocation(progComposite, "uInvViewProj"), false, invViewProj);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, sampleW, sampleH, gl.RGBA, gl.UNSIGNED_BYTE, pixelsSdf);

      state.displayMode = 1;
      gl.uniform1i(gl.getUniformLocation(progComposite, "uDisplayMode"), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, sampleW, sampleH, gl.RGBA, gl.UNSIGNED_BYTE, pixelsBvh);
      state.displayMode = prevMode;

      gl.deleteFramebuffer(readFbo);
      gl.deleteTexture(readTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      let diffAccum = 0;
      const pxCount = sampleW * sampleH * 3;
      for (let i = 0; i < sampleW * sampleH; i++) {
        diffAccum += Math.abs(pixelsSdf[i * 4 + 0] - pixelsBvh[i * 4 + 0]) / 255.0;
        diffAccum += Math.abs(pixelsSdf[i * 4 + 1] - pixelsBvh[i * 4 + 1]) / 255.0;
        diffAccum += Math.abs(pixelsSdf[i * 4 + 2] - pixelsBvh[i * 4 + 2]) / 255.0;
      }
      state.unionMs = Math.max(0.02, unionMs);
      state.sdfMs = Math.max(0.05, sdfMs);
      state.bvhMs = Math.max(0.10, bvhMs);
      state.pixelDeltaPct = (diffAccum / pxCount) * 100.0;
      updateTelemetryUi();

      btn.disabled = false;
      btn.textContent = "Run Exact GTX A/B Benchmark (16x Sync)";
    });
  }

  //======================================================================================================================
  // UI BINDINGS
  //======================================================================================================================
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.displayMode = parseInt(btn.dataset.mode, 10);
      document.querySelectorAll("[data-mode]").forEach((b) =>
        b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      splitDiv.style.display = state.displayMode === 2 ? "block" : "none";
    });
  });

  document.querySelectorAll("[data-bounces]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.maxBounces = parseInt(btn.dataset.bounces, 10);
      document.querySelectorAll("[data-bounces]").forEach((b) =>
        b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      runSynchronizedBenchmark(8);
    });
  });

  function syncDriveButtons() {
    document.querySelectorAll("[data-drive]").forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.drive === state.driveMode ? "true" : "false"));
  }
  document.querySelectorAll("[data-drive]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.driveMode = btn.dataset.drive;
      syncDriveButtons();
    });
  });

  function bindChip(id, prop, recalib = true) {
    const el = document.getElementById(id);
    el.addEventListener("click", () => {
      state[prop] = !state[prop];
      el.setAttribute("aria-pressed", state[prop] ? "true" : "false");
      if (recalib) runSynchronizedBenchmark(8);
    });
  }
  bindChip("toggle-hiz", "useHiZAssist", true);
  bindChip("toggle-nee", "traceNeeShadows", true);
  bindChip("toggle-rough80", "legacyRough80", true);
  bindChip("toggle-chase", "chaseCam", false);

  document.querySelectorAll(".paint-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      state.paintIdx = parseInt(sw.dataset.paint, 10);
      document.querySelectorAll(".paint-swatch").forEach((s) =>
        s.setAttribute("aria-pressed", s === sw ? "true" : "false"));
    });
  });

  document.getElementById("run-benchmark-btn").addEventListener("click", () => runSynchronizedBenchmark(16));

  // Optional non-blocking hardware GPU timer query ring when exposed by browser
  let activeQuery = null, queryKind = "sdf";

  // Hide loading banner & run initial automatic benchmark after 2 warmup frames
  document.getElementById("loading-banner").style.display = "none";
  let frameCount = 0;
  let lastNow = performance.now();
  let fpsAccum = 0, fpsFrames = 0;

  function tick(now) {
    const dt = Math.min(0.05, (now - lastNow) * 0.001);
    lastNow = now;
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.35) {
      const fps = fpsFrames / fpsAccum;
      document.getElementById("fps-readout").textContent = `${fps.toFixed(0)} FPS (${(1000 / fps).toFixed(1)} ms)`;
      fpsAccum = 0;
      fpsFrames = 0;
    }

    const { bodyModel, bodyInv, wheelInvs } = updateSceneInstances(dt);
    const { camPos, viewProj, invViewProj } = computeCamera();

    runGBufferPass(viewProj, camPos);

    const needSdf = state.displayMode === 0 || state.displayMode === 2 || state.displayMode === 3;
    const needBvh = state.displayMode === 1 || state.displayMode === 2 || state.displayMode === 3;

    // Poll previous disjoint hardware timer query if available
    if (extTimer && activeQuery) {
      const avail = gl.getQueryParameter(activeQuery, gl.QUERY_RESULT_AVAILABLE);
      const disj = gl.getParameter(extTimer.GPU_DISJOINT_EXT);
      if (avail && !disj) {
        const ns = gl.getQueryParameter(activeQuery, gl.QUERY_RESULT);
        const ms = ns / 1e6;
        if (ms > 0.01) {
          if (queryKind === "sdf") state.sdfMs = state.sdfMs * 0.85 + ms * 0.15;
          else state.bvhMs = state.bvhMs * 0.85 + ms * 0.15;
          updateTelemetryUi();
        }
      }
      if (avail || disj) {
        gl.deleteQuery(activeQuery);
        activeQuery = null;
      }
    }

    if (needSdf) {
      runDynamicGlobalSdfUnion(bodyModel, bodyInv, wheelInvs);
      if (extTimer && !activeQuery && (frameCount % 2 === 0)) {
        activeQuery = gl.createQuery();
        queryKind = "sdf";
        gl.beginQuery(extTimer.TIME_ELAPSED_EXT, activeQuery);
        runReflectionSdfPass(viewProj, camPos);
        gl.endQuery(extTimer.TIME_ELAPSED_EXT);
      } else {
        runReflectionSdfPass(viewProj, camPos);
      }
    }

    if (needBvh) {
      if (extTimer && !activeQuery && (frameCount % 2 === 1)) {
        activeQuery = gl.createQuery();
        queryKind = "bvh";
        gl.beginQuery(extTimer.TIME_ELAPSED_EXT, activeQuery);
        runReflectionBvhPass(camPos);
        gl.endQuery(extTimer.TIME_ELAPSED_EXT);
      } else {
        runReflectionBvhPass(camPos);
      }
    }

    runCompositePass(invViewProj, camPos);

    frameCount++;
    if (frameCount === 3) {
      runSynchronizedBenchmark(10);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

startBenchmark().catch((err) => {
  console.error(err);
  const banner = document.getElementById("loading-banner");
  banner.style.display = "flex";
  banner.textContent = "Benchmark init error: " + err.message;
});
