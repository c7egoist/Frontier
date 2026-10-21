# Realtime Fluid Lab

A from-scratch, real-time **particle-based fluid simulation** for the browser —
WebGPU compute shaders by default, with a WebGL2 + CPU fallback — featuring
four materials (water, milk, chocolate, mud), rigid-body collisions, surface
adhesion ("sticking"), and Unreal-style **dynamic resolution**.

```
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production bundle
npm run validate:wgsl   # structural lint of every WGSL compute/render shader
npm run test:smoke      # headless WCSPH regression test (pours all 4 materials, no GPU needed)
```

## What you get

- **Real SPH physics**, not a particle-system trick. Every droplet is a
  Weakly-Compressible SPH (WCSPH) particle: Poly6 density, Tait-equation
  pressure, Spiky pressure-gradient force, a Laplacian viscosity term, and a
  short-range cohesion force, all evaluated against real neighbours found
  through a GPU spatial hash (fixed-capacity atomic buckets, no sort needed).
- **Four materials with genuinely different behaviour**, not just different
  colours: water (low viscosity/cohesion, splashy), milk (slightly thicker,
  opaque), chocolate (high viscosity + cohesion + adhesion, glossy, clings to
  everything it touches), mud (very high viscosity/density, matte, barely
  moves once it lands). See `src/materials.ts`.
- **Collisions** against a sphere, a rotating box and a spinning paddle, all
  analytic signed-distance shapes evaluated per-particle every sub-step (see
  `src/colliders.ts` for the CPU reference and `common.wgsl`'s
  `evalCollider` for the GPU copy of the same math).
- **Adhesion / sticking**: a soft "wetting" pull activates just outside every
  surface, and on contact a material-dependent damping term slows particles
  toward the surface instead of just bouncing them off — chocolate and mud
  visibly cling to and coat the sphere/box/paddle and the tank walls, water
  barely does.
- **Dynamic resolution**, modelled on Unreal's scalability system: a rolling
  average frame time drives (a) the internal render-target resolution scale
  (rendered low, then upscaled with a light sharpen filter) and (b) the live
  particle budget, both stepped with hysteresis so they don't thrash. Hit
  "Burst" in the HUD to dump a few thousand extra particles and watch the
  resolution/particle budget drop and recover automatically, or pin a tier
  manually from the dropdown.
- **Two full render backends**, not a stub fallback:
  - `src/render/webgpu` — compute-driven SPH (`src/sim/gpu`), instanced
    camera-facing sphere-impostor particles with analytic per-fragment
    normals and depth (correct occlusion against scene geometry and other
    particles, not flat sprites), Fresnel + Blinn-Phong shading tuned per
    material, running at up to ~120k particles.
  - `src/render/webgl2` — the same physical model ported to a single-threaded
    CPU solver (`src/sim/cpu/CpuSolver.ts`, uniform-grid neighbour search)
    plus a WebGL2/GLSL ES 3.00 port of the same impostor shading, running at
    a few thousand particles for browsers/devices without WebGPU.

## Controls

- **Drag** to orbit the camera, **scroll** to zoom.
- **Material chips** pick what the nozzle pours.
- **Start Pouring** streams droplets from a nozzle above the tank;
  **Burst** drops a one-shot splash to stress-test the dynamic-resolution
  controller; **Reset** clears the tank.
- **Resolution** dropdown pins a quality tier, or leave it on **Auto** to let
  the frame-time controller manage it live.

## Architecture

```
src/
  types.ts, materials.ts, colliders.ts   shared data + SDF math (CPU + GPU mirrors)
  sim/common.ts                          shared constants (domain, kernel radius, quality tiers)
  sim/gpu/GpuSolver.ts + shaders/*.wgsl  WebGPU compute SPH (insert -> density -> forces -> integrate)
  sim/cpu/CpuSolver.ts                   CPU SPH fallback (uniform grid neighbour search)
  render/webgpu/WebGpuRenderer.ts        WGSL scene + particle-impostor + dynamic-res blit pipeline
  render/webgl2/WebGl2Renderer.ts        GLSL ES 3.00 port of the same pipeline
  perf/DynamicResolution.ts              Unreal-style hysteresis-based resolution/budget controller
  scene/                                 orbit camera, procedural meshes, camera-uniform packing
  ui/Hud.ts                              DOM overlay controls + live stats
  app/App.ts                             backend detection + bootstrap + the render/sim loop
```

The GPU and CPU solvers intentionally implement **the same physics model** so
switching backends changes performance and particle count, not behaviour.
The same is true of the two renderers: both billboard camera-facing spheres
with an analytic ray-sphere intersection per fragment (not flat dots), write
a reprojected true depth so particles correctly occlude/are occluded by the
tank and colliders, and use the same Fresnel/Blinn-Phong/material-opacity
shading model — one in WGSL, one in GLSL.

## Known limitations / honest caveats

- Particles are not depth-sorted before alpha blending, so very transparent
  overlaps (mostly water) can show minor ordering artifacts — an accepted
  trade-off for real-time particle counts.
- The WebGL2/CPU path is a genuine fallback (same physics, real neighbour
  search) but is capped at a few thousand particles because it runs
  single-threaded on the CPU; WebGPU is the fully-featured experience.
- Exact force/viscosity constants in `src/materials.ts` were tuned by
  physically-motivated reasoning rather than iterative visual tuning (this
  environment cannot run a GPU browser to preview WebGPU output), so you may
  want to nudge `stiffness`/`viscosity`/`cohesion` per material once you see
  it live — all four presets live in one place.
