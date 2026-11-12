# GTX Global SDF vs. Compute BVH — GI, Soft Penumbra, Color Bleed & Multi-Bounce Reflections (`ControlVehicle`)

Interactive WebGL2 GPU benchmark comparing **Global Distance Field (`sampler3D` Clipmap)** against **Two-Level SAH Compute BVH (`stack[48]`)** across **Global Illumination, Contact-Hardening Soft Shadows, Area-Light Penumbra, Multi-Surface Color Bleeding, and 1–3 Bounce Specular Reflections** on the authentic Right-Handed **`ControlVehicle`** (`+X` Forward, `+Y` Left, `+Z` Up) with **zero ghosting, zero smearing, and zero jittering noise**.

## Quick Start

```bash
python3 Experimental/GtxReflectionBenchmark/Serve.py 8096
```

## Architecture & Asset Bundle (`Assets/VehicleBenchmarkAssets.bin`, `"FVB1"`)

- **Scene Geometry (`25,512` Instanced Triangles, `5,684` Binned-SAH BLAS Nodes)**:
  - `ControlVehicleBody` (`2,960` triangles), `4x ControlVehicleRim` (`1,568` triangles each), `4x ControlVehicleTyre` (`3,968` triangles each), and `ProvingGroundArena` (`17 m` Silver Mirror Wall, East Gold Mirror Wall, Sunlit Vivid Crimson-Red Color-Bleed Wall `mat 18`, Sunlit Vivid Cobalt-Cyan Color-Bleed Fin `mat 19`, Matte White Clay GI Plinth `mat 20`, Overhead Showroom Portals, and Satin Showroom Concrete Pad).
- **Zero-Ghosting / Zero-Smearing / Zero-Jitter Lighting Pipeline**:
  - **Zero Ghosting**: 100% single-frame evaluation (`0%` temporal history buffer) across all GI, shadow, penumbra, and reflection passes.
  - **Zero Smearing**: Demodulated irradiance filtering (`GI_BILATERAL_FRAG` filters `(giIrr.rgb, sunVis)` only with `normal^32 × exp(-|planeDist| * 45)` edge-stopping + PCSS blocker-distance contact-hardening shadow kernel, re-multiplying full-res albedo/procedural grid + joint-bilateral upsampling in `COMPOSITE_FRAG`).
  - **Zero Jittering Noise**: Time-invariant spatial `IGN` Golden-Spiral sampling (`6` self-plane-free sphere-marched cones in `GI_SDF_FRAG`; `6` cosine-hemisphere rays + `4` Golden-Disk solar rays in `GI_BVH_FRAG`) integrated by a 3-pass (`step = 1, 2, 4`) plane-aware cross-bilateral filter.
- **Interactive Sliders & Toggles**:
  - `Sun Penumbra` slider (`0.00` hard pinhole → `3.50` wide overcast area sun), `GI + Color Bleed` slider (`0.00×` → `3.00×`), and live `Sun Azimuth / Elev` slider (`-80°` → `+110°` with `< 0.5 ms` GPU static cascade re-shading).
  - `Global SDF` | `Compute BVH` | `Split SDF | BVH` | `Clay GI + Penumbra` | `Pixel Delta` modes, plus `GI + Bleed`, `Sun Shadows`, `Soft Penumbra`, `Hi-Z Assist`, `BVH NEE`, `Off / 1B / 2B / 3B` reflections, `Auto-Glide / Static Pose / WASD`, `Chase Cam`, and 6 clearcoat paint swatches.
- **Measured `1280x720` Full-Pipeline Verification (`02-ControlVehicleGiPenumbraColorBleedSplit.png`)**:
  - **Global SDF Total 3D TMU Taps**: `66,088,440` (`71.7` taps/px) vs. **Compute BVH Stack Steps**: `1,133,046,238` (`1,229.4` steps/px) = **`17.14x` fewer traversal operations** in Global SDF.
  - **Mean Composite Pixel Delta**: **`4.91%`** (`GI = 2.82%`, `Penumbra = 0.71%`, `Reflections = 1.98%` — strictly within `Constants::MaximumOptimizationPixelDelta = 0.05f`, zero checkerboarding).
