# Frontier Ocean

A large-scale, real-time **ocean** rendered in the browser with WebGPU, driven by an
actual **GPU shallow-water / wave-equation solve** — **no FFT, no baked spectrum, no
looping animation texture**. Every frame integrates a PDE.

```bash
npm install
npm run dev      # http://localhost:5173
```

Requires WebGPU (Chrome/Edge 113+, Safari 18+, Firefox 141+).

Controls: drag to look · `W A S D` fly, `Q`/`E` down/up · `Shift` boost · scroll = FOV.

---

## 1. Research: how large oceans are actually done in real time

| Approach | Cost at ocean scale | Breaking waves | Interacts with terrain/objects | Verdict |
|---|---|---|---|---|
| **Tessendorf FFT spectra** (Sea of Thieves, UE5 Water) | very cheap, O(N² log N) on a 256² tile | no | no (needs hacks) | excluded by the brief |
| **Gerstner sums** | trivial | no | no | too fake at close range |
| **3D SPH / PBF / FLIP** everywhere | millions of particles for one lake | yes | yes | impossible at km scale |
| **Shallow Water Equations (SWE) on a heightfield** | O(N²) per step, 2D only | no (needs particles) | **yes, natively** | ✅ chosen |
| SWE + spray/sheet particles (Chentanez & Müller 2010; Thürey et al. 2007) | +small | yes | yes | ✅ chosen |
| Virtual-pipes SWE (lisyarus, terrain flooding) | cheap, very stable | no | yes | good for rivers, over-damped for open sea |

Key references:

- Chentanez & Müller, *Real-time Simulation of Large Bodies of Water with Small Scale Details*, SCA 2010 — the canonical "SWE heightfield + spray particles + procedural small-scale detail" hybrid, in CUDA. This demo is essentially a WebGPU reinterpretation of it.
- Thürey, Müller-Fischer, Schirm, Gross, *Real-time Breaking Waves for Shallow Water Simulations*, PG 2007 — detect steep fronts, spawn particle sheets.
- Kurganov & Petrova 2007 / Brodtkorb et al., *Efficient shallow water simulations on GPUs* — the well-balanced finite-volume scheme used when you need physical accuracy over game speed.
- Yuksel, House, Keyser, *Wave Particles*, SIGGRAPH 2007 — Lagrangian alternative, unconditionally stable, great for interaction but not for a wind-driven sea.
- Jeschke et al., *Making Procedural Water Waves Boundary-aware* — shoreline treatment for procedural waves.

**Why a plain finite-volume SWE solver is the wrong tool for the *open* ocean:**
the SWE are non-dispersive in deep water. Solving them on a single grid that
covers 10 km means either a cell size of metres (hundreds of millions of cells)
or no small waves at all. Every shipped SWE water system therefore restricts
itself to rivers/floods. The design below is what fixes that.

## 2. The design used here

### 2.1 Cascaded toroidal solve (the core idea)

Instead of one giant grid, three **periodic (toroidal) patches** are simulated,
each on the same `N×N` lattice but covering a different physical size:

| Band | Domain L | Content | Cell size @256² |
|---|---|---|---|
| 0 | 512 m | swell / long gravity waves | 2.0 m |
| 1 | 128 m | wind sea | 0.5 m |
| 2 | 32 m | chop / capillary detail | 0.125 m |

Each band is tiled infinitely across the world and the three are summed at
render time. Total cost is **3 × N²** cells — constant, independent of how far
you can see. 256² × 3 × 2 substeps ≈ 400 k cells/frame, which is nothing for a
GTX 1060.

Inside a band we integrate the linearised shallow-water system written as the
second-order wave equation

```
∂²h/∂t² = c² ∇²h − μ ∂h/∂t + F_wind
```

with a **semi-implicit (symplectic) Euler** step — stable, energy-preserving,
two texture fetches per neighbour, no pressure solve.

### 2.2 Recovering dispersion across bands

Real gravity waves are dispersive, `ω = √(g k tanh(k H))`; the wave equation is
not. We exploit the fact that each band only spans ~2 octaves and give every
band the **exact phase speed of its own dominant wavelength**:

```ts
c_b = sqrt(g / k_b * tanh(k_b * H)),   k_b = 2π / λ_b,  λ_b = L_b / 4
```

So swell genuinely outruns chop, and the intra-band error is negligible. `c` is
additionally clamped to the CFL limit `0.62·dx/dt` so the explicit scheme can
never blow up regardless of framerate.

### 2.3 Wind forcing (why the sea builds instead of dying out)

Two terms, both in the compute shader:

1. **Pressure turbulence** — advected fBm noise at the band's own scale, scaled by `U²`.
2. **Miles-type instability** — `−(ŵ·∇h)·U`, which pumps energy into crests already travelling downwind. This is what grows a flat sea into a developed sea when you raise the wind slider, instead of just adding noise.

Amplitude is bounded by a `tanh` soft limiter set from a Pierson-Moskowitz-like
fully-developed-sea cap — physically motivated *and* an unconditional stability
net on weak GPUs.

### 2.4 Choppiness without an FFT

Tessendorf's choppy displacement comes from a Hilbert transform in the spectral
domain. The spatial equivalent is exact enough:

```
D(x) = −χ · ∇h(x) / k_b
```

computed in the derive pass. Crests sharpen, troughs flatten, the Jacobian
folds where it should — and folding is what drives foam.

### 2.5 Foam and spray

- **Whitecaps** are advected in a persistent texture: born where `|∇h|` is high and the flow converges (`∇²h < 0`), decaying exponentially. This is simulation state, not a noise texture.
- **Spray is the real particle layer.** A compute pass converts the part of the surface the heightfield *cannot* represent into ballistic droplets: it samples the composite surface near the camera, measures steepness, multiplies it by a shoaling factor, and emits particles above the threshold. They fly under gravity + wind drag and die on re-entry — exactly the height-field↔particle exchange from Chentanez & Müller. 8k–64k particles depending on preset.

### 2.6 Bathymetry, shoaling and the shoreline

An analytic seabed (`seabed()` in `common.wgsl`) is shared *bit-for-bit* by the
solver, the ocean shader and the terrain shader, so nothing can desync. From it:

- **Green's law shoaling**: amplitude `∝ H^(−1/4)`, applied per band, so waves stand up as they reach the island.
- Horizontal orbital displacement is suppressed by the bed in shallow water.
- Waves fade to zero across the swash zone, so the sea never clips through the beach.
- Spray thresholds drop in shallow water → a shore break appears by itself.
- Depth-dependent absorption `exp(−σ·d)` with `σ = (0.16, 0.055, 0.035)` per RGB gives the real turquoise-to-navy gradient over sand.

### 2.7 Geometry: radial clipmap, zero LOD seams

The surface is a camera-centred **polar lattice with geometric radial spacing**
(`r = 0.6·e^(10.3t)`): 0.6 m at your feet out to ~18 km, in a fixed triangle
budget with roughly constant screen-space density and **no LOD transition seams
at all** (there is only one mesh). Vertices are snapped to a distance-dependent
quantum so the mesh doesn't swim under the camera.

### 2.8 Free anti-aliasing via band LOD

Each band analytically fades out past the distance where its wavelength projects
to under ~2 px (`bandWeight`). Distant water therefore loses its high-frequency
bands *before* they alias, and normals lerp to vertical — killing specular
sparkle, and costing less as it does so.

## 3. Scalability: GTX → RTX

Everything scales along three axes at once via the Quality dropdown:

| Preset | Sim grid | Substeps | Mesh | Spray | Target |
|---|---|---|---|---|---|
| GTX 900/1050 | 128² ×3 | 1 | 96×128 | off | ~60 fps on Maxwell/Pascal entry |
| GTX 1060/1660 | 192² ×3 | 2 | 144×192 | 8k | mainstream Pascal/Turing |
| Balanced | 256² ×3 | 2 | 192×256 | 16k | GTX 1080 / RTX 2060 |
| RTX 3060+ | 384² ×3 | 3 | 256×320 | 32k | Ampere |
| RTX 4070+ | 512² ×3 | 4 | 320×384 | 64k | Ada, 2× DPR |

Only the render resolution and the constants change — the algorithm is
identical, so the ocean *looks the same*, just finer. Notes on the scaling:

- Sim cost is `O(grid² × 3 × substeps)`; at the low preset it's 49 k cells/frame.
- All state is `rgba16float` (half the bandwidth of fp32, ample for metres of wave height); every pass is bandwidth-bound and stays in cache.
- No readbacks, no CPU/GPU sync anywhere. The CPU writes 4 small uniform buffers a frame.
- Ports cleanly to HLSL/GLSL compute: the shaders use nothing beyond textures, storage textures and a storage buffer.
- Headroom for RTX: the derive pass output is exactly the displacement+foam texture a hardware-tessellated or mesh-shader surface would want, and the spray buffer is already in the layout ray tracing would need.

## 4. Layout

```
src/
  main.ts                 device, passes, quality presets, frame loop
  ui.ts                   controls + presets
  math.ts                 mat4
  shaders.ts              #include resolver + mesh-constant specialisation
  shaders/
    common.wgsl           shared structs, noise, analytic bathymetry
    sim.wgsl              the shallow-water / wave-equation solver + foam
    derive.wgsl           height+velocity -> displacement+foam render texture
    ocean.wgsl            radial clipmap, band LOD, water shading
    terrain.wgsl          seabed & island
    sky.wgsl              analytic sky
    spray.wgsl            particle emission & ballistic update (compute)
    spray_draw.wgsl       particle billboards
```

## 5. Known limits / next steps

- The heightfield cannot overturn; breaking is *implied* by choppiness + foam + spray. Adding Thürey-style connected particle **sheets** at detected wave fronts is the natural next step.
- Boundary reflections are avoided by toroidal domains rather than absorbing boundaries; a true absorbing layer is needed if you switch to a world-fixed grid near shore.
- No two-way object coupling yet — the SWE state is the right place for it (add a displacement source term + buoyancy sampling).
- Underwater camera has no dedicated shading pass.
