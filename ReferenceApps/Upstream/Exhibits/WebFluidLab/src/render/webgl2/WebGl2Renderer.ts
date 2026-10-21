import sceneVert from "./shaders/scene.vert.glsl?raw";
import sceneFrag from "./shaders/scene.frag.glsl?raw";
import particlesVert from "./shaders/particles.vert.glsl?raw";
import particlesFrag from "./shaders/particles.frag.glsl?raw";
import blitVert from "./shaders/blit.vert.glsl?raw";
import blitFrag from "./shaders/blit.frag.glsl?raw";
import { boxMesh, planeMesh, sphereMesh, type Mesh } from "../../scene/Geometry.ts";
import type { OrbitCamera } from "../../scene/OrbitCamera.ts";
import type { CpuSolver } from "../../sim/cpu/CpuSolver.ts";
import type { ColliderSpec, ViewMode } from "../../types.ts";
import { MATERIAL_ORDER, MATERIAL_PRESETS, particleAlpha } from "../../materials.ts";
import { TANK_HALF_EXTENT } from "../../colliders.ts";
import { mat4, vec3 } from "gl-matrix";

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + log);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error("Program link error: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

interface SceneObj {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  model: mat4;
  color: [number, number, number, number];
  roughness: [number, number];
  spin: number;
  baseRotY: number;
  posX: number;
  posY: number;
  posZ: number;
}

export class WebGl2Renderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  private sceneProgram: WebGLProgram;
  private particleProgram: WebGLProgram;
  private blitProgram: WebGLProgram;

  private objects: SceneObj[] = [];
  private colliderObjects: SceneObj[] = [];

  private particleVao: WebGLVertexArrayObject;
  private particleInstanceBuffer: WebGLBuffer;
  private particleInstanceCapacity = 0;
  private particleScratch: Float32Array;

  private fbo: WebGLFramebuffer;
  private fboColorTex: WebGLTexture;
  private fboDepthRb: WebGLRenderbuffer;
  private internalW = 0;
  private internalH = 0;

  private blitVao: WebGLVertexArrayObject;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, maxParticles: number) {
    this.canvas = canvas;
    this.gl = gl;

    this.sceneProgram = linkProgram(gl, sceneVert, sceneFrag);
    this.particleProgram = linkProgram(gl, particlesVert, particlesFrag);
    this.blitProgram = linkProgram(gl, blitVert, blitFrag);

    this.particleScratch = new Float32Array(maxParticles * 8);
    this.particleInstanceBuffer = gl.createBuffer()!;
    this.particleVao = this.buildParticleVao();

    this.fbo = gl.createFramebuffer()!;
    this.fboColorTex = gl.createTexture()!;
    this.fboDepthRb = gl.createRenderbuffer()!;

    this.blitVao = gl.createVertexArray()!;

    this.buildStaticScene();
  }

  private buildMeshVao(mesh: Mesh): { vao: WebGLVertexArrayObject; indexCount: number } {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, indexCount: mesh.indices.length };
  }

  private buildParticleVao(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const quad = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceBuffer);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    return vao;
  }

  private addObject(mesh: Mesh, color: [number, number, number, number], roughness: [number, number]): SceneObj {
    const { vao, indexCount } = this.buildMeshVao(mesh);
    const obj: SceneObj = { vao, indexCount, model: mat4.create(), color, roughness, spin: 0, baseRotY: 0, posX: 0, posY: 0, posZ: 0 };
    this.objects.push(obj);
    return obj;
  }

  private buildStaticScene() {
    const floor = this.addObject(planeMesh(TANK_HALF_EXTENT[0] + 0.15, TANK_HALF_EXTENT[2] + 0.15), [0.14, 0.14, 0.17, 1], [0.75, 0.3]);
    mat4.identity(floor.model);

    const postH = TANK_HALF_EXTENT[1] * 2;
    const postMesh = boxMesh(0.035, postH * 0.5, 0.035);
    const corners: [number, number][] = [
      [-TANK_HALF_EXTENT[0], -TANK_HALF_EXTENT[2]],
      [TANK_HALF_EXTENT[0], -TANK_HALF_EXTENT[2]],
      [-TANK_HALF_EXTENT[0], TANK_HALF_EXTENT[2]],
      [TANK_HALF_EXTENT[0], TANK_HALF_EXTENT[2]],
    ];
    for (const [x, z] of corners) {
      const post = this.addObject(postMesh, [0.55, 0.58, 0.63, 1], [0.35, 0.6]);
      mat4.fromTranslation(post.model, [x, postH * 0.5, z]);
      post.posX = x;
      post.posY = postH * 0.5;
      post.posZ = z;
    }
  }

  setColliders(colliders: ColliderSpec[]) {
    for (const o of this.colliderObjects) {
      this.objects = this.objects.filter((x) => x !== o);
    }
    this.colliderObjects = [];
    for (const c of colliders) {
      const mesh = c.kind === "sphere" ? sphereMesh(c.size[0]) : boxMesh(c.size[0], c.size[1], c.size[2]);
      const obj = this.addObject(mesh, [c.color[0], c.color[1], c.color[2], 1], [0.4, 0.5]);
      mat4.fromRotationTranslation(obj.model, [0, Math.sin(c.rotationY / 2), 0, Math.cos(c.rotationY / 2)], [c.position[0], c.position[1], c.position[2]]);
      obj.spin = c.spinSpeed;
      obj.baseRotY = c.rotationY;
      obj.posX = c.position[0];
      obj.posY = c.position[1];
      obj.posZ = c.position[2];
      this.colliderObjects.push(obj);
    }
  }

  private ensureTargets(w: number, h: number) {
    const gl = this.gl;
    const ww = Math.max(1, Math.floor(w));
    const hh = Math.max(1, Math.floor(h));
    if (ww === this.internalW && hh === this.internalH) return;
    this.internalW = ww;
    this.internalH = hh;

    gl.bindTexture(gl.TEXTURE_2D, this.fboColorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ww, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.fboDepthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, ww, hh);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboColorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.fboDepthRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  render(opts: { camera: OrbitCamera; renderScale: number; viewMode: ViewMode; solver: CpuSolver; time: number }) {
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = Math.max(1, Math.round(rect.width * dpr));
    const displayH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== displayW || this.canvas.height !== displayH) {
      this.canvas.width = displayW;
      this.canvas.height = displayH;
    }
    this.ensureTargets(displayW * opts.renderScale, displayH * opts.renderScale);

    const aspect = displayW / displayH;
    const proj = opts.camera.projMatrixNegOneToOne(aspect);
    const view = opts.camera.viewMatrix();
    const viewProj = mat4.create();
    mat4.multiply(viewProj, proj, view);

    const eye = opts.camera.eye;
    const forward = vec3.create();
    vec3.subtract(forward, opts.camera.target, eye);
    vec3.normalize(forward, forward);
    const right = vec3.create();
    vec3.cross(right, forward, [0, 1, 0]);
    vec3.normalize(right, right);
    const up = vec3.create();
    vec3.cross(up, right, forward);
    vec3.normalize(up, up);
    const lightDir = vec3.fromValues(0.45, 0.82, 0.3);
    vec3.normalize(lightDir, lightDir);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.internalW, this.internalH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.BLEND);
    gl.clearColor(0.03, 0.035, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (const obj of this.colliderObjects) {
      if (obj.spin !== 0) {
        const angle = obj.baseRotY + obj.spin * opts.time;
        mat4.fromRotationTranslation(obj.model, [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)], [obj.posX, obj.posY, obj.posZ]);
      }
    }

    gl.useProgram(this.sceneProgram);
    const sp = this.sceneProgram;
    gl.uniformMatrix4fv(gl.getUniformLocation(sp, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(sp, "uCameraPos"), eye[0], eye[1], eye[2]);
    gl.uniform3f(gl.getUniformLocation(sp, "uLightDir"), lightDir[0], lightDir[1], lightDir[2]);
    for (const obj of this.objects) {
      gl.uniformMatrix4fv(gl.getUniformLocation(sp, "uModel"), false, obj.model);
      gl.uniform4f(gl.getUniformLocation(sp, "uColor"), obj.color[0], obj.color[1], obj.color[2], obj.color[3]);
      gl.uniform2f(gl.getUniformLocation(sp, "uRoughness"), obj.roughness[0], obj.roughness[1]);
      gl.bindVertexArray(obj.vao);
      gl.drawElements(gl.TRIANGLES, obj.indexCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    if ((opts.viewMode === "particles" || opts.viewMode === "both") && opts.solver.activeCount > 0) {
      this.renderParticles(opts.solver, viewProj, right, up, forward, lightDir, eye);
    }

    // Blit internal resolution target up to the swapchain-sized default framebuffer.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, displayW, displayH);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboColorTex);
    gl.uniform1i(gl.getUniformLocation(this.blitProgram, "uSrc"), 0);
    gl.uniform2f(gl.getUniformLocation(this.blitProgram, "uTexel"), 1 / this.internalW, 1 / this.internalH);
    gl.bindVertexArray(this.blitVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private renderParticles(solver: CpuSolver, viewProj: mat4, right: vec3, up: vec3, forward: vec3, lightDir: vec3, eye: vec3) {
    const gl = this.gl;
    const n = solver.activeCount;
    if (n > this.particleInstanceCapacity) {
      this.particleInstanceCapacity = n;
    }
    const data = this.particleScratch;
    for (let i = 0; i < n; i++) {
      const base = i * 8;
      data[base + 0] = solver.posX[i];
      data[base + 1] = solver.posY[i];
      data[base + 2] = solver.posZ[i];
      data[base + 3] = solver.matIdx[i];
      data[base + 4] = Math.hypot(solver.velX[i], solver.velY[i], solver.velZ[i]);
      data[base + 5] = solver.contact[i];
      data[base + 6] = 0;
      data[base + 7] = 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleInstanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 8), gl.DYNAMIC_DRAW);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.particleProgram);
    const pp = this.particleProgram;
    gl.uniformMatrix4fv(gl.getUniformLocation(pp, "uViewProj"), false, viewProj);
    gl.uniform3f(gl.getUniformLocation(pp, "uCameraRight"), right[0], right[1], right[2]);
    gl.uniform3f(gl.getUniformLocation(pp, "uCameraUp"), up[0], up[1], up[2]);
    gl.uniform3f(gl.getUniformLocation(pp, "uCameraForward"), forward[0], forward[1], forward[2]);
    gl.uniform3f(gl.getUniformLocation(pp, "uCameraPos"), eye[0], eye[1], eye[2]);
    gl.uniform3f(gl.getUniformLocation(pp, "uLightDir"), lightDir[0], lightDir[1], lightDir[2]);

    const radii = MATERIAL_ORDER.map((id) => MATERIAL_PRESETS[id].particleRadius);
    gl.uniform4f(gl.getUniformLocation(pp, "uMatRadius"), radii[0], radii[1], radii[2], radii[3]);
    const colorsR = MATERIAL_ORDER.map((id) => MATERIAL_PRESETS[id].color[0]);
    const colorsG = MATERIAL_ORDER.map((id) => MATERIAL_PRESETS[id].color[1]);
    const colorsB = MATERIAL_ORDER.map((id) => MATERIAL_PRESETS[id].color[2]);
    const roughness = MATERIAL_ORDER.map((id) => MATERIAL_PRESETS[id].roughness);
    gl.uniform4f(gl.getUniformLocation(pp, "uMatColorR"), colorsR[0], colorsR[1], colorsR[2], colorsR[3]);
    gl.uniform4f(gl.getUniformLocation(pp, "uMatColorG"), colorsG[0], colorsG[1], colorsG[2], colorsG[3]);
    gl.uniform4f(gl.getUniformLocation(pp, "uMatColorB"), colorsB[0], colorsB[1], colorsB[2], colorsB[3]);
    gl.uniform4f(gl.getUniformLocation(pp, "uMatRoughness"), roughness[0], roughness[1], roughness[2], roughness[3]);
    const opacities = MATERIAL_ORDER.map((id) => particleAlpha(MATERIAL_PRESETS[id]));
    gl.uniform4f(gl.getUniformLocation(pp, "uMatOpacity"), opacities[0], opacities[1], opacities[2], opacities[3]);

    gl.bindVertexArray(this.particleVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
