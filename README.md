# Frontier · ReSTIR GI Lab

A small, interactive real-time rendering prototype for the Project-Drive ControlVehicle. It uses **triangle ray tracing** through object-space bounding-volume hierarchies (BVHs), a spatiotemporal ReSTIR GI reservoir, multi-bounce path continuation, and a game-oriented quality panel. There is no signed-distance-field scene representation, SDF volume, or sphere tracing.

> **Backend note:** WebGPU currently exposes compute and raster APIs to a browser, but not a portable DXR/Vulkan ray-query interface. This prototype therefore runs a GPU-compute triangle-BVH backend on both GTX- and RTX-class adapters. GTX is the baseline fallback; an RTX adapter can afford a larger compute budget, but the browser build does **not** claim to use RT cores. A native Vulkan/DXR host is required to add hardware acceleration structures.

## Run

Serve this folder over HTTPS or localhost (WebGPU requires a secure context):

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Open `http://localhost:4173` in a current WebGPU-capable Chromium browser. On a host without WebGPU, the app keeps the same ControlVehicle triangle scene visible through a WebGL 2 raster fallback and clearly labels ReSTIR as paused; it does not silently substitute an SDF renderer.

## What is implemented

1. **Project-Drive scene data:** Loads the body, tyre, and rim `FCT1` streams from `assets/`. The authored material families, corner normals, center-of-mass rebase, axle locations, tyre radius, rim scaling, and mirrored right-wheel winding are preserved. Four wheel instances reuse two handed wheel BLASes.
2. **Triangle acceleration:** Builds median-split per-mesh BVHs once, then traces primary, GI, continuation, and visibility rays in WGSL. The five moving vehicle parts update rigid transforms independently; the base triangle BVHs are not rebuilt as the car moves.
3. **ReSTIR GI candidates:** Samples diffuse directions at primary surfaces, evaluates a multi-bounce continuation path at each secondary vertex, and uses explicit sun/area-light visibility. Reservoirs store a local-space secondary endpoint, its normal, path radiance, target, weight sum, sample count, age, and validity.
4. **Temporal reuse:** Reprojects the current surface through previous camera and object transforms. History is rejected on object/material mismatch, normal change, roughness change, depth disagreement, or failed sample visibility. Reused sample counts are capped.
5. **Spatial reuse:** Re-evaluates neighbor reservoirs at the current surface, checks normal/plane compatibility, traces the connection for visibility, and clamps extreme reuse weights.
6. **Resolve and presentation:** Uses the reservoir estimator `contribution × weightSum / (M × target)`, firefly clamping, an edge-aware depth/normal filter, linear upscale, and ACES tone mapping. Diagnostic views expose direct light, normals, albedo, and reservoir confidence.
7. **Expanded driving area:** Opens onto a 40 × 28 m tiled proving ground with a clear 28 × 17 m central drive zone, peripheral test props, and bounce cards moved out to the edges. Balanced rendering settings are unchanged.
8. **More usable driving:** Responsive throttle, brake/reverse, steering and soft play-area limits pair with a wider default camera framing. Drive with WASD/arrow keys or the hold-to-drive viewport pad (including touch); Space is handbrake. The fixed BLAS plus per-instance transforms provide the motion data used by temporal validation.

## Recommended settings

| Preset | GI scale | Initial candidates | Continuation bounces | Temporal M cap | Spatial taps | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| GTX · Performance | 35% | 1 | 2 | 12 | 2 | Checkerboard candidates; reduced cost and strict history |
| Balanced | 50% | 1 | 3 | 24 | 4 | General preview target |
| RTX · Compute high | 65% | 2 | 4 | 32 | 6 | Higher compute budget; still the same software BVH path in-browser |
| Ultra · Look-dev | 80% | 3 | 6 | 48 | 8 | High sample budget; not a console performance target |

The panel also exposes temporal/spatial reuse toggles, checkerboard candidates, edge-aware filtering, GI intensity, firefly clamp, exposure, and render scale. A device-independent cap keeps the internal target under 300,000 pixels; the actual scale is shown in the viewport telemetry.

## Controls

- **Orbit:** drag in the viewport.
- **Dolly:** mouse wheel.
- **Drive:** `W` / `↑` throttle, `S` / `↓` brake/reverse, `A` / `←` and `D` / `→` steer, `Space` handbrake; hold the viewport drive pad for mouse/touch controls.
- **Reset:** `R` restores the car and camera; the panel also has a history reset.
- **Fold settings:** `F` or the top-right menu button.

## Validation

```sh
node tests/validate-assets.mjs
```

This checks the archived facet counts, packed BVH/scene data, rigid-instance record size, and the basic drive input step. The WGSL kernels are separated by pass in `src/shaders/` and share `common.wgsl` for triangle traversal, candidate evaluation, and material/light helpers.

## Vehicle source

The `.facet` files are the same Project-Drive ControlVehicle geometry streams used by Slate's `Exhibits/IlluminationHost`, copied from [SultanAladin/Slate · `arena/c6cba543-slate`](https://github.com/SultanAladin/Slate/tree/arena%2Fc6cba543-slate). See [`assets/README.md`](assets/README.md) for the archive format and provenance.
