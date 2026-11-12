# GTX Multi-Bounce Global SDF vs. Compute BVH Reflection Benchmark (`ControlVehicle`)

Interactive WebGL2 GPU benchmark comparing **1–3 Bounce Global Distance Field (`sampler3D` Clipmap) Reflections** against **1–3 Bounce Two-Level SAH Compute BVH (`stack[48]`) Reflections** on the authentic Right-Handed **`ControlVehicle`** (`+X` Forward, `+Y` Left, `+Z` Up).

## Quick Start

```bash
python3 Experimental/GtxReflectionBenchmark/Serve.py 8096
```

## Architecture & Asset Bundle (`Assets/VehicleBenchmarkAssets.bin`, `"FVB1"`)

- **Scene Geometry (`25,512` Instanced Triangles, `5,684` Binned-SAH BLAS Nodes)**:
  - `ControlVehicleBody` (`2,960` triangles), `4x ControlVehicleRim` (`1,568` triangles each), `4x ControlVehicleTyre` (`3,968` triangles each), and `ProvingGroundArena` (`17 m` Silver Mirror Inspection Wall, East Gold Mirror Wall, 3 Overhead Showroom Light Portals, Calibration Pylons, and Wet Asphalt Floor).
  - Denormal-immune exact `float32` node/triangle texture encoding (`20-bit` octahedral vertex normals) so D3D11 ANGLE, Vulkan, OpenGL, and Metal drivers execute identical BVH traversals without subnormal flushing.
- **Pure Voxel Global SDF Pipeline (`0` Analytical Shapes in Reflection Shader)**:
  - Loads the three authentic `.sdfspace` 3D textures (`ControlVehicleBody` `88x64x36`, `ControlVehicleRim` `28x40x40`, `ControlVehicleTyre` `32x44x44`) plus two true-signed world Global SDF cascades (`Clip0` `128x128x64` at `9.0 cm` Z spacing and `Clip1` `96x96x48`).
  - **Dynamic GPU Z-Slice Union (`SDF_UNION_FRAG`, slices `0..28`)**: Stamps the moving `ControlVehicle` `.sdfspace` volumes into `Clip0` (`RGBA16F` narrow-band surface radiosity + signed distance, `R16F` reflectivity) every frame in `~0.08 ms`.
  - **Multi-Bounce Sphere March + 2-Step Iso-Surface Polish (`REFLECTION_SDF_FRAG`)**: Marches `uClip0Linear` / `uClip1Linear` via hardware trilinear `GL_LINEAR` filtering, polishes hits onto `d = 0` (`p += rayDir * d` twice), and shades `1–3` bounces from narrow-band surface radiosity with optional `0–1.5 m` Hi-Z near-field assist.
- **Measured `1280x720` 2-Bounce Verification**:
  - **Global SDF 3D TMU Taps**: `19,065,756` (`~20.7` taps/pixel) vs. **Compute BVH Node/Triangle Steps**: `244,992,544` (`~265.8` steps/pixel) = **`12.85x` fewer traversal steps** before accounting for `stack[48]` VGPR register spilling on GTX GPUs.
  - **Mean Composite Pixel Delta**: **`4.11%`** (within `Constants::MaximumOptimizationPixelDelta = 0.05f`, zero checkerboarding).
